/**
 * Search query latency benchmarks.
 *
 * Placeholder wiring for the "search query latency" work item from the
 * better-bookmarks manual notes. The real corpus fixture, indexer warm-up,
 * and p50 / p95 harness get plugged in during Phase 3 — for now these
 * cases are declared with `bench.skip` so `vitest bench` picks the file up
 * without actually running anything.
 *
 * Targets (see docs/ROADMAP.md Phase 3 exit criterion, < 50 ms):
 *   - bare-word search hitting ~5%   of a 20k synthetic corpus
 *   - `tag:foo` matching ~10%
 *   - `domain:youtube.com` matching ~3%
 *   - combined `tag:rust domain:github.com` matching ~1%
 *
 * unskip when Phase 3 search infra lands (later in this workflow run).
 */

import { bench, describe } from "vitest";

describe("search query latency (20k synthetic corpus)", () => {
  bench.skip("bare-word search matching ~5% of corpus", async () => {
    // unskip when Phase 3 search infra lands (later in this workflow run).
  });

  bench.skip("tag:foo matching ~10% of corpus", async () => {
    // unskip when Phase 3 search infra lands (later in this workflow run).
  });

  bench.skip("domain:youtube.com matching ~3% of corpus", async () => {
    // unskip when Phase 3 search infra lands (later in this workflow run).
  });

  bench.skip("combined tag:rust domain:github.com matching ~1% of corpus", async () => {
    // unskip when Phase 3 search infra lands (later in this workflow run).
  });
});
