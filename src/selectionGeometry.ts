// Pure selection-geometry helpers for selection-scoped scanning. No editor access, no
// obsidian import, and no editorOps import (calling editorOps from here would risk an
// import cycle once editorOps grows a scan-window parameter — the lineBoundsOf semantics
// are reimplemented locally instead).
import { CALLOUT_CONTINUATION_RE, CALLOUT_START_RE, SETEXT_UNDERLINE_RE } from "./parser/idempotency";

export interface SelectionFragment {
	fragmentStart: number;
	fragmentEnd: number;
	windowStart: number;
	windowEnd: number;
}

export interface SelectionRange {
	start: number;
	end: number;
}

/**
 * Normalizes and merges selection ranges into disjoint scan windows:
 * drops zero-width ranges, sorts ascending by start, then merges pairs that overlap, touch,
 * or are separated only by zero-length empty lines (whitespace-only lines are content —
 * ranges across one are provably non-colliding and stay separate).
 */
export function mergeSelectionRanges(doc: string, selections: SelectionRange[]): SelectionRange[] {
	const normalized = selections
		.filter((s) => s.start !== s.end)
		.map((s): SelectionRange => ({ start: Math.min(s.start, s.end), end: Math.max(s.start, s.end) }))
		.sort((a, b) => a.start - b.start);

	const merged: SelectionRange[] = [];
	for (const next of normalized) {
		const cur = merged[merged.length - 1];
		if (cur && (next.start <= cur.end || /^\n*$/.test(doc.slice(cur.end, next.start)))) {
			cur.end = Math.max(cur.end, next.end);
		} else {
			merged.push({ ...next });
		}
	}
	return merged;
}

function lineStartAbove(doc: string, lineStart: number): number {
	const prevLineEnd = lineStart - 1; // the newline ending the line above
	return prevLineEnd === 0 ? 0 : doc.lastIndexOf("\n", prevLineEnd - 1) + 1;
}

/**
 * Expands a selection `[selStart, selEnd)` into a context-rich fragment for scanning:
 * the fragment must make eligibility, spacing, and idempotency behave exactly like a
 * whole-note run on `doc`. Returns the fragment bounds plus `windowStart`/`windowEnd` —
 * the selection's own characters as fragment-relative offsets for the scan-window filter.
 */
export function expandSelectionFragment(doc: string, selStart: number, selEnd: number): SelectionFragment {
	// (a) Full line bounds of the selection.
	let fragmentStart = doc.lastIndexOf("\n", selStart - 1) + 1;
	const nextNewline = doc.indexOf("\n", selEnd);
	let fragmentEnd = nextNewline === -1 ? doc.length : nextNewline;

	// (b) +1 context line each side, clamped to doc bounds.
	if (fragmentStart > 0) {
		fragmentStart = lineStartAbove(doc, fragmentStart);
	}
	if (fragmentEnd < doc.length) {
		const nextLineNewline = doc.indexOf("\n", fragmentEnd + 1);
		fragmentEnd = nextLineNewline === -1 ? doc.length : nextLineNewline + 1;
	}

	// (c) Outward extension across zero-length blank-line runs touching either edge.
	// Asymmetric by design: the top walk must INCLUDE the content line terminating the run
	// (planScripturize's leading consumption walks backward and needs to see the non-"\n"
	// char), while the bottom walk must NOT include it (consumeEnd stops before the first
	// non-"\n" char and never reads it) — mirroring consumeStart/consumeEnd exactly.
	while (fragmentStart > 0 && doc.indexOf("\n", fragmentStart) === fragmentStart) {
		fragmentStart = lineStartAbove(doc, fragmentStart);
	}
	while (doc.startsWith("\n", fragmentEnd)) {
		fragmentEnd++;
	}

	// (d) Upward callout-block completion: so computeProtectedRanges sees the block's
	// `[!bible-ref]` start line even when the selection begins mid-body.
	while (fragmentStart > 0) {
		const lineEnd = doc.indexOf("\n", fragmentStart);
		const lineText = doc.slice(fragmentStart, lineEnd === -1 ? doc.length : lineEnd);
		if (!CALLOUT_CONTINUATION_RE.test(lineText) || CALLOUT_START_RE.test(lineText)) break;
		fragmentStart = lineStartAbove(doc, fragmentStart);
	}

	// (e) Downward setext completion: if the line just past the fragment looks like a setext
	// underline, include it — a multi-line setext heading's underline can sit more than one
	// context line below the selection, and computeProtectedRanges can only see (and protect)
	// the heading's paragraph if the underline is inside the fragment. Whether the underline
	// truly closes a heading is decided there, from the fragment's own last line; pulling
	// the line in when it doesn't is harmless (it just reads as ordinary context).
	if (fragmentEnd < doc.length) {
		const underlineNewline = doc.indexOf("\n", fragmentEnd);
		const nextLine = doc.slice(fragmentEnd, underlineNewline === -1 ? doc.length : underlineNewline);
		if (SETEXT_UNDERLINE_RE.test(nextLine)) {
			fragmentEnd = underlineNewline === -1 ? doc.length : underlineNewline + 1;
		}
	}

	return { fragmentStart, fragmentEnd, windowStart: selStart - fragmentStart, windowEnd: selEnd - fragmentStart };
}