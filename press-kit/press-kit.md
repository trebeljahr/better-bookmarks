# Better Bookmarks — Press Kit

Single-page fact sheet for journalists, newsletter editors, and bloggers covering [Better Bookmarks](https://github.com/trebeljahr/better-bookmarks). Copy text below verbatim where it helps; modify factual numbers only after re-checking the live extension and the marketing site.

Sister docs:
- [[texts/misc/claude-chat-gpt-generated/projects/better-bookmarks/better-bookmarks-marketing-plan]]
- [[texts/misc/claude-chat-gpt-generated/projects/better-bookmarks/better-bookmarks-launch-copy]]
- [[texts/misc/claude-chat-gpt-generated/projects/better-bookmarks/better-bookmarks-launch-checklist]]

## Fact sheet

```
PROJECT:           Better Bookmarks
TAGLINE:           Pinboard for the Chrome era — tags, not folders.
                   One URL per page. Scales to twenty thousand.
URL:               https://github.com/trebeljahr/better-bookmarks
INSTALL:           Chrome Web Store (link pending submission — see
                   launch checklist; until then, load unpacked from
                   the GitHub release zip)
MAKER:             Rico Trebeljahr — solo developer, no company
LOCATION:          Berlin, Germany
RELEASE:           2026 (public launch contingent on Chrome Web
                   Store review)
PRICE:             Free. No paid tier, ever. No account required.
LICENSE:           MIT (open source). LICENSE file shipped in repo
                   root before launch.
PLATFORMS:         Chrome and Chromium-based browsers (Edge, Brave,
                   Arc, Opera) at launch. Firefox build planned via
                   the same WXT build path; ship to AMO post-launch.
PERMISSIONS:       storage, tabs, bookmarks, downloads, alarms,
                   activeTab, sidePanel, contextMenus, host
                   permissions for <all_urls>. Justified per-
                   permission in the Chrome Web Store privacy form.
DATA HANDLING:     All bookmark data stored locally in IndexedDB and
                   chrome.storage. Nothing transmitted to remote
                   servers by the extension. Chrome's own sync
                   handles cross-device propagation of the bookmark
                   tree itself.
                   (Telemetry status: confirm before launch — see
                   marketing plan open question #7.)
CORPUS DESIGNED FOR: 20,000+ bookmarks. The maintainer's own
                   corpus is in this range; design targets and
                   IndexedDB inverted index are sized accordingly.
                   (Measured-vs-designed status: confirm — see
                   marketing plan open question #2.)
STACK:             Manifest V3, WXT, Vite, React 19, shadcn/ui,
                   Tailwind v4, IndexedDB, Biome, Vitest.
SOURCE OF TRUTH:   Chrome bookmarks tree for URL + title + folder.
                   Better Bookmarks for tags, ratings, notes,
                   connections, canonical URL, content type, last-
                   read timestamp.
PRESS CONTACT:     hello@trebeljahr.com
SOCIAL:            See "Social" section below — handles being
                   warmed at launch.
```

## One sentence

A Chrome extension that fixes the three things browser bookmarks get wrong: single-folder membership, tracking-parameter duplicates, and search that gives up past a few thousand entries.

## Three description tiers

**Short (≈40 words)**
Better Bookmarks is a Chrome extension that adds tags, ratings, notes, and a small connection graph to bookmarks — and aggressively deduplicates URLs by stripping tracking parameters. It syncs both ways with Chrome's native bookmark tree, so there is no lock-in. MIT licensed, free.

**Medium (≈80 words)**
Better Bookmarks is a Chrome extension built around three convictions: bookmarks should be tagged, not foldered; two saves of the same article should not produce two bookmarks (tracking parameters are part of the problem, not part of the URL); and search should still feel instant at twenty thousand bookmarks. The extension layers tags, ratings, notes, and a connection graph onto the existing Chrome bookmark tree without replacing it — Chrome stays the source of truth, mobile sync keeps working, the omnibox keeps working.

**Long (≈150 words)**
Better Bookmarks is a Chrome extension for people whose bookmark collections have outgrown folders. It treats every URL as a fingerprint, not a label: a per-domain canonicalisation pipeline strips tracking parameters (`utm_*`, `?t=42s` on YouTube, `?s=20` on Twitter, `?fbclid`, text fragments, and the long tail) so that two saves of the same article produce one bookmark, not two. Bookmarks carry tags, ratings, reading time, notes, and edges to other bookmarks. The extension is layered *on top of* Chrome's native bookmark tree rather than replacing it — Chrome remains the source of truth for URL, title, and folder, and changes on either side propagate to the other within a second. The search index lives in IndexedDB and is sized for the maintainer's own corpus of twenty thousand-plus bookmarks. Everything is stored locally; no account, no cloud server, no telemetry. MIT licensed, free.

## History — how it got built

```
Better Bookmarks started because Chrome bookmarks stopped scaling.
I had twenty thousand of them — articles, papers, RFCs, talks, weird
corners of the web I wanted to find again — sitting in a folder
hierarchy that was simultaneously too deep and too flat. The omnibox
was the only thing that ever found anything. Folders had become
write-only.

I tried Pinboard, Raindrop, GoodLinks, Anybox. Pinboard is exactly
right philosophically and exactly the wrong era visually for the
people I wanted to share it with. Raindrop's free tier is crippled
and the paid tier started slowing past five thousand entries.
GoodLinks and Anybox are macOS-shaped and I do not live there.

The thing none of them had: Chrome stays the source of truth.
Mobile sync keeps working. The omnibox keeps working. The
bookmarks bar keeps working. Better Bookmarks adds what Chrome
can't (tags, ratings, notes, connections, deterministic dedup),
and it does it as a second store layered on top of the native one,
synced both ways.

The URL canonicalisation came out of frustration with how many of
those twenty thousand bookmarks were near-duplicates. I'd
bookmarked the same paper from arxiv, from a tweet (with `?s=20`),
from a newsletter (with `?utm_source=...`), from a Hacker News
comment (with `?utm_medium=email`). The fix is small, deterministic,
and re-runnable: a rule set per domain plus a stripper for the
tracking-param zoo, all documented in `docs/URL_NORMALIZATION.md`.

I am writing this for me, first. There are a handful of other
people in the world who already have this many bookmarks and have
already tried the same alternatives. This is for them too.
```

## Hooks (for editors who want a story angle)

- **The URL canonicalisation pipeline.** Per-domain rules for YouTube, Twitter/X, Reddit, GitHub, Wikipedia, Amazon; rule-based stripping for `utm_*`, text fragments, `fbclid`, `si`, and the rest. Deterministic, re-runnable on the full corpus when rules tighten. Documented in `docs/URL_NORMALIZATION.md`. This is the angle for *Hacker News, Lobsters, /r/programming, /r/webdev.*
- **Pinboard for the Chrome era.** Same first principles (tags, durable export, no cloud lock-in, single-developer project), built for the browser and the corpus size people actually have in 2026. This is the angle for *Pinboard refugees, /r/pinboard, slow-web blogs.*
- **No lock-in by design.** The extension is a *second store* layered onto the native Chrome bookmarks tree. Uninstall it and every bookmark is still in Chrome, still on mobile, still in the omnibox. The architecture makes lock-in structurally impossible.  This is the angle for *privacy-leaning press, FOSS communities, anyone tired of SaaS-trap bookmark apps.*
- **Solo project, open source, no business model.** MIT licence, no upsell, no paid tier, no telemetry. Built by one developer who has the problem himself. This is the angle for *indie / FOSS coverage, Bluesky, Mastodon.*

## Features (verbatim for press features and storefront use)

- **Tag-first organisation.** Bookmarks carry an unbounded set of tags. The Chrome folder a bookmark sits in becomes one of its tags automatically. Folders are a *projection* over tags, not the primary structure.
- **Aggressive URL deduplication.** Per-domain canonicalisation strips tracking parameters (`utm_*`, `?t=42s`, `?s=20`, `?fbclid`, `#:~:text=...`) so two saves of the same page do not produce two bookmarks. Re-runnable across the full corpus.
- **Two-way Chrome sync.** Chrome stays the source of truth for URL, title, and folder. Bookmarks created in plain Chrome appear in the extension within ~1 s; bookmarks created in the extension appear in the Chrome bar within ~1 s. Loop prevention via an `inFlight` token mechanism. Documented in `docs/CHROME_SYNC.md`.
- **Per-bookmark metadata.** Rating, estimated reading time, content type, "have I read this", manual note. All optional; a bookmark with zero metadata is still a valid bookmark.
- **Connection graph.** Manual edges ("source for", "rebuts", "see also") plus auto-suggestions (shared canonical domain, shared tag intersection, text similarity). The graph is a *help-me-find-things* aid, not a writing surface.
- **IndexedDB inverted index.** Designed for 20k+ bookmarks. Off-main-thread for heavy queries. Degrades gracefully when the index is stale.
- **Search query language.** Bare words plus `tag:foo`, `domain:example.com`, `is:unread`, `rating:>=7`. Optional omnibox keyword (`bb`) hits the same query path.
- **Import / export.** JSON round-trips losslessly. Netscape HTML import + export (Chrome / Firefox compatible). Goodreads HTML, Pocket CSV, raw URL list importers. Every export is portable; the extension cannot trap data.
- **Optional opt-in enrichment.** Background fetch of `og:` tags, `<title>`, reading-time estimate. Off by default; the core flow stays deterministic and offline.
- **Side panel + context menu + action badge.** Chrome MV3 surfaces — capture from the omnibox, the action button, the right-click menu, or the side panel.
- **Dead-link checker.** Background sweep flags bookmarks whose target now returns 404, with a one-click "archive" or "fix" path.
- **Tag management UI.** Rename, merge, delete tags with confirmation; tag hierarchy with colours.
- **MIT licensed.** Full source on GitHub. Issues and PRs welcome.

## Engineering fact sheet (for tech editors)

- Stack: Manifest V3, WXT (build tooling), Vite, React 19, shadcn/ui, Tailwind v4, IndexedDB, Biome, Vitest. Recently migrated from Webpack to WXT/Vite and from MUI 5 / React 17 to shadcn/ui / React 19.
- Storage: IndexedDB for bookmarks, edges, tags, sync mapping table, inverted index. `chrome.storage.local` for settings and per-domain canonicalisation rules. `chrome.storage.sync` for the small cross-device settings only.
- Sync architecture: a service-worker sync service listens to the six Chrome bookmark events plus the extension's own change stream. An `inFlight` token mechanism prevents loops. Drift reconciliation runs on startup. Documented in `docs/CHROME_SYNC.md`.
- Canonicalisation: pure, deterministic, re-runnable. Per-domain strategies for YouTube, Twitter/X, Reddit, GitHub, Wikipedia, Amazon. Global rules for `utm_*`, text fragments, default ports, trailing slashes on `/`. Documented in `docs/URL_NORMALIZATION.md`. Fixture tests in Vitest.
- Search: inverted index in IndexedDB, ranking by recency × rating × tag-match weight. Background indexer triggered by `bookmark:upserted` events. Design target: queries return in < 50 ms on a 20k corpus *(see marketing plan open question #2)*.
- Build artifacts: `pnpm zip` produces a Chrome upload zip; `pnpm zip:firefox` produces a Firefox build via WXT's cross-browser targets.
- Repo layout: extension source in `src/`, marketing site in `apps/web/` (Next.js), design docs in `docs/`.

## FAQ

**Is my bookmark data sent anywhere?**
No. Bookmarks live in your browser's IndexedDB and `chrome.storage`. The extension does not include a server. Chrome's own bookmark sync handles cross-device propagation of the bookmark tree itself — that is Google's existing sync, not anything new this extension adds.

**Does it replace Chrome's bookmarks?**
No. It adds a second store layered on top. Chrome's bookmark tree stays the source of truth for URL, title, and folder; the extension adds tags, rating, notes, and a connection graph. Uninstall the extension and your bookmarks are still in Chrome, still on mobile, still in the omnibox.

**Why tags instead of folders?**
A bookmark about, say, diffusion models is "AI", "generative", "paper", and "read-later" all at once. Folders force a single answer. Tags let you carry every label that applies and pivot on any of them when searching.

**How does the duplicate detection work?**
Each bookmark has both an `originalUrl` (what you visited, preserved) and a `canonicalUrl` (the dedup key). The canonicaliser is a small pipeline of per-domain rules (YouTube `?t=`, Twitter `?s=`, etc.) plus global tracking-parameter stripping (`utm_*`, `fbclid`, `?si=...`, text fragments). Saving the same canonical URL twice updates the existing bookmark rather than creating a new one. Full rule set: `docs/URL_NORMALIZATION.md`.

**Does it work in Firefox? Safari? Edge?**
Edge / Brave / Arc / Opera: yes, they accept Chrome extensions. Firefox: planned. The build system (WXT) already targets Firefox, but the Firefox build has not been validated for launch and is not yet on AMO. Safari: no — Safari uses a different extension format and is not planned.

**Will there be a paid tier?**
No.

**Is there a cloud sync server for the tags and notes?**
No. Chrome's native sync handles the bookmark tree (URL, title, folder). The extension's added metadata (tags, ratings, notes, connections) syncs only via Chrome's small `chrome.storage.sync` quota for the settings bits, and stays local in IndexedDB for the rest. Cross-device metadata sync of the full store is a v2 question and would be solved by exporting to a synced folder or a Gist, not by hosting a Better Bookmarks server.

**How do I migrate from Raindrop / Pocket / Pinboard / Goodreads?**
JSON import for the native format and a CSV importer for Pocket are shipped or in the import roadmap. Pinboard exports as JSON; Raindrop exports as HTML/CSV/JSON; both are supported via the JSON or Netscape HTML import paths. Goodreads ships its own HTML dump and has a dedicated importer. A raw URL list import also exists for the cases where nothing else lines up.

**Can I export everything?**
Yes. JSON round-trips losslessly. Netscape HTML export produces a file Chrome and Firefox import directly. Even if Better Bookmarks disappears, you keep everything.

**How big a bookmark collection can it handle?**
The design target is 20k+. The maintainer's own corpus is in that range. If your collection is meaningfully larger and you hit a wall, open a GitHub issue with a corpus-size note — the scale targets move as the maintainer's own collection moves.

**Does it do AI auto-tagging?**
No, not by default. An optional enrichment pass can be added later as an opt-in. The core flow stays deterministic and offline. Anyone who wants LLM tagging has thirty other options; this extension is the *opposite* of that.

**Where's the source?**
[github.com/trebeljahr/better-bookmarks](https://github.com/trebeljahr/better-bookmarks) — MIT licensed.

## Quotes (attribute to Rico Trebeljahr)

> "I have twenty thousand bookmarks. Every bookmark manager I tried either pretended that wasn't normal, or charged me for it. I built the one that doesn't."

> "The URL canonicalisation pipeline is the part I am most proud of. It's a small set of deterministic rules, but it makes a real bookmark collection feel sane in a way no number of folders ever could."

> "Chrome stays the source of truth. The extension is a *second store* layered on top — bookmarks created in plain Chrome show up here, bookmarks created here appear in the Chrome bar. Uninstall the extension and you've lost nothing. Lock-in is structurally impossible."

> "It runs entirely on your device. There is no server. There is no account. Chrome already syncs your bookmark tree across devices; we don't need to re-invent that."

## Acknowledgements

- **Pinboard**, for proving the design space and for staying around long enough to demonstrate that single-developer bookmark tools are durable.
- **The WXT project**, for making Chrome / Firefox extension builds boring in the best sense.
- **shadcn/ui and Tailwind**, for letting a one-developer extension look like something a team built.

## Image kit

Available as part of the launch package. Until the press-kit zip is published, link to the live marketing site or use the shipped storefront assets.

- `hero-popup.png` — 1920×1080. The capture popup with tags, rating, and the canonical URL field visible. *(in production)*
- `hero-overview.png` — 1920×1080. The overview page with a search query and tag chips visible. *(in production)*
- `hero-dedup.png` — 1920×1080. Two saves of the same article (one with `?utm_source=...`, one with `?s=20`) collapsing into a single bookmark with `originalUrl` and `canonicalUrl` shown. *This is the differentiator screenshot — must ship.* *(in production)*
- `hero-tags.png` — 1920×1080. Tag management UI with hierarchy and colours. *(in production)*
- `hero-connections.png` — 1920×1080. Per-bookmark detail with connection graph and edge types visible. *(in production)*
- `cws-promo-tile.png` — 440×280. Chrome Web Store promo tile. Wordmark + "Tags, not folders." on the brand colour. *(in production)*
- `cws-screenshots/` — five 1280×800 PNGs for the CWS listing. *(in production)*
- `og-card.png` — 1200×630. Social share card for the marketing site. *(in production)*
- `walkthrough.mp4` — 60-second screen recording: install → first-run import of a 20k corpus → search → tag → close. Muted, looping-friendly. *(in production)*

## Video kit

- 60-second walkthrough: install, first-run import showing the dedup pass collapsing duplicates, a couple of searches, a tag operation. No voiceover. *(in production)*
- A longer 3–5 minute developer commentary version may follow; pitch separately.

## Redistribution

- All site / extension screenshots are released under CC0 for editorial use. Credit appreciated, not required.
- The wordmark is released CC0 for press use. Do not modify in ways that imply institutional affiliation.
- The walkthrough video may be embedded, clipped, and re-uploaded for editorial coverage. CC0 for that purpose.

## Social

- Bluesky: warming up at launch — handle TBC.
- Mastodon (fosstodon.org): warming up at launch — handle TBC.
- GitHub: [trebeljahr/better-bookmarks](https://github.com/trebeljahr/better-bookmarks). Issues open.
- Personal blog: [ricos.site](https://ricos.site) — long-form pieces and launch retrospective live there.

Update this section with concrete handles once accounts are active.

## Press contact

Email: hello@trebeljahr.com
Response window: typically same-day during European business hours.

For interviews or longer features, indicate format and outlet in the subject line; written-Q&A is usually fastest to turn around.

## Boilerplate "About"

> Better Bookmarks is a Chrome extension built by Rico Trebeljahr in Berlin. It adds tags, ratings, notes, and a connection graph to browser bookmarks, and deduplicates URLs aggressively by stripping tracking parameters and applying per-domain canonical rules. The extension layers on top of Chrome's native bookmark tree without replacing it, syncs both ways, runs entirely on-device, and is designed for collections of twenty thousand bookmarks and up. Free, MIT licensed, no account. Available on the Chrome Web Store; source at github.com/trebeljahr/better-bookmarks.
