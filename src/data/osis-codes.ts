// API.Bible book-id codes for passage lookups (e.g. GET /v1/bibles/{id}/passages/{passageId}
// where passageId is built as "{code}.{chapter}.{verse}"). Despite the file name (kept for
// continuity with the original design doc), these are API.Bible's own 3-letter USFM-style
// codes, NOT the OSIS standard's codes — the two schemes mostly agree but diverge for a few
// books (e.g. OSIS uses "Song" for Song of Songs, API.Bible uses "SNG"). Verified live against
// `GET /v1/bibles/{bibleId}/books` during the Phase 3 research spike — not assumed from memory.
//
// Keyed by the same canonical book id used throughout the plugin (books.ts's `id`, or
// `${numeral}${id}` for numbered books, e.g. "1SAM" -> "1SA").

export const API_BIBLE_BOOK_CODES: Record<string, string> = {
	GEN: "GEN",
	EXOD: "EXO",
	LEV: "LEV",
	NUM: "NUM",
	DEUT: "DEU",
	JOSH: "JOS",
	JUDG: "JDG",
	RUTH: "RUT",
	"1SAM": "1SA",
	"2SAM": "2SA",
	"1KGS": "1KI",
	"2KGS": "2KI",
	"1CHR": "1CH",
	"2CHR": "2CH",
	EZRA: "EZR",
	NEH: "NEH",
	ESTH: "EST",
	JOB: "JOB",
	PS: "PSA",
	PROV: "PRO",
	ECCL: "ECC",
	SONG: "SNG",
	ISA: "ISA",
	JER: "JER",
	LAM: "LAM",
	EZEK: "EZK",
	DAN: "DAN",
	HOS: "HOS",
	JOEL: "JOL",
	AMOS: "AMO",
	OBAD: "OBA",
	JONAH: "JON",
	MIC: "MIC",
	NAH: "NAM",
	HAB: "HAB",
	ZEPH: "ZEP",
	HAG: "HAG",
	ZECH: "ZEC",
	MAL: "MAL",
	MATT: "MAT",
	MARK: "MRK",
	LUKE: "LUK",
	JOHN: "JHN",
	ACTS: "ACT",
	ROM: "ROM",
	"1COR": "1CO",
	"2COR": "2CO",
	GAL: "GAL",
	EPH: "EPH",
	PHIL: "PHP",
	COL: "COL",
	"1THESS": "1TH",
	"2THESS": "2TH",
	"1TIM": "1TI",
	"2TIM": "2TI",
	TITUS: "TIT",
	PHLM: "PHM",
	HEB: "HEB",
	JAS: "JAS",
	"1PET": "1PE",
	"2PET": "2PE",
	"1JOHN": "1JN",
	"2JOHN": "2JN",
	"3JOHN": "3JN",
	JUDE: "JUD",
	REV: "REV",
};

export function apiBibleBookCode(canonicalBookId: string): string | undefined {
	return API_BIBLE_BOOK_CODES[canonicalBookId];
}
