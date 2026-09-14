import { useCallback, useEffect, useState } from "react";
import { listEdgesFor } from "../core/edges/crud";
import { type SuggestedEdge, suggestEdgesFor } from "../core/edges/suggest";
import { getDB } from "../core/storage/db";
import type { Edge } from "../shared/types";

export type UseEdgesResult = {
  edges: Edge[];
  suggestions: SuggestedEdge[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Live view of one bookmark's stored edges (manual + auto-*) plus the
 * unstored auto-suggested candidates from the suggester.
 *
 * `edges` includes every persisted edge incident to `bookmarkId`, so the
 * detail view can group them into Manual vs Auto sections and offer the
 * "unlink auto = delete + reject pair" behavior. `suggestions` remains
 * the unstored candidate list surfaced by `suggestEdgesFor`.
 *
 * Edges and suggestions are refreshed on mount, whenever `bookmarkId`
 * changes, and whenever the underlying Dexie `edges` store is mutated by
 * any caller (createEdge / deleteEdge from another tab or component will
 * propagate here).
 */
export function useEdges(bookmarkId: string): UseEdgesResult {
  const [edges, setEdges] = useState<Edge[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedEdge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    if (!bookmarkId) {
      setEdges([]);
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const [nextEdges, nextSuggestions] = await Promise.all([
      listEdgesFor(bookmarkId, { includeSuggested: true }),
      suggestEdgesFor(bookmarkId),
    ]);
    setEdges(nextEdges);
    setSuggestions(nextSuggestions);
    setLoading(false);
  }, [bookmarkId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const run = async () => {
      const [nextEdges, nextSuggestions] = await Promise.all([
        listEdgesFor(bookmarkId, { includeSuggested: true }),
        suggestEdgesFor(bookmarkId),
      ]);
      if (!mounted) return;
      setEdges(nextEdges);
      setSuggestions(nextSuggestions);
      setLoading(false);
    };

    if (!bookmarkId) {
      setEdges([]);
      setSuggestions([]);
      setLoading(false);
    } else {
      run();
    }

    // Dexie hooks for live updates. We schedule the refresh via
    // queueMicrotask so the write transaction has time to commit before
    // we re-query. Mirrors the pattern in useBookmarks.
    const db = getDB();
    const enqueue = () => {
      if (!mounted) return;
      queueMicrotask(() => {
        if (mounted) run();
      });
    };
    db.edges.hook("creating", enqueue);
    db.edges.hook("updating", enqueue);
    db.edges.hook("deleting", enqueue);

    return () => {
      mounted = false;
    };
  }, [bookmarkId]);

  return { edges, suggestions, loading, refresh };
}
