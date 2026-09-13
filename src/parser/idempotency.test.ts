import { computeProtectedRanges, filterUnprotected } from "./idempotency";
import { findReferences } from "./referenceParser";

describe("computeProtectedRanges + filterUnprotected", () => {
	test("skips a reference already inside a Markdown link", () => {
		const text = "[Luke 15:25–32 (CSB)](https://ref.ly/Luke15.25–32;CSB)";
		const matches = findReferences(text);
		const protectedRanges = computeProtectedRanges(text);
		expect(filterUnprotected(matches, protectedRanges)).toHaveLength(0);
	});

	test("skips references inside an existing bible-ref callout, including across blank continuation lines", () => {
		const text = [
			"> [!bible-ref] [Luke 15:25–32 (CSB)](https://ref.ly/Luke15.25–32;CSB)",
			"> **15.25** text mentioning Rom 8:28 inside the callout body",
			">",
			"> **28** more text with John 3:16 also inside",
			"",
			"Rom 8:28 is a plain-text reference outside the callout.",
		].join("\n");

		const matches = findReferences(text);
		const protectedRanges = computeProtectedRanges(text);
		const kept = filterUnprotected(matches, protectedRanges);

		expect(kept).toHaveLength(1);
		expect(kept[0]?.bookId).toBe("ROM");
		expect(text.slice(kept[0]!.start, kept[0]!.end)).toBe("Rom 8:28");
	});

	test("skips references inside a foldable `+` callout — both current and legacy header forms stay protected", () => {
		// Scripturizer emits `> [!bible-ref]+ ` (foldable) headers; older notes carry the bare
		// `> [!bible-ref] ` form. Re-running must never re-process a reference inside either.
		const text = [
			"> [!bible-ref]+ [Luke 15:25–32 (CSB)](https://ref.ly/Luke15.25–32;CSB)",
			"> **15.25** text mentioning Rom 8:28 inside the callout body",
			"",
			"> [!bible-ref] [John 3:16 (CSB)](https://ref.ly/John3.16;CSB)",
			"> **3.16** more text with Rom 8:29 also inside",
			"",
			"Rom 8:28 is a plain-text reference outside the callouts.",
		].join("\n");

		const matches = findReferences(text);
		const protectedRanges = computeProtectedRanges(text);
		const kept = filterUnprotected(matches, protectedRanges);

		expect(kept).toHaveLength(1);
		expect(text.slice(kept[0]!.start, kept[0]!.end)).toBe("Rom 8:28");
	});

	test("does not protect a plain-text reference on the same line as, but outside, an existing link", () => {
		const text = "[Luke 15:25–32](https://ref.ly/Luke15.25–32;CSB) and also John 3:16";
		const matches = findReferences(text);
		const protectedRanges = computeProtectedRanges(text);
		const kept = filterUnprotected(matches, protectedRanges);

		expect(kept).toHaveLength(1);
		expect(kept[0]?.bookId).toBe("JOHN");
	});

	test("no protected ranges leaves all matches untouched", () => {
		const text = "Luke 15:25-32 and John 3:16";
		const matches = findReferences(text);
		expect(filterUnprotected(matches, computeProtectedRanges(text))).toHaveLength(2);
	});

	test("an ATX heading line is protected whole — a reference anywhere in it is left alone (issue #5)", () => {
		const text = "## Psalm 90";
		const kept = filterUnprotected(findReferences(text), computeProtectedRanges(text));
		expect(kept).toHaveLength(0);
	});

	test("every ATX level # through ######, and a partial-reference heading, are all protected", () => {
		const lines = ["# Psalm 90", "### Notes on John 3:16", "###### Luke 15"];
		for (const line of lines) {
			const kept = filterUnprotected(findReferences(line), computeProtectedRanges(line));
			expect(kept).toHaveLength(0);
		}
	});

	test("seven hashes is a paragraph, not a heading — still linked", () => {
		const kept = filterUnprotected(findReferences("####### Psalm 90"), computeProtectedRanges("####### Psalm 90"));
		expect(kept).toHaveLength(1);
	});

	test("`#Psalm 90` with no space is a tag, not a heading — still linked", () => {
		const text = "#Psalm 90";
		const kept = filterUnprotected(findReferences(text), computeProtectedRanges(text));
		expect(kept).toHaveLength(1);
		expect(kept[0]?.raw).toBe("Psalm 90");
	});

	test("up to three leading spaces still form a heading; four do not (indented code block)", () => {
		expect(
			filterUnprotected(findReferences("   ## Psalm 90"), computeProtectedRanges("   ## Psalm 90")),
		).toHaveLength(0);
		expect(
			filterUnprotected(findReferences("    ## Psalm 90"), computeProtectedRanges("    ## Psalm 90")),
		).toHaveLength(1);
	});

	test("setext underlines (`===` and `---`) protect the paragraph above them", () => {
		expect(filterUnprotected(findReferences("Psalm 90\n==="), computeProtectedRanges("Psalm 90\n==="))).toHaveLength(0);
		expect(filterUnprotected(findReferences("Psalm 90\n---"), computeProtectedRanges("Psalm 90\n---"))).toHaveLength(0);
	});

	test("a multi-line setext heading protects references on any of its paragraph lines", () => {
		const text = "Psalm 90\nA prayer of Moses\n===";
		const kept = filterUnprotected(findReferences(text), computeProtectedRanges(text));
		expect(kept).toHaveLength(0);
	});

	test("a blank line before the dashes makes it a thematic break, not a heading — still linked", () => {
		const text = "Psalm 90\n\n---";
		const kept = filterUnprotected(findReferences(text), computeProtectedRanges(text));
		expect(kept).toHaveLength(1);
	});

	test("an `---` line inside a fenced code block is never read as a setext underline", () => {
		const text = ["Compare Psalm 90 with:", "```", "---", "```", "More text"].join("\n");
		const kept = filterUnprotected(findReferences(text), computeProtectedRanges(text));
		expect(kept).toHaveLength(1);
		expect(kept[0]?.raw).toBe("Psalm 90");
	});

	test("headings are protected but body references still link", () => {
		const text = "## Psalm 90\n\nSee also Psalm 90:1.";
		const kept = filterUnprotected(findReferences(text), computeProtectedRanges(text));
		expect(kept).toHaveLength(1);
		expect(kept[0]?.raw).toBe("Psalm 90:1");
	});
});
