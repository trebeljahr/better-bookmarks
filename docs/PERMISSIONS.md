# Permissions Audit

Every Chrome permission requested by `wxt.config.ts` is listed below with the API
surface that justifies it (from `grep` over `src/`). One-sentence rationale each.
Audited 2026-09-08 against manifest v1.0. `activeTab` removed 2026-09-14
after a follow-up grep confirmed zero callers (see the removal commit
recorded in `CHANGELOG.md`).

## Manifest `permissions`

- **storage** — Used by `src/core/storage/settings.ts`, `src/core/sync/initialImport.ts`, and `src/core/migration/legacyToV1.ts` to persist user preferences, the initial-import flag, and the legacy-migration marker via `chrome.storage.local`.
- **tabs** — Used by `src/entrypoints/background.ts`, `src/core/omnibox/omniboxHandler.ts`, `src/core/contextMenu/contextMenuHandler.ts`, `src/core/sync/index.ts`, `src/entrypoints/overview/Overview.tsx`, and `src/entrypoints/health/Health.tsx` to query/create/update tabs so we can focus or launch the overview, health, and bookmark URLs.
- **bookmarks** — Used by `src/core/sync/reconcile.ts`, `src/core/sync/outbound.ts`, `src/core/sync/initialImport.ts`, `src/core/sync/index.ts`, and `src/core/backup/chromeTreeBackup.ts` to read the Chrome bookmarks tree, mirror our edits back into Chrome, and snapshot the raw tree for backup.
- **downloads** — Used by `src/core/backup/autoBackup.ts` and `src/core/backup/chromeTreeBackup.ts` to write JSON backups to `~/Downloads` and prune old rolling-N entries via `chrome.downloads.search`/`erase`.
- **alarms** — Used by `src/core/enrichment/scheduleAlarm.ts`, `src/core/maintenance/scheduleAlarm.ts`, `src/core/backup/scheduleAlarm.ts`, and the dispatcher in `src/entrypoints/background.ts` to schedule the periodic enrichment sweep, dead-link check, and auto-backup.
- **activeTab** — REMOVED 2026-09-14 (closes issue #1; see `CHANGELOG.md`). Zero callers of `chrome.scripting.*`, `chrome.tabs.executeScript`, or `insertCSS`; all tab access uses the declared `tabs` permission, and website fetches use the optional `<all_urls>` grant. Re-add only if a temporary-grant flow (e.g. capture current tab HTML) lands.
- **sidePanel** — Used by `src/entrypoints/background.ts` (the `open_sidepanel` command handler) to call `chrome.sidePanel.open({ windowId })` from the service worker.
- **contextMenus** — Used by `src/core/contextMenu/contextMenuHandler.ts` to register the "Add to Better Bookmarks" / "Add with note" / per-tag right-click menu items and dispatch their clicks.
- **offscreen** — Used by `src/core/semantic/bridge.ts` and `src/entrypoints/background.ts` to spawn the offscreen document that runs `@huggingface/transformers` (WebAssembly + Web Workers, which the MV3 service worker cannot host directly).
- **unlimitedStorage** — Justifies the IndexedDB store in `src/core/storage/db.ts` (Dexie table for bookmarks, tags, edges, and future vector rows), which can easily exceed the 10 MB default quota once a user imports a real bookmark history.

## Manifest `host_permissions`

None since 2026-10-08. A fresh install cannot contact any website.

## Manifest `optional_host_permissions`

- **`<all_urls>`** — Requested at runtime by `src/core/permissions/siteAccess.ts` when the user turns on the dead-link check or metadata enrichment in Options (or runs "Scan broken links" on the Health page). Used by `src/core/maintenance/deadLinkChecker.ts` (HEAD to each bookmarked URL) and `src/core/enrichment/fetcher.ts` (GET for title, description, reading time). The background alarms re-check `chrome.permissions.contains` before every sweep, because the user can revoke access in chrome://extensions. Both features default to off. Moved out of `host_permissions` 2026-10-08 so the store review does not treat the extension as needing broad host access.

## Removed

- **`https://huggingface.co/*`** — REMOVED 2026-10-08. The semantic-model download in `src/core/semantic/model.ts` runs from the offscreen document; huggingface.co and its CDN (`*.cdn.hf.co`) answer extension origins with `access-control-allow-origin`, so the fetch works without host access. The redirect targets were never covered by this pattern anyway.
- **`web_accessible_resources` for `transformers/*`** — REMOVED 2026-10-08. Only the extension's own offscreen document loads the ONNX runtime files (`wasm.wasmPaths = chrome.runtime.getURL("transformers/")`); extension pages need no web-accessible entry, and the old entry exposed the files to every website.

## Grep methodology

For each permission, the codebase was searched for its API surface:

```
grep -rn "chrome\.storage\."      --include="*.ts" --include="*.tsx" src
grep -rn "chrome\.tabs\."         --include="*.ts" --include="*.tsx" src
grep -rn "chrome\.bookmarks\."    --include="*.ts" --include="*.tsx" src
grep -rn "chrome\.downloads\."    --include="*.ts" --include="*.tsx" src
grep -rn "chrome\.alarms\."       --include="*.ts" --include="*.tsx" src
grep -rn "chrome\.sidePanel\."    --include="*.ts" --include="*.tsx" src
grep -rn "chrome\.contextMenus\." --include="*.ts" --include="*.tsx" src
grep -rn "chrome\.offscreen\."    --include="*.ts" --include="*.tsx" src
grep -rn "chrome\.scripting\."    --include="*.ts" --include="*.tsx" src   # (activeTab)
grep -rn "\bfetch(\|new Dexie"    --include="*.ts" --include="*.tsx" src   # (host_permissions / unlimitedStorage)
```

Re-run whenever a permission is added, removed, or a new API surface is introduced.
