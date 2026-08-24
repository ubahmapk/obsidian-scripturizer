import { findReferences } from "./referenceParser";
import { BOOKS } from "../data/books";

describe("findReferences", () => {
	test("Book Chapter:Verse-Verse with colon separator", () => {
		const [ref] = findReferences("See Luke 15:25-32 for the parable.");
		expect(ref).toMatchObject({
			bookId: "LUKE",
			chapter: 15,
			verseSegments: [{ start: 25, end: 32 }],
			translationCode: "CSB",
			translationWasExplicit: false,
		});
		expect(ref?.raw).toBe("Luke 15:25-32");
	});

	test("Book Chapter with period separator, no space between book and chapter", () => {
		const [ref] = findReferences("Cf. John3.16 also.");
		expect(ref).toMatchObject({ bookId: "JOHN", chapter: 3, verseSegments: [{ start: 16, end: undefined }] });
	});

	test("chapter-only reference", () => {
		const [ref] = findReferences("Read Genesis 1 tonight.");
		expect(ref).toMatchObject({ bookId: "GEN", chapter: 1, verseSegments: [] });
	});

	test("translation suffix, bare form", () => {
		const [ref] = findReferences("Rom 8:28 NASB says so.");
		expect(ref).toMatchObject({ translationCode: "NASB", translationWasExplicit: true });
	});

	test("translation suffix, parenthesized form", () => {
		const [ref] = findReferences("Rom 8:28 (AMP) says so.");
		expect(ref).toMatchObject({ translationCode: "AMP", translationWasExplicit: true });
	});

	test("absent translation falls back to provided default", () => {
		const [ref] = findReferences("Rom 8:28 says so.", "NASB");
		expect(ref).toMatchObject({ translationCode: "NASB", translationWasExplicit: false });
	});

	describe("translation codes beyond the 3 fully-supported ones (Phase 10)", () => {
		test("a generic uppercase translation acronym is captured, bare form", () => {
			const [ref] = findReferences("2 Corinthians 7:10 ESV");
			expect(ref).toMatchObject({ translationCode: "ESV", translationWasExplicit: true });
		});

		test("a generic uppercase translation acronym is captured, parenthesized form", () => {
			const [ref] = findReferences("2 Corinthians 7:10 (ESV)");
			expect(ref).toMatchObject({ translationCode: "ESV", translationWasExplicit: true });
		});

		test.each(["NIV", "KJV", "NLT", "MSG", "NET", "NRSV"])("%s is captured like any other code", (code) => {
			const [ref] = findReferences(`John 3:16 (${code})`);
			expect(ref).toMatchObject({ translationCode: code, translationWasExplicit: true });
		});
	});

	describe("numbered-book prefix variants", () => {
		const variants = ["1 Samuel", "1Samuel", "I Samuel", "First Samuel", "1st Samuel", "1 Sam", "1Sam"];
		test.each(variants)("%s 3:1 resolves to 1SAM", (variant) => {
			const [ref] = findReferences(`${variant} 3:1`);
			expect(ref).toMatchObject({ bookId: "1SAM", chapter: 3, verseSegments: [{ start: 1, end: undefined }] });
		});

		test("2 Samuel resolves to 2SAM (distinct from 1SAM)", () => {
			const [ref] = findReferences("2 Samuel 3:1");
			expect(ref).toMatchObject({ bookId: "2SAM" });
		});
	});

	describe("Judges vs. Jude disambiguation", () => {
		test("Jude 1:3 resolves to JUDE, not JUDG", () => {
			const [ref] = findReferences("Jude 1:3");
			expect(ref).toMatchObject({ bookId: "JUDE" });
		});

		test("Judg 6:12 resolves to JUDG", () => {
			const [ref] = findReferences("Judg 6:12");
			expect(ref).toMatchObject({ bookId: "JUDG" });
		});

		test("book data: Judges and Jude abbreviation lists are disjoint", () => {
			const judges = BOOKS.find((b) => b.id === "JUDG");
			const jude = BOOKS.find((b) => b.id === "JUDE");
			const overlap = judges!.abbreviations.filter((a) => jude!.abbreviations.includes(a));
			expect(overlap).toEqual([]);
		});
	});

	test("bare 'John' resolves to the Gospel (JOHN), not an epistle", () => {
		const [ref] = findReferences("John 3:16");
		expect(ref).toMatchObject({ bookId: "JOHN", chapter: 3, verseSegments: [{ start: 16, end: undefined }] });
	});

	test("'1 John' resolves to the epistle (1JOHN), not the Gospel", () => {
		const [ref] = findReferences("1 John 1:9");
		expect(ref).toMatchObject({ bookId: "1JOHN", chapter: 1, verseSegments: [{ start: 9, end: undefined }] });
	});

	test("does not match a book literal embedded mid-word", () => {
		const results = findReferences("xJohn 3:16 is not a reference start");
		expect(results).toHaveLength(0);
	});

	test("multiple references in the same text", () => {
		const results = findReferences("Compare Luke 15:25-32 with Rom 8:28 (AMP).");
		expect(results).toHaveLength(2);
		expect(results[0]?.bookId).toBe("LUKE");
		expect(results[1]?.bookId).toBe("ROM");
	});

	describe("en dash range separator (Phase 8)", () => {
		test("en dash is recognized the same as a hyphen", () => {
			const [ref] = findReferences("Luke 15:11–13");
			expect(ref).toMatchObject({ bookId: "LUKE", chapter: 15, verseSegments: [{ start: 11, end: 13 }] });
			expect(ref?.raw).toBe("Luke 15:11–13");
		});
	});

	describe("compound comma-separated verse lists (Phase 8)", () => {
		test("two ranges", () => {
			const [ref] = findReferences("Luke 15:11-13,17-20");
			expect(ref?.verseSegments).toEqual([
				{ start: 11, end: 13 },
				{ start: 17, end: 20 },
			]);
			expect(ref?.raw).toBe("Luke 15:11-13,17-20");
		});

		test("en dash range followed by hyphen range in the same compound reference", () => {
			const [ref] = findReferences("Luke 15:11–13,17-20 (CSB)");
			expect(ref?.verseSegments).toEqual([
				{ start: 11, end: 13 },
				{ start: 17, end: 20 },
			]);
			expect(ref?.raw).toBe("Luke 15:11–13,17-20 (CSB)");
			expect(ref?.translationCode).toBe("CSB");
			expect(ref?.translationWasExplicit).toBe(true);
		});

		test("bare-verse list (no ranges)", () => {
			const [ref] = findReferences("John 3:16,18");
			expect(ref?.verseSegments).toEqual([
				{ start: 16, end: undefined },
				{ start: 18, end: undefined },
			]);
		});

		test("three or more segments", () => {
			const [ref] = findReferences("Rom 8:1,5-7,28");
			expect(ref?.verseSegments).toEqual([
				{ start: 1, end: undefined },
				{ start: 5, end: 7 },
				{ start: 28, end: undefined },
			]);
		});

		test("optional space after comma is tolerated", () => {
			const [ref] = findReferences("Luke 15:11-13, 17-20");
			expect(ref?.verseSegments).toEqual([
				{ start: 11, end: 13 },
				{ start: 17, end: 20 },
			]);
		});
	});

	describe("chapter-crossing ranges", () => {
		test("verse range crossing a chapter boundary, period separators", () => {
			const [ref] = findReferences("2 Cor 7.16-8.2");
			expect(ref).toMatchObject({
				bookId: "2COR",
				chapter: 7,
				verseSegments: [{ start: 16, end: 2, endChapter: 8 }],
			});
			expect(ref?.raw).toBe("2 Cor 7.16-8.2");
		});

		test("verse range crossing a chapter boundary, colon separators", () => {
			const [ref] = findReferences("2 Corinthians 7:16-8:2");
			expect(ref).toMatchObject({
				bookId: "2COR",
				chapter: 7,
				verseSegments: [{ start: 16, end: 2, endChapter: 8 }],
			});
		});

		test("bare chapter range with no verses", () => {
			const [ref] = findReferences("Matt 5-6");
			expect(ref).toMatchObject({ bookId: "MATT", chapter: 5, endChapter: 6, verseSegments: [] });
			expect(ref?.raw).toBe("Matt 5-6");
		});

		test("a same-chapter range is unaffected by the cross-chapter grammar", () => {
			const [ref] = findReferences("Luke 15:25-32");
			expect(ref).toMatchObject({ chapter: 15, verseSegments: [{ start: 25, end: 32, endChapter: undefined }] });
		});

		test("backward same-chapter verse range is rejected, not linkified", () => {
			const results = findReferences("John 3.20-10");
			expect(results).toHaveLength(0);
		});

		test("backward chapter-crossing verse range is rejected", () => {
			const results = findReferences("2 Cor 8.16-7.2");
			expect(results).toHaveLength(0);
		});

		test("backward bare chapter range is rejected", () => {
			const results = findReferences("Matt 6-5");
			expect(results).toHaveLength(0);
		});
	});
});
