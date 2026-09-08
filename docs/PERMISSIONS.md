# Permissions Audit

Every Chrome permission requested by `wxt.config.ts` is listed below with the API
surface that justifies it (from `grep` over `src/`). One-sentence rationale each.
Audited 2026-09-08 against manifest v1.0.

## Manifest `permissions`

- **storage** — Used by `src/core/storage/settings.ts`, `src/core/sync/initialImport.ts`, and `src/core/migration/legacyToV1.ts` to persist user preferences, the initial-import flag, and the legacy-migration marker via `chrome.storage.local`.
- **tabs** — Used by `src/entrypoints/background.ts`, `src/core/omnibox/omniboxHandler.ts`, `src/core/contextMenu/contextMenuHandler.ts`, `src/core/sync/index.ts`, `src/entrypoints/overview/Overview.tsx`, and `src/entrypoints/health/Health.tsx` to query/create/update tabs so we can focus or launch the overview, health, and bookmark URLs.
- **bookmarks** — Used by `src/core/sync/reconcile.ts`, `src/core/sync/outbound.ts`, `src/core/sync/initialImport.ts`, `src/core/sync/index.ts`, and `src/core/backup/chromeTreeBackup.ts` to read the Chrome bookmarks tree, mirror our edits back into Chrome, and snapshot the raw tree for backup.
- **downloads** — Used by `src/core/backup/autoBackup.ts` and `src/core/backup/chromeTreeBackup.ts` to write JSON backups to `~/Downloads` and prune old rolling-N entries via `chrome.downloads.search`/`erase`.
- **alarms** — Used by `src/core/enrichment/scheduleAlarm.ts`, `src/core/maintenance/scheduleAlarm.ts`, `src/core/backup/scheduleAlarm.ts`, and the dispatcher in `src/entrypoints/background.ts` to schedule the periodic enrichment sweep, dead-link check, and auto-backup.
- **activeTab** — NO CALLERS. No `chrome.scripting.*`, `chrome.tabs.executeScript`, `insertCSS`, or activeTab-gated API is used in `src/`. Removal candidate — tracked in the GitHub issue linked from the PR that landed this file. Do not remove silently; a downstream feature (e.g. a future "capture current tab HTML" button) may have been the original motivation.
- **sidePanel** — Used by `src/entrypoints/background.ts` (the `open_sidepanel` command handler) to call `chrome.sidePanel.open({ windowId })` from the service worker.
- **contextMenus** — Used by `src/core/contextMenu/contextMenuHandler.ts` to register the "Add to Better Bookmarks" / "Add with note" / per-tag right-click menu items and dispatch their clicks.
- **offscreen** — Used by `src/core/semantic/bridge.ts` and `src/entrypoints/background.ts` to spawn the offscreen document that runs `@huggingface/transformers` (WebAssembly + Web Workers, which the MV3 service worker cannot host directly).
- **unlimitedStorage** — Justifies the IndexedDB store in `src/core/storage/db.ts` (Dexie table for bookmarks, tags, edges, and future vector rows), which can easily exceed the 10 MB default quota once a user imports a real bookmark history.

## Manifest `host_permissions`

- **`<all_urls>`** — Required by `src/core/enrichment/fetcher.ts` (opt-in `og:` / reading-time fetch against arbitrary bookmark URLs) and `src/core/maintenance/deadLinkChecker.ts` (HEAD sweep against every bookmark host). Both are disclosed in `docs/PRIVACY.md`.
- **`https://huggingface.co/*`** — Required by `@huggingface/transformers` in `src/core/semantic/model.ts` to download embedding-model weights on first use.

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
