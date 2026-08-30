import { Notice, type Editor } from "obsidian";
import { runScripturize, type CalloutBuilder } from "../editorOps";
import { resolveBibleId } from "../bible-api/bibleIdCache";
import { fetchPassage, ApiBibleError } from "../bible-api/apiBibleClient";
import { parsePassageJson, formatCalloutBody, formatCalloutHeader } from "../bible-api/verseFormatter";
import { apiBibleBookCode } from "../data/osis-codes";
import { buildReflyLinks, type ReflyLink } from "../refly/uriBuilder";
import { isTranslationCode, type TranslationCode } from "../data/translations";
import type { ParsedReference, VerseSegment } from "../parser/referenceParser";
import type { ScripturizerSettings } from "../settings";

// Small concurrency cap out of respect for API.Bible's rate limits — fetches are flattened to
// one job per (match, verse segment) pair before this cap is applied, so a compound reference
// with several segments still can't blow past the intended in-flight request limit.
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
	passageId: string;
	translationCode: TranslationCode;
	link: ReflyLink;
	chapter: number;
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
				passageId: buildPassageId(code, match.chapter, match.endChapter, segment),
				translationCode,
				link,
				chapter: match.chapter,
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

function makeCalloutBuilder(saveSettings: () => Promise<void>): CalloutBuilder {
	return {
		async buildCallouts(matches, settings) {
			const jobs = buildFetchJobs(matches);
			if (!Array.isArray(jobs)) {
				new Notice(`Scripturizer: ${jobs.error}`);
				return new Map();
			}

			let failures = 0;
			const blocksByJob = await mapWithConcurrency(jobs, MAX_CONCURRENT_FETCHES, async (job) => {
				try {
					const bibleId = await resolveBibleId(job.translationCode, settings, saveSettings);
					const passageData = await fetchPassage(bibleId, job.passageId, settings.apiKey);
					const verses = parsePassageJson(passageData);
					const body = formatCalloutBody(verses, job.chapter);
					return `${formatCalloutHeader(job.link.linkText, job.link.url)}\n${body}`;
				} catch (err) {
					failures++;
					const message = err instanceof ApiBibleError ? err.message : String(err);
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

			if (failures > 0) {
				new Notice(`Scripturizer: ${failures} reference(s) linked but text could not be fetched (see console)`);
			}

			return out;
		},
	};
}

export async function scripturizeWithTextCommand(
	editor: Editor,
	settings: ScripturizerSettings,
	saveSettings: () => Promise<void>,
): Promise<void> {
	const text = editor.getValue();
	const result = await runScripturize(editor, text, 0, settings, makeCalloutBuilder(saveSettings));

	if (result.linked === 0) {
		new Notice("Scripturizer: no new references found in this note");
	}
}
