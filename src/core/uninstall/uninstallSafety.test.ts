/**
 * Uninstall safety — the "no lock-in" guarantee is load-bearing.
 *
 * If we ever mutate the user's Chrome bookmark tree during install, normal
 * use, or the uninstall path, we've silently taken their data hostage. This
 * test proves we don't:
 *
 *   1. Build a deterministic synthetic Chrome bookmark corpus (size 200).
 *   2. Snapshot the tree (deep JSON clone) as the pre-install state.
 *   3. Install: run `importChromeTree` — reads the tree into IndexedDB.
 *   4. User adds BB-only metadata: tags on bookmarks, notes on bookmarks,
 *      Tag records, and edges between bookmarks — all of it in IndexedDB.
 *   5. Uninstall: delete the IndexedDB database and clear chrome.storage.local
 *      (the two data surfaces the extension writes to).
 *   6. Assert: the mocked `chrome.bookmarks` tree is byte-identical to the
 *      pre-install snapshot — same nodes, same order, same URLs, same titles,
 *      same folder structure. Compared both structurally (`toEqual`) and as
 *      a JSON byte sequence, so a single-character drift would fail.
 *
 * The chrome.bookmarks mutation methods (`create`, `update`, `remove`,
 * `move`) are installed as spies that throw if called. If any code path
 * touched by this scenario ever starts mutating the Chrome tree, the test
 * fails immediately at the offending call — not just at the final diff.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEdge } from "@/core/edges/crud";
import { listBookmarks, updateBookmark } from "@/core/storage/bookmarks";
import { getDB, resetDBForTests } from "@/core/storage/db";
import { upsertTag } from "@/core/storage/tags";
import { importChromeTree } from "@/core/sync/initialImport";
import { buildSyntheticCorpus } from "@/test/fixtures/synthetic-corpus";

const DB_NAME = "better-bookmarks";

/**
 * Deep clone via JSON round-trip. The Chrome tree is JSON-safe (only
 * strings, numbers, booleans, and nested arrays of plain objects), so this
 * gives us a genuinely independent copy — no shared references anywhere.
 */
function jsonClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

type ChromeStorageArea = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
};

type FakeChrome = {
  storage: { local: ChromeStorageArea; store: Record<string, unknown> };
  bookmarks: {
    getTree: ReturnType<typeof vi.fn>;
    // Mutation surface — spies that scream if called.
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    removeTree: ReturnType<typeof vi.fn>;
    move: ReturnType<typeof vi.fn>;
    // Read surfaces — the code sometimes calls .get(id) after a mutation;
    // include as no-op so an unexpected call fails at the mutation spy, not
    // deeper in the callchain with a confusing "not a function" error.
    get: ReturnType<typeof vi.fn>;
  };
};

/**
 * Wire a chrome mock that:
 *   - hands out the SAME tree reference every getTree() call (so if some
 *     code mutated it, we'd catch that too, not just an outbound API call);
 *   - refuses every mutation call with a loud throw.
 */
function fakeChrome(tree: chrome.bookmarks.BookmarkTreeNode[]): FakeChrome {
  const store: Record<string, unknown> = {};
  const local: ChromeStorageArea = {
    get: vi.fn(async (keys: string | string[] | null) => {
      if (keys === null || keys === undefined) return { ...store };
      if (typeof keys === "string") {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in store) out[k] = store[k];
      return out;
    }),
    set: vi.fn(async (entries: Record<string, unknown>) => {
      Object.assign(store, entries);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) delete store[k];
    }),
    clear: vi.fn(async () => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };
  const refuse = (method: string) =>
    vi.fn(async () => {
      throw new Error(
        `chrome.bookmarks.${method} must not be called during the install → edit → uninstall flow`,
      );
    });
  return {
    storage: { local, store },
    bookmarks: {
      getTree: vi.fn(async () => tree),
      create: refuse("create"),
      update: refuse("update"),
      remove: refuse("remove"),
      removeTree: refuse("removeTree"),
      move: refuse("move"),
      get: vi.fn(async () => {
        throw new Error("chrome.bookmarks.get must not be called in this scenario");
      }),
    },
  };
}

function installChrome(fake: FakeChrome): void {
  // biome-ignore lint/suspicious/noExplicitAny: test wiring
  (globalThis as any).chrome = fake;
}

/**
 * "Uninstall" — mimic what happens when the extension is removed:
 *   - IndexedDB database is deleted (Chrome does this on uninstall).
 *   - chrome.storage.local is cleared (Chrome wipes extension storage on
 *     uninstall). We call the mock's own `clear()` for symmetry.
 *
 * Neither should touch chrome.bookmarks — that's user data owned by Chrome.
 */
async function simulateUninstall(fake: FakeChrome): Promise<void> {
  // Close the cached Dexie handle so the delete can proceed cleanly under
  // fake-indexeddb (an open connection would block the version-change txn).
  resetDBForTests();

  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("deleteDatabase failed"));
    req.onblocked = () => reject(new Error("deleteDatabase blocked"));
  });

  await fake.storage.local.clear();
}

beforeEach(() => {
  // Ensure no stale db handle from a previous test.
  resetDBForTests();
});

afterEach(async () => {
  // Belt-and-braces: drop any residual db + chrome mock so unrelated tests
  // in the same run don't inherit our state.
  try {
    resetDBForTests();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  } catch {
    // ignore — teardown is best-effort
  }
  // biome-ignore lint/suspicious/noExplicitAny: test teardown
  delete (globalThis as any).chrome;
  vi.restoreAllMocks();
});

describe("uninstall safety — chrome.bookmarks tree survives install → edit → uninstall", () => {
  it("leaves the mocked Chrome bookmark tree byte-identical to its pre-install state", async () => {
    // -----------------------------------------------------------------
    // 1. Pre-install: build the synthetic corpus and snapshot the tree.
    // -----------------------------------------------------------------
    const { tree } = buildSyntheticCorpus({ size: 200 });
    const preInstallTree = jsonClone(tree);
    const preInstallJson = JSON.stringify(preInstallTree);

    const fake = fakeChrome(tree);
    installChrome(fake);

    // -----------------------------------------------------------------
    // 2. Install: read the Chrome tree into BB's IndexedDB.
    // -----------------------------------------------------------------
    const report = await importChromeTree(tree, () => 1_700_000_000_000);
    expect(report.bookmarksCreated).toBeGreaterThan(0);
    // Also write the install-flag the real runtime sets, so uninstall
    // has something non-trivial to clear.
    await fake.storage.local.set({ __bb_initial_import__: { ranAt: 1_700_000_000_000 } });

    // Sanity: the getTree spy was invoked at least indirectly by our test
    // (we passed the tree directly to importChromeTree, so getTree may not
    // have fired — that's fine; the point is the mutation spies stayed
    // untouched, which we check below).
    expect(fake.bookmarks.create).not.toHaveBeenCalled();
    expect(fake.bookmarks.update).not.toHaveBeenCalled();
    expect(fake.bookmarks.remove).not.toHaveBeenCalled();
    expect(fake.bookmarks.removeTree).not.toHaveBeenCalled();
    expect(fake.bookmarks.move).not.toHaveBeenCalled();

    // -----------------------------------------------------------------
    // 3. User does normal BB things: add tags, add notes, create edges,
    //    create Tag records with hierarchy.
    // -----------------------------------------------------------------
    const all = await listBookmarks();
    expect(all.length).toBeGreaterThanOrEqual(10);

    // Tag the first 20 bookmarks with an additional user-picked tag,
    // and note-annotate the next 20.
    const taggedSlice = all.slice(0, 20);
    const notedSlice = all.slice(20, 40);
    for (const b of taggedSlice) {
      await updateBookmark(b.id, { tags: [...b.tags, "user-favourite"] });
    }
    for (const b of notedSlice) {
      await updateBookmark(b.id, {
        note: `Handwritten note for ${b.title.slice(0, 32)}`,
      });
    }

    // Create a couple of Tag records — one root, one child.
    await upsertTag({ name: "user-favourite", color: "#ff0080" });
    await upsertTag({ name: "user-favourite/hot", parentName: "user-favourite" });

    // Create manual edges between the first 10 tagged bookmarks in a chain.
    for (let i = 0; i + 1 < 10; i++) {
      await createEdge({
        fromId: taggedSlice[i]!.id,
        toId: taggedSlice[i + 1]!.id,
        type: "related",
        note: `edge ${i}`,
      });
    }

    // Confirm user data actually landed in the store — otherwise the
    // uninstall assertion is vacuous.
    const db = getDB();
    const bookmarksAfterEdits = await db.bookmarks.toArray();
    expect(bookmarksAfterEdits.filter((b) => b.tags.includes("user-favourite"))).toHaveLength(20);
    expect(bookmarksAfterEdits.filter((b) => b.note !== "")).toHaveLength(20);
    expect(await db.tags.count()).toBeGreaterThanOrEqual(2);
    expect(await db.edges.count()).toBe(9);

    // Still no mutation of chrome.bookmarks — user edits live only in BB.
    expect(fake.bookmarks.create).not.toHaveBeenCalled();
    expect(fake.bookmarks.update).not.toHaveBeenCalled();
    expect(fake.bookmarks.remove).not.toHaveBeenCalled();
    expect(fake.bookmarks.removeTree).not.toHaveBeenCalled();
    expect(fake.bookmarks.move).not.toHaveBeenCalled();

    // -----------------------------------------------------------------
    // 4. Uninstall: wipe IndexedDB, wipe chrome.storage.local.
    // -----------------------------------------------------------------
    await simulateUninstall(fake);

    // chrome.storage.local is empty.
    expect(fake.storage.store).toEqual({});

    // Reopening the db yields zero rows in every table — the uninstall
    // actually deleted, it didn't just clear one collection.
    const reopened = getDB();
    expect(await reopened.bookmarks.count()).toBe(0);
    expect(await reopened.tags.count()).toBe(0);
    expect(await reopened.edges.count()).toBe(0);
    expect(await reopened.chromeMappings.count()).toBe(0);
    expect(await reopened.postings.count()).toBe(0);

    // -----------------------------------------------------------------
    // 5. THE guarantee: the Chrome bookmark tree is byte-identical.
    // -----------------------------------------------------------------
    const postUninstallTree = await fake.bookmarks.getTree();

    // Structural equality — every node, every field, every child in order.
    expect(postUninstallTree).toEqual(preInstallTree);

    // Byte-identical JSON serialisation — a single dropped/renamed/added
    // character in any title, URL, id, index, or parentId would fail here.
    const postUninstallJson = JSON.stringify(postUninstallTree);
    expect(postUninstallJson).toBe(preInstallJson);
    expect(postUninstallJson.length).toBe(preInstallJson.length);

    // And final belt-and-braces: no mutation call ever fired.
    expect(fake.bookmarks.create).not.toHaveBeenCalled();
    expect(fake.bookmarks.update).not.toHaveBeenCalled();
    expect(fake.bookmarks.remove).not.toHaveBeenCalled();
    expect(fake.bookmarks.removeTree).not.toHaveBeenCalled();
    expect(fake.bookmarks.move).not.toHaveBeenCalled();
  });
});
