export type TranslationCode = "CSB" | "NASB" | "AMP" | "ESV" | "BSB" | "ASV" | "WEB";

/** Translation whose verse text is fetched from API.Bible (scripture.api.bible). */
export interface ApiBibleTranslationEntry {
	code: TranslationCode;
	displayName: string;
	engine: "api-bible";
	// Substrings used to match this translation against API.Bible's /v1/bibles catalog
	// (matched case-insensitively against both `abbreviation` and `name` fields).
	bibleApiMatchers: string[];
	// When multiple catalog entries share the same abbreviation/name (e.g. API.Bible lists
	// separate Protestant/Catholic/Orthodox/Ecumenical editions of the WEB), this narrows the
	// match to entries whose `description` field contains this substring (case-insensitive).
	descriptionMatcher?: string;
}

/** Translation whose verse text is fetched from Crossway's own ESV API (api.esv.org). */
export interface CrosswayTranslationEntry {
	code: TranslationCode;
	displayName: string;
	engine: "crossway";
}

export type TranslationEntry = ApiBibleTranslationEntry | CrosswayTranslationEntry;

export const TRANSLATIONS: TranslationEntry[] = [
	{
		code: "CSB",
		displayName: "Christian Standard Bible",
		engine: "api-bible",
		bibleApiMatchers: ["csb", "christian standard bible"],
	},
	{
		code: "NASB",
		displayName: "New American Standard Bible 2020",
		engine: "api-bible",
		bibleApiMatchers: ["nasb2020", "nasb 2020", "new american standard bible 2020"],
	},
	{
		code: "AMP",
		displayName: "Amplified Bible",
		engine: "api-bible",
		bibleApiMatchers: ["amp", "amplified"],
	},
	{
		code: "ESV",
		displayName: "English Standard Version",
		engine: "crossway",
	},
	{
		code: "BSB",
		displayName: "Berean Standard Bible",
		engine: "api-bible",
		bibleApiMatchers: ["bsb", "berean standard bible"],
	},
	{
		code: "ASV",
		displayName: "American Standard Version",
		engine: "api-bible",
		bibleApiMatchers: ["asv", "american standard version"],
	},
	{
		code: "WEB",
		displayName: "World English Bible",
		engine: "api-bible",
		bibleApiMatchers: ["web", "world english bible"],
		descriptionMatcher: "protestant",
	},
];

export const DEFAULT_TRANSLATION: TranslationCode = "CSB";

export const TRANSLATION_CODES: TranslationCode[] = TRANSLATIONS.map((t) => t.code);

export function isTranslationCode(value: string): value is TranslationCode {
	return (TRANSLATION_CODES as string[]).includes(value.toUpperCase());
}

export function getTranslation(code: string): TranslationEntry | undefined {
	return TRANSLATIONS.find((t) => t.code === code.toUpperCase());
}
