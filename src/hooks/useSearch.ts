/**
 * useSearch — React hook over the search subsystem.
 *
 * - Debounces query input by 100ms to avoid spamming the index on every
 *   keystroke.
 * - Re-runs when the underlying bookmarks store changes (Dexie hooks,
 *   same mechanism as useBookmarks).
 * - For an empty query, returns the most recent 100 bookmarks.
 * - Surfaces parser errors so the UI can show "invalid filter" inline.
 */

import { useEffect, useState } from "react";
import { parseQuery, search } from "../core/search";
import { getDB } from "../core/storage/db";
import type { Bookmark } from "../shared/types";

const DEBOUNCE_MS = 100;
const DEFAULT_LIMIT = 100;

export type UseSearchResult = {
  query: string;
  setQuery: (s: string) => void;
  results: Bookmark[];
  loading: boolean;
  parseError: string | null;
};

export function useSearch(): UseSearchResult {
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  // Counter that bumps on bookmark mutation; included in effect deps so
  // we re-run the query.
  const [storeRev, setStoreRev] = useState<number>(0);

  // Subscribe to bookmark store mutations so search results stay fresh.
  useEffect(() => {
    const db = getDB();
    const bump = () => {
      // queueMicrotask: align with useBookmarks, give Dexie the write
      // commit before we re-read.
      queueMicrotask(() => setStoreRev((n) => n + 1));
    };
    db.bookmarks.hook("creating", bump);
    db.bookmarks.hook("updating", bump);
    db.bookmarks.hook("deleting", bump);
    // Dexie has no public off() for hooks; safe for hook lifetime.
    return () => {
      // no-op
    };
  }, []);

  // Run the search whenever the (debounced) query or storeRev changes.
  // storeRev is intentionally in the deps to force a re-run on bookmark
  // mutations even though it isn't referenced in the effect body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: storeRev is a re-run trigger
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const parsed = parseQuery(query);
    setParseError(parsed.errors.length > 0 ? parsed.errors.join("; ") : null);

    const handle = setTimeout(async () => {
      try {
        const r = await search(query, { limit: DEFAULT_LIMIT });
        if (!cancelled) {
          setResults(r);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          // Surface the failure as an empty result set; don't crash UI.
          console.error("search failed", err);
          setResults([]);
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, storeRev]);

  return { query, setQuery, results, loading, parseError };
}
