import type { EsvBlock } from "./passageParser";
import type { ParsedReference } from "../parser/referenceParser";

/**
 * Renders parsed ESV blocks as the `bible-ref` callout body (everything below the header
 * line), matching the API.Bible engine's rendering conventions (verseFormatter.ts
 * formatCalloutBody): bold `{chapter.}verse` labels — chapter-qualified on the first verse
 * of each chapter, bare otherwise. A verse block's first line carries its bold label on a
 * `> ` callout line; poetry continuation lines follow as `> `-prefixed lines; paragraph
 * breaks become blank `>` separator lines. Label text (psalm superscriptions, acrostic
 * letters, speaker labels) renders as its own italic `_..._` line with NO blank lines
 * around it (user decision, 2026-08-30): a label absorbs the paragraph break before it,
 * and consecutive labels are consecutive lines.
 */
export function formatEsvBody(blocks: EsvBlock[], _ref: ParsedReference): string {
	const lines: string[] = [];
	let lastLabeledChapter: number | undefined;
	let lastParagraphIndex: number | undefined;

	for (const block of blocks) {
		if (block.kind === "label") {
			// A label absorbs the paragraph breaks on BOTH sides (no blank line above or
			// below — user decision), so the next verse never emits a separator after it.
			lines.push(`> _${block.text}_`);
			lastParagraphIndex = undefined;
			continue;
		}

		if (block.paragraphIndex !== lastParagraphIndex) {
			if (lastParagraphIndex !== undefined) lines.push(">");
			lastParagraphIndex = block.paragraphIndex;
		}

		const crossedIntoNewChapter = block.chapter !== lastLabeledChapter;
		const label = crossedIntoNewChapter ? `${block.chapter}.${block.verse}` : `${block.verse}`;
		lastLabeledChapter = block.chapter;

		// Prose: consecutive same-paragraph verse blocks flow inline on one callout line
		// (mirroring verseFormatter's `verseParts.join(" ")`), so a verse block with a
		// single line that continues the previous block's paragraph appends with a space.
		// Poetry: a block with multiple lines renders each on its own `> ` line, and a
		// single-line block right after a multi-line one starts fresh (paragraph texts
		// after poetry never inline into the poem's last line).
		const previous = lines[lines.length - 1];
		const continuesParagraph =
			block.lines.length === 1 && previous !== undefined && previous.startsWith("> ") && !previous.startsWith("> _");
		if (continuesParagraph && block.paragraphIndex === lastParagraphIndex) {
			lines[lines.length - 1] = `${previous} **${label}** ${block.lines[0] ?? ""}`;
			continue;
		}

		block.lines.forEach((line, i) => {
			const prefix = i === 0 ? `> **${label}** ` : "> ";
			lines.push(prefix + line);
		});
	}

	return lines.join("\n");
}