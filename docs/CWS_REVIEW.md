# Chrome Web Store Reviewer Walkthrough

A five-minute walkthrough for the Chrome Web Store reviewer (and future
maintainers): install the built extension, populate it with 100 curated
sample bookmarks, and verify every documented surface without importing
any personal data.

Nothing in this walkthrough touches the network beyond the reviewer's
own click on `chrome://extensions/`. The sample loader writes to
IndexedDB only — the same store the extension uses in production —
and every URL in the sample is a public, well-known page.

## What the reviewer needs

- Chrome 120 or newer (Manifest V3 host).
- The extension folder — either `dist/chrome-mv3/` built from
  `pnpm dev` / `pnpm build`, or an unzipped release archive from
  [Releases](https://github.com/trebeljahr/better-bookmarks/releases).
- No account, no sign-in, no API key.

## 1. Load the extension

1. Open `chrome://extensions/`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and pick `dist/chrome-mv3/`.
4. Pin the toolbar action so the icon is visible.

The extension registers a browser action, a side panel, and a
context-menu entry on bookmarks. The full permission list (and the
API surface each permission actually reaches) is documented in
[`PERMISSIONS.md`](PERMISSIONS.md).

## 2. Open the overview

Click the toolbar icon, then choose **Open overview** (or press
`Ctrl+Shift+X` / `MacCtrl+Shift+X`). The overview opens in a new tab
at `overview.html`.

On a first install the list is empty. That is expected — the
extension holds no seed data and never phones home.

## 3. Load the sample corpus (dev builds only)

The **Load 100 sample bookmarks (DEV)** button sits in the toolbar
row next to **Import file…** and **Export…**. It is only rendered
when the build was produced with `import.meta.env.DEV === true` —
which is every `pnpm dev` build and every unpacked local build made
for reviewer or contributor use. Production zips shipped to the CWS
never render the button (Vite tree-shakes the branch, and the
`loadSampleBookmarks` module drops out of the chunk).

Click the button once. The status line to the right of the toolbar
reports:

```
sample loaded: 100 new, 9 merged (dedup collapsed 9 of 109)
```

Interpretation:

- **109 attempted** URLs — 100 unique canonical URLs plus 9
  tracking-param variants added deliberately on three domains.
- **100 created** rows in IndexedDB — the deduped set.
- **9 merged** — proof that the canonicaliser collapsed the
  tracking-param variants onto their base URLs, as documented in
  [`URL_NORMALIZATION.md`](URL_NORMALIZATION.md).

Running the button again is safe. Every attempt on the second run
merges onto the existing row, so the DB stays at 100 rows.

## 4. Corpus shape

The 100 canonical bookmarks span ten domains, each carrying ten
entries so the tag sidebar, the folder-tag view, and the search
index all see a realistic distribution:

| Domain                    | Count | Tags                     | Notes                                    |
| ------------------------- | ----- | ------------------------ | ---------------------------------------- |
| `www.youtube.com`         | 10    | `video`                  | Three tracking-param dupes (utm_*, fbclid) |
| `x.com`                   | 10    | `social`                 | Three tracking-param dupes (twitter.com + `?s=`, utm_source) |
| `medium.com`              | 10    | `article`                | Three tracking-param dupes (source, utm_source, gi) |
| `en.wikipedia.org`        | 10    | `reference`, `article`   |                                          |
| `developer.mozilla.org`   | 10    | `reference`              |                                          |
| `github.com`              | 10    | `code`                   | First entry carries a rating so the rating filter has a hit |
| `stackoverflow.com`       | 10    | `code`, `reference`      |                                          |
| `arxiv.org`               | 10    | `paper`                  |                                          |
| `news.ycombinator.com`    | 10    | `news`                   |                                          |
| `docs.rs`                 | 10    | `code`, `reference`      |                                          |

No personal names, addresses, e-mails, session tokens, or bookmark
data from any real user appear in the sample. The canonical source is
[`src/core/dev/sampleBookmarks.ts`](../src/core/dev/sampleBookmarks.ts);
the shape invariants are enforced by
[`src/core/dev/sampleBookmarks.test.ts`](../src/core/dev/sampleBookmarks.test.ts).

## 5. Things worth checking

With the sample loaded, every documented surface has enough data to
be exercised end-to-end:

- **Search.** Type `tag:video` — 10 rows. Type `domain:medium.com` —
  10 rows. Type `is:unread` — 100 rows. The filter grammar is
  described in [`ARCHITECTURE.md`](ARCHITECTURE.md).
- **Dedup.** Open `www.youtube.com` in the folder / tag sidebar and
  confirm the count is 10, not 13. The three attempted duplicates
  are visible as `merged` in the status line but do not appear as
  separate rows.
- **Bulk actions.** Press `x` to toggle bulk-select on one row,
  Shift-click to extend, then use the toolbar to apply a tag or
  change read status. Documented in [`ARCHITECTURE.md`](ARCHITECTURE.md).
- **Import / Export.** Click **Export…** → **JSON (round-trippable)**
  to download the sample as JSON. Delete the sample rows and
  re-import the file — counts return to 100.
- **Side panel.** `Ctrl+Shift+B` / `MacCtrl+Shift+B` opens the side
  panel; every sample bookmark is visible with the same tags.
- **Dead-link checker.** Optional. Documented in
  [`DEAD_LINK_CHECKER.md`](DEAD_LINK_CHECKER.md). Runs HTTP HEAD
  against each bookmark's own host; no third-party services.

## 6. Tear down

To reset the DB after review:

1. Open the overview.
2. Bulk-select all rows (`Ctrl+A` in the list) and delete, or
3. Open `chrome://extensions/`, find Better Bookmarks, click
   **Details** → **Extension options** → **Reset all local data**.

Uninstalling the extension via `chrome://extensions/` also wipes
IndexedDB.

## 7. Why the button is dev-only

The sample loader is scoped to development for three reasons:

1. **Reviewers and contributors need a repeatable seed.** Fabricated
   sample data lets anyone reproduce a bug report or a screenshot
   without exchanging real bookmark exports.
2. **End users must never see it.** A shipping build with a
   sample-load button in the UI would be misleading — real users
   already have their own data.
3. **Zero cost in production.** `import.meta.env.DEV` is a static
   compile-time constant. Vite tree-shakes both the button and the
   `loadSampleBookmarks` module out of the production bundle;
   nothing about the sample corpus ships in the CWS zip.

## 8. Related references

- [`PERMISSIONS.md`](PERMISSIONS.md) — every manifest permission and
  its actual API surface.
- [`PRIVACY.md`](PRIVACY.md) — every network egress path.
- [`URL_NORMALIZATION.md`](URL_NORMALIZATION.md) — the canonicalisation
  rules the dedup demo exercises.
- [`DATA_MODEL.md`](DATA_MODEL.md) — IndexedDB schema.
