# Better Bookmarks — Chrome Web Store listing

## Short description (132 chars)

Tag-first bookmarks for Chrome. Aggressive URL deduplication. Designed for 20,000+ bookmarks. Open source, no account, no cloud.

## Long description

Save the same article twice — once from a tweet with `?s=20`, once from a newsletter with `?utm_source=...` — and get one bookmark, not two. Per-domain rules cover YouTube, Twitter/X, Reddit, GitHub, Wikipedia, and Amazon. Global rules strip `utm_*`, `fbclid`, `gclid`, `mc_*`, `?si=`, and `#:~:text=` fragments. The full rule set is in `docs/URL_NORMALIZATION.md`.

Tags are a projection over Chrome folders. A bookmark can carry every label that applies. The Chrome folder a bookmark sits in becomes one of its tags automatically. Mirroring a tag back to a Chrome folder is opt-in.

Search uses an IndexedDB inverted index designed for 20,000+ bookmarks. All bookmark data stays in IndexedDB and `chrome.storage`. The extension makes no third-party analytics calls (`docs/PRIVACY.md`).

## Features

- Tag-first organisation. A bookmark carries an unbounded set of tags.
- Aggressive URL deduplication with per-domain and global rules.
- Two-way Chrome sync. Chrome stays the source of truth for URL, title, and folder.
- Per-bookmark metadata: rating, reading time, content type, read state, note.
- Connection graph for manual edges and auto-suggested links between bookmarks.
- IndexedDB inverted index sized for 20,000+ bookmarks.
- Search query language: bare words plus `tag:`, `domain:`, `is:unread`, `rating:>=7`.
- Import and export: JSON, Netscape HTML, Pocket CSV, Goodreads HTML, raw URL list.
- Opt-in enrichment for `og:` tags, `<title>`, and reading-time estimate.
- Side panel, action button, and right-click context menu capture surfaces.
- Dead-link checker that flags a URL only after failures on three distinct days.
- Tag management: rename, merge, delete, colour, hierarchy.
- MIT licensed.

## Source

Full source on GitHub: https://github.com/trebeljahr/better-bookmarks — MIT licensed.

## Verification checklist (for pre-submission review)

- Short description char count (127) — `docs/CWS_LISTING.md:3`
- Per-domain URL rules for YouTube, Twitter/X, Reddit, Wikipedia, GitHub, Amazon — `docs/URL_NORMALIZATION.md:11`, `docs/URL_NORMALIZATION.md:15`, `docs/URL_NORMALIZATION.md:17`, `docs/URL_NORMALIZATION.md:19`, `docs/URL_NORMALIZATION.md:75`, `docs/URL_NORMALIZATION.md:86`, `docs/URL_NORMALIZATION.md:93`, `docs/URL_NORMALIZATION.md:129`
- Global tracking-parameter stripping (`utm_*`, `fbclid`, `gclid`, `mc_*`) — `docs/URL_NORMALIZATION.md:54`, `docs/URL_NORMALIZATION.md:56`, `docs/URL_NORMALIZATION.md:57`
- Text-fragment stripping (`#:~:text=`) — `docs/URL_NORMALIZATION.md:43`
- Tag-first folder-projection model — `press-kit/press-kit.md:117`
- Chrome folder appears as tag automatically — `press-kit/press-kit.md:117`
- Two-way Chrome sync architecture — `docs/CHROME_SYNC.md`
- Bare-word search p95 46.80 ms on 20k corpus — `docs/BENCHMARKS.md:25`
- No third-party analytics or telemetry SDK — `docs/PRIVACY.md:16`
- No network calls to a Better Bookmarks server — `docs/PRIVACY.md:19`
- Semantic-search model download is opt-in (settings-gated) — `src/core/semantic/bridge.ts:40`
- Dead-link checker only flags after failures on three distinct days — `src/core/maintenance/deadLinkChecker.ts:24`
- Firefox build from source (`pnpm zip:firefox`) — `package.json:16`
- MIT license — `LICENSE:1`
