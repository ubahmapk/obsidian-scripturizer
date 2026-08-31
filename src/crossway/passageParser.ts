import { CrosswayError } from "./errors";

// Crossway's passage HTML is machine-generated and regular, but NOT well-formed by DOM
// standards: `<span class="line">` elements are routinely left unclosed before `<br />`
// pairs (verified live across seven captured fixtures), which defeats stack-based/DOM
// parsers. The shapes below were verified live against api.esv.org (see
// .omo/drafts/esv-text-download.md); this is a linear token scan over exactly those
// shapes, not a general HTML parser.
//
// Verified token inventory:
//   <h4 class="psalm-title|psalm-acrostic-title|speaker">LABEL</h4>   pre-verse label text
//   <p ...> ... </p>                                                  paragraph boundaries
//   <b class="chapter-num" id="vBBBCCCVVV-N">C:V&nbsp;</b>             explicit chapter+verse reset
//   <b class="verse-num ..." id="vBBBCCCVVV-N">V&nbsp;</b>            verse marker
//   <span class="line|indent line">                                   verse/continuation line opens (unclosed!)
//   <span class="begin-line-group|end-line-group|woc|selah|...">      noise/wrapper classes — transparent
//   <br />                                                             line break inside a verse
//   bare text                                                          verse/label content
//
// Attribution rule (verified against psalm119, song1, matt6 fixtures): a continuation
// line, a label, or even a new paragraph NEVER clears the current verse — text after a
// label or paragraph boundary attaches to the verse that was current when it appeared.

/** A pre-verse label line: psalm superscription, acrostic letter, or speaker label. */
export interface EsvLabelBlock {
	kind: "label";
	/** Document order index within the passage (labels interleave with verses). */
	index: number;
	text: string;
}

/** One verse with its full text — `lines` preserves poetry/prose line breaks. */
export interface EsvVerseBlock {
	kind: "verse";
	index: number;
	chapter: number;
	verse: number;
	lines: string[];
	paragraphIndex: number;
}

export type EsvBlock = EsvLabelBlock | EsvVerseBlock;

const TAG_RE = /<[^>]+>/g;

// Only these five entities are decoded — they're the ones Crossway's text content uses
// (verified across fixtures; &#39; is the apostrophe encoder's output in some responses).
const ENTITY_MAP: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
	"&nbsp;": " ",
};

function decodeEntities(text: string): string {
	// Single pass, sequential replacement of the six known entities; regex-driven
	// sequential scan avoids a split on "&" that could break surrogate pairs mid-token.
	return text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY_MAP[m] ?? m);
}

/** Extracts chapter and verse from a Crossway verse-id attribute value like "v43003016-1". */
function chapterVerseFromId(id: string): { chapter: number; verse: number } | undefined {
	const match = /^v(\d{8,9})-\d+$/.exec(id);
	const digits = match?.[1];
	if (!digits) return undefined;
	const tail = digits.slice(-6);
	const chapter = Number.parseInt(tail.slice(0, 3), 10);
	const verse = Number.parseInt(tail.slice(3), 10);
	if (Number.isNaN(chapter) || Number.isNaN(verse)) return undefined;
	return { chapter, verse };
}

interface ParserState {
	blocks: EsvBlock[];
	chapter: number | undefined;
	verse: number | undefined;
	paragraphIndex: number;
	textBuffer: string;
	blockCount: number;
}

function flushText(state: ParserState): void {
	const text = decodeEntities(state.textBuffer).replace(/\s+/g, " ").trim();
	state.textBuffer = "";
	if (text.length === 0) return;

	const currentVerse = state.verse;
	const currentChapter = state.chapter;
	if (currentVerse === undefined || currentChapter === undefined) {
		// Text before any verse marker — psalm superscriptions and acrostic labels arrive
		// as h4 (captured at </h4>), so bare pre-verse text here is dropped conservatively,
		// matching the API.Bible engine's behavior.
		return;
	}

	// Merge into the previous verse block when it's the same verse — poetry continuation
	// lines accumulate there. A label block between them breaks the merge (the label
	// renders at its true position between the two text groups — Song 1:4 "Others").
	const last = state.blocks[state.blocks.length - 1];
	if (last?.kind === "verse" && last.verse === currentVerse && last.chapter === currentChapter) {
		last.lines.push(text);
		return;
	}
	state.blocks.push({
		kind: "verse",
		index: state.blockCount++,
		chapter: currentChapter,
		verse: currentVerse,
		lines: [text],
		paragraphIndex: state.paragraphIndex,
	});
}

/**
 * Parses one Crossway passage HTML string into ordered label/verse blocks. Continuation
 * lines and post-label text attach to the verse that was current when they appeared; a
 * `<p>` boundary increments the paragraph index; a `chapter-num` resets chapter+verse
 * explicitly. Unknown tags are skipped transparently (their text content still flows into
 * the current verse — verified safe because every text-bearing child of a verse carries
 * the same verse id).
 */
export function parseEsvHtml(html: string): EsvBlock[] {
	if (typeof html !== "string" || html.length === 0) {
		throw new CrosswayError("Scripturizer: no passage HTML to parse", "malformed-response");
	}

const state: ParserState = {
	blocks: [],
	chapter: undefined,
	verse: undefined,
	paragraphIndex: -1,
	textBuffer: "",
	blockCount: 0,
};

	let lastIndex = 0;
	TAG_RE.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = TAG_RE.exec(html)) !== null) {
		state.textBuffer += html.slice(lastIndex, match.index);
		lastIndex = TAG_RE.lastIndex;
		const tag = match[0];

		if (tag.startsWith("<h4")) {
			// Label text comes between <h4 ...> and </h4>; discard anything buffered before
			// the marker (inter-paragraph whitespace).
			state.textBuffer = "";
			continue;
		}
		if (tag.startsWith("</h4")) {
			const text = decodeEntities(state.textBuffer).replace(/\s+/g, " ").trim();
			state.textBuffer = "";
			if (text.length > 0) {
				state.blocks.push({ kind: "label", index: state.blockCount++, text });
			}
			continue;
		}
		if (tag.startsWith("<p")) {
			flushText(state);
			state.paragraphIndex++;
			continue;
		}
		if (tag.startsWith("</p")) {
			flushText(state);
			continue;
		}
		if (tag.startsWith("<b")) {
			const id = /id="(v[^"]*)"/.exec(tag)?.[1];
			const cv = id ? chapterVerseFromId(id) : undefined;
			flushText(state);
			if (tag.includes("chapter-num")) {
				// chapter-num appears immediately after a <p> open, which already advanced
				// the paragraph index — it only resets chapter/verse here.
				if (cv) {
					state.chapter = cv.chapter;
					state.verse = cv.verse;
				}
			} else if (cv) {
				state.chapter = cv.chapter;
				state.verse = cv.verse;
			}
			continue;
		}
		if (tag.startsWith("</b")) {
			// The verse/chapter number text itself sits between <b> and </b>; drop it.
			state.textBuffer = "";
			continue;
		}
		if (tag.startsWith("<br")) {
			flushText(state);
			continue;
		}
		// All other tags (span opens/closes, small, a, sup, div...) are transparent.
	}

	flushText(state);

	if (state.blocks.length === 0 || state.blocks.every((b) => b.kind !== "verse")) {
		throw new CrosswayError("Scripturizer: parsed no verses from the Crossway passage", "malformed-response");
	}

	return state.blocks;
}