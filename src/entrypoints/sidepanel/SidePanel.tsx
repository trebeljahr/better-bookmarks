/**
 * Side panel view — slimmed-down overview for a narrow column.
 *
 * Reuses SearchBar, the result list, and the BookmarkDetail Sheet from
 * the full overview, but drops the tag-manager and bulk-actions surfaces
 * which want the wider tab layout.
 */

import { ExternalLink, Pencil, Star, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { BookmarkDetail } from "@/components/BookmarkDetail";
import { SearchBar } from "@/components/SearchBar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ensureSearchIndexInitialized, wireSearchIndexer } from "@/core/search";
import { deleteBookmark as deleteBookmarkRecord, updateBookmark } from "@/core/storage/bookmarks";
import { type Bookmark, useBookmarks } from "@/hooks/useBookmarks";
import { useSearch } from "@/hooks/useSearch";
import { cn } from "@/lib/utils";

wireSearchIndexer();
ensureSearchIndexInitialized().catch((err) =>
  console.error("ensureSearchIndexInitialized failed", err),
);

function getTagsFromBookmarks(bookmarks: Bookmark[]): string[] {
  const all = new Set<string>();
  for (const b of bookmarks) for (const t of b.tags) all.add(t);
  return Array.from(all).sort();
}

export const SidePanel = () => {
  const { bookmarks, loading } = useBookmarks();
  const { query, setQuery, results, parseError } = useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<FixedSizeList | null>(null);

  const tagsFromBookmarks = useMemo(() => getTagsFromBookmarks(bookmarks), [bookmarks]);

  const selected = useMemo(
    () => (selectedId ? (bookmarks.find((b) => b.id === selectedId) ?? null) : null),
    [bookmarks, selectedId],
  );

  const displayed = useMemo<Bookmark[]>(() => {
    if (query.trim().length > 0) return results;
    return [...bookmarks].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [bookmarks, query, results]);

  const handleSaveDetail = async (updated: Bookmark) => {
    await updateBookmark(updated.id, {
      title: updated.title,
      description: updated.description,
      note: updated.note,
      rating: updated.rating,
      necessaryTime: updated.necessaryTime,
      status: updated.status,
      contentType: updated.contentType,
      tags: updated.tags,
    });
  };

  const handleDeleteDetail = async (id: string) => {
    await deleteBookmarkRecord(id);
    setSelectedId(null);
  };

  const renderRow = (props: ListChildComponentProps) => {
    const { index, style } = props;
    const bookmark = displayed[index];
    if (!bookmark) return null;
    const ratingHigh = bookmark.rating && bookmark.rating >= 8;
    return (
      <div style={style} key={bookmark.id} className="flex items-center gap-1.5 pl-1 pr-1">
        <Avatar className="size-7 shrink-0">
          <AvatarFallback className={cn(ratingHigh && "bg-amber-200 text-amber-900")}>
            <Star className={cn("size-3.5", ratingHigh && "fill-amber-600")} />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{bookmark.title || bookmark.canonicalUrl}</p>
          <div className="flex flex-wrap items-center gap-1">
            <span className="truncate text-xs text-muted-foreground">{bookmark.domain}</span>
            {bookmark.tags.slice(0, 2).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                {t}
              </Badge>
            ))}
            {bookmark.tags.length > 2 && (
              <span className="text-xs text-muted-foreground/70">+{bookmark.tags.length - 2}</span>
            )}
          </div>
        </div>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-xs" asChild aria-label="open">
            <a
              href={bookmark.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="edit"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(bookmark.id);
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="delete"
            className="text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              deleteBookmarkRecord(bookmark.id);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="box-border flex h-screen flex-col gap-2 p-3">
      <h1 className="text-base font-semibold">Better Bookmarks</h1>
      <p className="text-xs text-muted-foreground">
        {loading ? "loading…" : `${bookmarks.length} total · ${displayed.length} showing`}
      </p>

      <SearchBar
        query={query}
        setQuery={setQuery}
        resultCount={displayed.length}
        parseError={parseError}
      />

      <div className="min-h-0 flex-1 rounded-md border">
        <FixedSizeList
          ref={listRef}
          height={Math.max(200, window.innerHeight - 180)}
          width="100%"
          itemSize={56}
          itemCount={displayed.length}
          overscanCount={5}
        >
          {renderRow}
        </FixedSizeList>
      </div>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full max-w-[100vw] sm:max-w-[600px]">
          {selected && (
            <BookmarkDetail
              bookmark={selected}
              allBookmarks={bookmarks}
              possibleTags={tagsFromBookmarks}
              onSave={handleSaveDetail}
              onDelete={handleDeleteDetail}
              onClose={() => setSelectedId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
