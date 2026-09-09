import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upsertBookmark } from "./bookmarks";
import { getDB, resetDBForTests } from "./db";
import {
  deleteTag,
  getTag,
  listTags,
  mergeTags,
  renameTag,
  setTagColor,
  setTagParent,
  tagAncestors,
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

  it("handles merge across 200+ bookmarks", async () => {
    // Fixture:
    //   - 100 bookmarks tagged only "machine-learning"
    //   -  30 bookmarks tagged only "ml"
    //   -  50 bookmarks tagged with both (overlap)
    // Totals: 150 "machine-learning", 80 "ml", 180 distinct bookmarks.
    // Plus one unrelated bookmark to prove the merge doesn't paint outside its lines.
    // mergeTags in this repo is a single Dexie transaction with no AbortSignal /
    // cancel-token surface (grepped tags.ts — none), so we do not assert
    // cancellation rollback here.
    await upsertTag({ name: "machine-learning" });
    await upsertTag({ name: "ml" });
    await upsertTag({ name: "unrelated" });

    const onlyDest: string[] = [];
    const onlySource: string[] = [];
    const both: string[] = [];

    for (let i = 0; i < 100; i++) {
      const url = `https://example.com/dest/${i}`;
      onlyDest.push(url);
      const r = await upsertBookmark({ rawUrl: url, tags: ["machine-learning"] });
      expect(r.ok).toBe(true);
    }
    for (let i = 0; i < 30; i++) {
      const url = `https://example.com/src/${i}`;
      onlySource.push(url);
      const r = await upsertBookmark({ rawUrl: url, tags: ["ml"] });
      expect(r.ok).toBe(true);
    }
    for (let i = 0; i < 50; i++) {
      const url = `https://example.com/both/${i}`;
      both.push(url);
      const r = await upsertBookmark({ rawUrl: url, tags: ["ml", "machine-learning"] });
      expect(r.ok).toBe(true);
    }
    const unrelatedUrl = "https://example.com/unrelated";
    const noise = await upsertBookmark({ rawUrl: unrelatedUrl, tags: ["unrelated"] });
    expect(noise.ok).toBe(true);

    const db = getDB();
    // Sanity: fixture landed as intended.
    expect(await db.bookmarks.count()).toBe(181);
    expect((await db.bookmarks.where("tags").equals("machine-learning").toArray()).length).toBe(
      150,
    );
    expect((await db.bookmarks.where("tags").equals("ml").toArray()).length).toBe(80);

    const result = await mergeTags("ml", "machine-learning");
    // affected = every bookmark that carried "ml" (30 only-ml + 50 both).
    expect(result.affected).toBe(80);

    // Final tag count: source removed, destination survives, unrelated untouched.
    const tagNames = (await listTags()).map((t) => t.name).sort();
    expect(tagNames).toEqual(["machine-learning", "unrelated"]);
    expect(await getTag("ml")).toBeUndefined();

    // Every bookmark that used to carry "ml" or "machine-learning" now carries
    // "machine-learning" and no longer carries "ml".
    const affectedUrls = [...onlySource, ...both, ...onlyDest];
    for (const url of affectedUrls) {
      const b = await db.bookmarks.where("canonicalUrl").equals(url).first();
      expect(b, url).toBeDefined();
      expect(b?.tags).toContain("machine-learning");
      expect(b?.tags).not.toContain("ml");
      // No duplicates.
      expect(b?.tags.length).toBe(new Set(b?.tags).size);
    }

    // Every bookmark that previously had "ml" is now findable under the
    // destination — the merge preserved membership, not just tag text.
    const destMembers = await db.bookmarks.where("tags").equals("machine-learning").toArray();
    expect(destMembers.length).toBe(180);
    expect(await db.bookmarks.where("tags").equals("ml").count()).toBe(0);

    // No orphaned tag references anywhere: every tag string that appears on
    // any bookmark exists in the tags table.
    const knownTagNames = new Set((await listTags()).map((t) => t.name));
    const allBookmarks = await db.bookmarks.toArray();
    for (const b of allBookmarks) {
      for (const t of b.tags) {
        expect(knownTagNames.has(t), `orphaned tag "${t}" on ${b.canonicalUrl}`).toBe(true);
      }
    }

    // Unrelated bookmark is exactly as it was.
    const untouched = await db.bookmarks.where("canonicalUrl").equals(unrelatedUrl).first();
    expect(untouched?.tags).toEqual(["unrelated"]);
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

describe("setTagColor", () => {
  it("round-trips a hex color", async () => {
    await upsertTag({ name: "AI" });
    await setTagColor("AI", "#a1b2c3");
    const t = await getTag("AI");
    expect(t?.color).toBe("#a1b2c3");
  });

  it("preserves other fields when changing color", async () => {
    await upsertTag({ name: "AI", description: "smart stuff", parentName: null });
    await setTagColor("AI", "#ff0000");
    const t = await getTag("AI");
    expect(t?.description).toBe("smart stuff");
    expect(t?.parentName).toBe(null);
    expect(t?.color).toBe("#ff0000");
  });

  it("clears color when passed null", async () => {
    await upsertTag({ name: "AI", color: "#ff0000" });
    await setTagColor("AI", null);
    const t = await getTag("AI");
    expect(t?.color).toBe(null);
  });

  it("is case-insensitive on lookup", async () => {
    await upsertTag({ name: "AI" });
    await setTagColor("ai", "#123456");
    const t = await getTag("AI");
    expect(t?.color).toBe("#123456");
  });

  it("throws on unknown tag", async () => {
    await expect(setTagColor("ghost", "#000000")).rejects.toThrow(/does not exist/);
  });
});

describe("setTagParent", () => {
  it("sets parent on a simple two-level hierarchy", async () => {
    await upsertTag({ name: "Parent" });
    await upsertTag({ name: "Child" });
    await setTagParent("Child", "Parent");
    const child = await getTag("Child");
    expect(child?.parentName).toBe("Parent");
  });

  it("normalizes parent to the stored case", async () => {
    await upsertTag({ name: "Parent" });
    await upsertTag({ name: "Child" });
    await setTagParent("child", "parent");
    const child = await getTag("Child");
    expect(child?.parentName).toBe("Parent");
  });

  it("clears parent when passed null", async () => {
    await upsertTag({ name: "Parent" });
    await upsertTag({ name: "Child", parentName: "Parent" });
    await setTagParent("Child", null);
    const child = await getTag("Child");
    expect(child?.parentName).toBe(null);
  });

  it("rejects self-parent", async () => {
    await upsertTag({ name: "X" });
    await expect(setTagParent("X", "X")).rejects.toThrow(/its own parent/);
  });

  it("rejects nonexistent parent", async () => {
    await upsertTag({ name: "Child" });
    await expect(setTagParent("Child", "Ghost")).rejects.toThrow(/does not exist/);
  });

  it("rejects cycle (A->B then B->A)", async () => {
    await upsertTag({ name: "A" });
    await upsertTag({ name: "B" });
    await setTagParent("B", "A");
    await expect(setTagParent("A", "B")).rejects.toThrow(/cycle/i);
  });

  it("rejects deeper cycle (A->B->C then A->C)", async () => {
    await upsertTag({ name: "A" });
    await upsertTag({ name: "B" });
    await upsertTag({ name: "C" });
    await setTagParent("B", "A");
    await setTagParent("C", "B");
    await expect(setTagParent("A", "C")).rejects.toThrow(/cycle/i);
  });

  it("preserves color when setting parent", async () => {
    await upsertTag({ name: "Parent" });
    await upsertTag({ name: "Child", color: "#abc123" });
    await setTagParent("Child", "Parent");
    const child = await getTag("Child");
    expect(child?.color).toBe("#abc123");
  });

  it("throws on unknown tag", async () => {
    await upsertTag({ name: "Parent" });
    await expect(setTagParent("ghost", "Parent")).rejects.toThrow(/does not exist/);
  });
});

describe("tagAncestors", () => {
  it("returns chain in order: immediate parent first, root last", async () => {
    await upsertTag({ name: "Root" });
    await upsertTag({ name: "Mid" });
    await upsertTag({ name: "Leaf" });
    await setTagParent("Mid", "Root");
    await setTagParent("Leaf", "Mid");
    const chain = await tagAncestors("Leaf");
    expect(chain.map((t) => t.name)).toEqual(["Mid", "Root"]);
  });

  it("returns empty for a root tag", async () => {
    await upsertTag({ name: "Root" });
    expect(await tagAncestors("Root")).toEqual([]);
  });

  it("returns empty for unknown tag", async () => {
    expect(await tagAncestors("ghost")).toEqual([]);
  });
});
