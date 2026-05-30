/**
 * Bookmark Health type definitions.
 *
 * See docs/BOOKMARK_HEALTH.md for the full spec. This module is the
 * single source of truth for the shapes that scanners produce and the
 * registry consumes. Findings are NOT persisted — they are recomputed
 * on every scan and live in React state on the Health page.
 */
import type { Bookmark, ChromeMapping, Settings, Tag } from "../../shared/types";

export type HealthSeverity = "info" | "warn" | "error";

export type HealthFindingKind =
  | "stub-empty-title"
  | "stub-generic-title"
  | "stub-no-tags"
  | "stub-orphan-no-tag-no-folder"
  | "anomaly-tag-casing-collision"
  | "anomaly-folder-tag-mismatch"
  | "anomaly-broken-link"
  | "dup-shared-canonical"
  | "dup-fuzzy-query"
  | "dup-youtube-video-id"
  | "dup-title-similarity"
  | "dup-arxiv-abs-pdf";

export type HealthAction =
  | { type: "set-title"; bookmarkId: string; newTitle: string }
  | { type: "add-tag"; bookmarkId: string; tag: string }
  | { type: "rename-tag"; from: string; to: string }
  | { type: "merge-bookmarks"; survivorId: string; loserIds: string[] }
  | { type: "delete-bookmark"; bookmarkId: string };

export type HealthFinding = {
  /** ULID. Stable per (scannerId, fingerprint). */
  id: string;
  kind: HealthFindingKind;
  /** Scanner that produced the finding, e.g. "stub.empty-title". */
  scannerId: string;
  severity: HealthSeverity;
  /** Human-readable summary surfaced in the UI. */
  message: string;
  /** 1 entry for stubs, 2+ for soft-duplicate findings. */
  bookmarkIds: string[];
  /** Used for sorting/grouping; survivor candidate in duplicate findings. */
  primaryBookmarkId: string;
  /** Scanner-specific payload (e.g. matched tag pair, similarity score). */
  details: Record<string, unknown>;
  /** Suggested action the user can apply with one click. null = no auto-fix. */
  suggestedAction: HealthAction | null;
  /** Epoch ms; null = active. Dismissals are persisted in Settings. */
  dismissedAt: number | null;
  /** Epoch ms when the finding was produced. */
  createdAt: number;
};

/**
 * Pre-computed indexes shared across scanners. Built once per scan in
 * runHealthScan so each scanner does not re-iterate the corpus.
 *
 * The individual scanners populate these in step 2; for now the
 * registry skeleton just plumbs the shape through.
 */
export type ScanContext = {
  now: number;
  settings: Settings;
  byCanonicalUrl: Map<string, Bookmark[]>;
  byDomain: Map<string, Bookmark[]>;
  /** lowercase tag -> list of original casings observed in the corpus. */
  byLowercasedTag: Map<string, string[]>;
  /**
   * Chrome mappings keyed by bookmark id. Populated by runHealthScan from
   * the Dexie store before scanners run; tests can stub it directly.
   * Bookmarks with no mappings simply have no entry (rather than an
   * explicit empty array).
   */
  mappingsByBookmarkId: Map<string, ChromeMapping[]>;
  /**
   * Tags keyed by their canonical `name` field (not lowercased). Used by
   * scanners that need to consult `tag.mirrorFolderId` for
   * folder-tag-mismatch checks.
   */
  tagsByName: Map<string, Tag>;
};

/**
 * One registered scanner. `scan` is async so the broken-link scanner
 * (which reads bm.linkCheck populated by the existing dead-link sweep)
 * can fit the same interface as the deterministic stub/dup scanners.
 */
export type Scanner = {
  /** Stable id used in dismissal storage and the toggle UI, e.g. "stub.empty-title". */
  id: string;
  /** Label shown in the scanner toggle list. */
  label: string;
  kind: HealthFindingKind;
  defaultSeverity: HealthSeverity;
  enabledByDefault: boolean;
  /** Cheap per-bookmark pre-filter. Corpus-level scanners may return true unconditionally. */
  appliesTo: (bm: Bookmark) => boolean;
  /** Real work. Receives the pre-filtered corpus + shared indexes. */
  scan: (bookmarks: Bookmark[], ctx: ScanContext) => Promise<HealthFinding[]>;
};

export type ScannerRegistry = {
  scanners: Scanner[];
  byId: Map<string, Scanner>;
};

export type ScannerStats = {
  count: number;
  durationMs: number;
};

export type ScanResult = {
  startedAt: number;
  finishedAt: number;
  totalScanned: number;
  findings: HealthFinding[];
  /** Per-scanner timing + finding count. Keyed by scanner id. */
  scannerStats: Record<string, ScannerStats>;
};
