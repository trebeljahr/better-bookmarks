// @vitest-environment happy-dom

/**
 * Overview + first-run hint integration.
 *
 * Mounts the real Overview component with `getOnboardingState` stubbed
 * via `chrome.storage.local` and asserts:
 *   - pending=true  → the inline hint shows, no dialog opens, and the
 *     flag is cleared on the same visit, so the hint shows once.
 *   - pending=false → the hint never appears.
 *   - closing it, or starting a search, takes it off the page.
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

vi.mock("@/hooks/useSearch", async () => {
  const { useState } = await import("react");
  return {
    useSearch: () => {
      const [query, setQuery] = useState("");
      return { query, setQuery, results: [], loading: false, parseError: null };
    },
  };
});

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

const { render, cleanup, fireEvent, screen, waitFor } = await import("@testing-library/react");
const { Overview } = await import("@/entrypoints/overview/Overview");
const { ONBOARDING_PENDING_KEY } = await import("@/core/onboarding/state");

const HINT = /Each folder becomes a tag/i;

/** Overwrite `chrome.storage.local` for one test run; returns every `set` call. */
function seedOnboardingPending(pending: boolean): Record<string, unknown>[] {
  const writes: Record<string, unknown>[] = [];
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
    set: async (items: Record<string, unknown>) => {
      writes.push(items);
    },
    remove: async () => {},
  };
  return writes;
}

afterEach(() => cleanup());

describe("Overview first-run hint", () => {
  it("shows the hint inline, never as a dialog, and clears the flag at once", async () => {
    const writes = seedOnboardingPending(true);
    render(<Overview />);
    // useOnboarding resolves its chrome.storage.local.get after mount.
    const hint = await screen.findByRole("complementary", { name: "first-run hint" });
    expect(hint.textContent).toMatch(HINT);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => {
      expect(writes.some((w) => w[ONBOARDING_PENDING_KEY] === false)).toBe(true);
    });
  });

  it("does NOT show the hint when onboardingPending=false", async () => {
    const writes = seedOnboardingPending(false);
    render(<Overview />);
    // Give the async settle a tick and confirm nothing shows up.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(HINT)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes.some((w) => ONBOARDING_PENDING_KEY in w)).toBe(false);
  });

  it("goes away when closed", async () => {
    seedOnboardingPending(true);
    render(<Overview />);
    await screen.findByText(HINT);
    fireEvent.click(screen.getByRole("button", { name: "close hint" }));
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("goes away once the user starts searching", async () => {
    seedOnboardingPending(true);
    render(<Overview />);
    await screen.findByText(HINT);
    fireEvent.change(screen.getByLabelText("search bookmarks"), { target: { value: "react" } });
    await waitFor(() => {
      expect(screen.queryByText(HINT)).toBeNull();
    });
  });
});
