# Benchmarks

Latency and throughput measurements for hot paths in the extension. The
harness that populates this table lives in `src/**/*.bench.ts` and is run
with `pnpm exec vitest bench`.

Numbers are captured against the 20k synthetic Chrome-bookmark corpus
(`src/test/fixtures/synthetic-corpus.ts`). Each row lists the commit
sha the run was taken at, the median and tail wall time, and any notes
about how the case was warmed. The Phase 3 exit criterion for search
latency is **p95 < 50 ms**.

## Search query latency

Corpus: `buildSyntheticCorpus({ size: 20_000 })` — 15,600 unique
canonical bookmarks after the fixture's built-in tracking-param
dedup. Environment: Node under `fake-indexeddb`, vitest 3.2.4,
`iterations=20`, `warmupIterations=3`. Timings are wall time around
`search(queryString)` from `src/core/search/runner.ts`.

Commit: `a39ff8d` · Date: 2026-09-14 · Exit criterion: **p95 < 50 ms**

| Case                                                    | Query                                | Matches       | p50    | p95    | p99    | Notes                                                                |
| ------------------------------------------------------- | ------------------------------------ | ------------- | ------ | ------ | ------ | -------------------------------------------------------------------- |
| bare-word (~5% of corpus)                               | `haskell`                            | 1359 (8.7%)   | 242.01 | 303.99 | 319.01 | **Misses target by ~6x.** Postings hit fans out into a per-id `getBookmarkById` for every match — 1,359 sequential Dexie point reads dominate the wall time. |
| `tag:X` (~10% of corpus)                                | `tag:Physics`                        | 1330 (8.5%)   |  36.15 |  38.37 |  38.78 | No bare term → runner walks the whole `bookmarks` table once. Stable ~36 ms.                                                                                 |
| `domain:X` (~3% of corpus)                              | `domain:news.ycombinator.com`        |  466 (3.0%)   |  34.97 |  50.93 |  52.25 | **p95 barely over target (50.93 ms, 1 ms overshoot).** Corpus contains no bare `youtube.com`; it canonicalises to `www.youtube.com` (~15% of corpus).        |
| combined `tag:X domain:Y` (~1% of corpus)               | `tag:Quantum domain:www.youtube.com` |  161 (1.0%)   |  35.81 |  37.16 |  37.46 | Corpus has no exact `tag:rust` (subfolders are `rust-<idx>`) and no `github.com` bookmarks that intersect `rust-*` at ~1%. Substituted an equivalent-cardinality pair.  |

All timings are milliseconds. Raw per-iteration samples land in
`src/core/search/.search-bench-results.json` (untracked) after each run.

### Query substitutions

The task spec named `tag:foo`, `domain:youtube.com`, and
`tag:rust domain:github.com`. Those strings do not match anything in
the deterministic corpus (`foo` is not a folder name; the YouTube
sampler emits `www.youtube.com`; subfolder names are always
`<word>-<idx>` so `rust` never appears alone as a tag). The runs above
use tokens that DO appear at the target cardinality so the harness
measures real work instead of an empty-result short-circuit.

### Two queries miss the 50 ms p95 target

1. **Bare-word search (~6× over target).** The runner intersects
   postings in-memory, then calls `getBookmarkById(id)` once per
   surviving id. At 1,359 matches that becomes 1,359 sequential
   IndexedDB round trips inside `Promise.all(...)`. Replacing the fan-out
   with a single `db.bookmarks.bulkGet(ids)` should collapse this to a
   single transaction. Follow-up chip filed under
   *Phase 3 search follow-ups* in the manual notes.
2. **`domain:X` (~1 ms over target).** No bare term means the runner
   falls back to `await db.bookmarks.toArray()` — a full 15,600-row
   scan on every query. This is expected to be worse in real Chrome
   IndexedDB. Follow-up chip filed to short-circuit filter-only queries
   through the domain index instead of the full table.
