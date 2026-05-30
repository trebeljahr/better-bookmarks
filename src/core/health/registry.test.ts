/**
 * Step 1 registry tests.
 *
 * Covers the bare contract: a registry can be built from a list of
 * scanners, lookups + listing return the registered set, and running
 * an empty registry yields zero findings without crashing. Scanner
 * behaviour itself is exercised in step 2 once the rules land.
 */
import { describe, expect, it } from "vitest";
import { type Bookmark, DEFAULT_SETTINGS } from "../../shared/types";
import { runHealthScan } from "./index";
import { buildRegistry, getScanner, listScanners } from "./registry";
import type { HealthFinding, Scanner } from "./types";

function makeScanner(id: string, overrides: Partial<Scanner> = {}): Scanner {
  return {
    id,
    label: id,
    kind: "stub-empty-title",
    defaultSeverity: "info",
    enabledByDefault: true,
    appliesTo: () => true,
    scan: async () => [],
    ...overrides,
  };
}

describe("scanner registry", () => {
  it("registers scanners and exposes them by id", () => {
    const a = makeScanner("a");
    const b = makeScanner("b");
    const registry = buildRegistry([a, b]);

    expect(getScanner(registry, "a")).toBe(a);
    expect(getScanner(registry, "b")).toBe(b);
    expect(getScanner(registry, "missing")).toBeUndefined();
  });

  it("lists scanners in registration order", () => {
    const a = makeScanner("a");
    const b = makeScanner("b");
    const c = makeScanner("c");
    const registry = buildRegistry([b, a, c]);

    expect(listScanners(registry).map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  it("rejects duplicate scanner ids", () => {
    expect(() => buildRegistry([makeScanner("dup"), makeScanner("dup")])).toThrow(
      /Duplicate scanner id: dup/,
    );
  });

  it("runs an empty registry and returns no findings", async () => {
    const registry = buildRegistry([]);
    const result = await runHealthScan({
      bookmarks: [],
      settings: DEFAULT_SETTINGS,
      registry,
    });

    expect(result.findings).toEqual([]);
    expect(result.totalScanned).toBe(0);
    expect(result.scannerStats).toEqual({});
    expect(result.finishedAt).toBeGreaterThanOrEqual(result.startedAt);
  });

  it("fans scanners out and merges findings in registration order", async () => {
    const findingA: HealthFinding = {
      id: "01-a",
      kind: "stub-empty-title",
      scannerId: "a",
      severity: "warn",
      message: "from a",
      bookmarkIds: ["bm-1"],
      primaryBookmarkId: "bm-1",
      details: {},
      suggestedAction: null,
      dismissedAt: null,
      createdAt: 0,
    };
    const findingB: HealthFinding = {
      ...findingA,
      id: "01-b",
      scannerId: "b",
      message: "from b",
    };

    const registry = buildRegistry([
      makeScanner("a", { scan: async () => [findingA] }),
      makeScanner("b", { scan: async () => [findingB] }),
    ]);

    const bookmarks: Bookmark[] = [
      {
        id: "bm-1",
        canonicalUrl: "https://example.com/",
        originalUrl: "https://example.com/",
        domain: "example.com",
        title: "",
        description: "",
        note: "",
        tags: [],
        rating: null,
        necessaryTime: null,
        contentType: "unknown",
        language: null,
        status: "unread",
        readAt: null,
        createdAt: 1,
        updatedAt: 1,
        capturedFrom: "manual",
      },
    ];

    const result = await runHealthScan({ bookmarks, settings: DEFAULT_SETTINGS, registry });

    expect(result.findings.map((f) => f.scannerId)).toEqual(["a", "b"]);
    expect(result.totalScanned).toBe(1);
    expect(result.scannerStats.a.count).toBe(1);
    expect(result.scannerStats.b.count).toBe(1);
  });

  it("isolates scanner failures and continues the scan", async () => {
    const goodFinding: HealthFinding = {
      id: "01-good",
      kind: "stub-empty-title",
      scannerId: "good",
      severity: "info",
      message: "ok",
      bookmarkIds: ["bm-1"],
      primaryBookmarkId: "bm-1",
      details: {},
      suggestedAction: null,
      dismissedAt: null,
      createdAt: 0,
    };

    const registry = buildRegistry([
      makeScanner("bad", {
        scan: async () => {
          throw new Error("boom");
        },
      }),
      makeScanner("good", { scan: async () => [goodFinding] }),
    ]);

    // Silence the expected console.error from the bad scanner so the
    // test output stays clean.
    const originalError = console.error;
    console.error = () => undefined;
    try {
      const result = await runHealthScan({
        bookmarks: [],
        settings: DEFAULT_SETTINGS,
        registry,
      });
      expect(result.findings).toEqual([goodFinding]);
      expect(result.scannerStats.bad.count).toBe(0);
      expect(result.scannerStats.good.count).toBe(1);
    } finally {
      console.error = originalError;
    }
  });
});
