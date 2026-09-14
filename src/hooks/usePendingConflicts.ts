import { useEffect, useState } from "react";
import { getDB } from "../core/storage/db";
import { listPendingConflicts, type PendingConflictRow } from "../core/sync/pendingConflicts";

/**
 * Subscribe to the `pendingConflicts` table. The overview page uses this
 * to know when to surface `ConflictResolverModal`. Dexie's global hooks
 * fire for any writer (background service worker OR the overview page
 * itself) so a fresh Chrome edit that lands while the user is viewing
 * shows up without a manual refresh.
 */
export function usePendingConflicts(): {
  conflicts: PendingConflictRow[];
  loading: boolean;
} {
  const [conflicts, setConflicts] = useState<PendingConflictRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const rows = await listPendingConflicts();
      if (mounted) setConflicts(rows);
    };
    (async () => {
      await refresh();
      if (mounted) setLoading(false);
      const db = getDB();
      db.pendingConflicts.hook("creating", () => queueMicrotask(refresh));
      db.pendingConflicts.hook("updating", () => queueMicrotask(refresh));
      db.pendingConflicts.hook("deleting", () => queueMicrotask(refresh));
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return { conflicts, loading };
}
