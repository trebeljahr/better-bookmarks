/**
 * Soft-duplicate scanners.
 *
 * One exported `Scanner` per rule in the spec table. All scanners
 * here operate on multi-bookmark groups and surface a finding per
 * group, with `primaryBookmarkId` set to the survivor candidate
 * (oldest `createdAt`, tie-broken by id).
 *
 * See docs/BOOKMARK_HEALTH.md "Soft-duplicate scanners" for the full
 * rule list and merge semantics.
 */
import { ulid } from "ulid";
import type { Bookmark } from "../../../shared/types";
import type { HealthFinding, ScanContext, Scanner } from "../types";
import { etldPlusOne } from "./etld";
import { titleSimilarity } from "./titleSimilarity";

/**
 * Title-similarity bucket cap. Per spec: "capped at 200 bookmarks
 * per bucket (we skip larger buckets with a `info` finding and log a
 * warning — for a 20k corpus this only triggers on `medium.com` and
 * similar long-tail)."
 */
const TITLE_SIMILARITY_BUCKET_CAP = 200;
const TITLE_SIMILARITY_THRESHOLD = 0.9;

// ---------- soft-dup.shared-canonical ------------------------------------

export const SOFT_DUP_SHARED_CANONICAL: Scanner = {
  id: "soft-dup.shared-canonical",
  label: "Duplicate canonical URL",
  kind: "dup-shared-canonical",
  defaultSeverity: "error",
  enabledByDefault: true,
  // Corpus-level rule. Pre-filter passes everything; the work walks
  // `ctx.byCanonicalUrl`.
  appliesTo: () => true,
  scan: async (_bookmarks, ctx) => {
    const findings: HealthFinding[] = [];
    for (const [canonical, group] of ctx.byCanonicalUrl.entries()) {
      if (group.length < 2) continue;
      findings.push(
        makeDupFinding({
          ctx,
          group,
          kind: "dup-shared-canonical",
          scannerId: "soft-dup.shared-canonical",
          severity: "error",
          message: `Multiple records share canonical URL ${canonical} — bypasses the unique index`,
          details: { canonicalUrl: canonical },
        }),
      );
    }
    return findings;
  },
};

// ---------- soft-dup.fuzzy-query -----------------------------------------

export const SOFT_DUP_FUZZY_QUERY: Scanner = {
  id: "soft-dup.fuzzy-query",
  label: "Same path, different query",
  kind: "dup-fuzzy-query",
  defaultSeverity: "info",
  enabledByDefault: true,
  // Pre-filter accepts every parseable bookmark; bucket logic happens
  // in `scan`. We don't gate per-bookmark here because the bucket key
  // depends on parsing the URL — we'd be duplicating work.
  appliesTo: () => true,
  scan: async (bookmarks, ctx) => {
    const buckets = new Map<string, Bookmark[]>();
    for (const bm of bookmarks) {
      const key = hostPathKey(bm);
      if (!key) continue;
      const list = buckets.get(key);
      if (list) list.push(bm);
      else buckets.set(key, [bm]);
    }

    const findings: HealthFinding[] = [];
    for (const [key, group] of buckets.entries()) {
      if (group.length < 2) continue;
      // Within a bucket, we also need at least two distinct
      // canonicalUrls — same-canonical groups are the
      // shared-canonical scanner's job and shouldn't double-fire here.
      const distinctCanonicals = new Set(group.map((b) => b.canonicalUrl));
      if (distinctCanonicals.size < 2) continue;

      findings.push(
        makeDupFinding({
          ctx,
          group,
          kind: "dup-fuzzy-query",
          scannerId: "soft-dup.fuzzy-query",
          severity: "info",
          message: `Same host+path, different query: ${key}`,
          details: { hostPath: key, distinctCanonicals: [...distinctCanonicals] },
        }),
      );
    }
    return findings;
  },
};

/**
 * Build the bucket key for fuzzy-query grouping. We parse
 * `canonicalUrl` (lowercased) and take `${host}${pathname}` — query
 * and fragment ignored. Unparseable URLs return null and get
 * silently skipped.
 */
function hostPathKey(bm: Bookmark): string | null {
  try {
    const u = new URL(bm.canonicalUrl);
    return `${u.host}${u.pathname}`;
  } catch {
    return null;
  }
}

// ---------- soft-dup.youtube-video-id ------------------------------------

export const SOFT_DUP_YOUTUBE: Scanner = {
  id: "soft-dup.youtube-video-id",
  label: "YouTube: same video, different t=",
  kind: "dup-youtube-video-id",
  defaultSeverity: "info",
  enabledByDefault: true,
  appliesTo: (bm) => {
    if (bm.domain !== "www.youtube.com") return false;
    return parseYoutubeWatchPath(bm.canonicalUrl) !== null;
  },
  scan: async (bookmarks, ctx) => {
    const buckets = new Map<string, Bookmark[]>();
    for (const bm of bookmarks) {
      const videoId = parseYoutubeWatchPath(bm.canonicalUrl);
      if (!videoId) continue;
      const list = buckets.get(videoId);
      if (list) list.push(bm);
      else buckets.set(videoId, [bm]);
    }

    const findings: HealthFinding[] = [];
    for (const [videoId, group] of buckets.entries()) {
      if (group.length < 2) continue;
      const distinctCanonicals = new Set(group.map((b) => b.canonicalUrl));
      if (distinctCanonicals.size < 2) continue;
      findings.push(
        makeDupFinding({
          ctx,
          group,
          kind: "dup-youtube-video-id",
          scannerId: "soft-dup.youtube-video-id",
          severity: "info",
          message: `Same YouTube video (v=${videoId}) across ${group.length} bookmarks`,
          details: { videoId, distinctCanonicals: [...distinctCanonicals] },
        }),
      );
    }
    return findings;
  },
};

/**
 * Pull the `v=` parameter from a YouTube watch URL. Returns null for
 * non-watch URLs (channel pages, playlists without `v`, etc.) so
 * those bookmarks are skipped by both `appliesTo` and the scan loop.
 */
function parseYoutubeWatchPath(canonicalUrl: string): string | null {
  try {
    const u = new URL(canonicalUrl);
    if (u.host !== "www.youtube.com") return null;
    if (u.pathname !== "/watch") return null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

// ---------- soft-dup.title-similarity ------------------------------------

export const SOFT_DUP_TITLE_SIM: Scanner = {
  id: "soft-dup.title-similarity",
  label: "Similar titles, same site",
  kind: "dup-title-similarity",
  defaultSeverity: "info",
  enabledByDefault: true,
  // Per spec: requires a per eTLD+1 bucket with size > 1. We can't
  // know bucket membership from a single bookmark, so the pre-filter
  // just excludes empty-title rows (cheap and obvious win).
  appliesTo: (bm) => bm.title.trim().length > 0,
  scan: async (bookmarks, ctx) => {
    const buckets = new Map<string, Bookmark[]>();
    for (const bm of bookmarks) {
      const key = etldPlusOne(bm.domain);
      const list = buckets.get(key);
      if (list) list.push(bm);
      else buckets.set(key, [bm]);
    }

    const findings: HealthFinding[] = [];
    for (const [etld, group] of buckets.entries()) {
      if (group.length < 2) continue;

      // Spec: cap each bucket. Larger buckets get an `info` finding
      // describing the skip and we move on.
      if (group.length > TITLE_SIMILARITY_BUCKET_CAP) {
        const bookmarkIds = group.map((b) => b.id).sort();
        findings.push({
          id: ulid(),
          kind: "dup-title-similarity",
          scannerId: "soft-dup.title-similarity",
          severity: "info",
          message: `Skipping title-similarity for ${etld} (${group.length} bookmarks > ${TITLE_SIMILARITY_BUCKET_CAP} cap)`,
          bookmarkIds,
          primaryBookmarkId: bookmarkIds[0],
          details: {
            fingerprint: `skip:${etld}:${bookmarkIds.length}`,
            skipped: true,
            etld,
            bucketSize: group.length,
          },
          suggestedAction: null,
          dismissedAt: null,
          createdAt: ctx.now,
        });
        console.warn(
          `[health] soft-dup.title-similarity: skipping ${etld} bucket of ${group.length} > ${TITLE_SIMILARITY_BUCKET_CAP}`,
        );
        continue;
      }

      // Pairwise compare. We dedup pairs by id ordering — only emit
      // (a, b) when a.id < b.id so we don't double-count.
      const sortedById = [...group].sort((a, b) => a.id.localeCompare(b.id));
      for (let i = 0; i < sortedById.length; i++) {
        for (let j = i + 1; j < sortedById.length; j++) {
          const a = sortedById[i];
          const b = sortedById[j];
          const sim = titleSimilarity(a.title, b.title);
          if (sim < TITLE_SIMILARITY_THRESHOLD) continue;

          findings.push(
            makeDupFinding({
              ctx,
              group: [a, b],
              kind: "dup-title-similarity",
              scannerId: "soft-dup.title-similarity",
              severity: "info",
              message: `Similar titles (${sim.toFixed(2)}) on ${etld}: "${a.title}" / "${b.title}"`,
              details: { etld, similarity: sim },
            }),
          );
        }
      }
    }
    return findings;
  },
};

// ---------- soft-dup.arxiv-abs-pdf ---------------------------------------

export const SOFT_DUP_ARXIV: Scanner = {
  id: "soft-dup.arxiv-abs-pdf",
  label: "arXiv abs/pdf pair",
  kind: "dup-arxiv-abs-pdf",
  defaultSeverity: "warn",
  enabledByDefault: true,
  // The canonicalizer collapses `/pdf/<id>` to `/abs/<id>` — this
  // scanner is a safety net for legacy imports / custom overrides
  // that bypassed the strategy.
  appliesTo: (bm) => bm.domain.endsWith("arxiv.org"),
  scan: async (bookmarks, ctx) => {
    const buckets = new Map<string, Bookmark[]>();
    for (const bm of bookmarks) {
      const arxivId = parseArxivId(bm.canonicalUrl);
      if (!arxivId) continue;
      const list = buckets.get(arxivId);
      if (list) list.push(bm);
      else buckets.set(arxivId, [bm]);
    }

    const findings: HealthFinding[] = [];
    for (const [arxivId, group] of buckets.entries()) {
      if (group.length < 2) continue;
      const distinctCanonicals = new Set(group.map((b) => b.canonicalUrl));
      if (distinctCanonicals.size < 2) continue;

      findings.push(
        makeDupFinding({
          ctx,
          group,
          kind: "dup-arxiv-abs-pdf",
          scannerId: "soft-dup.arxiv-abs-pdf",
          severity: "warn",
          message: `arXiv ${arxivId}: ${group.length} bookmarks point at abs/pdf variants of the same paper`,
          details: { arxivId, distinctCanonicals: [...distinctCanonicals] },
        }),
      );
    }
    return findings;
  },
};

/**
 * Extract the arXiv paper id from a canonical URL. Accepts both
 * `/abs/<id>` and `/pdf/<id>` paths so survivors slipping past the
 * canonicalizer still cluster together. Strips trailing `.pdf` and
 * version suffixes (e.g. `2305.12345v2` -> `2305.12345`) so the
 * bucket key matches the canonicalizer's idea of identity.
 */
function parseArxivId(canonicalUrl: string): string | null {
  try {
    const u = new URL(canonicalUrl);
    if (!u.host.endsWith("arxiv.org")) return null;
    const match = u.pathname.match(/^\/(?:abs|pdf)\/([\w.-]+?)(?:\.pdf)?$/i);
    if (!match) return null;
    return match[1].replace(/v\d+$/, "");
  } catch {
    return null;
  }
}

// ---------- helpers -------------------------------------------------------

function makeDupFinding(opts: {
  ctx: ScanContext;
  group: Bookmark[];
  kind:
    | "dup-shared-canonical"
    | "dup-fuzzy-query"
    | "dup-youtube-video-id"
    | "dup-title-similarity"
    | "dup-arxiv-abs-pdf";
  scannerId: string;
  severity: HealthFinding["severity"];
  message: string;
  details: Record<string, unknown>;
}): HealthFinding {
  // Survivor candidate per spec: oldest `createdAt` wins. Stable
  // tie-break on id so the same group always picks the same survivor.
  const sortedBySurvivorPreference = [...opts.group].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id.localeCompare(b.id);
  });
  const survivor = sortedBySurvivorPreference[0];
  const losers = sortedBySurvivorPreference.slice(1);
  const bookmarkIds = sortedBySurvivorPreference.map((b) => b.id);

  return {
    id: ulid(),
    kind: opts.kind,
    scannerId: opts.scannerId,
    severity: opts.severity,
    message: opts.message,
    bookmarkIds,
    primaryBookmarkId: survivor.id,
    details: {
      ...opts.details,
      fingerprint: [...bookmarkIds].sort().join("|"),
      survivorId: survivor.id,
      loserIds: losers.map((b) => b.id),
    },
    suggestedAction: {
      type: "merge-bookmarks",
      survivorId: survivor.id,
      loserIds: losers.map((b) => b.id),
    },
    dismissedAt: null,
    createdAt: opts.ctx.now,
  };
}
