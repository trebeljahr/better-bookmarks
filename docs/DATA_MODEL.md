# Data Model

The on-disk shape of everything we store. This is a contract, not an
implementation detail — code and migrations both depend on it being
stable.

## Bookmark

The central record.

```ts
type Bookmark = {
  id: string;                    // ULID. Stable across rename / re-canonicalization.
  canonicalUrl: string;          // dedup key. Output of canonicalizer.
  originalUrl: string;           // exactly what the user/Chrome gave us.
  domain: string;                // derived. eg "github.com".

  title: string;                 // human title. Defaults to <title> at capture.
  description: string;           // longer free-form text. Optional.
  note: string;                  // private user note. Optional.

  tags: string[];                // tag names, deduped, sorted.
  rating: number | null;         // 1-10. null = unrated.
  necessaryTime: number | null;  // minutes to read/watch. null = unknown.
  contentType: ContentType;      // see enum below. "unknown" by default.
  language: string | null;       // BCP-47, e.g. "en", "de". Optional.

  status: ReadStatus;            // "unread" | "reading" | "read" | "archived"
  readAt: number | null;         // epoch ms. null if never marked read.

  createdAt: number;             // epoch ms. When *we* first saw it.
  updatedAt: number;             // epoch ms. Any field change bumps this.
  capturedFrom: CaptureSource;   // "popup" | "chrome-import" | "chrome-sync"
                                 //   | "goodreads" | "pocket" | "manual"
};

type ContentType =
  | "unknown"
  | "article"
  | "paper"
  | "video"
  | "podcast"
  | "tool"
  | "library"
  | "repo"
  | "book"
  | "thread"     // Twitter/X, Reddit, HN
  | "course"
  | "reference"; // docs sites, MDN, etc

type ReadStatus = "unread" | "reading" | "read" | "archived";

type CaptureSource =
  | "popup"
  | "chrome-import"
  | "chrome-sync"
  | "goodreads"
  | "pocket"
  | "manual";
```

Notes:

- `id` is a ULID (lexicographically sortable, time-prefixed). Not the
  URL — URL can change shape under re-canonicalization.
- `canonicalUrl` is `UNIQUE`. Two records with the same canonical URL
  is a bug; merging is automatic at write time.
- `originalUrl` preserves what the user actually clicked. Useful for
  audit and for "show me what was different about this URL" UX.
- `domain` is derived but stored because it's the most common
  secondary filter and we don't want to recompute on every query.
- `tags` is a sorted deduped array of tag *names*. Tags themselves
  also exist as standalone records (see below) for metadata like
  color, description, parent tag.
- `rating`, `necessaryTime`, `language` are nullable. Null is "we
  don't know" — distinct from zero or empty string.

## Edge (connection between bookmarks)

```ts
type Edge = {
  id: string;            // ULID
  fromId: string;        // Bookmark.id
  toId: string;          // Bookmark.id
  type: EdgeType;
  note: string;          // optional context
  directed: boolean;     // true = "fromId -> toId". false = undirected.
  createdAt: number;
  source: EdgeSource;    // "manual" | "auto-domain" | "auto-tag"
                         //   | "auto-author" | "auto-text"
};

type EdgeType =
  | "related"      // generic see-also
  | "sequel"       // "part 2 of"
  | "source"       // "this cites that"
  | "rebuts"       // "this argues against that"
  | "supersedes"   // "this replaces that"
  | "translates";  // "this is a translation of that"

type EdgeSource =
  | "manual"
  | "auto-domain"
  | "auto-tag"
  | "auto-author"
  | "auto-text";
```

Auto-suggested edges are *suggestions* until the user accepts. The
storage is the same, but `source !== "manual"` edges are filtered out
of default views and shown in a "suggested connections" sidebar.

Edges are queryable in both directions. Two indexes:

- `byFrom` on `fromId`
- `byTo` on `toId`

For undirected edges (`directed === false`) we store one row and the
query layer treats it as bidirectional.

## Tag

Tags are records, not just strings.

```ts
type Tag = {
  name: string;             // PK. case-sensitive. Display-as-stored.
  parentName: string | null; // optional tag hierarchy.
  color: string | null;     // hex or null
  description: string;      // optional
  mirrorFolderId: string | null; // chrome.bookmarks folder id; null = no mirror
  createdAt: number;
};
```

The `mirrorFolderId` is what implements "tag X mirrors to Chrome
folder Y". When set, the sync service guarantees every bookmark
carrying that tag is present in that Chrome folder, and vice versa.

Tag hierarchy is *optional*. A tag without a parent is fine. A
hierarchy is useful for rollup ("AI" includes "AI/Diffusion" includes
"AI/Diffusion/Papers"). We do not enforce hierarchy depth.

## Chrome sync mapping

```ts
type ChromeMapping = {
  chromeId: string;       // chrome.bookmarks.BookmarkTreeNode.id
  bookmarkId: string;     // Bookmark.id, or null for folder rows
  isFolder: boolean;
  parentChromeId: string | null;
  lastSyncedAt: number;
  lastKnownTitle: string;
  lastKnownUrl: string;   // empty for folders
  lastKnownParentId: string | null;
};
```

Indexes: `byChromeId` (unique), `byBookmarkId`. This table is the
authoritative bridge between the two trees. If it gets corrupted we
rebuild from a full scan of `chrome.bookmarks.getTree()`.

## Search index

Stored in IndexedDB as a separate database (or a separate object
store, depending on Dexie ergonomics). Schema:

```ts
type Posting = {
  term: string;           // PK part 1. Lowercased, normalized.
  bookmarkId: string;     // PK part 2.
  field: "title" | "description" | "note" | "tag" | "domain";
  weight: number;         // for ranking
};
```

Compound primary key: `[term, bookmarkId]`. Indexes: `byTerm`,
`byBookmarkId` (the latter so we can clean up postings when a
bookmark is deleted).

## Settings (chrome.storage.local)

```ts
type Settings = {
  canonicalizationRules: RuleSet;     // overrides over the shipped defaults
  defaultRating: number;              // applied when popup opens, can be edited
  defaultNecessaryTime: number;
  defaultStatus: ReadStatus;
  syncEnabled: boolean;
  folderMirrorPolicy: "off" | "selected" | "all";
  conflictPolicy: "prefer-chrome" | "prefer-store" | "prefer-newer" | "ask";
};
```

A small subset of these (the ones that should follow the user across
devices — rule overrides, defaults) gets mirrored into
`chrome.storage.sync`.

## Migration discipline

Every schema version bump comes with:

1. A `version` field in the IndexedDB open call.
2. An upgrade function for that version that converts records in
   place.
3. A test that opens a fixture database from the previous version
   and asserts the post-migration state.

We never break the JSON export format silently. New fields are
optional and default sensibly on import; removed fields are tolerated
in old exports and ignored.

## What used to be there

The current `src/hooks/useBookmarks.ts` defines:

```ts
type Bookmark = {
  url: string;
  description: string;
  rating: number;
  necessaryTime: number;
  timestamp: number;
  tags: string[];
};
```

The migration path: every legacy record becomes a new `Bookmark`
with `originalUrl = url`, `canonicalUrl = canonicalize(url)`,
`title = description`, `description = ""`, `createdAt = timestamp`,
`updatedAt = timestamp`, `status = "unread"`, `contentType =
"unknown"`, `capturedFrom = "chrome-import"` (best guess), every
other field null/empty.

Duplicates produced by canonicalization are merged: oldest
`createdAt` wins for `createdAt`, union of `tags`, max of `rating`,
non-empty `description` wins.
