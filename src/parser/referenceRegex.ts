import { expandBookNames, canonicalBookId, type ExpandedBookName } from "../data/books";

// Design note: matching is CASE-SENSITIVE against the table's stored casing (book names/
// abbreviations are conventionally capitalized, e.g. "Amos", "Am"). This is a deliberate
// tradeoff — a case-insensitive match would let short abbreviations like "am"/"is"/"so"
// collide with ordinary English words in prose, producing false-positive references. Standard
// note-taking capitalizes book names, so this keeps recognition "loose" per guidelines.md
// without that failure mode.

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface BookLookupEntry {
	bookId: string;
	numeral?: string;
}

/** Builds the literal-alternation group and the text -> {bookId, numeral} lookup table. */
export function buildBookAlternation(entries: ExpandedBookName[] = expandBookNames()): {
	pattern: string;
	lookup: Map<string, BookLookupEntry>;
} {
	// Longest-first: JS regex alternation is first-match-wins per position, so a shorter
	// literal that is a prefix of a longer one (e.g. "Phil" vs "Philem") must come after it.
	const sorted = [...entries].sort((a, b) => b.text.length - a.text.length);

	const lookup = new Map<string, BookLookupEntry>();
	const literals: string[] = [];
	const seen = new Set<string>();
	for (const entry of sorted) {
		if (seen.has(entry.text)) continue;
		seen.add(entry.text);
		literals.push(escapeRegExp(entry.text));
		lookup.set(entry.text, { bookId: entry.bookId, numeral: entry.numeral });
	}

	return { pattern: literals.join("|"), lookup };
}

export interface ReferenceRegexBundle {
	regex: RegExp;
	bookLookup: Map<string, BookLookupEntry>;
}

/**
 * Builds the full reference-detection regex. No lookbehind is used anywhere (mobile
 * JS-engine constraint) — boundary safety against a match starting mid-word is instead
 * checked by the caller (see referenceParser.ts) by inspecting the character immediately
 * preceding each match.
 */
export function buildReferenceRegex(): ReferenceRegexBundle {
	const { pattern: bookAlt, lookup } = buildBookAlternation();

	// A verse "segment" is a single verse or a verse-verse range (hyphen OR en dash — real-world
	// input, including OS/editor smart-punctuation substitution, uses both). The range's end side
	// may itself be a bare verse (same-chapter range) or a "chapter.verse"/"chapter:verse" pair
	// (a range that crosses into a new chapter, e.g. "7.16-8.2") — the `[:.]` immediately after
	// the post-dash number is what disambiguates the two; referenceParser.ts's parseVerseSegments
	// does the actual split. The verse group captures a whole comma-separated LIST of segments as
	// one string (segment count varies, so it can't be fixed capture groups); referenceParser.ts
	// splits it. Bounded repetition only (no nested unbounded quantifiers), so this stays
	// linear-time — no ReDoS risk.
	const verseSegment = `\\d{1,3}(?:[-–]\\d{1,3}(?:[:.]\\d{1,3})?)?`;
	const verseList = `${verseSegment}(?:,[ \\t]?${verseSegment})*`;

	// Translation: any 2-6 consecutive uppercase letters, bare or parenthesized — not just our
	// 3 fully-supported codes (CSB/NASB/AMP). This recognizes common translations we don't fetch
	// text for (ESV, NIV, KJV, ...) so they still get a correct ref.ly link; referenceParser.ts
	// (via data/translations.ts's isTranslationCode) decides separately whether a captured code
	// is one we can actually fetch passage text for.
	const translationToken = `[A-Z]{2,6}`;

	// A reference has either a verse list ("5:16-20") or a bare chapter-range suffix ("5-6",
	// no verses at all) — never both — so these are alternate branches, not both optional
	// independently. The verse-list branch requires a `[:.]` separator right after the chapter,
	// so it can never accidentally swallow a bare chapter range's leading dash.
	const chapterRangeSuffix = `[-–](\\d{1,3})`;

	// Group indices (1-based, matching RegExpExecArray):
	// 1 = book literal, 2 = chapter, 3 = separator, 4 = verse segment list,
	// 5 = bare chapter-range end chapter, 6 = translation
	const source =
		`(${bookAlt})` +
		`[ \\t]?` +
		`(\\d{1,3})` +
		`(?:(?:([:.])(${verseList}))|(?:${chapterRangeSuffix}))?` +
		`(?:[ \\t]*\\(?(${translationToken})\\)?)?`;

	return { regex: new RegExp(source, "g"), bookLookup: lookup };
}

export { canonicalBookId };
