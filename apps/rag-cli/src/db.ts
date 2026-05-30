import Database, { type Database as Db } from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

export const EMBEDDING_DIM = 768;
export const SCHEMA_VERSION = 1;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS bookmarks (
    id              TEXT PRIMARY KEY,
    canonical_url   TEXT UNIQUE NOT NULL,
    original_url    TEXT,
    domain          TEXT,
    title           TEXT,
    description     TEXT,
    note            TEXT,
    tags_json       TEXT,
    rating          INTEGER,
    status          TEXT,
    necessary_time  INTEGER,
    content_type    TEXT,
    language        TEXT,
    meta_hash       TEXT,
    crawl_status    TEXT NOT NULL DEFAULT 'pending',
    crawled_at      INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    embedded_at     INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bookmarks_domain   ON bookmarks(domain)`,
  `CREATE INDEX IF NOT EXISTS idx_bookmarks_status   ON bookmarks(status)`,
  `CREATE INDEX IF NOT EXISTS idx_bookmarks_rating   ON bookmarks(rating)`,
  `CREATE INDEX IF NOT EXISTS idx_bookmarks_updated  ON bookmarks(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_bookmarks_crawl    ON bookmarks(crawl_status)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS vec_bookmarks USING vec0(
    bookmark_id TEXT PRIMARY KEY,
    embedding   FLOAT[${EMBEDDING_DIM}]
  )`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    bookmark_id  TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    ord          INTEGER NOT NULL,
    text         TEXT NOT NULL,
    UNIQUE(bookmark_id, ord)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_bookmark ON chunks(bookmark_id)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
    chunk_id     INTEGER PRIMARY KEY,
    bookmark_id  TEXT PARTITION KEY,
    embedding    FLOAT[${EMBEDDING_DIM}]
  )`,
  `CREATE TABLE IF NOT EXISTS tag_bookmarks (
    tag           TEXT NOT NULL,
    bookmark_id   TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    PRIMARY KEY (tag, bookmark_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tag_bookmarks_tag ON tag_bookmarks(tag)`,
  `CREATE TABLE IF NOT EXISTS migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  INTEGER NOT NULL
  )`,
];

export function openDb(dbPath: string): Db {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);
  return db;
}

export function initDb(dbPath: string): Db {
  const db = openDb(dbPath);
  db.transaction(() => {
    for (const stmt of SCHEMA_STATEMENTS) db.exec(stmt);
    const applied = db
      .prepare("SELECT version FROM migrations WHERE version = ?")
      .get(SCHEMA_VERSION);
    if (!applied) {
      db.prepare("INSERT INTO migrations (version, applied_at) VALUES (?, ?)").run(
        SCHEMA_VERSION,
        Date.now(),
      );
    }
  })();
  return db;
}

export function ensureSchema(db: Db): void {
  const row = db.prepare("SELECT version FROM migrations ORDER BY version DESC LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (!row || row.version !== SCHEMA_VERSION) {
    throw new Error(
      `db schema version mismatch: expected ${SCHEMA_VERSION}, got ${row?.version ?? "none"}. ` +
        "Run `bb init` against this database path.",
    );
  }
}

export function stats(db: Db): {
  bookmarks: number;
  embedded: number;
  chunks: number;
  crawled: number;
} {
  const bookmarks = (db.prepare("SELECT COUNT(*) AS n FROM bookmarks").get() as { n: number }).n;
  const embedded = (db.prepare("SELECT COUNT(*) AS n FROM vec_bookmarks").get() as { n: number }).n;
  const chunks = (db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n;
  const crawled = (
    db.prepare("SELECT COUNT(*) AS n FROM bookmarks WHERE crawl_status = 'ok'").get() as {
      n: number;
    }
  ).n;
  return { bookmarks, embedded, chunks, crawled };
}
