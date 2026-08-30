import { planScripturize, runScripturize, type CalloutBuilder, type ScripturizerPlan } from "./editorOps";
import type { ScripturizerSettings } from "./settings";
import type { ParsedReference } from "./parser/referenceParser";
import { makeFakeEditor } from "./testSupport/editorFake";

// Constructed directly (not imported from ./settings) so this test doesn't transitively pull
// in the "obsidian" runtime module, which isn't available under jest. The fake editor lives
// in ./testSupport/editorFake and stays type-only on "obsidian" for the same reason.
const DEFAULT_SETTINGS: ScripturizerSettings = { apiKey: "", defaultTranslation: "CSB", bibleIdCache: {} };

/** blockText receives the matched raw text; seenMatches records what buildCallouts was actually called with. */
function makeCalloutBuilder(blockText: (raw: string) => string, seenMatches: ParsedReference[][] = []): CalloutBuilder {
	return {
		buildCallouts(matches) {
			seenMatches.push(matches);
			const out = new Map<number, string[]>();
			for (const m of matches) out.set(m.start, [blockText(m.raw)]);
			return Promise.resolve(out);
		},
	};
}

describe("runScripturize", () => {
	test("a reference alone on its line is replaced directly by the callout, no duplicate link", async () => {
		const text = "Some heading\n\n2 Corinthians 7:10\n\nMore text after.";
		const editor = makeFakeEditor(text);
		const calloutBuilder = makeCalloutBuilder(
			(raw) => `> [!bible-ref]+ [2 Corinthians 7:10 (CSB)](https://ref.ly/2Cor7.10;CSB)\n> **7.10** text for ${raw}`,
		);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		const result = editor.getValue();
		expect(result).toBe(
			"Some heading\n\n> [!bible-ref]+ [2 Corinthians 7:10 (CSB)](https://ref.ly/2Cor7.10;CSB)\n" +
				"> **7.10** text for 2 Corinthians 7:10\n\nMore text after.",
		);
		// The exact bug reported: the link text must not appear twice.
		const occurrences = result.split("2Cor7.10;CSB").length - 1;
		expect(occurrences).toBe(1);
	});

	test("a reference embedded mid-sentence is linked only — no callout attempted, no fetch call made for it", async () => {
		const text = "As Paul writes in 2 Corinthians 7:10, godly grief produces repentance.";
		const editor = makeFakeEditor(text);
		const seenMatches: ParsedReference[][] = [];
		const calloutBuilder = makeCalloutBuilder(
			() => `> [!bible-ref]+ [2 Corinthians 7:10 (CSB)](https://ref.ly/2Cor7.10;CSB)\n> **7.10** ...`,
			seenMatches,
		);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		expect(editor.getValue()).toBe(
			"As Paul writes in [2 Corinthians 7:10 (CSB)](https://ref.ly/2Cor7.10;CSB), godly grief produces repentance.",
		);
		// buildCallouts is only ever called with callout-eligible matches — the mid-sentence
		// reference should never have been passed in, i.e. no fetch was attempted for it.
		expect(seenMatches[0]).toHaveLength(0);
	});

	test("an unsupported translation (e.g. KJV) is linked only, even alone on its own line", async () => {
		const text = "2 Corinthians 7:10 (KJV)";
		const editor = makeFakeEditor(text);
		const seenMatches: ParsedReference[][] = [];
		const calloutBuilder = makeCalloutBuilder(() => "should not be used", seenMatches);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		expect(editor.getValue()).toBe("[2 Corinthians 7:10 (KJV)](https://ref.ly/2Cor7.10;KJV)");
		expect(seenMatches[0]).toHaveLength(0);
	});

	test("an ESV reference is callout-eligible when alone on its own line", async () => {
		const text = "2 Corinthians 7:10 (ESV)";
		const editor = makeFakeEditor(text);
		const seenMatches: ParsedReference[][] = [];
		const calloutBuilder = makeCalloutBuilder(
			(raw) => `> [!bible-ref]+ [2 Corinthians 7:10 (ESV)](https://ref.ly/2Cor7.10;ESV)\n> **7.10** text for ${raw}`,
			seenMatches,
		);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		expect(seenMatches[0]).toHaveLength(1);
		expect(seenMatches[0]?.[0]?.translationCode).toBe("ESV");
		expect(editor.getValue()).toBe(
			"> [!bible-ref]+ [2 Corinthians 7:10 (ESV)](https://ref.ly/2Cor7.10;ESV)\n" +
				"> **7.10** text for 2 Corinthians 7:10 (ESV)",
		);
	});

	test("a bullet-point reference is treated like it's alone on its own line", async () => {
		const text = "- 2 Corinthians 7:10\n- Something else";
		const editor = makeFakeEditor(text);
		const calloutBuilder = makeCalloutBuilder(
			() => `> [!bible-ref]+ [2 Corinthians 7:10 (CSB)](https://ref.ly/2Cor7.10;CSB)\n> **7.10** ...`,
		);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		expect(editor.getValue()).toBe(
			"> [!bible-ref]+ [2 Corinthians 7:10 (CSB)](https://ref.ly/2Cor7.10;CSB)\n> **7.10** ...\n\n- Something else",
		);
	});

	test("consecutive own-line references get exactly one blank line between their callouts", async () => {
		const text = "Rom 8:28\nRom 8:29";
		const editor = makeFakeEditor(text);
		const calloutBuilder = makeCalloutBuilder(
			(raw) => `> [!bible-ref]+ [link](url)\n> body for ${raw}`,
		);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		expect(editor.getValue()).toBe(
			"> [!bible-ref]+ [link](url)\n> body for Rom 8:28\n\n> [!bible-ref]+ [link](url)\n> body for Rom 8:29",
		);
	});

	test("an existing blank line between two own-line references is not doubled", async () => {
		const text = "Rom 8:28\n\nRom 8:29";
		const editor = makeFakeEditor(text);
		const calloutBuilder = makeCalloutBuilder(
			(raw) => `> [!bible-ref]+ [link](url)\n> body for ${raw}`,
		);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		expect(editor.getValue()).toBe(
			"> [!bible-ref]+ [link](url)\n> body for Rom 8:28\n\n> [!bible-ref]+ [link](url)\n> body for Rom 8:29",
		);
	});

	test("link-only mode (no calloutBuilder) still just replaces with the inline link", async () => {
		const text = "See 2 Corinthians 7:10 for more.";
		const editor = makeFakeEditor(text);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS);

		expect(editor.getValue()).toBe("See [2 Corinthians 7:10 (CSB)](https://ref.ly/2Cor7.10;CSB) for more.");
	});

	test("a callout gets a blank line inserted before it when preceded by non-blank-separated text", async () => {
		const text = "Some heading\nRom 8:28";
		const editor = makeFakeEditor(text);
		const calloutBuilder = makeCalloutBuilder((raw) => `> [!bible-ref]+ [link](url)\n> body for ${raw}`);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		expect(editor.getValue()).toBe("Some heading\n\n> [!bible-ref]+ [link](url)\n> body for Rom 8:28");
	});

	test("an existing blank line before a callout is not doubled", async () => {
		const text = "Some heading\n\nRom 8:28";
		const editor = makeFakeEditor(text);
		const calloutBuilder = makeCalloutBuilder((raw) => `> [!bible-ref]+ [link](url)\n> body for ${raw}`);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		expect(editor.getValue()).toBe("Some heading\n\n> [!bible-ref]+ [link](url)\n> body for Rom 8:28");
	});

	test("no leading blank line is added when the callout is the very first line of the note", async () => {
		const text = "Rom 8:28\nMore text after.";
		const editor = makeFakeEditor(text);
		const calloutBuilder = makeCalloutBuilder((raw) => `> [!bible-ref]+ [link](url)\n> body for ${raw}`);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		expect(editor.getValue()).toBe("> [!bible-ref]+ [link](url)\n> body for Rom 8:28\n\nMore text after.");
	});

	test("both leading and trailing blank lines are correct for a callout in the middle of several references", async () => {
		const text = "Intro text\nRom 8:28\nRom 8:29\nOutro text";
		const editor = makeFakeEditor(text);
		const calloutBuilder = makeCalloutBuilder((raw) => `> [!bible-ref]+ [link](url)\n> body for ${raw}`);

		await runScripturize(editor, text, 0, DEFAULT_SETTINGS, calloutBuilder);

		expect(editor.getValue()).toBe(
			"Intro text\n\n> [!bible-ref]+ [link](url)\n> body for Rom 8:28\n\n" +
				"> [!bible-ref]+ [link](url)\n> body for Rom 8:29\n\nOutro text",
		);
	});
});

describe("planScripturize (pure planning, single-transaction apply)", () => {
	const MULTI_CALLOUT_TEXT = "Intro text\nRom 8:28\nRom 8:29\nOutro text";
	const MULTI_CALLOUT_EXPECTED =
		"Intro text\n\n> [!bible-ref]+ [link](url)\n> body for Rom 8:28\n\n" +
		"> [!bible-ref]+ [link](url)\n> body for Rom 8:29\n\nOutro text";

	function makeLinkCalloutBuilder(): CalloutBuilder {
		return makeCalloutBuilder((raw) => `> [!bible-ref]+ [link](url)\n> body for ${raw}`);
	}

	test("planScripturize returns edits in ascending start order with correct counts, without touching any editor", async () => {
		const plan = await planScripturize(MULTI_CALLOUT_TEXT, 0, DEFAULT_SETTINGS, makeLinkCalloutBuilder());

		expect(plan.edits.map((e) => e.start)).toEqual([...plan.edits.map((e) => e.start)].sort((a, b) => a - b));
		expect(plan.linked).toBe(2);
		expect(plan.calloutsInserted).toBe(2);
		expect(plan.calloutsFailed).toBe(0);
		// "Intro text" is 10 chars, so the first edit must start exactly after "Intro text\n"
		// (offset 10), proving the callout edit is the leading-blank re-emission, not a mutated
		// editor.
		expect(plan.edits[0]?.start).toBe(10);
		expect(plan.edits[0]?.text.startsWith("\n\n> [!bible-ref]+")).toBe(true);
	});

	test("runScripturize applies the whole plan in exactly ONE transaction call", async () => {
		const editor = makeFakeEditor(MULTI_CALLOUT_TEXT);

		const result = await runScripturize(editor, MULTI_CALLOUT_TEXT, 0, DEFAULT_SETTINGS, makeLinkCalloutBuilder());

		expect(editor.getValue()).toBe(MULTI_CALLOUT_EXPECTED);
		expect(editor.transactionCalls).toHaveLength(1);
		const plan: ScripturizerPlan = await planScripturize(MULTI_CALLOUT_TEXT, 0, DEFAULT_SETTINGS, makeLinkCalloutBuilder());
		expect(editor.transactionCalls[0]?.changes).toHaveLength(plan.edits.length);
		expect(result).toEqual({ linked: 2, calloutsInserted: 2, calloutsFailed: 0 });
	});

	test("zero-edit plan fires ZERO transaction calls (no empty undo steps)", async () => {
		const text = "no refs here";
		const editor = makeFakeEditor(text);

		const result = await runScripturize(editor, text, 0, DEFAULT_SETTINGS, makeLinkCalloutBuilder());

		expect(result).toEqual({ linked: 0, calloutsInserted: 0, calloutsFailed: 0 });
		expect(editor.getValue()).toBe(text);
		expect(editor.transactionCalls).toHaveLength(0);
	});

	test("transaction changes are pairwise non-overlapping in original-document coordinates", async () => {
		const editor = makeFakeEditor(MULTI_CALLOUT_TEXT);

		await runScripturize(editor, MULTI_CALLOUT_TEXT, 0, DEFAULT_SETTINGS, makeLinkCalloutBuilder());

		expect(editor.transactionCalls).toHaveLength(1);
		const changes = editor.transactionCalls[0]?.changes ?? [];
		const spans = changes.map((c) => {
			// Convert back to offsets using the fake's original (pre-change) coordinate space:
			// fold each change's from/to against the pristine fixture string.
			const toOffset = (pos: { line: number; ch: number }): number => {
				let offset = 0;
				let lineNum = 0;
				for (const line of MULTI_CALLOUT_TEXT.split("\n")) {
					if (lineNum >= pos.line) break;
					offset += line.length + 1;
					lineNum++;
				}
				return offset + pos.ch;
			};
			return { start: toOffset(c.from), end: toOffset(c.to ?? c.from) };
		});
		let prevEnd: number | undefined;
		for (const span of spans) {
			if (prevEnd !== undefined) {
				expect(span.start).toBeGreaterThanOrEqual(prevEnd);
			}
			prevEnd = span.end;
		}
	});
});
