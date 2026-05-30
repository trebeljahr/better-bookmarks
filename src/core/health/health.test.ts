/**
 * Health scanner unit tests.
 *
 * Iterates `FIXTURES` from `./fixtures.ts` and runs the named
 * scanner against each corpus. Compares the normalised output (kind /
 * sorted bookmarkIds / severity) so we don't pin ourselves to the
 * exact wording of `message`.
 */
import { describe, expect, it } from "vitest";
import {
  FIXTURE_SETTINGS,
  FIXTURES,
  type HealthScanFixture,
  hydrateFixtureBookmark,
} from "./fixtures";
import { runHealthScan } from "./index";

async function runFixture(fixture: HealthScanFixture) {
  const bookmarks = fixture.corpus.map(hydrateFixtureBookmark);
  const settings = { ...FIXTURE_SETTINGS, ...(fixture.settings ?? {}) };

  // Title-similarity bucket-cap fixtures log a warning to console.
  // No fixture currently exercises that branch, but we suppress
  // console.warn defensively so tests stay quiet.
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    return await runHealthScan({
      bookmarks,
      settings,
      scannerIds: [fixture.scannerId],
      mappings: fixture.mappings,
      tags: fixture.tags,
      now: () => 1_000,
    });
  } finally {
    console.warn = originalWarn;
  }
}

describe("health scanners (fixture-driven)", () => {
  for (const fixture of FIXTURES) {
    it(fixture.name, async () => {
      const result = await runFixture(fixture);
      const normalised = result.findings
        .map((f) => ({
          kind: f.kind,
          bookmarkIds: [...f.bookmarkIds].sort(),
          severity: f.severity,
        }))
        // Sort by (kind, first bookmarkId) so we don't pin ourselves
        // to iteration order across Map traversal.
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
          return (a.bookmarkIds[0] ?? "").localeCompare(b.bookmarkIds[0] ?? "");
        });

      const expected = [...fixture.expected]
        .map((e) => ({
          kind: e.kind,
          bookmarkIds: [...e.bookmarkIds].sort(),
          severity: e.severity,
        }))
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
          return (a.bookmarkIds[0] ?? "").localeCompare(b.bookmarkIds[0] ?? "");
        });

      expect(normalised).toEqual(expected);
    });
  }
});

describe("health scanner registry", () => {
  it("default registry includes every shipped scanner id", async () => {
    const { SCANNER_REGISTRY, listScanners } = await import("./index");
    const ids = listScanners(SCANNER_REGISTRY).map((s) => s.id);
    expect(ids).toEqual([
      "stub.empty-title",
      "stub.generic-title",
      "stub.no-tags",
      "stub.orphan-no-tag-no-folder",
      "anomaly.tag-casing-collision",
      "anomaly.folder-tag-mismatch",
      "anomaly.broken-link",
      "soft-dup.shared-canonical",
      "soft-dup.fuzzy-query",
      "soft-dup.youtube-video-id",
      "soft-dup.title-similarity",
      "soft-dup.arxiv-abs-pdf",
    ]);
  });

  it("anomaly.broken-link is the only scanner not enabled by default", async () => {
    const { SCANNER_REGISTRY, listScanners } = await import("./index");
    const disabled = listScanners(SCANNER_REGISTRY)
      .filter((s) => !s.enabledByDefault)
      .map((s) => s.id);
    expect(disabled).toEqual(["anomaly.broken-link"]);
  });
});

describe("soft-duplicate finding shape", () => {
  it("picks the oldest createdAt as primaryBookmarkId / survivor", async () => {
    const result = await runHealthScan({
      bookmarks: [
        hydrateFixtureBookmark({
          id: "newer",
          canonicalUrl: "https://example.com/x",
          title: "X",
          createdAt: 200,
        }),
        hydrateFixtureBookmark({
          id: "older",
          canonicalUrl: "https://example.com/x",
          title: "X",
          createdAt: 100,
        }),
      ],
      settings: FIXTURE_SETTINGS,
      scannerIds: ["soft-dup.shared-canonical"],
      now: () => 1_000,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].primaryBookmarkId).toBe("older");
    expect(result.findings[0].suggestedAction).toEqual({
      type: "merge-bookmarks",
      survivorId: "older",
      loserIds: ["newer"],
    });
  });

  it("title-similarity surfaces a similarity score in details", async () => {
    const result = await runHealthScan({
      bookmarks: [
        hydrateFixtureBookmark({
          id: "a",
          canonicalUrl: "https://example.com/a",
          title: "Understanding Closures in JavaScript",
          createdAt: 100,
        }),
        hydrateFixtureBookmark({
          id: "b",
          canonicalUrl: "https://example.com/b",
          title: "Understanding Closures in Javascript",
          createdAt: 200,
        }),
      ],
      settings: FIXTURE_SETTINGS,
      scannerIds: ["soft-dup.title-similarity"],
      now: () => 1_000,
    });
    expect(result.findings).toHaveLength(1);
    const similarity = result.findings[0].details.similarity;
    expect(typeof similarity).toBe("number");
    expect(similarity as number).toBeGreaterThanOrEqual(0.9);
  });
});

describe("stub-audit finding shape", () => {
  it("tag-casing-collision picks the majority casing", async () => {
    const result = await runHealthScan({
      bookmarks: [
        hydrateFixtureBookmark({ id: "a", canonicalUrl: "https://example.com/a", tags: ["React"] }),
        hydrateFixtureBookmark({ id: "b", canonicalUrl: "https://example.com/b", tags: ["react"] }),
        hydrateFixtureBookmark({ id: "c", canonicalUrl: "https://example.com/c", tags: ["react"] }),
      ],
      settings: FIXTURE_SETTINGS,
      scannerIds: ["anomaly.tag-casing-collision"],
      now: () => 1_000,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].details.majority).toBe("react");
    expect(result.findings[0].suggestedAction).toEqual({
      type: "rename-tag",
      from: "React",
      to: "react",
    });
  });

  it("orphan scanner treats missing mapping the same as root-only", async () => {
    const result = await runHealthScan({
      bookmarks: [
        hydrateFixtureBookmark({
          id: "no-mapping",
          canonicalUrl: "https://example.com/a",
          title: "A",
          tags: [],
        }),
        hydrateFixtureBookmark({
          id: "root-mapping",
          canonicalUrl: "https://example.com/b",
          title: "B",
          tags: [],
        }),
      ],
      settings: FIXTURE_SETTINGS,
      scannerIds: ["stub.orphan-no-tag-no-folder"],
      mappings: [
        {
          chromeId: "chrome-root-mapping",
          bookmarkId: "root-mapping",
          isFolder: false,
          parentChromeId: "0",
          lastSyncedAt: 0,
          lastKnownEventAt: 0,
          lastKnownTitle: "",
          lastKnownUrl: "",
          lastKnownParentId: "0",
        },
      ],
      now: () => 1_000,
    });
    expect(result.findings.map((f) => f.bookmarkIds[0]).sort()).toEqual([
      "no-mapping",
      "root-mapping",
    ]);
  });
});
