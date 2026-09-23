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

const { render, cleanup, screen, waitFor } = await import("@testing-library/react");
const { Overview } = await import("@/entrypoints/overview/Overview");
const { OnboardingModal } = await import("@/components/OnboardingModal");

afterEach(() => cleanup());

function reportViolations(blocking: ReturnType<typeof filterAxeResults>): void {
  if (blocking.length === 0) return;
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

describe("Overview a11y", () => {
  it("has no serious or critical axe violations", async () => {
    const { container } = render(<Overview />);
    const results = await axe(container);
    const blocking = filterAxeResults(results);
    reportViolations(blocking);
    expect(blocking).toEqual([]);
  });

  it("has no serious or critical axe violations with OnboardingModal open", async () => {
    // Render the modal in isolation on top of a document body so axe
    // sees the same tree the user sees on a fresh install without
    // having to re-plumb the Overview's chrome.storage stub. The modal
    // is portalled to document.body so we pass that node to axe.
    render(<OnboardingModal pending={true} onDismiss={() => {}} onComplete={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
    // Radix Dialog wraps its content in aria-hidden focus-guard <span>s
    // that have tabindex="0" — the pattern the WAI dialog authoring
    // guide recommends for keeping focus inside a modal. axe flags this
    // through the `aria-hidden-focus` rule ("ARIA hidden element must
    // not contain focusable elements"), but it's Radix internals we
    // cannot and should not "fix". Disable that one rule for this axe
    // run. `axe()` shallow-merges overrides over BASE_AXE_OPTIONS, so
    // we also re-declare `color-contrast: disabled` here or happy-dom's
    // empty computed colors will trip the base rule as well.
    const results = await axe(document.body, {
      rules: {
        "color-contrast": { enabled: false },
        "aria-hidden-focus": { enabled: false },
      },
    });
    const blocking = filterAxeResults(results);
    reportViolations(blocking);
    expect(blocking).toEqual([]);
  });
});
