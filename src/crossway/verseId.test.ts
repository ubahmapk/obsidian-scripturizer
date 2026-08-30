import { esvVerseId } from "./verseId";

describe("esvVerseId (BBBCCCVVV from books.ts canonical order)", () => {
	test.each([
		["JOHN", 3, 16, 43003016],
		["PS", 3, 1, 19003001],
		["PS", 119, 16, 19119016],
		["2COR", 7, 16, 47007016],
		["2COR", 8, 2, 47008002],
		["MATT", 5, 1, 40005001],
		["MATT", 6, 9, 40006009],
		["LUKE", 15, 25, 42015025], // LUKE order 42 -> 42|015|025
		["REV", 22, 21, 66022021],
		["GEN", 1, 1, 1001001],
		["1SAM", 1, 1, 9001001],
	])("esvVerseId(%s, %d, %d) === %d", (bookId, chapter, verse, expected) => {
		expect(esvVerseId(bookId, chapter, verse)).toBe(expected);
	});

	test("throws for an unknown book id", () => {
		expect(() => esvVerseId("ZECHBLAT", 1, 1)).toThrow();
	});
});