import { buildReferenceRegex, canonicalBookId, type BookLookupEntry } from "./referenceRegex";
import { DEFAULT_TRANSLATION, type TranslationCode } from "../data/translations";

export interface VerseSegment {
	start: number;
	end?: number;
	/** Set only when this segment's range crosses into a later chapter, e.g. "7.16-8.2" -> end=2, endChapter=8. */
	endChapter?: number;
}

export interface ParsedReference {
	/** Exact matched substring (book + chapter[:verse-list] [+ translation]), for idempotency and replacement. */
	raw: string;
	/** Offset of `raw`'s first character in the scanned text. */
	start: number;
	/** Offset one past `raw`'s last character. */
	end: number;
	/** Canonical book id, e.g. "LUKE", "1SAM". */
	bookId: string;
	chapter: number;
	/** Set only for a bare chapter-range reference with no verses, e.g. "Matt 5-6" -> chapter=5, endChapter=6. */
	endChapter?: number;
	/** Empty = chapter-only reference; length 1 = the common single verse/range case. */
	verseSegments: VerseSegment[];
	/**
	 * Any 2-6 uppercase-letter code found in the translation position, uppercased — NOT
	 * narrowed to the 3 fully-supported codes. A caller that needs to know whether text can
	 * actually be fetched for this code should check it against `data/translations.ts`'s
	 * `isTranslationCode()`.
	 */
	translationCode: string;
	translationWasExplicit: boolean;
}

/**
 * Parses a verse-list string like "11-13,17-20", "16,18", or a cross-chapter range like
 * "16-8.2" (end side "chapter.verse" or "chapter:verse") into VerseSegment[].
 */
function parseVerseSegments(verseListText: string | undefined): VerseSegment[] {
	if (!verseListText) return [];
	return verseListText.split(",").map((segment) => {
		const [startText, endText] = segment.trim().split(/[-–]/);
		const start = Number.parseInt(startText as string, 10);
		if (!endText) return { start, end: undefined, endChapter: undefined };

		const crossChapterMatch = /^(\d{1,3})[:.](\d{1,3})$/.exec(endText);
		if (crossChapterMatch) {
			const endChapter = Number.parseInt(crossChapterMatch[1] as string, 10);
			const end = Number.parseInt(crossChapterMatch[2] as string, 10);
			return { start, end, endChapter };
		}

		return { start, end: Number.parseInt(endText, 10), endChapter: undefined };
	});
}

/** True if any part of a parsed range points backward (end chapter/verse before the start). */
function hasBackwardRange(parsed: Pick<ParsedReference, "chapter" | "endChapter" | "verseSegments">): boolean {
	if (parsed.endChapter !== undefined && parsed.endChapter < parsed.chapter) return true;

	return parsed.verseSegments.some((segment) => {
		if (segment.end === undefined) return false;
		if (segment.endChapter !== undefined) {
			if (segment.endChapter < parsed.chapter) return true;
			return segment.endChapter === parsed.chapter && segment.end < segment.start;
		}
		return segment.end < segment.start;
	});
}

// Built once at module load — the book alternation is the same for every call.
const REGEX_BUNDLE = buildReferenceRegex();

function isWordChar(char: string | undefined): boolean {
	if (!char) return false;
	return /[A-Za-z0-9]/.test(char);
}

export function findReferences(
	text: string,
	defaultTranslation: TranslationCode = DEFAULT_TRANSLATION,
): ParsedReference[] {
	const { regex, bookLookup } = REGEX_BUNDLE;
	regex.lastIndex = 0;

	const results: ParsedReference[] = [];
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		const matchStart = match.index;

		// Boundary safety (no lookbehind, per mobile constraint): reject a match whose book
		// literal starts mid-word, e.g. "xAmos 3" matching "Amos 3".
		const precedingChar = text[matchStart - 1];
		if (isWordChar(precedingChar)) {
			// Advance past this position to avoid an infinite loop on a zero-length-adjacent match.
			regex.lastIndex = matchStart + 1;
			continue;
		}

		const bookLiteral = match[1] as string;
		const chapterText = match[2] as string;
		const verseListText = match[4];
		const chapterRangeEndText = match[5];
		const translationText = match[6];

		const lookupEntry: BookLookupEntry | undefined = bookLookup.get(bookLiteral);
		if (!lookupEntry) {
			// Should not happen — every alternative in the regex came from bookLookup's keys —
			// but skip defensively rather than throw on malformed input.
			continue;
		}

		const translationCode = translationText ? translationText.toUpperCase() : defaultTranslation;

		const parsed: ParsedReference = {
			raw: match[0],
			start: matchStart,
			end: matchStart + match[0].length,
			bookId: canonicalBookId(lookupEntry.bookId, lookupEntry.numeral),
			chapter: Number.parseInt(chapterText, 10),
			endChapter: chapterRangeEndText ? Number.parseInt(chapterRangeEndText, 10) : undefined,
			verseSegments: parseVerseSegments(verseListText),
			translationCode,
			translationWasExplicit: Boolean(translationText),
		};

		// A backward-looking range (e.g. a misread cross-chapter jump, or a hand-typed mistake)
		// is ambiguous enough that guessing intent risks a confidently-wrong link — drop it
		// rather than parse it.
		if (hasBackwardRange(parsed)) continue;

		results.push(parsed);
	}

	return results;
}
