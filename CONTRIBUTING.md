# Contributing to Better Bookmarks

Thanks for the interest. This file is the map: how to run the extension
locally, how to add a canonicalisation rule (the most common change),
and what a merge-ready PR looks like here.

## Local setup

Requirements:

- Node 24 or later (see `engines.node` in `package.json`).
- `pnpm` 10 or later. The repo pins `pnpm@10.33.2` via
  `packageManager`; Corepack picks it up automatically.

```sh
pnpm install
```

The `postinstall` step runs `wxt prepare`, which generates the
extension's typed manifest. If you skip it, TypeScript will complain
about missing WXT types.

## Everyday scripts

```sh
pnpm dev      # WXT dev build into ./dist, rebuilds on save
pnpm check    # Biome format + lint, writes fixes in place
pnpm test     # Vitest, single run
pnpm build    # Production build into ./dist
```

Load `./dist` in Chrome as an unpacked extension the same way the
README describes for release zips. Reload the extension in
`chrome://extensions/` after `pnpm dev` picks up a change — WXT
rebuilds the assets, but Chrome still needs the reload for background
and content-script changes to take effect.

Run `pnpm check` before every commit. The husky pre-commit hook runs
Biome on staged files; anything wider gets caught in CI.

Run `pnpm test` before opening a PR. CI runs the same command plus
`pnpm build`, `pnpm zip`, and `pnpm zip:firefox` on push.

## Adding a per-domain canonicalisation rule

The canonicaliser is the dedup story. Read
[`docs/URL_NORMALIZATION.md`](docs/URL_NORMALIZATION.md) first — it
documents the pipeline, the global tracking-parameter blacklist, and
the shipped per-domain strategies with their reasoning.

Rules live in `src/core/canonicalizer/`:

- `rules.ts` — global tracking-parameter blacklist and the set of
  unbookmarkable schemes.
- `index.ts` — the pipeline, the domain matchers, and the strategy
  registry.
- `<domain>.ts` — one file per per-domain strategy (`youtube.ts`,
  `twitter.ts`, `github.ts`, `arxiv.ts`, and the rest).
- `fixtures.ts` — the `(input, expected)` pairs the test suite runs
  against. It is a TypeScript module, not a JSON file.
- `canonicalizer.test.ts` — the runner. It iterates `FIXTURES` and
  `REJECTION_FIXTURES` so every fixture row becomes a test case.

### Workflow

1. **Add fixtures first.** Open `fixtures.ts` and append rows to
   `FIXTURES` (or `REJECTION_FIXTURES` for URLs the pipeline should
   refuse). Each row is `{ name, input, expected }`. Cover the
   positive case, the case that must not change, and any edge case
   the rule interacts with. `pnpm test` will fail — that is expected.
2. **Write the strategy.** For a new domain, add a
   `<domain>.ts` file exporting a `DomainStrategy`
   (`(url: URL, ctx: StrategyContext) => URL | null`) and a `match`
   function. Register both in the `DOMAIN_STRATEGIES` array in
   `index.ts`. For a global-list change, edit
   `GLOBAL_TRACKING_PARAMS` in `rules.ts`.
3. **Run the suite.** `pnpm test` must go green, including the
   idempotence check (`re-canonicalizing is idempotent`) that runs
   every fixture through the pipeline twice.
4. **Update the docs.** Add a short section for the new domain to
   `docs/URL_NORMALIZATION.md`, or extend the existing one. Doc and
   code land in the same commit.

### No PII in fixture data

Fixture inputs get committed and shipped with the repo. Do not paste
URLs from your own browser history.

Use the patterns the existing fixtures already follow:

- Placeholder IDs: `abc123XYZ_-` for YouTube video ids, `12345` for
  numeric status ids, `B0ABCDEFGH` for Amazon ASINs, `2401.12345`
  for arXiv ids.
- Placeholder handles: `user`, `repo`, `user/status/12345`.
- Real domains are fine — that is the whole point — but nothing
  behind them should identify a person.

Before staging fixtures, `grep` for anything that looks personal
(email fragments, usernames from your accounts, tokens, session ids)
and swap it for a placeholder.

## Pull request shape

Keep PRs small and focused. One rule change per PR beats a batch.

Every PR should have:

- **A linked issue.** Open one first if the change is not trivial —
  discussion happens there. Reference it in the description with
  `Fixes #123` or `Refs #123`.
- **A summary of the why.** State the behaviour before and after in
  plain terms. The reviewer can read the diff for the what.
- **A test.** New rule → new fixture row. Bug fix → a test that fails
  before the fix and passes after. Refactor with no behaviour change
  → say so explicitly, and confirm the existing suite still passes.
- **A green `pnpm check` and `pnpm test`.** CI runs both and will
  block the merge otherwise.

Commits follow the prefix convention already visible in
`git log`: `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `ci:`,
`test:`, `chore:`. `CHANGELOG.md` groups entries by prefix at release
time, so accurate prefixes save work later.
