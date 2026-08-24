import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePassageJson, formatCalloutBody } from "./verseFormatter";

const fixturePath = join(process.cwd(), "src/bible-api/__fixtures__/luke15.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as { data: unknown };

const crossingFixturePath = join(process.cwd(), "src/bible-api/__fixtures__/2cor7-8-crossing.json");
const crossingFixture = JSON.parse(readFileSync(crossingFixturePath, "utf8")) as { data: unknown };

describe("verseFormatter against a real API.Bible content-type=json response", () => {
	test("parses verses grouped by paragraph, matching guidelines.md's Luke 15:25-32 example", () => {
		const verses = parsePassageJson(fixture.data);

		expect(verses.map((v) => v.verse)).toEqual([25, 26, 27, 28, 29, 30, 31, 32]);
		// Paragraph boundaries per guidelines.md: {25,26,27} | {28,29,30} | {31,32}
		expect(verses.map((v) => v.paragraphIndex)).toEqual([0, 0, 0, 1, 1, 1, 2, 2]);
		expect(verses[0]?.text).toContain("Now his older son was in the field");
	});

	test("formats the callout body with bold verse numbers and blank-line paragraph breaks", () => {
		const verses = parsePassageJson(fixture.data);
		const body = formatCalloutBody(verses, 15);
		const lines = body.split("\n");

		expect(lines[0]).toMatch(/^> \*\*15\.25\*\* “Now his older son/);
		expect(lines[0]).toContain("**26**");
		expect(lines[0]).toContain("**27**");
		expect(lines[1]).toBe(">");
		expect(lines[2]).toMatch(/^> \*\*28\*\*/);
		expect(lines[3]).toBe(">");
		expect(lines[4]).toMatch(/^> \*\*31\*\*/);
	});

	describe("chapter-crossing passages", () => {
		test("labels the first verse of each new chapter, using synthetic per-verse chapter data", () => {
			const verses = [
				{ verse: 16, chapter: 7, text: "a", paragraphIndex: 0 },
				{ verse: 17, chapter: 7, text: "b", paragraphIndex: 0 },
				{ verse: 1, chapter: 8, text: "c", paragraphIndex: 0 },
				{ verse: 2, chapter: 8, text: "d", paragraphIndex: 0 },
			];
			const body = formatCalloutBody(verses, 7);
			expect(body).toBe("> **7.16** a **17** b **8.1** c **2** d");
		});

		// Fixture captured live against a real API.Bible content-type=json response for
		// 2CO.7.16-2CO.8.2 (CSB) while implementing chapter-crossing range support.
		test("real API.Bible response for 2 Cor 7:16-8:2 carries per-verse chapter via verseId", () => {
			const verses = parsePassageJson(crossingFixture.data);

			expect(verses.map((v) => ({ chapter: v.chapter, verse: v.verse }))).toEqual([
				{ chapter: 7, verse: 16 },
				{ chapter: 8, verse: 1 },
				{ chapter: 8, verse: 2 },
			]);

			const body = formatCalloutBody(verses, 7);
			expect(body).toContain("**7.16** I rejoice");
			expect(body).toContain("**8.1** We want you to know");
			expect(body).toContain("**2** During a severe trial");
		});
	});
});
