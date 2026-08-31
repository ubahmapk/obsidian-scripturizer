# Scripturizer Guidelines

## How Scripturizer Recognizes Scripture References

1. Scripturizer will recognize Scripture references that conform to somewhat loose conventions:

- [Book] [Chapter]
- [Book] [Chapter]-[chapter]
- [Book] [Chapter][Sep][Verse]
- [Book] [Chapter][Sep][Verse]-[verse]
- [Book] [Chapter][Sep][Verse]-[chapter][Sep][verse]
- [Book][Chapter][Sep][Verse]
- [Book][Chapter][Sep][Verse]-[verse]
- [Book][Chapter][Sep][Verse]-[chapter][Sep][verse]

[Sep] can be either a ":" or a "."

A verse range's dash can be either a plain hyphen (`-`) or an en dash (`–`) — both are
recognized equally (matching common autocorrect/smart-punctuation behavior). The en dash is
also used as the display-text separator in generated links regardless of which one appeared in
the source text; ref.ly URLs themselves always use a plain hyphen.

A range whose end side names a new chapter (e.g. `2 Cor 7.16-8.2`) or a bare chapter range with
no verses (e.g. `Matt 5-6`) is recognized as spanning chapters, and produces a link/callout that
correctly reflects both chapters. A range that reads backward (end before start, in either the
verse or the chapter position — e.g. `John 3.20-10` or `Matt 6-5`) is rejected rather than
guessed at, and is left as plain text.

A verse portion can also be a **comma-separated, discontinuous list of segments**, each of which
may itself be a single verse or a range, e.g. `Luke 15:11-13,17-20` or `John 3:16,18`. Because
ref.ly has no URL representation for a compound/discontinuous reference (a comma-separated
request either fails outright or silently collapses to the whole chapter), each segment is
treated as an independent reference: it gets its own ref.ly link (and, when eligible, its own
callout), placed where the original combined text was. For example, `Luke 15:11-13,17-20 (CSB)`
produces two separate links/callouts, one for `11-13` and one for `17-20`, not one link covering
both.

2. Where [Book] can be a full name or an abbreviation, with prefix as applicable. Note that prefixes can be in several formats:

- 1, 2, 3
- I, II, II
- First, Second, Third
- 1st, 2nd, 3rd

3. Scripturizer will recognize most common book abbreviations.

- NOTE: All abbreviated references to Judges should include the letter 'g' in order to differentiate between Judges and Jude.

4. Scripturizer can also recognize translation acronyms following Scripture references:

- [Reference] [Translation]
- [Reference] ([Translation])

## How Scripturizer Determines Scripture Translation

1. If no translation reference is found, Scripturizer uses the default translation (CSB, unless specified as otherwise by user in the plugin preferences)
2. Scripturizer recognizes any 2-6 consecutive uppercase letters in the translation position (bare or parenthesized) as a translation acronym — not just a curated list — so an unfamiliar code (e.g. `ESV`, `NIV`, `KJV`) is still linked correctly with that translation.
3. Only a subset of recognized translations can actually have their verse text fetched and inserted into a callout:

- CSB (Christian Standard Bible) — via API.Bible
- NASB (New American Standard Bible 2020) — via API.Bible
- AMP (Amplified Version) — via API.Bible
- ESV (English Standard Version) — via the Crossway API, which requires its own free API key

A reference whose translation is recognized but **not** one of these four is still linked (and,
if otherwise eligible, would have gotten a callout) — but no fetch is attempted, and no
callout is inserted; the reference is left as a link only. Fetch-translation support may
be expanded in future versions.

## Bible Content

Scripture text should be retrieved from API.Bible, which requires an API key. I think that key should be stored in the plugin preferences -- and definitely not hard coded -- but I'm open to suggestions.

The API is documented at https://api.bible/api-reference

ESV text is fetched from Crossway's own API (https://api.esv.org) instead, which requires its own free API key (https://api.esv.org/account/create-application/).

For ESV callouts, any pre-verse label text Crossway provides — psalm superscriptions ("A Psalm of David..."), acrostic letters ("Aleph", "Beth"), and speaker labels ("She", "Others") — is rendered on its own italic line, immediately below the passage reference/link and immediately above the verse text it introduces, with no blank lines around it. Poetry line breaks inside a verse are preserved as separate lines, faithful to the source formatting.

## Logos References

The end result of a verse will follow this pattern:

> [!bible-ref]+ [Luke 15:25–32 (CSB)](https://ref.ly/Luke15.25–32;CSB)
> **15.25** “Now his older son was in the field; as he came near the house, he heard music and dancing. **26** So he summoned one of the servants, questioning what these things meant. **27** ‘Your brother is here,’ he told him, ‘and your father has slaughtered the fattened calf because he has him back safe and sound.’
>
> **28** “Then he became angry and didn’t want to go in. So his father came out and pleaded with him. **29** But he replied to his father, ‘Look, I have been slaving many years for you, and I have never disobeyed your orders, yet you never gave me a goat so that I could celebrate with my friends. **30** But when this son of yours came, who has devoured your assets with prostitutes, you slaughtered the fattened calf for him.’
>
> **31** “ ‘Son,’ he said to him, ‘you are always with me, and everything I have is yours. **32** But we had to celebrate and rejoice, because this brother of yours was dead and is alive again; he was lost and is found.’ ”

Where the reference and verse text are in a Markdown callout ("bible-ref" class). The each verse number is in bold, and the first verse number includes the chapter number, too. Spacing between paragraphs should be maintained when present in the source text.

The Ref.ly format can be found at https://ref.ly/

### When a callout is generated

A callout (with fetched verse text) is only ever inserted for a reference that satisfies BOTH:

1. **It is effectively alone on its line** — nothing else on the line but whitespace, or the
   reference is a bullet-point/numbered-list item (a bullet point is treated as if it were on its
   own line). A reference embedded mid-sentence, alongside other text, never gets a callout.
2. **Its translation is one Scripturizer can fetch text for** (CSB, NASB, or AMP — see "How
   Scripturizer Determines Scripture Translation" above).

When a reference is alone on its line (or a bullet point) and callout-eligible, the reference
text itself is replaced entirely by the callout block — the callout's own header line is the
link, so there is never a separate standalone link immediately above/below a callout for the same
reference.

Any reference that fails either condition — mid-sentence placement, or an unsupported/unfetchable
translation — is replaced with a plain Markdown link only. No API.Bible fetch is attempted for
it at all.

A compound (comma-separated) reference produces one independent link, and where eligible one
independent callout, per segment (see the comma-separated-list note above) — not one combined
link/callout.

### Spacing around callouts

Obsidian only renders a `[!bible-ref]` marker as a new callout when it starts a fresh blockquote
block — a single newline is not enough to separate it from surrounding content or from another
callout. The same spacing rules apply when Scripturizer runs on a selection rather than the whole
note. Scripturizer normalizes spacing accordingly whenever it inserts a callout:

- Exactly one blank line is inserted **before** the callout, separating it from whatever
  precedes it (a heading, plain text, another callout, etc.) — unless the callout is the very
  first line of the note, or the gap has already been claimed by a preceding callout's own
  trailing normalization.
- Exactly one blank line is inserted **after** the callout, separating it from whatever follows —
  unless the callout is at the very end of the note.
- An existing blank line already in that position is left as-is (never doubled).

This means two references on adjacent lines, once scripturized, each render as their own separate
callout with exactly one blank line between them.

### Chapter-crossing references

A reference whose range crosses into a new chapter shows both chapters in the link text and the
ref.ly URL (chapter repeated only on the end side), and the callout body includes a fresh
`**{chapter}.{verse}**` label at the first verse of each chapter it covers, not just the very
first verse overall:

> [!bible-ref]+ [2 Corinthians 7:16–8:2 (CSB)](https://ref.ly/2Cor7.16-8.2;CSB)
> **7.16** I rejoice that I have complete confidence in you.
>
> **8.1** We want you to know, brothers and sisters, about the grace of God that was given to the churches of Macedonia: **2** During a severe trial brought about by affliction, their abundant joy and their extreme poverty overflowed in a wealth of generosity on their part.

A bare chapter range with no verses (e.g. `Matt 5-6`) follows the same chapter-repeated-on-the-end
pattern without a verse component: `[Matthew 5-6 (CSB)](https://ref.ly/Matt5-6;CSB)`.
