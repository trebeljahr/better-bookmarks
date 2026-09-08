# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — Unreleased

Backfilled from `git log` since project inception. Grouped by commit-prefix
convention (`feat:` → Added, `perf:` / `refactor:` → Changed, `fix:` → Fixed).
Older, pre-convention commits are categorised by their intent.

### Added

- Dexie-backed storage layer with URL canonicalisation and legacy-schema migration.
- Bidirectional Chrome bookmarks sync.
- Full-text search: query parser, `useSearch` hook, and top-of-overview `SearchBar`.
- Bookmark edges with auto-suggested connections and a `ConnectionsPanel` in the detail view.
- Import support for Goodreads HTML, Pocket CSV, raw URL lists, and Netscape HTML.
- Export as JSON (lossless round-trip) and Netscape HTML.
- Automatic backup alarm and the `bb` omnibox keyword.
- Options page with import/export UI in the overview.
- Overview bulk-select, bulk actions, and keyboard shortcuts.
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
- Marketing site bootstrapped under `apps/web/`.
- Virtualised list for rendering large imported-bookmark sets.
- Filtering on the overview page.
- Autocomplete on the options page.
- Autofill, tag autocomplete, and a `Cmd+D`-style capture hotkey in the popup.
- Download button, user-selectable action icons, and the initial icon set.
- Date pickers, tagging section, tree view, and the first pass of the overview page.

### Changed

- Batched Chrome + JSON import into a single Dexie transaction (perf).
- Replaced MUI with shadcn/ui on Tailwind v4.
- Rerouted the auto-backup path through the shared `exportJson` helper.
- Migrated the build from webpack to WXT + Vite.
- Upgraded React 18 → 19.
- Migrated tooling to pnpm; bumped the TypeScript target to ES2020 and enabled the `react-jsx` runtime.
- Bumped Biome 1.9.4 → 2.4.13; require Node ≥ 24.
- Added Biome as formatter/linter with a pre-commit hook.
- Pinned the WXT dev server to port 3147, disabled `web-ext` auto-launch in dev, and emit the build to `dist/` so `chrome://extensions` Load-unpacked finds it in Finder.

### Fixed

- Stopped dumping the full Chrome bookmarks tree on every service-worker boot.
- Swallowed `No tab with id` noise from the action-icon updater.
- Stopped the edit-panel overflow and widened the overview detail sheet.
- Opened the detail sheet on a bookmark row click.
- Removed the duplicate close `X` on the detail sheet and silenced Radix dialog a11y warnings.
- Dropped the re-introduced Chrome-import button and its dead helper from the overview.
- Supplied a WebCrypto PRNG so `ulid` imports succeed inside the service worker.
- Drove Biome 2.x findings to zero across three passes with proper per-rule treatment.
- Fixed a batch of pre-rewrite tag-creation, tagging, and TypeScript issues from the original codebase.

[1.0.0]: https://github.com/trebeljahr/better-bookmarks
