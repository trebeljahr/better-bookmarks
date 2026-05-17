# URL Normalization

The dedup story. Two URLs that resolve to the same page must collapse
to the same `canonicalUrl`. This document is the source of truth for
what "same page" means here.

## Why this matters

A few real examples from the existing 20k-bookmark corpus:

- `https://www.youtube.com/watch?v=abc&t=42s` and
  `https://www.youtube.com/watch?v=abc&list=WL` are the same video.
- `https://example.com/article?utm_source=twitter&utm_medium=social`
  and `https://example.com/article` are the same article.
- `https://twitter.com/user/status/12345?s=20` and
  `https://x.com/user/status/12345` are the same tweet.
- `https://en.wikipedia.org/wiki/Foo#Bar` and
  `https://en.wikipedia.org/wiki/Foo#Baz` are usually the same page.
- `https://github.com/user/repo/` and `https://github.com/user/repo`
  are the same repo.

Without canonicalization these all become separate bookmarks. With
canonicalization they collapse to one record with the union of tags.

## Pipeline

The canonicalizer runs a fixed sequence:

1. **Parse**. If `URL` construction fails the URL is "unparseable";
   we return the original string and flag it.
2. **Lowercase host**. `Example.com` → `example.com`.
3. **Strip default ports**. `:80` on `http`, `:443` on `https`.
4. **Normalize scheme**. `http` stays `http` unless the user opted
   into "always upgrade". `chrome-extension://`, `file://`,
   `javascript:`, `data:` are *not* bookmarkable — we refuse them.
5. **Strip global tracking params** (see list below).
6. **Apply per-domain strategy** (see list below). This can rewrite
   path, drop more params, drop the fragment, swap the host.
7. **Sort remaining query params** alphabetically by key.
8. **Drop empty query**. `?` with nothing after collapses.
9. **Trim trailing slash** on path `/` only if the path is `/`. We do
   not trim trailing slashes elsewhere — some sites care.
10. **Strip text fragments**. `#:~:text=...` is browser
    highlighting, not page identity.
11. **Drop empty fragment**. `#` with nothing after collapses.

The output is the canonical URL.

## Global tracking-parameter blacklist

Stripped on every URL regardless of domain:

```
utm_source, utm_medium, utm_campaign, utm_term, utm_content,
utm_id, utm_name, utm_brand, utm_social,
fbclid, gclid, dclid, msclkid, yclid, twclid, _hsenc, _hsmi,
mc_cid, mc_eid, mkt_tok,
ref, ref_src, ref_url, source, referrer,
igshid, igsh, share_app_name,
spm, scm,
__twitter_impression, ck_subscriber_id
```

This list is in `core/canonicalizer/rules.ts`. Adding a new entry is
the most common rule change. The user override layer in
`chrome.storage.sync` can add more entries; it can never remove
shipped entries — removal happens by editing the default list and
shipping a new version.

## Per-domain strategies

The long-tail rules. Each strategy gets `(parsedUrl) => parsedUrl`
and may rewrite anything.

### YouTube (`youtube.com`, `youtu.be`, `m.youtube.com`)

- Host normalizes to `www.youtube.com`.
- `youtu.be/<id>` rewrites to `www.youtube.com/watch?v=<id>`.
- `/shorts/<id>` rewrites to `/watch?v=<id>` (shorts and full videos
  are the same content).
- Keep: `v`, `list` (only if the bookmark looks like a playlist save
  — heuristic: list id starts with `PL` or `OL`).
- Drop: `t`, `start`, `end`, `feature`, `si`, `pp`, `index`, `ab_channel`.
- Fragment dropped.

### Twitter / X (`twitter.com`, `x.com`, `mobile.twitter.com`,
`nitter.*`)

- Host normalizes to `x.com`.
- Drop: `s`, `t`, `cxt`, `lang`.
- Path stays as-is (status URLs are stable).

### Reddit (`reddit.com`, `old.reddit.com`, `new.reddit.com`,
`np.reddit.com`)

- Host normalizes to `www.reddit.com`.
- Path stays.
- Drop: `utm_*` (already global), `context`, `share_id`,
  `chainedPosts`.
- Trailing slash kept (Reddit prefers it).

### GitHub (`github.com`, `gist.github.com`)

- Repo URLs (`/user/repo`): drop trailing slash.
- Issue/PR URLs (`/user/repo/issues/123` etc): drop fragment unless
  it points to a specific comment (`#issuecomment-...`) — that we
  keep because it's content identity.
- Drop: `tab`, `q` on the repo root, `type` on issue lists.

### Medium (`*.medium.com`, `medium.com`)

- Drop: `source`, `sk`.
- Drop the trailing `-{hash}` suffix on article slugs only if a
  cleaner canonical exists. Heuristic: if `og:url` is available we
  prefer it, otherwise leave as-is.

### Wikipedia (`*.wikipedia.org`)

- Drop fragment by default (section anchors are not page identity).
- Override: user can opt in to "treat sections as separate
  bookmarks" for Wikipedia globally.

### Amazon (`amazon.*`)

- Rewrite `/dp/<asin>/...` to `/dp/<asin>`. Everything after the ASIN
  is tracking and breadcrumbs.
- Drop everything in the query.

### Stack Overflow (`stackoverflow.com`, `*.stackexchange.com`)

- `/questions/<id>/<slug>/...` — drop everything after `<slug>`.
- Drop fragment unless it's `#answer-<id>`.

### Google Search / Docs / Drive

- We *do not* canonicalize search result URLs — they are session
  artifacts and shouldn't be bookmarked as identity.
- Google Docs: keep doc id, drop everything else in the query.

### Default fallback

If no per-domain strategy matches: apply only the global pipeline.

## Things we deliberately do NOT do

- **Follow redirects to find the "true" URL.** That requires a
  network call, makes canonicalization async, and bookmarks created
  offline would have to wait. We canonicalize purely on the input
  string.
- **Lowercase the path.** Some sites are case-sensitive (S3,
  user-generated content). Path case stays.
- **Strip the fragment universally.** For Wikipedia, sections aren't
  identity. For GitHub comments, they are. Per-domain rules decide.
- **Use `og:url` automatically.** A future enrichment step *may* fetch
  it, but the synchronous canonicalizer doesn't.
- **Trim `www.` from every host.** Some sites serve different content
  at the apex vs. `www.`. Per-domain rules normalize where safe.

## Re-canonicalization

When rules change, every existing bookmark gets re-canonicalized.
The migration:

1. Iterate all bookmarks.
2. Compute new `canonicalUrl` from `originalUrl`.
3. If `newCanonical === oldCanonical`: no-op.
4. If `newCanonical !== oldCanonical` and no other bookmark currently
   has `newCanonical`: update in place.
5. If `newCanonical !== oldCanonical` and another bookmark already
   has `newCanonical`: merge (see [DATA_MODEL.md](DATA_MODEL.md#migration-discipline)
   for merge rules).

The mapping table to Chrome bookmarks gets updated atomically with
the bookmark record.

## Testing

A frozen fixture file `core/canonicalizer/fixtures.json` holds
`(input, expected)` pairs. Every new rule starts with adding fixture
rows that demonstrate it. CI fails if any fixture row regresses.
Fixture rows do not get deleted — when a rule is intentionally
changed, the fixture row's expected value is updated in the same
commit and the change is reviewable.

## Open questions

- Whether to canonicalize fragments on `news.ycombinator.com` (HN
  uses fragments for "show more comments" navigation). Probably yes,
  but the rule needs spot-checking.
- Whether `arxiv.org/abs/<id>` and `arxiv.org/pdf/<id>` should
  collapse. Same paper, different formats — leaning yes, collapse to
  `/abs/<id>`.
- Whether to strip locale path prefixes (`/en/`, `/de/`) for sites
  that auto-detect. Risky; off by default.
