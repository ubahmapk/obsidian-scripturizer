import { requestUrl } from "obsidian";
import { CrosswayError } from "./errors";
import { esvVerseId } from "./verseId";
import { BOOKS } from "../data/books";
import type { ParsedReference, VerseSegment } from "../parser/referenceParser";

// Base host and endpoint per Crossway's own docs (https://api.esv.org/docs/). The HTML
// endpoint (with CSS classes) is used instead of the plain-text endpoint because it's the
// only response format that distinguishes pre-verse label text (psalm superscriptions,
// acrostic letters, speaker labels) from verse-continuation poetry lines — verified live
// against the text endpoint, which cannot separate the two.
const BASE_URL = "https://api.esv.org/v3/passage/html/";

const QUERY_PARAMS =
	"include-passage-references=false&include-verse-numbers=true&include-footnotes=false" +
	"&include-footnote-body=false&include-headings=false&include-short-copyright=false" +
	"&include-copyright=false&include-css-classes=true&include-audio-link=false&line-length=0";

export { CrosswayError };

function esvBookName(bookId: string): string | undefined {
	const numeralMatch = /^([123])(.+)$/.exec(bookId);
	const numeral = numeralMatch?.[1];
	const familyId = numeralMatch ? numeralMatch[2] : bookId;

	const entry = BOOKS.find((b) => b.id === familyId && b.numbered === Boolean(numeral));
	if (!entry) return undefined;

	const baseName = entry.fullNames[0];
	if (!baseName) return undefined;
	return numeral ? `${numeral} ${baseName}` : baseName;
}

/**
 * Builds the Crossway `q` value for a parsed reference, e.g. "2 Corinthians 7:16-8:2",
 * "Psalm 119:1-16", "Matthew 5-6". Crossway accepts full book names and every reference
 * shape the parser produces (verified live: full names, plural "Psalms", "Song of Songs",
 * cross-chapter ranges, chapter-only ranges).
 */
export function buildCrosswayQuery(ref: ParsedReference): string {
	const bookName = esvBookName(ref.bookId);
	if (!bookName) {
		throw new CrosswayError(`Scripturizer: no book data found for id "${ref.bookId}"`, "not-found");
	}

	// A bare chapter range (e.g. "Matt 5-6") has its own simpler shape.
	if (ref.endChapter !== undefined) {
		return `${bookName} ${ref.chapter}-${ref.endChapter}`;
	}

	const segments = ref.verseSegments;
	if (segments.length === 0) {
		return `${bookName} ${ref.chapter}`;
	}

	const first = segments[0];
	if (!first) throw new CrosswayError("Scripturizer: empty verse segment list", "malformed-response");

	if (first.end === undefined && first.endChapter === undefined) {
		return `${bookName} ${ref.chapter}:${first.start}`;
	}

	const last = segments[segments.length - 1];
	if (!last) throw new CrosswayError("Scripturizer: empty verse segment list", "malformed-response");
	const lastEnd = last.endChapter !== undefined ? `${last.endChapter}:${last.end}` : `${last.end ?? first.start}`;
	return `${bookName} ${ref.chapter}:${first.start}-${lastEnd}`;
}

function firstSegment(ref: ParsedReference): VerseSegment {
	const first = ref.verseSegments[0];
	if (first === undefined) {
		throw new CrosswayError("Scripturizer: empty verse segment list", "malformed-response");
	}
	return first;
}

function lastSegment(ref: ParsedReference): VerseSegment {
	const last = ref.verseSegments[ref.verseSegments.length - 1];
	if (last === undefined) {
		throw new CrosswayError("Scripturizer: empty verse segment list", "malformed-response");
	}
	return last;
}

/** The verse id the passage is expected to START at, given the parsed reference. */
function expectedStartVerseId(ref: ParsedReference): number {
	if (ref.verseSegments.length > 0) {
		return esvVerseId(ref.bookId, ref.chapter, firstSegment(ref).start);
	}
	return esvVerseId(ref.bookId, ref.chapter, 1);
}

/** The verse id the passage is expected to END at, given the parsed reference. */
function expectedEndVerseId(ref: ParsedReference): number {
	if (ref.endChapter !== undefined) {
		return esvVerseId(ref.bookId, ref.endChapter, 999);
	}
	if (ref.verseSegments.length === 0) {
		return esvVerseId(ref.bookId, ref.chapter, 999);
	}
	const last = lastSegment(ref);
	if (last.endChapter !== undefined) return esvVerseId(ref.bookId, last.endChapter, last.end ?? last.start);
	if (last.end !== undefined) return esvVerseId(ref.bookId, ref.chapter, last.end);
	return esvVerseId(ref.bookId, ref.chapter, last.start);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * The fuzzy-correction guard: Crossway silently "corrects" invalid references (John 99:1
 * returns John 21:1's text, Psalm 151:1 returns Psalm 150:1, garbage queries return 200
 * with empty passages). Verified live — see .omo/drafts/esv-text-download.md. This guard
 * verifies the response actually covers the requested verses before the plugin inserts
 * confidently-wrong text into a note. The START verse id must match exactly; the END is
 * checked as a containment range because a chapter-only fetch (e.g. "Matthew 5-6") returns
 * the chapter's real final verse id, not a sentinel.
 */
export function validateEsvResponse(body: unknown, ref: ParsedReference): void {
	if (!isRecord(body) || !Array.isArray(body.passages) || !Array.isArray(body.parsed)) {
		throw new CrosswayError("Scripturizer: unexpected Crossway response shape", "malformed-response");
	}
	if (body.passages.length === 0 || body.parsed.length === 0) {
		throw new CrosswayError(`Scripturizer: Crossway found no passage for "${buildCrosswayQuery(ref)}"`, "not-found");
	}
	if (body.passages.length !== 1 || typeof body.passages[0] !== "string") {
		throw new CrosswayError("Scripturizer: Crossway split a single reference into multiple passages", "malformed-response");
	}
	const canonical = typeof body.canonical === "string" ? body.canonical : "";
	if (canonical === "") {
		throw new CrosswayError(`Scripturizer: Crossway could not resolve "${buildCrosswayQuery(ref)}"`, "not-found");
	}

	const rawPair: unknown = body.parsed[0];
	if (!Array.isArray(rawPair) || rawPair.length !== 2 || typeof rawPair[0] !== "number" || typeof rawPair[1] !== "number") {
		throw new CrosswayError("Scripturizer: unexpected `parsed` shape in Crossway response", "malformed-response");
	}
	const start = rawPair[0];
	const end = rawPair[1];
	if (start !== expectedStartVerseId(ref) || end < expectedStartVerseId(ref) || end > expectedEndVerseId(ref)) {
		throw new CrosswayError(
			`Scripturizer: Crossway returned "${canonical}" for "${buildCrosswayQuery(ref)}" — refusing to insert corrected text`,
			"verse-mismatch",
		);
	}
}

/**
 * Fetches the ESV passage HTML for `query`. Uses `requestUrl` (not fetch) for CORS-safety
 * and mobile compatibility, per this project's Obsidian plugin conventions. Crossway
 * returns 403 (not 401) with a `{"detail": ...}` body for auth failures — verified live.
 */
export async function fetchEsvPassage(query: string, apiKey: string): Promise<string> {
	if (!apiKey) {
		throw new CrosswayError("Scripturizer: no Crossway (ESV) key configured in settings", "auth");
	}

	let response;
	try {
		response = await requestUrl({
			url: `${BASE_URL}?q=${encodeURIComponent(query)}&${QUERY_PARAMS}`,
			headers: { Authorization: `Token ${apiKey}` },
			throw: false,
		});
	} catch {
		throw new CrosswayError("Scripturizer: network error contacting Crossway", "network");
	}

	if (response.status === 403) {
		throw new CrosswayError("Scripturizer: Crossway rejected the configured ESV key", "auth");
	}
	if (response.status === 404) {
		throw new CrosswayError("Scripturizer: Crossway returned 404 for this request", "not-found");
	}
	if (response.status < 200 || response.status >= 300) {
		throw new CrosswayError(`Scripturizer: Crossway request failed (HTTP ${response.status})`, "network");
	}

	const json: unknown = response.json;
	if (typeof json !== "string") {
		throw new CrosswayError("Scripturizer: Crossway returned a malformed response", "malformed-response");
	}
	return json;
}