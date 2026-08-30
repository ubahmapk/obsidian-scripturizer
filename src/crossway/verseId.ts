import { BOOKS } from "../data/books";

// Crossway's `parsed` field returns verse ids as BBBCCCVVV integers, where BBB is the book's
// canonical order number. This matches the `order` field on our own books.ts entries exactly
// (verified live: JOHN=43 -> 43003016 for John 3:16; 2COR family order 46 -> 47007016 for
// 2 Cor 7:16). Numbered books offset by (numeral-1) from the family order, mirroring
// refly/uriBuilder's family-lookup mechanics.

function esvBookNumber(bookId: string): number | undefined {
	const numeralMatch = /^([123])(.+)$/.exec(bookId);
	const numeral = numeralMatch?.[1];
	const familyId = numeralMatch ? numeralMatch[2] : bookId;

	const entry = BOOKS.find((b) => b.id === familyId && b.numbered === Boolean(numeral));
	if (!entry) return undefined;

	return numeral ? entry.order + (Number.parseInt(numeral, 10) - 1) : entry.order;
}

/**
 * The BBBCCCVVV verse id Crossway uses in its `parsed` and verse-marker id attributes — the
 * ground truth the fuzzy-correction guard compares against (Crossway silently "corrects"
 * invalid references like Psalm 151:1 to Psalm 150:1, so a fetched passage must be verified
 * to actually be the requested one).
 */
export function esvVerseId(bookId: string, chapter: number, verse: number): number {
	const bookNumber = esvBookNumber(bookId);
	if (bookNumber === undefined) {
		throw new Error(`Scripturizer: no book data found for id "${bookId}"`);
	}
	return bookNumber * 1000000 + chapter * 1000 + verse;
}