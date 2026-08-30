import type { EditorPosition } from "obsidian";
import { makeFakeEditor } from "./editorFake";

// No obsidian runtime import beyond the type above — the fake is type-only on "obsidian"
// so jest never pulls the real module (there is no mock for it in jest.config.mjs).

function pos(line: number, ch: number): EditorPosition {
	return { line, ch };
}

describe("makeFakeEditor transaction shim", () => {
	test("one transaction with two changes equals two descending replaceRange calls on the same edits", () => {
		const initial = "alpha heading\nRom 8:28 mid text\ntrailing line\n2 Corinthians 7:10 end";
		const lowEdit = {
			from: pos(1, 0),
			to: pos(1, 8),
			text: "[Rom 8:28 (CSB)](https://ref.ly/Rom8.28;CSB)",
		};
		const highEdit = {
			from: pos(3, 0),
			to: pos(3, 18),
			text: "[2 Corinthians 7:10 (CSB)](https://ref.ly/2Cor7.10;CSB)",
		};
		const expected =
			"alpha heading\n[Rom 8:28 (CSB)](https://ref.ly/Rom8.28;CSB) mid text\ntrailing line\n" +
				"[2 Corinthians 7:10 (CSB)](https://ref.ly/2Cor7.10;CSB) end";

		// Reference behavior: two descending-order replaceRange calls (higher offset first,
		// so the earlier edit's original coordinates stay valid against the mutated string).
		const stepped = makeFakeEditor(initial);
		stepped.replaceRange(highEdit.text, highEdit.from, highEdit.to);
		stepped.replaceRange(lowEdit.text, lowEdit.from, lowEdit.to);

		// Same edits via one transaction, changes listed in the OTHER order — the fold must
		// use original coordinates regardless of the order they appear in the array.
		const batched = makeFakeEditor(initial);
		batched.transaction({ changes: [lowEdit, highEdit] });

		expect(batched.getValue()).toBe(stepped.getValue());
		expect(batched.getValue()).toBe(expected);
	});

	test("transactionCalls records exactly one entry per transaction call, with changes shallow-copied", () => {
		const editor = makeFakeEditor("static world text");
		const changes = [{ from: pos(0, 7), to: pos(0, 12), text: "there" }];

		expect(editor.transactionCalls).toHaveLength(0);

		editor.transaction({ changes });

		expect(editor.transactionCalls).toHaveLength(1);
		expect(editor.transactionCalls[0]?.changes).toEqual(changes);
		expect(editor.transactionCalls[0]?.changes).not.toBe(changes);
		expect(editor.getValue()).toBe("static there text");

		editor.transaction({ changes: [{ from: pos(0, 0), text: "> " }] });
		expect(editor.transactionCalls).toHaveLength(2);
		expect(editor.transactionCalls[1]?.changes).toEqual([{ from: pos(0, 0), text: "> " }]);
		expect(editor.getValue()).toBe("> static there text");
	});

	test("offsetToPos keeps its original multi-line semantics (posToOffset round-trip via replaceRange)", () => {
		const editor = makeFakeEditor("alpha\nbeta\ngamma");

		expect(editor.offsetToPos(0)).toEqual(pos(0, 0));
		expect(editor.offsetToPos(5)).toEqual(pos(0, 5));
		expect(editor.offsetToPos(6)).toEqual(pos(1, 0));
		expect(editor.offsetToPos(9)).toEqual(pos(1, 3));
		expect(editor.offsetToPos(10)).toEqual(pos(1, 4));
		expect(editor.offsetToPos(11)).toEqual(pos(2, 0));

		// Round-trip: positions derived from offsets splice back to exactly that offset range.
		const roundTrip = makeFakeEditor("alpha\nbeta\ngamma");
		roundTrip.replaceRange("X", roundTrip.offsetToPos(6), roundTrip.offsetToPos(10));
		expect(roundTrip.getValue()).toBe("alpha\nX\ngamma");
	});

	test("a two-change non-overlapping transaction folds to the exact expected document", () => {
		const editor = makeFakeEditor("first line\nRom 8:28 here\nthird line\nJohn 3:16 there\nfifth line");

		editor.transaction({
			changes: [
				{ from: pos(1, 0), to: pos(1, 8), text: "ROM_LINKED" },
				{ from: pos(3, 0), to: pos(3, 9), text: "JOHN_LINKED" },
			],
		});

		expect(editor.getValue()).toBe(
			"first line\nROM_LINKED here\nthird line\nJOHN_LINKED there\nfifth line",
		);
	});
});