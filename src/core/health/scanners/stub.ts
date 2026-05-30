/**
 * Stub / anomaly scanners.
 *
 * One exported `Scanner` constant per rule in the spec table. They all
 * operate on the same `Bookmark[]` corpus + shared `ScanContext`.
 * Findings are produced fresh on every scan — not persisted.
 *
 * See docs/BOOKMARK_HEALTH.md "Stub / anomaly scanners" for the full
 * rule list. Network-dependent broken-link rule lives in
 * `./brokenLink.ts`.
 */
import { ulid } from "ulid";
import type { Bookmark, ChromeMapping } from "../../../shared/types";
import type { HealthFinding, ScanContext, Scanner } from "../types";

/**
 * Patterns that flag a title as "generic" — content the user almost
 * certainly didn't write. Lifted from the spec; the bare-host pattern
 * is intentionally narrow ("example.com" only, not "example.com/foo").
 */
const GENERIC_TITLE_PATTERNS: RegExp[] = [
  /^untitled$/i,
  /^\(no title\)$/i,
  /^no title$/i,
  /^[a-z0-9.-]+\.[a-z]{2,}$/i, // exact host: "example.com"
];

/** Chrome's three root folder ids: bookmarks bar, other, mobile. */
const CHROME_ROOT_FOLDER_IDS = new Set(["0", "1", "2"]);

// ---------- stub.empty-title ---------------------------------------------

export const STUB_EMPTY_TITLE: Scanner = {
  id: "stub.empty-title",
  label: "Empty title",
  kind: "stub-empty-title",
  defaultSeverity: "warn",
  enabledByDefault: true,
  appliesTo: (bm) => bm.title.trim() === "",
  scan: async (bookmarks, ctx) => {
    const findings: HealthFinding[] = [];
    for (const bm of bookmarks) {
      findings.push(
        makeStubFinding({
          ctx,
          bm,
          kind: "stub-empty-title",
          scannerId: "stub.empty-title",
          severity: "warn",
          message: `Empty title: ${bm.canonicalUrl}`,
        }),
      );
    }
    return findings;
  },
};

// ---------- stub.generic-title -------------------------------------------

export const STUB_GENERIC_TITLE: Scanner = {
  id: "stub.generic-title",
  label: "Generic title",
  kind: "stub-generic-title",
  defaultSeverity: "info",
  enabledByDefault: true,
  appliesTo: (bm) => {
    const trimmed = bm.title.trim();
    if (!trimmed) return false; // empty title is the other scanner's job
    return GENERIC_TITLE_PATTERNS.some((p) => p.test(trimmed));
  },
  scan: async (bookmarks, ctx) => {
    const findings: HealthFinding[] = [];
    for (const bm of bookmarks) {
      findings.push(
        makeStubFinding({
          ctx,
          bm,
          kind: "stub-generic-title",
          scannerId: "stub.generic-title",
          severity: "info",
          message: `Generic title "${bm.title}": ${bm.canonicalUrl}`,
        }),
      );
    }
    return findings;
  },
};

// ---------- stub.no-tags --------------------------------------------------

export const STUB_NO_TAGS: Scanner = {
  id: "stub.no-tags",
  label: "No tags",
  kind: "stub-no-tags",
  defaultSeverity: "info",
  enabledByDefault: true,
  appliesTo: (bm) => bm.tags.length === 0,
  scan: async (bookmarks, ctx) => {
    const findings: HealthFinding[] = [];
    for (const bm of bookmarks) {
      findings.push(
        makeStubFinding({
          ctx,
          bm,
          kind: "stub-no-tags",
          scannerId: "stub.no-tags",
          severity: "info",
          message: `No tags: ${bm.canonicalUrl}`,
        }),
      );
    }
    return findings;
  },
};

// ---------- stub.orphan-no-tag-no-folder ---------------------------------

export const STUB_ORPHAN: Scanner = {
  id: "stub.orphan-no-tag-no-folder",
  label: "Orphan (no tag, no folder)",
  kind: "stub-orphan-no-tag-no-folder",
  defaultSeverity: "warn",
  enabledByDefault: true,
  // Pre-filter is `tags.length === 0`; the folder check happens inside
  // `scan` because it needs the ScanContext's mappings.
  appliesTo: (bm) => bm.tags.length === 0,
  scan: async (bookmarks, ctx) => {
    const findings: HealthFinding[] = [];
    for (const bm of bookmarks) {
      if (!hasOnlyRootMapping(bm, ctx.mappingsByBookmarkId.get(bm.id) ?? [])) continue;
      findings.push(
        makeStubFinding({
          ctx,
          bm,
          kind: "stub-orphan-no-tag-no-folder",
          scannerId: "stub.orphan-no-tag-no-folder",
          severity: "warn",
          message: `Orphan: no tag and not in any folder: ${bm.canonicalUrl}`,
        }),
      );
    }
    return findings;
  },
};

/**
 * "Orphan" = no mapping row exists OR every mapping row's
 * `parentChromeId` resolves to a Chrome root folder ("0", "1", "2").
 *
 * The check has to run regardless of whether sync is on — a user who
 * has sync off may still want to know their library is unstructured.
 */
function hasOnlyRootMapping(_bm: Bookmark, mappings: ChromeMapping[]): boolean {
  if (mappings.length === 0) return true;
  return mappings.every(
    (m) => m.parentChromeId === null || CHROME_ROOT_FOLDER_IDS.has(m.parentChromeId),
  );
}

// ---------- anomaly.tag-casing-collision ---------------------------------

export const ANOMALY_TAG_CASING: Scanner = {
  id: "anomaly.tag-casing-collision",
  label: "Tag casing collision",
  kind: "anomaly-tag-casing-collision",
  defaultSeverity: "warn",
  enabledByDefault: true,
  // Corpus-level rule. The pre-filter accepts everything; the real
  // work is one pass over `ctx.byLowercasedTag`.
  appliesTo: () => true,
  scan: async (bookmarks, ctx) => {
    const findings: HealthFinding[] = [];

    for (const [lower, casings] of ctx.byLowercasedTag.entries()) {
      if (casings.length < 2) continue;

      // Determine the majority casing — the one used by the most
      // bookmarks. Ties resolve to the casing that sorts first (stable
      // and deterministic without needing creation timestamps).
      const counts = new Map<string, number>();
      for (const c of casings) counts.set(c, 0);
      const affected: Bookmark[] = [];
      for (const bm of bookmarks) {
        let touched = false;
        for (const tag of bm.tags) {
          if (tag.toLowerCase() !== lower) continue;
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
          touched = true;
        }
        if (touched) affected.push(bm);
      }

      const sortedByCount = [...counts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      });
      const majority = sortedByCount[0][0];
      const minorities = sortedByCount.slice(1).map(([name]) => name);

      const bookmarkIds = affected.map((b) => b.id).sort();
      if (bookmarkIds.length === 0) continue;

      findings.push({
        id: ulid(),
        kind: "anomaly-tag-casing-collision",
        scannerId: "anomaly.tag-casing-collision",
        severity: "warn",
        message: `Tag casing collision: ${casings.join(" / ")} — suggest "${majority}"`,
        bookmarkIds,
        primaryBookmarkId: bookmarkIds[0],
        details: {
          fingerprint: fingerprintForGroup(bookmarkIds),
          casings: [...casings],
          majority,
          minorities,
          counts: Object.fromEntries(counts),
        },
        // Spec maps this finding to a single rename-tag action; for
        // multi-minority collisions we surface the first minority and
        // let the UI iterate (or the user can pick from `details`).
        suggestedAction:
          minorities.length > 0 ? { type: "rename-tag", from: minorities[0], to: majority } : null,
        dismissedAt: null,
        createdAt: ctx.now,
      });
    }

    return findings;
  },
};

// ---------- anomaly.folder-tag-mismatch ----------------------------------

export const ANOMALY_FOLDER_TAG_MISMATCH: Scanner = {
  id: "anomaly.folder-tag-mismatch",
  label: "Folder/tag mismatch",
  kind: "anomaly-folder-tag-mismatch",
  defaultSeverity: "info",
  enabledByDefault: true,
  appliesTo: (bm) => bm.tags.length > 0,
  scan: async (bookmarks, ctx) => {
    const findings: HealthFinding[] = [];
    for (const bm of bookmarks) {
      const mirrored = pickMirroredTag(bm, ctx);
      if (!mirrored) continue;

      const mappings = ctx.mappingsByBookmarkId.get(bm.id) ?? [];
      // If ANY mapping for this bookmark lives under the mirror
      // folder, we're fine — the user filed it correctly somewhere.
      const filedCorrectly = mappings.some((m) => m.parentChromeId === mirrored.mirrorFolderId);
      if (filedCorrectly) continue;

      findings.push({
        id: ulid(),
        kind: "anomaly-folder-tag-mismatch",
        scannerId: "anomaly.folder-tag-mismatch",
        severity: "info",
        message: `Tag "${mirrored.name}" mirrors folder ${mirrored.mirrorFolderId} but the bookmark isn't filed there`,
        bookmarkIds: [bm.id],
        primaryBookmarkId: bm.id,
        details: {
          fingerprint: fingerprintForOne(bm.id),
          tagName: mirrored.name,
          mirrorFolderId: mirrored.mirrorFolderId,
          actualParentChromeIds: mappings.map((m) => m.parentChromeId),
        },
        // Spec: "Suggested action is `null` — we describe the mismatch
        // and the user decides."
        suggestedAction: null,
        dismissedAt: null,
        createdAt: ctx.now,
      });
    }
    return findings;
  },
};

/**
 * The spec says "tag.mirrorFolderId set on the bookmark's primary
 * tag". `Bookmark.tags` carries no notion of "primary" beyond array
 * order, so we treat the first tag with a `mirrorFolderId` as the
 * mirrored one. If multiple tags mirror folders, we use the first
 * one we encounter — the rule is "info"-severity heuristic anyway.
 */
function pickMirroredTag(
  bm: Bookmark,
  ctx: ScanContext,
): { name: string; mirrorFolderId: string } | null {
  for (const name of bm.tags) {
    const tag = ctx.tagsByName.get(name);
    if (tag && tag.mirrorFolderId) {
      return { name: tag.name, mirrorFolderId: tag.mirrorFolderId };
    }
  }
  return null;
}

// ---------- helpers -------------------------------------------------------

/**
 * Stable fingerprint for a single-bookmark finding. The dismissal
 * layer hashes `bookmarkIds.sort().join("|")` so the same bookmark
 * id is the fingerprint here.
 */
function fingerprintForOne(bookmarkId: string): string {
  return bookmarkId;
}

function fingerprintForGroup(bookmarkIds: string[]): string {
  return [...bookmarkIds].sort().join("|");
}

function makeStubFinding(opts: {
  ctx: ScanContext;
  bm: Bookmark;
  kind: "stub-empty-title" | "stub-generic-title" | "stub-no-tags" | "stub-orphan-no-tag-no-folder";
  scannerId: string;
  severity: HealthFinding["severity"];
  message: string;
}): HealthFinding {
  return {
    id: ulid(),
    kind: opts.kind,
    scannerId: opts.scannerId,
    severity: opts.severity,
    message: opts.message,
    bookmarkIds: [opts.bm.id],
    primaryBookmarkId: opts.bm.id,
    details: { fingerprint: fingerprintForOne(opts.bm.id) },
    // Stub-audit rules never suggest a single one-click action — the
    // user has to type a title / pick a tag / open the editor. The
    // mapping table in the spec confirms this.
    suggestedAction: null,
    dismissedAt: null,
    createdAt: opts.ctx.now,
  };
}
