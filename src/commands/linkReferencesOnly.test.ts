import type { EditorPosition } from "obsidian";
import { linkReferencesOnlyCommand } from "./linkReferencesOnly";
import { makeFakeEditor } from "../testSupport/editorFake";
import type { ScripturizerSettings } from "../settings";

jest.mock("obsidian", () => ({ Notice: class {} }), { virtual: true });

const DEFAULT_SETTINGS: ScripturizerSettings = { apiKey: "", esvApiKey: "", defaultTranslation: "CSB", bibleIdCache: {} };

function editorAt(text: string, line: number) {
	const cursor: EditorPosition = { line, ch: 0 };
	return makeFakeEditor(text, cursor);
}

describe("linkReferencesOnlyCommand", () => {
	test("a reference in an ATX heading is left alone (issue #5)", async () => {
		const editor = editorAt("## Psalm 90\n\nBody text.", 0);

		await linkReferencesOnlyCommand(editor, DEFAULT_SETTINGS);

		expect(editor.getValue()).toBe("## Psalm 90\n\nBody text.");
	});

	test("a reference in a setext heading is left alone — the underline below the cursor's line is seen", async () => {
		const editor = editorAt("Psalm 90\n===\nBody text.", 0);

		await linkReferencesOnlyCommand(editor, DEFAULT_SETTINGS);

		expect(editor.getValue()).toBe("Psalm 90\n===\nBody text.");
	});

	test("links only the cursor's own line; references on other lines are untouched", async () => {
		const doc = "John 3:16 first\nplain line\nRom 8:28 last";
		const editor = editorAt(doc, 2);

		await linkReferencesOnlyCommand(editor, DEFAULT_SETTINGS);

		expect(editor.getValue()).toBe(
			"John 3:16 first\nplain line\n[Romans 8:28 (CSB)](https://ref.ly/Rom8.28;CSB) last",
		);
	});

	test("a reference inside an existing callout body is skipped — the callout start line is now in context", async () => {
		const doc =
			"> [!bible-ref]+ [Luke 15:25 (CSB)](u)\n> **25** text with Rom 8:28 inside\nplain John 3:16 line";
		const editor = editorAt(doc, 1);

		await linkReferencesOnlyCommand(editor, DEFAULT_SETTINGS);

		expect(editor.getValue()).toBe(doc);
	});

	test("`#Psalm 90` (no space) is not a heading and still links", async () => {
		const editor = editorAt("#Psalm 90", 0);

		await linkReferencesOnlyCommand(editor, DEFAULT_SETTINGS);

		expect(editor.getValue()).toBe("#[Psalms 90 (CSB)](https://ref.ly/Ps90;CSB)");
	});
});
