# Better Bookmarks

A Chrome extension for organising bookmarks the way they actually live
in your head: with tags, ratings, notes, connections, and aggressive
URL deduplication — while still staying in sync with the native Chrome
bookmarks tree so the omnibox and mobile sync keep working.

## The short version

- **Multi-category by default.** Bookmarks have tags, not folders.
  Folders are a projection on top.
- **One URL per page.** `?utm_*`, `?t=42s` on YouTube, `?s=20` on
  Twitter, and the rest of the tracking-parameter zoo never produce
  duplicates again.
- **Two-way Chrome sync.** Chrome stays the source of truth for
  URL/title/folder. Better Bookmarks adds tags, rating, reading time,
  notes, and a connection graph on top. Changes on either side mirror
  to the other within a second.
- **Search that scales.** IndexedDB-backed inverted index. Designed
  around a real-world corpus of 20k+ bookmarks.

## Install

[![Chrome Web Store — coming soon](https://img.shields.io/badge/Chrome%20Web%20Store-coming%20soon-lightgrey)](# "Placeholder — swap to the real CWS link once the listing is approved.")

Marketing site: [coming soon](# "Placeholder — will link to the deployed apps/web site.") — source lives in [`apps/web/`](apps/web/).

### Development install / unpacked from a release zip

Until the Chrome Web Store listing is live, install the extension
unpacked from a local build or a release zip:

1. Build the extension (see [Development](#development) below) or
   download the latest `.zip` from
   [Releases](https://github.com/trebeljahr/better-bookmarks/releases)
   and unpack it into a folder.
2. Open `chrome://extensions/` and turn on **Developer mode** in the
   top-right corner.
3. Click **Load unpacked** and pick the `./dist` directory (or the
   unpacked release folder).

## Design docs

The design decisions live alongside the code so future-us can read
them before changing things:

- [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md) — why this exists, the
  guiding principles, what we explicitly do *not* do.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, layers,
  module layout, data flows.
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — the on-disk schema for
  bookmarks, edges, tags, the Chrome mapping table, and settings.
- [docs/URL_NORMALIZATION.md](docs/URL_NORMALIZATION.md) — the
  canonicalization pipeline and per-domain rules.
- [docs/CHROME_SYNC.md](docs/CHROME_SYNC.md) — bidirectional sync
  semantics, loop prevention, drift recovery.
- [docs/ROADMAP.md](docs/ROADMAP.md) — phased plan from the current
  repo state to the product described above.
- [docs/DECISIONS.md](docs/DECISIONS.md) — open and provisional
  design decisions, with pros/cons and recommendations.

## Development

```sh
pnpm install
pnpm dev      # watch build into ./dist
pnpm build    # production build
pnpm check    # biome format + lint
```

Load the freshly built `./dist` as an unpacked extension — see
[Install](#install) above.
