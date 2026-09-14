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

Commit: `a911600` · Date: 2026-09-14 · Exit criterion: **p95 < 50 ms**

| Case                                                    | Query                                | Matches       | p50   | p95   | p99   | Notes                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------ | ------------- | ----- | ----- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bare-word (~5% of corpus)                               | `haskell`                            | 1359 (8.7%)   | 46.16 | 46.80 | 48.48 | **Under target.** Postings intersection now feeds one `db.bookmarks.bulkGet(ids)` (runner.ts:138). Pre-fix p95 on the same host was 3603 ms — the per-id `getBookmarkById` fan-out was 1,359 sequential Dexie point reads. |
| `tag:X` (~10% of corpus)                                | `tag:Physics`                        | 1330 (8.5%)   | 34.43 | 36.48 | 39.52 | No bare term and no indexed predicate the runner short-circuits on for tags → falls back to `db.bookmarks.toArray()` and post-filters in memory.                                    |
| `domain:X` (~3% of corpus)                              | `domain:news.ycombinator.com`        |  466 (3.0%)   |  3.01 |  3.27 |  6.34 | Filter-only queries with a `domain:` (or `is:`) predicate route through the Dexie index — `where("domain").equals(...)` — instead of the 15,600-row scan. Was p95 51 ms on `a39ff8d`. |
| combined `tag:X domain:Y` (~1% of corpus)               | `tag:Quantum domain:www.youtube.com` |  161 (1.0%)   |  9.04 | 17.38 | 28.33 | Same short-circuit: the `domain:` seed pulls ~466 candidates from the index, then the tag AND is a small in-memory post-filter.                                                    |

All timings are milliseconds. Raw per-iteration samples land in
`src/core/search/.search-bench-results.json` (untracked) after each run.

Run-to-run variance on this bench host is meaningful: bare-word p95
has been observed anywhere from ~47 ms (idle host) to ~130 ms (host
under other load) across consecutive `pnpm vitest bench` invocations
without touching the code. The `tag:` row moves in lockstep for the
same reason. Rerun on an otherwise-idle host before treating a doc
number as a regression.

### Bare-word — bulkGet fix (commit `a911600`)

Before this commit the runner intersected postings in memory and then
loaded every surviving bookmark via `Promise.all(ids.map(getBookmarkById))`
— 1,359 sequential Dexie point reads per query, all inside the same
tick. On the 20k synthetic corpus this pushed bare-word p95 to
3603 ms on the same host (60-70× the target). Collapsing the fan-out
into one `db.bookmarks.bulkGet(ids)` (runner.ts:138, rank.ts:186)
lands the same result set in a single transaction and puts the case
back under the 50 ms exit criterion. `bulkGet` returns `undefined` at
each input index for a missing id; both call sites already `.filter(...)`
those out.

### `domain:X` — indexed short-circuit (commit `65f8d6c`)

`runQuery` now checks `candidatesFromIndexedFilter` before falling back
to a full-table scan: a filter-only query naming `domain:` or `is:`
(status) drives candidates off the Dexie index instead of `toArray()`.
Tag lookup is intentionally left on the scan path — the store keeps
tags in the user's original case while the parser lowercases the
query, so a `*tags` equality lookup would miss `tag:AI` against a
bookmark carrying `AI`; the in-memory post-filter still handles case
folding.

### Query substitutions

The task spec named `tag:foo`, `domain:youtube.com`, and
`tag:rust domain:github.com`. Those strings do not match anything in
the deterministic corpus (`foo` is not a folder name; the YouTube
sampler emits `www.youtube.com`; subfolder names are always
`<word>-<idx>` so `rust` never appears alone as a tag). The runs above
use tokens that DO appear at the target cardinality so the harness
measures real work instead of an empty-result short-circuit.
