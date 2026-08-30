import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCrosswayQuery, validateEsvResponse } from "./client";
import { findReferences } from "../parser/referenceParser";
import { CrosswayError } from "./errors";

// client.ts imports `requestUrl` from the obsidian runtime module, which isn't available
// under jest — same constraint the editorOps tests document (editorOps.test.ts:6-8). The
// pure functions under test here never call it; this mock only satisfies module loading.
jest.mock(
	"obsidian",
	() => ({ requestUrl: () => Promise.resolve({ status: 200, json: "" }) }),
	{ virtual: true },
);

const fixturesDir = join(process.cwd(), "src/crossway/__fixtures__");
function loadFixture(name: string): unknown {
	return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

function refFor(text: string) {
	const refs = findReferences(text, "ESV");
	const first = refs[0];
	if (!first) throw new Error(`test bug: no reference parsed from ${JSON.stringify(text)}`);
	return first;
}

describe("buildCrosswayQuery", () => {
	test.each([
		["John 3:16-18 ESV", "John 3:16-18"],
		["2 Cor 7:16-8:2 ESV", "2 Corinthians 7:16-8:2"],
		["Psalm 3:1-2 ESV", "Psalms 3:1-2"],
		["Song of Songs 1:1-4 ESV", "Song of Songs 1:1-4"],
		["Matt 5-6 ESV", "Matthew 5-6"],
		["Luke 15:11-13 ESV", "Luke 15:11-13"],
		["Psalm 119:1-16 ESV", "Psalms 119:1-16"],
		["John 3:16 ESV", "John 3:16"],
	])("%s -> %s", (source, expected) => {
		expect(buildCrosswayQuery(refFor(source))).toBe(expected);
	});
});

describe("validateEsvResponse (fuzzy-correction guard)", () => {
	test("accepts the live-captured John 3:16-18 fixture", () => {
		expect(() => validateEsvResponse(loadFixture("john3-16-18.json"), refFor("John 3:16-18 ESV"))).not.toThrow();
	});

	test("accepts the live-captured 2 Cor 7:16-8:2 crossing fixture", () => {
		expect(() => validateEsvResponse(loadFixture("2cor7-8-crossing.json"), refFor("2 Cor 7:16-8:2 ESV"))).not.toThrow();
	});

	test("accepts the chapter-only Matthew 5-6 shape (endChapter set, no verses)", () => {
		const body = {
			query: "Matthew 5-6",
			canonical: "Matthew 5–6",
			parsed: [[40005001, 40006034]],
			passage_meta: [{}],
			passages: ["<p>…</p>"],
		};
		expect(() => validateEsvResponse(body, refFor("Matt 5-6 ESV"))).not.toThrow();
	});

	test("rejects the live-captured empty response fixture (200 with no passages) as not-found", () => {
		// Captured live for q=Zechblat+1:1 — Crossway fuzzy-corrects garbage to a 200 with
		// empty passages. The parser itself rejects "Zechblat" before any fetch, so the
		// fixture is applied here with a real, parseable ref to exercise the guard branch.
		try {
			validateEsvResponse(loadFixture("zechblat-empty.json"), refFor("John 3:16 ESV"));
			throw new Error("expected validateEsvResponse to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(CrosswayError);
			expect((err as CrosswayError).kind).toBe("not-found");
		}
	});

	test("rejects a fuzzy-corrected passage whose verse ids don't match the reference (Psalm 151:1 -> Psalm 150:1)", () => {
		const body = {
			query: "Psalm 151:1",
			canonical: "Psalm 150:1",
			parsed: [[19150001, 19150001]],
			passage_meta: [{}],
			passages: ["<p>…</p>"],
		};
		try {
			validateEsvResponse(body, refFor("Psalm 151:1 ESV"));
			throw new Error("expected validateEsvResponse to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(CrosswayError);
			expect((err as CrosswayError).kind).toBe("verse-mismatch");
		}
	});

	test("rejects multiple passages (server split a query the plugin never asks to split)", () => {
		const body = {
			query: "John 3:16,18",
			canonical: "John 3:16, 18",
			parsed: [[43003016, 43003016], [43003018, 43003018]],
			passage_meta: [{}, {}],
			passages: ["<p>…</p>", "<p>…</p>"],
		};
		try {
			validateEsvResponse(body, refFor("John 3:16-18 ESV"));
			throw new Error("expected validateEsvResponse to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(CrosswayError);
			expect((err as CrosswayError).kind).toBe("malformed-response");
		}
	});

	test("rejects a missing passages array", () => {
		const body = { query: "John 3:16", canonical: "John 3:16", parsed: [[43003016, 43003016]] };
		try {
			validateEsvResponse(body, refFor("John 3:16 ESV"));
			throw new Error("expected validateEsvResponse to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(CrosswayError);
			expect((err as CrosswayError).kind).toBe("malformed-response");
		}
	});
});