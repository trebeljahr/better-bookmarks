// @vitest-environment happy-dom

/**
 * Overview + OnboardingModal integration.
 *
 * Mounts the real Overview component with `getOnboardingState` stubbed
 * via `chrome.storage.local` and asserts:
 *   - pending=true  → modal shows on first paint.
 *   - pending=false → modal never appears.
 *
 * All the noisy-dependency hooks (bookmarks, search, tags, folders,
 * settings) are mocked exactly as the a11y suite mocks them so the
 * onboarding branch is the only thing this test actually exercises.
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
const { ONBOARDING_PENDING_KEY } = await import("@/core/onboarding/state");

/** Overwrite `chrome.storage.local.get` for one test run. */
function seedOnboardingPending(pending: boolean): void {
  const g = globalThis as unknown as { chrome: { storage: { local: unknown } } };
  g.chrome.storage.local = {
    get: async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) {
        if (k === ONBOARDING_PENDING_KEY) out[k] = pending;
      }
      return out;
    },
    set: async () => {},
    remove: async () => {},
  };
}

afterEach(() => cleanup());

describe("Overview + OnboardingModal", () => {
  it("renders the modal when onboardingPending=true", async () => {
    seedOnboardingPending(true);
    render(<Overview />);
    // useOnboarding resolves its chrome.storage.local.get after mount;
    // wait for the dialog to appear rather than asserting synchronously.
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
    expect(screen.getByText(/Two saves of the same page/i)).toBeTruthy();
  });

  it("does NOT render the modal when onboardingPending=false", async () => {
    seedOnboardingPending(false);
    render(<Overview />);
    // Give the async settle a tick and confirm nothing shows up.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/Two saves of the same page/i)).toBeNull();
  });
});
