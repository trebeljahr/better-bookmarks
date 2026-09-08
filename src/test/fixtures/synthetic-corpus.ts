/**
 * Deterministic synthetic Chrome bookmark corpus.
 *
 * Single source of truth for every "corpus-shape" test — first-run import,
 * search benchmarks, bulk tag/delete, dedup counts, etc. See
 * `docs/TESTING.md` for the documented shape and stat invariants.
 *
 * Design notes:
 *  - Deterministic. Every random choice comes from a mulberry32 PRNG seeded
 *    off `options.seed` (default is fixed). No `Date.now`, `Math.random`, or
 *    `crypto.randomUUID` anywhere in this file. Same input → same output,
 *    every process, every machine.
 *  - Two views. The raw `tree` is what Chrome hands us (with duplicate URLs
 *    and tracking-param variants). The flat `bookmarks[]` is the deduped,
 *    canonicalised list that `importChromeTree` would produce — ready to
 *    seed IndexedDB directly for tests that don't want to walk the tree.
 *  - Canonicalisation is delegated to the real `canonicalize` module rather
 *    than reimplemented. That way "which variants merge" tracks the actual
 *    rules and never drifts.
 */

import { canonicalize } from "@/core/canonicalizer";
import { dedupTags } from "@/core/storage/bookmarks";
import { ancestorFolderNames } from "@/core/sync/folderMirror";
import type { Bookmark, CaptureSource, ContentType, ReadStatus } from "@/shared/types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type SyntheticCorpusOptions = {
  /** Approximate number of URL nodes in the tree. Default 20,000. */
  size?: number;
  /** PRNG seed. Default is a fixed value so builds are reproducible. */
  seed?: number;
};

export type SyntheticCorpusStats = {
  /** Number of URL-bearing nodes in the raw tree (before canonicalisation). */
  urlNodesInTree: number;
  /** Number of folder nodes in the raw tree (excludes synthetic root id "0"). */
  folderNodesInTree: number;
  /** Number of entries in the flat `bookmarks[]` (unique canonical URLs). */
  uniqueCanonicalUrls: number;
  /** `urlNodesInTree - uniqueCanonicalUrls`; the count of tracking-param dupes. */
  duplicateVariants: number;
  /** Deepest folder depth reached under `Bookmarks bar`, 1-indexed. */
  maxFolderDepth: number;
  /** Count of tree nodes whose title contains at least one edge-case character. */
  edgeCaseTitles: number;
  /** PRNG seed the corpus was built with. Handy for reproducing failures. */
  seed: number;
};

export type SyntheticCorpus = {
  tree: chrome.bookmarks.BookmarkTreeNode[];
  bookmarks: Bookmark[];
  stats: SyntheticCorpusStats;
};

const DEFAULT_SIZE = 20_000;
/** Any 32-bit value works. Chosen once; kept stable so fixtures don't churn. */
const DEFAULT_SEED = 0x9e37_79b9;
const MAX_FOLDER_DEPTH = 8;
/** Fraction of URL nodes that will be tracking-param duplicates of another node. */
const DUPLICATE_FRACTION = 0.22;
/** Approximate ratio of folders to URL nodes. */
const FOLDER_RATIO = 0.02;

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------

/**
 * mulberry32 — small (one 32-bit state), fast, well-distributed.
 * Not cryptographic, but the test corpus doesn't need to resist an adversary,
 * only to produce the same sequence every run.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b_79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Rng = () => number;

function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

function pickInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickWeighted<T>(rng: Rng, weighted: readonly (readonly [number, T])[]): T {
  let total = 0;
  for (const [w] of weighted) total += w;
  let r = rng() * total;
  for (const [w, v] of weighted) {
    r -= w;
    if (r <= 0) return v;
  }
  return weighted[weighted.length - 1]![1];
}

// ---------------------------------------------------------------------------
// URL sample generation
// ---------------------------------------------------------------------------

type UrlSample = {
  /** The canonical form as `canonicalize()` would produce it. */
  canonical: string;
  /** Canonical hostname. */
  domain: string;
  /** URLs to place in the tree. Length ≥ 1. Extra entries are dupes. */
  variants: string[];
  /** Stable label used to build a title (may itself contain edge-case chars). */
  titleSeed: string;
};

// Words used to synthesise slugs, titles, and paths. All ASCII to keep the
// URL generation predictable; edge-case characters live only in titles.
const NOUN_WORDS = [
  "compiler",
  "runtime",
  "index",
  "cache",
  "protocol",
  "cluster",
  "kernel",
  "vector",
  "matrix",
  "graph",
  "planner",
  "scheduler",
  "queue",
  "buffer",
  "codec",
  "shader",
  "renderer",
  "pipeline",
  "gateway",
  "database",
  "notebook",
  "toolchain",
  "reactor",
  "observer",
  "context",
  "actor",
  "signal",
  "channel",
  "worker",
  "session",
];
const ADJ_WORDS = [
  "async",
  "immutable",
  "declarative",
  "streaming",
  "lazy",
  "eager",
  "distributed",
  "typed",
  "portable",
  "canonical",
  "durable",
  "reactive",
  "adaptive",
  "hermetic",
  "opaque",
  "concurrent",
  "isolated",
  "linear",
  "monotonic",
  "coherent",
];
const TOPIC_WORDS = [
  "rust",
  "typescript",
  "haskell",
  "erlang",
  "python",
  "kubernetes",
  "postgres",
  "sqlite",
  "webgpu",
  "wasm",
  "cryptography",
  "compilers",
  "typesystems",
  "distributed-systems",
  "quantum-computing",
  "graphics",
  "audio",
  "editors",
  "cli",
  "networking",
];

// Long-tail hosts — smaller sites that soak up the ~48% non-heavy-hitter share.
const LONG_TAIL_DOMAINS = [
  "developer.mozilla.org",
  "stackoverflow.com",
  "reddit.com",
  "news.bbc.co.uk",
  "nytimes.com",
  "theguardian.com",
  "lwn.net",
  "phoronix.com",
  "hackaday.com",
  "arstechnica.com",
  "smashingmagazine.com",
  "css-tricks.com",
  "dev.to",
  "substack.com",
  "notion.site",
  "goodreads.com",
  "letterboxd.com",
  "bandcamp.com",
  "soundcloud.com",
  "vimeo.com",
  "docs.rs",
  "crates.io",
  "npmjs.com",
  "pypi.org",
  "hex.pm",
  "packagist.org",
  "readthedocs.io",
  "openreview.net",
  "distill.pub",
  "web.archive.org",
  "gwern.net",
  "danluu.com",
  "julialang.org",
  "haskell.org",
  "ocaml.org",
  "elm-lang.org",
  "scala-lang.org",
  "kotlinlang.org",
  "swift.org",
  "openjdk.org",
  "linuxfoundation.org",
  "kernel.org",
  "gnu.org",
  "eff.org",
  "torproject.org",
  "ieee.org",
  "acm.org",
  "cambridge.org",
  "nature.com",
  "sciencedirect.com",
];

// Small pool of tracking-param recipes — each one adds a parameter that
// `canonicalize` is guaranteed to strip. Keeps generation loosely realistic
// without turning the fixture into a canonicalizer test.
type TrackingRecipe = { param: string; sample: (rng: Rng, i: number) => string };
const GLOBAL_TRACKING_RECIPES: TrackingRecipe[] = [
  { param: "utm_source", sample: (r) => pick(r, ["twitter", "hn", "newsletter", "reddit"]) },
  { param: "utm_medium", sample: (r) => pick(r, ["social", "email", "referral"]) },
  { param: "utm_campaign", sample: (_r, i) => `launch-${i}` },
  { param: "fbclid", sample: (_r, i) => `IwAR${(i * 2_654_435_761) >>> 0}` },
  { param: "gclid", sample: (_r, i) => `Cj0KCQjw${(i * 40_503) >>> 0}` },
  { param: "mc_eid", sample: (_r, i) => `${((i + 7) * 8191) >>> 0}` },
  { param: "ref", sample: (_r) => "footer" },
];

// ---------- Per-domain samplers -------------------------------------------
// Each returns a fresh UrlSample. Variants may include tracking params;
// buildFlatBookmarks will run canonicalize + dedup.

function slug(rng: Rng, len = 3): string {
  const parts: string[] = [];
  for (let i = 0; i < len; i++) parts.push(pick(rng, TOPIC_WORDS));
  return parts.join("-");
}

function deterministicId(rng: Rng, i: number, len: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
  const seedMix = (i * 2_654_435_761) >>> 0;
  let out = "";
  for (let k = 0; k < len; k++) {
    // Blend the sample index with the rng so ids look non-trivial
    // yet stay deterministic across full-corpus rebuilds.
    const idx = ((seedMix >>> (k % 5)) + Math.floor(rng() * alphabet.length)) % alphabet.length;
    out += alphabet[idx]!;
  }
  return out;
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function youtubeSample(rng: Rng, i: number): UrlSample {
  const id = deterministicId(rng, i, 11);
  const canonical = `https://www.youtube.com/watch?v=${id}`;
  const variants: string[] = [canonical];
  // ~35% carry a `?t=` timestamp variant — the classic YouTube dupe.
  // Rates are tuned so intrinsic dupes leave headroom for the global
  // tracking recipes below (utm_source, fbclid, gclid, …) to also land.
  if (rng() < 0.35) variants.push(`${canonical}&t=${pickInt(rng, 5, 900)}s`);
  // Occasional youtu.be short-link that canonicalizes to the same watch URL.
  if (rng() < 0.15) variants.push(`https://youtu.be/${id}?t=${pickInt(rng, 5, 900)}`);
  return {
    canonical,
    domain: "www.youtube.com",
    variants,
    titleSeed: `${pick(rng, ADJ_WORDS)} ${pick(rng, NOUN_WORDS)} — video`,
  };
}

function twitterSample(rng: Rng, i: number): UrlSample {
  const user = `${pick(rng, TOPIC_WORDS)}_${i % 997}`;
  const statusId = ((i + 1) * 3_141_592_653) >>> 0;
  const canonical = `https://x.com/${user}/status/${statusId}`;
  // Start from a twitter.com variant so the tree carries the pre-x.com form.
  const variants: string[] = [`https://twitter.com/${user}/status/${statusId}`];
  // Twitter's `?s=20` share suffix (rate trimmed — see youtube note).
  if (rng() < 0.35) variants.push(`https://twitter.com/${user}/status/${statusId}?s=20`);
  if (rng() < 0.15) variants.push(`https://mobile.twitter.com/${user}/status/${statusId}?s=46`);
  return {
    canonical,
    domain: "x.com",
    variants,
    titleSeed: `@${user} on X`,
  };
}

function githubSample(rng: Rng, i: number): UrlSample {
  const owner = pick(rng, TOPIC_WORDS);
  const repo = `${pick(rng, ADJ_WORDS)}-${pick(rng, NOUN_WORDS)}-${i % 4999}`;
  const canonical = `https://github.com/${owner}/${repo}`;
  return {
    canonical,
    domain: "github.com",
    variants: [canonical],
    titleSeed: `${owner}/${repo}: ${pick(rng, ADJ_WORDS)} ${pick(rng, NOUN_WORDS)}`,
  };
}

function wikipediaSample(rng: Rng, i: number): UrlSample {
  const article = `${capitalise(pick(rng, TOPIC_WORDS))}_(${pick(rng, NOUN_WORDS)})_${i % 9973}`;
  const canonical = `https://en.wikipedia.org/wiki/${article}`;
  return {
    canonical,
    domain: "en.wikipedia.org",
    variants: [canonical],
    titleSeed: `${article.replaceAll("_", " ")} — Wikipedia`,
  };
}

function mediumSample(rng: Rng, i: number): UrlSample {
  const author = `@${pick(rng, TOPIC_WORDS)}${i % 313}`;
  const slugText = `${slug(rng, 3)}-${((i + 1) * 2_654_435_761) >>> 0}`;
  const canonical = `https://medium.com/${author}/${slugText}`;
  return {
    canonical,
    domain: "medium.com",
    variants: [canonical],
    titleSeed: `${capitalise(slugText.replaceAll("-", " "))}`,
  };
}

function arxivSample(rng: Rng, i: number): UrlSample {
  // 26xx.NNNNN — plausibly recent papers
  const year = 26 - pickInt(rng, 0, 10);
  const month = String(pickInt(rng, 1, 12)).padStart(2, "0");
  const seq = String((i * 104_729) % 100_000).padStart(5, "0");
  const paperId = `${year}${month}.${seq}`;
  const canonical = `https://arxiv.org/abs/${paperId}`;
  return {
    canonical,
    domain: "arxiv.org",
    variants: [canonical],
    titleSeed: `[${paperId}] ${capitalise(slug(rng, 4))}`,
  };
}

function hackernewsSample(rng: Rng, i: number): UrlSample {
  const itemId = 42_000_000 + i;
  const canonical = `https://news.ycombinator.com/item?id=${itemId}`;
  return {
    canonical,
    domain: "news.ycombinator.com",
    variants: [canonical],
    titleSeed: `Show HN: ${capitalise(slug(rng, 3))}`,
  };
}

function longTailSample(rng: Rng, i: number): UrlSample {
  const host = pick(rng, LONG_TAIL_DOMAINS);
  const path = `${slug(rng, pickInt(rng, 2, 4))}/${((i * 7919) >>> 0).toString(36)}`;
  const canonical = `https://${host}/${path}`;
  return {
    canonical,
    domain: host,
    variants: [canonical],
    titleSeed: `${capitalise(path.split("/")[0]!.replaceAll("-", " "))} · ${host}`,
  };
}

const SAMPLERS: readonly (readonly [number, (rng: Rng, i: number) => UrlSample])[] = [
  [15, youtubeSample],
  [10, githubSample],
  [8, wikipediaSample],
  [7, twitterSample],
  [5, mediumSample],
  [4, arxivSample],
  [3, hackernewsSample],
  // Long tail rides at ~48% aggregate weight.
  [48, longTailSample],
];

// ---------------------------------------------------------------------------
// Edge-case titles
// ---------------------------------------------------------------------------
// Sprinkled onto ~5% of nodes so downstream code sees:
//   - Emoji (surrogate pairs)
//   - CJK (multi-byte)
//   - RTL Arabic (bidi context)
//   - ASCII control chars that the store is expected to strip

const EMOJI_SEGMENTS = ["🚀", "🧠", "📚", "🎧", "🔬", "🐛", "🌱", "🪐"];
const CJK_SEGMENTS = ["日本語のブックマーク", "简体中文测试", "한국어 즐겨찾기", "深度学习"];
const RTL_SEGMENTS = ["مرحبا بالعالم", "الذكاء الاصطناعي", "علم الحاسوب"];
// Note: real ASCII control chars in the string literal — NOT escapes to display.
// U+0000 NUL, U+001B ESC, U+007F DEL, U+000B VT. Downstream sanitisation is
// expected to strip these; the fixture emits them so tests can prove it does.
const CONTROL_SEGMENTS = [
  "clean\x00null-injected",
  "escape\x1b[31mred\x1b[0m",
  "del\x7fchar",
  "vertical\x0btab",
];

type EdgeCaseKind = "emoji" | "cjk" | "rtl" | "control";

function decorateTitle(rng: Rng, base: string): { title: string; kind: EdgeCaseKind | null } {
  // ~95% plain, ~5% edge-case decorated
  const roll = rng();
  if (roll >= 0.05) return { title: base, kind: null };
  const kind = pickWeighted<EdgeCaseKind>(rng, [
    [4, "emoji"],
    [3, "cjk"],
    [2, "rtl"],
    [1, "control"],
  ]);
  switch (kind) {
    case "emoji":
      return { title: `${pick(rng, EMOJI_SEGMENTS)} ${base}`, kind };
    case "cjk":
      return { title: `${pick(rng, CJK_SEGMENTS)} · ${base}`, kind };
    case "rtl":
      return { title: `${pick(rng, RTL_SEGMENTS)} — ${base}`, kind };
    case "control":
      return { title: `${base} ${pick(rng, CONTROL_SEGMENTS)}`, kind };
  }
}

// ---------------------------------------------------------------------------
// Folder skeleton
// ---------------------------------------------------------------------------

const TOP_LEVEL_FOLDERS_BAR = [
  "Programming",
  "Reading list",
  "Videos",
  "Papers",
  "Design",
  "Tools",
  "News",
  "Music",
  "Research",
  "Home",
];

const TOP_LEVEL_FOLDERS_OTHER = ["Archive", "Inbox", "Later", "Junk drawer"];

const SUB_FOLDER_WORDS = [
  ...ADJ_WORDS,
  ...TOPIC_WORDS,
  "misc",
  "week-1",
  "2024",
  "2025",
  "2026",
  "sprint",
  "deep-dive",
];

// The one guaranteed deep branch — hits MAX_FOLDER_DEPTH exactly.
const GUARANTEED_DEEP_BRANCH = [
  "Research",
  "Physics",
  "Quantum",
  "Interpretations",
  "Bohmian",
  "Historical",
  "Correspondence",
  "1927-Solvay",
];

type FolderRef = {
  node: chrome.bookmarks.BookmarkTreeNode;
  depth: number;
};

function newFolder(
  id: string,
  title: string,
  parentId: string,
  index: number,
): chrome.bookmarks.BookmarkTreeNode {
  return { id, title, parentId, index, children: [] };
}

function buildFolderSkeleton(
  rng: Rng,
  targetFolders: number,
  nextId: () => string,
): {
  tree: chrome.bookmarks.BookmarkTreeNode[];
  folders: FolderRef[];
  maxDepth: number;
} {
  const bar: chrome.bookmarks.BookmarkTreeNode = {
    id: "1",
    title: "Bookmarks bar",
    parentId: "0",
    index: 0,
    children: [],
  };
  const other: chrome.bookmarks.BookmarkTreeNode = {
    id: "2",
    title: "Other bookmarks",
    parentId: "0",
    index: 1,
    children: [],
  };
  const root: chrome.bookmarks.BookmarkTreeNode = {
    id: "0",
    title: "",
    children: [bar, other],
  };

  const folders: FolderRef[] = [];

  // 1. First-level folders on both roots.
  for (const [parent, names] of [
    [bar, TOP_LEVEL_FOLDERS_BAR],
    [other, TOP_LEVEL_FOLDERS_OTHER],
  ] as const) {
    let idx = 0;
    for (const title of names) {
      const f = newFolder(nextId(), title, parent.id, idx++);
      parent.children!.push(f);
      folders.push({ node: f, depth: 1 });
    }
  }

  // 2. Guaranteed 8-level branch. Reuses the "Research" first-level folder if
  // it exists so `ancestorFolderNames` yields the full deep chain when a
  // bookmark lands at the bottom.
  let cursor = folders.find((f) => f.node.title === GUARANTEED_DEEP_BRANCH[0]);
  if (!cursor) {
    const first = newFolder(nextId(), GUARANTEED_DEEP_BRANCH[0]!, bar.id, bar.children!.length);
    bar.children!.push(first);
    cursor = { node: first, depth: 1 };
    folders.push(cursor);
  }
  for (let d = 1; d < MAX_FOLDER_DEPTH; d++) {
    const title = GUARANTEED_DEEP_BRANCH[d] ?? `Level ${d + 1}`;
    const f = newFolder(nextId(), title, cursor.node.id, cursor.node.children!.length);
    cursor.node.children!.push(f);
    const ref: FolderRef = { node: f, depth: cursor.depth + 1 };
    folders.push(ref);
    cursor = ref;
  }

  // 3. Fan-out under existing folders until we hit the target count.
  // Deeper folders are exponentially less likely to spawn a child, so the
  // distribution stays realistic (most stuff shallow, occasional deep pockets).
  let safety = 0;
  while (folders.length < targetFolders && safety++ < targetFolders * 6) {
    const parent = folders[pickInt(rng, 0, folders.length - 1)]!;
    if (parent.depth >= MAX_FOLDER_DEPTH) continue;
    // Spawn probability decays with depth.
    const spawnProb = 0.7 / (parent.depth + 1);
    if (rng() > spawnProb) continue;
    const title = `${pick(rng, SUB_FOLDER_WORDS)}-${folders.length}`;
    const f = newFolder(nextId(), title, parent.node.id, parent.node.children!.length);
    parent.node.children!.push(f);
    folders.push({ node: f, depth: parent.depth + 1 });
  }

  const maxDepth = folders.reduce((m, f) => Math.max(m, f.depth), 0);
  return { tree: [root], folders, maxDepth };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build a fresh, deterministic synthetic corpus.
 *
 * @example
 *   const { tree, bookmarks, stats } = buildSyntheticCorpus();
 *   // tree              → chrome.bookmarks.getTree() shape, ~20,000 URL nodes
 *   // bookmarks         → deduped canonical Bookmark[] ready for db.bookmarks.bulkPut
 *   // stats.duplicateVariants > 0
 *
 * @example
 *   // Small corpus for a fast test run
 *   const { tree } = buildSyntheticCorpus({ size: 200 });
 */
export function buildSyntheticCorpus(options: SyntheticCorpusOptions = {}): SyntheticCorpus {
  const size = Math.max(1, options.size ?? DEFAULT_SIZE);
  const seed = options.seed ?? DEFAULT_SEED;
  const rng = mulberry32(seed);

  let idCounter = 100;
  const nextId = (): string => String(idCounter++);

  // 1. Decide how many unique URLs to generate. The remaining ~DUPLICATE_FRACTION
  // of the `size` budget goes to tracking-param dupes bolted on in step 2.
  const uniqueCount = Math.max(1, size - Math.floor(size * DUPLICATE_FRACTION));
  const samples: UrlSample[] = [];
  for (let i = 0; i < uniqueCount; i++) {
    const gen = pickWeighted(rng, SAMPLERS);
    samples.push(gen(rng, i));
  }

  // 2. Bolt extra tracking-param dupes onto random samples until total variant
  // count matches `size`. Recipes are applied round-robin so every tracking
  // param in the pool (utm_source, utm_campaign, fbclid, gclid, mc_eid, ref,
  // utm_medium) is guaranteed to appear in the corpus — critical for tests
  // that exercise specific canonicaliser strip rules. Per-domain samplers
  // already emit some intrinsic dupes (youtube `?t=`, twitter `?s=`); those
  // count toward the same budget.
  //
  // A running variant counter is essential here — a naive `reduce` on every
  // loop turn is O(samples.length) and drives the whole build into O(n²).
  let variantCount = samples.reduce((n, s) => n + s.variants.length, 0);

  let recipeIdx = 0;
  let addAttempts = 0;
  while (variantCount < size && addAttempts++ < size * 4) {
    const s = samples[pickInt(rng, 0, samples.length - 1)]!;
    if (s.variants.length >= 5) continue; // saturation guard — spread the dupes
    const recipe = GLOBAL_TRACKING_RECIPES[recipeIdx % GLOBAL_TRACKING_RECIPES.length]!;
    recipeIdx += 1;
    const value = recipe.sample(rng, addAttempts);
    const sep = s.canonical.includes("?") ? "&" : "?";
    s.variants.push(`${s.canonical}${sep}${recipe.param}=${encodeURIComponent(value)}`);
    variantCount += 1;
  }

  // Trim overshoot so stats are reproducible regardless of how many dupes
  // the per-domain samplers happened to emit. Sweeps a single cursor rather
  // than restarting from the tail on every trim — again to keep the pass
  // linear in the overshoot rather than quadratic.
  //
  // Two-pass: first strip intrinsic (non-recipe) dupes so utm_*, fbclid,
  // gclid, … survive the trim; only fall back to any dupe once no intrinsic
  // ones remain.
  const hasRecipeParam = (url: string): boolean =>
    GLOBAL_TRACKING_RECIPES.some((r) => url.includes(`${r.param}=`));

  let cursor = samples.length - 1;
  while (variantCount > size && cursor >= 0) {
    const s = samples[cursor]!;
    if (s.variants.length > 1) {
      const trimIdx = s.variants.findIndex((v, idx) => idx > 0 && !hasRecipeParam(v));
      if (trimIdx >= 0) {
        s.variants.splice(trimIdx, 1);
        variantCount -= 1;
        continue; // stay on this sample in case it has more intrinsic dupes
      }
    }
    cursor -= 1;
  }
  // Fallback pass — no intrinsic variants left, drop from any multi-variant.
  cursor = samples.length - 1;
  while (variantCount > size && cursor >= 0) {
    const s = samples[cursor]!;
    if (s.variants.length > 1) {
      s.variants.pop();
      variantCount -= 1;
      continue;
    }
    cursor -= 1;
  }

  // 3. Build the folder skeleton.
  const targetFolders = Math.max(4, Math.floor(size * FOLDER_RATIO));
  const { tree, folders, maxDepth } = buildFolderSkeleton(rng, targetFolders, nextId);

  // 4. Distribute every variant into a folder. Weighted so ~70% of nodes go
  // into shallow folders (feels like a real user) and the deep branch still
  // sees a handful of leaves. Folders are pre-bucketed once — a per-variant
  // filter would be O(size × folderCount) and dominates the 20k build.
  const shallowPool = folders.filter((f) => f.depth >= 1 && f.depth <= 3);
  const midPool = folders.filter((f) => f.depth >= 4 && f.depth <= 5);
  const deepPool = folders.filter((f) => f.depth >= 6);
  const anyPool = folders;
  const pickBucketedFolder = (): chrome.bookmarks.BookmarkTreeNode => {
    const bucket = rng();
    let pool: readonly FolderRef[];
    if (bucket < 0.7) pool = shallowPool;
    else if (bucket < 0.95) pool = midPool;
    else pool = deepPool;
    if (pool.length === 0) pool = anyPool;
    return pool[Math.floor(rng() * pool.length)]!.node;
  };
  type PendingNode = {
    variantUrl: string;
    sampleIdx: number;
    parent: chrome.bookmarks.BookmarkTreeNode;
    dateAdded: number;
  };
  const pending: PendingNode[] = [];
  const baseDate = Date.UTC(2020, 0, 1);
  let dateStep = 0;
  for (let sampleIdx = 0; sampleIdx < samples.length; sampleIdx++) {
    const sample = samples[sampleIdx]!;
    for (const variantUrl of sample.variants) {
      pending.push({
        variantUrl,
        sampleIdx,
        parent: pickBucketedFolder(),
        // Deterministic monotonic dates: baseDate + n minutes.
        dateAdded: baseDate + dateStep * 60_000,
      });
      dateStep += 1;
    }
  }

  // 5. Materialise each pending node into the tree.
  let edgeCaseTitles = 0;
  for (const p of pending) {
    const sample = samples[p.sampleIdx]!;
    const { title, kind } = decorateTitle(rng, sample.titleSeed);
    if (kind !== null) edgeCaseTitles += 1;
    const node: chrome.bookmarks.BookmarkTreeNode = {
      id: nextId(),
      parentId: p.parent.id,
      index: p.parent.children!.length,
      title,
      url: p.variantUrl,
      dateAdded: p.dateAdded,
    };
    p.parent.children!.push(node);
  }

  // 6. Walk the finished tree, canonicalise, and produce the flat
  // Bookmark[] view. Mirrors what `importChromeTree` would do minus the
  // async Dexie writes — same tag-merge semantics, same dedup.
  const bookmarks = buildFlatBookmarks(tree);

  const { folderNodesInTree, urlNodesInTree } = countTreeNodes(tree);

  return {
    tree,
    bookmarks,
    stats: {
      urlNodesInTree,
      folderNodesInTree,
      uniqueCanonicalUrls: bookmarks.length,
      duplicateVariants: urlNodesInTree - bookmarks.length,
      maxFolderDepth: maxDepth,
      edgeCaseTitles,
      seed,
    },
  };
}

// ---------------------------------------------------------------------------
// Tree walk → flat Bookmark[] (mirrors importChromeTree without Dexie)
// ---------------------------------------------------------------------------

function countTreeNodes(trees: chrome.bookmarks.BookmarkTreeNode[]): {
  urlNodesInTree: number;
  folderNodesInTree: number;
} {
  let urlNodesInTree = 0;
  let folderNodesInTree = 0;
  const visit = (n: chrome.bookmarks.BookmarkTreeNode): void => {
    if (n.url) urlNodesInTree += 1;
    else if (n.id !== "0") folderNodesInTree += 1;
    for (const c of n.children ?? []) visit(c);
  };
  for (const t of trees) visit(t);
  return { urlNodesInTree, folderNodesInTree };
}

function flattenTree(
  root: chrome.bookmarks.BookmarkTreeNode,
): Record<string, chrome.bookmarks.BookmarkTreeNode> {
  const out: Record<string, chrome.bookmarks.BookmarkTreeNode> = {};
  const visit = (n: chrome.bookmarks.BookmarkTreeNode): void => {
    out[n.id] = n;
    for (const c of n.children ?? []) visit(c);
  };
  visit(root);
  return out;
}

function buildFlatBookmarks(trees: chrome.bookmarks.BookmarkTreeNode[]): Bookmark[] {
  const byId: Record<string, chrome.bookmarks.BookmarkTreeNode> = {};
  for (const t of trees) Object.assign(byId, flattenTree(t));

  const byCanonical = new Map<string, Bookmark>();
  // Deterministic `updatedAt` — every bookmark uses the same synthetic
  // timestamp so tests can assert stable output without wall-clock noise.
  const NOW = Date.UTC(2026, 0, 1);
  let bookmarkCounter = 0;

  for (const node of Object.values(byId)) {
    if (!node.url) continue;
    const c = canonicalize(node.url);
    if (!c.ok) continue;
    const folderTags = ancestorFolderNames(node.parentId, byId);
    const existing = byCanonical.get(c.canonical);
    const eventAt = node.dateAdded ?? NOW;

    if (existing) {
      const mergedTags = dedupTags([...existing.tags, ...folderTags]);
      byCanonical.set(c.canonical, {
        ...existing,
        tags: mergedTags,
        updatedAt: NOW,
      });
      continue;
    }

    const fresh: Bookmark = {
      // Deterministic id — `bm-000001`, `bm-000002`, … in insertion order.
      id: `bm-${String(bookmarkCounter++).padStart(7, "0")}`,
      canonicalUrl: c.canonical,
      originalUrl: node.url,
      domain: c.domain,
      title: node.title ?? "",
      description: node.title ?? "",
      note: "",
      tags: dedupTags(folderTags),
      rating: null,
      necessaryTime: null,
      contentType: "unknown" satisfies ContentType,
      language: null,
      status: "unread" satisfies ReadStatus,
      readAt: null,
      createdAt: eventAt,
      updatedAt: NOW,
      capturedFrom: "chrome-import" satisfies CaptureSource,
    };
    byCanonical.set(c.canonical, fresh);
  }

  return Array.from(byCanonical.values());
}
