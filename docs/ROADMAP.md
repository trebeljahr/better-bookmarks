# Roadmap

A phased plan from the current state of the repo to the product
described in [PHILOSOPHY.md](PHILOSOPHY.md). Each phase is shippable
and useful on its own — we are not building toward a single big-bang
release.

## Current state (snapshot, 2026-05)

- MV3 extension, React 17, MUI 5.
- `chrome.storage.local`, keyed by `url`. No indexing.
- One-way Chrome → store import via `logTree` in `overview.tsx`.
- UTM-only stripping inside `logTree`; no other canonicalization.
- Tags are free-form strings on each bookmark + a hardcoded
  suggestion list.
- No edges, no search index, no folder mirroring.
- React-window virtualization in overview.

Known issues to keep in mind while planning:

- Storage layer will hit the 10 MB quota with the full bookmark
  corpus.
- `useBookmarks` re-reads the entire store on every change event.
- `saveBookmark` runs on every effect tick in the popup (see
  `popup.tsx:58-61`), writing on every keystroke.
- No deduplication when the user bookmarks the same canonical URL
  twice.

## Phase 1 — foundations (no UI change yet)

Goal: replace the storage layer and add canonicalization without
shipping new user-visible features.

1. Add IndexedDB store and the `Bookmark` / `ChromeMapping` schemas
   from [DATA_MODEL.md](DATA_MODEL.md). Keep `chrome.storage.local`
   in place as a read-only legacy source for one release.
2. Implement the canonicalizer with the global rule set + YouTube,
   Twitter/X, Reddit, GitHub, Wikipedia, Amazon strategies. Ship
   fixture tests.
3. Write the legacy → new migration. Run once on first load,
   collapsing duplicates.
4. Refactor `useBookmarks` to read from IndexedDB. Existing UI keeps
   working unchanged.

Exit criteria: existing UI behaves the same, but the store is
IndexedDB-backed, deduped by canonical URL, and migrations work
both ways.

## Phase 2 — bidirectional Chrome sync

Goal: a bookmark created or edited anywhere shows up everywhere.

1. Sync service skeleton in the service worker. Mapping table, the
   six event handlers, the `inFlight` token mechanism.
2. Initial import path: idempotent re-run of `logTree` against the
   new store.
3. Drift reconciliation on startup.
4. Outbound writes: popup creates also write to Chrome under the
   default folder.
5. Folder-mirror policy UI in options (default: off; user opts in
   per tag).

Exit criteria: a bookmark added in plain Chrome appears in the
overview within ~1s; a bookmark added via the popup appears in the
Chrome bookmarks bar within ~1s; loop tests pass.

## Phase 3 — search

Goal: searching 20k bookmarks feels instant.

1. Inverted index store. Background indexer triggered by
   `bookmark:upserted` events.
2. Query parser: bare words, `tag:foo`, `domain:example.com`,
   `is:unread`, `rating:>=7`.
3. Ranking: recency × rating × tag-match weight.
4. New search UI in overview, replacing the per-field filters.
   Keep the per-field filters as an advanced sidebar.
5. Omnibox keyword (`bb`) wired to the same query path (see
   [DECISIONS.md](DECISIONS.md) D7 — decided to ship in P3).

Exit criteria: typing in the search box returns results inside
50ms on a 20k-bookmark corpus.

## Phase 4 — connections and graph

Goal: bookmarks gain context by linking to each other.

1. Edge store, edge service.
2. Manual "link to another bookmark" UI in the detail view.
3. Auto-suggestions with threshold `(sharedTag >= 1 AND
   sharedDomain) OR (sharedTag >= 2)`, plus text similarity on
   title/note (cheap n-gram, no embeddings yet). A numeric
   strength score rides along on each suggestion so the UI can
   rank (see [DECISIONS.md](DECISIONS.md) D13).
4. "Suggested connections" panel in the overview.
5. Graph view (optional): force-directed layout over a filtered
   subset.

Exit criteria: a bookmark detail view shows its edges and at least
three useful auto-suggestions on a typical record.

## Phase 5 — import / export breadth

Goal: data is portable in both directions.

1. Round-trip JSON export and import. Versioned format.
2. Netscape HTML export (Chrome / Firefox compatible).
3. Goodreads HTML import (the corpus we already have).
4. Pocket CSV import.
5. Raw URL list import with canonicalization.

Exit criteria: export then re-import produces a no-op; every
supported importer covers ≥ 95% of the source fields.

## Phase 6 — enrichment

Goal: metadata that fills itself in.

1. Background fetch (with explicit user opt-in) of `og:` tags,
   `<title>`, reading-time estimate via word count.
2. Content-type heuristic (paper, video, repo, …) from URL +
   `og:type`.
3. Optional: per-bookmark page snapshot for full-text search.
4. Optional: language detection.

Exit criteria: a freshly captured bookmark has reading time,
content type, and language populated within 30s without the user
doing anything.

## Phase 7 — polish

Goal: the parts we keep deferring.

1. Bulk edit in overview (multi-select, bulk tag, bulk delete).
2. Tag rename and tag merge with confirmation.
3. Conflict-resolution UI for the `"ask"` conflict policy.
4. Keyboard shortcuts throughout.
5. Visual cleanup, dark mode review, accessibility pass.
6. React 17 → 19 upgrade if it's still on 17 by then.

Exit criteria: subjective — "I want to use this for a week without
hitting a rough edge."

## Non-goals (explicitly out of roadmap)

- Mobile app of any kind.
- A hosted cloud sync service.
- LLM-based auto-tagging as a default (opt-in enrichment only).
- A reader mode / offline reading surface.
- Cross-browser support beyond what manifest v3 already gives us.

## How to pick what's next

The phases are ordered by *what unblocks the most other work*, not by
user-visible flash. Phase 1 is invisible but unblocks every later
phase. Phase 2 is what makes the product genuinely useful versus
plain Chrome. Phases 3 and 4 are where the "better" in
*Better Bookmarks* starts to earn its name.

When tempted to skip ahead, ask: does the storage layer still
support the corpus size? Does sync still work? If either answer is
no, finish the earlier phase first.
