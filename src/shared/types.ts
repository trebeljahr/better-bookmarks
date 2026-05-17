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

export type Settings = {
  defaultRating: number;
  defaultNecessaryTime: number;
  defaultStatus: ReadStatus;
  syncEnabled: boolean;
  folderMirrorPolicy: FolderMirrorPolicy;
  conflictPolicy: ConflictPolicy;
  canonicalizationOverrides: CanonicalizationOverrides;
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
};
