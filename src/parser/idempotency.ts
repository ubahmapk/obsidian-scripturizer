import type { ParsedReference } from "./referenceParser";

export type ProtectedRange = [start: number, end: number];

// Inline Markdown links only — the only link form this plugin ever writes, so it's the only
// form we need to protect against re-processing.
const MARKDOWN_LINK_RE = /\[[^\]\n]*\]\([^)\n]*\)/g;

export const CALLOUT_START_RE = /^[ \t]*>[ \t]*\[!bible-ref\]/;
export const CALLOUT_CONTINUATION_RE = /^[ \t]*>/;

// ATX heading: up to three leading spaces/tabs, one to six `#`s, then whitespace or end of
// line (CommonMark). `#Psalm 90` with no space is a tag, not a heading, and `#######` (seven
// hashes) is a paragraph — neither matches.
const ATX_HEADING_RE = /^[ \t]{0,3}#{1,6}(?:[ \t]|$)/;

// Setext heading underline: a run of `=` or `-` with nothing after but trailing spaces/tabs.
// Only meaningful when the lines above form an open paragraph — see the heading walk in
// computeProtectedRanges. Exported for selectionGeometry.ts, which pulls a heading's
// underline line into a selection fragment when it sits just outside the context window.
export const SETEXT_UNDERLINE_RE = /^[ \t]{0,3}(?:=+|-+)[ \t]*$/;

// Fenced-code run at (up to three spaces into) line start: three or more backticks or
// tildes. Tracked so an `===`/`---` line INSIDE a fenced block is never mistaken for a
// setext underline; the fence's own content is not protected (references inside code
// blocks are a separate, pre-existing behavior).
const FENCE_RUN_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;

interface FenceLine {
	/** The fence run itself, e.g. "```" — its first character is the fence character. */
	run: string;
	/** The line after the run: an info string for openers; must be whitespace-only for closers. */
	rest: string;
}

function fenceLineInfo(line: string): FenceLine | undefined {
	const m = FENCE_RUN_RE.exec(line);
	if (!m) return undefined;
	return { run: m[1] as string, rest: line.slice(m[0].length) };
}

/** True if `fence` closes the fence opened by `openRun`: same character, at least as long, nothing after but whitespace. */
function closesFence(fence: FenceLine, openRun: string): boolean {
	const openChar = openRun[0];
	const fenceChar = fence.run[0];
	if (openChar === undefined || fenceChar === undefined || openChar !== fenceChar) return false;
	return fence.run.length >= openRun.length && /^[ \t]*$/.test(fence.rest);
}

/**
 * Finds character ranges in `text` that Scripturizer must never touch: heading lines — ATX
 * (`## Psalm 90`) and setext (a paragraph block promoted by an `===`/`---` underline line),
 * where a reference must be left as plain text (issue #5) — plus ranges it must never
 * re-process: existing inline Markdown links, and existing `bible-ref` callout blocks (from
 * the callout's `[!bible-ref]` line through its last contiguous `>`-prefixed line, blank
 * continuation lines included).
 */
export function computeProtectedRanges(text: string): ProtectedRange[] {
	const ranges: ProtectedRange[] = [];

	MARKDOWN_LINK_RE.lastIndex = 0;
	let linkMatch: RegExpExecArray | null;
	while ((linkMatch = MARKDOWN_LINK_RE.exec(text)) !== null) {
		ranges.push([linkMatch.index, linkMatch.index + linkMatch[0].length]);
	}

	const lines = text.split("\n");

	let offset = 0;
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] as string;
		if (CALLOUT_START_RE.test(line)) {
			const blockStart = offset;
			let blockEnd = offset + line.length;
			let j = i + 1;
			while (j < lines.length && CALLOUT_CONTINUATION_RE.test(lines[j] as string)) {
				blockEnd += 1 + (lines[j] as string).length; // +1 for the newline consumed
				j++;
			}
			ranges.push([blockStart, blockEnd]);
			for (; i < j; i++) offset += (lines[i] as string).length + 1;
			continue;
		}
		offset += line.length + 1;
		i++;
	}

	// Heading walk (issue #5): an ATX heading line protects its whole line; a setext
	// underline protects the whole open-paragraph span above it plus itself, so a reference
	// anywhere in a multi-line setext heading stays plain. Blank lines and `>`-prefixed
	// (blockquote/callout) lines end an open paragraph, and fenced code blocks are tracked
	// so their interior `===`/`---` lines are never read as underlines. An underline with no
	// open paragraph above is ordinary paragraph content, not a heading.
	let headingOffset = 0;
	let paragraphStart: number | undefined;
	let fenceRun: string | undefined;
	for (const line of lines) {
		const fence = fenceLineInfo(line);
		if (fenceRun !== undefined) {
			if (fence && closesFence(fence, fenceRun)) fenceRun = undefined;
		} else if (fence) {
			fenceRun = fence.run;
			paragraphStart = undefined;
		} else if (paragraphStart !== undefined && SETEXT_UNDERLINE_RE.test(line)) {
			ranges.push([paragraphStart, headingOffset + line.length]);
			paragraphStart = undefined;
		} else if (ATX_HEADING_RE.test(line)) {
			ranges.push([headingOffset, headingOffset + line.length]);
			paragraphStart = undefined;
		} else if (line.trim() === "" || CALLOUT_CONTINUATION_RE.test(line)) {
			paragraphStart = undefined;
		} else {
			paragraphStart ??= headingOffset;
		}
		headingOffset += line.length + 1;
	}

	return ranges;
}

function overlaps(a: ProtectedRange, start: number, end: number): boolean {
	return start < a[1] && end > a[0];
}

/** Drops any ParsedReference whose [start, end) span overlaps a protected range. */
export function filterUnprotected(
	matches: ParsedReference[],
	protectedRanges: ProtectedRange[],
): ParsedReference[] {
	if (protectedRanges.length === 0) return matches;
	return matches.filter((m) => !protectedRanges.some((r) => overlaps(r, m.start, m.end)));
}
