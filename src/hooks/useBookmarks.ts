import { useEffect, useMemo, useState } from "react";
import { migrateLegacyStore } from "../core/migration/legacyToV1";
import { listBookmarks } from "../core/storage/bookmarks";
import { getDB } from "../core/storage/db";
import type { Bookmark as BookmarkRecord } from "../shared/types";

export type Bookmark = BookmarkRecord;

export const useBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    async function load() {
      try {
        await migrateLegacyStore();
      } catch (err) {
        console.error("legacy migration failed", err);
      }
      const initial = await listBookmarks();
      if (!mounted) return;
      setBookmarks(initial);
      setLoading(false);

      const db = getDB();
      const refresh = async () => {
        const next = await listBookmarks();
        if (mounted) setBookmarks(next);
      };
      db.bookmarks.hook("creating", () => {
        queueMicrotask(refresh);
      });
      db.bookmarks.hook("updating", () => {
        queueMicrotask(refresh);
      });
      db.bookmarks.hook("deleting", () => {
        queueMicrotask(refresh);
      });
      unsubscribe = () => {
        // Dexie has no public off() for hooks; fine for component lifetime.
      };
    }

    load();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const bookmarksByCanonical = useMemo(() => {
    const map: Record<string, BookmarkRecord> = {};
    for (const b of bookmarks) map[b.canonicalUrl] = b;
    return map;
  }, [bookmarks]);

  return { bookmarks, bookmarksByCanonical, loading };
};
