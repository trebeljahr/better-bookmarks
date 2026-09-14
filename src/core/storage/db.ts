import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  Bookmark,
  ChromeMapping,
  Edge,
  PageSnapshot,
  RejectedEdgePair,
  Tag,
} from "../../shared/types";
import type { PendingConflictRow } from "../sync/pendingConflicts";

export type Posting = {
  term: string;
  bookmarkId: string;
  field: "title" | "description" | "note" | "tag" | "domain";
  weight: number;
};

/**
 * Row shape for the inverted-index store used by the frequency-scoring
 * search path. One row per (term, bookmarkId, field) triple with the
 * per-field term frequency for that bookmark. Coexists with `postings`
 * during the transition to BM25-style ranking.
 */
export type SearchIndexRow = {
  term: string;
  bookmarkId: string;
  field: "title" | "note" | "tag" | "domain" | "url";
  termFreq: number;
};

// Compound primary keys (`postings`: `[term+bookmarkId]`, `searchIndex`:
// `[term+bookmarkId+field]`). Dexie's `EntityTable` typing wants a
// single-field primary key name, so we use the lower-level `Table<T>` type
// which doesn't require naming a single PK field.
export type BookmarkDB = Dexie & {
  bookmarks: EntityTable<Bookmark, "id">;
  edges: EntityTable<Edge, "id">;
  tags: EntityTable<Tag, "name">;
  chromeMappings: EntityTable<ChromeMapping, "chromeId">;
  postings: Table<Posting>;
  searchIndex: Table<SearchIndexRow>;
  pageSnapshots: EntityTable<PageSnapshot, "bookmarkId">;
  pendingConflicts: EntityTable<PendingConflictRow, "id">;
  rejectedEdgePairs: EntityTable<RejectedEdgePair, "pair">;
};

let cached: BookmarkDB | null = null;

export function getDB(): BookmarkDB {
  if (cached) return cached;
  const db = new Dexie("better-bookmarks") as BookmarkDB;
  db.version(1).stores({
    bookmarks: "id, &canonicalUrl, domain, *tags, createdAt, updatedAt, status",
    edges: "id, fromId, toId, type",
    tags: "name, lowercaseName, parentName",
    chromeMappings: "chromeId, bookmarkId, parentChromeId",
  });
  db.version(2).stores({
    postings: "[term+bookmarkId], term, bookmarkId",
  });
  db.version(3).stores({
    searchIndex: "[term+bookmarkId+field], term, bookmarkId",
  });
  // v4: opt-in per-bookmark page snapshot (D15). One row per bookmark
  // keyed on `bookmarkId`; a fresh capture replaces the previous row.
  // `capturedAt` is indexed so future features can order/scan by
  // recency without a full table walk.
  db.version(4).stores({
    pageSnapshots: "bookmarkId, capturedAt",
  });
  // v5: pending user-resolvable conflicts (D2 `ask` fallback). One row
  // per (bookmarkId, unresolved-field-set) surfaced by `ConflictResolverModal`.
  // `bookmarkId` is indexed so the enqueue path can dedupe prior rows for
  // the same bookmark; `enqueuedAt` for ordering the queue.
  db.version(5).stores({
    pendingConflicts: "id, bookmarkId, enqueuedAt",
  });
  // v6: user-rejected edge suggestions. `pair` (PK) is
  // `"<idA>|<idB>"` with the two ids sorted lexicographically so a
  // rejection covers both directions with one row. The suggester
  // filters candidates through this table so a rejected pair never
  // resurfaces as a suggestion.
  db.version(6).stores({
    rejectedEdgePairs: "pair, createdAt",
  });
  cached = db;
  return db;
}

export function resetDBForTests(): void {
  if (cached) {
    cached.close();
    cached = null;
  }
}
