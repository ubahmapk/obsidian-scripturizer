# Scripturizer

Detects Bible references typed as plain text in your notes, links each one to the matching
passage on [ref.ly](https://ref.ly), and — optionally — fetches the passage text from
[API.Bible](https://scripture.api.bible) or the [Crossway ESV API](https://api.esv.org)
into a `bible-ref` callout beneath it.

## What it recognizes

- `Book Chapter`, `Book Chapter:Verse`, `Book Chapter:Verse-Verse` (and the `.` separator
  variant), with or without a space between the book and chapter (`John 3:16` / `John3:16`).
- Full book names and common abbreviations, including numbered-book prefixes in several forms:
  `1 Samuel`, `1Samuel`, `I Samuel`, `First Samuel`, `1st Samuel`.
- An optional trailing translation: `Rom 8:28 NASB` or `Rom 8:28 (NASB)`. Supported
  translations: **CSB** (default), **NASB** (2020), **AMP**, **ESV** (via the
  Crossway API).

Matching is case-sensitive against each book's conventional capitalization (e.g. `Amos`, `Am`)
— this is deliberate, to avoid short abbreviations colliding with ordinary words in prose.

## Commands

- **Scripturize note (with text)** — scans the active selection when text is selected (multiple
  selections are all handled in one run and one undo step); with no selection, it scans the whole
  note as before. Each recognized reference fully inside the scanned text is replaced with a
  hyperlink, and a `> [!bible-ref]` callout with the fetched passage text is inserted immediately
  after it. References already linked or inside an existing callout are still skipped.
- **Link references only (current line)** — only looks at the line the cursor is on, and only
  inserts the hyperlink (no API.Bible call, no callout).

Both commands skip references that are already inside a Markdown link or an existing
`bible-ref` callout, so re-running them is safe.

## Setup

1. Get a free API.Bible key at https://scripture.api.bible — used for CSB, NASB, and AMP text.
2. For ESV text, get a free Crossway key at https://api.esv.org/account/create-application/
   (requires a free ESV.org account).
3. In Obsidian, open **Settings → Scripturizer** and paste your key(s) in.
4. Optionally change the default translation (used when a reference doesn't specify one).

The API keys are stored in this vault's `data.json` in plain text — Obsidian does not encrypt
plugin settings. Keep that in mind if this vault is shared or synced somewhere you don't
fully control.

## Network use and account requirements

This plugin talks to three external services:

- **[API.Bible](https://scripture.api.bible)** — the plugin makes network requests here (via
  Obsidian's `requestUrl()`) only when you run **Scripturize note (with text)**, to fetch the
  passage text for each CSB/NASB/AMP reference and to look up which translation edition to
  use. **A free API.Bible account and API key are required** for those translations —
  without one configured in settings, their fetches fail with a clear error and no request
  is made.
- **[Crossway ESV API](https://api.esv.org)** — ESV references are fetched here instead (also
  via Obsidian's `requestUrl()`). **A free Crossway (ESV) key is required** for ESV text —
  get one at https://api.esv.org/account/create-application/. ESV text carries the required
  "ESV" attribution in the callout link text; use is subject to
  [Crossway's API terms](https://api.esv.org/) (non-commercial use).
- **[ref.ly](https://ref.ly)** (a Logos Bible Software service) — the plugin never contacts
  ref.ly directly. It only *builds* a `ref.ly` URL string and inserts it as a Markdown link;
  that URL is only requested if and when you (or Obsidian's link handler) click it.

**Link references only (current line)** makes no network requests and needs no account — it
only builds the ref.ly link text.

No telemetry, analytics, or usage data is collected or transmitted by this plugin itself. Use
of API.Bible is subject to [API.Bible's own terms and privacy policy](https://scripture.api.bible);
use of the Crossway API is subject to [Crossway's terms](https://api.esv.org/).

## License

MIT — see [LICENSE](LICENSE).

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # production build + typecheck
npm test        # unit tests
npm run lint    # eslint
```
