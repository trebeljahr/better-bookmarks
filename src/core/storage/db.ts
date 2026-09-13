import Dexie, { type EntityTable, type Table } from "dexie";
import type { Bookmark, ChromeMapping, Edge, Tag } from "../../shared/types";

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
  cached = db;
  return db;
}

export function resetDBForTests(): void {
  if (cached) {
    cached.close();
    cached = null;
  }
}
