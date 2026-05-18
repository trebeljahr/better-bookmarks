import { useCallback, useEffect, useState } from "react";
import { getDB } from "../core/storage/db";
import { listTags, tagBookmarkCounts } from "../core/storage/tags";
import type { Tag } from "../shared/types";

export type UseTagsResult = {
  tags: Tag[];
  counts: Record<string, number>;
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Live view of the tag registry plus a per-tag bookmark count.
 *
 * Refreshes on mount and whenever Dexie's `tags` or `bookmarks` stores
 * mutate. Cheap for typical tag counts; if the tag set ever explodes we
 * can swap the count step for a maintained counter table.
 */
export function useTags(): UseTagsResult {
  const [tags, setTags] = useState<Tag[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    const [nextTags, nextCounts] = await Promise.all([listTags(), tagBookmarkCounts()]);
    setTags(nextTags);
    setCounts(nextCounts);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const [nextTags, nextCounts] = await Promise.all([listTags(), tagBookmarkCounts()]);
      if (!mounted) return;
      setTags(nextTags);
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
    db.tags.hook("creating", enqueue);
    db.tags.hook("updating", enqueue);
    db.tags.hook("deleting", enqueue);
    db.bookmarks.hook("creating", enqueue);
    db.bookmarks.hook("updating", enqueue);
    db.bookmarks.hook("deleting", enqueue);

    return () => {
      mounted = false;
    };
  }, []);

  return { tags, counts, loading, refresh };
}
