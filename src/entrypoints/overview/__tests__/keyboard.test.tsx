// @vitest-environment happy-dom

/**
 * Overview keyboard-shortcut wiring.
 *
 * Mounts the Overview page with fake in-memory data, fires keydown
 * events on the document, and asserts the corresponding action ran —
 * either through a mock (delete / update / upsertBookmark) or through
 * visible DOM change (cursor row highlight, dialog opens).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "@/shared/types";
import { installChromeStub } from "@/test/a11ySetup";

installChromeStub();

const FAKE_BOOKMARKS: Bookmark[] = [
  {
    id: "b1",
    originalUrl: "https://example.com/a",
    canonicalUrl: "https://example.com/a",
    domain: "example.com",
    title: "Alpha",
    description: "",
    note: "",
    rating: null,
    necessaryTime: null,
    status: "unread",
    contentType: "article",
    tags: [],
    createdAt: 3,
    updatedAt: 3,
    capturedFrom: "manual",
  },
  {
    id: "b2",
    originalUrl: "https://example.com/b",
    canonicalUrl: "https://example.com/b",
    domain: "example.com",
    title: "Bravo",
    description: "",
    note: "",
    rating: null,
    necessaryTime: null,
    status: "unread",
    contentType: "article",
    tags: [],
    createdAt: 2,
    updatedAt: 2,
    capturedFrom: "manual",
  },
  {
    id: "b3",
    originalUrl: "https://example.com/c",
    canonicalUrl: "https://example.com/c",
    domain: "example.com",
    title: "Charlie",
    description: "",
    note: "",
    rating: null,
    necessaryTime: null,
    status: "unread",
    contentType: "article",
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    capturedFrom: "manual",
  },
];

vi.mock("@/hooks/useBookmarks", () => ({
  useBookmarks: () => ({
    bookmarks: FAKE_BOOKMARKS,
    bookmarksByCanonical: Object.fromEntries(FAKE_BOOKMARKS.map((b) => [b.canonicalUrl, b])),
    loading: false,
  }),
}));

vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => ({
    query: "",
    setQuery: () => {},
    results: FAKE_BOOKMARKS,
    loading: false,
    parseError: null,
  }),
}));

vi.mock("@/hooks/useTags", () => ({
  useTags: () => ({ tags: [], counts: {}, loading: false, refresh: async () => {} }),
}));

vi.mock("@/hooks/useFolders", () => ({
  useFolders: () => ({ forest: [], counts: {}, loading: false, refresh: async () => {} }),
}));

vi.mock("@/core/search", () => ({
  wireSearchIndexer: () => {},
  ensureSearchIndexInitialized: () => Promise.resolve(),
  isSearchIndexerSuppressed: () => false,
  setSearchIndexerSuppressed: () => {},
  resetSearchWiringForTests: () => {},
  indexBookmark: async () => {},
  reindexAll: async () => {},
  removeBookmark: async () => {},
  parseQuery: () => ({
    tags: [],
    excludeTags: [],
    statuses: [],
    folders: [],
    excludeFolders: [],
    domains: [],
    untagged: false,
    rating: null,
    errors: [],
  }),
  runQuery: async () => [],
  search: async () => [],
}));

const upsertBookmarkMock = vi.fn(async ({ rawUrl }: { rawUrl: string }) => ({
  ok: true as const,
  created: true,
  bookmark: { ...FAKE_BOOKMARKS[0], id: "new-id", originalUrl: rawUrl, canonicalUrl: rawUrl },
}));
const updateBookmarkMock = vi.fn(async () => {});
const deleteBookmarkMock = vi.fn(async () => {});

vi.mock("@/core/storage/bookmarks", () => ({
  deleteBookmark: (...args: unknown[]) => deleteBookmarkMock(...args),
  updateBookmark: (...args: unknown[]) => updateBookmarkMock(...args),
  upsertBookmark: (...args: unknown[]) => upsertBookmarkMock(...args),
}));

vi.mock("@/core/storage/tags", () => ({
  deleteTag: async () => {},
  mergeTags: async () => {},
  renameTag: async () => {},
  setTagColor: async () => {},
  setTagParent: async () => {},
  upsertTag: async () => {},
}));

const { render, cleanup, screen, fireEvent, waitFor, act } = await import("@testing-library/react");
const { Overview } = await import("@/entrypoints/overview/Overview");

const originalPrompt = window.prompt;
const originalConfirm = window.confirm;

beforeEach(() => {
  upsertBookmarkMock.mockClear();
  updateBookmarkMock.mockClear();
  deleteBookmarkMock.mockClear();
  // The overview persists bulk selection to the URL fragment. Reset it
  // between tests so an earlier `a` (select-all) doesn't seed the next
  // test's initial selection through the hydrate-from-hash effect.
  window.history.replaceState(null, "", "/");
  // Provide a chrome.tabs.query that returns a fake active tab so the
  // `n` shortcut has something to bookmark.
  const chromeGlobal = (globalThis as unknown as { chrome: { tabs: { query: unknown } } }).chrome;
  chromeGlobal.tabs.query = () =>
    Promise.resolve([{ url: "https://newtab.example/x", title: "Fresh tab" }]);
});

afterEach(() => {
  cleanup();
  window.prompt = originalPrompt;
  window.confirm = originalConfirm;
});

describe("Overview keyboard shortcuts", () => {
  it("`/` focuses the search box", async () => {
    render(<Overview />);
    await waitFor(() =>
      expect(document.querySelector('input[aria-label="search bookmarks"]')).not.toBeNull(),
    );
    const input = document.querySelector<HTMLInputElement>('input[aria-label="search bookmarks"]')!;
    // Ensure focus is off the search input.
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document, { key: "/" });
    expect(document.activeElement).toBe(input);
  });

  it("`?` toggles the help overlay open", async () => {
    render(<Overview />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "?" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeNull());
  });

  it("`n` calls upsertBookmark with the active tab URL", async () => {
    render(<Overview />);
    fireEvent.keyDown(document, { key: "n" });
    await waitFor(() => expect(upsertBookmarkMock).toHaveBeenCalledTimes(1));
    expect(upsertBookmarkMock.mock.calls[0][0]).toMatchObject({
      rawUrl: "https://newtab.example/x",
    });
  });

  it("`t` prompts, then updates the cursor bookmark with the new tag", async () => {
    window.prompt = vi.fn(() => "reading");
    render(<Overview />);
    await act(async () => {
      fireEvent.keyDown(document, { key: "t" });
    });
    await waitFor(() => expect(updateBookmarkMock).toHaveBeenCalledTimes(1));
    const [id, patch] = updateBookmarkMock.mock.calls[0] as [string, { tags: string[] }];
    expect(id).toBe("b1");
    expect(patch.tags).toEqual(["reading"]);
  });

  it("`t` does nothing when the prompt is cancelled", async () => {
    window.prompt = vi.fn(() => null);
    render(<Overview />);
    await act(async () => {
      fireEvent.keyDown(document, { key: "t" });
    });
    expect(updateBookmarkMock).not.toHaveBeenCalled();
  });

  it("`d` confirms, then deletes the cursor bookmark", async () => {
    window.confirm = vi.fn(() => true);
    render(<Overview />);
    await act(async () => {
      fireEvent.keyDown(document, { key: "d" });
    });
    await waitFor(() => expect(deleteBookmarkMock).toHaveBeenCalledTimes(1));
    expect(deleteBookmarkMock.mock.calls[0][0]).toBe("b1");
  });

  it("`d` cancelled-at-confirm deletes nothing", async () => {
    window.confirm = vi.fn(() => false);
    render(<Overview />);
    fireEvent.keyDown(document, { key: "d" });
    expect(deleteBookmarkMock).not.toHaveBeenCalled();
  });

  it("`a` selects every visible row and surfaces the bulk-actions bar", async () => {
    render(<Overview />);
    expect(document.querySelector('[aria-label="clear bulk selection"]')).toBeNull();
    fireEvent.keyDown(document, { key: "a" });
    await waitFor(() => {
      // BulkActionsBar renders "N selected" once >=1 row is picked.
      expect(document.body.textContent ?? "").toMatch(/3 selected/);
    });
  });

  it("`x` toggles bulk selection on the cursor row", async () => {
    render(<Overview />);
    fireEvent.keyDown(document, { key: "x" });
    await waitFor(() => {
      expect(document.body.textContent ?? "").toMatch(/1 selected/);
    });
  });

  it("`j` moves the cursor down (row 2 gets highlighted)", async () => {
    render(<Overview />);
    fireEvent.keyDown(document, { key: "j" });
    await waitFor(() => {
      // The cursor row gets border-primary + bg-accent; assert the second
      // row now carries these classes.
      const rows = document.querySelectorAll('[role="button"].border-l-\\[3px\\]');
      expect(rows.length).toBeGreaterThanOrEqual(2);
      const second = rows[1] as HTMLElement;
      expect(second.className).toMatch(/border-primary/);
    });
  });

  it("ignores single-letter shortcuts while typing in the search box", async () => {
    render(<Overview />);
    await waitFor(() =>
      expect(document.querySelector('input[aria-label="search bookmarks"]')).not.toBeNull(),
    );
    const input = document.querySelector<HTMLInputElement>('input[aria-label="search bookmarks"]')!;
    input.focus();
    fireEvent.keyDown(input, { key: "d" });
    expect(deleteBookmarkMock).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "n" });
    expect(upsertBookmarkMock).not.toHaveBeenCalled();
  });
});
