import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatEsvBody } from "./esvFormatter";
import { parseEsvHtml } from "./passageParser";
import { findReferences } from "../parser/referenceParser";

const fixturesDir = join(process.cwd(), "src/crossway/__fixtures__");

function blocksFor(name: string) {
	const body = JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as { passages: string[] };
	return parseEsvHtml(body.passages[0] as string);
}

function refFor(text: string) {
	const refs = findReferences(text, "ESV");
	const first = refs[0];
	if (!first) throw new Error(`test bug: no reference parsed from ${JSON.stringify(text)}`);
	return first;
}

describe("formatEsvBody", () => {
	test("psalm3-1-2: italic superscription tight above the verses, poetry breaks kept", () => {
		const body = formatEsvBody(blocksFor("psalm3-1-2.json"), refFor("Psalm 3:1-2 ESV"));
		expect(body).toBe(
			"> _A Psalm of David, when he fled from Absalom his son._\n" +
				"> **3.1** O LORD, how many are my foes!\n" +
				"> Many are rising against me;\n" +
				"> **2** many are saying of my soul,\n" +
				"> “There is no salvation for him in God.” Selah",
		);
	});

	test("john3-16-18: prose verses, chapter-qualified first label, others bare", () => {
		const body = formatEsvBody(blocksFor("john3-16-18.json"), refFor("John 3:16-18 ESV"));
		const lines = body.split("\n");
		expect(lines.length).toBe(1);
		expect(lines[0]).toMatch(/^> \*\*3\.16\*\* “For God so loved the world/);
		expect(lines[0]).toContain(" **17** For God did not send");
		expect(lines[0]).toContain(" **18** Whoever believes");
		expect(lines[0]).not.toContain("(ESV)");
	});

	test("2cor7-8-crossing: chapter reset gets a fresh chapter.verse label", () => {
		const body = formatEsvBody(blocksFor("2cor7-8-crossing.json"), refFor("2 Cor 7:16-8:2 ESV"));
		expect(body.split("\n")).toEqual([
			"> **7.16** I rejoice, because I have complete confidence in you.",
			">",
			"> **8.1** We want you to know, brothers, about the grace of God that has been given among the churches of Macedonia, **2** for in a severe test of affliction, their abundance of joy and their extreme poverty have overflowed in a wealth of generosity on their part.",
		]);
	});

	test("psalm119-1-16: mid-passage acrostic labels are tight — no blank line around _Beth_", () => {
		const body = formatEsvBody(blocksFor("psalm119-1-16.json"), refFor("Psalm 119:1-16 ESV"));
		const lines = body.split("\n");
		const bethIdx = lines.findIndex((l) => l === "> _Beth_");
		expect(bethIdx).toBeGreaterThan(0);
		// Tight: previous line is verse 8's text, next is verse 9 — no blank ">" between.
		expect(lines[bethIdx - 1]).toMatch(/do not utterly forsake me!$/);
		expect(lines[bethIdx + 1]).toMatch(/^> \*\*9\*\*/);
		// Paragraph break absorbed: the source has \n\n between verse 8 and Beth, but no ">" separator renders.
		expect(body).not.toContain(">\n> _Beth_");
		expect(body).toContain("> _Aleph_\n> **119.1**");
	});

	test("song1-1-4: speaker labels interleaved, verse 4's continuation stays with verse 4", () => {
		const body = formatEsvBody(blocksFor("song1-1-4.json"), refFor("Song of Songs 1:1-4 ESV"));
		const lines = body.split("\n");
		expect(lines[0]).toBe("> **1.1** The Song of Songs, which is Solomon’s.");
		expect(lines[1]).toBe("> _She_");
		expect(lines[2]).toBe("> **2** Let him kiss me with the kisses of his mouth!");
		const othersIdx = lines.findIndex((l) => l === "> _Others_");
		expect(lines[othersIdx - 1]).toMatch(/The king has brought me into his chambers\.$/);
		// Verse 4's text resumes after the mid-verse label, so it's re-labeled (bare —
		// chapter 1 was already qualified at verse 1).
		expect(lines[othersIdx + 1]).toBe("> **4** We will exult and rejoice in you;");
	});

	test("matt6-9-13: verse 9's prose line and poem lines all render, verse 13 keeps its ending", () => {
		const body = formatEsvBody(blocksFor("matt6-9-13.json"), refFor("Matt 6:9-13 ESV"));
		expect(body).toContain("> **6.9** Pray then like this:");
		expect(body).toContain("> “Our Father in heaven,");
		expect(body).toContain("> **13** And lead us not into temptation,");
		expect(body).toContain("> but deliver us from evil.");
	});

	test("empty block list formats to an empty string", () => {
		expect(formatEsvBody([], refFor("John 3:16 ESV"))).toBe("");
	});
});