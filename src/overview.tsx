import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import StarIcon from "@mui/icons-material/Star";
import UploadIcon from "@mui/icons-material/Upload";
import {
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  ThemeProvider,
  Typography,
} from "@mui/material";
import Avatar from "@mui/material/Avatar";
import React, { useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { BookmarkDetail } from "./components/BookmarkDetail";
import { theme } from "./components/MaterialTheme";
import { SearchBar } from "./components/SearchBar";
import { canonicalize } from "./core/canonicalizer";
import { ensureSearchIndexInitialized, wireSearchIndexer } from "./core/search";
import {
  deleteBookmark as deleteBookmarkRecord,
  listBookmarks,
  updateBookmark,
  upsertBookmark,
} from "./core/storage/bookmarks";
import { type Bookmark, useBookmarks } from "./hooks/useBookmarks";
import { useSearch } from "./hooks/useSearch";

// Wire search indexer eagerly in the overview context so any edits the user
// makes here update the postings store immediately. Idempotent across the
// app's three contexts (popup / overview / background service worker).
wireSearchIndexer();
ensureSearchIndexInitialized().catch((err) =>
  console.error("ensureSearchIndexInitialized failed", err),
);

type BookmarksById = Record<string, chrome.bookmarks.BookmarkTreeNode>;

function recursivelyFlattenBookmarks(bookmarkItem: chrome.bookmarks.BookmarkTreeNode) {
  const bookmarksById: BookmarksById = {};
  function recurse(node: chrome.bookmarks.BookmarkTreeNode) {
    bookmarksById[node.id] = node;
    node.children?.forEach(recurse);
  }
  recurse(bookmarkItem);
  return bookmarksById;
}

async function importChromeTree(tree: chrome.bookmarks.BookmarkTreeNode): Promise<number> {
  const all = recursivelyFlattenBookmarks(tree);
  function tagsFor(item: chrome.bookmarks.BookmarkTreeNode): string[] {
    const tags: string[] = [];
    let current = item.parentId ? all[item.parentId] : undefined;
    while (current && current.title !== "Bookmarks Bar" && current.parentId) {
      if (current.title) tags.push(current.title);
      current = current.parentId ? all[current.parentId] : undefined;
    }
    return tags;
  }
  let imported = 0;
  for (const node of Object.values(all)) {
    if (!node.url) continue;
    const c = canonicalize(node.url);
    if (!c.ok) continue;
    await upsertBookmark({
      rawUrl: node.url,
      title: node.title,
      description: node.title,
      tags: tagsFor(node),
      capturedFrom: "chrome-import",
    });
    imported += 1;
  }
  return imported;
}

function getTagsFromBookmarks(bookmarks: Bookmark[]): string[] {
  const all = new Set<string>();
  for (const b of bookmarks) for (const t of b.tags) all.add(t);
  return Array.from(all).sort();
}

const Overview = () => {
  const { bookmarks, loading } = useBookmarks();
  const { query, setQuery, results, parseError } = useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string>("");

  const tagsFromBookmarks = useMemo(() => getTagsFromBookmarks(bookmarks), [bookmarks]);

  const downloadLink = useRef<HTMLAnchorElement>(null);

  async function exportBookmarks() {
    const all = await listBookmarks();
    const json = JSON.stringify(all, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    if (!downloadLink.current) return;
    downloadLink.current.href = objectUrl;
    downloadLink.current.click();
  }

  const handleUpload = async () => {
    setImportStatus("importing…");
    const tree = await chrome.bookmarks.getTree();
    const count = await importChromeTree(tree[0]);
    setImportStatus(`imported ${count} bookmarks`);
  };

  const selected = useMemo(
    () => (selectedId ? (bookmarks.find((b) => b.id === selectedId) ?? null) : null),
    [bookmarks, selectedId],
  );

  // What to render in the list: search results when a query is active,
  // otherwise the full bookmark set sorted by recency.
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
        secondaryAction={
          <Stack direction="row" spacing={0.5}>
            <IconButton
              aria-label="open"
              component="a"
              href={bookmark.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
            <IconButton aria-label="edit" onClick={() => setSelectedId(bookmark.id)} size="small">
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="delete"
              color="error"
              onClick={() => deleteBookmarkRecord(bookmark.id)}
              size="small"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        }
      >
        <ListItemAvatar>
          <Avatar
            sx={{
              bgcolor: bookmark.rating && bookmark.rating >= 8 ? "warning.main" : undefined,
            }}
          >
            <StarIcon />
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={<Typography noWrap>{bookmark.title || bookmark.canonicalUrl}</Typography>}
          secondary={
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              component="span"
              sx={{ flexWrap: "wrap" }}
            >
              <Typography variant="caption" color="text.secondary" component="span" noWrap>
                {bookmark.domain}
              </Typography>
              {bookmark.tags.slice(0, 4).map((t) => (
                <Chip key={t} label={t} size="small" variant="outlined" component="span" />
              ))}
              {bookmark.tags.length > 4 && (
                <Typography variant="caption" color="text.disabled" component="span">
                  +{bookmark.tags.length - 4}
                </Typography>
              )}
            </Stack>
          }
        />
      </ListItem>
    );
  };

  return (
    <Stack spacing={2} sx={{ p: 3, maxWidth: 1100, mx: "auto" }}>
      <Typography variant="h4">Better Bookmarks</Typography>
      <Typography variant="body2" color="text.secondary">
        {loading ? "loading…" : `${bookmarks.length} bookmarks total, ${displayed.length} showing`}
      </Typography>

      <SearchBar
        query={query}
        setQuery={setQuery}
        resultCount={displayed.length}
        parseError={parseError}
      />

      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
        <Button variant="outlined" startIcon={<UploadIcon />} onClick={handleUpload}>
          Import from Chrome
        </Button>
        <Button variant="outlined" onClick={exportBookmarks}>
          Export JSON
        </Button>
        {importStatus && (
          <Typography variant="caption" color="text.secondary">
            {importStatus}
          </Typography>
        )}
      </Stack>

      {/* biome-ignore lint/a11y/useAnchorContent: download anchor wired dynamically */}
      <a
        style={{ display: "none" }}
        download="bookmarks.json"
        href="about:blank"
        ref={downloadLink}
      ></a>

      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
        <FixedSizeList
          height={Math.min(700, Math.max(300, window.innerHeight - 280))}
          width="100%"
          itemSize={72}
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

ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <Overview />
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById("root"),
);
