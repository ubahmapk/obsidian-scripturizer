import { planScripturize, type CalloutBuilder, type Edit } from "./editorOps";
import { expandSelectionFragment } from "./selectionGeometry";
import { makeFakeEditor } from "./testSupport/editorFake";
import type { ScripturizerSettings } from "./settings";
import type { ParsedReference } from "./parser/referenceParser";

// Constructed directly (not imported from ./settings) so this test doesn't transitively pull
// in the "obsidian" runtime module, which isn't available under jest. The fake editor lives
// in ./testSupport/editorFake and stays type-only on "obsidian" for the same reason.
const DEFAULT_SETTINGS: ScripturizerSettings = { apiKey: "", esvApiKey: "", defaultTranslation: "CSB", bibleIdCache: {} };

/** Standard builder: one complete callout block per eligible match, keyed by match.start. */
function makeCalloutBuilder(seenMatches: ParsedReference[][] = []): CalloutBuilder {
	return {
		buildCallouts(matches) {
			seenMatches.push(matches);
			const out = new Map<number, string[]>();
			for (const m of matches) out.set(m.start, [`> [!bible-ref]+ [link](url)\n> body for ${m.raw}`]);
			return Promise.resolve(out);
		},
	};
}

/**
 * Non-overlap check for a set of edits already in original-document coordinates: sorted by
 * start, each edit must begin at or after the previous one ends.
 */
function assertNonOverlapping(edits: Edit[]): void {
	const sorted = [...edits].sort((a, b) => a.start - b.start);
	let prevEnd: number | undefined;
	for (const e of sorted) {
		if (prevEnd !== undefined) {
			expect(e.start).toBeGreaterThanOrEqual(prevEnd);
		}
		prevEnd = e.end;
	}
}

describe("planScripturize scanWindow (fragment-relative full containment)", () => {
	test("(a) match fully inside window is linked and present in the plan", async () => {
		// "before\n" is 7 chars; "Rom 8:28" occupies [7, 15).
		const text = "before\nRom 8:28\nafter";
		seenMatches.length = 0;
		const plan = await planScripturize(text, 0, DEFAULT_SETTINGS, makeCalloutBuilder(seenMatches), [7, 15]);

		expect(plan.linked).toBe(1);
		expect(plan.edits).toHaveLength(1);
		// Alone-on-line CSB ref + a calloutBuilder → this edit is the CALLOUT edit, not an
		// inline link: it replaces "\nRom 8:28\n" (the ref's line including its leading
		// newline, with the consumed newline re-emitted as exactly "\n\n") with
		// "\n\ncallout\n\n". Full containment in [7, 15) keeps the match; the edit itself
		// legitimately extends past the window to the ref's whole line.
		const edit = plan.edits[0] as Edit;
		expect(edit.start).toBe(6);
		expect(edit.end).toBe(16);
		expect(edit.text).toBe("\n\n> [!bible-ref]+ [link](url)\n> body for Rom 8:28\n\n");
		// The builder was asked for exactly the inside-window match.
		expect(seenMatches).toHaveLength(1);
		expect(seenMatches[0]).toHaveLength(1);
		expect(seenMatches[0]?.[0]?.raw).toBe("Rom 8:28");
	});

	test("(b) match partially overlapping the window edge is dropped", async () => {
		// Window [7, 11) covers "Rom " only — the match extends past wEnd.
		const text = "before\nRom 8:28\nafter";
		const plan = await planScripturize(text, 0, DEFAULT_SETTINGS, makeCalloutBuilder(), [7, 11]);

		expect(plan.linked).toBe(0);
		expect(plan.edits).toHaveLength(0);
		expect(plan.calloutsInserted).toBe(0);
	});

	test("(c) matches on context lines outside the window are dropped", async () => {
		// "Rom 8:28\n" is 9 chars; "selected line" occupies [9, 22).
		const text = "Rom 8:28\nselected line\nRom 8:29";
		const plan = await planScripturize(text, 0, DEFAULT_SETTINGS, makeCalloutBuilder(), [9, 22]);

		expect(plan.linked).toBe(0);
		expect(plan.edits).toHaveLength(0);
	});

	test("(d) no scanWindow processes the whole fragment (regression)", async () => {
		const text = "Rom 8:28\nselected line\nRom 8:29";
		const plan = await planScripturize(text, 0, DEFAULT_SETTINGS, makeCalloutBuilder());

		expect(plan.linked).toBe(2);
		expect(plan.edits).toHaveLength(2);
	});

	test("(e) counts reflect the filtered set (one inside, one outside)", async () => {
		// "Rom 8:28\n" is 9 chars; "Rom 8:29" occupies [9, 17). Only the second match is inside.
		const text = "Rom 8:28\nRom 8:29";
		seenMatches.length = 0;
		const plan = await planScripturize(text, 0, DEFAULT_SETTINGS, makeCalloutBuilder(seenMatches), [9, 17]);

		expect(plan.linked).toBe(1);
		expect(plan.edits).toHaveLength(1);
		// Alone-on-line CSB ref "Rom 8:29" + a calloutBuilder → the edit is the CALLOUT edit:
		// consumeStart = the newline before the ref's line ([8, ...]), lineEnd = doc end with
		// no trailing blank run ([..., 17) — the ref's line is the last line), so the text has
		// NO trailing "\n\n". The edit legitimately extends past the window to the whole line.
		expect(plan.edits[0]?.start).toBe(8);
		expect(plan.edits[0]?.end).toBe(17);
		expect(plan.edits[0]?.text).toBe("\n\n> [!bible-ref]+ [link](url)\n> body for Rom 8:29");
		expect(plan.calloutsInserted).toBe(1);
		expect(plan.calloutsFailed).toBe(0);
		expect(seenMatches).toHaveLength(1);
		expect(seenMatches[0]).toHaveLength(1);
		expect(seenMatches[0]?.[0]?.raw).toBe("Rom 8:29");
	});

	test("(f) two disjoint windowed plans combine into ONE non-overlapping transaction with exact output", async () => {
		const doc = "Intro\nRom 8:28\nseparator line\nRom 8:29\nOutro";

		// Range 1 covers "Rom 8:28" on line 1: [6, 14).
		const frag1 = expandSelectionFragment(doc, 6, 14);
		const plan1 = await planScripturize(doc.slice(frag1.fragmentStart, frag1.fragmentEnd), frag1.fragmentStart, DEFAULT_SETTINGS, makeCalloutBuilder(), [
			frag1.windowStart,
			frag1.windowEnd,
		]);
		// Range 2 covers "Rom 8:29" on line 3: [30, 38).
		const frag2 = expandSelectionFragment(doc, 30, 38);
		const plan2 = await planScripturize(doc.slice(frag2.fragmentStart, frag2.fragmentEnd), frag2.fragmentStart, DEFAULT_SETTINGS, makeCalloutBuilder(), [
			frag2.windowStart,
			frag2.windowEnd,
		]);

		// Each plan scoped to its own selection: exactly one edit, one callout each.
		expect(plan1.linked).toBe(1);
		expect(plan1.calloutsInserted).toBe(1);
		expect(plan2.linked).toBe(1);
		expect(plan2.calloutsInserted).toBe(1);

		const combined = [...plan1.edits, ...plan2.edits];
		assertNonOverlapping(combined);

		// Apply the combined set through the REAL editor surface: one transaction, changes
		// converted via editor.offsetToPos, folded against original coordinates.
		const editor = makeFakeEditor(doc);
		editor.transaction({
			changes: combined.map((e) => ({
				from: editor.offsetToPos(e.start),
				to: editor.offsetToPos(e.end),
				text: e.text,
			})),
		});

		expect(editor.transactionCalls).toHaveLength(1);
		// Hand-derived expectation: each callout replaces its own line with a blank line
		// consumed on each content-adjacent side and re-emitted as exactly "\n\n";
		// "separator line", "Intro" and "Outro" stay intact and never merge into a blockquote.
		expect(editor.getValue()).toBe(
			"Intro\n\n> [!bible-ref]+ [link](url)\n> body for Rom 8:28\n\nseparator line\n\n" +
				"> [!bible-ref]+ [link](url)\n> body for Rom 8:29\n\nOutro",
		);
	});

	test("(g) a reference already inside a Markdown link within the window is dropped (protection sees the whole fragment)", async () => {
		// "See [Rom 8:28 (CSB)](u) here\n" is 29 chars; "plain Rom 8:29 line" occupies [29, 48).
		const text = "See [Rom 8:28 (CSB)](u) here\nplain Rom 8:29 line";
		const plan = await planScripturize(text, 0, DEFAULT_SETTINGS, makeCalloutBuilder(), [0, 29]);

		expect(plan.linked).toBe(0);
		expect(plan.edits).toHaveLength(0);
	});

	test("window beyond fragment bounds does not crash and keeps fully-contained matches", async () => {
		const text = "before\nRom 8:28\nafter";
		const plan = await planScripturize(text, 0, DEFAULT_SETTINGS, makeCalloutBuilder(), [0, 999999]);

		expect(plan.linked).toBe(1);
		expect(plan.edits).toHaveLength(1);
	});
});

// Shared across tests; reset per-test where the builder's call args are asserted.
const seenMatches: ParsedReference[][] = [];