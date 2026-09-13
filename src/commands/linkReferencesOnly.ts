import { Notice, type Editor } from "obsidian";
import { runScripturize } from "../editorOps";
import type { ScripturizerSettings } from "../settings";

export async function linkReferencesOnlyCommand(editor: Editor, settings: ScripturizerSettings): Promise<void> {
	const lineNum = editor.getCursor().line;
	const doc = editor.getValue();
	const lineStart = editor.posToOffset({ line: lineNum, ch: 0 });
	const lineText = editor.getLine(lineNum);

	// Scans the FULL note (baseOffset 0), not just the line's own text, so protection context
	// — existing links, `bible-ref` callout blocks, and heading lines (ATX, or a setext
	// underline that sits below the line) — behaves exactly like a whole-note run. The scan
	// window keeps the actual linking scoped to the cursor's own line: nothing outside it is
	// ever edited.
	const result = await runScripturize(editor, doc, 0, settings, undefined, [
		lineStart,
		lineStart + lineText.length,
	]);

	if (result.linked === 0) {
		new Notice("Scripturizer: no new references found on this line");
	}
}
