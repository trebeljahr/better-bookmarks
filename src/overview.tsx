import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import StarIcon from "@mui/icons-material/Star";
import UploadIcon from "@mui/icons-material/Upload";
import {
  Button,
  Fab,
  IconButton,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Rating,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
} from "@mui/material";
import Avatar from "@mui/material/Avatar";
import React, { useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { EditBookmark } from "./components/EditBookmark";
import { theme } from "./components/MaterialTheme";
import Tags from "./components/Tags";
import { canonicalize } from "./core/canonicalizer";
import {
  deleteBookmark as deleteBookmarkRecord,
  listBookmarks,
  updateBookmark,
  upsertBookmark,
} from "./core/storage/bookmarks";
import { type Bookmark, useBookmarks } from "./hooks/useBookmarks";

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
  const [tags, setTags] = useState<string[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [useFilterRating, setUseFilterRating] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<string>("");
  const [editing, setEditing] = useState<Bookmark | null>(null);

  const toggleEditing = async (id: string) => {
    if (id === editing?.id) {
      await updateBookmark(editing.id, {
        title: editing.title,
        description: editing.description,
        rating: editing.rating,
        tags: editing.tags,
      });
      setEditing(null);
      return;
    }
    setEditing(bookmarks.find((b) => b.id === id) ?? null);
  };

  const tagsFromBookmarks = useMemo(() => getTagsFromBookmarks(bookmarks), [bookmarks]);

  async function handleEditing(newValue: Bookmark) {
    if (newValue?.id) {
      await updateBookmark(newValue.id, {
        title: newValue.title,
        description: newValue.description,
        rating: newValue.rating,
        tags: newValue.tags,
      });
    }
    setEditing(newValue);
  }

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

  const deleteBookmark = async (id: string) => {
    await deleteBookmarkRecord(id);
  };

  const handleUpload = async () => {
    setImportStatus("importing…");
    const tree = await chrome.bookmarks.getTree();
    const count = await importChromeTree(tree[0]);
    setImportStatus(`imported ${count} bookmarks`);
  };

  const filteredBookmarks = bookmarks.filter((bookmark) => {
    const tagsMatch = tags.length === 0 || tags.every((tag) => bookmark.tags.includes(tag));
    const ratingMatches = !useFilterRating || !rating || bookmark.rating === rating;
    const descriptionMatches =
      !description ||
      bookmark.title.toLowerCase().includes(description.toLowerCase()) ||
      bookmark.description.toLowerCase().includes(description.toLowerCase());
    const urlMatches = !url || bookmark.canonicalUrl.toLowerCase().includes(url.toLowerCase());
    const isEditing = editing?.id === bookmark.id;
    return isEditing || (tagsMatch && ratingMatches && descriptionMatches && urlMatches);
  });

  const renderRow = (props: ListChildComponentProps) => {
    const { index, style } = props;
    const bookmark = filteredBookmarks[index];
    if (!bookmark) return null;
    return (
      <ListItem style={style} key={bookmark.id} component="div" disablePadding>
        <Stack spacing={2}>
          <Stack direction="row">
            <ListItemAvatar>
              <Avatar>
                <StarIcon />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={bookmark.title || bookmark.description}
              secondary={bookmark.canonicalUrl}
            />
            {editing?.id !== bookmark.id && (
              <IconButton edge="end" aria-label="edit" onClick={() => toggleEditing(bookmark.id)}>
                <EditIcon />
              </IconButton>
            )}
            <Fab
              variant="circular"
              size="small"
              color="secondary"
              aria-label="delete"
              onClick={() => deleteBookmark(bookmark.id)}
            >
              <DeleteIcon />
            </Fab>
          </Stack>
        </Stack>
      </ListItem>
    );
  };

  return (
    <Stack spacing={2}>
      <h1>All the Bookmarks</h1>
      <Typography variant="body2">
        {loading
          ? "loading…"
          : `${bookmarks.length} bookmarks (filtered: ${filteredBookmarks.length})`}
      </Typography>
      {importStatus && <Typography variant="body2">{importStatus}</Typography>}
      <Button onClick={handleUpload}>
        <UploadIcon /> Import from Chrome
      </Button>
      {/* biome-ignore lint/a11y/useAnchorContent: anchor content provided dynamically */}
      <a style={{ display: "none" }} download="bookmarks.json" href="#" ref={downloadLink}></a>

      <Fab
        variant="extended"
        size="small"
        color="primary"
        aria-label="add"
        onClick={exportBookmarks}
      >
        Export as JSON
      </Fab>

      <TextField
        label="Title"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <TextField label="URL" value={url} onChange={(e) => setUrl(e.target.value)} />

      <Rating
        name="customized-10"
        value={rating}
        max={10}
        onChange={(_, newValue) => {
          if (newValue === null) {
            setUseFilterRating(false);
          }
          setUseFilterRating(true);
          setRating(newValue);
        }}
      />
      {useFilterRating && (
        <Fab
          variant="circular"
          size="small"
          color={"secondary"}
          aria-label="stop filtering by rating"
          onClick={() => {
            setUseFilterRating(false);
            setRating(null);
          }}
        >
          <DeleteIcon />
        </Fab>
      )}

      <Tags setTags={setTags} tags={tags} possibleOptions={tagsFromBookmarks} />

      {editing && (
        <EditBookmark
          value={editing}
          setValue={handleEditing}
          possibleTags={tagsFromBookmarks}
          toggleEditing={toggleEditing}
        />
      )}

      <FixedSizeList
        height={400}
        width={window.innerWidth}
        itemSize={70}
        itemCount={filteredBookmarks.length}
        overscanCount={5}
      >
        {renderRow}
      </FixedSizeList>
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
