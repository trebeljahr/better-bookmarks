/**
 * Health scanner fixtures.
 *
 * Mirrors `src/core/canonicalizer/fixtures.ts`: each fixture is a
 * declarative case (corpus + expected findings) that the test file
 * iterates over. Adding a new rule means appending a fixture here,
 * not editing the test file.
 *
 * Every fixture targets one scanner via `scannerId` so the test
 * harness can run only that scanner and compare the exact output
 * shape. The expected list is normalised (kind / sorted bookmarkIds /
 * severity) — message text and timestamps are intentionally omitted.
 */
import type { Bookmark, ChromeMapping, Settings, Tag } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";
import type { HealthFindingKind, HealthSeverity } from "./types";

export type HealthFixtureBookmark = Partial<Bookmark> & {
  id: string;
  canonicalUrl: string;
};

export type ExpectedFinding = {
  kind: HealthFindingKind;
  /** Pre-sorted for comparison. */
  bookmarkIds: string[];
  severity: HealthSeverity;
};

export type HealthScanFixture = {
  name: string;
  scannerId: string;
  corpus: HealthFixtureBookmark[];
  mappings?: ChromeMapping[];
  tags?: Tag[];
  settings?: Partial<Settings>;
  expected: ExpectedFinding[];
};

/**
 * Hydrate a fixture bookmark to a full Bookmark. Sane defaults so a
 * fixture only specifies the fields it actually cares about (title,
 * tags, canonicalUrl). Mirrors the `bookmarkSeed` helper in
 * src/core/storage/bookmarks.test.ts.
 */
export function hydrateFixtureBookmark(input: HealthFixtureBookmark): Bookmark {
  return {
    id: input.id,
    canonicalUrl: input.canonicalUrl,
    originalUrl: input.originalUrl ?? input.canonicalUrl,
    domain: input.domain ?? safeDomainOf(input.canonicalUrl),
    title: input.title ?? "",
    description: input.description ?? "",
    note: input.note ?? "",
    tags: input.tags ?? [],
    rating: input.rating ?? null,
    necessaryTime: input.necessaryTime ?? null,
    contentType: input.contentType ?? "unknown",
    language: input.language ?? null,
    status: input.status ?? "unread",
    readAt: input.readAt ?? null,
    createdAt: input.createdAt ?? 1,
    updatedAt: input.updatedAt ?? 1,
    capturedFrom: input.capturedFrom ?? "manual",
    linkCheck: input.linkCheck,
    enrichedAt: input.enrichedAt,
  };
}

function safeDomainOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * Make a ChromeMapping with sane defaults. Fixtures usually only
 * care about `bookmarkId` and `parentChromeId`.
 */
export function mapping(
  bookmarkId: string,
  parentChromeId: string | null,
  overrides: Partial<ChromeMapping> = {},
): ChromeMapping {
  return {
    chromeId: overrides.chromeId ?? `chrome-${bookmarkId}`,
    bookmarkId,
    isFolder: false,
    parentChromeId,
    lastSyncedAt: 0,
    lastKnownEventAt: 0,
    lastKnownTitle: "",
    lastKnownUrl: "",
    lastKnownParentId: parentChromeId,
    ...overrides,
  };
}

/** Make a Tag with sane defaults. */
export function tag(name: string, overrides: Partial<Tag> = {}): Tag {
  return {
    name,
    lowercaseName: name.toLowerCase(),
    parentName: null,
    color: null,
    description: "",
    mirrorFolderId: null,
    createdAt: 0,
    ...overrides,
  };
}

export const FIXTURE_SETTINGS: Settings = { ...DEFAULT_SETTINGS };

// =====================================================================
// Fixtures
// =====================================================================

export const FIXTURES: HealthScanFixture[] = [
  // ----- stub.empty-title ---------------------------------------------

  {
    name: "stub.empty-title: blank title surfaces a warn",
    scannerId: "stub.empty-title",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "" }],
    expected: [{ kind: "stub-empty-title", bookmarkIds: ["a"], severity: "warn" }],
  },
  {
    name: "stub.empty-title: whitespace-only title surfaces a warn",
    scannerId: "stub.empty-title",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "   \t  " }],
    expected: [{ kind: "stub-empty-title", bookmarkIds: ["a"], severity: "warn" }],
  },
  {
    name: "stub.empty-title: real title does not fire",
    scannerId: "stub.empty-title",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "Real Title" }],
    expected: [],
  },

  // ----- stub.generic-title -------------------------------------------

  {
    name: 'stub.generic-title: "Untitled" surfaces info',
    scannerId: "stub.generic-title",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "Untitled" }],
    expected: [{ kind: "stub-generic-title", bookmarkIds: ["a"], severity: "info" }],
  },
  {
    name: 'stub.generic-title: "(no title)" surfaces info',
    scannerId: "stub.generic-title",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "(no title)" }],
    expected: [{ kind: "stub-generic-title", bookmarkIds: ["a"], severity: "info" }],
  },
  {
    name: 'stub.generic-title: bare host "example.com" surfaces info',
    scannerId: "stub.generic-title",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "example.com" }],
    expected: [{ kind: "stub-generic-title", bookmarkIds: ["a"], severity: "info" }],
  },
  {
    name: "stub.generic-title: real title does not fire",
    scannerId: "stub.generic-title",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "An actual headline" }],
    expected: [],
  },
  {
    name: "stub.generic-title: empty title is left to stub.empty-title",
    scannerId: "stub.generic-title",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "" }],
    expected: [],
  },

  // ----- stub.no-tags --------------------------------------------------

  {
    name: "stub.no-tags: empty tags array surfaces info",
    scannerId: "stub.no-tags",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "Title", tags: [] }],
    expected: [{ kind: "stub-no-tags", bookmarkIds: ["a"], severity: "info" }],
  },
  {
    name: "stub.no-tags: tagged bookmark does not fire",
    scannerId: "stub.no-tags",
    corpus: [
      { id: "a", canonicalUrl: "https://example.com/foo", title: "Title", tags: ["learning"] },
    ],
    expected: [],
  },

  // ----- stub.orphan-no-tag-no-folder ---------------------------------

  {
    name: "stub.orphan-no-tag-no-folder: untagged + no mapping surfaces warn",
    scannerId: "stub.orphan-no-tag-no-folder",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "Title", tags: [] }],
    expected: [{ kind: "stub-orphan-no-tag-no-folder", bookmarkIds: ["a"], severity: "warn" }],
  },
  {
    name: "stub.orphan-no-tag-no-folder: untagged + root-only mapping surfaces warn",
    scannerId: "stub.orphan-no-tag-no-folder",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "Title", tags: [] }],
    mappings: [mapping("a", "1")], // Chrome "other bookmarks" root
    expected: [{ kind: "stub-orphan-no-tag-no-folder", bookmarkIds: ["a"], severity: "warn" }],
  },
  {
    name: "stub.orphan-no-tag-no-folder: untagged + non-root mapping does not fire",
    scannerId: "stub.orphan-no-tag-no-folder",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/foo", title: "Title", tags: [] }],
    mappings: [mapping("a", "folder-1")],
    expected: [],
  },
  {
    name: "stub.orphan-no-tag-no-folder: tagged bookmark filters out before mapping check",
    scannerId: "stub.orphan-no-tag-no-folder",
    corpus: [
      { id: "a", canonicalUrl: "https://example.com/foo", title: "Title", tags: ["learning"] },
    ],
    expected: [],
  },

  // ----- anomaly.tag-casing-collision ----------------------------------

  {
    name: 'anomaly.tag-casing-collision: "React"/"react" coexist surfaces warn',
    scannerId: "anomaly.tag-casing-collision",
    corpus: [
      { id: "a", canonicalUrl: "https://example.com/a", tags: ["React"] },
      { id: "b", canonicalUrl: "https://example.com/b", tags: ["react"] },
      { id: "c", canonicalUrl: "https://example.com/c", tags: ["react"] },
    ],
    expected: [
      { kind: "anomaly-tag-casing-collision", bookmarkIds: ["a", "b", "c"], severity: "warn" },
    ],
  },
  {
    name: "anomaly.tag-casing-collision: single-casing tag does not fire",
    scannerId: "anomaly.tag-casing-collision",
    corpus: [
      { id: "a", canonicalUrl: "https://example.com/a", tags: ["react"] },
      { id: "b", canonicalUrl: "https://example.com/b", tags: ["react"] },
    ],
    expected: [],
  },

  // ----- anomaly.folder-tag-mismatch -----------------------------------

  {
    name: "anomaly.folder-tag-mismatch: mirrored tag but bookmark filed elsewhere surfaces info",
    scannerId: "anomaly.folder-tag-mismatch",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/a", tags: ["react"] }],
    mappings: [mapping("a", "folder-other")],
    tags: [tag("react", { mirrorFolderId: "folder-react" })],
    expected: [{ kind: "anomaly-folder-tag-mismatch", bookmarkIds: ["a"], severity: "info" }],
  },
  {
    name: "anomaly.folder-tag-mismatch: filed under mirror folder does not fire",
    scannerId: "anomaly.folder-tag-mismatch",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/a", tags: ["react"] }],
    mappings: [mapping("a", "folder-react")],
    tags: [tag("react", { mirrorFolderId: "folder-react" })],
    expected: [],
  },
  {
    name: "anomaly.folder-tag-mismatch: tag without mirror does not fire",
    scannerId: "anomaly.folder-tag-mismatch",
    corpus: [{ id: "a", canonicalUrl: "https://example.com/a", tags: ["react"] }],
    mappings: [mapping("a", "folder-other")],
    tags: [tag("react")],
    expected: [],
  },

  // ----- anomaly.broken-link -------------------------------------------

  {
    name: "anomaly.broken-link: flag on and linkCheck failed surfaces warn",
    scannerId: "anomaly.broken-link",
    corpus: [
      {
        id: "a",
        canonicalUrl: "https://example.com/dead",
        title: "Dead",
        linkCheck: { checkedAt: 100, ok: false, httpStatus: 404, reason: "client-error" },
      },
    ],
    settings: { healthBrokenLinkCheckEnabled: true } as Partial<Settings>,
    expected: [{ kind: "anomaly-broken-link", bookmarkIds: ["a"], severity: "warn" }],
  },
  {
    name: "anomaly.broken-link: flag off does not fire even if linkCheck failed",
    scannerId: "anomaly.broken-link",
    corpus: [
      {
        id: "a",
        canonicalUrl: "https://example.com/dead",
        title: "Dead",
        linkCheck: { checkedAt: 100, ok: false, httpStatus: 404, reason: "client-error" },
      },
    ],
    settings: { healthBrokenLinkCheckEnabled: false } as Partial<Settings>,
    expected: [],
  },
  {
    name: "anomaly.broken-link: flag on, ok=true does not fire",
    scannerId: "anomaly.broken-link",
    corpus: [
      {
        id: "a",
        canonicalUrl: "https://example.com/ok",
        title: "OK",
        linkCheck: { checkedAt: 100, ok: true, httpStatus: 200 },
      },
    ],
    settings: { healthBrokenLinkCheckEnabled: true } as Partial<Settings>,
    expected: [],
  },

  // ----- soft-dup.shared-canonical -------------------------------------

  {
    name: "soft-dup.shared-canonical: two records same canonicalUrl surfaces error",
    scannerId: "soft-dup.shared-canonical",
    corpus: [
      { id: "a", canonicalUrl: "https://example.com/article", title: "A", createdAt: 100 },
      { id: "b", canonicalUrl: "https://example.com/article", title: "B", createdAt: 200 },
    ],
    expected: [{ kind: "dup-shared-canonical", bookmarkIds: ["a", "b"], severity: "error" }],
  },
  {
    name: "soft-dup.shared-canonical: distinct canonicals do not fire",
    scannerId: "soft-dup.shared-canonical",
    corpus: [
      { id: "a", canonicalUrl: "https://example.com/a", title: "A" },
      { id: "b", canonicalUrl: "https://example.com/b", title: "B" },
    ],
    expected: [],
  },

  // ----- soft-dup.fuzzy-query ------------------------------------------

  {
    name: "soft-dup.fuzzy-query: same path different query surfaces info",
    scannerId: "soft-dup.fuzzy-query",
    corpus: [
      {
        id: "a",
        canonicalUrl: "https://example.com/article?ref=newsletter",
        title: "A",
        createdAt: 100,
      },
      {
        id: "b",
        canonicalUrl: "https://example.com/article?ref=twitter",
        title: "B",
        createdAt: 200,
      },
    ],
    expected: [{ kind: "dup-fuzzy-query", bookmarkIds: ["a", "b"], severity: "info" }],
  },
  {
    name: "soft-dup.fuzzy-query: same path same query does not fire (handled by unique index)",
    scannerId: "soft-dup.fuzzy-query",
    corpus: [
      { id: "a", canonicalUrl: "https://example.com/article?ref=newsletter", title: "A" },
      { id: "b", canonicalUrl: "https://example.com/article?ref=newsletter", title: "B" },
    ],
    expected: [],
  },
  {
    name: "soft-dup.fuzzy-query: different path does not fire",
    scannerId: "soft-dup.fuzzy-query",
    corpus: [
      { id: "a", canonicalUrl: "https://example.com/article-one", title: "A" },
      { id: "b", canonicalUrl: "https://example.com/article-two", title: "B" },
    ],
    expected: [],
  },

  // ----- soft-dup.youtube-video-id -------------------------------------

  {
    name: "soft-dup.youtube-video-id: two watch URLs same v= surfaces info",
    scannerId: "soft-dup.youtube-video-id",
    corpus: [
      {
        id: "a",
        canonicalUrl: "https://www.youtube.com/watch?v=abc123",
        title: "A",
        createdAt: 100,
      },
      {
        id: "b",
        canonicalUrl: "https://www.youtube.com/watch?v=abc123&extra=1",
        title: "B",
        createdAt: 200,
      },
    ],
    expected: [{ kind: "dup-youtube-video-id", bookmarkIds: ["a", "b"], severity: "info" }],
  },
  {
    name: "soft-dup.youtube-video-id: different v= does not fire",
    scannerId: "soft-dup.youtube-video-id",
    corpus: [
      { id: "a", canonicalUrl: "https://www.youtube.com/watch?v=abc123", title: "A" },
      { id: "b", canonicalUrl: "https://www.youtube.com/watch?v=xyz789", title: "B" },
    ],
    expected: [],
  },

  // ----- soft-dup.title-similarity -------------------------------------

  {
    name: "soft-dup.title-similarity: Damerau-Levenshtein >= 0.9 same eTLD+1 surfaces info",
    scannerId: "soft-dup.title-similarity",
    corpus: [
      {
        id: "a",
        canonicalUrl: "https://example.com/post-1",
        title: "Understanding Closures in JavaScript",
        createdAt: 100,
      },
      {
        id: "b",
        canonicalUrl: "https://example.com/post-2",
        title: "Understanding Closures in Javascript",
        createdAt: 200,
      },
    ],
    expected: [{ kind: "dup-title-similarity", bookmarkIds: ["a", "b"], severity: "info" }],
  },
  {
    name: "soft-dup.title-similarity: >= 0.9 different eTLD+1 does not fire",
    scannerId: "soft-dup.title-similarity",
    corpus: [
      {
        id: "a",
        canonicalUrl: "https://siteone.com/post",
        title: "Understanding Closures in JavaScript",
      },
      {
        id: "b",
        canonicalUrl: "https://sitetwo.com/post",
        title: "Understanding Closures in JavaScript",
      },
    ],
    expected: [],
  },
  {
    name: "soft-dup.title-similarity: low similarity does not fire",
    scannerId: "soft-dup.title-similarity",
    corpus: [
      { id: "a", canonicalUrl: "https://example.com/a", title: "Quantum Mechanics 101" },
      { id: "b", canonicalUrl: "https://example.com/b", title: "How to Bake Sourdough" },
    ],
    expected: [],
  },

  // ----- soft-dup.arxiv-abs-pdf ----------------------------------------

  {
    name: "soft-dup.arxiv-abs-pdf: abs+pdf survivors collapse surfaces warn",
    scannerId: "soft-dup.arxiv-abs-pdf",
    corpus: [
      {
        id: "a",
        canonicalUrl: "https://arxiv.org/abs/2305.12345",
        title: "Paper abs",
        createdAt: 100,
      },
      {
        id: "b",
        canonicalUrl: "https://arxiv.org/pdf/2305.12345",
        title: "Paper pdf",
        createdAt: 200,
      },
    ],
    expected: [{ kind: "dup-arxiv-abs-pdf", bookmarkIds: ["a", "b"], severity: "warn" }],
  },
  {
    name: "soft-dup.arxiv-abs-pdf: distinct papers do not fire",
    scannerId: "soft-dup.arxiv-abs-pdf",
    corpus: [
      { id: "a", canonicalUrl: "https://arxiv.org/abs/2305.12345", title: "Paper A" },
      { id: "b", canonicalUrl: "https://arxiv.org/abs/9999.00001", title: "Paper B" },
    ],
    expected: [],
  },
  {
    name: "soft-dup.arxiv-abs-pdf: versioned suffix still clusters",
    scannerId: "soft-dup.arxiv-abs-pdf",
    corpus: [
      {
        id: "a",
        canonicalUrl: "https://arxiv.org/abs/2305.12345",
        title: "v1",
        createdAt: 100,
      },
      {
        id: "b",
        canonicalUrl: "https://arxiv.org/abs/2305.12345v2",
        title: "v2",
        createdAt: 200,
      },
    ],
    expected: [{ kind: "dup-arxiv-abs-pdf", bookmarkIds: ["a", "b"], severity: "warn" }],
  },
];
