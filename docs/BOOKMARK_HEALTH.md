# Bookmark Health

Two scanners under one page. The first looks for stub records and
audit anomalies (missing title, missing tags, casing collisions). The
second looks for soft duplicates that canonicalization didn't already
collapse. Both surface findings as suggestions. The user accepts or
dismisses each one. Nothing auto-applies.

## Why this matters

A 20k-bookmark corpus accumulates rot. The canonical URL key already
catches exact dedup at write time (see [URL_NORMALIZATION.md](URL_NORMALIZATION.md))
and `&canonicalUrl` is enforced unique in the Dexie schema. Everything
else — bookmarks with no title, tag casing drift, two URLs that
*should* have collapsed but didn't — needs a sweep.

The sweep is on-demand. We do not run it automatically. The user
opens the Health page when they want to clean house.

## Scope

In:

- Rules-based stub/anomaly audit. Deterministic, offline.
- Soft-duplicate scan. Deterministic, offline.
- Side-by-side review with explicit per-row accept/dismiss.
- 30s undo on any destructive action.

Out (deferred — see "Things we deliberately do NOT do"):

- LLM-based duplicate detection.
- Network broken-link checking by default. Opt-in toggle only.
- Auto-merge or auto-fix. Never.
- Background scheduling. The page scans when the user asks.

## File layout

```
src/core/health/
  index.ts              # public API: runHealthScan, applyFinding, dismissFinding
  types.ts              # HealthFinding, HealthSeverity, ScanResult, ScannerRegistry
  registry.ts           # scanner registration table
  scanners/
    stub.ts             # stub/anomaly scanners (one exported fn per rule)
    softDuplicate.ts    # soft-duplicate scanners (one exported fn per rule)
    brokenLink.ts       # opt-in HEAD-request scanner
  undo.ts               # 30s undo buffer (mapping-table snapshot + bookmark snapshot)
  apply.ts              # action handlers: fixTitle, addTag, mergeBookmarks, etc.
  fixtures.ts           # test fixtures (TS module, mirrors canonicalizer/fixtures.ts)
  health.test.ts        # scanner unit tests
  apply.test.ts         # apply+undo round-trip tests

src/entrypoints/health/
  index.html
  main.tsx
  Health.tsx

src/components/health/
  FindingCard.tsx       # one finding in the list
  FindingReviewSheet.tsx # side-by-side review surface (for soft-dup merge)
  ScannerToggleRow.tsx  # per-scanner enable + last-run timestamp
  UndoToast.tsx         # 30s countdown toast
```

Edited:

- `src/entrypoints/overview/Overview.tsx` — add a `HeartPulse` icon
  button in the header toolbar next to the settings icon. New
  `openHealth = () => chrome.tabs.create({ url: chrome.runtime.getURL("health.html") })`.
- `src/shared/types.ts` — extend `Settings` with health-related
  preferences (see Settings section below).
- `src/core/storage/settings.ts` — defaults for the new settings keys.
- `docs/ROADMAP.md` — flip Health from planned to landed.

WXT auto-generates `health.html` from the entrypoint dir. No
`wxt.config.ts` changes.

## Types

```ts
export type HealthSeverity = "info" | "warn" | "error";

export type HealthFindingKind =
  | "stub-empty-title"
  | "stub-generic-title"
  | "stub-no-tags"
  | "stub-orphan-no-tag-no-folder"
  | "anomaly-tag-casing-collision"
  | "anomaly-folder-tag-mismatch"
  | "anomaly-broken-link"
  | "dup-shared-canonical"
  | "dup-fuzzy-query"
  | "dup-youtube-video-id"
  | "dup-title-similarity"
  | "dup-arxiv-abs-pdf";

export type HealthFinding = {
  id: string;                // ULID. Stable per (scannerId, fingerprint).
  kind: HealthFindingKind;
  scannerId: string;         // e.g. "stub.empty-title"
  severity: HealthSeverity;
  message: string;           // human-readable
  bookmarkIds: string[];     // 1 for stubs, 2+ for soft-dups
  primaryBookmarkId: string; // for sorting/grouping; survivor candidate in dup case
  details: Record<string, unknown>; // scanner-specific payload (e.g. matched tag pair)
  suggestedAction: HealthAction | null;
  dismissedAt: number | null; // epoch ms; null = active
  createdAt: number;
};

export type HealthAction =
  | { type: "set-title"; bookmarkId: string; newTitle: string }
  | { type: "add-tag"; bookmarkId: string; tag: string }
  | { type: "rename-tag"; from: string; to: string }
  | { type: "merge-bookmarks"; survivorId: string; loserIds: string[] }
  | { type: "delete-bookmark"; bookmarkId: string };

export type ScanResult = {
  startedAt: number;
  finishedAt: number;
  totalScanned: number;
  findings: HealthFinding[];
  scannerStats: Record<string, { count: number; durationMs: number }>;
};

export type Scanner = {
  id: string;                   // "stub.empty-title", "soft-dup.youtube-video-id", ...
  label: string;                // displayed in the scanner toggle list
  kind: HealthFindingKind;
  defaultSeverity: HealthSeverity;
  enabledByDefault: boolean;
  appliesTo: (bm: Bookmark) => boolean; // pre-filter
  scan: (bookmarks: Bookmark[], ctx: ScanContext) => HealthFinding[];
};

export type ScanContext = {
  now: number;
  settings: Settings;
  // Pre-computed indexes scanners can share:
  byCanonicalUrl: Map<string, Bookmark[]>;
  byDomain: Map<string, Bookmark[]>;
  byLowercasedTag: Map<string, string[]>; // lowercase tag -> original casings
};

export type ScannerRegistry = {
  scanners: Scanner[];
  byId: Map<string, Scanner>;
};
```

`HealthFinding` is not persisted. We recompute on every scan. The
findings list lives in React state on the Health page. Dismissals,
however, ARE persisted (see "Persisted dismissals" below).

## Scanner rules

Each scanner has a stable `id` (used in dismissal storage and the
fixture file). `appliesTo` is a cheap pre-filter; `scan` does the
real work over the filtered set.

### Stub / anomaly scanners

| id | label | severity | appliesTo |
|----|-------|----------|-----------|
| `stub.empty-title` | Empty title | warn | `bm.title.trim() === ""` |
| `stub.generic-title` | Generic title (host-only / "Untitled") | info | matches `GENERIC_TITLE_PATTERNS` |
| `stub.no-tags` | No tags | info | `bm.tags.length === 0` |
| `stub.orphan-no-tag-no-folder` | Orphan: no tag and not in any Chrome folder | warn | `bm.tags.length === 0 && hasOnlyRootMapping(bm)` |
| `anomaly.tag-casing-collision` | Tag casing collision across corpus | warn | scans the tag corpus, not per-bookmark |
| `anomaly.folder-tag-mismatch` | Folder location differs from primary tag | info | requires `tag.mirrorFolderId` set on the bookmark's primary tag |
| `anomaly.broken-link` | HTTP HEAD says 4xx/5xx | warn | opt-in only; gated on `settings.healthBrokenLinkCheckEnabled` |

Constants:

```ts
const GENERIC_TITLE_PATTERNS: RegExp[] = [
  /^untitled$/i,
  /^\(no title\)$/i,
  /^no title$/i,
  /^[a-z0-9.-]+\.[a-z]{2,}$/i, // exact host: "example.com"
];
```

Notes:

- `stub.orphan-no-tag-no-folder` reuses `chromeMappings`: a bookmark
  is "orphan" when no mapping row exists OR every mapping row's
  `parentChromeId` resolves to a Chrome root folder (id `"0"`, `"1"`,
  `"2"`). The scanner queries `getMappingsByBookmarkId(bm.id)` once
  per bookmark in the filtered set.
- `anomaly.tag-casing-collision` runs at the tag level. It groups all
  tag names by lowercased form; any group with size > 1 produces one
  finding listing every bookmark using any of the collided casings.
  Suggested action: `rename-tag` from the minority casing(s) to the
  majority.
- `anomaly.folder-tag-mismatch` is a heuristic. For each bookmark
  with at least one tag carrying a `mirrorFolderId`, if NO Chrome
  mapping for that bookmark lives under that folder id, surface a
  finding. Severity `info` because users intentionally violate
  folder-tag pairing all the time. Suggested action is `null` — we
  describe the mismatch and the user decides.
- `anomaly.broken-link` is opt-in. Default off. If enabled, the
  scanner runs HEAD requests with `mode: "no-cors"` and a 5s
  per-request timeout. Findings list the status code (or
  `"network-error"`). The result is also written to
  `bm.linkCheck` (existing field, see DATA_MODEL.md note) so the
  existing dead-link sweep machinery in
  `src/core/maintenance/deadLinkChecker.ts` is the source of truth —
  the Health scanner ONLY reads `bm.linkCheck`, never makes its own
  HEAD requests. Pressing "Scan broken links" from the Health page is
  a UI shortcut that calls the existing `runDeadLinkSweep` and then
  re-runs the local scan.

### Soft-duplicate scanners

| id | label | severity | appliesTo |
|----|-------|----------|-----------|
| `soft-dup.shared-canonical` | Multiple records with the same canonicalUrl | error | corpus-level — should be impossible, surfaces bugs |
| `soft-dup.fuzzy-query` | Same host + path, different query | info | per (host, path) bucket with size > 1 |
| `soft-dup.youtube-video-id` | Same YouTube video, different `t=` legacy | info | `bm.domain === "www.youtube.com"` and path matches `/^/watch$/` |
| `soft-dup.title-similarity` | Title similarity ≥ 0.9, same eTLD+1 | info | per eTLD+1 bucket with size > 1 |
| `soft-dup.arxiv-abs-pdf` | arxiv abs/pdf pair not collapsed | warn | `bm.domain.endsWith("arxiv.org")` |

Notes:

- `soft-dup.shared-canonical` is a sanity check against the unique
  index. If it ever fires, it means the index was bypassed (manual DB
  edit, failed migration). Severity `error`. Suggested action:
  `merge-bookmarks`.
- `soft-dup.fuzzy-query` groups bookmarks by `${host}${path}` ignoring
  query and fragment. Bucket size ≥ 2 emits one finding per bucket
  with all bookmark ids in the bucket. The survivor candidate is the
  oldest `createdAt`.
- `soft-dup.youtube-video-id` parses `?v=<id>` from each
  watch-page bookmark and groups by `<id>`. Pairs left over from
  pre-canonicalizer eras (a bookmark whose `originalUrl` had `&t=`
  but whose `canonicalUrl` somehow still differs from a sibling) end
  up here.
- `soft-dup.title-similarity` uses normalized Damerau-Levenshtein
  similarity (1 - distance / max(lenA, lenB)). Title is lowercased,
  trimmed, punctuation collapsed before compare. Comparison is
  pairwise within an eTLD+1 bucket, capped at 200 bookmarks per
  bucket (we skip larger buckets with a `info` finding and log a
  warning — for a 20k corpus this only triggers on `medium.com` and
  similar long-tail).
- `soft-dup.arxiv-abs-pdf` is a safety net. The canonicalizer
  already collapses `/pdf/<id>` to `/abs/<id>`. This scanner exists
  to flag any survivor that slipped through (e.g. a legacy import
  with a different host or a custom user override that disabled the
  arxiv strategy).

eTLD+1 extraction uses a static suffix list bundled with the
extension (we already have `tldts` as a transitive dep through Chrome
sync utilities; otherwise add it). We do not fetch the PSL at
runtime.

## Suggested actions

Each finding maps to at most one `HealthAction`. The mapping is
fixed:

| Finding kind | Action |
|--------------|--------|
| `stub-empty-title` | none (user must type) |
| `stub-generic-title` | none (user must type) |
| `stub-no-tags` | none (open BookmarkDetail to add a tag) |
| `stub-orphan-no-tag-no-folder` | none (compound; user decides) |
| `anomaly-tag-casing-collision` | `rename-tag` (minority → majority casing) |
| `anomaly-folder-tag-mismatch` | none |
| `anomaly-broken-link` | `delete-bookmark` (offered, not auto) |
| `dup-shared-canonical` | `merge-bookmarks` |
| `dup-fuzzy-query` | `merge-bookmarks` |
| `dup-youtube-video-id` | `merge-bookmarks` |
| `dup-title-similarity` | `merge-bookmarks` |
| `dup-arxiv-abs-pdf` | `merge-bookmarks` |

Findings with no suggested action still render — the user can use
the "Open in editor" affordance on the card to jump to BookmarkDetail
in the overview page (`overview.html#edit=<id>`).

## Merge semantics

The survivor inherits the union. From `mergeBookmarks(survivorId, loserIds)`:

- `tags`: set union, sorted.
- `note`: concatenation in id order, separated by `\n\n---\n\n`. We
  do not deduplicate text — humans wrote it.
- `description`: longest non-empty wins.
- `title`: survivor's title unless empty, in which case longest
  non-empty among losers.
- `rating`: max of all non-null ratings.
- `necessaryTime`: max of all non-null values.
- `status`: most-progressed wins (`archived` > `read` > `reading` >
  `unread`).
- `readAt`: earliest non-null.
- `createdAt`: earliest.
- `updatedAt`: `now`.
- `capturedFrom`: survivor's value (we don't fold capture sources).
- `linkCheck`, `enrichedAt`: survivor's value.

Then `loserIds` are deleted via `deleteBookmark(id)`. The delete
fires the Dexie `deleting` hook which (when `syncEnabled` is true)
pushes a Chrome `bookmarks.remove` for each Chrome mapping row of the
loser. See [CHROME_SYNC.md](CHROME_SYNC.md) for the full path.

## Chrome sync gating

Chrome sync IS implemented (bidirectional, see CHROME_SYNC.md). For
merge operations:

- If `settings.syncEnabled === true`: the merge proceeds, Chrome
  mappings of the losers get pushed as `chrome.bookmarks.remove`. The
  review sheet shows the exact Chrome bookmark node ids and the
  resolved folder paths that will be deleted. The user sees the list
  before confirming.
- If `settings.syncEnabled === false`: the merge proceeds locally
  only. The review sheet surfaces a yellow banner: "Sync is off.
  Losing bookmarks will remain in Chrome — clean those up
  separately." The user explicitly acknowledges the banner before the
  delete button enables.

We refuse to silently skip the Chrome side. Either we push and tell
the user, or we don't push and tell the user. No middle ground.

## UI flow

### Nav entry

A new `HeartPulse` icon button in the Overview header toolbar,
positioned after the existing settings icon
(`src/entrypoints/overview/Overview.tsx` around line 557). Clicking
runs `chrome.tabs.create({ url: chrome.runtime.getURL("health.html") })`.
The icon is `aria-label="health"`.

We do NOT add Health to the SidePanel header — the page is too dense
for a narrow column.

### Page layout

`src/entrypoints/health/Health.tsx`. Mirrors the Options page shell:

```
<div className="mx-auto max-w-[960px] p-4 sm:p-8">
  <header>
    <h1>Bookmark Health</h1>
    <p>One-shot scan over your library. Suggestions only — accept each one explicitly.</p>
  </header>

  <Section title="Scanners">
    <ScannerToggleRow … />  // one per scanner; default-enabled per registry
    <Button onClick={runScan}>Run scan</Button>
    <div>Last run: {scanResult?.finishedAt ?? "never"} · {scanResult?.totalScanned ?? 0} bookmarks scanned</div>
  </Section>

  <Section title="Findings ({active.length})">
    <Tabs>
      <Tab id="stubs">Stubs & anomalies ({stubCount})</Tab>
      <Tab id="duplicates">Soft duplicates ({dupCount})</Tab>
      <Tab id="dismissed">Dismissed ({dismissedCount})</Tab>
    </Tabs>
    <FindingList findings={visibleFindings} />
  </Section>
</div>
```

`Section` is the same inline helper component used in `Options.tsx`.

### FindingCard

Compact row, one per finding. Layout:

```
[severity dot] [kind label]        [open] [dismiss]
[primary action button, if any]
[2-line preview of bookmark(s)]
```

Click anywhere on the card body opens the review sheet for that
finding. The card itself does NOT mutate state — every action goes
through the sheet.

### Review sheet (soft-dup merge)

Slide-in `Sheet` from the right. Contents:

```
<SheetContent>
  <SheetTitle className="sr-only">Review duplicate</SheetTitle>
  <SheetDescription className="sr-only">…</SheetDescription>
  <header>Soft duplicate: {finding.kind}</header>

  <div className="grid grid-cols-2 gap-4">
    {bookmarks.map(bm => <BookmarkSummaryCard bm={bm} selected={bm.id === survivorId} onSelectSurvivor={…} />)}
  </div>

  <Section title="What will happen if you merge">
    <ul>
      <li>Survivor: {survivor.title} ({survivor.canonicalUrl})</li>
      <li>Tags after merge: {unionTags.join(", ")}</li>
      <li>Notes after merge: {n} lines</li>
      <li>Bookmarks deleted: {loserCount}</li>
      <li>Chrome nodes deleted: {chromeNodeList.map(n => `${n.id} (${n.folderPath})`).join(", ")}</li>
    </ul>
    {!settings.syncEnabled && <SyncOffBanner onAcknowledge={…} />}
  </Section>

  <footer>
    <Button variant="ghost" onClick={dismiss}>Dismiss</Button>
    <Button variant="default" onClick={confirmMerge} disabled={!ready}>Merge</Button>
  </footer>
</SheetContent>
```

The user can change the survivor by clicking either card. Default
survivor is `finding.primaryBookmarkId` (the oldest `createdAt`).

Stub-audit findings use a simpler sheet (no side-by-side):

- For `stub-empty-title` / `stub-generic-title`: an inline input
  prefilled with a suggested title (host, or "Untitled" stripped to
  empty so the user types fresh).
- For `stub-no-tags`: jumps to BookmarkDetail in overview.html via
  `chrome.tabs.create({ url: chrome.runtime.getURL("overview.html#edit=" + bm.id) })`.
- For `anomaly-tag-casing-collision`: a list of bookmarks that will
  be retagged, with the "from → to" rename clearly stated.

### Bulk accept

A "Accept all reviewed" button appears at the top of each tab. It is
disabled until every active finding in the tab has been opened in
the review sheet at least once (we track `openedAt` per finding in
React state for the lifetime of the page). The button confirms via a
`Dialog` showing the count and waits 3 seconds before the
confirmation button enables. We do not allow bulk-accept of findings
the user has not individually inspected.

### Undo

Every destructive action (merge, tag-rename, delete) records a
snapshot before mutating:

```ts
type UndoSnapshot = {
  id: string;
  createdAt: number;       // epoch ms
  expiresAt: number;       // createdAt + 30_000
  label: string;           // "Merge of 3 bookmarks", "Rename tag React → react"
  bookmarks: Bookmark[];   // full pre-mutation state of every affected bookmark
  chromeMappings: ChromeMapping[]; // every mapping row that will change/disappear
  tagDeltas: Array<{ name: string; before: Tag | null; after: Tag | null }>;
};
```

The snapshot is held in memory only — we do NOT persist undo across
page reloads. On Toaster, a 30s countdown bar; clicking "Undo"
replays the snapshot:

1. `db.bookmarks.bulkPut(snapshot.bookmarks)` (recreates losers,
   reverts survivor).
2. `db.chromeMappings.bulkPut(snapshot.chromeMappings)` (mapping
   rows the deletion path tore down).
3. Tag deltas applied in reverse.
4. The Chrome side is NOT re-pushed — if sync deleted Chrome nodes,
   undo cannot resurrect them. The undo toast says "Local restore
   only — Chrome bookmarks were already removed and cannot be
   re-created from here." This is a known one-way door; we surface it
   in the merge confirmation copy so the user makes an informed call
   before clicking.

After 30s the snapshot is dropped and the toast disappears.

## Data flow

Single scan:

1. User clicks "Run scan".
2. `runHealthScan(scanContext)` in `src/core/health/index.ts`:
   - `listBookmarks()` → full corpus.
   - Build shared indexes (`byCanonicalUrl`, `byDomain`,
     `byLowercasedTag`).
   - Iterate the registered scanners. Each scanner that's enabled in
     settings runs its `appliesTo` filter then `scan`. Output is a
     `HealthFinding[]`.
   - Filter out findings whose `(scannerId, fingerprint)` pair is in
     `Settings.healthDismissedFindings`.
   - Return `ScanResult` with stats.
3. React state holds the result. UI renders findings grouped by tab.

Single action:

1. User clicks "Merge" (or "Apply" on a stub finding).
2. `applyFinding(finding, action)` in `src/core/health/apply.ts`:
   - Snapshot every affected bookmark and mapping row into an
     `UndoSnapshot`.
   - Run the corresponding store mutation (`upsertBookmark`,
     `updateBookmark`, `deleteBookmark`, `renameTag`). These already
     dispatch to the Chrome sync layer through the existing Dexie
     hooks; no special-casing here.
   - Push the snapshot onto the in-memory undo stack and schedule the
     30s expiry.
3. Re-run the scan in the background (cheap, all-in-memory). The
   findings list updates in place; the dismissed finding either
   disappears or moves to the dismissed tab.

Dismiss (non-destructive):

1. User clicks "Dismiss" on a finding card.
2. `dismissFinding(finding)` writes
   `(scannerId, fingerprint)` into
   `Settings.healthDismissedFindings`. The fingerprint is a stable
   hash of `bookmarkIds.sort().join("|")` so the same finding doesn't
   reappear next scan.
3. Re-running the scan filters out dismissed entries by default.

## Settings additions

`src/shared/types.ts` adds to `Settings`:

```ts
healthEnabledScanners: Record<string, boolean>; // scanner id -> on/off
healthBrokenLinkCheckEnabled: boolean;          // default false
healthDismissedFindings: Array<{
  scannerId: string;
  fingerprint: string;       // hash of bookmarkIds
  dismissedAt: number;
}>;
```

Defaults in `src/core/storage/settings.ts`:

- Every shipped scanner enabled by default EXCEPT
  `anomaly.broken-link`.
- `healthBrokenLinkCheckEnabled = false`.
- `healthDismissedFindings = []`.

We deliberately do NOT mirror these to `chrome.storage.sync` —
dismissals are device-specific (the user might have already cleaned
up the corpus on another machine and we don't want to resurrect
findings there).

## Scanner registry

`src/core/health/registry.ts` is a single exported `ScannerRegistry`
built at module load:

```ts
export const SCANNER_REGISTRY: ScannerRegistry = buildRegistry([
  STUB_EMPTY_TITLE,
  STUB_GENERIC_TITLE,
  STUB_NO_TAGS,
  STUB_ORPHAN,
  ANOMALY_TAG_CASING,
  ANOMALY_FOLDER_TAG_MISMATCH,
  ANOMALY_BROKEN_LINK,
  SOFT_DUP_SHARED_CANONICAL,
  SOFT_DUP_FUZZY_QUERY,
  SOFT_DUP_YOUTUBE,
  SOFT_DUP_TITLE_SIM,
  SOFT_DUP_ARXIV,
]);
```

Each entry is a top-level `const SOMETHING: Scanner = { id, label, … }`
imported from `scanners/stub.ts` or `scanners/softDuplicate.ts`. No
plugin/dynamic-registration pattern — adding a scanner is: write the
file, add the import, add it to the array. Matches the
`DOMAIN_STRATEGIES` shape in the canonicalizer.

## Test plan

Mirrors the canonicalizer's fixture-first pattern.

`src/core/health/fixtures.ts` exports:

```ts
export type HealthFixtureBookmark = Partial<Bookmark> & { id: string; canonicalUrl: string };

export type HealthScanFixture = {
  name: string;        // e.g. "stub.empty-title: blank title surfaces a warn"
  scannerId: string;
  corpus: HealthFixtureBookmark[];
  settings?: Partial<Settings>;
  expected: Array<{
    kind: HealthFindingKind;
    bookmarkIds: string[];
    severity: HealthSeverity;
  }>;
};

export const FIXTURES: HealthScanFixture[];
```

`src/core/health/health.test.ts` iterates the fixtures using a `for`
loop (vitest globals are off — explicit `import { describe, it, expect } from "vitest"`):

```ts
for (const fixture of FIXTURES) {
  it(fixture.name, () => {
    const findings = runHealthScan(fixture.corpus, fixture.scannerId, fixture.settings);
    expect(findings.map(f => ({ kind: f.kind, bookmarkIds: f.bookmarkIds.sort(), severity: f.severity })))
      .toEqual(fixture.expected);
  });
}
```

Required fixtures (minimum, one per scanner rule, more for
soft-dup):

- `stub.empty-title: blank title surfaces a warn`
- `stub.empty-title: whitespace-only title surfaces a warn`
- `stub.generic-title: "Untitled" surfaces info`
- `stub.generic-title: bare host "example.com" surfaces info`
- `stub.generic-title: real title does not fire`
- `stub.no-tags: empty tags array surfaces info`
- `stub.no-tags: tagged bookmark does not fire`
- `stub.orphan-no-tag-no-folder: untagged + root-only mapping surfaces warn`
- `anomaly.tag-casing-collision: "React"/"react" coexist surfaces warn`
- `anomaly.tag-casing-collision: single-casing tag does not fire`
- `soft-dup.shared-canonical: two records same canonicalUrl surfaces error`
- `soft-dup.fuzzy-query: same path different query surfaces info`
- `soft-dup.fuzzy-query: same path same query does not fire (handled by unique index)`
- `soft-dup.youtube-video-id: two watch URLs same v= surfaces info`
- `soft-dup.title-similarity: Damerau-Levenshtein ≥ 0.9 same eTLD+1 surfaces info`
- `soft-dup.title-similarity: ≥ 0.9 different eTLD+1 does not fire`
- `soft-dup.arxiv-abs-pdf: abs+pdf survivors collapse surfaces warn`

`src/core/health/apply.test.ts` covers apply+undo round-trips
against a real Dexie store via `fake-indexeddb/auto` (matches the
existing test setup in `src/test/setup.ts`):

- Merge two bookmarks → survivor has union of tags / max rating.
- Merge two bookmarks → losers gone.
- Merge undo → losers restored, survivor reverted.
- Rename tag undo → original casing restored on every affected
  bookmark.
- Delete bookmark undo → bookmark restored, mapping rows restored.
- Merge with `syncEnabled: false` → no Chrome calls attempted
  (mocked `chrome.bookmarks.remove` not called).

No React-component tests yet — vitest env is `node` and we have no
jsdom set up. The Health page itself is exercised manually via the
extension. Adding component tests is out of scope for the initial
ship; we'd need to flip the env to `happy-dom` first.

## Performance

The scan must finish in under 3 seconds for a 20k-bookmark corpus on
a mid-range laptop. Targets:

- `listBookmarks()` is a single Dexie scan — IndexedDB hands back
  ~10k records in well under a second.
- Index building is O(n). One pass.
- Stub scanners are O(n) each. They share the corpus pass — we group
  them so a single iteration computes all stub findings.
- `soft-dup.title-similarity` is the only quadratic step. Bucketing
  by eTLD+1 keeps individual buckets small. We cap any bucket at 200
  bookmarks and skip larger ones with a logged warning.

We run the scan synchronously on a click. No Web Worker. If the cap
proves too low for some users we add a "scan large buckets too" opt-in
later.

## Things we deliberately do NOT do

- **Background scheduling.** No alarms, no on-startup scans. The
  user opens the page when they want to clean house. Existing
  dead-link sweep alarms stay where they are (in
  `src/core/maintenance/`).
- **Auto-apply anything.** Every action requires a click. Bulk-accept
  requires per-row review first.
- **LLM-based dedup.** Title similarity is a fixed string-distance
  metric. We do not call out to an LLM to decide if two articles are
  "about the same thing".
- **Network broken-link checks by default.** The opt-in toggle exists.
  Default off. Even when enabled, we read `bm.linkCheck` populated by
  the existing dead-link sweep — the Health scanner does not make its
  own HEAD requests.
- **Cross-device dismissal sync.** Dismissals stay on the device that
  dismissed them. If a finding still applies on device B, the user
  sees it there.
- **Resurrect Chrome bookmarks on undo.** Undo restores local store
  state. Chrome-side deletes are one-way. We surface this in the
  merge confirmation copy.
- **Persist findings.** They are recomputed on every scan. The cost
  of recomputation is low compared to the cost of stale findings
  drifting out of sync with the corpus.

## Open questions

- Whether `anomaly.folder-tag-mismatch` is too noisy in practice. We
  default it to enabled at `info` severity but if users complain it
  becomes default-off.
- Whether title-similarity should run cross-eTLD when the bookmark is
  YouTube/Reddit/Twitter (mirrors, reposts). Probably yes for those
  three domains specifically. Out of scope for v1.
- Whether to surface findings in the overview list itself (a small
  health badge on each bookmark card). Tempting but adds visual
  noise; defer until the Health page proves its worth.
