# Benchmarks

Latency and throughput measurements for hot paths in the extension. The
harness that populates this table lives in `src/**/*.bench.ts` and is run
with `pnpm exec vitest bench`.

Numbers are captured against the 20k synthetic Chrome-bookmark corpus
(`src/testing/fixtures/syntheticCorpus.ts`). Each row lists the commit
sha the run was taken at, the median and p95 wall time, and any notes
about how the case was warmed. The Phase 3 exit criterion for search
latency is p95 < 50 ms.

## Search query latency

| Case                                          | p50    | p95    | Commit  | Date       | Notes                                       |
| --------------------------------------------- | ------ | ------ | ------- | ---------- | ------------------------------------------- |
| bare-word (~5% of corpus)                     | —      | —      | —       | —          | Pending Phase 3 (placeholder — see `search.bench.ts`) |
| `tag:foo` (~10% of corpus)                    | —      | —      | —       | —          | Pending Phase 3                             |
| `domain:youtube.com` (~3% of corpus)          | —      | —      | —       | —          | Pending Phase 3                             |
| `tag:rust domain:github.com` (~1% of corpus)  | —      | —      | —       | —          | Pending Phase 3                             |
