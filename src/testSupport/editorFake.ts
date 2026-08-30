import type { Editor, EditorPosition } from "obsidian";

// A minimal fake Editor that mimics the subset of the CodeMirror-backed Obsidian API
// runScripturize actually uses (offsetToPos + replaceRange + transaction), backed by a
// plain mutable string. Type-only on "obsidian" so jest never pulls the runtime module
// (there is no mock for it in jest.config.mjs).
//
// The transaction shim FOLDS the change set against the ORIGINAL document coordinates:
// every offset is computed via posToOffset on the pre-change string, then the changes are
// applied DESCENDING by offset start — splicing from the end of the document backward, so
// earlier (lower-offset) edits keep their original-coordinate validity. A naive ascending
// sequential splice against the mutating string is WRONG: each splice shifts every offset
// after it and corrupts the still-unapplied lower edits.

/** Mirror of Obsidian's EditorChange ({ from, to?, text }) for the fake's public surface. */
export interface FakeEditorChange {
	from: EditorPosition;
	to?: EditorPosition;
	text: string;
}

/** One recorded editor.transaction() call, exactly as invoked (shallow-copied changes). */
export interface FakeEditorTransactionCall {
	changes: FakeEditorChange[];
}

export function makeFakeEditor(initialText: string) {
	let value = initialText;
	const transactionCalls: FakeEditorTransactionCall[] = [];

	function posToOffset(pos: EditorPosition): number {
		const lines = value.split("\n");
		let offset = 0;
		for (let i = 0; i < pos.line; i++) offset += (lines[i]?.length ?? 0) + 1;
		return offset + pos.ch;
	}

	function offsetToPos(offset: number): EditorPosition {
		const before = value.slice(0, offset).split("\n");
		return { line: before.length - 1, ch: before[before.length - 1]?.length ?? 0 };
	}

	function replaceRange(replacement: string, from: EditorPosition, to: EditorPosition): void {
		const start = posToOffset(from);
		const end = posToOffset(to);
		value = value.slice(0, start) + replacement + value.slice(end);
	}

	function transaction(tx: { changes?: FakeEditorChange[] }): void {
		transactionCalls.push({ changes: (tx.changes ?? []).map((change) => ({ ...change })) });
		const folded = (tx.changes ?? [])
			.map((change) => ({
				start: posToOffset(change.from),
				end: posToOffset(change.to ?? change.from),
				text: change.text,
			}))
			.sort((a, b) => b.start - a.start);
		for (const edit of folded) {
			value = value.slice(0, edit.start) + edit.text + value.slice(edit.end);
		}
	}

	return {
		getValue: () => value,
		offsetToPos,
		replaceRange,
		transaction,
		transactionCalls,
	} as unknown as Editor & { transactionCalls: FakeEditorTransactionCall[] };
}