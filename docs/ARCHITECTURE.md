# Architecture

A bird's-eye view of how the pieces fit together. For schema details
see [DATA_MODEL.md](DATA_MODEL.md), for sync semantics see
[CHROME_SYNC.md](CHROME_SYNC.md), for URL rules see
[URL_NORMALIZATION.md](URL_NORMALIZATION.md).

## High-level layers

```
+-----------------------------------------------------------+
|  UI surfaces                                              |
|  - popup.html       (capture, edit, quick-tag)            |
|  - overview.html    (search, browse, bulk edit, import)   |
|  - options.html     (rules, sync settings, exports)       |
+----------------------------+------------------------------+
                             |
+----------------------------v------------------------------+
|  Core engine (runs in service worker AND in pages)        |
|  - canonicalizer    (pure URL -> canonical URL)           |
|  - bookmark service (CRUD on the bookmark store)          |
|  - tag service      (tag CRUD + folder mirror policy)     |
|  - graph service    (edges between bookmarks)             |
|  - search service   (index + query)                       |
|  - sync service     (Chrome <-> store, in both directions)|
|  - import/export    (HTML, JSON, CSV)                     |
+----------------------------+------------------------------+
                             |
+----------------------------v------------------------------+
|  Storage                                                  |
|  - IndexedDB        (bookmarks, edges, tags, sync map)    |
|  - chrome.storage.local  (settings, canonicalization rules)|
|  - chrome.storage.sync   (cross-device settings only)     |
|  - chrome.bookmarks (read/write the Chrome tree)          |
+-----------------------------------------------------------+
```

The bookmark service is the only thing UI code calls. It in turn
calls the canonicalizer, hits storage, and emits change events that
the sync service listens to.

## Why these choices

### IndexedDB, not chrome.storage.local

`chrome.storage.local` has a 10 MB default quota and no real indexing.
20k bookmarks × a few hundred bytes of metadata each lands us right at
that limit before we add edges, search index, or page snapshots.

`unlimitedStorage` permission removes the quota but the API is still
key/value with no secondary indexes — every "find by tag" or
"find by domain" becomes a full scan of `getAll(null)`. That is what
the current `useBookmarks` hook does today and it will not scale.

We use IndexedDB (via Dexie or a thin wrapper) for the bookmark store
and the edge store. Indexes we need from day one:

- `canonicalUrl` (unique) — dedup and lookup
- `domain` — domain pivot in search
- `tags` (multiEntry) — tag query
- `dateAdded` — sort by recency
- `chromeId` — fast reverse lookup during sync

`chrome.storage.local` stays for settings and the live canonicalization
rule file. `chrome.storage.sync` stays for small cross-device settings
(rule overrides, default ratings). The bulk store does not sync via
Chrome — see [PHILOSOPHY.md](PHILOSOPHY.md#7-search-has-to-be-honest-about-scale).

### Service worker, not persistent background

MV3 mandates service workers. The sync service registers listeners
on `chrome.bookmarks.onCreated`, `onChanged`, `onRemoved`, `onMoved`
and on `chrome.storage.onChanged`. Heavy work (search indexing, import
parsing) happens in offscreen documents or in chunked idle callbacks
so we never hold the worker awake longer than necessary.

The popup and overview pages talk to the service worker via
`chrome.runtime.sendMessage` for anything that needs a single owner
(e.g. running an import, rebuilding the index). Direct reads from
IndexedDB are fine from any page — concurrent reads are safe.

### One canonicalizer, multiple callers

The canonicalizer is a pure function `(url, rules) -> canonicalUrl`.
Same input always yields same output. It runs in three places:

1. At capture time, in the popup, to compute the dedup key before
   writing.
2. In the sync service, when a Chrome bookmark event fires, to map
   the inbound URL to our keys.
3. In a one-shot migration job, to re-canonicalize the whole store
   after a rule change.

Rules live in a JSON file shipped with the extension plus a user
override layer in `chrome.storage.sync`. Per-domain rules are
strategy objects (`youtube`, `twitter`, `reddit`, `github`, …); the
default rule strips a global tracking-parameter blacklist and
normalizes the host.

### Search: IndexedDB-backed inverted index

We build an inverted index keyed by lowercased term, where each
posting points to a bookmark id. The index is itself an IndexedDB
store so it survives service-worker death. The query path is:

1. Tokenize the query (title/note/tag tokens, plus prefix-matched
   domain or tag tokens).
2. Look up postings for each token.
3. Intersect, rank by recency + rating, return top N.

Live filter mode (the current `Overview` UI does this) stays
available for small subsets after a tag/domain filter narrows the
candidate set. Full-text on saved page bodies is a v2 problem and
gates on whether we ever snapshot pages.

### Sync: event-driven, with a mapping table

The Chrome tree and our store are linked by a `chromeBookmarkId ↔
canonicalUrl` mapping table in IndexedDB. On every Chrome event we
look up the mapping, decide create/update/delete on our side, and
write. On every write of our own we apply the same change to the
Chrome tree, *with an in-flight flag* so we don't echo our own event
back into a loop.

Folders mirror selected tags (user opt-in per tag). Newly-added
Chrome folders show up as new tags. We never delete user data
silently — destructive sync actions (remove a Chrome bookmark whose
canonical URL we still want, remove a tag still attached to
bookmarks) prompt the user before taking effect.

See [CHROME_SYNC.md](CHROME_SYNC.md) for the full state machine.

## Module layout

Proposed file tree (informational, the implementation can shuffle):

```
src/
  background.ts                  service worker entry; wires listeners
  core/
    canonicalizer/
      index.ts                   public API
      rules.ts                   default rule set
      youtube.ts                 per-domain strategies
      twitter.ts
      reddit.ts
      github.ts
    storage/
      db.ts                      IndexedDB schema + opening
      bookmarks.ts               CRUD for bookmarks
      edges.ts                   CRUD for connections
      tags.ts                    tag operations
      settings.ts                chrome.storage wrapper
    sync/
      chromeSync.ts              bookmarks API <-> store
      mapping.ts                 chromeId <-> canonicalUrl table
      folderMirror.ts            tag <-> folder mirror policy
    search/
      index.ts                   inverted index
      query.ts                   query parsing + ranking
    importExport/
      importChromeHtml.ts
      importGoodreadsHtml.ts
      importPocketCsv.ts
      exportJson.ts
      exportHtml.ts
  ui/
    popup.tsx                    capture surface
    overview.tsx                 browse + search
    options.tsx                  settings
    components/                  shared MUI components
    hooks/                       useBookmarks, useTags, useSearch, ...
  shared/
    types.ts                     shared TS types (Bookmark, Edge, ...)
    events.ts                    runtime message protocol
```

The current `src/hooks/useBookmarks.ts` becomes a thin wrapper over
`core/storage/bookmarks.ts` so existing UI keeps working through the
migration.

## Data flow examples

### Saving a bookmark from the popup

1. Popup reads the active tab URL + title.
2. Popup calls `canonicalizer(url)` → `canonicalUrl`.
3. Popup calls `bookmarkService.upsert({canonicalUrl, originalUrl,
   title, tags, rating, note, timestamp})`.
4. Bookmark service writes to IndexedDB, emits `bookmark:upserted`.
5. Sync service hears the event, finds (or creates) the matching
   Chrome bookmark, writes back to the Chrome tree with the
   in-flight flag set.
6. Search service hears the event, updates the inverted index.
7. Popup updates icon (full vs. empty) and closes.

### Chrome bookmark created externally (e.g. mobile sync, manual
bookmark in the bar)

1. `chrome.bookmarks.onCreated` fires in the service worker.
2. Sync service computes `canonicalUrl` from the inbound URL.
3. Sync service looks up the canonical URL in the bookmark store.
   - Hit: update the mapping table; no new bookmark.
   - Miss: create a new bookmark with the parent folder as a tag,
     minimal metadata.
4. Bookmark service writes; search service indexes; mapping table
   gets the `chromeId`.

### Editing a tag in the overview

1. UI calls `tagService.rename("AI Tools", "AI")`.
2. Tag service rewrites the tag on every affected bookmark.
3. For each bookmark whose tag has a folder mirror, the sync service
   moves it to the renamed folder (or creates the new folder).
4. Search index updates the tag postings.

## Testing strategy

- Canonicalizer: pure-function tests, table-driven. The rule set is
  exhaustive and frozen; new rules add new rows.
- Storage: in-memory IndexedDB shim (fake-indexeddb) for unit tests.
- Sync: a test harness that fakes `chrome.bookmarks` events and
  asserts the final state of both stores. Loop-prevention is the
  most important property to test.
- Import/export: round-trip tests — export then re-import should be
  a no-op modulo unsupported fields.

## Open architecture questions

These are deliberately unresolved and should be decided in code
before they ossify:

1. Dexie vs. hand-rolled IndexedDB wrapper. Dexie is the obvious
   choice; the only reason to avoid it is bundle size in MV3.
2. Whether to use a separate `dist/` chunk for the service worker or
   ship a single bundle. Webpack config currently does single bundle.
3. React 17 stays or upgrade to 19. The MUI version we're on works
   with both. Upgrade is cheap if we're touching this anyway.
4. Whether to expose an omnibox keyword (e.g. `bb`) for searching
   bookmarks from the address bar. Cheap to add, useful for power
   users.
