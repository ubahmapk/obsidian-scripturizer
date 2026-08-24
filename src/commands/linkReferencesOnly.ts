import { Notice, type Editor } from "obsidian";
import { runScripturize } from "../editorOps";
import type { ScripturizerSettings } from "../settings";

export async function linkReferencesOnlyCommand(editor: Editor, settings: ScripturizerSettings): Promise<void> {
	const lineNum = editor.getCursor().line;
	const lineText = editor.getLine(lineNum);
	const baseOffset = editor.posToOffset({ line: lineNum, ch: 0 });

	const result = await runScripturize(editor, lineText, baseOffset, settings);

	if (result.linked === 0) {
		new Notice("Scripturizer: no new references found on this line");
	}
}
