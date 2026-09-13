import { ApiBibleError } from "./errors";

// Shape of API.Bible's content-type=json passage payload (confirmed live during the Phase 3
// spike — see plan; the `verseId` field was confirmed live separately, while implementing
// chapter-crossing range support). The poetry structure — one `para` per line (styles
// `q1`/`q`/`qc`…), verse markers only on verse-starting lines, `b` stanza breaks, `sup`
// text-critical chars — was confirmed live against CSB while fixing issue #4; the
// title structure — `d` psalm superscriptions and `s1` editorial headings riding the
// include-titles flag, `qs` "Selah" chars inside poetry lines — was confirmed live while
// restoring superscriptions. See the __fixtures__/ captures for all of the above.
// Deliberately loose/defensive since it's an external, not-formally-typed API response:
// every field is checked before use rather than cast.
interface JsonNode {
	name?: string;
	type?: string;
	text?: string;
	attrs?: { number?: string; style?: string; verseId?: string };
	items?: JsonNode[];
	content?: JsonNode[];
}

/**
 * A pre-verse label line — a psalm superscription (`d`-styled para), e.g. "Of David.".
 * Rendered on its own italic line, like the Crossway engine's label blocks.
 */
export interface FormattedLabel {
	kind: "label";
	text: string;
}

export interface FormattedVerse {
	kind: "verse";
	verse: number;
	/** Chapter this verse belongs to, e.g. 8 for "2CO.8.1" — undefined only if the response is missing verseId. */
	chapter?: number;
	/** The verse's text, one entry per source line — poetry verses span several lines (Ps 103:1), prose verses have one. */
	lines: string[];
	/**
	 * Index of the rendered paragraph this verse belongs to. Consecutive poetry paras form
	 * one stanza; each prose para (`p`, `m`, …) is its own paragraph; `b` stanza breaks
	 * open a new one. A verse's lines always share one paragraph — a poem line continuing
	 * the verse in progress inherits the paragraph that verse started in (Matt 6:9's `m`
	 * prose intro flows into its `qc` poem lines with no break between).
	 */
	paragraphIndex: number;
}

export type FormattedBlock = FormattedLabel | FormattedVerse;

function isJsonNode(value: unknown): value is JsonNode {
	return typeof value === "object" && value !== null;
}

/** Extracts the chapter number from a "BOOK.chapter.verse" verseId, e.g. "2CO.8.1" -> 8. */
function chapterFromVerseId(verseId: string | undefined): number | undefined {
	if (!verseId) return undefined;
	const parts = verseId.split(".");
	const chapterText = parts[parts.length - 2];
	if (!chapterText) return undefined;
	const chapter = Number.parseInt(chapterText, 10);
	return Number.isNaN(chapter) ? undefined : chapter;
}

interface ParserState {
	blocks: FormattedBlock[];
	verse: number | undefined;
	chapter: number | undefined;
	paragraphIndex: number;
	buffer: string;
}

/**
 * Flushes the buffered text as one source line. A line whose verse matches the block
 * currently being accumulated appends there — poetry continuation lines (a `q` para
 * carrying no verse marker of its own) join their verse. This is the same attribution
 * rule as the Crossway parser (`parseEsvHtml`): text attaches to the verse that was
 * current when it appeared. Text before any verse marker (e.g. a psalm superscription on
 * a whole-chapter fetch) is dropped conservatively — pre-verse label rendering is a
 * Crossway-engine feature.
 */
function flushLine(state: ParserState): void {
	const text = state.buffer.replace(/\s+/g, " ").trim();
	state.buffer = "";
	if (text.length === 0 || state.verse === undefined) return;

	const last = state.blocks[state.blocks.length - 1];
	if (last?.kind === "verse" && last.verse === state.verse && last.chapter === state.chapter) {
		last.lines.push(text);
		return;
	}
	state.blocks.push({
		kind: "verse",
		verse: state.verse,
		chapter: state.chapter,
		lines: [text],
		paragraphIndex: state.paragraphIndex,
	});
}

/** Flushes the buffered text as a label block — a psalm superscription's own line. */
function flushLabel(state: ParserState): void {
	const text = state.buffer.replace(/\s+/g, " ").trim();
	state.buffer = "";
	if (text.length > 0) state.blocks.push({ kind: "label", text });
}

function walkItems(nodes: JsonNode[], state: ParserState): void {
	for (const node of nodes) {
		// `sup`-styled chars are the CSB's raised text-critical apparatus (e.g. Matt 6:13's
		// comma marking the bracketed-doxology variant), not reading text — skipped (user
		// decision, 2026-09-12); the printed CSB reads "…deliver us from the evil one."
		if (node.attrs?.style === "sup") continue;
		if (node.name === "verse" && node.attrs?.number) {
			flushLine(state);
			state.verse = Number.parseInt(node.attrs.number, 10);
			continue; // the verse marker's own `items` are just its number's text — skip it
		}
		if (node.type === "text" && typeof node.text === "string") {
			// Every text node carries its own verseId (e.g. "PSA.103.1"), confirmed live — this
			// is the ground truth for which chapter the current verse belongs to, needed to
			// label the callout body correctly across a chapter boundary and to attribute
			// poetry continuation lines to the right chapter.
			const chapter = chapterFromVerseId(node.attrs?.verseId);
			if (chapter !== undefined) state.chapter = chapter;
			state.buffer += node.text;
			continue;
		}
		if (Array.isArray(node.items)) {
			walkItems(node.items, state);
		}
	}
}

/**
 * Parses API.Bible's content-type=json passage payload into per-verse, paragraph-grouped
 * blocks. In prose, one `para` node (style "p"/"m") holds several verses; in poetry each
 * LINE is its own `para` node (styles "q1", "q", "qc", …) and only the line starting a
 * verse carries a `verse` marker — so verse/chapter state is shared across the whole
 * passage (per-para state was the issue #4 bug: continuation lines were dropped) and
 * each `para` flushes as exactly one line. `b` paras are explicit stanza breaks. `d`
 * paras (psalm superscriptions) become label blocks; `s1` editorial section headings —
 * which ride the same include-titles flag as superscriptions — are dropped, matching the
 * Crossway engine's include-headings=false.
 */
export function parsePassageJson(passageData: unknown): FormattedBlock[] {
	if (!isJsonNode(passageData) || !Array.isArray(passageData.content)) {
		throw new ApiBibleError("Scripturizer: passage response missing expected `content` array", "malformed-response");
	}

	const state: ParserState = {
		blocks: [],
		verse: undefined,
		chapter: undefined,
		paragraphIndex: -1,
		buffer: "",
	};

	// Paragraph boundaries: every prose para and every blank opens one, and a poetry run
	// opens one at its start — EXCEPT a poetry para that continues the verse currently
	// being accumulated (no verse marker of its own): it inherits the open paragraph so a
	// verse's lines are never split across a paragraph break.
	let lastKind: "poetry" | "prose" | "label" | "blank" | undefined;
	for (const node of passageData.content) {
		if (!isJsonNode(node) || !Array.isArray(node.items)) continue;

		const style = node.attrs?.style;
		// Editorial section headings (s1, s2, …) are reading aids, not text — dropped.
		if (typeof style === "string" && /^s\d+$/.test(style)) continue;

		const kind =
			style === "b" ? "blank" : style === "d" ? "label" : typeof style === "string" && style.startsWith("q") ? "poetry" : "prose";

		if (kind === "label") {
			// A superscription renders at its true position as its own italic line; it
			// carries no paragraph and doesn't disturb the verse accumulation state.
			walkItems(node.items, state);
			flushLabel(state);
			lastKind = "label";
			continue;
		}

		if (kind !== "poetry" || lastKind !== "poetry") {
			const startsNewVerse = node.items.some((item) => item?.name === "verse" && item?.attrs?.number);
			const continuesVerse = kind === "poetry" && lastKind === "prose" && !startsNewVerse;
			if (!continuesVerse) state.paragraphIndex += 1;
		}
		lastKind = kind;

		walkItems(node.items, state);
		flushLine(state); // each para node is one source line
	}

	return state.blocks;
}

/**
 * The callout's header line — `+` makes it foldable in Obsidian (default unfolded), per
 * guidelines.md's worked example.
 */
export function formatCalloutHeader(linkText: string, url: string): string {
	return `> [!bible-ref]+ [${linkText}](${url})`;
}

/**
 * Assembles the callout body, mirroring the Crossway engine's rendering conventions
 * (esvFormatter.ts `formatEsvBody`): bold `{chapter.}verse` labels — chapter-qualified
 * on the first verse of each chapter, bare otherwise. A verse spanning multiple source
 * lines (poetry) renders one `> ` callout line per source line with its label on the
 * first; a single-line verse continues the previous line inline (prose flow, the same
 * inline join the Crossway formatter applies); paragraph boundaries (prose paras, `b`
 * stanza breaks) render as a bare `>` separator line. A label block (psalm superscription)
 * renders as its own italic `> _…_` line and absorbs the paragraph break around it —
 * no blank `>` above or below (user decision, 2026-08-30, same as the Crossway engine).
 *
 * A passage that crosses a chapter boundary (e.g. a fetched range like "7.16-8.2") gets
 * the same `**{chapter}.{verse}**` treatment at the first verse of each new chapter, not
 * just the very first verse overall, using each verse's own `chapter` (from its API.Bible
 * verseId) — falling back to the reference's starting `chapter` only if that's ever
 * missing from the response.
 */
export function formatCalloutBody(blocks: FormattedBlock[], chapter: number): string {
	const lines: string[] = [];
	let lastParagraphIndex: number | undefined;
	let lastLabeledChapter: number | undefined;

	for (const block of blocks) {
		if (block.kind === "label") {
			// Pushing the label and resetting the paragraph marker means the next verse
			// never emits a ">" separator after it, and the label never emits one before
			// itself — tight on both sides.
			lines.push(`> _${block.text}_`);
			lastParagraphIndex = undefined;
			continue;
		}

		const verseChapter = block.chapter ?? chapter;

		if (block.paragraphIndex !== lastParagraphIndex) {
			// A paragraph opener never continues the previous line: the separator (">")
			// just pushed — or nothing, for the very first verse — fails the "> " prefix
			// test below, so a verse starting a paragraph always renders a fresh line.
			if (lastParagraphIndex !== undefined) lines.push(">");
			lastParagraphIndex = block.paragraphIndex;
		}

		const crossedIntoNewChapter = verseChapter !== lastLabeledChapter;
		const label = crossedIntoNewChapter ? `${verseChapter}.${block.verse}` : `${block.verse}`;
		lastLabeledChapter = verseChapter;

		// Prose flow: a single-line verse whose paragraph already has a line appends
		// inline with a space, mirroring formatEsvBody's `continuesParagraph`. The
		// "> _" exclusion keeps a verse from inlining into a label line.
		const previous = lines[lines.length - 1];
		const continuesParagraph =
			block.lines.length === 1 &&
			previous !== undefined &&
			previous.startsWith("> ") &&
			!previous.startsWith("> _");
		if (continuesParagraph) {
			lines[lines.length - 1] = `${previous} **${label}** ${block.lines[0] ?? ""}`;
			continue;
		}

		// Poetry: each source line becomes its own `> ` callout line, label on the first.
		block.lines.forEach((line, i) => {
			const prefix = i === 0 ? `> **${label}** ` : "> ";
			lines.push(prefix + line);
		});
	}

	return lines.join("\n");
}
