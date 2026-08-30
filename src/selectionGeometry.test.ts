// Pure geometry tests — no editor, no obsidian import (matching repo test style).
import { expandSelectionFragment, mergeSelectionRanges } from "./selectionGeometry";

describe("mergeSelectionRanges", () => {
	it("drops zero-width ranges", () => {
		expect(mergeSelectionRanges("abc", [{ start: 1, end: 1 }, { start: 0, end: 3 }])).toEqual([{ start: 0, end: 3 }]);
	});

	it("merges overlapping ranges", () => {
		expect(mergeSelectionRanges("hello world", [{ start: 0, end: 6 }, { start: 4, end: 11 }])).toEqual([
			{ start: 0, end: 11 },
		]);
	});

	it("merges touching ranges ([5,10)+[10,15) → [5,15))", () => {
		const doc = "abcdefghijk lmno";
		expect(mergeSelectionRanges(doc, [{ start: 10, end: 15 }, { start: 5, end: 10 }])).toEqual([
			{ start: 5, end: 15 },
		]);
	});

	it("merges ranges separated by a zero-length empty-line gap", () => {
		const doc = "aaaa\n\nbbbb";
		expect(mergeSelectionRanges(doc, [{ start: 0, end: 4 }, { start: 6, end: 10 }])).toEqual([
			{ start: 0, end: 10 },
		]);
	});

	it("does NOT merge ranges separated by a whitespace-only line", () => {
		const doc = "aaaa\n  \nbbbb";
		expect(mergeSelectionRanges(doc, [{ start: 0, end: 4 }, { start: 7, end: 11 }])).toEqual([
			{ start: 0, end: 4 },
			{ start: 7, end: 11 },
		]);
	});

	it("keeps a fully-contained range: [10,20)+[12,15) → [10,20)", () => {
		const doc = "a".repeat(30);
		expect(mergeSelectionRanges(doc, [{ start: 12, end: 15 }, { start: 10, end: 20 }])).toEqual([
			{ start: 10, end: 20 },
		]);
	});

	it("merges three ranges transitively", () => {
		const doc = "x".repeat(30);
		expect(
			mergeSelectionRanges(doc, [{ start: 20, end: 25 }, { start: 0, end: 5 }, { start: 5, end: 20 }]),
		).toEqual([{ start: 0, end: 25 }]);
	});

	it("returns [] for empty input", () => {
		expect(mergeSelectionRanges("anything", [])).toEqual([]);
	});

	it("normalizes an un-normalized pair (start > end)", () => {
		expect(mergeSelectionRanges("abcdef", [{ start: 5, end: 2 }, { start: 0, end: 1 }])).toEqual([
			{ start: 0, end: 1 },
			{ start: 2, end: 5 },
		]);
	});
});

describe("expandSelectionFragment", () => {
	it("expands a mid-line selection to full line bounds (plus context)", () => {
		const doc = "first line\nRom 8:28 mid-sentence\nlast line";
		// Selection covers exactly "8:28" on line 2.
		const selStart = doc.indexOf("8:28");
		const selEnd = selStart + 4;
		const r = expandSelectionFragment(doc, selStart, selEnd);
		// Full line: "Rom 8:28 mid-sentence"; context adds line 1 above; below is the doc's last
		// line (exists), so fragmentEnd extends past its newline → doc.length.
		expect(r.fragmentStart).toBe(0);
		expect(r.fragmentEnd).toBe(doc.length);
		// Window = exact selection chars, fragment-relative.
		expect(r.windowStart).toBe(selStart - r.fragmentStart);
		expect(r.windowEnd).toBe(selEnd - r.fragmentStart);
	});

	it("adds one context line each side", () => {
		const doc = "l1\nl2\nl3\nl4\nl5";
		// Select exactly "l3" (offsets 6..8). Line bounds [6,9); +1 context line each side
		// → fragment [3, 12); no blank-line runs, no callout lines → stops there.
		const r = expandSelectionFragment(doc, 6, 8);
		expect(r.fragmentStart).toBe(3);
		expect(r.fragmentEnd).toBe(12);
	});

	it("extends outward across a blank-line run touching the fragment edge", () => {
		const doc = "a\n\n\nRom 8:28\nb";
		// Select exactly "Rom 8:28" (offsets 5..13); line bounds [5,13).
		const selStart = doc.indexOf("Rom");
		const selEnd = selStart + "Rom 8:28".length;
		const r = expandSelectionFragment(doc, selStart, selEnd);
		expect(r.fragmentStart).toBe(0);
	});

	it("clamps at doc start/end", () => {
		const doc = "only line";
		const r = expandSelectionFragment(doc, 5, 9);
		expect(r.fragmentStart).toBe(0);
		expect(r.fragmentEnd).toBe(doc.length);
		expect(r.windowStart).toBe(5);
		expect(r.windowEnd).toBe(9);
	});

	it("completes a callout block upward from a body-line selection", () => {
		const doc = "text\n> [!bible-ref]+ [Rom 8:28 (CSB)](u)\n> body line\nafter";
		// Select "body" inside "> body line".
		const selStart = doc.indexOf("body");
		const selEnd = selStart + 4;
		const r = expandSelectionFragment(doc, selStart, selEnd);
		// Fragment must reach the start of the "> [!bible-ref]" line (offset of ">" after "text\n").
		expect(r.fragmentStart).toBe("text\n".length);
	});

	it("does NOT extend upward when the top line is the callout start line itself", () => {
		const doc = "text\n> [!bible-ref]+ [Rom 8:28 (CSB)](u)\nafter";
		// Select "bible-ref" inside the callout start line.
		const selStart = doc.indexOf("bible-ref");
		const selEnd = selStart + 9;
		const r = expandSelectionFragment(doc, selStart, selEnd);
		// Line bounds: "> [!bible-ref]+ ..." starts at "text\n".length; context line above is
		// "text" at [0,4), so fragmentStart = 0 — upward callout walk stops because the
		// line above is not a continuation line.
		expect(r.fragmentStart).toBe(0);
	});

	it("selection covering the whole doc → fragment = whole doc, window = [0, doc.length)", () => {
		const doc = "a\nbc\nd";
		const r = expandSelectionFragment(doc, 0, doc.length);
		expect(r).toEqual({ fragmentStart: 0, fragmentEnd: doc.length, windowStart: 0, windowEnd: doc.length });
	});

	it("handles empty doc with degenerate [0,0) selection", () => {
		const r = expandSelectionFragment("", 0, 0);
		expect(r).toEqual({ fragmentStart: 0, fragmentEnd: 0, windowStart: 0, windowEnd: 0 });
	});

	it("handles single-char doc", () => {
		const r = expandSelectionFragment("x", 0, 1);
		expect(r).toEqual({ fragmentStart: 0, fragmentEnd: 1, windowStart: 0, windowEnd: 1 });
	});

	it("blank-run extension stops at a whitespace-only line (content, not blank)", () => {
		const doc = "a\n  \nRom 8:28\nb";
		const selStart = doc.indexOf("Rom");
		const selEnd = selStart + "Rom 8:28".length;
		const r = expandSelectionFragment(doc, selStart, selEnd);
		// (b) context step moves fragmentStart to the "  " line (offset 2). (c)'s top walk then
		// checks the top line itself: "  " is non-zero-length (whitespace-only = content), so
		// the walk stops immediately — fragmentStart stays at 2, never reaching the "a" line.
		expect(r.fragmentStart).toBe(2);
	});

	it("completes a callout block upward across multiple continuation lines", () => {
		const doc = "text\n> [!bible-ref]+ [Jn 3:16 (CSB)](u)\n> body1\n> body2\nafter";
		// Select "body2" inside "> body2". After (b) the top line is "> body1" — a continuation
		// line that is NOT a callout start — so (d)'s upward walk extends past it to the
		// "> [!bible-ref]" start line.
		const selStart = doc.indexOf("body2");
		const selEnd = selStart + "body2".length;
		const r = expandSelectionFragment(doc, selStart, selEnd);
		expect(r.fragmentStart).toBe("text\n".length);
	});

	it("bottom blank-run walk extends past blank lines but NOT into the content line", () => {
		const doc = "x\nRom 8:28\n\n\ny";
		// Select exactly "Rom 8:28" ([2,10)). (a)→[2,10); (b) top→0, bottom→12 (first blank
		// line as context); (c) bottom: doc[12]==="\n" → 13, doc[13]==="y" → stop. The "y"
		// line itself is NOT included (consumeEnd never needs to read the terminating line).
		const selStart = doc.indexOf("Rom");
		const selEnd = selStart + "Rom 8:28".length;
		const r = expandSelectionFragment(doc, selStart, selEnd);
		expect(r.fragmentStart).toBe(0);
		expect(r.fragmentEnd).toBe(13);
	});
});