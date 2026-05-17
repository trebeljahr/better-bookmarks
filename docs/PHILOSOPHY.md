# Design Philosophy

This document captures the *why* behind Better Bookmarks. It is the
north-star reference whenever a feature is on the table and we need to
decide whether it earns its complexity.

## The problem we're solving

Chrome bookmarks today are good at one thing: *recall by omnibox search*.
They are bad at almost everything else that matters once you cross a few
thousand bookmarks:

- A bookmark can live in exactly one folder. Real interests don't behave
  that way — a paper about diffusion models is "AI", "Generative",
  "Paper", *and* "Read later" all at once.
- URLs accumulate trash: `utm_*` parameters, `?t=42s` on YouTube,
  `?fbclid`, `?si=...`, `#:~:text=...`. Two saves of the same article
  become two different bookmarks.
- There is no notion of *connection* between bookmarks. Two articles
  that argue opposite sides of the same question sit next to unrelated
  noise in alphabetical order.
- There is no captured context: no rating, no estimated reading time,
  no "I've actually read this", no note explaining why this is here.
- Search is title + URL substring. No tag query, no full-text on saved
  page content, no domain pivot.
- Imports and exports are weak. Goodreads has its own HTML dump, Chrome
  has its own, Pocket has its own. None of them talk to each other.

Better Bookmarks should be the place where all of these failure modes
get fixed *without* losing the one thing Chrome does well: the omnibox.

## Guiding principles

### 1. Chrome's bookmarks tree is part of the product, not a competitor

The single biggest reason to keep using Chrome bookmarks is that they
are surfaced everywhere — omnibox suggestions, sync to mobile, sync to
other devices, the bookmarks bar, search engines that integrate with
them. We do not try to replace any of that.

The extension is a *second store* layered next to the Chrome store.
Chrome stays the source of truth for URL + title + folder. Our store
holds the metadata Chrome can't: tags, rating, reading time, notes,
connections, canonical URL, content type, last-read timestamp.

Both stores stay in sync, both ways. A bookmark created in plain Chrome
should show up here within seconds. A bookmark created here should show
up in the Chrome bar and the omnibox within seconds.

If forced to choose: Chrome wins for URL/title/folder; we win for
everything else. Conflicts get resolved with explicit rules, not
last-writer-wins guesswork.

### 2. Tags are primary; folders are a projection

Folders are a hierarchy. Tags are a set. Real-world organization is a
set. We make tags first-class and treat the folder hierarchy as a
*derived view* of tags.

- A bookmark can carry any number of tags.
- The Chrome folder a bookmark sits in becomes one of its tags
  automatically (the leaf folder name, optionally also the ancestor
  chain).
- Conversely, a tag *may* be mirrored into a Chrome folder so that
  folder-only tools (mobile, omnibox, third-party Chrome integrations)
  still benefit. Which tag mirrors to which folder is a user choice,
  not a forced default — we never silently shuffle the Chrome tree.

This keeps Chrome ergonomics intact while giving us multi-category
membership where it actually matters.

### 3. The URL is a fingerprint, not a label

Two URLs that resolve to the same page are the same bookmark. We
enforce this aggressively via *URL canonicalization*. See
[URL_NORMALIZATION.md](URL_NORMALIZATION.md) for the rule set.

Every bookmark has both an `originalUrl` (what the user actually
visited, preserved verbatim) and a `canonicalUrl` (the dedup key, used
for storage and lookup). Canonicalization is pure, deterministic, and
re-runnable — if we tighten the rules later we can re-canonicalize the
whole store in one pass and merge new duplicates.

Canonicalization is per-domain when it has to be (YouTube, Twitter,
Reddit, GitHub, news sites) and rule-based for the long tail (strip
known tracking params, strip text fragments, lowercase host, drop
default ports, drop trailing slash on `/`, etc.).

### 4. Bookmarks are nodes in a graph

Saving a link is the start, not the end. Bookmarks gain meaning by
being connected to other bookmarks:

- Manual links: "this is the source for X", "this rebuts X", "see also".
- Auto-suggested links: shared canonical domain, shared author, shared
  tag intersection, shared text fragment.
- Reading sequence: "this is part 2 of …", "follow-up to …".

The graph is a flat edge table, not a tree. An edge has a type, a
direction (or none), and an optional note. Edges are surfaced in the
detail view and in search ("show me everything connected to X").

We do not try to be Roam. The graph is a *help-me-find-things* tool,
not a writing surface. Edges have low friction to add and zero
friction to ignore.

### 5. Capture is fast, enrichment is async

The popup must be usable in under one second after Ctrl+Shift+X.
Required fields at capture time: nothing. Optional fields offered up
front: tags, rating, note. Everything else (reading time, content
type, link suggestions, page snapshot) is computed in the background
after save.

A bookmark with zero metadata is still a valid bookmark. Metadata is
allowed to arrive late or never. The system never blocks the user
waiting for enrichment.

### 6. The data is the user's, always exportable

Every state is exportable to JSON, and the JSON round-trips. The HTML
exporter produces a Netscape bookmarks file Chrome and Firefox can
import directly — even if Better Bookmarks disappears tomorrow the
user keeps everything.

Imports cover at minimum: Chrome HTML, Firefox HTML, Goodreads HTML,
Pocket CSV, raw URL list. Each importer maps cleanly to the data model
without lossy guesswork — when a field doesn't exist on the import
side, it stays empty rather than being invented.

### 7. Search has to be honest about scale

Rico has 20,000+ bookmarks today. The search index has to handle that
without blocking the UI. We index in IndexedDB, query off the main
thread where it matters, and degrade gracefully when the index is
stale (return live filter results, schedule a re-index).

Search hits: title, description, note, tags, canonical URL, domain.
Future: full-text on saved page text.

### 8. Don't fight the platform

This is a Chrome extension. We use what Chrome gives us — the
bookmarks API, the storage APIs, the omnibox keyword API, the
service-worker lifecycle — and we work *with* its constraints (MV3
service worker may suspend at any time; storage quotas; permission
prompts).

When the right tool is a Chrome API we use it. When the right tool is
custom we build it. We do not reinvent what already exists in the
platform unless the platform's version actively gets in the way.

## What we explicitly do NOT do

- We do not host a cloud sync server. Chrome sync handles the
  bookmark tree; our metadata syncs via `chrome.storage.sync` for the
  small bits and stays local in IndexedDB for the rest. If users want
  cross-device metadata sync of the full store, that's a v3 problem
  and probably solved by exporting to a Gist or a file in a synced
  folder.
- We do not snapshot full pages by default. Saving the open HTML of
  every visited page is a different product (Pocket, ArchiveBox).
  We may add it behind an opt-in later; it is not the core.
- We do not try to be a read-it-later app with offline reading mode.
  Reading time and "have I read this" are tracked, but the reading
  itself happens in the browser tab.
- We do not auto-categorize with an LLM by default. An optional
  enrichment pass is fine, but the core flow stays deterministic and
  offline.

## How to use this document

When adding a feature, check it against the principles above. If the
feature contradicts one of them, that's not a blocker — it's a
prompt to update the principle deliberately. The principles change
when the product genuinely needs them to; they do not change to
rationalize a feature after the fact.
