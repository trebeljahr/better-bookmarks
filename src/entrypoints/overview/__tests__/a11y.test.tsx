// @vitest-environment happy-dom

/**
 * Overview entrypoint — automated accessibility smoke.
 *
 * Renders the top-level Overview page with empty stores, then runs
 * axe-core over the resulting DOM. Fails on serious or critical
 * violations only (see docs/ACCESSIBILITY.md).
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

const { render, cleanup } = await import("@testing-library/react");
const { Overview } = await import("@/entrypoints/overview/Overview");

afterEach(() => cleanup());

describe("Overview a11y", () => {
  it("has no serious or critical axe violations", async () => {
    const { container } = render(<Overview />);
    const results = await axe(container);
    const blocking = filterAxeResults(results);
    if (blocking.length > 0) {
      // Emit a readable failure — axe's default matcher is noisy but
      // does the right thing on a plain call, too.
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
