# Better Bookmarks — Chrome Web Store listing

## Short description (132 chars)

Tag-first bookmarks for Chrome. Aggressive URL deduplication. Designed for 20,000+ bookmarks. Open source, no account, no cloud.

## Long description

Save the same article twice, once from a social post and once from a newsletter link, and get one bookmark, not two. Better Bookmarks removes tracking parameters (utm_*, fbclid, gclid, mc_*, si) and text-highlight fragments before it compares URLs. Extra rules for popular video, social, code, encyclopedia and shopping sites catch the same page under different URLs. The full rule list is in the source repository.

Tags work on top of your Chrome folders. A bookmark can carry every label that applies. The Chrome folder of a bookmark becomes one of its tags automatically. Mirroring a tag back to a Chrome folder is opt-in.

Search uses a local index designed for 20,000+ bookmarks. All bookmark data stays in your browser. The extension makes no third-party analytics calls.

## Features

- Tag-first organisation. A bookmark carries an unbounded set of tags.
- Aggressive URL deduplication with per-domain and global rules.
- Two-way Chrome sync. Chrome stays the source of truth for URL, title, and folder.
- Per-bookmark metadata: rating, reading time, content type, read state, note.
- Connection graph for manual edges and auto-suggested links between bookmarks.
- IndexedDB inverted index sized for 20,000+ bookmarks.
- Search query language: bare words plus `tag:`, `domain:`, `is:unread`, `rating:>=7`.
- Import and export: JSON, standard bookmark HTML, CSV and HTML exports from read-later and book-tracking services, plain URL lists.
- Opt-in enrichment for `og:` tags, `<title>`, and reading-time estimate.
- Side panel, action button, and right-click context menu capture surfaces.
- Dead-link checker that flags a URL only after failures on three distinct days.
- Tag management: rename, merge, delete, colour, hierarchy.
- MIT licensed.

## Source

Full source on GitHub: https://github.com/trebeljahr/better-bookmarks — MIT licensed.

## Store review note

v1.0 was rejected on 2026-10-20 (Spam and Placement, ref. "Yellow Argon") for listing third-party site names (YouTube, Twitter/X, Reddit, GitHub, Wikipedia, Amazon) in the description. Keep brand and site names out of the listing text; describe site categories instead. The per-site detail lives in `docs/URL_NORMALIZATION.md`.

## Verification checklist (for pre-submission review)

- Short description char count (127) — `docs/CWS_LISTING.md:3`
- Per-domain URL rules for YouTube, Twitter/X, Reddit, Wikipedia, GitHub, Amazon — `docs/URL_NORMALIZATION.md:11`, `docs/URL_NORMALIZATION.md:15`, `docs/URL_NORMALIZATION.md:17`, `docs/URL_NORMALIZATION.md:19`, `docs/URL_NORMALIZATION.md:75`, `docs/URL_NORMALIZATION.md:86`, `docs/URL_NORMALIZATION.md:93`, `docs/URL_NORMALIZATION.md:129`
- Global tracking-parameter stripping (`utm_*`, `fbclid`, `gclid`, `mc_*`) — `docs/URL_NORMALIZATION.md:54`, `docs/URL_NORMALIZATION.md:56`, `docs/URL_NORMALIZATION.md:57`
- Text-fragment stripping (`#:~:text=`) — `docs/URL_NORMALIZATION.md:43`
- Tag-first folder-projection model — `press-kit/press-kit.md:81`
- Chrome folder appears as tag automatically — `press-kit/press-kit.md:81`
- Two-way Chrome sync architecture — `docs/CHROME_SYNC.md`
- Bare-word search p95 46.80 ms on 20k corpus — `docs/BENCHMARKS.md:25`
- No third-party analytics or telemetry SDK — `docs/PRIVACY.md:16`
- No network calls to a Better Bookmarks server — `docs/PRIVACY.md:19`
- Semantic-search model download is opt-in (settings-gated) — `src/core/semantic/bridge.ts:40`
- Dead-link checker only flags after failures on three distinct days — `src/core/maintenance/deadLinkChecker.ts:24`
- Firefox build from source (`pnpm zip:firefox`) — `package.json:16`
- MIT license — `LICENSE:1`
