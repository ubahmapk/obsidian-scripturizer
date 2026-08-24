export type TranslationCode = "CSB" | "NASB" | "AMP";

export interface TranslationEntry {
	code: TranslationCode;
	displayName: string;
	// Substrings used to match this translation against API.Bible's /v1/bibles catalog
	// (matched case-insensitively against both `abbreviation` and `name` fields).
	bibleApiMatchers: string[];
}

export const TRANSLATIONS: TranslationEntry[] = [
	{
		code: "CSB",
		displayName: "Christian Standard Bible",
		bibleApiMatchers: ["csb", "christian standard bible"],
	},
	{
		code: "NASB",
		displayName: "New American Standard Bible 2020",
		bibleApiMatchers: ["nasb2020", "nasb 2020", "new american standard bible 2020"],
	},
	{
		code: "AMP",
		displayName: "Amplified Bible",
		bibleApiMatchers: ["amp", "amplified"],
	},
];

export const DEFAULT_TRANSLATION: TranslationCode = "CSB";

export const TRANSLATION_CODES: TranslationCode[] = TRANSLATIONS.map((t) => t.code);

export function isTranslationCode(value: string): value is TranslationCode {
	return (TRANSLATION_CODES as string[]).includes(value.toUpperCase());
}
