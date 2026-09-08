# Open Decisions

A living register of design decisions that are open or have only a
provisional answer. New decisions go to the bottom; resolved
decisions stay (so we remember *why*).

Format per decision: status, context, the choices on the table with
pros/cons, the current recommendation, and links to whichever docs
will need updating when it lands.

Statuses:

- **OPEN** — needs a call before the relevant phase lands.
- **PROVISIONAL** — picked a default, willing to revisit.
- **DECIDED** — locked, change requires a new decision row below.

---

## D1. IndexedDB library: Dexie vs. hand-rolled — **DECIDED: Dexie**

Storage layer for [DATA_MODEL.md](DATA_MODEL.md), feeds
[ARCHITECTURE.md](ARCHITECTURE.md). Cannot start P1 storage code
until this lands.

**Choice A — Dexie**
- Pros: declarative schema + migrations, multi-index support
  including `multiEntry` (we need that for `tags`), hooks for
  change events (good for the bookmark service event bus), great
  TS types, mature, ~22 KB min+gz.
- Cons: 22 KB bundle cost, occasional surprises with compound
  keys and Safari (irrelevant — Chrome only), one more dep.

**Choice B — Hand-rolled wrapper over IndexedDB**
- Pros: zero deps, full control over transaction shape, smaller
  bundle, easier to inline into the service worker.
- Cons: hours sunk into reimplementing migrations, blocked-upgrade
  handling, transaction auto-commit gotchas, version-change events.
  Every operation gains 5–10 lines of boilerplate.

**Recommendation: Dexie.** The 22 KB is irrelevant for an
extension that's loaded once per browser session. The dev-time and
bug-surface saving is worth it.

---

## D2. Conflict policy default — **DECIDED: prefer-newer**

Read by sync service. See [CHROME_SYNC.md](CHROME_SYNC.md) and
[DATA_MODEL.md](DATA_MODEL.md#settings-chromestoragelocal).

**Options considered**: `prefer-chrome` | `prefer-store` |
`prefer-newer` | `ask`.

- `prefer-chrome` — Chrome wins for URL/title. Quietest default.
  Risk: user edits the title in our overview, then later renames
  in Chrome — Chrome's edit overwrites ours silently.
- `prefer-store` — store wins. Bad: any edit in the Chrome bar
  gets silently reverted. Surprising.
- `prefer-newer` — timestamp wins. **Chosen.** Chrome doesn't
  give a reliable `lastModified`, so we stamp
  `ChromeMapping.lastKnownEventAt` whenever a Chrome event fires
  for that bookmark and compare against our `Bookmark.updatedAt`.
- `ask` — prompt the user. Annoying for the 99% case.

**Implementation note for P2**: `ChromeMapping` schema needs
`lastKnownEventAt: number`. Set on every onCreated/onChanged/onMoved
event. Compare against `Bookmark.updatedAt` to decide which side
wins per field. Update [CHROME_SYNC.md](CHROME_SYNC.md) and
[DATA_MODEL.md](DATA_MODEL.md) when P2 lands.

---

## D3. Folder-mirror default policy — **DECIDED: off**

Setting `folderMirrorPolicy`, read by sync service. See
[ARCHITECTURE.md](ARCHITECTURE.md#sync-event-driven-with-a-mapping-table)
and [CHROME_SYNC.md](CHROME_SYNC.md#tag-mirror-toggled-on).

**Options**: `off` | `selected` | `all`.

- `off` — tag → folder mirroring requires opt-in per tag. Chrome
  tree stays exactly as the user has it. Most conservative.
- `selected` — same as `off` mechanically, just a UI hint. Drop
  this option, it's not a real third state.
- `all` — every tag auto-mirrors to a folder. Chrome bookmarks
  bar fills with 100+ folders. Will surprise the user once they
  see what their existing tag soup actually looks like.

**Recommendation: `off`.** Power users flip individual tags on.
Drop `selected` as a redundant value — the real switch is per-tag.

---

## D4. ULID library — **DECIDED: `ulid` npm package**

`Bookmark.id` and `Edge.id` are ULIDs. ~120 LOC to roll our own.

**Choice A — `ulid` package on npm**: tiny (1–2 KB), zero deps,
TS types. Battle-tested.

**Choice B — inline implementation**: zero deps. Maintenance
forever, no benefit.

**Recommendation: `ulid` package.**

---

## D5. Migration release: keep legacy `chrome.storage.local` how
long? — **DECIDED**

**Resolution:** keep for one release; auto-delete on next startup if
the new store contains at least the same record count as the legacy
store.

After [ROADMAP.md](ROADMAP.md) phase 1 lands, the old key/value
store is dead but the data is still in `chrome.storage.local`.

- Delete immediately after migration: less code, irreversible if
  the migration corrupted something we didn't notice.
- Keep one release: cheap safety net, ~10 MB of data sitting idle.
- Keep forever: hoarding.

**Recommendation: keep for one release**, then auto-delete on
the second-version startup if the new store contains at least the
same record count as the legacy store.

---

## D6. Drift reconciliation cadence — **DECIDED**

**Resolution:** hybrid — reconcile on cold start of the service
worker AND on UI open (popup, overview). No 6h alarm.

[CHROME_SYNC.md](CHROME_SYNC.md#drift-recovery) currently says
"on startup and every 6 hours". On reflection: service workers
already wake on every browser event. A periodic alarm is mostly
redundant.

- 6 h alarm: catches the case where the worker is alive but no
  bookmark events have fired in a long time. Wasted work most of
  the time.
- Wake-driven only: rely on `chrome.alarms` + bookmark events to
  trigger reconciliation when state may have drifted.
- Hybrid: reconcile on every cold start of the service worker
  (cheap, deduped) and on user-visible UI open (popup, overview).

**Recommendation: hybrid.** Update [CHROME_SYNC.md](CHROME_SYNC.md)
when this lands.

---

## D7. Omnibox keyword `bb` — **DECIDED, P3**

**Resolution:** ship in Phase 3 alongside search.

Add a `chrome_url_overrides` / omnibox keyword so the user can
type `bb <query>` in the address bar and see results.

- Pros: massive UX win for power users, ~30 LOC plus manifest
  entry.
- Cons: occupies the `bb` keyword globally; collisions with
  any other extension's pick.

**Recommendation: ship in P3 alongside search.**

---

## D8. Arxiv `/abs/` vs. `/pdf/` collapse — **DECIDED**

**Resolution:** collapse `/pdf/` URLs to `/abs/` in the canonicaliser.

A real dedup question from the bookmark corpus.

- Collapse to `/abs/`: same paper, both routes resolve to the same
  thing. Removes a class of duplicates.
- Keep separate: a few users actually do bookmark the PDF for
  downloading later. Edge case.

**Recommendation: collapse to `/abs/`.** PDF is render format,
abs is identity.

---

## D9. Wikipedia section fragments — **DECIDED**

**Resolution:** strip fragments by default; expose a per-domain
"keep fragments" toggle in options.

[URL_NORMALIZATION.md](URL_NORMALIZATION.md#wikipedia-wikipediaorg)
strips fragments by default. Some users want per-section bookmarks.

**Recommendation: strip default, expose a per-domain "keep
fragments" toggle in options.**

---

## D10. Locale path stripping (`/en/`, `/de/`) — **DECIDED**

**Resolution:** per-domain only, off by default.

Many docs sites mount language under a path prefix.

- Strip globally: aggressive dedup. Risk: different languages of
  the same page have different content and Stack Overflow answers.
- Strip per-domain: safer, scales with rules.

**Recommendation: per-domain, off by default.**

---

## D11. HN fragment canonicalization — **DECIDED**

**Resolution:** strip fragments on `news.ycombinator.com`.

`news.ycombinator.com` uses fragments for navigation and (rarely)
for permalinks. Permalinks come as `?id=...` in practice, not as
fragments.

**Recommendation: strip fragments on HN.**

---

## D12. `www.` host stripping — **PROVISIONAL**

A handful of sites serve different content at the apex vs.
`www.`.

**Recommendation: per-domain only.** Default leaves it alone.
Add `www.` → apex in per-domain strategies where the site
explicitly redirects.

---

## D13. Auto-suggested edge thresholds — **DECIDED, P4**

**Resolution:** `(sharedTag >= 1 AND sharedDomain) OR
(sharedTag >= 2)`, with a numeric strength score exposed to the UI.

When to surface a suggested edge?

- shared domain only: noisy. Every github.com link "connects" to
  every other.
- shared tag ≥ 1: noisy.
- shared tag ≥ 2: tight, may miss some.
- (shared tag ≥ 1) AND (shared domain) OR (shared tag ≥ 2):
  balanced.

**Recommendation: the OR combo, with a numeric "strength" score
exposed so the UI can sort.**

---

## D14. React 17 → 19 upgrade — **DEFERRED, P7**

`ReactDOM.render` is removed in React 18+. Both `popup.tsx` and
`overview.tsx` use it. Migration cost: one line per entrypoint
(`createRoot`). MUI 5 supports React 17–19; no need to bump MUI.

**Recommendation: do it in P7.** Doesn't gate anything earlier.

---

## D15. Page snapshots — **DEFERRED, P6+**

Snapshotting the visited HTML for offline full-text search.

- Pros: search hits page content, not just metadata. Genuinely
  useful for "where did I read X".
- Cons: storage cost (50 KB – 5 MB per page; at 20k bookmarks
  this is GBs), legal/privacy nuance, sync complexity.

**Recommendation: deferred. Revisit after P5.** When we do, it's
opt-in per bookmark and uses the offscreen-document API to fetch.

---

## D16. Bundle layout: single vs. split worker — **DEFERRED, P7**

Current webpack config produces one bundle for everything.

- Single: simplest, what we have, fine for now.
- Split worker: tighter service-worker bundle, faster cold start.
  More webpack config to maintain.

**Recommendation: stay single until cold start measurably hurts.**

---

## D17. Test runner — **DECIDED: Vitest**

`package.json` has `ts-jest` as a devDep but no `test` script and
no jest config.

- Jest: matches the existing dep, established.
- Vitest: faster, ESM-native, our toolchain doesn't depend on
  Jest specifically.
- Bun test: matches the node ≥ 24 engine bump, fastest, but adds
  Bun as a dependency.

**Recommendation: Vitest.** Modern, fast, no friction with TS.
The dangling `ts-jest` dep gets removed in the same change.

---

## D18. Tag case-sensitivity — **DECIDED: case-insensitive match, display-case preserved**

Today: free strings on the bookmark record.

- Case-sensitive PK on `Tag.name`: "AI" and "ai" are different.
  Annoying.
- Case-insensitive lookup, display-case preserved: "AI" stored,
  user types "ai" and it matches. Matches user expectation.

**Recommendation: case-insensitive match, display-case preserved.**
Implementation: secondary index on `lowercaseName`.
