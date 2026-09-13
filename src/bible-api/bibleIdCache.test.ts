import { resolveBibleId } from "./bibleIdCache";
import { fetchEnglishBibles, type BibleCatalogEntry } from "./apiBibleClient";
import type { ScripturizerSettings } from "../settings";

jest.mock("obsidian", () => ({ Notice: class {}, requestUrl: () => Promise.resolve({ status: 200, json: {} }) }), {
	virtual: true,
});

jest.mock("./apiBibleClient", () => {
	const actual = jest.requireActual<typeof import("./apiBibleClient")>("./apiBibleClient");
	return { ...actual, fetchEnglishBibles: jest.fn() };
});

const mockFetchEnglishBibles = fetchEnglishBibles as jest.MockedFunction<typeof fetchEnglishBibles>;

function entry(overrides: Partial<BibleCatalogEntry>): BibleCatalogEntry {
	return { id: "id", abbreviation: "X", name: "X", description: null, ...overrides };
}

function freshSettings(): ScripturizerSettings {
	return { apiKey: "api-bible-key", esvApiKey: "esv-key", defaultTranslation: "CSB", bibleIdCache: {} };
}

describe("resolveBibleId", () => {
	beforeEach(() => {
		mockFetchEnglishBibles.mockReset();
	});

	test("picks the Protestant WEB edition among 4 same-named/abbreviated catalog entries", async () => {
		mockFetchEnglishBibles.mockResolvedValue([
			entry({ id: "web-ecumenical", abbreviation: "WEB", name: "World English Bible", description: "Ecumenical" }),
			entry({ id: "web-catholic", abbreviation: "WEB", name: "World English Bible", description: "Catholic" }),
			entry({ id: "web-orthodox", abbreviation: "WEB", name: "World English Bible", description: "Orthodox" }),
			entry({ id: "web-protestant", abbreviation: "WEB", name: "World English Bible", description: "Protestant" }),
		]);

		const settings = freshSettings();
		const bibleId = await resolveBibleId("WEB", settings, async () => {});

		expect(bibleId).toBe("web-protestant");
		expect(settings.bibleIdCache.WEB?.bibleId).toBe("web-protestant");
	});

	test("resolves BSB by matching name/abbreviation with no descriptionMatcher", async () => {
		mockFetchEnglishBibles.mockResolvedValue([
			entry({ id: "bsb-1", abbreviation: "BSB", name: "Berean Standard Bible", description: "Berean Standard Bible" }),
			entry({ id: "bsb-2", abbreviation: "BSB", name: "Berean Standard Bible", description: null }),
		]);

		const settings = freshSettings();
		const bibleId = await resolveBibleId("BSB", settings, async () => {});

		expect(bibleId).toBe("bsb-1");
	});

	test("resolves ASV against its full catalog name", async () => {
		mockFetchEnglishBibles.mockResolvedValue([
			entry({ id: "asv-1", abbreviation: "ASV", name: "The Holy Bible, American Standard Version" }),
		]);

		const settings = freshSettings();
		const bibleId = await resolveBibleId("ASV", settings, async () => {});

		expect(bibleId).toBe("asv-1");
	});

	test("uses the cached bibleId without calling the catalog again", async () => {
		const settings = freshSettings();
		settings.bibleIdCache.CSB = { bibleId: "cached-id", fetchedAt: Date.now() };

		const bibleId = await resolveBibleId("CSB", settings, async () => {});

		expect(bibleId).toBe("cached-id");
		expect(mockFetchEnglishBibles).not.toHaveBeenCalled();
	});
});
