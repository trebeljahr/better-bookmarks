/**
 * Dev-only sample-bookmark loader.
 *
 * Populates IndexedDB with a small, curated, non-PII sample so a reviewer
 * (Chrome Web Store, contributor, or one-off tester) can see the extension
 * working end-to-end without importing their own real bookmarks or their
 * live Chrome tree.
 *
 * The set is picked, not generated:
 *  - 10 domains, spanning the "shapes" the app cares about (video, papers,
 *    articles, reference docs, code hosting, news, social, forum, blog).
 *  - Three domains (YouTube, X/Twitter, Medium) also emit extra URL
 *    variants with tracking params that `canonicalize` is guaranteed to
 *    strip. The loader intentionally attempts every variant so the return
 *    value can prove dedup is working — attempts > uniqueBookmarksInDB.
 *  - A small handful of tags (video, article, paper, reference, code,
 *    news, social) — enough to populate the tag sidebar without pretending
 *    to be a real taxonomy.
 *  - No personal names, addresses, e-mails, or identifiers. Every URL is
 *    a public well-known page (MDN, Wikipedia, arXiv landing pages, and
 *    similar) or a synthesised deterministic slug on a public host.
 *
 * Deliberately *not* gated internally — the caller (the DEV-only button
 * in `Overview.tsx`) is the gate via `import.meta.env.DEV`. Keeping the
 * gate at the call site lets tests exercise the loader without patching
 * Vite env, and keeps the module tree-shakeable out of production builds.
 */

import { upsertBookmark } from "@/core/storage/bookmarks";

/** Descriptor for one curated sample bookmark before it hits the DB. */
type SampleEntry = {
  /** The URL as it would appear in the wild (pre-canonicalisation). */
  url: string;
  title: string;
  description?: string;
  tags?: readonly string[];
  rating?: number;
};

export type LoadSampleReport = {
  /** Total variant URLs we attempted to insert (unique + tracking-param dupes). */
  attempted: number;
  /** Rows that landed as new bookmarks. */
  created: number;
  /** Attempts that collapsed onto an existing canonical URL. */
  merged: number;
  /** Attempts that `canonicalize` rejected. Should always be zero for the
   *  curated set; surfaced so the caller can flag drift if a rule ever
   *  starts rejecting one of our sample URLs. */
  rejected: number;
  /** Attempts that threw an unexpected error (e.g. IndexedDB unavailable). */
  errored: number;
  /** Convenience: `attempted - created - rejected - errored`. */
  dedupCollapsed: number;
};

// ---------------------------------------------------------------------------
// Curated sample
// ---------------------------------------------------------------------------
//
// Ten domains × ten unique canonical URLs = 100 canonical bookmarks.
// Three of those domains (YouTube, X, Medium) get three extra variants each
// with tracking params, so the loader attempts 109 inserts and the DB ends
// up with 100 rows — a live, reviewer-visible demonstration of dedup.
//
// URLs are constructed programmatically from short seed lists to keep this
// file readable, but nothing here is random — same input, same output,
// every build.

const YT_IDS = [
  "dQw4w9WgXcQ",
  "aircAruvnKk",
  "spUNpyF58BY",
  "9bZkp7q19f0",
  "kJQP7kiw5Fk",
  "hFZFjoX2cGg",
  "OttRV5ykP7A",
  "JZbcTQrsy_c",
  "y3H6iE1qMFQ",
  "5dqTVi3JR2Y",
] as const;

const HN_ITEMS = [
  38001234, 38005678, 38109876, 38210987, 38315432, 38442190, 38554321, 38678901, 38789012,
  38890123,
] as const;

const MDN_PAGES = [
  "Web/JavaScript/Reference/Global_Objects/Array",
  "Web/JavaScript/Reference/Global_Objects/Promise",
  "Web/API/Fetch_API/Using_Fetch",
  "Web/CSS/grid-template-columns",
  "Web/CSS/Flexible_Box_Layout",
  "Web/API/IndexedDB_API",
  "Web/API/Service_Worker_API",
  "Web/HTTP/Headers/Content-Security-Policy",
  "Web/Accessibility/ARIA",
  "Web/API/History_API",
] as const;

const WIKIPEDIA_PAGES = [
  "Bookmark_(digital)",
  "Uniform_Resource_Locator",
  "IndexedDB",
  "Chrome_extension",
  "Manifest_V3",
  "Full-text_search",
  "Levenshtein_distance",
  "Trie",
  "Bloom_filter",
  "Vector_space_model",
] as const;

const GITHUB_REPOS = [
  "microsoft/vscode",
  "facebook/react",
  "vercel/next.js",
  "denoland/deno",
  "oven-sh/bun",
  "biomejs/biome",
  "vitest-dev/vitest",
  "dexie/Dexie.js",
  "wxt-dev/wxt",
  "huggingface/transformers.js",
] as const;

const STACKOVERFLOW_QS = [
  { id: 105034, slug: "how-do-i-create-a-guid-uuid" },
  { id: 149055, slug: "how-do-i-check-if-a-directory-exists-in-python" },
  { id: 194812, slug: "how-can-i-get-a-list-of-user-groups" },
  { id: 610406, slug: "how-to-check-if-a-string-contains-a-substring-in-bash" },
  { id: 707107, slug: "sql-select-only-rows-with-max-value-on-a-column" },
  { id: 901115, slug: "how-do-i-check-whether-a-file-exists-without-exceptions" },
  { id: 1219839, slug: "check-if-a-value-is-an-object-in-javascript" },
  { id: 1789945, slug: "how-to-check-if-a-string-contains-a-word-in-php" },
  { id: 2465921, slug: "how-can-i-tell-git-to-ignore-changes-to-a-file" },
  { id: 3437219, slug: "flatten-a-nested-list-of-lists-in-python" },
] as const;

const X_STATUSES = [
  { user: "dan_abramov", id: "1683312001234567890" },
  { user: "adamwathan", id: "1683312101234567891" },
  { user: "youyuxi", id: "1683312201234567892" },
  { user: "rich_harris", id: "1683312301234567893" },
  { user: "sebmarkbage", id: "1683312401234567894" },
  { user: "ryanflorence", id: "1683312501234567895" },
  { user: "kentcdodds", id: "1683312601234567896" },
  { user: "mjackson", id: "1683312701234567897" },
  { user: "wesbos", id: "1683312801234567898" },
  { user: "jacobmparis", id: "1683312901234567899" },
] as const;

const ARXIV_IDS = [
  "1706.03762",
  "1810.04805",
  "2005.14165",
  "2112.10752",
  "2201.11903",
  "2203.02155",
  "2205.11916",
  "2302.13971",
  "2303.08774",
  "2401.02385",
] as const;

const MEDIUM_POSTS = [
  { user: "@dan_abramov", slug: "before-you-memo-a12c34d56789" },
  { user: "@addyosmani", slug: "web-performance-recipes-b23c45e67890" },
  { user: "@jakearchibald", slug: "the-service-worker-lifecycle-c34d56f78901" },
  { user: "@paul_irish", slug: "requestidlecallback-scheduling-d45e67a89012" },
  { user: "@rachelnabors", slug: "css-transitions-under-the-hood-e56f78b90123" },
  { user: "@lea_verou", slug: "conic-gradients-in-css-f67a89c01234" },
  { user: "@sarahmei", slug: "why-code-reviews-matter-a78b90d12345" },
  { user: "@sindresorhus", slug: "small-modules-large-impact-b89c01e23456" },
  { user: "@tj_holowaychuk", slug: "async-await-patterns-c90d12f34567" },
  { user: "@tomdale", slug: "rendering-pipelines-explained-d01e23a45678" },
] as const;

const DOCS_RS_CRATES = [
  { crate: "serde", path: "serde/index.html" },
  { crate: "tokio", path: "tokio/index.html" },
  { crate: "reqwest", path: "reqwest/blocking/index.html" },
  { crate: "clap", path: "clap/derive/index.html" },
  { crate: "anyhow", path: "anyhow/index.html" },
  { crate: "thiserror", path: "thiserror/index.html" },
  { crate: "regex", path: "regex/index.html" },
  { crate: "rayon", path: "rayon/iter/index.html" },
  { crate: "wasm-bindgen", path: "wasm_bindgen/index.html" },
  { crate: "hyper", path: "hyper/server/index.html" },
] as const;

/**
 * Build the flat entry list.
 *
 * Ordering matches the DB-insert order the loader will use, so a reviewer
 * scrolling the overview after clicking the button sees the shapes in a
 * predictable, easy-to-narrate sequence.
 */
function buildSample(): SampleEntry[] {
  const out: SampleEntry[] = [];

  // 1. YouTube — video shape. Base URLs + tracking-param dupes (utm_source,
  //    utm_medium, fbclid).
  for (let i = 0; i < YT_IDS.length; i++) {
    const id = YT_IDS[i]!;
    out.push({
      url: `https://www.youtube.com/watch?v=${id}`,
      title: `Sample video ${i + 1} — YouTube`,
      description: "Curated dev-sample video entry.",
      tags: ["video"],
    });
  }
  out.push({
    url: `https://www.youtube.com/watch?v=${YT_IDS[0]}&utm_source=newsletter`,
    title: "YouTube (utm_source duplicate)",
    tags: ["video"],
  });
  out.push({
    url: `https://www.youtube.com/watch?v=${YT_IDS[1]}&utm_medium=email`,
    title: "YouTube (utm_medium duplicate)",
    tags: ["video"],
  });
  out.push({
    url: `https://www.youtube.com/watch?v=${YT_IDS[2]}&fbclid=IwAR12345`,
    title: "YouTube (fbclid duplicate)",
    tags: ["video"],
  });

  // 2. Hacker News — public threads, no PII.
  for (let i = 0; i < HN_ITEMS.length; i++) {
    out.push({
      url: `https://news.ycombinator.com/item?id=${HN_ITEMS[i]}`,
      title: `Sample HN thread ${i + 1}`,
      tags: ["news"],
    });
  }

  // 3. MDN — reference docs.
  for (let i = 0; i < MDN_PAGES.length; i++) {
    out.push({
      url: `https://developer.mozilla.org/en-US/docs/${MDN_PAGES[i]}`,
      title: `MDN: ${MDN_PAGES[i]!.split("/").pop()}`,
      tags: ["reference"],
    });
  }

  // 4. Wikipedia — reference articles.
  for (let i = 0; i < WIKIPEDIA_PAGES.length; i++) {
    out.push({
      url: `https://en.wikipedia.org/wiki/${WIKIPEDIA_PAGES[i]}`,
      title: `${WIKIPEDIA_PAGES[i]!.replaceAll("_", " ")} — Wikipedia`,
      tags: ["reference", "article"],
    });
  }

  // 5. GitHub — code repos.
  for (let i = 0; i < GITHUB_REPOS.length; i++) {
    out.push({
      url: `https://github.com/${GITHUB_REPOS[i]}`,
      title: `${GITHUB_REPOS[i]} on GitHub`,
      tags: ["code"],
      rating: i === 0 ? 9 : undefined,
    });
  }

  // 6. Stack Overflow — Q&A.
  for (let i = 0; i < STACKOVERFLOW_QS.length; i++) {
    const q = STACKOVERFLOW_QS[i]!;
    out.push({
      url: `https://stackoverflow.com/questions/${q.id}/${q.slug}`,
      title: `Stack Overflow #${q.id}`,
      tags: ["code", "reference"],
    });
  }

  // 7. X/Twitter — social. Base + tracking-param dupes (s, source).
  //    `canonicalize` rewrites `twitter.com` → `x.com` and drops `s`.
  for (let i = 0; i < X_STATUSES.length; i++) {
    const s = X_STATUSES[i]!;
    out.push({
      url: `https://x.com/${s.user}/status/${s.id}`,
      title: `Sample post by @${s.user}`,
      tags: ["social"],
    });
  }
  out.push({
    url: `https://twitter.com/${X_STATUSES[0]!.user}/status/${X_STATUSES[0]!.id}?s=20`,
    title: "X (twitter.com + ?s= duplicate)",
    tags: ["social"],
  });
  out.push({
    url: `https://twitter.com/${X_STATUSES[1]!.user}/status/${X_STATUSES[1]!.id}?s=46`,
    title: "X (twitter.com + ?s= duplicate 2)",
    tags: ["social"],
  });
  out.push({
    url: `https://x.com/${X_STATUSES[2]!.user}/status/${X_STATUSES[2]!.id}?utm_source=share`,
    title: "X (utm_source duplicate)",
    tags: ["social"],
  });

  // 8. arXiv — papers.
  for (let i = 0; i < ARXIV_IDS.length; i++) {
    out.push({
      url: `https://arxiv.org/abs/${ARXIV_IDS[i]}`,
      title: `arXiv:${ARXIV_IDS[i]}`,
      tags: ["paper"],
    });
  }

  // 9. Medium — long-form articles. Base + tracking-param dupes.
  for (let i = 0; i < MEDIUM_POSTS.length; i++) {
    const p = MEDIUM_POSTS[i]!;
    out.push({
      url: `https://medium.com/${p.user}/${p.slug}`,
      title: `${p.slug.replaceAll("-", " ")} — Medium`,
      tags: ["article"],
    });
  }
  out.push({
    url: `https://medium.com/${MEDIUM_POSTS[0]!.user}/${MEDIUM_POSTS[0]!.slug}?source=friends_link&sk=abc`,
    title: "Medium (source= duplicate)",
    tags: ["article"],
  });
  out.push({
    url: `https://medium.com/${MEDIUM_POSTS[1]!.user}/${MEDIUM_POSTS[1]!.slug}?utm_source=digest`,
    title: "Medium (utm_source duplicate)",
    tags: ["article"],
  });
  out.push({
    url: `https://medium.com/${MEDIUM_POSTS[2]!.user}/${MEDIUM_POSTS[2]!.slug}?gi=1234abcd`,
    title: "Medium (gi= duplicate)",
    tags: ["article"],
  });

  // 10. docs.rs — Rust crate docs.
  for (let i = 0; i < DOCS_RS_CRATES.length; i++) {
    const c = DOCS_RS_CRATES[i]!;
    out.push({
      url: `https://docs.rs/${c.crate}/latest/${c.path}`,
      title: `${c.crate} — docs.rs`,
      tags: ["code", "reference"],
    });
  }

  return out;
}

/** Public — exposed for tests so we can assert the shape without hitting the DB. */
export function buildSampleBookmarkSet(): readonly SampleEntry[] {
  return buildSample();
}

/**
 * Insert the curated sample into IndexedDB via the real upsert path.
 *
 * Uses `upsertBookmark`, not a direct Dexie write, so tracking-param
 * variants exercise the actual canonicalizer + merge logic — the same
 * path a live import walks — and the returned report reflects real
 * production behaviour rather than a fixture-only shortcut.
 *
 * Serialises inserts (no `Promise.all`) so the Dexie transactions run
 * one after another and the counters are deterministic. 109 inserts is
 * a rounding error, not a hot path.
 */
export async function loadSampleBookmarks(): Promise<LoadSampleReport> {
  const entries = buildSample();
  const report: LoadSampleReport = {
    attempted: entries.length,
    created: 0,
    merged: 0,
    rejected: 0,
    errored: 0,
    dedupCollapsed: 0,
  };

  for (const entry of entries) {
    try {
      const result = await upsertBookmark({
        rawUrl: entry.url,
        title: entry.title,
        description: entry.description ?? entry.title,
        tags: entry.tags ? [...entry.tags] : undefined,
        rating: entry.rating ?? null,
        capturedFrom: "manual",
      });
      if (!result.ok) {
        report.rejected += 1;
        continue;
      }
      if (result.created) report.created += 1;
      else report.merged += 1;
    } catch {
      report.errored += 1;
    }
  }

  report.dedupCollapsed = report.attempted - report.created - report.rejected - report.errored;
  return report;
}
