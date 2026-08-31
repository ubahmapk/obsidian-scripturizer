import { fetchEnglishBibles, ApiBibleError, type BibleCatalogEntry } from "./apiBibleClient";
import { TRANSLATIONS, type TranslationCode } from "../data/translations";
import type { ScripturizerSettings } from "../settings";

function matches(entry: BibleCatalogEntry, matchers: string[]): boolean {
	const name = entry.name.toLowerCase();
	const abbrev = entry.abbreviation.toLowerCase();
	return matchers.some((m) => name.includes(m.toLowerCase()) || abbrev === m.toLowerCase());
}

/**
 * Resolves a translation code to an API.Bible bibleId, using `settings.bibleIdCache` if
 * present. On a cache miss, fetches the full English catalog and matches by name/abbreviation
 * against `translations.ts`'s per-translation matcher list (API.Bible's own `abbreviation`
 * field isn't guaranteed to equal our internal code). No TTL auto-expiry — the settings tab's
 * "Refresh Bible ID cache" button is the manual escape hatch if a match ever goes stale.
 */
export async function resolveBibleId(
	code: TranslationCode,
	settings: ScripturizerSettings,
	saveSettings: () => Promise<void>,
): Promise<string> {
	const cached = settings.bibleIdCache[code];
	if (cached) return cached.bibleId;

	const translation = TRANSLATIONS.find((t) => t.code === code);
	if (!translation || translation.engine !== "api-bible") {
		throw new ApiBibleError(`Scripturizer: unknown API.Bible translation code "${code}"`, "not-found");
	}

	const catalog = await fetchEnglishBibles(settings.apiKey);
	const found = catalog.find((entry) => matches(entry, translation.bibleApiMatchers));
	if (!found) {
		throw new ApiBibleError(
			`Scripturizer: could not find an API.Bible entry matching "${translation.displayName}"`,
			"not-found",
		);
	}

	settings.bibleIdCache[code] = { bibleId: found.id, fetchedAt: Date.now() };
	await saveSettings();
	return found.id;
}

/** Clears and re-resolves the bibleId for every API.Bible-engine translation. Used by the settings tab. */
export async function refreshAllBibleIds(
	settings: ScripturizerSettings,
	saveSettings: () => Promise<void>,
): Promise<{ code: TranslationCode; ok: boolean; error?: string }[]> {
	settings.bibleIdCache = {};
	const results: { code: TranslationCode; ok: boolean; error?: string }[] = [];
	for (const translation of TRANSLATIONS) {
		if (translation.engine !== "api-bible") continue;
		try {
			await resolveBibleId(translation.code, settings, saveSettings);
			results.push({ code: translation.code, ok: true });
		} catch (err) {
			results.push({ code: translation.code, ok: false, error: err instanceof Error ? err.message : String(err) });
		}
	}
	return results;
}
