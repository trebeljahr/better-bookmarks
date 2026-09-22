# Firefox install verification

Load-test the build produced by `pnpm zip:firefox`.

## Steps
1. Open Firefox → about:debugging.
2. Click "This Firefox" (left sidebar).
3. Click "Load Temporary Add-on...".
4. Pick the .output firefox zip (Firefox 109+ accepts .zip directly; older Firefox: unzip first, pick manifest.json).
5. Confirm the extension appears + icon renders.
6. Open a new tab. Click the extension icon.
7. Overview page loads without console errors (F12 → Console).

## Functional smoke test
- Overview: bookmark list renders (empty on first install).
- Import a small JSON export from Chrome via Overview → Import file…
- Trigger a search. Confirm results.
- Open a bookmark's detail sheet.

## Known Firefox rough edges
- sidePanel API: Firefox MV3 support is partial; the panel may not open from the toolbar icon.
- offscreen API: Firefox does not support chrome.offscreen — semantic search will not run. Confirm the extension does NOT crash on load when the offscreen path fires.
- unlimitedStorage: Firefox may prompt for permission.
- Background service worker differs from Chrome; sync events may miss on first install.

## After verifying
Temporary add-on shows the extension is unsigned. For AMO submission: upload the zip at https://addons.mozilla.org/developers/.
