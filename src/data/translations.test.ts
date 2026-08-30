import { TRANSLATIONS, isTranslationCode, getTranslation, DEFAULT_TRANSLATION, TRANSLATION_CODES } from "./translations";

describe("translation registry with engine discriminated union", () => {
	test("includes the ESV entry on the crossway engine", () => {
		const esv = getTranslation("ESV");
		expect(esv).toBeDefined();
		expect(esv?.code).toBe("ESV");
		expect(esv?.displayName).toBe("English Standard Version");
		expect(esv?.engine).toBe("crossway");
		// A crossway entry must not carry API.Bible matchers.
		if (esv?.engine === "api-bible") {
			throw new Error("ESV must not be on the api-bible engine");
		}
	});

	test("existing API.Bible translations keep their engine and matchers", () => {
		for (const code of ["CSB", "NASB", "AMP"] as const) {
			const entry = getTranslation(code);
			expect(entry).toBeDefined();
			expect(entry?.engine).toBe("api-bible");
			if (entry?.engine === "api-bible") {
				expect(entry.bibleApiMatchers.length).toBeGreaterThan(0);
			}
		}
	});

	test("isTranslationCode accepts all fetch-supported codes including ESV", () => {
		expect(isTranslationCode("ESV")).toBe(true);
		expect(isTranslationCode("CSB")).toBe(true);
		expect(isTranslationCode("NASB")).toBe(true);
		expect(isTranslationCode("AMP")).toBe(true);
		expect(isTranslationCode("KJV")).toBe(false);
		expect(isTranslationCode("esv")).toBe(true); // case-insensitive
	});

	test("getTranslation returns undefined for unknown codes", () => {
		expect(getTranslation("KJV")).toBeUndefined();
		expect(getTranslation("NIV")).toBeUndefined();
		expect(getTranslation("")).toBeUndefined();
	});

	test("registry invariants: non-empty codes, unique, ESV present in TRANSLATIONS and TRANSLATION_CODES", () => {
		const codes = TRANSLATIONS.map((t) => t.code);
		expect(new Set(codes).size).toBe(codes.length);
		for (const t of TRANSLATIONS) expect(t.code.length).toBeGreaterThan(0);
		expect(TRANSLATION_CODES).toContain("ESV");
		expect(DEFAULT_TRANSLATION).toBe("CSB");
	});
});