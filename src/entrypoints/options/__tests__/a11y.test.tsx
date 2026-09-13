// @vitest-environment happy-dom

/**
 * Options entrypoint — automated accessibility smoke.
 *
 * The Options page reads settings + counts on mount. We stub the
 * storage/settings/backup modules so the render is deterministic and
 * fast, then run axe against the resulting DOM.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/shared/types";
import { axe, filterAxeResults, installChromeStub } from "@/test/a11ySetup";

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

const { render, cleanup, waitFor } = await import("@testing-library/react");
const { Options } = await import("@/entrypoints/options/Options");

afterEach(() => cleanup());

describe("Options a11y", () => {
  it("has no serious or critical axe violations", async () => {
    const { container, findByRole } = render(<Options />);
    // Wait for the async settings load to swap the "Loading…"
    // placeholder for the real form. The a11y pass should target
    // the fully-hydrated page, not the loading skeleton. The
    // "Sync" section heading is unique to the loaded state.
    await findByRole("heading", { level: 2, name: /Sync/i });
    await waitFor(() => expect(container.textContent ?? "").not.toMatch(/^\s*Loading…\s*$/));
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
