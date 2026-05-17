import Dexie, { type EntityTable, type Table } from "dexie";
import type { Bookmark, ChromeMapping, Edge, Tag } from "../../shared/types";

export type Posting = {
  term: string;
  bookmarkId: string;
  field: "title" | "description" | "note" | "tag" | "domain";
  weight: number;
};

// Compound primary key [term+bookmarkId]. Dexie's `EntityTable` typing wants a
// single-field primary key name, so we use the lower-level `Table<Posting>`
// type which doesn't require naming a single PK field.
export type BookmarkDB = Dexie & {
  bookmarks: EntityTable<Bookmark, "id">;
  edges: EntityTable<Edge, "id">;
  tags: EntityTable<Tag, "name">;
  chromeMappings: EntityTable<ChromeMapping, "chromeId">;
  postings: Table<Posting>;
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
  cached = db;
  return db;
}

export function resetDBForTests(): void {
  if (cached) {
    cached.close();
    cached = null;
  }
}
