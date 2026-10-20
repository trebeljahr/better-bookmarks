// @vitest-environment happy-dom

/**
 * Overview + support card after the first file import.
 *
 * Mounts the real Overview with the importers mocked and a small
 * in-memory `chrome.storage.local`, and asserts the card shows after the
 * first import that brought anything in, inline and never as a dialog,
 * and never again on a later import, closed or not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeStub } from "@/test/a11ySetup";

installChromeStub();

const importer = vi.hoisted(() => ({
  rawUrls: vi.fn(async () => ({ imported: 3, merged: 1, rejected: 0 })),
}));

vi.mock("@/core/importExport", async (original) => ({
  ...(await original<typeof import("@/core/importExport")>()),
  importRawUrlList: importer.rawUrls,
}));

vi.mock("@/hooks/useBookmarks", () => ({
  useBookmarks: () => ({ bookmarks: [], bookmarksByCanonical: {}, loading: false }),
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

const { render, cleanup, fireEvent, screen, waitFor } = await import("@testing-library/react");
const { Overview } = await import("@/entrypoints/overview/Overview");
const { claimImportSupportCard, IMPORT_SUPPORT_CARD_KEY } = await import(
  "@/core/onboarding/supportCard"
);
const { DONATE_URL, importSummary } = await import("@/components/ImportSupportCard");

let stored: Map<string, unknown>;

function installStorage(): void {
  stored = new Map();
  const g = globalThis as unknown as { chrome: { storage: { local: unknown } } };
  g.chrome.storage.local = {
    get: async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (stored.has(k)) out[k] = stored.get(k);
      return out;
    },
    set: async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) stored.set(k, v);
    },
    remove: async () => {},
  };
}

const card = () => screen.queryByRole("complementary", { name: "import finished" });

async function importFile(name = "links.txt"): Promise<void> {
  const input = screen.getByLabelText("import bookmarks file");
  const file = new File(["https://example.com/\n"], name, { type: "text/plain" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => {
    expect(screen.getByText(/Raw URLs:/)).toBeTruthy();
  });
}

beforeEach(() => {
  installStorage();
  importer.rawUrls.mockClear();
  importer.rawUrls.mockResolvedValue({ imported: 3, merged: 1, rejected: 0 });
});
afterEach(() => cleanup());

describe("claimImportSupportCard", () => {
  it("answers true once and remembers when", async () => {
    expect(await claimImportSupportCard(() => 1234)).toBe(true);
    expect(stored.get(IMPORT_SUPPORT_CARD_KEY)).toBe(1234);
    expect(await claimImportSupportCard()).toBe(false);
  });

  it("answers false when storage fails", async () => {
    const g = globalThis as unknown as { chrome: { storage: { local: unknown } } };
    g.chrome.storage.local = {
      get: async () => ({}),
      set: async () => {
        throw new Error("QUOTA_BYTES quota exceeded");
      },
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await claimImportSupportCard()).toBe(false);
    error.mockRestore();
  });
});

describe("importSummary", () => {
  it("says what the import did", () => {
    expect(importSummary(3, 1)).toBe(
      "Import done: 3 new bookmarks, 1 bookmark merged into one you already had.",
    );
    expect(importSummary(1, 0)).toBe("Import done: 1 new bookmark.");
    expect(importSummary(0, 1200)).toBe(
      "Import done: 1,200 bookmarks merged into ones you already had.",
    );
  });
});

describe("Overview support card after the first import", () => {
  it("shows once, inline, after the first import", async () => {
    render(<Overview />);
    expect(card()).toBeNull();

    await importFile();
    await waitFor(() => expect(card()).not.toBeNull());
    expect(card()?.textContent).toContain(importSummary(3, 1));
    expect(screen.getByRole("link", { name: "buy me some cookies" }).getAttribute("href")).toBe(
      DONATE_URL,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "close import summary" }));
    expect(card()).toBeNull();

    await importFile();
    expect(importer.rawUrls).toHaveBeenCalledTimes(2);
    expect(card()).toBeNull();
  });

  it("does not come back on a later visit, even if it was never closed", async () => {
    render(<Overview />);
    await importFile();
    await waitFor(() => expect(card()).not.toBeNull());
    cleanup();

    render(<Overview />);
    await importFile();
    expect(card()).toBeNull();
  });

  it("waits for an import that brought something in", async () => {
    importer.rawUrls.mockResolvedValue({ imported: 0, merged: 0, rejected: 2 });
    render(<Overview />);
    await importFile();
    expect(card()).toBeNull();
    expect(stored.has(IMPORT_SUPPORT_CARD_KEY)).toBe(false);

    importer.rawUrls.mockResolvedValue({ imported: 2, merged: 0, rejected: 0 });
    await importFile();
    await waitFor(() => expect(card()).not.toBeNull());
  });

  it("stays away after a failed import", async () => {
    importer.rawUrls.mockRejectedValue(new Error("bad file"));
    render(<Overview />);
    const input = screen.getByLabelText("import bookmarks file");
    fireEvent.change(input, { target: { files: [new File(["x"], "x.txt")] } });
    await waitFor(() => expect(screen.getByText(/import failed: bad file/)).toBeTruthy());
    expect(card()).toBeNull();
    expect(stored.has(IMPORT_SUPPORT_CARD_KEY)).toBe(false);
  });
});
