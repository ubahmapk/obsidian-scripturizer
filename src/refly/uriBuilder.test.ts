import { buildReflyLinks } from "./uriBuilder";
import type { ParsedReference, VerseSegment } from "../parser/referenceParser";

function ref(overrides: Partial<ParsedReference> & { verseSegments?: VerseSegment[] }): ParsedReference {
	return {
		raw: "",
		start: 0,
		end: 0,
		bookId: "LUKE",
		chapter: 15,
		verseSegments: [{ start: 25, end: 32 }],
		translationCode: "CSB",
		translationWasExplicit: false,
		...overrides,
	};
}

describe("buildReflyLinks", () => {
	test("verse range", () => {
		const [link] = buildReflyLinks(ref({}));
		expect(link).toEqual({ linkText: "Luke 15:25–32 (CSB)", url: "https://ref.ly/Lk15.25-32;CSB" });
	});

	test("single verse (no range)", () => {
		const [link] = buildReflyLinks(ref({ bookId: "JOHN", chapter: 3, verseSegments: [{ start: 16 }] }));
		expect(link).toEqual({ linkText: "John 3:16 (CSB)", url: "https://ref.ly/Jn3.16;CSB" });
	});

	test("chapter-only reference", () => {
		const [link] = buildReflyLinks(ref({ bookId: "GEN", chapter: 1, verseSegments: [] }));
		expect(link).toEqual({ linkText: "Genesis 1 (CSB)", url: "https://ref.ly/Gen1;CSB" });
	});

	test("numbered book resolves numeral prefix in both display text and URL", () => {
		const [link] = buildReflyLinks(ref({ bookId: "1SAM", chapter: 3, verseSegments: [{ start: 1 }] }));
		expect(link).toEqual({ linkText: "1 Samuel 3:1 (CSB)", url: "https://ref.ly/1Sam3.1;CSB" });
	});

	test("Gospel of John vs. 1 John resolve to distinct display names", () => {
		expect(buildReflyLinks(ref({ bookId: "JOHN", verseSegments: [] }))[0]?.linkText).toContain("John 15");
		expect(
			buildReflyLinks(ref({ bookId: "1JOHN", chapter: 1, verseSegments: [{ start: 9 }] }))[0]?.linkText,
		).toBe("1 John 1:9 (CSB)");
	});

	test("Philemon, Philippians, and Song of Songs resolve distinct abbreviations", () => {
		expect(
			buildReflyLinks(ref({ bookId: "PHLM", chapter: 1, verseSegments: [{ start: 6 }] }))[0]?.url,
		).toBe("https://ref.ly/Philem1.6;CSB");
		expect(
			buildReflyLinks(ref({ bookId: "PHIL", chapter: 2, verseSegments: [{ start: 1 }] }))[0]?.url,
		).toBe("https://ref.ly/Phil2.1;CSB");
		expect(
			buildReflyLinks(ref({ bookId: "SONG", chapter: 2, verseSegments: [{ start: 1 }] }))[0]?.url,
		).toBe("https://ref.ly/Song2.1;CSB");
	});

	test("different translation code is reflected in both display text and URL", () => {
		const [link] = buildReflyLinks(ref({ translationCode: "NASB" }));
		expect(link?.linkText).toContain("(NASB)");
		expect(link?.url.endsWith(";NASB")).toBe(true);
	});

	test("compound verse list produces one independent link per segment", () => {
		const links = buildReflyLinks(
			ref({
				chapter: 15,
				verseSegments: [
					{ start: 11, end: 13 },
					{ start: 17, end: 20 },
				],
			}),
		);
		expect(links).toEqual([
			{ linkText: "Luke 15:11–13 (CSB)", url: "https://ref.ly/Lk15.11-13;CSB" },
			{ linkText: "Luke 15:17–20 (CSB)", url: "https://ref.ly/Lk15.17-20;CSB" },
		]);
	});

	test("compound bare-verse list (no ranges)", () => {
		const links = buildReflyLinks(
			ref({
				bookId: "JOHN",
				chapter: 3,
				verseSegments: [{ start: 16 }, { start: 18 }],
			}),
		);
		expect(links.map((l) => l.url)).toEqual(["https://ref.ly/Jn3.16;CSB", "https://ref.ly/Jn3.18;CSB"]);
	});

	describe("chapter-crossing ranges", () => {
		test("verse range crossing a chapter boundary", () => {
			const [link] = buildReflyLinks(
				ref({
					bookId: "2COR",
					chapter: 7,
					verseSegments: [{ start: 16, end: 2, endChapter: 8 }],
				}),
			);
			expect(link).toEqual({
				linkText: "2 Corinthians 7:16–8:2 (CSB)",
				url: "https://ref.ly/2Cor7.16-8.2;CSB",
			});
		});

		test("bare chapter range with no verses", () => {
			const [link] = buildReflyLinks(ref({ bookId: "MATT", chapter: 5, endChapter: 6, verseSegments: [] }));
			expect(link).toEqual({ linkText: "Matthew 5-6 (CSB)", url: "https://ref.ly/Matt5-6;CSB" });
		});
	});
});
