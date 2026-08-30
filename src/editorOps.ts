import type { Editor } from "obsidian";
import { findReferences, type ParsedReference } from "./parser/referenceParser";
import { computeProtectedRanges, filterUnprotected } from "./parser/idempotency";
import { buildReflyLinks } from "./refly/uriBuilder";
import { isTranslationCode } from "./data/translations";
import type { ScripturizerSettings } from "./settings";

export interface CalloutBuilder {
	/**
	 * Fetches and formats verse text for `matches` (already pre-filtered to "callout-eligible"
	 * matches only — see `isCalloutEligible` — so this is never asked to fetch text for a
	 * reference that won't end up with a callout), returning one COMPLETE callout block per
	 * verse segment (`> [!bible-ref]+ [...](...)\n> body`, header included) — keyed by the
	 * match's `start` offset, since that's the only stable identity available at this layer. A
	 * missing/empty entry means that reference's fetch failed and should be skipped with a
	 * summary Notice by the caller — Phase 5 fills this in via bible-api/.
	 */
	buildCallouts(matches: ParsedReference[], settings: ScripturizerSettings): Promise<Map<number, string[]>>;
}

export interface Edit {
	start: number;
	end: number;
	text: string;
}

export interface ScripturizerPlan {
	edits: Edit[];
	linked: number;
	calloutsInserted: number;
	calloutsFailed: number;
}

interface LineBounds {
	lineStart: number;
	lineEnd: number;
}

function lineBoundsOf(text: string, start: number, end: number): LineBounds {
	const lineStart = text.lastIndexOf("\n", start - 1) + 1;
	const nextNewline = text.indexOf("\n", end);
	const lineEnd = nextNewline === -1 ? text.length : nextNewline;
	return { lineStart, lineEnd };
}

const LIST_MARKER_RE = /^(?:[-*+]|\d+[.)])/;
const CHECKBOX_RE = /^[ \t]+\[[ xX]\]/;

/**
 * True if `before` is nothing but a bare list-item marker — a bullet (-, *, +) or numbered
 * marker (1., 1)), optionally followed by a checkbox — with no other content. Implemented as
 * sequential, independently-anchored checks (not one combined regex) so there's no ambiguous
 * repeated-whitespace backtracking for `security/detect-unsafe-regex` to flag.
 */
function isBulletPrefix(before: string): boolean {
	let rest = before.replace(/^[ \t]+/, "");
	const marker = LIST_MARKER_RE.exec(rest);
	if (!marker) return false;
	rest = rest.slice(marker[0].length);
	const checkbox = CHECKBOX_RE.exec(rest);
	if (checkbox) rest = rest.slice(checkbox[0].length);
	return rest.length > 0 && rest.trim() === "";
}

/**
 * True if `[start, end)` is effectively alone on its line: nothing before it but whitespace or a
 * bare list-item marker (a bullet point "should be treated as if it's on its own line"), and
 * nothing after it but whitespace.
 */
function isAloneOrBulletOnLine(text: string, start: number, end: number): boolean {
	const { lineStart, lineEnd } = lineBoundsOf(text, start, end);
	const before = text.slice(lineStart, start);
	const after = text.slice(end, lineEnd);
	const beforeOk = before.trim() === "" || isBulletPrefix(before);
	return beforeOk && after.trim() === "";
}

/**
 * A match only gets a callout when BOTH hold: it's effectively alone on its line (own line or a
 * bullet point — not embedded mid-sentence, where inserting a block callout would corrupt the
 * surrounding text), and its translation is one we can actually fetch text for. Everything else
 * gets linked only, with no API.Bible call attempted at all.
 */
function isCalloutEligible(text: string, match: ParsedReference): boolean {
	return isAloneOrBulletOnLine(text, match.start, match.end) && isTranslationCode(match.translationCode);
}

function inlineLinkText(match: ParsedReference): string {
	return buildReflyLinks(match)
		.map((l) => `[${l.linkText}](${l.url})`)
		.join(", ");
}

/**
 * Pure async edit-planner: finds unprotected references in `text` and returns the replacement
 * edits WITHOUT touching any editor. `text` is a fragment starting at `baseOffset` in the
 * real document, so every edit's `start`/`end` are ORIGINAL-document coordinates (baseOffset
 * already added) and may be applied atomically as one change set.
 *
 * When `calloutBuilder` is provided, only "callout-eligible" matches (see `isCalloutEligible`)
 * are ever fetched or given a callout — replaced in place by the callout block(s), whose own
 * header already contains the link (matching guidelines.md's exact format, and avoiding a
 * duplicate link). Any two adjacent callout blocks this produces are normalized to have exactly
 * one blank line between them, since Obsidian only renders a `[!bible-ref]` marker as a new
 * callout when it starts a fresh blockquote block. Every other match (mid-sentence, an
 * unsupported translation, or a fetch failure) is just linked inline — no callout attempted.
 */
export async function planScripturize(
	text: string,
	baseOffset: number,
	settings: ScripturizerSettings,
	calloutBuilder?: CalloutBuilder,
): Promise<ScripturizerPlan> {
	const matches = filterUnprotected(findReferences(text, settings.defaultTranslation), computeProtectedRanges(text));

	if (matches.length === 0) {
		return { edits: [], linked: 0, calloutsInserted: 0, calloutsFailed: 0 };
	}

	const eligibleMatches = calloutBuilder ? matches.filter((m) => isCalloutEligible(text, m)) : [];
	const callouts = calloutBuilder
		? await calloutBuilder.buildCallouts(eligibleMatches, settings)
		: new Map<number, string[]>();

	const edits: Edit[] = [];
	let calloutsInserted = 0;
	let calloutsFailed = 0;

	// `matches` is in left-to-right document order (regex scan order) — tracking the end of the
	// most recently built edit lets each subsequent edit's leading-blank-line extension clamp
	// itself against it, so two adjacent callout edits can never claim overlapping ranges (see
	// the leading-extension comment below).
	let cursorFloor = 0;

	for (const match of matches) {
		const blocks = callouts.get(match.start);

		if (blocks === undefined) {
			// Not callout-eligible (or no calloutBuilder at all) — link only.
			edits.push({ start: baseOffset + match.start, end: baseOffset + match.end, text: inlineLinkText(match) });
			cursorFloor = match.end;
			continue;
		}

		if (blocks.length === 0) {
			// Eligible, but the fetch itself failed at runtime — fall back to a plain link.
			calloutsFailed++;
			edits.push({ start: baseOffset + match.start, end: baseOffset + match.end, text: inlineLinkText(match) });
			cursorFloor = match.end;
			continue;
		}

		// Replace the whole line (bullet marker included, if any) with the callout block(s).
		// Both boundaries are extended past any existing blank-line run — trailing, so a
		// following callout or plain text doesn't get merged into this one's blockquote; leading,
		// so the callout itself is visually separated from whatever precedes it — then exactly
		// one blank line is re-emitted on each side that has real content to separate from
		// (never zero, never doubled, and never at the very start/end of the document).
		const { lineStart, lineEnd } = lineBoundsOf(text, match.start, match.end);

		let consumeStart = lineStart;
		if (consumeStart > 0) {
			consumeStart--; // the newline ending the previous line
			while (consumeStart > 0 && text[consumeStart - 1] === "\n") consumeStart--;
		}
		consumeStart = Math.max(consumeStart, cursorFloor);
		const needsLeadingBlank = consumeStart > 0 && consumeStart < lineStart;

		let consumeEnd = lineEnd;
		if (consumeEnd < text.length) {
			consumeEnd++; // the line's own trailing newline
			while (text[consumeEnd] === "\n") consumeEnd++; // any further blank lines
		}

		const calloutText =
			(needsLeadingBlank ? "\n\n" : "") + blocks.join("\n\n") + (consumeEnd < text.length ? "\n\n" : "");
		edits.push({ start: baseOffset + consumeStart, end: baseOffset + consumeEnd, text: calloutText });
		cursorFloor = consumeEnd;
		calloutsInserted += blocks.length;
	}

	// Ascending order: the caller applies the whole set as ONE atomic transaction, so every
	// edit keeps its original-document coordinate validity regardless of application order
	// (a descending order only made sense for sequential replaceRange application).
	edits.sort((a, b) => a.start - b.start);

	return { edits, linked: matches.length, calloutsInserted, calloutsFailed };
}

/**
 * Thin applier over `planScripturize`: runs the pure planner, then commits every edit in ONE
 * `editor.transaction` call (a single undo step in Obsidian). Zero edits → zero transaction
 * calls, so a no-op run never leaves an empty undo step. Offsets shifted by `baseOffset`
 * (0 for a whole-note scan; the offset of a single line's start for a line-scoped scan).
 */
export async function runScripturize(
	editor: Editor,
	text: string,
	baseOffset: number,
	settings: ScripturizerSettings,
	calloutBuilder?: CalloutBuilder,
): Promise<{ linked: number; calloutsInserted: number; calloutsFailed: number }> {
	const plan = await planScripturize(text, baseOffset, settings, calloutBuilder);
	if (plan.edits.length > 0) {
		editor.transaction({
			changes: plan.edits.map((e) => ({ from: editor.offsetToPos(e.start), to: editor.offsetToPos(e.end), text: e.text })),
		});
	}
	return { linked: plan.linked, calloutsInserted: plan.calloutsInserted, calloutsFailed: plan.calloutsFailed };
}
