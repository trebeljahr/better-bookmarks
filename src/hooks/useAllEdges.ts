/**
 * useAllEdges — live view of the full edge table.
 *
 * The graph view needs every edge in the store so it can intersect
 * with the currently-visible bookmark subset. Dexie hooks push
 * updates whenever any tab writes an edge (manual create, auto-suggest
 * sweep, bulk delete cascade), same pattern as `useBookmarks`.
 */

import { useEffect, useState } from "react";
import { listAllEdges } from "../core/edges/crud";
import { getDB } from "../core/storage/db";
import type { Edge } from "../shared/types";

export type UseAllEdgesOptions = {
  /**
   * When false the hook returns an empty edge list and skips both the
   * initial `listAllEdges` scan and the Dexie hook subscription. The
   * overview uses this so a session with `graphViewEnabled === false`
   * never pays the cost of loading every edge into memory.
   */
  enabled?: boolean;
};

export function useAllEdges(opts: UseAllEdgesOptions = {}): { edges: Edge[]; loading: boolean } {
  const enabled = opts.enabled ?? true;
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setEdges([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);

    const refresh = async () => {
      const next = await listAllEdges();
      if (!mounted) return;
      setEdges(next);
      setLoading(false);
    };

    refresh();

    const db = getDB();
    const enqueue = () => {
      if (!mounted) return;
      queueMicrotask(() => {
        if (mounted) refresh();
      });
    };
    db.edges.hook("creating", enqueue);
    db.edges.hook("updating", enqueue);
    db.edges.hook("deleting", enqueue);

    return () => {
      mounted = false;
    };
  }, [enabled]);

  return { edges, loading };
}
