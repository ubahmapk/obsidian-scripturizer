import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCalloutBlocksForMatch } from "./scripturizeWithText";
import type { ScripturizerSettings } from "../settings";
import type { TranslationCode } from "../data/translations";
import { findReferences } from "../parser/referenceParser";

jest.mock("obsidian", () => ({ Notice: class {}, requestUrl: () => Promise.resolve({ status: 200, json: {} }) }), {
	virtual: true,
});

const fixturesDir = join(process.cwd(), "src/crossway/__fixtures__");
const johnFixture: unknown = JSON.parse(readFileSync(join(fixturesDir, "john3-16-18.json"), "utf8"));

const SETTINGS: ScripturizerSettings = {
	apiKey: "api-bible-key",
	esvApiKey: "esv-key",
	defaultTranslation: "CSB",
	bibleIdCache: {},
};

/** Builds the FetchJob buildCalloutBlocksForMatch would receive for a single-reference match. */
function jobFor(text: string, fallback: TranslationCode = "CSB") {
	const refs = findReferences(text, fallback);
	const first = refs[0];
	if (!first) throw new Error(`test bug: no reference parsed from ${JSON.stringify(text)}`);
	const segment = first.verseSegments[0];
	const translationCode = first.translationCode as "CSB" | "ESV";
	return {
		matchStart: first.start,
		orderIndex: 0,
		raw: first.raw,
		bookId: first.bookId,
		passageId: "JHN.3.16-JHN.3.18",
		translationCode,
		link: {
			linkText: `John 3:16–18 (${translationCode})`,
			url: `https://ref.ly/John3.16-18;${translationCode}`,
		},
		chapter: first.chapter,
		segment,
		endChapter: first.endChapter,
	};
}

describe("buildCalloutBlocksForMatch engine routing", () => {
	test("an ESV job fetches via Crossway and produces the full callout block", async () => {
		const job = jobFor("John 3:16-18 ESV");
		const client = await import("../crossway/client");
		const spy = jest.spyOn(client, "fetchEsvPassage").mockResolvedValue(johnFixture);

		const block = await buildCalloutBlocksForMatch(job, SETTINGS, async () => {});
		expect(block).toBeDefined();
		expect(block).toContain("> [!bible-ref]+ [John 3:16–18 (ESV)](https://ref.ly/John3.16-18;ESV)");
		expect(block).toContain("> **3.16** “For God so loved the world");

		spy.mockRestore();
	});

	test("an ESV job with no key throws CrosswayError auth (caught by the builder's closure)", async () => {
		const job = jobFor("John 3:16-18 ESV");
		await expect(buildCalloutBlocksForMatch(job, { ...SETTINGS, esvApiKey: "" }, async () => {})).rejects.toThrow(
			/no Crossway \(ESV\) key configured/,
		);
	});

	test("a CSB job fetches via API.Bible and produces the callout block", async () => {
		const job = jobFor("John 3:16-18 CSB");
		const bibleIdCache = await import("../bible-api/bibleIdCache");
		const apiBibleClient = await import("../bible-api/apiBibleClient");

		jest.spyOn(bibleIdCache, "resolveBibleId").mockResolvedValue("csb-id-1");
		jest.spyOn(apiBibleClient, "fetchPassage").mockResolvedValue(csbJohnPassage());

		const block = await buildCalloutBlocksForMatch(job, SETTINGS, async () => {});
		expect(block).toBeDefined();
		expect(block).toContain("[John 3:16–18 (CSB)](https://ref.ly/John3.16-18;CSB)");

		jest.restoreAllMocks();
	});
});

function csbJohnPassage(): unknown {
	// Minimal API.Bible content-type=json shape for one verse — enough for parsePassageJson.
	return {
		content: [
			{
				type: "tag",
				name: "para",
				items: [
					{ type: "tag", name: "verse", attrs: { number: "16", style: "v" } },
					{ type: "text", text: "For God so loved the world," },
				],
			},
		],
	};
}