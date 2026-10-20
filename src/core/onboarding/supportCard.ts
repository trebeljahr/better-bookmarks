/**
 * The support card after the first file import.
 *
 * The overview shows one small card when the first "Import file…" run
 * finishes: what the import did, and a line linking the donate page. It
 * shows once per install. The mark is written before the card appears,
 * so it never comes back on a later import, closed or not.
 *
 * Top-level `chrome.storage.local` key, next to the onboarding fields,
 * for the same reason they live there (see ./state.ts).
 */

export const IMPORT_SUPPORT_CARD_KEY = "importSupportCardShownAt";

/**
 * True once: for the first finished import that should show the card.
 * Storage that fails answers false, because a card that cannot remember
 * being shown would come back on every import.
 */
export async function claimImportSupportCard(now: () => number = Date.now): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return false;
  try {
    const result = await chrome.storage.local.get(IMPORT_SUPPORT_CARD_KEY);
    if (result[IMPORT_SUPPORT_CARD_KEY] !== undefined) return false;
    await chrome.storage.local.set({ [IMPORT_SUPPORT_CARD_KEY]: now() });
    return true;
  } catch (err) {
    console.error("claimImportSupportCard failed", err);
    return false;
  }
}
