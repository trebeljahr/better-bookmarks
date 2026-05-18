import type { Tag } from "../../shared/types";
import { getDB } from "./db";

export async function upsertTag(input: {
  name: string;
  parentName?: string | null;
  color?: string | null;
  description?: string;
}): Promise<Tag> {
  const db = getDB();
  const now = Date.now();
  const name = input.name.trim();
  const lowercaseName = name.toLowerCase();
  return db.transaction("rw", db.tags, async () => {
    const existing = await db.tags.where("lowercaseName").equals(lowercaseName).first();
    if (existing) {
      const merged: Tag = {
        ...existing,
        parentName: input.parentName === undefined ? existing.parentName : input.parentName,
        color: input.color === undefined ? existing.color : input.color,
        description: input.description ?? existing.description,
      };
      await db.tags.put(merged);
      return merged;
    }
    const fresh: Tag = {
      name,
      lowercaseName,
      parentName: input.parentName ?? null,
      color: input.color ?? null,
      description: input.description ?? "",
      mirrorFolderId: null,
      createdAt: now,
    };
    await db.tags.put(fresh);
    return fresh;
  });
}

export async function listTags(): Promise<Tag[]> {
  return getDB().tags.orderBy("name").toArray();
}

export async function getTag(name: string): Promise<Tag | undefined> {
  return getDB().tags.where("lowercaseName").equals(name.toLowerCase()).first();
}

export async function deleteTag(name: string): Promise<void> {
  const db = getDB();
  const lowercaseName = name.toLowerCase();
  await db.transaction("rw", db.tags, db.bookmarks, async () => {
    const tag = await db.tags.where("lowercaseName").equals(lowercaseName).first();
    if (!tag) return;
    await db.tags.delete(tag.name);
    const affected = await db.bookmarks.where("tags").equals(tag.name).toArray();
    for (const b of affected) {
      const filtered = b.tags.filter((t) => t.toLowerCase() !== lowercaseName);
      await db.bookmarks.put({ ...b, tags: filtered, updatedAt: Date.now() });
    }
  });
}

export async function renameTag(oldName: string, newName: string): Promise<void> {
  const db = getDB();
  const oldLower = oldName.toLowerCase();
  const newTrimmed = newName.trim();
  const newLower = newTrimmed.toLowerCase();
  if (oldLower === newLower) return;
  await db.transaction("rw", db.tags, db.bookmarks, async () => {
    const tag = await db.tags.where("lowercaseName").equals(oldLower).first();
    if (!tag) return;
    await db.tags.delete(tag.name);
    const renamed: Tag = { ...tag, name: newTrimmed, lowercaseName: newLower };
    await db.tags.put(renamed);
    const affected = await db.bookmarks.where("tags").equals(tag.name).toArray();
    for (const b of affected) {
      const newTags = Array.from(new Set(b.tags.map((t) => (t === tag.name ? newTrimmed : t))));
      await db.bookmarks.put({ ...b, tags: newTags, updatedAt: Date.now() });
    }
  });
}

/**
 * Merge tag `from` into tag `into`.
 *
 * Every bookmark carrying `from` ends up carrying `into` (case-insensitively
 * deduped). The `from` tag record is removed. The `into` tag record is
 * created if it didn't already exist. Same-name merges are a no-op.
 *
 * Returns the number of bookmarks that were modified.
 */
export async function mergeTags(from: string, into: string): Promise<{ affected: number }> {
  const fromLower = from.toLowerCase();
  const intoTrimmed = into.trim();
  const intoLower = intoTrimmed.toLowerCase();
  if (!fromLower || !intoLower) return { affected: 0 };
  if (fromLower === intoLower) return { affected: 0 };

  const db = getDB();
  return db.transaction("rw", db.tags, db.bookmarks, async () => {
    const fromTag = await db.tags.where("lowercaseName").equals(fromLower).first();
    if (!fromTag) return { affected: 0 };

    // Ensure the destination tag exists (with default fields if new).
    const existingInto = await db.tags.where("lowercaseName").equals(intoLower).first();
    if (!existingInto) {
      const fresh: Tag = {
        name: intoTrimmed,
        lowercaseName: intoLower,
        parentName: null,
        color: fromTag.color,
        description: "",
        mirrorFolderId: null,
        createdAt: Date.now(),
      };
      await db.tags.put(fresh);
    }
    const intoName = existingInto?.name ?? intoTrimmed;

    const affected = await db.bookmarks.where("tags").equals(fromTag.name).toArray();
    for (const b of affected) {
      const withoutFrom = b.tags.filter((t) => t.toLowerCase() !== fromLower);
      const alreadyHasInto = withoutFrom.some((t) => t.toLowerCase() === intoLower);
      const next = alreadyHasInto ? withoutFrom : [...withoutFrom, intoName];
      await db.bookmarks.put({
        ...b,
        tags: Array.from(new Set(next)).sort((a, c) => a.localeCompare(c)),
        updatedAt: Date.now(),
      });
    }

    await db.tags.delete(fromTag.name);
    return { affected: affected.length };
  });
}

/**
 * Return a `{ tagName: count }` map of how many bookmarks carry each tag.
 * Useful for the tag-manager UI.
 */
export async function tagBookmarkCounts(): Promise<Record<string, number>> {
  const db = getDB();
  const all = await db.bookmarks.toArray();
  const counts: Record<string, number> = {};
  for (const b of all) {
    for (const t of b.tags) {
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return counts;
}
