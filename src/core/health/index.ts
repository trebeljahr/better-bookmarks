/**
 * Bookmark Health public API.
 *
 * Step 1 ships:
 *   - Type definitions (HealthFinding, HealthSeverity, ScanResult, etc.).
 *   - Scanner registry primitives (buildRegistry, SCANNER_REGISTRY).
 *   - The top-level `runHealthScan` entry point that fans scanners out
 *     and merges their findings.
 *
 * Individual scanners, apply/undo machinery, and UI come in subsequent
 * steps. See docs/BOOKMARK_HEALTH.md.
 */
import type { Bookmark, ChromeMapping, Settings, Tag } from "../../shared/types";
import { SCANNER_REGISTRY } from "./registry";
import type {
  HealthFinding,
  ScanContext,
  Scanner,
  ScannerRegistry,
  ScannerStats,
  ScanResult,
} from "./types";

export type { ApplyOpts, ApplyResult } from "./apply";
export {
  applyFinding,
  fingerprintForBookmarkIds,
  fingerprintForFinding,
  mergeRecords,
  undoSnapshot,
} from "./apply";
export { buildRegistry, getScanner, listScanners, SCANNER_REGISTRY } from "./registry";
export type {
  HealthAction,
  HealthFinding,
  HealthFindingKind,
  HealthSeverity,
  ScanContext,
  Scanner,
  ScannerRegistry,
  ScannerStats,
  ScanResult,
} from "./types";
export type { UndoSnapshot, UndoTagDelta } from "./undo";
export { UndoBuffer, undoBuffer } from "./undo";

export type RunHealthScanOpts = {
  bookmarks: Bookmark[];
  settings: Settings;
  /** Override the default registry. Used in tests and rare callers. */
  registry?: ScannerRegistry;
  /**
   * Restrict to a subset of scanner ids. Undefined = all scanners in
   * the registry that are enabled per settings.
   */
  scannerIds?: string[];
  /** Override Date.now() for deterministic tests. */
  now?: () => number;
  /**
   * Pre-fetched Chrome mappings. Tests pass this directly; production
   * callers leave it undefined and runHealthScan reads from Dexie.
   * The orphan scanner depends on this — when nothing is supplied AND
   * no DB is available, every bookmark looks like an orphan, which is
   * harmless (the rule already gates on `tags.length === 0`).
   */
  mappings?: ChromeMapping[];
  /** Pre-fetched tags. Same shape: tests inject, production reads. */
  tags?: Tag[];
};

/**
 * Fan scanners out over the corpus and merge their findings. The
 * caller is responsible for fetching `bookmarks` (typically via
 * `listBookmarks()` against the Dexie store) and passing the current
 * `settings`.
 *
 * Scanners run sequentially in registration order. Each one runs only
 * on the bookmarks its `appliesTo` accepts. We track per-scanner
 * duration and finding count in `scannerStats` so the UI can surface
 * "scan finished in N ms / scanner.x took M ms" without us having to
 * thread a logger through every scanner.
 *
 * Errors from a single scanner do NOT abort the scan: we log them and
 * continue. The scanner's stats entry still shows up with count: 0.
 *
 * Dismissed findings are filtered out before returning — the UI never
 * sees them (they live on a separate "dismissed" tab via `findings`
 * passed through the registry, not this top-level entry point).
 */
export async function runHealthScan(opts: RunHealthScanOpts): Promise<ScanResult> {
  const registry = opts.registry ?? SCANNER_REGISTRY;
  const now = opts.now ?? Date.now;
  const startedAt = now();

  const ctx = buildScanContext(
    opts.bookmarks,
    opts.settings,
    startedAt,
    opts.mappings ?? [],
    opts.tags ?? [],
  );

  const candidates = selectScanners(registry, opts.scannerIds, opts.settings);

  const findings: HealthFinding[] = [];
  const scannerStats: Record<string, ScannerStats> = {};

  for (const scanner of candidates) {
    const scannerStart = now();
    const filtered = opts.bookmarks.filter((bm) => scanner.appliesTo(bm));
    let scannerFindings: HealthFinding[] = [];
    try {
      scannerFindings = await scanner.scan(filtered, ctx);
    } catch (err) {
      // Single-scanner failure must not poison the rest of the scan.
      // Log and move on; the stats entry below records count: 0.
      console.error(`[health] scanner "${scanner.id}" threw`, err);
    }
    findings.push(...scannerFindings);
    scannerStats[scanner.id] = {
      count: scannerFindings.length,
      durationMs: now() - scannerStart,
    };
  }

  return {
    startedAt,
    finishedAt: now(),
    totalScanned: opts.bookmarks.length,
    findings,
    scannerStats,
  };
}

/**
 * Build the shared ScanContext indexes once per scan. Step 2's
 * scanners read from these instead of iterating the corpus repeatedly.
 */
function buildScanContext(
  bookmarks: Bookmark[],
  settings: Settings,
  now: number,
  mappings: ChromeMapping[],
  tags: Tag[],
): ScanContext {
  const byCanonicalUrl = new Map<string, Bookmark[]>();
  const byDomain = new Map<string, Bookmark[]>();
  const byLowercasedTag = new Map<string, string[]>();
  const mappingsByBookmarkId = new Map<string, ChromeMapping[]>();
  const tagsByName = new Map<string, Tag>();

  for (const bm of bookmarks) {
    pushMulti(byCanonicalUrl, bm.canonicalUrl, bm);
    pushMulti(byDomain, bm.domain, bm);
    for (const tag of bm.tags) {
      const lower = tag.toLowerCase();
      const list = byLowercasedTag.get(lower);
      if (!list) {
        byLowercasedTag.set(lower, [tag]);
      } else if (!list.includes(tag)) {
        list.push(tag);
      }
    }
  }

  for (const mapping of mappings) {
    if (mapping.bookmarkId === null) continue;
    pushMulti(mappingsByBookmarkId, mapping.bookmarkId, mapping);
  }

  for (const tag of tags) {
    tagsByName.set(tag.name, tag);
  }

  return {
    now,
    settings,
    byCanonicalUrl,
    byDomain,
    byLowercasedTag,
    mappingsByBookmarkId,
    tagsByName,
  };
}

function pushMulti<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

/**
 * Pick the scanners that will actually run. Caller-supplied
 * `scannerIds` overrides settings; otherwise we honour
 * `settings.healthEnabledScanners` if present, falling back to the
 * scanner's `enabledByDefault`. Unknown ids in `scannerIds` are silently
 * skipped — adding logging here would just spam tests.
 */
function selectScanners(
  registry: ScannerRegistry,
  scannerIds: string[] | undefined,
  settings: Settings,
): Scanner[] {
  if (scannerIds) {
    const wanted = new Set(scannerIds);
    return registry.scanners.filter((s) => wanted.has(s.id));
  }
  const overrides = readEnabledScanners(settings);
  return registry.scanners.filter((s) => overrides[s.id] ?? s.enabledByDefault);
}

/**
 * Read the per-scanner enable map off Settings. Step 1 doesn't yet
 * extend Settings with `healthEnabledScanners` — that lands alongside
 * the UI in a later step — so we tolerate its absence and fall back to
 * the scanner's own default.
 */
function readEnabledScanners(settings: Settings): Record<string, boolean> {
  const maybe = (settings as Settings & { healthEnabledScanners?: Record<string, boolean> })
    .healthEnabledScanners;
  return maybe ?? {};
}
