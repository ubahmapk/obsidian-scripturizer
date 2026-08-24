import { ApiBibleError } from "./errors";

// Shape of API.Bible's content-type=json passage payload (confirmed live during the Phase 3
// spike — see plan; the `verseId` field was confirmed live separately, while implementing
// chapter-crossing range support). Deliberately loose/defensive since it's an external,
// not-formally-typed API response: every field is checked before use rather than cast.
interface JsonNode {
	name?: string;
	type?: string;
	text?: string;
	attrs?: { number?: string; style?: string; verseId?: string };
	items?: JsonNode[];
	content?: JsonNode[];
}

export interface FormattedVerse {
	verse: number;
	/** Chapter this verse belongs to, e.g. 8 for "2CO.8.1" — undefined only if the response is missing verseId. */
	chapter?: number;
	text: string;
	paragraphIndex: number;
}

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

function walkParagraph(items: JsonNode[], paragraphIndex: number, out: FormattedVerse[]): void {
	let currentVerse: number | undefined;
	let currentChapter: number | undefined;
	let buffer = "";

	const flush = () => {
		if (currentVerse !== undefined) {
			const text = buffer.replace(/\s+/g, " ").trim();
			if (text.length > 0) out.push({ verse: currentVerse, chapter: currentChapter, text, paragraphIndex });
		}
		buffer = "";
	};

	const walk = (nodes: JsonNode[]) => {
		for (const node of nodes) {
			if (node.name === "verse" && node.attrs?.number) {
				flush();
				currentVerse = Number.parseInt(node.attrs.number, 10);
				continue; // the verse marker's own `items` are just its number's text — skip it
			}
			if (node.type === "text" && typeof node.text === "string") {
				// Every text node carries its own verseId (e.g. "2CO.8.1"), confirmed live — this
				// is the ground truth for which chapter the current verse belongs to, needed to
				// label the callout body correctly across a chapter boundary.
				const chapter = chapterFromVerseId(node.attrs?.verseId);
				if (chapter !== undefined) currentChapter = chapter;
				buffer += node.text;
				continue;
			}
			if (Array.isArray(node.items)) {
				walk(node.items);
			}
		}
	};

	walk(items);
	flush();
}

/** Parses API.Bible's content-type=json passage payload into per-verse, paragraph-grouped text. */
export function parsePassageJson(passageData: unknown): FormattedVerse[] {
	if (!isJsonNode(passageData) || !Array.isArray(passageData.content)) {
		throw new ApiBibleError("Scripturizer: passage response missing expected `content` array", "malformed-response");
	}

	const out: FormattedVerse[] = [];
	passageData.content.forEach((node, index) => {
		if (isJsonNode(node) && Array.isArray(node.items)) {
			walkParagraph(node.items, index, out);
		}
	});
	return out;
}

/**
 * Assembles the callout body: the first verse overall is rendered `**{chapter}.{verse}**`, every
 * other verse `**{verse}**`, paragraph breaks preserved as a bare `>` line, every line prefixed
 * `> ` — matching guidelines.md's worked example.
 *
 * A passage that crosses a chapter boundary (e.g. a fetched range like "7.16-8.2") gets the same
 * `**{chapter}.{verse}**` treatment at the first verse of each new chapter, not just the very
 * first verse overall, using each verse's own `chapter` (from its API.Bible verseId) — falling
 * back to the reference's starting `chapter` only if that's ever missing from the response.
 */
export function formatCalloutBody(verses: FormattedVerse[], chapter: number): string {
	const paragraphs: string[][] = [];
	let lastParagraphIndex: number | undefined;
	let lastLabeledChapter: number | undefined;

	verses.forEach((v) => {
		const verseChapter = v.chapter ?? chapter;

		if (v.paragraphIndex !== lastParagraphIndex) {
			paragraphs.push([]);
			lastParagraphIndex = v.paragraphIndex;
		}

		const crossedIntoNewChapter = verseChapter !== lastLabeledChapter;
		const label = crossedIntoNewChapter ? `${verseChapter}.${v.verse}` : `${v.verse}`;
		lastLabeledChapter = verseChapter;
		paragraphs[paragraphs.length - 1]?.push(`**${label}** ${v.text}`);
	});

	return paragraphs
		.map((verseParts) => `> ${verseParts.join(" ")}`)
		.join("\n>\n");
}
