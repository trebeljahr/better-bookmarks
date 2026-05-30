export type ContentType =
  | "unknown"
  | "article"
  | "paper"
  | "video"
  | "podcast"
  | "tool"
  | "library"
  | "repo"
  | "book"
  | "thread"
  | "course"
  | "reference";

export type ReadStatus = "unread" | "reading" | "read" | "archived";

export type CaptureSource =
  | "popup"
  | "chrome-import"
  | "chrome-sync"
  | "goodreads"
  | "pocket"
  | "manual";

export type LinkCheckReason = "client-error" | "server-error" | "network";

export type LinkCheckResult = {
  checkedAt: number;
  ok: boolean;
  httpStatus?: number;
  reason?: LinkCheckReason;
};

export type Bookmark = {
  id: string;
  canonicalUrl: string;
  originalUrl: string;
  domain: string;

  title: string;
  description: string;
  note: string;

  tags: string[];
  rating: number | null;
  necessaryTime: number | null;
  contentType: ContentType;
  language: string | null;

  status: ReadStatus;
  readAt: number | null;

  createdAt: number;
  updatedAt: number;
  capturedFrom: CaptureSource;

  linkCheck?: LinkCheckResult;
  enrichedAt?: number;
};

export type EdgeType = "related" | "sequel" | "source" | "rebuts" | "supersedes" | "translates";

export type EdgeSource = "manual" | "auto-domain" | "auto-tag" | "auto-author" | "auto-text";

export type Edge = {
  id: string;
  fromId: string;
  toId: string;
  type: EdgeType;
  note: string;
  directed: boolean;
  createdAt: number;
  source: EdgeSource;
};

export type Tag = {
  name: string;
  lowercaseName: string;
  parentName: string | null;
  color: string | null;
  description: string;
  mirrorFolderId: string | null;
  createdAt: number;
};

export type ChromeMapping = {
  chromeId: string;
  bookmarkId: string | null;
  isFolder: boolean;
  parentChromeId: string | null;
  lastSyncedAt: number;
  lastKnownEventAt: number;
  lastKnownTitle: string;
  lastKnownUrl: string;
  lastKnownParentId: string | null;
};

export type FolderMirrorPolicy = "off" | "all";
export type ConflictPolicy = "prefer-chrome" | "prefer-store" | "prefer-newer" | "ask";

export type HealthDismissedFinding = {
  scannerId: string;
  /** Stable hash of `bookmarkIds.sort().join("|")` — see Bookmark Health spec. */
  fingerprint: string;
  dismissedAt: number;
};

export type Settings = {
  defaultRating: number;
  defaultNecessaryTime: number;
  defaultStatus: ReadStatus;
  syncEnabled: boolean;
  folderMirrorPolicy: FolderMirrorPolicy;
  conflictPolicy: ConflictPolicy;
  canonicalizationOverrides: CanonicalizationOverrides;
  autoBackupEnabled: boolean;
  autoBackupIntervalMin: number;
  autoBackupKeepCount: number;
  deadLinkCheckEnabled: boolean;
  deadLinkSweepIntervalMin: number;
  deadLinkSweepBatchSize: number;
  deadLinkStaleAfterDays: number;
  networkEnrichmentEnabled: boolean;
  enrichmentSweepIntervalMin: number;
  enrichmentBatchSize: number;
  // When the user creates a bookmark via Chrome's native Cmd+D / star-icon
  // flow, surface the Better Bookmarks editor by opening the overview tab
  // with `#edit=<id>`. Off by default so the native flow stays silent.
  openOverviewOnNativeBookmark: boolean;
  // Bookmark Health (see docs/BOOKMARK_HEALTH.md). Per-scanner enable map
  // keyed by scanner id (e.g. "stub.empty-title"). Missing entries fall
  // back to the scanner's enabledByDefault.
  healthEnabledScanners: Record<string, boolean>;
  // Opt-in to the anomaly.broken-link scanner. Default false — the scan
  // only reads bm.linkCheck populated by the existing dead-link sweep, but
  // we keep the toggle behind a setting so users see the rule disabled
  // until they actively turn it on.
  healthBrokenLinkCheckEnabled: boolean;
  // Persisted dismissals so the same finding doesn't keep reappearing.
  // Dismissals are device-local (never mirrored to chrome.storage.sync).
  healthDismissedFindings: HealthDismissedFinding[];
};

export type CanonicalizationOverrides = {
  extraStrippedParams: string[];
  perDomain: Record<string, { keepFragments?: boolean; stripLocale?: boolean }>;
};

export const DEFAULT_SETTINGS: Settings = {
  defaultRating: 5,
  defaultNecessaryTime: 10,
  defaultStatus: "unread",
  syncEnabled: true,
  folderMirrorPolicy: "off",
  conflictPolicy: "prefer-newer",
  canonicalizationOverrides: {
    extraStrippedParams: [],
    perDomain: {},
  },
  autoBackupEnabled: true,
  autoBackupIntervalMin: 1440,
  autoBackupKeepCount: 7,
  deadLinkCheckEnabled: true,
  deadLinkSweepIntervalMin: 360,
  deadLinkSweepBatchSize: 50,
  deadLinkStaleAfterDays: 30,
  networkEnrichmentEnabled: false,
  enrichmentSweepIntervalMin: 720,
  enrichmentBatchSize: 25,
  openOverviewOnNativeBookmark: false,
  healthEnabledScanners: {},
  healthBrokenLinkCheckEnabled: false,
  healthDismissedFindings: [],
};
