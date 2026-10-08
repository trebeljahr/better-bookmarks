/**
 * Optional "all sites" host access.
 *
 * `<all_urls>` is declared under `optional_host_permissions`, not
 * `host_permissions`: a fresh install can reach no website at all. The two
 * features that contact bookmarked hosts — the dead-link check (HEAD) and
 * metadata enrichment (GET) — ask for access when the user turns them on,
 * and every background run re-checks it, because the user can revoke it in
 * chrome://extensions at any time without touching our settings.
 *
 * `requestSiteAccess` must run inside a user gesture (a click handler, before
 * any other await), or Chrome rejects the prompt.
 */

const ALL_SITES: chrome.permissions.Permissions = { origins: ["<all_urls>"] };

export async function hasSiteAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.contains(ALL_SITES);
  } catch {
    return false;
  }
}

export async function requestSiteAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.request(ALL_SITES);
  } catch (err) {
    console.warn("requestSiteAccess failed", err);
    return false;
  }
}
