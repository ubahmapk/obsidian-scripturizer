import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEsvHtml, type EsvBlock } from "./passageParser";
import { CrosswayError } from "./errors";

const fixturesDir = join(process.cwd(), "src/crossway/__fixtures__");

function passageOf(name: string): string {
	const body = JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as { passages: string[] };
	const first = body.passages[0];
	if (typeof first !== "string") throw new Error(`test bug: fixture ${name} has no passage string`);
	return first;
}

function verses(blocks: EsvBlock[]) {
	return blocks.filter((b): b is Extract<EsvBlock, { kind: "verse" }> => b.kind === "verse");
}

function labels(blocks: EsvBlock[]) {
	return blocks.filter((b): b is Extract<EsvBlock, { kind: "label" }> => b.kind === "label");
}

describe("parseEsvHtml against live-captured Crossway fixtures", () => {
	test("john3-16-18: prose — three verses, one paragraph, no labels", () => {
		const blocks = parseEsvHtml(passageOf("john3-16-18.json"));
		expect(labels(blocks)).toEqual([]);
		const v = verses(blocks);
		expect(v.map((x) => [x.chapter, x.verse])).toEqual([
			[3, 16],
			[3, 17],
			[3, 18],
		]);
		expect(v.every((x) => x.paragraphIndex === 0)).toBe(true);
		expect(v[0]?.lines.join(" ")).toContain("For God so loved the world");
		// Prose verses are single lines (no poetry breaks in this passage).
		expect(v.every((x) => x.lines.length === 1)).toBe(true);
	});

	test("2cor7-8-crossing: chapter-num resets chapter — 7:16 then 8:1, 8:2", () => {
		const blocks = parseEsvHtml(passageOf("2cor7-8-crossing.json"));
		expect(labels(blocks)).toEqual([]);
		const v = verses(blocks);
		expect(v.map((x) => [x.chapter, x.verse])).toEqual([
			[7, 16],
			[8, 1],
			[8, 2],
		]);
		expect(v.map((x) => x.paragraphIndex)).toEqual([0, 1, 1]);
		expect(v[0]?.lines.join(" ")).toContain("I rejoice");
		expect(v[1]?.lines.join(" ")).toContain("We want you to know");
	});

	test("psalm3-1-2: psalm-title label, poetry line breaks, Selah retained", () => {
		const blocks = parseEsvHtml(passageOf("psalm3-1-2.json"));
		const l = labels(blocks);
		expect(l.map((x) => x.text)).toEqual(["A Psalm of David, when he fled from Absalom his son."]);
		expect(l[0]?.index).toBe(0); // label precedes the first verse
		const v = verses(blocks);
		expect(v.map((x) => x.verse)).toEqual([1, 2]);
		expect(v[0]?.lines).toEqual(["O LORD, how many are my foes!", "Many are rising against me;"]);
		expect(v[1]?.lines).toEqual([
			"many are saying of my soul,",
			"“There is no salvation for him in God.” Selah",
		]);
	});

	test("psalm119-1-16: mid-passage acrostic labels Aleph and Beth, continuation lines merged", () => {
		const blocks = parseEsvHtml(passageOf("psalm119-1-16.json"));
		const l = labels(blocks);
		expect(l.map((x) => x.text)).toEqual(["Aleph", "Beth"]);
		expect(l[0]?.index).toBe(0);
		const bethIndex = l[1]?.index;
		const alephIndex = l[0]?.index;
		expect(bethIndex !== undefined && alephIndex !== undefined && bethIndex > alephIndex).toBe(true);
		const v = verses(blocks);
		expect(v.map((x) => x.verse)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
		// Each verse's two poetry lines merge into one verse block with two lines.
		expect(v[0]?.lines).toEqual([
			"Blessed are those whose way is blameless,",
			"who walk in the law of the LORD!",
		]);
		// Verses after Beth keep their chapter (119) — the label must not reset verse tracking.
		expect(v[15]?.verse).toBe(16);
	});

	test("song1-1-4: speaker labels She and Others split verse 4's text at their true positions", () => {
		const blocks = parseEsvHtml(passageOf("song1-1-4.json"));
		const l = labels(blocks);
		expect(l.map((x) => x.text)).toEqual(["She", "Others"]);
		const v = verses(blocks);
		expect(v.map((x) => [x.chapter, x.verse])).toEqual([
			[1, 1],
			[1, 2],
			[1, 3],
			[1, 4],
			[1, 4],
		]);
		// The "Others" continuation group is verse 4's SECOND block — the label renders
		// between them (Song 1:4: "Others" introduces the We-will-exult group).
		expect(v[3]?.lines).toEqual(["Draw me after you; let us run.", "The king has brought me into his chambers."]);
		expect(v[4]?.lines).toEqual([
			"We will exult and rejoice in you;",
			"we will extol your love more than wine;",
			"rightly do they love you.",
		]);
		expect(v[1]?.lines).toEqual([
			"Let him kiss me with the kisses of his mouth!",
			"For your love is better than wine;",
		]);
	});

	test("matt6-9-13: verse 9 spans a prose paragraph and the poem paragraph; verse 13's final line inside nested spans joins it", () => {
		const blocks = parseEsvHtml(passageOf("matt6-9-13.json"));
		expect(labels(blocks)).toEqual([]);
		const v = verses(blocks);
		expect(v.map((x) => [x.chapter, x.verse])).toEqual([
			[6, 9],
			[6, 10],
			[6, 11],
			[6, 12],
			[6, 13],
		]);
		expect(v[0]?.lines).toEqual([
			"Pray then like this:",
			"“Our Father in heaven,",
			"hallowed be your name.",
		]);
		expect(v[4]?.lines).toEqual([
			"And lead us not into temptation,",
			"but deliver us from evil.",
		]);
	});

	test("empty passages array is a malformed response", () => {
		expect(() => parseEsvHtml("")).toThrow(CrosswayError);
		try {
			parseEsvHtml("");
		} catch (err) {
			expect((err as CrosswayError).kind).toBe("malformed-response");
		}
	});

	test("minimal token path: one prose verse from hand-written HTML", () => {
		const html = '<p><b class="verse-num" id="v43003016-1">16&nbsp;</b>Jesus wept.</p>';
		const blocks = parseEsvHtml(html);
		const v = verses(blocks);
		expect(v.length).toBe(1);
		expect(v[0]).toMatchObject({ chapter: 3, verse: 16, lines: ["Jesus wept."], paragraphIndex: 0 });
	});

	test("HTML entities decode in verse text and labels", () => {
		const html =
			'<h4 class="psalm-title">A &amp; B</h4>\n<p><b class="verse-num" id="v43003016-1">16&nbsp;</b>“For &lt;God&gt; so loved</p>';
		const blocks = parseEsvHtml(html);
		expect(labels(blocks)[0]?.text).toBe("A & B");
		expect(verses(blocks)[0]?.lines[0]).toBe("“For <God> so loved");
	});
});