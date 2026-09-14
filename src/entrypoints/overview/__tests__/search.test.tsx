// @vitest-environment happy-dom

/**
 * Overview search UI — type a query, see the results narrow.
 *
 * Uses a stub `useSearch` that returns a filtered subset of the fake
 * bookmark store based on whichever tokens are in the current query.
 * That gives us a real controlled input, real debouncing at the
 * component boundary, and real DOM assertions about which rows the
 * FixedSizeList renders — without pulling in Dexie or the actual
 * ranking pipeline.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "@/shared/types";
import { installChromeStub } from "@/test/a11ySetup";

installChromeStub();

const FAKE_BOOKMARKS: Bookmark[] = [
  {
    id: "b1",
    originalUrl: "https://react.dev/hooks",
    canonicalUrl: "https://react.dev/hooks",
    domain: "react.dev",
    title: "React hooks reference",
    description: "",
    note: "",
    rating: 9,
    necessaryTime: null,
    status: "unread",
    contentType: "article",
    tags: ["frontend", "react"],
    createdAt: 1_000,
    updatedAt: 1_000,
    capturedFrom: "manual",
  },
  {
    id: "b2",
    originalUrl: "https://nginx.org/en/docs",
    canonicalUrl: "https://nginx.org/en/docs",
    domain: "nginx.org",
    title: "Nginx documentation",
    description: "",
    note: "",
    rating: 6,
    necessaryTime: null,
    status: "read",
    contentType: "article",
    tags: ["ops"],
    createdAt: 2_000,
    updatedAt: 2_000,
    capturedFrom: "manual",
  },
  {
    id: "b3",
    originalUrl: "https://svelte.dev/tutorial",
    canonicalUrl: "https://svelte.dev/tutorial",
    domain: "svelte.dev",
    title: "Svelte tutorial",
    description: "",
    note: "",
    rating: null,
    necessaryTime: null,
    status: "unread",
    contentType: "article",
    tags: ["frontend", "svelte"],
    createdAt: 3_000,
    updatedAt: 3_000,
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

// Real controlled state living in module scope so the overview's setQuery
// mutates a shared value the same way the real hook would.
let currentQuery = "";
const setQueryMock = vi.fn((q: string) => {
  currentQuery = q;
});

function computeResults(q: string): Bookmark[] {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return FAKE_BOOKMARKS;
  return FAKE_BOOKMARKS.filter((b) =>
    (b.title + " " + b.domain + " " + b.tags.join(" ")).toLowerCase().includes(trimmed),
  );
}

vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => ({
    query: currentQuery,
    setQuery: setQueryMock,
    results: computeResults(currentQuery),
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

vi.mock("@/core/storage/bookmarks", () => ({
  deleteBookmark: async () => {},
  updateBookmark: async () => {},
  upsertBookmark: async () => ({ ok: true, created: true, bookmark: FAKE_BOOKMARKS[0] }),
}));

vi.mock("@/core/storage/tags", () => ({
  deleteTag: async () => {},
  mergeTags: async () => {},
  renameTag: async () => {},
  setTagColor: async () => {},
  setTagParent: async () => {},
  upsertTag: async () => {},
}));

const { render, cleanup, fireEvent, waitFor, act } = await import("@testing-library/react");
const { Overview } = await import("@/entrypoints/overview/Overview");

beforeEach(() => {
  currentQuery = "";
  setQueryMock.mockClear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
});

function getSearchInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[aria-label="search bookmarks"]')!;
}

function visibleTitles(): string[] {
  return Array.from(document.querySelectorAll("p.truncate.text-sm.font-medium")).map(
    (el) => el.textContent?.trim() ?? "",
  );
}

describe("Overview search UI", () => {
  it("renders every bookmark when the query is empty", async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(visibleTitles()).toEqual(
        expect.arrayContaining(["React hooks reference", "Nginx documentation", "Svelte tutorial"]),
      );
    });
  });

  it("narrows the visible rows to matches when the user types", async () => {
    const { rerender } = render(<Overview />);
    const input = getSearchInput();
    await act(async () => {
      fireEvent.change(input, { target: { value: "svelte" } });
    });
    expect(setQueryMock).toHaveBeenCalledWith("svelte");
    // Force a re-render so the useSearch mock re-evaluates against the
    // updated module-scoped `currentQuery`.
    rerender(<Overview />);
    await waitFor(() => {
      const titles = visibleTitles();
      expect(titles).toContain("Svelte tutorial");
      expect(titles).not.toContain("Nginx documentation");
      expect(titles).not.toContain("React hooks reference");
    });
  });

  it("shows the syntax cheat sheet when the visible list is empty", async () => {
    currentQuery = "does-not-exist-anywhere";
    render(<Overview />);
    await waitFor(() => {
      expect(document.getElementById("bb-search-hint")?.textContent ?? "").toMatch(
        /tag:foo.*domain:example\.com.*is:unread.*rating:>=7/,
      );
    });
  });

  it("Escape inside the search box clears the query and blurs", async () => {
    currentQuery = "svelte";
    render(<Overview />);
    const input = getSearchInput();
    input.focus();
    expect(document.activeElement).toBe(input);
    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    expect(setQueryMock).toHaveBeenCalledWith("");
    expect(document.activeElement).not.toBe(input);
  });

  it("'/' focuses the search box from anywhere on the page", async () => {
    render(<Overview />);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document, { key: "/" });
    expect(document.activeElement).toBe(getSearchInput());
  });
});
