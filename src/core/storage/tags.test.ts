import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upsertBookmark } from "./bookmarks";
import { getDB, resetDBForTests } from "./db";
import {
  deleteTag,
  getTag,
  listTags,
  mergeTags,
  renameTag,
  tagBookmarkCounts,
  upsertTag,
} from "./tags";

beforeEach(async () => {
  const db = getDB();
  await db.tags.clear();
  await db.bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
});

describe("upsertTag", () => {
  it("creates and round-trips", async () => {
    const tag = await upsertTag({ name: "AI" });
    expect(tag.name).toBe("AI");
    expect(tag.lowercaseName).toBe("ai");
    expect(tag.parentName).toBe(null);
    const fetched = await getTag("ai");
    expect(fetched?.name).toBe("AI");
  });

  it("is case-insensitive on lookup", async () => {
    await upsertTag({ name: "AI" });
    const updated = await upsertTag({ name: "ai", description: "edited" });
    expect(updated.name).toBe("AI");
    expect(updated.description).toBe("edited");
    expect((await listTags()).length).toBe(1);
  });
});

describe("renameTag", () => {
  it("renames + rewrites bookmark tags", async () => {
    await upsertTag({ name: "Old" });
    const b = await upsertBookmark({ rawUrl: "https://example.com/a", tags: ["Old"] });
    expect(b.ok).toBe(true);
    await renameTag("Old", "New");
    const tags = (await listTags()).map((t) => t.name);
    expect(tags).toEqual(["New"]);
    const db = getDB();
    const all = await db.bookmarks.toArray();
    expect(all[0].tags).toEqual(["New"]);
  });

  it("no-ops when same name (case-insensitive)", async () => {
    await upsertTag({ name: "Foo" });
    await renameTag("Foo", "FOO");
    expect((await listTags())[0].name).toBe("Foo");
  });
});

describe("mergeTags", () => {
  it("merges into destination, preserving bookmarks", async () => {
    await upsertTag({ name: "Old" });
    await upsertTag({ name: "New" });
    await upsertTag({ name: "Other" });
    const b1 = await upsertBookmark({ rawUrl: "https://example.com/a", tags: ["Old"] });
    const b2 = await upsertBookmark({ rawUrl: "https://example.com/b", tags: ["Old", "Other"] });
    expect(b1.ok && b2.ok).toBe(true);
    const r = await mergeTags("Old", "New");
    expect(r.affected).toBe(2);
    const tags = (await listTags()).map((t) => t.name).sort();
    expect(tags).toEqual(["New", "Other"]);
    const db = getDB();
    const all = await db.bookmarks.toArray();
    const a = all.find((b) => b.canonicalUrl === "https://example.com/a");
    const b = all.find((b) => b.canonicalUrl === "https://example.com/b");
    expect(a?.tags).toEqual(["New"]);
    expect(b?.tags?.sort()).toEqual(["New", "Other"]);
  });

  it("creates destination tag if missing", async () => {
    await upsertTag({ name: "Old" });
    const r = await mergeTags("Old", "Fresh");
    expect(r.affected).toBe(0);
    const tags = (await listTags()).map((t) => t.name);
    expect(tags).toEqual(["Fresh"]);
  });

  it("no-ops on same-tag merge (case-insensitive)", async () => {
    await upsertTag({ name: "X" });
    const r = await mergeTags("x", "X");
    expect(r.affected).toBe(0);
    expect((await listTags())[0].name).toBe("X");
  });

  it("does not duplicate when bookmark already had destination tag", async () => {
    await upsertTag({ name: "A" });
    await upsertTag({ name: "B" });
    const b = await upsertBookmark({ rawUrl: "https://example.com/", tags: ["A", "B"] });
    expect(b.ok).toBe(true);
    await mergeTags("A", "B");
    const db = getDB();
    const after = (await db.bookmarks.toArray())[0];
    expect(after.tags).toEqual(["B"]);
  });
});

describe("deleteTag", () => {
  it("drops the tag and strips it from bookmarks", async () => {
    await upsertTag({ name: "Drop" });
    const b = await upsertBookmark({ rawUrl: "https://example.com/", tags: ["Drop", "Keep"] });
    expect(b.ok).toBe(true);
    await deleteTag("Drop");
    expect(await listTags()).toEqual([]);
    const db = getDB();
    const after = (await db.bookmarks.toArray())[0];
    expect(after.tags).toEqual(["Keep"]);
  });
});

describe("tagBookmarkCounts", () => {
  it("counts each tag", async () => {
    await upsertBookmark({ rawUrl: "https://example.com/a", tags: ["AI", "Paper"] });
    await upsertBookmark({ rawUrl: "https://example.com/b", tags: ["AI"] });
    await upsertBookmark({ rawUrl: "https://example.com/c", tags: ["Paper"] });
    const counts = await tagBookmarkCounts();
    expect(counts).toEqual({ AI: 2, Paper: 2 });
  });
});
