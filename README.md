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

Load the unpacked extension from `./dist` in
`chrome://extensions/` with developer mode on.
