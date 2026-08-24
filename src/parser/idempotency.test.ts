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
});
