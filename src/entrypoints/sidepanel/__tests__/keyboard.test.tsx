// @vitest-environment happy-dom

/**
 * SidePanel keyboard-shortcut wiring — `/` focuses the search box.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { installChromeStub } from "@/test/a11ySetup";

installChromeStub();

vi.mock("@/hooks/useBookmarks", () => ({
  useBookmarks: () => ({
    bookmarks: [],
    bookmarksByCanonical: {},
    loading: false,
  }),
}));

vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => ({
    query: "",
    setQuery: () => {},
    results: [],
    loading: false,
    parseError: null,
  }),
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

const { render, cleanup, fireEvent, waitFor } = await import("@testing-library/react");
const { SidePanel } = await import("@/entrypoints/sidepanel/SidePanel");

afterEach(() => cleanup());

describe("SidePanel keyboard shortcuts", () => {
  it("`/` focuses the search box", async () => {
    render(<SidePanel />);
    await waitFor(() =>
      expect(document.querySelector('input[aria-label="search bookmarks"]')).not.toBeNull(),
    );
    const input = document.querySelector<HTMLInputElement>('input[aria-label="search bookmarks"]')!;
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document, { key: "/" });
    expect(document.activeElement).toBe(input);
  });

  it("`?` opens the help overlay", async () => {
    const { queryByRole } = render(<SidePanel />);
    expect(queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "?" });
    await waitFor(() => expect(queryByRole("dialog")).not.toBeNull());
  });
});
