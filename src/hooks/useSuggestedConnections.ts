import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_TOP_K,
  listGlobalRankedAutoEdges,
  listRankedAutoEdgesFor,
} from "../core/edges/ranked";
import { getDB } from "../core/storage/db";
import type { Edge } from "../shared/types";

export type UseSuggestedConnectionsOptions = {
  /**
   * When set, scope the ranked list to auto edges incident to this
   * bookmark. Undefined = global top-K across the corpus.
   */
  bookmarkId?: string;
  /** Top-K cap; defaults to `DEFAULT_TOP_K`. */
  limit?: number;
};

export type UseSuggestedConnectionsResult = {
  edges: Edge[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Live-updating view of the top-ranked auto-suggested edges. Subscribes
 * to Dexie's `edges` hooks so the panel re-renders when the background
 * sweep writes new candidates, or when the user Accepts / Rejects one.
 */
export function useSuggestedConnections(
  opts: UseSuggestedConnectionsOptions = {},
): UseSuggestedConnectionsResult {
  const { bookmarkId, limit = DEFAULT_TOP_K } = opts;
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const load = useCallback(async (): Promise<Edge[]> => {
    if (bookmarkId !== undefined) {
      if (!bookmarkId) return [];
      return listRankedAutoEdgesFor({ bookmarkId, limit });
    }
    return listGlobalRankedAutoEdges({ limit });
  }, [bookmarkId, limit]);

  const refresh = useCallback(async () => {
    const next = await load();
    setEdges(next);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const run = async () => {
      const next = await load();
      if (!mounted) return;
      setEdges(next);
      setLoading(false);
    };

    run();

    // Mirror the useEdges pattern: queue a microtask so the write
    // transaction can commit before we re-read.
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
  }, [load]);

  return { edges, loading, refresh };
}
