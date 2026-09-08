# Testing

## Synthetic corpus

`src/test/fixtures/synthetic-corpus.ts` builds a deterministic synthetic
Chrome bookmark tree. It is the single source of truth for every test that
needs corpus-shape data — first-run import, search benchmarks, bulk tag
and delete, dedup counts, tag-merge-at-scale, and the "Load 100 sample
bookmarks" dev button.

Prefer this fixture over hand-rolled sample trees. New scale tests should
always import from here; per-test synthetic data is a maintenance drag and
hides regressions the shared fixture would catch.

### API

```ts
import { buildSyntheticCorpus } from "@/test/fixtures/synthetic-corpus";

// Default: ~20,000 URL nodes.
const { tree, bookmarks, stats } = buildSyntheticCorpus();

// Smaller runs for fast tests.
const small = buildSyntheticCorpus({ size: 200 });

// Different PRNG seed — different corpus, still deterministic.
const alt = buildSyntheticCorpus({ size: 500, seed: 42 });
```

The returned object has three fields:

- **`tree: chrome.bookmarks.BookmarkTreeNode[]`** — the raw Chrome tree
  shape. Feed it to `importChromeTree` when a test needs to exercise the
  walk / canonicalize / merge path end to end.
- **`bookmarks: Bookmark[]`** — the deduped, canonicalized flat list that
  `importChromeTree` would produce. Feed it to `db.bookmarks.bulkPut(...)`
  when a test just wants a populated store and does not care about the
  import pipeline.
- **`stats: SyntheticCorpusStats`** — self-describing counts (see below).

### Determinism

Every random choice comes from a `mulberry32` PRNG seeded off
`options.seed` (default `0x9E37_79B9`). The fixture calls no
`Date.now()`, no `Math.random()`, no `crypto.randomUUID()`. Same input →
same output, every process, every machine, forever. Bookmark ids in the
flat list are `bm-0000000`, `bm-0000001`, … in insertion order; tree ids
are sequential numeric strings starting at `100` (with `0`, `1`, `2`
reserved for the synthetic Chrome roots as usual).

Test authors: if you see fixture output drift between runs on the same
seed, that is a bug — the PRNG or one of the sample paths is reaching
outside its seeded state. Bisect the module rather than papering over
with looser assertions.

### Shape of the tree

Two synthetic Chrome roots:

- **id `"1"` — `Bookmarks bar`** carries most of the depth. Its
  first-level children include `Programming`, `Reading list`, `Videos`,
  `Papers`, `Design`, `Tools`, `News`, `Music`, `Research`, `Home`.
- **id `"2"` — `Other bookmarks`** carries `Archive`, `Inbox`, `Later`,
  `Junk drawer` — flatter, closer to how most users actually use it.

Depth is realistic: ~70% of URL nodes land in folders at depth ≤ 3 (where
casual bookmarking really happens), ~25% at depths 4–5, ~5% at 6–8.
Exactly one branch is guaranteed to hit `MAX_FOLDER_DEPTH = 8`:

    Bookmarks bar / Research / Physics / Quantum / Interpretations /
      Bohmian / Historical / Correspondence / 1927-Solvay

Anything filed at the bottom of that branch tests the deep-ancestor path
in `ancestorFolderNames` / tag derivation. `stats.maxFolderDepth` is
always `8` for `size ≥ ~50`.

### Duplicate URLs (canonicalisation surface)

Roughly 22 % of the URL nodes in the tree are duplicates of another node
under the current canonicaliser rules. The fixture generates dupes two
ways:

- **Intrinsic per-domain**: YouTube samples emit a `?t=...` timestamp
  variant and occasionally a `youtu.be/<id>` short link; Twitter samples
  emit `?s=20` and `mobile.twitter.com` share links; both canonicalize
  back to the parent URL.
- **Round-robin global tracking recipes**: `?utm_source=`, `?utm_medium=`,
  `?utm_campaign=`, `?fbclid=`, `?gclid=`, `?mc_eid=`, `?ref=` — bolted
  onto random samples in a fixed rotation so every one of these
  parameters is guaranteed to appear.

The `bookmarks[]` view is what remains after canonicalize + dedup +
tag-merge. `stats.duplicateVariants ===
stats.urlNodesInTree - stats.uniqueCanonicalUrls`.

Because the fixture calls the real `canonicalize` module (rather than
reimplementing it), "which variants merge" always tracks the current
rules. If the canonicaliser learns a new dupe pattern, this stat updates
automatically — pin an exact count only when the test is _about_ the
canonicaliser itself.

### Realistic domain distribution

Approximate share of URL nodes, before dupe expansion:

| Weight | Kind        | Canonical host           |
|-------:|-------------|--------------------------|
|    15% | video       | www.youtube.com          |
|    10% | code        | github.com               |
|     8% | reference   | en.wikipedia.org         |
|     7% | social      | x.com                    |
|     5% | article     | medium.com               |
|     4% | paper       | arxiv.org                |
|     3% | link        | news.ycombinator.com     |
|    48% | long tail   | 50+ other hosts          |

Long-tail hosts span docs sites, news, dev communities, language
websites, foundations, and journals — enough distinct domains that
domain-facet UI and `domain:` search filters see realistic scatter.

### Edge-case titles

~5% of tree nodes have a title decorated with one of:

- **Emoji** (BMP + surrogate pairs) — 🚀 🧠 📚 🎧 🔬 🐛 🌱 🪐
- **CJK** — Japanese, Simplified Chinese, Korean, plus one Simplified
  Chinese title.
- **RTL Arabic** — for bidi contexts.
- **ASCII control chars** — literal `U+0000`, `U+001B`, `U+007F`, `U+000B`
  woven into otherwise-plain titles. The store is expected to strip these
  on write; the fixture emits them so tests can prove it does.

`stats.edgeCaseTitles` counts nodes that carry at least one decoration.

### Stat surface

```ts
type SyntheticCorpusStats = {
  urlNodesInTree: number;      // = size (URL-bearing nodes)
  folderNodesInTree: number;   // ≈ size * 0.02
  uniqueCanonicalUrls: number; // bookmarks.length
  duplicateVariants: number;   // urlNodesInTree - uniqueCanonicalUrls
  maxFolderDepth: number;      // 8 for size ≥ ~50, less for tiny corpora
  edgeCaseTitles: number;      // count of decorated titles
  seed: number;                // echoed back for reproducing failures
};
```

Assertions in scale tests should read from `stats` rather than hard-code
counts — the fixture guarantees the stats match the tree it returned, so
this is both simpler and self-updating.

### Performance

`buildSyntheticCorpus()` at the default 20,000 size runs in roughly
10 seconds on a modern laptop (~90% of that is `canonicalize` on 20 k
URLs). It is O(size); a 200-node corpus builds in tens of milliseconds.
If you only need a hundred entries for a correctness test, ask for a
hundred — do not build 20 k and slice.

### Callers to keep in mind

Any of the following live tests / helpers assume this fixture's shape;
if you change it, run them:

- `src/core/sync/initialImport.test.ts` — the "20k corpus" case
- Search-latency benchmark (see `docs/BENCHMARKS.md` when it exists)
- Bulk tag / bulk delete scale tests
- The "Load 100 sample bookmarks" dev-only overview button
