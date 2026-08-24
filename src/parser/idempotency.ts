import type { ParsedReference } from "./referenceParser";

export type ProtectedRange = [start: number, end: number];

// Inline Markdown links only — the only link form this plugin ever writes, so it's the only
// form we need to protect against re-processing.
const MARKDOWN_LINK_RE = /\[[^\]\n]*\]\([^)\n]*\)/g;

const CALLOUT_START_RE = /^[ \t]*>[ \t]*\[!bible-ref\]/;
const CALLOUT_CONTINUATION_RE = /^[ \t]*>/;

/**
 * Finds character ranges in `text` that must never be re-processed: existing inline Markdown
 * links, and existing `bible-ref` callout blocks (from the callout's `[!bible-ref]` line
 * through its last contiguous `>`-prefixed line, blank continuation lines included).
 */
export function computeProtectedRanges(text: string): ProtectedRange[] {
	const ranges: ProtectedRange[] = [];

	MARKDOWN_LINK_RE.lastIndex = 0;
	let linkMatch: RegExpExecArray | null;
	while ((linkMatch = MARKDOWN_LINK_RE.exec(text)) !== null) {
		ranges.push([linkMatch.index, linkMatch.index + linkMatch[0].length]);
	}

	let offset = 0;
	const lines = text.split("\n");
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
