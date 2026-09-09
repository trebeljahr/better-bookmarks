/**
 * Thin transactional API for bulk operations across many bookmarks.
 *
 * Both operations run inside a single Dexie `rw` transaction. Chunking exists
 * so that a very large id list doesn't blow the `where("id").anyOf(...)` IDB
 * key path and so that a caller (or a test) can hook progress between chunks.
 * Any throw from the transaction callback — including one from `onChunk` —
 * aborts the whole transaction, so partial writes never survive.
 */
import { dedupTags } from "../storage/bookmarks";
import { getDB } from "../storage/db";

export type BulkOpts = {
  /**
   * Number of ids processed per underlying `bulkPut` / `bulkDelete` call.
   * Progress callback fires between chunks. Defaults to 500 — small enough
   * to keep IDB key arrays cheap, big enough to keep round-trips down.
   */
  chunkSize?: number;
  /** Called after each chunk is written. Throwing here aborts the whole tx. */
  onChunk?: (processed: number) => void | Promise<void>;
};

const DEFAULT_CHUNK = 500;

export async function bulkAddTag(
  ids: readonly string[],
  tag: string,
  opts: BulkOpts = {},
): Promise<{ updated: number }> {
  const trimmed = tag.trim();
  if (!trimmed) throw new Error("bulkAddTag: tag must be non-empty");
  if (ids.length === 0) return { updated: 0 };

  const db = getDB();
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK;
  const now = Date.now();
  let updated = 0;

  await db.transaction("rw", db.bookmarks, async () => {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const batch = ids.slice(i, i + chunkSize);
      const records = await db.bookmarks
        .where("id")
        .anyOf(batch as string[])
        .toArray();
      const transformed = records.map((b) => ({
        ...b,
        tags: dedupTags([...b.tags, trimmed]),
        updatedAt: now,
      }));
      if (transformed.length > 0) {
        await db.bookmarks.bulkPut(transformed);
      }
      updated += transformed.length;
      if (opts.onChunk) {
        await opts.onChunk(Math.min(i + batch.length, ids.length));
      }
    }
  });

  return { updated };
}

export async function bulkDelete(
  ids: readonly string[],
  opts: BulkOpts = {},
): Promise<{ deleted: number }> {
  if (ids.length === 0) return { deleted: 0 };

  const db = getDB();
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK;
  let deleted = 0;

  await db.transaction("rw", db.bookmarks, async () => {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const batch = ids.slice(i, i + chunkSize);
      // Count what's actually present before deleting so the return value
      // reflects real work, not just the input size.
      const present = await db.bookmarks
        .where("id")
        .anyOf(batch as string[])
        .primaryKeys();
      await db.bookmarks.bulkDelete(batch as string[]);
      deleted += present.length;
      if (opts.onChunk) {
        await opts.onChunk(Math.min(i + batch.length, ids.length));
      }
    }
  });

  return { deleted };
}
