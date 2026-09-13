// @vitest-environment happy-dom

/**
 * SidePanel entrypoint — automated accessibility smoke.
 *
 * SidePanel is the slim overview surface. We stub the data hooks and
 * search wiring so it renders empty, then audit the shell with axe.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { axe, filterAxeResults, installChromeStub } from "@/test/a11ySetup";

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

const { render, cleanup } = await import("@testing-library/react");
const { SidePanel } = await import("@/entrypoints/sidepanel/SidePanel");

afterEach(() => cleanup());

describe("SidePanel a11y", () => {
  it("has no serious or critical axe violations", async () => {
    const { container } = render(<SidePanel />);
    const results = await axe(container);
    const blocking = filterAxeResults(results);
    if (blocking.length > 0) {
      console.error(
        "axe violations:\n" +
          blocking
            .map(
              (v) =>
                `  ${v.impact} — ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"})`,
            )
            .join("\n"),
      );
    }
    expect(blocking).toEqual([]);
  });
});
