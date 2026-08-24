// Input-recognition table: every book of the Bible, with its full name(s) and common
// abbreviation(s). This table is intentionally permissive — it exists to match loose,
// human-typed text, NOT to produce canonical output. See refly-abbrevs.ts and osis-codes.ts
// for the separate, exact-match tables used to build outbound URLs/API calls.

export interface BookEntry {
	/**
	 * Family id. For a non-numbered book this IS the canonical id used everywhere downstream
	 * (e.g. "LUKE"). For a numbered book (`numbered: true`) this is only the shared suffix —
	 * the canonical id is `${numeral}${id}` (e.g. "1SAM", "2SAM"), resolved at match time from
	 * whichever numeral prefix was actually present in the source text.
	 */
	id: string;
	/** Approximate canonical Bible order, used only for sorting/tie-breaking, not identity. */
	order: number;
	/** Full name(s), WITHOUT any numeric prefix for numbered books (see `numbered`). */
	fullNames: string[];
	/** Common abbreviation(s), WITHOUT any numeric prefix for numbered books. */
	abbreviations: string[];
	/** True if this book takes a 1/2/3 (or I/II/III, First/Second/Third, 1st/2nd/3rd) prefix. */
	numbered: boolean;
}

// Cross product applied to every `numbered` book's fullNames/abbreviations at module-init
// time (see expandBookNames below) — stored once rather than duplicated per book.
export const NUMBER_PREFIXES: Record<string, string[]> = {
	"1": ["1", "I", "First", "1st"],
	"2": ["2", "II", "Second", "2nd"],
	"3": ["3", "III", "Third", "3rd"],
};

export const BOOKS: BookEntry[] = [
	{ id: "GEN", order: 1, fullNames: ["Genesis"], abbreviations: ["Gen", "Gn"], numbered: false },
	{ id: "EXOD", order: 2, fullNames: ["Exodus"], abbreviations: ["Exod", "Exo", "Ex"], numbered: false },
	{ id: "LEV", order: 3, fullNames: ["Leviticus"], abbreviations: ["Lev", "Lv"], numbered: false },
	{ id: "NUM", order: 4, fullNames: ["Numbers"], abbreviations: ["Num", "Nm", "Nu"], numbered: false },
	{ id: "DEUT", order: 5, fullNames: ["Deuteronomy"], abbreviations: ["Deut", "Deu", "Dt"], numbered: false },
	{ id: "JOSH", order: 6, fullNames: ["Joshua"], abbreviations: ["Josh", "Jos"], numbered: false },
	{ id: "JUDG", order: 7, fullNames: ["Judges"], abbreviations: ["Judg", "Jdg", "Jgs", "Jg"], numbered: false },
	{ id: "RUTH", order: 8, fullNames: ["Ruth"], abbreviations: ["Rth", "Ru"], numbered: false },
	{ id: "SAM", order: 9, fullNames: ["Samuel"], abbreviations: ["Sam", "Sm"], numbered: true },
	{ id: "KGS", order: 11, fullNames: ["Kings"], abbreviations: ["Kgs", "Kg"], numbered: true },
	{ id: "CHR", order: 13, fullNames: ["Chronicles"], abbreviations: ["Chron", "Chr"], numbered: true },
	{ id: "EZRA", order: 15, fullNames: ["Ezra"], abbreviations: ["Ezr"], numbered: false },
	{ id: "NEH", order: 16, fullNames: ["Nehemiah"], abbreviations: ["Neh"], numbered: false },
	{ id: "ESTH", order: 17, fullNames: ["Esther"], abbreviations: ["Esth", "Est"], numbered: false },
	{ id: "JOB", order: 18, fullNames: ["Job"], abbreviations: ["Jb"], numbered: false },
	{ id: "PS", order: 19, fullNames: ["Psalms", "Psalm"], abbreviations: ["Ps", "Psa", "Pss"], numbered: false },
	{ id: "PROV", order: 20, fullNames: ["Proverbs"], abbreviations: ["Prov", "Pro", "Prv"], numbered: false },
	{ id: "ECCL", order: 21, fullNames: ["Ecclesiastes"], abbreviations: ["Eccl", "Ecc", "Qoh"], numbered: false },
	{ id: "SONG", order: 22, fullNames: ["Song of Songs", "Song of Solomon"], abbreviations: ["Song", "SS", "Sng"], numbered: false },
	{ id: "ISA", order: 23, fullNames: ["Isaiah"], abbreviations: ["Isa", "Is"], numbered: false },
	{ id: "JER", order: 24, fullNames: ["Jeremiah"], abbreviations: ["Jer", "Jr"], numbered: false },
	{ id: "LAM", order: 25, fullNames: ["Lamentations"], abbreviations: ["Lam", "Lm"], numbered: false },
	{ id: "EZEK", order: 26, fullNames: ["Ezekiel"], abbreviations: ["Ezek", "Eze", "Ezk"], numbered: false },
	{ id: "DAN", order: 27, fullNames: ["Daniel"], abbreviations: ["Dan", "Dn"], numbered: false },
	{ id: "HOS", order: 28, fullNames: ["Hosea"], abbreviations: ["Hos"], numbered: false },
	{ id: "JOEL", order: 29, fullNames: ["Joel"], abbreviations: ["Jl"], numbered: false },
	{ id: "AMOS", order: 30, fullNames: ["Amos"], abbreviations: ["Am"], numbered: false },
	{ id: "OBAD", order: 31, fullNames: ["Obadiah"], abbreviations: ["Obad", "Ob"], numbered: false },
	{ id: "JONAH", order: 32, fullNames: ["Jonah"], abbreviations: ["Jnh", "Jon"], numbered: false },
	{ id: "MIC", order: 33, fullNames: ["Micah"], abbreviations: ["Mic"], numbered: false },
	{ id: "NAH", order: 34, fullNames: ["Nahum"], abbreviations: ["Nah", "Na"], numbered: false },
	{ id: "HAB", order: 35, fullNames: ["Habakkuk"], abbreviations: ["Hab"], numbered: false },
	{ id: "ZEPH", order: 36, fullNames: ["Zephaniah"], abbreviations: ["Zeph", "Zep"], numbered: false },
	{ id: "HAG", order: 37, fullNames: ["Haggai"], abbreviations: ["Hag"], numbered: false },
	{ id: "ZECH", order: 38, fullNames: ["Zechariah"], abbreviations: ["Zech", "Zec"], numbered: false },
	{ id: "MAL", order: 39, fullNames: ["Malachi"], abbreviations: ["Mal"], numbered: false },
	{ id: "MATT", order: 40, fullNames: ["Matthew"], abbreviations: ["Matt", "Mt"], numbered: false },
	{ id: "MARK", order: 41, fullNames: ["Mark"], abbreviations: ["Mrk", "Mk"], numbered: false },
	{ id: "LUKE", order: 42, fullNames: ["Luke"], abbreviations: ["Lk"], numbered: false },
	// Gospel of John — bare "John"/"Jn" only, never numeral-prefixed (that's the epistle family
	// below, which shares the same base text but is only matched WITH a numeral prefix).
	{ id: "JOHN", order: 43, fullNames: ["John"], abbreviations: ["Jn", "Jhn"], numbered: false },
	{ id: "ACTS", order: 44, fullNames: ["Acts"], abbreviations: ["Act"], numbered: false },
	{ id: "ROM", order: 45, fullNames: ["Romans"], abbreviations: ["Rom", "Rm"], numbered: false },
	{ id: "COR", order: 46, fullNames: ["Corinthians"], abbreviations: ["Cor", "Co"], numbered: true },
	{ id: "GAL", order: 48, fullNames: ["Galatians"], abbreviations: ["Gal"], numbered: false },
	{ id: "EPH", order: 49, fullNames: ["Ephesians"], abbreviations: ["Eph"], numbered: false },
	{ id: "PHIL", order: 50, fullNames: ["Philippians"], abbreviations: ["Phil", "Php"], numbered: false },
	{ id: "COL", order: 51, fullNames: ["Colossians"], abbreviations: ["Col"], numbered: false },
	{ id: "THESS", order: 52, fullNames: ["Thessalonians"], abbreviations: ["Thess", "Th"], numbered: true },
	{ id: "TIM", order: 54, fullNames: ["Timothy"], abbreviations: ["Tim", "Ti"], numbered: true },
	{ id: "TITUS", order: 56, fullNames: ["Titus"], abbreviations: ["Tit"], numbered: false },
	{ id: "PHLM", order: 57, fullNames: ["Philemon"], abbreviations: ["Philem", "Phm"], numbered: false },
	{ id: "HEB", order: 58, fullNames: ["Hebrews"], abbreviations: ["Heb"], numbered: false },
	{ id: "JAS", order: 59, fullNames: ["James"], abbreviations: ["Jas"], numbered: false },
	{ id: "PET", order: 60, fullNames: ["Peter"], abbreviations: ["Pet", "Pt"], numbered: true },
	// 1/2/3 John epistle family — reuses "John"/"Jn"/"Jhn" as base text, but expandBookNames
	// only generates numeral-PREFIXED variants for a `numbered: true` entry, so this never
	// produces a bare "John" match; that stays exclusively the Gospel entry above.
	{ id: "JOHN", order: 62, fullNames: ["John"], abbreviations: ["Jn", "Jhn"], numbered: true },
	{ id: "JUDE", order: 65, fullNames: ["Jude"], abbreviations: ["Jud", "Jd"], numbered: false },
	{ id: "REV", order: 66, fullNames: ["Revelation", "Revelations"], abbreviations: ["Rev", "Re"], numbered: false },
];

export interface ExpandedBookName {
	/** Family id (see BookEntry.id doc). Combine with `numeral` (if present) for the canonical id. */
	bookId: string;
	/** The literal string to match in source text, e.g. "1 Samuel", "1Sam", "Luke". */
	text: string;
	/** Set only for entries generated from a `numbered: true` book, e.g. "1", "2", "3". */
	numeral?: string;
}

/**
 * Expands every book's fullNames/abbreviations into the literal strings that should match in
 * source text — numbered books get one entry per (numeral prefix x separator x base name)
 * combination, e.g. "1John", "1 John", "ISamuel", "I Samuel", "First Samuel", ...
 */
export function expandBookNames(books: BookEntry[] = BOOKS): ExpandedBookName[] {
	const out: ExpandedBookName[] = [];
	for (const book of books) {
		const bases = [...book.fullNames, ...book.abbreviations];
		if (!book.numbered) {
			for (const base of bases) out.push({ bookId: book.id, text: base });
			continue;
		}
		for (const [numeral, prefixes] of Object.entries(NUMBER_PREFIXES)) {
			for (const prefix of prefixes) {
				for (const base of bases) {
					out.push({ bookId: book.id, text: `${prefix}${base}`, numeral });
					out.push({ bookId: book.id, text: `${prefix} ${base}`, numeral });
				}
			}
		}
	}
	return out;
}

/** Combines a family id with an optional matched numeral into the final canonical book id. */
export function canonicalBookId(familyId: string, numeral?: string): string {
	return numeral ? `${numeral}${familyId}` : familyId;
}
