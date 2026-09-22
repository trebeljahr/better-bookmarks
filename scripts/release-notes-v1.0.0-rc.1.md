First release candidate. This bundles the full development cycle since
project inception into a single tagged build for pre-release testing. See
[CHANGELOG.md](../CHANGELOG.md) for the full history.

Grouped by commit-prefix convention (`feat:` -> Added, `perf:` / `refactor:`
-> Changed, `fix:` -> Fixed). Older, pre-convention commits are categorised
by their intent.

## Added

- Dexie-backed storage layer with URL canonicalisation and legacy-schema migration.
- Bidirectional Chrome bookmarks sync.
- Full-text search: query parser, `useSearch` hook, and top-of-overview `SearchBar`.
- Bookmark edges with auto-suggested connections and a `ConnectionsPanel` in the detail view.
- Import support for Goodreads HTML, Pocket CSV, raw URL lists, and Netscape HTML.
- Export as JSON (lossless round-trip) and Netscape HTML.
- Automatic backup alarm and the `bb` omnibox keyword.
- Options page with import/export UI in the overview.
- Overview bulk-select, bulk actions, and keyboard shortcuts.
- Transactional `bulkAddTag` / `bulkDelete` with atomicity tests.
- Tag management UI: rename, merge, and delete.
- Tag hierarchy and colours.
- Smart capture in the popup: content-type detection and tag suggestions.
- Opt-in network enrichment fetcher with a sweep alarm.
- Chrome side panel, context menu, and action badge.
- Action badge for the unread-bookmark count.
- Dead-link checker.
- Folder sidebar with drag-and-drop, a drop popup + badge, and a `Cmd+D` capture shortcut.
- Synced Chrome folder tree rendered in the sidebar.
- Raw Chrome bookmarks-tree snapshot taken before any sync work.
- Bookmark-stub state and a soft-duplicate audit surface in health.
- In-browser semantic search: offscreen document + `transformers.js` single-embed roundtrip.
- Local RAG pipeline scaffold for the CLI power-user tier.
- Marketing site bootstrapped under `apps/web/` -- press kit page (fact sheet,
  tiers, features, FAQ, contact), dynamic OG share card, `/privacy` page and
  footer link, favicon set generated from `public/full128.png`.
- Virtualised list for rendering large imported-bookmark sets.
- Filtering on the overview page.
- Autocomplete on the options page.
- Autofill, tag autocomplete, and a `Cmd+D`-style capture hotkey in the popup.
- Download button, user-selectable action icons, and the initial icon set.
- Date pickers, tagging section, tree view, and the first pass of the overview page.
- Deterministic synthetic Chrome bookmark corpus and a 20k-corpus scale case
  for `importChromeTree`.
- Coverage for `mergeTags` across 180 bookmarks and a placeholder search-bench
  scaffold (`BENCHMARKS.md`).
- Install-through-uninstall test asserting the Chrome tree survives.
- `PRIVACY.md` documenting all runtime egress paths; README Install section
  for end users; MIT `LICENSE`; GitHub issue templates; CI running
  check/test/build/zip on PR and master with zip uploads on master.

## Changed

- Batched Chrome + JSON import into a single Dexie transaction (perf).
- Replaced MUI with shadcn/ui on Tailwind v4.
- Rerouted the auto-backup path through the shared `exportJson` helper.
- Migrated the build from webpack to WXT + Vite.
- Upgraded React 18 -> 19.
- Migrated tooling to pnpm; bumped the TypeScript target to ES2020 and enabled the `react-jsx` runtime.
- Bumped Biome 1.9.4 -> 2.4.13; require Node >= 24.
- Added Biome as formatter/linter with a pre-commit hook.
- Pinned the WXT dev server to port 3147, disabled `web-ext` auto-launch in dev, and emit the build to `dist/` so `chrome://extensions` Load-unpacked finds it in Finder.
- Refreshed the marketing FAQ against current repo state.

## Fixed

- Stopped dumping the full Chrome bookmarks tree on every service-worker boot.
- Swallowed `No tab with id` noise from the action-icon updater.
- Dead-link checker no longer flags 429 / 5xx / transient responses as dead.
- Stopped the edit-panel overflow and widened the overview detail sheet.
- Opened the detail sheet on a bookmark row click.
- Removed the duplicate close `X` on the detail sheet and silenced Radix dialog a11y warnings.
- Dropped the re-introduced Chrome-import button and its dead helper from the overview.
- Supplied a WebCrypto PRNG so `ulid` imports succeed inside the service worker.
- Drove Biome 2.x findings to zero across three passes with proper per-rule treatment.
- Fixed a batch of pre-rewrite tag-creation, tagging, and TypeScript issues from the original codebase.

## Install

The Chrome Web Store listing is pending review. To try the release candidate
today, download the attached zip for your browser and load it unpacked:

**Chrome / Edge / Brave (`better-bookmarks-1.0.0-rc.1-chrome.zip`)**

1. Unzip the archive.
2. Open `chrome://extensions`.
3. Turn on Developer mode (top right).
4. Click Load unpacked and pick the unzipped folder.

**Firefox (`better-bookmarks-1.0.0-rc.1-firefox.zip`)**

1. Unzip the archive.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click Load Temporary Add-on and pick `manifest.json` inside the unzipped folder.

SHA-256 checksums for both zips are printed by the release script and posted
in this release's body once the assets are attached.
