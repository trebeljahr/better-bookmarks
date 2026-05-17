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
