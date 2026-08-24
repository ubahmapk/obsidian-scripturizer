import { BOOKS, canonicalBookId } from "../data/books";
import type { ParsedReference, VerseSegment } from "../parser/referenceParser";

// Per the Phase 3 research spike (see plan), ref.ly's redirect resolver accepted every book
// abbreviation and full name tested — including numbered books, multi-word names (with spaces
// preserved), and chapter-only references — so this reuses books.ts's own abbreviations rather
// than maintaining a second, separately-researched table.

function familyAbbrevFor(bookId: string): { abbrev: string; displayName: string } | undefined {
	// bookId is a canonical id, e.g. "LUKE" or "1SAM" — strip a leading 1/2/3 to look up the
	// family entry, then re-apply the same numeral as a literal prefix for the URL/display text.
	const numeralMatch = /^([123])(.+)$/.exec(bookId);
	const numeral = numeralMatch?.[1];
	const familyId = numeralMatch ? numeralMatch[2] : bookId;

	const entry = BOOKS.find((b) => b.id === familyId && b.numbered === Boolean(numeral));
	if (!entry) return undefined;

	const baseAbbrev = entry.abbreviations[0];
	const baseName = entry.fullNames[0];
	if (!baseAbbrev || !baseName) return undefined;

	return {
		abbrev: numeral ? `${numeral}${baseAbbrev}` : baseAbbrev,
		displayName: numeral ? `${numeral} ${baseName}` : baseName,
	};
}

export interface ReflyLink {
	linkText: string;
	url: string;
}

/**
 * Builds one ref.ly hyperlink per verse segment: display text uses an en dash for a verse range
 * (matching guidelines.md's worked example); the URL itself uses a plain hyphen (confirmed
 * against live ref.ly — see Phase 3 spike findings in the plan). A chapter-only reference (no
 * segments) produces a single chapter-level link. ref.ly has no URL form for a compound,
 * discontinuous reference (confirmed live — see Phase 8 findings), so each segment becomes its
 * own independent link rather than one combined-but-inaccurate link.
 */
export function buildReflyLinks(ref: ParsedReference): ReflyLink[] {
	const book = familyAbbrevFor(ref.bookId);
	if (!book) {
		throw new Error(`Scripturizer: no book data found for id "${ref.bookId}"`);
	}

	const buildOne = (segment?: VerseSegment): ReflyLink => {
		// A segment whose range crosses into a later chapter needs both chapters spelled out in
		// the URL and the display text — a single `ref.chapter` prefix is no longer sufficient.
		if (segment?.endChapter !== undefined) {
			const versePart = `${ref.chapter}.${segment.start}-${segment.endChapter}.${segment.end}`;
			const linkText =
				`${book.displayName} ${ref.chapter}:${segment.start}–${segment.endChapter}:${segment.end}` +
				` (${ref.translationCode})`;
			const url = `https://ref.ly/${encodeURIComponent(book.abbrev)}${versePart};${ref.translationCode}`;
			return { linkText, url };
		}

		const versePart = segment
			? `${ref.chapter}.${segment.start}${segment.end ? `-${segment.end}` : ""}`
			: `${ref.chapter}`;
		const humanRange = segment
			? segment.end
				? `${segment.start}–${segment.end}`
				: `${segment.start}`
			: undefined;

		const linkText =
			`${book.displayName} ${ref.chapter}` +
			(humanRange ? `:${humanRange}` : "") +
			` (${ref.translationCode})`;

		const url = `https://ref.ly/${encodeURIComponent(book.abbrev)}${versePart};${ref.translationCode}`;

		return { linkText, url };
	};

	// A bare chapter range (no verses at all, e.g. "Matt 5-6") has its own, simpler URL/text shape.
	if (ref.endChapter !== undefined) {
		const versePart = `${ref.chapter}-${ref.endChapter}`;
		const linkText = `${book.displayName} ${ref.chapter}-${ref.endChapter} (${ref.translationCode})`;
		const url = `https://ref.ly/${encodeURIComponent(book.abbrev)}${versePart};${ref.translationCode}`;
		return [{ linkText, url }];
	}

	if (ref.verseSegments.length === 0) return [buildOne(undefined)];
	return ref.verseSegments.map((segment) => buildOne(segment));
}

export { canonicalBookId };
