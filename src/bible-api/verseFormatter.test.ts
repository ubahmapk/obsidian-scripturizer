import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	parsePassageJson,
	formatCalloutBody,
	formatCalloutHeader,
	type FormattedBlock,
	type FormattedVerse,
} from "./verseFormatter";

const fixturesDir = join(process.cwd(), "src/bible-api/__fixtures__");

function fixtureData(name: string): unknown {
	return (JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as { data: unknown }).data;
}

const luke15 = fixtureData("luke15.json");
const crossing = fixtureData("2cor7-8-crossing.json");
const psalm103 = fixtureData("psalm103-1-5.json");
const matt6 = fixtureData("matt6-9-13.json");
const psalm3Chapter = fixtureData("psalm3-chapter.json");

/** Narrows parsed blocks to verse blocks — label blocks (superscriptions) are asserted separately. */
function versesOf(blocks: FormattedBlock[]): FormattedVerse[] {
	return blocks.filter((b): b is FormattedVerse => b.kind === "verse");
}

describe("verseFormatter against a real API.Bible content-type=json response", () => {
	test("parses verses grouped by paragraph, matching guidelines.md's Luke 15:25-32 example", () => {
		const verses = versesOf(parsePassageJson(luke15));

		expect(verses.map((v) => v.verse)).toEqual([25, 26, 27, 28, 29, 30, 31, 32]);
		// Paragraph boundaries per guidelines.md: {25,26,27} | {28,29,30} | {31,32}
		expect(verses.map((v) => v.paragraphIndex)).toEqual([0, 0, 0, 1, 1, 1, 2, 2]);
		expect(verses[0]?.lines.join(" ")).toContain("Now his older son was in the field");
	});

	test("formats the callout body with bold verse numbers and blank-line paragraph breaks", () => {
		const body = formatCalloutBody(parsePassageJson(luke15), 15);
		const lines = body.split("\n");

		expect(lines[0]).toMatch(/^> \*\*15\.25\*\* “Now his older son/);
		expect(lines[0]).toContain("**26**");
		expect(lines[0]).toContain("**27**");
		expect(lines[1]).toBe(">");
		expect(lines[2]).toMatch(/^> \*\*28\*\*/);
		expect(lines[3]).toBe(">");
		expect(lines[4]).toMatch(/^> \*\*31\*\*/);
	});

	test("callout header carries the foldable `+` marker, per guidelines.md's worked example", () => {
		expect(formatCalloutHeader("Luke 15:25–32 (CSB)", "https://ref.ly/Luke15.25–32;CSB")).toBe(
			"> [!bible-ref]+ [Luke 15:25–32 (CSB)](https://ref.ly/Luke15.25–32;CSB)",
		);
	});

	describe("chapter-crossing passages", () => {
		test("labels the first verse of each new chapter, using synthetic per-verse chapter data", () => {
			const verses: FormattedVerse[] = [
				{ kind: "verse", verse: 16, chapter: 7, lines: ["a"], paragraphIndex: 0 },
				{ kind: "verse", verse: 17, chapter: 7, lines: ["b"], paragraphIndex: 0 },
				{ kind: "verse", verse: 1, chapter: 8, lines: ["c"], paragraphIndex: 0 },
				{ kind: "verse", verse: 2, chapter: 8, lines: ["d"], paragraphIndex: 0 },
			];
			const body = formatCalloutBody(verses, 7);
			expect(body).toBe("> **7.16** a **17** b **8.1** c **2** d");
		});

		// Fixture captured live against a real API.Bible content-type=json response for
		// 2CO.7.16-2CO.8.2 (CSB) while implementing chapter-crossing range support;
		// recaptured with include-titles=true while restoring superscriptions — the
		// `s1` heading it now carries is dropped by the parser, not rendered.
		test("real API.Bible response for 2 Cor 7:16-8:2 carries per-verse chapter via verseId", () => {
			const verses = versesOf(parsePassageJson(crossing));

			expect(verses.map((v) => ({ chapter: v.chapter, verse: v.verse }))).toEqual([
				{ chapter: 7, verse: 16 },
				{ chapter: 8, verse: 1 },
				{ chapter: 8, verse: 2 },
			]);

			const body = formatCalloutBody(parsePassageJson(crossing), 7);
			expect(body).toContain("**7.16** I rejoice");
			expect(body).toContain("**8.1** We want you to know");
			expect(body).toContain("**2** During a severe trial");
			expect(body).not.toContain("Appeal to Complete the Collection");
		});
	});

	// Fixtures captured live against real API.Bible content-type=json responses for
	// PSA.103.1-PSA.103.5 and MAT.6.9-MAT.6.13 (CSB) while fixing issue #4, where
	// poetry continuation lines were dropped and every verse rendered as its own
	// paragraph. In poetry each LINE is its own `para` node and only the line starting
	// a verse carries a verse marker — these tests pin that structure. Recaptured with
	// include-titles=true while restoring superscriptions.
	describe("poetry passages (issue #4: CSB paragraphs retained only the first line)", () => {
		test("psalm103-1-5: every poetry continuation line survives and belongs to its verse", () => {
			const verses = versesOf(parsePassageJson(psalm103));

			expect(verses.map((v) => ({ chapter: v.chapter, verse: v.verse }))).toEqual([
				{ chapter: 103, verse: 1 },
				{ chapter: 103, verse: 2 },
				{ chapter: 103, verse: 3 },
				{ chapter: 103, verse: 4 },
				{ chapter: 103, verse: 5 },
			]);

			// The continuation lines that the per-paragraph-state bug silently dropped:
			expect(verses[0]?.lines).toEqual([
				"My soul, bless the Lord,",
				"and all that is within me, bless his holy name.",
			]);
			expect(verses[1]?.lines).toEqual([
				"My soul, bless the Lord,",
				"and do not forget all his benefits.",
			]);
			expect(verses[4]?.lines).toEqual([
				"He satisfies you with good things;",
				"your youth is renewed like the eagle.",
			]);

			// One stanza on each side of the source's explicit blank (the `b` para between
			// verses 2 and 3): verses 1-2 share a paragraph, verses 3-5 share another.
			expect(verses[0]?.paragraphIndex).toBe(verses[1]?.paragraphIndex);
			expect(verses[2]?.paragraphIndex).toBe(verses[3]?.paragraphIndex);
			expect(verses[3]?.paragraphIndex).toBe(verses[4]?.paragraphIndex);
			expect(verses[1]?.paragraphIndex).not.toBe(verses[2]?.paragraphIndex);
		});

		test("psalm103-1-5: renders the superscription as an italic label, stanza break as a bare >", () => {
			const body = formatCalloutBody(parsePassageJson(psalm103), 103);
			expect(body).toBe(
				"> _Of David._\n" +
					"> **103.1** My soul, bless the Lord,\n" +
					"> and all that is within me, bless his holy name.\n" +
					"> **2** My soul, bless the Lord,\n" +
					"> and do not forget all his benefits.\n" +
					">\n" +
					"> **3** He forgives all your iniquity;\n" +
					"> he heals all your diseases.\n" +
					"> **4** He redeems your life from the Pit;\n" +
					"> he crowns you with faithful love and compassion.\n" +
					"> **5** He satisfies you with good things;\n" +
					"> your youth is renewed like the eagle.",
			);
			// The editorial section heading that rides include-titles=true is dropped.
			expect(body).not.toContain("The Forgiving God");
		});

		test("matt6-9-13: a verse spanning the prose→poetry boundary keeps its lines together", () => {
			const verses = versesOf(parsePassageJson(matt6));

			expect(verses.map((v) => v.verse)).toEqual([9, 10, 11, 12, 13]);

			// Verse 9 = the `m` prose intro plus two `qc` poem lines; the poem inherits the
			// verse's paragraph, so no paragraph break may split these lines.
			expect(verses[0]?.lines).toEqual([
				"“Therefore, you should pray like this:",
				"Our Father in heaven,",
				"your name be honored as holy.",
			]);
			expect(verses[1]?.paragraphIndex).toBe(verses[0]?.paragraphIndex);

			// Matt 6:13's `sup` comma after "the evil one." is text-critical apparatus, not
			// reading text — skipped (user decision, 2026-09-12).
			expect(verses[4]?.lines).toEqual([
				"And do not bring us into temptation,",
				"but deliver us from the evil one.",
			]);
		});

		test("matt6-9-13: renders the poem line-per-line, single-line verses flowing inline", () => {
			const body = formatCalloutBody(parsePassageJson(matt6), 6);
			expect(body).toBe(
				"> **6.9** “Therefore, you should pray like this:\n" +
					"> Our Father in heaven,\n" +
					"> your name be honored as holy.\n" +
					"> **10** Your kingdom come.\n" +
					"> Your will be done\n" +
					"> on earth as it is in heaven. **11** Give us today our daily bread.\n" +
					"> **12** And forgive us our debts,\n" +
					"> as we also have forgiven our debtors.\n" +
					"> **13** And do not bring us into temptation,\n" +
					"> but deliver us from the evil one.",
			);
			// The "The Lord's Prayer" section heading that rides include-titles=true is dropped.
			expect(body).not.toContain("The Lord’s Prayer");
		});
	});

	// Fixture captured live against a real API.Bible content-type=json response for the
	// whole chapter PSA.3 (CSB), with include-titles=true, while restoring superscriptions.
	// It exercises every title shape at once: an `s1` editorial heading (dropped), a `d`
	// psalm superscription (label), `nd` divine-name chars, `qs` "Selah" chars, and `b`
	// stanza breaks between verse pairs.
	describe("whole-chapter psalm fetches (superscriptions)", () => {
		test("psalm3-chapter: the superscription is a label block; the section heading is dropped", () => {
			const blocks = parsePassageJson(psalm3Chapter);

			expect(blocks[0]).toEqual({
				kind: "label",
				text: "A psalm of David when he fled from his son Absalom.",
			});

			const verses = versesOf(blocks);
			expect(verses.map((v) => ({ chapter: v.chapter, verse: v.verse }))).toEqual(
				[1, 2, 3, 4, 5, 6, 7, 8].map((verse) => ({ chapter: 3, verse })),
			);
			expect(JSON.stringify(blocks)).not.toContain("Confidence in Troubled Times");

			// Divine-name `nd` chars and `qs` "Selah" chars flow into their verse lines:
			expect(verses[0]?.lines).toEqual(["Lord, how my foes increase!", "There are many who attack me."]);
			expect(verses[1]?.lines).toEqual([
				"Many say about me,",
				"“There is no help for him in God.” Selah",
			]);
			// Verse 7 spans four source lines (a q1 plus three q paras):
			expect(verses[6]?.lines).toEqual([
				"Rise up, Lord!",
				"Save me, my God!",
				"You strike all my enemies on the cheek;",
				"you break the teeth of the wicked.",
			]);

			// The `b` breaks group the poem into stanzas {1,2} {3,4} {5,6} {7,8}:
			expect(verses[0]?.paragraphIndex).toBe(verses[1]?.paragraphIndex);
			expect(verses[2]?.paragraphIndex).toBe(verses[3]?.paragraphIndex);
			expect(verses[1]?.paragraphIndex).not.toBe(verses[2]?.paragraphIndex);
		});

		test("psalm3-chapter: renders the label tight above the poem, stanzas separated by bare >", () => {
			const body = formatCalloutBody(parsePassageJson(psalm3Chapter), 3);
			expect(body).toBe(
				"> _A psalm of David when he fled from his son Absalom._\n" +
					"> **3.1** Lord, how my foes increase!\n" +
					"> There are many who attack me.\n" +
					"> **2** Many say about me,\n" +
					"> “There is no help for him in God.” Selah\n" +
					">\n" +
					"> **3** But you, Lord, are a shield around me,\n" +
					"> my glory, and the one who lifts up my head.\n" +
					"> **4** I cry aloud to the Lord,\n" +
					"> and he answers me from his holy mountain. Selah\n" +
					">\n" +
					"> **5** I lie down and sleep;\n" +
					"> I wake again because the Lord sustains me.\n" +
					"> **6** I will not be afraid of thousands of people\n" +
					"> who have taken their stand against me on every side.\n" +
					">\n" +
					"> **7** Rise up, Lord!\n" +
					"> Save me, my God!\n" +
					"> You strike all my enemies on the cheek;\n" +
					"> you break the teeth of the wicked.\n" +
					"> **8** Salvation belongs to the Lord;\n" +
					"> may your blessing be on your people. Selah",
			);
		});
	});
});
