# Chrome Bookmarks Sync

How Better Bookmarks stays in sync with the native Chrome bookmarks
tree, in both directions, without loops and without losing data.

The goal: a bookmark created or edited on either side is reflected on
the other side within a second or two. Folders and tags stay in
agreement via the folder-mirror policy. No silent deletions.

## What's authoritative

- Chrome owns: URL, title, folder placement, position within folder,
  `dateAdded`.
- Better Bookmarks owns: canonical URL, tags, rating, note, status,
  reading time, content type, edges, language.

When a field exists on both sides (URL, title), the default policy
is `prefer-newer` (see [DECISIONS.md](DECISIONS.md) D2). Newness is
determined by:

- `Bookmark.updatedAt` for our side.
- `ChromeMapping.lastKnownEventAt` for Chrome's side, set every time
  an `onCreated` / `onChanged` / `onMoved` event fires for that
  Chrome id.

Whichever timestamp is strictly larger wins. Ties keep our value
(arbitrary tie-break, not a user-visible behaviour).

## The mapping table

Every Chrome bookmark and folder we know about has a row in the
`ChromeMapping` table (see [DATA_MODEL.md](DATA_MODEL.md#chrome-sync-mapping)).
That row holds:

- the Chrome id,
- the matching `Bookmark.id` (or null for folders),
- the last-seen values of `title`, `url`, `parentId`,
- a `lastSyncedAt` timestamp.

Lookups are O(1) in both directions. The table survives service
worker death because it's in IndexedDB.

## Inbound flow: Chrome → store

Triggers:

- `chrome.bookmarks.onCreated`
- `chrome.bookmarks.onChanged`
- `chrome.bookmarks.onRemoved`
- `chrome.bookmarks.onMoved`
- `chrome.bookmarks.onChildrenReordered`
- Periodic reconciliation (see "drift recovery" below)

Every handler starts with:

```ts
if (inFlight.has(chromeId)) {
  inFlight.delete(chromeId);
  return; // this event is the echo of our own write
}
```

### onCreated

If the node is a folder:

1. Insert a row into `ChromeMapping` with `isFolder: true`,
   `bookmarkId: null`.
2. If folder-mirror policy is `"all"` or this folder's parent is
   mirrored, register a corresponding tag and remember the mirror.

If the node is a bookmark:

1. Compute `canonicalUrl = canonicalize(node.url)`.
2. Look up `canonicalUrl` in the bookmark store.
3. **Existing bookmark found**: this is a duplicate Chrome entry for
   a URL we already track.
   - Add the new Chrome id to the mapping table pointing to the
     existing bookmark.
   - Merge the new folder into the tag set (folder name becomes a
     tag).
   - Do not modify the bookmark's title (Chrome will let two entries
     with the same URL coexist; we don't try to rewrite history).
4. **No existing bookmark**: this is genuinely new.
   - Create a `Bookmark` with `capturedFrom: "chrome-sync"`.
   - `tags` = [leaf folder name] (and ancestor chain if user opted in).
   - `title` from Chrome.
   - `rating: null`, `note: ""`, `status: "unread"`.
   - Insert mapping row.

### onChanged

(`title` and/or `url` changed for an existing Chrome node.)

1. Find the mapping row by `chromeId`. If missing, treat as
   `onCreated`.
2. If `url` changed:
   - Recompute `canonicalUrl`. If unchanged, just record the new
     `lastKnownUrl` on the mapping row. If changed:
     - If the new canonical already exists for a different bookmark,
       merge (and remap this Chrome id to the surviving bookmark).
     - Otherwise update the bookmark's `originalUrl`, `canonicalUrl`,
       `domain`, `updatedAt`.
3. If `title` changed:
   - Apply `conflictPolicy`:
     - `prefer-chrome` (default): overwrite `Bookmark.title`.
     - `prefer-store`: ignore (and queue a write-back to fix Chrome).
     - `prefer-newer`: compare `updatedAt` to Chrome's event time.
     - `ask`: surface a notification.

### onRemoved

(A Chrome node was deleted, possibly with descendants.)

For each `chromeId` in the removal:

1. Find the mapping row. If missing, no-op.
2. If folder: drop the mapping row; the mirrored tag *stays* (we
   never delete tag data because Chrome deleted a folder).
3. If bookmark: remove the mapping row.
   - If this was the last Chrome id mapped to this `bookmarkId`, the
     bookmark itself is orphaned from Chrome. Default: keep the
     bookmark in our store with a flag `chromeOrphan: true`. The
     user can choose to delete or to push back into Chrome.
   - If other Chrome ids still map to this `bookmarkId`: no change.

### onMoved

(Node moved to a different parent or different position.)

1. Update the mapping row's `parentChromeId`.
2. If the new parent is a mirrored folder for a tag the bookmark
   doesn't have, add the tag. If the *old* parent was a mirrored
   folder for a tag the bookmark has, remove that tag iff no other
   Chrome copy is in a mirrored folder for it.
3. Position changes within the same folder are ignored. We do not
   preserve manual ordering.

### onChildrenReordered

Ignored. We do not track sibling order.

## Outbound flow: store → Chrome

Triggers: any write through `bookmarkService` or `tagService`.

### Bookmark created in popup

1. Bookmark service writes the record, emits `bookmark:upserted`.
2. Sync service decides which Chrome folder to write into:
   - If exactly one tag has a `mirrorFolderId`: that folder.
   - If multiple tags have mirrors: pick the most recently used one
     (settings-controlled).
   - If none: a default "Better Bookmarks" folder under the
     bookmarks bar.
3. Set `inFlight.add(predictedChromeId)` before calling
   `chrome.bookmarks.create`. Actually we don't know the id yet, so
   instead we add a marker `inFlightCreate.add(url + parentId)` and
   check that in the `onCreated` handler.
4. After creation, insert the mapping row.

### Bookmark edited in overview

1. If `title` changed: `chrome.bookmarks.update(chromeId, {title})`.
2. If `canonicalUrl` changed because `originalUrl` was edited:
   `chrome.bookmarks.update(chromeId, {url: newOriginalUrl})`.
3. Tag changes that affect mirrored folders fire a move.

In all cases the `inFlight` flag is set just before the Chrome API
call and consumed by the matching event handler.

### Bookmark deleted

1. `chrome.bookmarks.remove(chromeId)` for every mapped Chrome id.
2. Drop mapping rows after the API confirms.

### Tag mirror toggled on

1. Create the Chrome folder under the user-chosen parent (default:
   bookmarks bar).
2. For every bookmark carrying this tag: ensure a Chrome bookmark
   exists in that folder. Use `chrome.bookmarks.create` for any
   missing entries.

### Tag mirror toggled off

1. Stop tracking that folder as a mirror.
2. Leave the Chrome folder in place (don't surprise-delete user
   data).
3. Future changes to that tag no longer touch the folder.

## Loop prevention in detail

Naive bidirectional sync loops are the most common failure mode. We
prevent loops with two complementary mechanisms:

1. **`inFlight` token**. Before every Chrome write, the sync service
   adds a token to a set. The matching event handler checks the set
   first and bails out if the token is present.

2. **Idempotent equality check**. Even if a token is missed (worker
   restart between write and event), every handler compares the
   inbound payload to the current store state. If applying the
   change would produce no diff, we no-op.

A handler doing a no-op still updates the mapping row's
`lastSyncedAt` so drift recovery doesn't keep re-checking it.

## Drift recovery

The service worker may suspend, the user may have Chrome bookmarks
sync turned on (which produces events we may or may not see during
service-worker downtime), or a manual edit may have happened in
DevTools. We reconcile on the events most likely to expose drift,
not on a fixed timer (see [DECISIONS.md](DECISIONS.md) D6, decided:
hybrid — cold start + UI open, no 6h alarm).

Reconciliation runs:

- Once on every service-worker cold start (cheap because the worker
  was just woken and most state is already cached).
- Once when a user-visible UI surface opens — popup or overview —
  debounced to at most once per 60 seconds across both.

When it runs:

1. Pull `chrome.bookmarks.getTree()`.
2. For every node, look up the mapping row.
3. If the row is missing: simulate `onCreated`.
4. If the row is stale (different title/url/parent than
   `lastKnownX`): simulate the appropriate `onChanged`/`onMoved`.
5. After traversal: any mapping row whose `chromeId` no longer
   exists in the tree: simulate `onRemoved`.

Reconciliation is allowed to be slow. It does not block any UI.

## Initial import vs. ongoing sync

The first time the extension runs (or the first time the user opts
into sync), there is no mapping table. We do a one-shot import:

1. Walk `chrome.bookmarks.getTree()`.
2. For each bookmark, run canonicalization.
3. Group by canonical URL (collapsing duplicates).
4. Write `Bookmark` records with merged tags (folder name for each
   Chrome copy becomes a tag).
5. Write mapping rows for every Chrome id.

This is what `logTree` in the current `overview.tsx` is reaching
toward — the new version makes it idempotent and re-runnable.

## Failure modes we accept

- **Chrome quota errors**. If `chrome.bookmarks.create` fails (rare,
  but happens for sync edge cases), we mark the bookmark with
  `pendingChromeSync: true` and retry on the next reconciliation.
- **Permission revoked mid-session**. If the user toggles off the
  `bookmarks` permission, we disable the sync service cleanly and
  surface a banner in the overview. The local store keeps working.
- **Concurrent edit in two windows**. The mapping table is the
  single coordination point; both writes go through the service
  worker which serializes them.

## What we never do

- Delete a tag because a Chrome folder vanished.
- Delete a bookmark from our store because Chrome removed it (we
  flag it `chromeOrphan` and let the user choose).
- Rename a tag automatically when a Chrome folder is renamed (we
  ask, because tag renames touch many records).
- Push a write to Chrome while a permission prompt is pending.
