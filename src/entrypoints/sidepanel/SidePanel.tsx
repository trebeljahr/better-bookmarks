/**
 * Side panel view — slimmed-down overview for a narrow column.
 *
 * Reuses SearchBar, the result list, and the BookmarkDetail Drawer from
 * the full overview, but drops the tag-manager and bulk-actions surfaces
 * which want the wider tab layout.
 */

import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import StarIcon from "@mui/icons-material/Star";
import {
  Box,
  Chip,
  Drawer,
  IconButton,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import Avatar from "@mui/material/Avatar";
import { useMemo, useRef, useState } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { BookmarkDetail } from "@/components/BookmarkDetail";
import { SearchBar } from "@/components/SearchBar";
import { ensureSearchIndexInitialized, wireSearchIndexer } from "@/core/search";
import { deleteBookmark as deleteBookmarkRecord, updateBookmark } from "@/core/storage/bookmarks";
import { type Bookmark, useBookmarks } from "@/hooks/useBookmarks";
import { useSearch } from "@/hooks/useSearch";

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
    return (
      <ListItem
        style={style}
        key={bookmark.id}
        component="div"
        disablePadding
        sx={{ pl: 0.5 }}
        secondaryAction={
          <Stack direction="row" spacing={0.25}>
            <IconButton
              aria-label="open"
              component="a"
              href={bookmark.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              onClick={(e) => e.stopPropagation()}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="edit"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(bookmark.id);
              }}
              size="small"
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="delete"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                deleteBookmarkRecord(bookmark.id);
              }}
              size="small"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        }
      >
        <ListItemAvatar sx={{ minWidth: 40 }}>
          <Avatar
            sx={{
              width: 28,
              height: 28,
              bgcolor: bookmark.rating && bookmark.rating >= 8 ? "warning.main" : undefined,
            }}
          >
            <StarIcon fontSize="small" />
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={
            <Typography variant="body2" noWrap>
              {bookmark.title || bookmark.canonicalUrl}
            </Typography>
          }
          secondary={
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              component="span"
              sx={{ flexWrap: "wrap" }}
            >
              <Typography variant="caption" color="text.secondary" component="span" noWrap>
                {bookmark.domain}
              </Typography>
              {bookmark.tags.slice(0, 2).map((t) => (
                <Chip key={t} label={t} size="small" variant="outlined" component="span" />
              ))}
              {bookmark.tags.length > 2 && (
                <Typography variant="caption" color="text.disabled" component="span">
                  +{bookmark.tags.length - 2}
                </Typography>
              )}
            </Stack>
          }
        />
      </ListItem>
    );
  };

  return (
    <Stack spacing={1.5} sx={{ p: 1.5, height: "100vh", boxSizing: "border-box" }}>
      <Typography variant="h6">Better Bookmarks</Typography>
      <Typography variant="caption" color="text.secondary">
        {loading ? "loading…" : `${bookmarks.length} total · ${displayed.length} showing`}
      </Typography>

      <SearchBar
        query={query}
        setQuery={setQuery}
        resultCount={displayed.length}
        parseError={parseError}
      />

      <Box sx={{ flex: 1, border: 1, borderColor: "divider", borderRadius: 1, minHeight: 0 }}>
        <FixedSizeList
          ref={listRef}
          height={Math.max(200, window.innerHeight - 180)}
          width="100%"
          itemSize={64}
          itemCount={displayed.length}
          overscanCount={5}
        >
          {renderRow}
        </FixedSizeList>
      </Box>

      <Drawer
        anchor="right"
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        PaperProps={{ sx: { maxWidth: "100vw" } }}
      >
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
      </Drawer>
    </Stack>
  );
};
