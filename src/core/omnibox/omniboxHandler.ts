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
  text: string,
  disposition: "currentTab" | "newForegroundTab" | "newBackgroundTab",
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  // A selected suggestion arrives here as its `content` — which we set to
  // the bookmark's http(s) URL. Anything else is a query the user hit Enter
  // on without picking a suggestion; route those into the overview page with
  // `#q=` so the search field is pre-populated.
  const target = isHttpUrl(trimmed)
    ? trimmed
    : chrome.runtime.getURL(`overview.html#q=${encodeURIComponent(trimmed)}`);
  switch (disposition) {
    case "currentTab":
      chrome.tabs.update({ url: target });
      return;
    case "newForegroundTab":
      chrome.tabs.create({ url: target, active: true });
      return;
    case "newBackgroundTab":
      chrome.tabs.create({ url: target, active: false });
      return;
  }
}

/** True iff `s` parses as an http/https URL. Used to tell a picked
 *  suggestion (whose `content` is a bookmark URL) from a raw query. */
export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
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
