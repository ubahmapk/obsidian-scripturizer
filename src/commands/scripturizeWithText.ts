import { Notice, type Editor } from "obsidian";
import { planScripturize, runScripturize, type CalloutBuilder, type Edit } from "../editorOps";
import { expandSelectionFragment, mergeSelectionRanges, type SelectionRange } from "../selectionGeometry";
import { resolveBibleId } from "../bible-api/bibleIdCache";
import { fetchPassage } from "../bible-api/apiBibleClient";
import { parsePassageJson, formatCalloutBody, formatCalloutHeader } from "../bible-api/verseFormatter";
import { buildCrosswayQuery, fetchEsvPassage, validateEsvResponse, CrosswayError } from "../crossway/client";
import { parseEsvHtml } from "../crossway/passageParser";
import { formatEsvBody } from "../crossway/esvFormatter";
import { getTranslation } from "../data/translations";
import { apiBibleBookCode } from "../data/osis-codes";
import { buildReflyLinks, type ReflyLink } from "../refly/uriBuilder";
import { isTranslationCode, type TranslationCode } from "../data/translations";
import type { ParsedReference, VerseSegment } from "../parser/referenceParser";
import type { ScripturizerSettings } from "../settings";

// Small concurrency cap out of respect for API.Bible's rate limits — fetches are flattened to
// one job per (match, verse segment) pair before this cap is applied, so a compound reference
// with several segments still can't blow past the intended in-flight request limit. In
// selection mode, ranges are planned SEQUENTIALLY (each plan awaited before the next starts),
// so the cap holds per range regardless of how many selection ranges one command run scans.
const MAX_CONCURRENT_FETCHES = 3;

function buildPassageId(code: string, chapter: number, endChapter: number | undefined, segment?: VerseSegment): string {
	if (!segment) return endChapter === undefined ? `${code}.${chapter}` : `${code}.${chapter}-${code}.${endChapter}`;
	const start = `${code}.${chapter}.${segment.start}`;
	if (!segment.end) return start;
	return `${start}-${code}.${segment.endChapter ?? chapter}.${segment.end}`;
}

interface FetchJob {
	matchStart: number;
	orderIndex: number;
	raw: string;
	bookId: string;
	passageId: string;
	translationCode: TranslationCode;
	link: ReflyLink;
	chapter: number;
	/** The verse segment this job fetches — undefined for a chapter-only reference. */
	segment?: VerseSegment;
	/** Set only for a bare chapter-range reference with no verses, e.g. "Matt 5-6". */
	endChapter?: number;
}

function buildFetchJobs(matches: ParsedReference[]): FetchJob[] | { error: string } {
	const jobs: FetchJob[] = [];
	for (const match of matches) {
		const code = apiBibleBookCode(match.bookId);
		if (!code) return { error: `no API.Bible book code found for "${match.bookId}"` };

		// runScripturize only ever calls buildCallouts with callout-eligible matches, which are
		// already filtered to a supported translation — this check is a defensive backstop, not
		// the primary gate, and narrows the type for resolveBibleId below.
		if (!isTranslationCode(match.translationCode)) {
			return { error: `unsupported translation "${match.translationCode}" reached buildFetchJobs unexpectedly` };
		}
		const translationCode = match.translationCode;

		const links = buildReflyLinks(match);
		const segments = match.verseSegments.length > 0 ? match.verseSegments : [undefined];
		segments.forEach((segment, i) => {
			const link = links[i];
			if (!link) return;
			jobs.push({
				matchStart: match.start,
				orderIndex: i,
				raw: match.raw,
				bookId: match.bookId,
				passageId: buildPassageId(code, match.chapter, match.endChapter, segment),
				translationCode,
				link,
				chapter: match.chapter,
				segment,
				endChapter: match.endChapter,
			});
		});
	}
	return jobs;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array<R>(items.length);
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < items.length) {
			const i = nextIndex++;
			const item = items[i];
			if (item === undefined) continue;
			results[i] = await fn(item);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

/**
 * Fetches and formats the complete callout block (header + body) for ONE fetch job,
 * routing by its translation's engine: "crossway" goes through the ESV pipeline
 * (fetch -> guard -> parse -> format) with a per-segment query, everything else through
 * the unchanged API.Bible pipeline. Returns undefined on any fetch/parse failure — the
 * caller counts the failure, logs it, and falls back to a plain inline link.
 */
export async function buildCalloutBlocksForMatch(
	job: FetchJob,
	settings: ScripturizerSettings,
	saveSettings: () => Promise<void>,
): Promise<string | undefined> {
	const translation = getTranslation(job.translationCode);

	if (translation?.engine === "crossway") {
		const segmentRef: ParsedReference = {
			raw: job.raw,
			start: 0,
			end: 0,
			bookId: job.bookId,
			chapter: job.chapter,
			endChapter: job.endChapter,
			verseSegments: job.segment ? [job.segment] : [],
			translationCode: job.translationCode,
			translationWasExplicit: true,
		};
		const query = buildCrosswayQuery(segmentRef);
		const body = await fetchEsvPassage(query, settings.esvApiKey);
		const html = validateEsvResponse(body, segmentRef);
		const blocks = parseEsvHtml(html);
		const formatted = formatEsvBody(blocks, segmentRef);
		if (formatted.length === 0) return undefined;
		return `${formatCalloutHeader(job.link.linkText, job.link.url)}\n${formatted}`;
	}

	const bibleId = await resolveBibleId(job.translationCode, settings, saveSettings);
	const passageData = await fetchPassage(bibleId, job.passageId, settings.apiKey);
	const verses = parsePassageJson(passageData);
	const body = formatCalloutBody(verses, job.chapter);
	if (body.length === 0) return undefined;
	return `${formatCalloutHeader(job.link.linkText, job.link.url)}\n${body}`;
}

/**
 * Builds the CalloutBuilder passed to planScripturize, plus `getFailures` — a closure counter
 * the command reads AFTER the run to fire ONE aggregated fetch-failure Notice for the whole
 * run (the CalloutBuilder interface itself can't report failures; console.error stays
 * per-job here). The buildFetchJobs error Notice stays inside the builder — it's a rare
 * defensive path, not a fetch failure.
 */
function makeCalloutBuilder(saveSettings: () => Promise<void>): { builder: CalloutBuilder; getFailures: () => number } {
	let failures = 0;
	const builder: CalloutBuilder = {
		async buildCallouts(matches, settings) {
			const jobs = buildFetchJobs(matches);
			if (!Array.isArray(jobs)) {
				new Notice(`Scripturizer: ${jobs.error}`);
				return new Map();
			}

		const blocksByJob = await mapWithConcurrency(jobs, MAX_CONCURRENT_FETCHES, async (job) => {
			try {
				const block = await buildCalloutBlocksForMatch(job, settings, saveSettings);
				if (block === undefined) {
					failures++;
					console.error(`Scripturizer: failed to fetch ${job.raw} (${job.link.linkText})`);
					return undefined;
				}
				return block;
			} catch (err) {
				failures++;
				const message = err instanceof Error ? err.message : String(err);
				console.error(`Scripturizer: failed to fetch ${job.raw} (${job.link.linkText}): ${message}`);
				return undefined;
			}
		});

			const out = new Map<number, string[]>();
			jobs.forEach((job, i) => {
				const block = blocksByJob[i];
				if (block === undefined) return;
				const existing = out.get(job.matchStart) ?? [];
				existing.push(block);
				out.set(job.matchStart, existing);
			});

			return out;
		},
	};
	return { builder, getFailures: () => failures };
}

export async function scripturizeWithTextCommand(
	editor: Editor,
	settings: ScripturizerSettings,
	saveSettings: () => Promise<void>,
): Promise<void> {
	const doc = editor.getValue();
	const { builder, getFailures } = makeCalloutBuilder(saveSettings);

	// Whole-note fallback: no non-empty selection (a plain caret yields zero-width ranges
	// that mergeSelectionRanges drops).
	const selections = editor
		.listSelections()
		.map((sel): SelectionRange => {
			const anchor = editor.posToOffset(sel.anchor);
			const head = editor.posToOffset(sel.head);
			return { start: Math.min(anchor, head), end: Math.max(anchor, head) };
		});
	const merged = mergeSelectionRanges(doc, selections);

	if (merged.length === 0) {
		const result = await runScripturize(editor, doc, 0, settings, builder);
		if (result.linked === 0) {
			new Notice("Scripturizer: no new references found in this note");
		}
	} else {
		// Selection mode: plan every merged range SEQUENTIALLY (see MAX_CONCURRENT_FETCHES
		// above), then commit ALL edits from the run as ONE transaction — a single undo step.
		const combinedEdits: Edit[] = [];
		let linked = 0;
		for (const range of merged) {
			const frag = expandSelectionFragment(doc, range.start, range.end);
			const plan = await planScripturize(
				doc.slice(frag.fragmentStart, frag.fragmentEnd),
				frag.fragmentStart,
				settings,
				builder,
				[frag.windowStart, frag.windowEnd],
			);
			combinedEdits.push(...plan.edits);
			linked += plan.linked;
		}

		if (combinedEdits.length > 0) {
			editor.transaction({
				changes: combinedEdits.map((e) => ({
					from: editor.offsetToPos(e.start),
					to: editor.offsetToPos(e.end),
					text: e.text,
				})),
			});
		}
		if (linked === 0) {
			new Notice("Scripturizer: no new references found in this selection");
		}
	}
	if (getFailures() > 0) {
		new Notice(`Scripturizer: ${getFailures()} reference(s) linked but text could not be fetched (see console)`);
	}
}
