// @vitest-environment happy-dom

/**
 * Options page keyboard-shortcut wiring.
 *
 * Options has no first-party search box yet — but the `/` handler
 * ships anyway so a search added later (filter settings, find in URL
 * list) picks it up. To exercise the handler in isolation we inject
 * an element that looks like a search input into the DOM.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/shared/types";
import { installChromeStub } from "@/test/a11ySetup";

installChromeStub();

vi.mock("@/core/storage/settings", () => ({
  getSettings: async () => DEFAULT_SETTINGS,
  setSettings: async (patch: unknown) => ({ ...DEFAULT_SETTINGS, ...(patch as object) }),
}));

vi.mock("@/core/storage/bookmarks", () => ({
  countBookmarks: async () => 0,
}));

vi.mock("@/core/storage/db", () => ({
  getDB: () => ({
    tags: { count: async () => 0 },
    edges: { count: async () => 0 },
    postings: { count: async () => 0 },
    chromeMappings: { count: async () => 0 },
  }),
  resetDBForTests: () => {},
}));

vi.mock("@/core/backup", () => ({
  runBackupOnce: async () => ({ fileName: "test.json", byteSize: 0 }),
}));

const { render, cleanup, fireEvent, waitFor } = await import("@testing-library/react");
const { Options } = await import("@/entrypoints/options/Options");

afterEach(() => cleanup());

describe("Options page keyboard shortcuts", () => {
  it("`?` opens the help overlay", async () => {
    const { findByRole, queryByRole } = render(<Options />);
    await findByRole("heading", { level: 2, name: /Sync/i });
    expect(queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "?" });
    await waitFor(() => expect(queryByRole("dialog")).not.toBeNull());
  });

  it("`/` focuses the first search input if one exists on the page", async () => {
    const { findByRole } = render(<Options />);
    await findByRole("heading", { level: 2, name: /Sync/i });
    // Simulate a search input landing on the page in a future revision.
    const search = document.createElement("input");
    search.type = "search";
    search.setAttribute("aria-label", "search settings");
    document.body.appendChild(search);
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.keyDown(document, { key: "/" });
      expect(document.activeElement).toBe(search);
    } finally {
      search.remove();
    }
  });

  it("`/` does nothing when the page has no search input", async () => {
    const { findByRole } = render(<Options />);
    await findByRole("heading", { level: 2, name: /Sync/i });
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document, { key: "/" });
    // Nothing to focus — the handler is a soft no-op.
    // Assert the active element is still the body (or null).
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });
});
