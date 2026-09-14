/**
 * Search query latency benchmarks.
 *
 * Wired into the Phase 3 exit criterion: p95 search latency must stay
 * under 50 ms per query on a synthetic Chrome-bookmark corpus. See
 * `docs/BENCHMARKS.md` for the last recorded run.
 *
 * Four cases cover distinct match cardinalities so the harness catches
 * regressions in each hot path:
 *   - bare word — postings-intersection path
 *   - `tag:X`   — no bare term, full-table filter
 *   - `domain:X` — same shape, different discriminator
 *   - `tag:X domain:Y` — combined filter, smaller result set
 *
 * The specific tokens are picked from the deterministic corpus so each
 * case matches the intended fraction; exact percentages are reported
 * in the benchmarks doc.
 *
 * Vitest's bench framework doesn't run `beforeAll`/`afterAll` hooks the
 * way its test framework does, so setup happens at module load via a
 * top-level await and per-iteration timings are written to a JSON file
 * that `docs/BENCHMARKS.md` (and any post-run tooling) can read.
 *
 * Corpus size defaults to 20 000. Override with `BENCH_CORPUS_SIZE`
 * (e.g. `BENCH_CORPUS_SIZE=10000 vitest bench src/core/search/search.bench.ts`).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { bench, describe } from "vitest";
import { fullReindex, reindexAll } from "@/core/search/indexer";
import { search } from "@/core/search/runner";
import {
  resetInvertedWiringForTests,
  resetSearchWiringForTests,
  setSearchIndexerSuppressed,
} from "@/core/search/wire";
import { getDB } from "@/core/storage/db";
import { buildSyntheticCorpus } from "@/test/fixtures/synthetic-corpus";

const CORPUS_SIZE = Number(process.env.BENCH_CORPUS_SIZE ?? 20_000);
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 20);
const WARMUP_ITERATIONS = Number(process.env.BENCH_WARMUP ?? 3);
const RESULTS_PATH = process.env.BENCH_RESULTS_PATH ?? "src/core/search/.search-bench-results.json";

// Queries chosen against the deterministic corpus (see corpus stats in
// `docs/BENCHMARKS.md`) to hit the intended match cardinalities.
const QUERIES = {
  bareWord: { query: "haskell", target: "~5%" },
  tag: { query: "tag:Physics", target: "~10%" },
  domain: { query: "domain:news.ycombinator.com", target: "~3%" },
  combined: { query: "tag:Quantum domain:www.youtube.com", target: "~1%" },
} as const;

type CaseLabel = keyof typeof QUERIES;

const samplesByCase: Record<CaseLabel, number[]> = {
  bareWord: [],
  tag: [],
  domain: [],
  combined: [],
};

let corpusInfo: {
  size: number;
  requested: number;
  matchCounts: Record<CaseLabel, number>;
} = {
  size: 0,
  requested: CORPUS_SIZE,
  matchCounts: { bareWord: 0, tag: 0, domain: 0, combined: 0 },
};

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx]!;
}

function writeResults(): void {
  const rows: Record<
    CaseLabel,
    {
      query: string;
      target: string;
      n: number;
      matches: number;
      p50: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
    }
  > = {} as never;
  for (const label of Object.keys(samplesByCase) as CaseLabel[]) {
    const sorted = [...samplesByCase[label]].sort((a, b) => a - b);
    rows[label] = {
      query: QUERIES[label].query,
      target: QUERIES[label].target,
      n: sorted.length,
      matches: corpusInfo.matchCounts[label],
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      min: sorted[0] ?? Number.NaN,
      max: sorted[sorted.length - 1] ?? Number.NaN,
    };
  }
  mkdirSync(dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(
    RESULTS_PATH,
    JSON.stringify(
      {
        corpus: corpusInfo,
        iterations: ITERATIONS,
        warmupIterations: WARMUP_ITERATIONS,
        capturedAt: new Date().toISOString(),
        rows,
      },
      null,
      2,
    ),
  );
}

async function timeSearch(label: CaseLabel): Promise<void> {
  const { query } = QUERIES[label];
  const t0 = performance.now();
  await search(query);
  const dt = performance.now() - t0;
  samplesByCase[label].push(dt);
  writeResults();
}

// -------- Setup (runs once at module load; vitest bench skips beforeAll) ----
resetSearchWiringForTests();
resetInvertedWiringForTests();

const { bookmarks } = buildSyntheticCorpus({ size: CORPUS_SIZE });
const db = getDB();
await db.bookmarks.clear();
await db.postings.clear();
await db.searchIndex.clear();

setSearchIndexerSuppressed(true);
try {
  await db.bookmarks.bulkPut(bookmarks);
} finally {
  setSearchIndexerSuppressed(false);
}

await reindexAll();
await fullReindex();

corpusInfo = {
  size: bookmarks.length,
  requested: CORPUS_SIZE,
  matchCounts: {
    bareWord: (await search(QUERIES.bareWord.query, { limit: 1_000_000 })).length,
    tag: (await search(QUERIES.tag.query, { limit: 1_000_000 })).length,
    domain: (await search(QUERIES.domain.query, { limit: 1_000_000 })).length,
    combined: (await search(QUERIES.combined.query, { limit: 1_000_000 })).length,
  },
};
writeResults();

// Warm the JIT / lazy caches before the measured runs.
for (let i = 0; i < WARMUP_ITERATIONS; i++) {
  await search(QUERIES.bareWord.query);
  await search(QUERIES.tag.query);
  await search(QUERIES.domain.query);
  await search(QUERIES.combined.query);
}

// ---------------------------------------------------------------------------

describe(`search query latency (${CORPUS_SIZE} synthetic corpus)`, () => {
  bench(
    `bare-word "${QUERIES.bareWord.query}" matching ${QUERIES.bareWord.target}`,
    async () => {
      await timeSearch("bareWord");
    },
    { iterations: ITERATIONS, warmupIterations: 0, time: 0, warmupTime: 0 },
  );

  bench(
    `${QUERIES.tag.query} matching ${QUERIES.tag.target}`,
    async () => {
      await timeSearch("tag");
    },
    { iterations: ITERATIONS, warmupIterations: 0, time: 0, warmupTime: 0 },
  );

  bench(
    `${QUERIES.domain.query} matching ${QUERIES.domain.target}`,
    async () => {
      await timeSearch("domain");
    },
    { iterations: ITERATIONS, warmupIterations: 0, time: 0, warmupTime: 0 },
  );

  bench(
    `${QUERIES.combined.query} matching ${QUERIES.combined.target}`,
    async () => {
      await timeSearch("combined");
    },
    { iterations: ITERATIONS, warmupIterations: 0, time: 0, warmupTime: 0 },
  );
});
