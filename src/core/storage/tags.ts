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
 * Set a tag's color. Pass `null` to clear. Preserves all other fields.
 * Throws if the tag does not exist.
 */
export async function setTagColor(name: string, color: string | null): Promise<void> {
  const db = getDB();
  const lowercaseName = name.toLowerCase();
  await db.transaction("rw", db.tags, async () => {
    const tag = await db.tags.where("lowercaseName").equals(lowercaseName).first();
    if (!tag) throw new Error(`Tag "${name}" does not exist`);
    await db.tags.put({ ...tag, color });
  });
}

/**
 * Set a tag's parent. Pass `null` to clear (root tag).
 *
 * Validates:
 *  - tag itself must exist
 *  - parent (when non-null) must exist
 *  - cannot be its own parent
 *  - cannot create a cycle (parent chain must terminate at a root)
 */
export async function setTagParent(name: string, parentName: string | null): Promise<void> {
  const db = getDB();
  const lowercaseName = name.toLowerCase();
  await db.transaction("rw", db.tags, async () => {
    const tag = await db.tags.where("lowercaseName").equals(lowercaseName).first();
    if (!tag) throw new Error(`Tag "${name}" does not exist`);

    if (parentName === null) {
      await db.tags.put({ ...tag, parentName: null });
      return;
    }

    const parentLower = parentName.toLowerCase();
    if (parentLower === lowercaseName) {
      throw new Error("A tag cannot be its own parent");
    }
    const parent = await db.tags.where("lowercaseName").equals(parentLower).first();
    if (!parent) throw new Error(`Parent tag "${parentName}" does not exist`);

    // Walk the parent chain to detect a cycle.
    const seen = new Set<string>([lowercaseName]);
    let cursor: string | null = parent.parentName;
    while (cursor !== null) {
      const cursorLower = cursor.toLowerCase();
      if (seen.has(cursorLower)) {
        throw new Error(`Cycle detected: setting "${name}" → "${parentName}" would create a cycle`);
      }
      seen.add(cursorLower);
      const next = await db.tags.where("lowercaseName").equals(cursorLower).first();
      if (!next) break;
      cursor = next.parentName;
    }

    await db.tags.put({ ...tag, parentName: parent.name });
  });
}

/**
 * Walk the parent chain for `name`, returning tags from immediate parent
 * out to root. Empty array when the tag is itself a root or unknown.
 * Safe against accidental cycles (terminates after seeing a repeat).
 */
export async function tagAncestors(name: string): Promise<Tag[]> {
  const db = getDB();
  const start = await db.tags.where("lowercaseName").equals(name.toLowerCase()).first();
  if (!start) return [];
  const chain: Tag[] = [];
  const seen = new Set<string>([start.lowercaseName]);
  let cursor: string | null = start.parentName;
  while (cursor !== null) {
    const cursorLower = cursor.toLowerCase();
    if (seen.has(cursorLower)) break;
    seen.add(cursorLower);
    const parent = await db.tags.where("lowercaseName").equals(cursorLower).first();
    if (!parent) break;
    chain.push(parent);
    cursor = parent.parentName;
  }
  return chain;
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
