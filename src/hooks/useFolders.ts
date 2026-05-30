/**
 * useFolders — live view of the Chrome folder tree synced into our
 * `chromeMappings` table.
 *
 * Refreshes on mount and whenever `chromeMappings` or `bookmarks` mutate.
 * The forest excludes the absolute Chrome root; the synthetic top-level
 * containers (Bookmarks bar, Other bookmarks, Mobile bookmarks) appear as
 * roots.
 */

import { useCallback, useEffect, useState } from "react";
import { getDB } from "../core/storage/db";
import {
  buildFolderForest,
  type FolderNode,
  folderBookmarkCounts,
  listFolders,
} from "../core/storage/folders";

export type UseFoldersResult = {
  forest: FolderNode[];
  counts: Record<string, number>;
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useFolders(): UseFoldersResult {
  const [forest, setForest] = useState<FolderNode[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    const [folders, nextCounts] = await Promise.all([listFolders(), folderBookmarkCounts()]);
    setForest(buildFolderForest(folders));
    setCounts(nextCounts);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const [folders, nextCounts] = await Promise.all([listFolders(), folderBookmarkCounts()]);
      if (!mounted) return;
      setForest(buildFolderForest(folders));
      setCounts(nextCounts);
      setLoading(false);
    };

    run();

    const db = getDB();
    const enqueue = () => {
      if (!mounted) return;
      queueMicrotask(() => {
        if (mounted) run();
      });
    };
    db.chromeMappings.hook("creating", enqueue);
    db.chromeMappings.hook("updating", enqueue);
    db.chromeMappings.hook("deleting", enqueue);
    db.bookmarks.hook("creating", enqueue);
    db.bookmarks.hook("updating", enqueue);
    db.bookmarks.hook("deleting", enqueue);

    return () => {
      mounted = false;
    };
  }, []);

  return { forest, counts, loading, refresh };
}
