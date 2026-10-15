import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePassageJson, formatCalloutBody, type FormattedBlock, type FormattedVerse } from "./verseFormatter";

// Issue #19: acrostic letter headings. Fixtures are live API.Bible captures (data only).
const fixturesDir = join(process.cwd(), "src/bible-api/__fixtures__");

function fixtureData(name: string): unknown {
	return (JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as { data: unknown }).data;
}

function labelsOf(blocks: FormattedBlock[]): string[] {
	return blocks.flatMap((b) => (b.kind === "label" ? [b.text] : []));
}

function versesOf(blocks: FormattedBlock[]): FormattedVerse[] {
	return blocks.filter((b): b is FormattedVerse => b.kind === "verse");
}

const char = (style: string, text: string) => ({ name: "char", type: "tag", attrs: { style }, items: [{ type: "text", text }] });
const para = (style: string, items: unknown[]) => ({ name: "para", type: "tag", attrs: { style }, items });
const verse1 = para("q1", [{ name: "verse", attrs: { number: "1", style: "v" }, items: [] }, { type: "text", text: "Hi" }]);

describe("acrostic letter headings", () => {
	test("CSB Lam 3:22-26: Hebrew letter + name labels before v22 and v25 (s2 + qac/tl)", () => {
		const blocks = parsePassageJson(fixtureData("csb-lam3-22-26.json"));
		expect(labelsOf(blocks)).toEqual(["ח Cheth", "ט Teth"]);
		expect(versesOf(blocks).map((v) => v.verse)).toEqual([22, 23, 24, 25, 26]);

		const body = formatCalloutBody(blocks, 3).split("\n");
		expect(body[0]).toBe("> _ח Cheth_");
		expect(body[1]).toMatch(/^> \*\*3\.22\*\* /);
		const teth = body.indexOf("> _ט Teth_");
		expect(teth).toBeGreaterThan(0);
		expect(body[teth - 1]).not.toBe(">"); // tight: no blank separator above
		expect(body[teth + 1]).toMatch(/^> \*\*25\*\* /); // ...or below
	});

	test("CSB Ps 119: mid-passage letter label, editorial heading still dropped", () => {
		const blocks = parsePassageJson(fixtureData("csb-psalm119-7-10.json"));
		expect(labelsOf(blocks)).toEqual(["ב Beth"]);
		expect(formatCalloutBody(blocks, 119)).not.toMatch(/Delight in God/);
	});

	test.each([
		["NASB", "nasb-psalm119-1-10.json", ["Aleph", "Beth"]],
		["BSB", "bsb-psalm119-7-10.json", ["BETH"]],
		["AMP", "amp-psalm119-7-10.json", ["Beth."]],
	])("%s Ps 119: qa letter is a label exactly as supplied, not a stray verse line", (_name, file, expected) => {
		const blocks = parsePassageJson(fixtureData(file));
		expect(labelsOf(blocks)).toEqual(expected);
		const body = formatCalloutBody(blocks, 119);
		for (const letter of expected) {
			expect(body).toContain(`> _${letter}_`);
		}
		const verse8 = versesOf(blocks).find((v) => v.verse === 8);
		expect(verse8?.lines.join(" ")).not.toMatch(/Beth|BETH/);
	});

	test("an s2 heading without a qac letter is still dropped; empty qa yields no label", () => {
		const blocks = parsePassageJson({
			content: [para("s2", [{ type: "text", text: "Editorial" }]), para("qa", [{ type: "text", text: " " }]), verse1],
		});
		expect(labelsOf(blocks)).toEqual([]);
	});

	test("qac without a transliteration renders what is supplied", () => {
		const blocks = parsePassageJson({
			content: [
				para("s2", [char("qac", "א")]),
				verse1,
				para("s2", [char("qac", "ב"), { type: "text", text: " " }, char("tl", "Beth")]),
				verse1,
			],
		});
		expect(labelsOf(blocks)).toEqual(["א", "ב Beth"]);
	});
});
