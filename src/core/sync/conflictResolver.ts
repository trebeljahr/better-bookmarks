import type { Bookmark, ConflictPolicy } from "../../shared/types";

export type ChromeView = {
  title: string;
  url: string;
  eventAt: number;
};

export type Resolution = {
  title: string;
  url: string;
  source: "chrome" | "store";
};

export function resolveTitleUrl(
  store: Pick<Bookmark, "title" | "originalUrl" | "updatedAt">,
  chromeView: ChromeView,
  policy: ConflictPolicy,
): Resolution {
  switch (policy) {
    case "prefer-chrome":
      return { title: chromeView.title, url: chromeView.url, source: "chrome" };
    case "prefer-store":
      return { title: store.title, url: store.originalUrl, source: "store" };
    case "ask":
      // The sync service surfaces a user prompt elsewhere. While the prompt
      // is pending we leave the store untouched.
      return { title: store.title, url: store.originalUrl, source: "store" };
    case "prefer-newer":
      if (chromeView.eventAt > store.updatedAt) {
        return { title: chromeView.title, url: chromeView.url, source: "chrome" };
      }
      return { title: store.title, url: store.originalUrl, source: "store" };
  }
}

export function chromeChangeWins(storeUpdatedAt: number, chromeEventAt: number): boolean {
  return chromeEventAt > storeUpdatedAt;
}
