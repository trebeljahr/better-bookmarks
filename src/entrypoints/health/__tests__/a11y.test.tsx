// @vitest-environment happy-dom

/**
 * Health entrypoint — automated accessibility smoke.
 *
 * The Health page bootstraps by loading settings + corpus. We stub the
 * storage/settings/health modules so a fresh render lands on an empty
 * "run a scan" state, then run axe.
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
  listBookmarks: async () => [],
}));

vi.mock("@/core/storage/tags", () => ({
  listTags: async () => [],
}));

vi.mock("@/core/sync/mapping", () => ({
  listAllMappings: async () => [],
}));

vi.mock("@/core/maintenance", () => ({
  runDeadLinkSweep: async () => ({ checked: 0, dead: 0 }),
}));

vi.mock("@/core/health", () => ({
  applyFinding: async () => {},
  fingerprintForFinding: () => "fp",
  listScanners: () => [
    {
      id: "test-scanner",
      label: "Test scanner",
      description: "test",
      enabledByDefault: true,
      defaultSeverity: "info" as const,
    },
  ],
  runHealthScan: async () => ({
    startedAt: 0,
    finishedAt: 0,
    totalScanned: 0,
    findings: [],
    scannerStats: {},
  }),
  SCANNER_REGISTRY: {},
  undoBuffer: {
    list: () => [],
    subscribe: () => () => {},
    pruneExpired: () => {},
  },
  undoSnapshot: async () => {},
}));

const { render, cleanup, waitFor } = await import("@testing-library/react");
const { Health } = await import("@/entrypoints/health/Health");

afterEach(() => cleanup());

describe("Health a11y", () => {
  it("has no serious or critical axe violations", async () => {
    const { container } = render(<Health />);
    // Wait for async bootstrap to swap the "Loading…" placeholder for
    // the real page.
    await waitFor(() => {
      expect(container.querySelector("h1")).not.toBeNull();
    });
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
