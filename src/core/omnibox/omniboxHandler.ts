/**
 * Chrome omnibox keyword (`bb`) wiring. Registers listeners that turn
 * address-bar queries into Better Bookmarks search results and route the
 * selected suggestion to the appropriate tab disposition.
 *
 * Per the Chrome omnibox API contract, suggestion descriptions accept a
 * tiny XML subset and free-form text must be escaped before interpolation.
 */

import { search } from "../search";

export const OMNIBOX_SUGGESTION_LIMIT = 6;

export function installOmnibox(): void {
  chrome.omnibox.setDefaultSuggestion({
    description: "Search Better Bookmarks: %s",
  });
  chrome.omnibox.onInputChanged.addListener(handleInputChanged);
  chrome.omnibox.onInputEntered.addListener(handleInputEntered);
}

export async function handleInputChanged(
  text: string,
  suggest: (results: chrome.omnibox.SuggestResult[]) => void,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    suggest([]);
    return;
  }
  const matches = await search(trimmed, { limit: OMNIBOX_SUGGESTION_LIMIT });
  const results: chrome.omnibox.SuggestResult[] = matches.map((b) => {
    const title = b.title || b.canonicalUrl;
    const description = `${xmlEscape(title)} — ${xmlEscape(b.domain)}`;
    return {
      content: b.originalUrl || b.canonicalUrl,
      description,
    };
  });
  suggest(results);
}

export function handleInputEntered(
  url: string,
  disposition: "currentTab" | "newForegroundTab" | "newBackgroundTab",
): void {
  if (!url) return;
  switch (disposition) {
    case "currentTab":
      chrome.tabs.update({ url });
      return;
    case "newForegroundTab":
      chrome.tabs.create({ url, active: true });
      return;
    case "newBackgroundTab":
      chrome.tabs.create({ url, active: false });
      return;
  }
}

/**
 * Escape XML metacharacters per the Chrome omnibox description grammar.
 * The omnibox treats descriptions as a tiny XML subset, so unescaped `&`,
 * `<`, `>`, `"`, `'` in titles/domains can corrupt rendering.
 */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
