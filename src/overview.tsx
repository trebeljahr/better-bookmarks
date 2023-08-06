import ClearIcon from "@mui/icons-material/Clear";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import StarIcon from "@mui/icons-material/Star";
import UploadIcon from "@mui/icons-material/Upload";
import {
  Button,
  Fab,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Rating,
  Stack,
  TextField,
  ThemeProvider,
} from "@mui/material";
import Avatar from "@mui/material/Avatar";
import React, { useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { FixedSizeList, ListChildComponentProps } from "react-window";
import { EditBookmark } from "./components/EditBookmark";
import { theme } from "./components/MaterialTheme";
import Tags from "./components/Tags";
import { Bookmark, useBookmarks } from "./hooks/useBookmarks";

type BookmarksById = Record<string, chrome.bookmarks.BookmarkTreeNode>;

function recursivelyFlattenBookmarks(
  bookmarkItem: chrome.bookmarks.BookmarkTreeNode
) {
  const bookmarksById: BookmarksById = {};

  function recurse(bookmarkItem: chrome.bookmarks.BookmarkTreeNode) {
    bookmarksById[bookmarkItem.id] = bookmarkItem;
    bookmarkItem.children?.forEach((child) => {
      recurse(child);
    });
  }

  recurse(bookmarkItem);

  return bookmarksById;
}

const utmParams = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

async function logTree(bookmarkItem: chrome.bookmarks.BookmarkTreeNode) {
  const bookmarks = recursivelyFlattenBookmarks(bookmarkItem);

  function createTags(singleItem: chrome.bookmarks.BookmarkTreeNode) {
    const tags = [];
    if (singleItem.parentId) {
      let currentBookmark = bookmarks[singleItem.parentId];
      while (
        currentBookmark.title !== "Bookmarks Bar" &&
        currentBookmark.parentId
      ) {
        tags.push(currentBookmark.title);
        currentBookmark = bookmarks[currentBookmark.parentId];
      }
    }

    return tags;
  }

  const withTags = Object.values(bookmarks).map((bookmark) => {
    return {
      ...bookmark,
      tags: createTags(bookmark),
    };
  });

  const withRefinedUrls: Record<string, Bookmark> = withTags
    .filter((bookmark) => bookmark.url)
    .map((bookmark) => {
      return {
        title: bookmark.title,
        tags: bookmark.tags,
        url: refineUrls(
          bookmark as chrome.bookmarks.BookmarkTreeNode & { url: string }
        ),
        description: bookmark.title,
        rating: 5,
        necessaryTime: 10,
        timestamp: bookmark.dateAdded || Date.now(),
      };
    })
    .reduce((agg, bookmark) => {
      return {
        ...agg,
        [bookmark.url]: bookmark,
      };
    }, {});

  console.log(withRefinedUrls);

  await chrome.storage.local.set(withRefinedUrls);

  function refineUrls(
    bookmark: chrome.bookmarks.BookmarkTreeNode & { url: string }
  ) {
    const url = new URL(bookmark.url);
    utmParams.forEach((param) => url.searchParams.delete(param));
    return url.toString();
  }
}

function getTagsFromBookmarks(bookmarks: Record<string, Bookmark>) {
  const allTags = Object.values(bookmarks).flatMap((bookmark) => bookmark.tags);
  const dedupedTags = [...new Set(allTags)];

  return dedupedTags;
}

const Overview = () => {
  const { bookmarks } = useBookmarks();
  const [tags, setTags] = useState<string[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [useFilterRating, setUseFilterRating] = useState<boolean>(false);

  const [editing, setEditing] = useState<Bookmark | null>(null);

  const toggleEditing = async (key: string) => {
    if (key === editing?.url) {
      await chrome.storage.local.set({ [key]: editing });
      setEditing(null);
      return;
    }

    setEditing(bookmarks[key]);
  };

  const tagsFromBookmarks = useMemo(
    () => getTagsFromBookmarks(bookmarks),
    [bookmarks]
  );

  async function handleEditing(newValue: Bookmark) {
    const key = newValue?.url;
    if (key) {
      await chrome.storage.local.set({ [key]: newValue });
    }
    setEditing(newValue);
  }

  const downloadLink = useRef<HTMLAnchorElement>(null);

  async function exportBookmarks() {
    const result = await chrome.storage.local.get(null);
    const json = JSON.stringify(result);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    if (!downloadLink.current) return;
    downloadLink.current.href = url;
    downloadLink.current.click();
  }

  const deleteBookmark = async (key: string) => {
    await chrome.storage.local.remove(key);
  };

  const handleUpload = async () => {
    let bookmarksTree = await chrome.bookmarks.getTree();
    logTree(bookmarksTree[0]);
  };

  const filteredBookmarks = Object.keys(bookmarks)
    .filter((key) => {
      const bookmark = bookmarks[key];
      if (!bookmark) return false;

      const tagsMatch =
        tags.length === 0 || tags.every((tag) => bookmark?.tags.includes(tag));

      const ratingMatches =
        !useFilterRating || !rating || bookmark?.rating === rating;
      const descriptionMatches =
        !description || bookmark?.description.includes(description);
      const urlMatches = !url || bookmark?.url.includes(url);

      const isEditing = editing?.url === key;

      const filtersMatch =
        tagsMatch && ratingMatches && descriptionMatches && urlMatches;

      if (isEditing || filtersMatch) {
        return true;
      }

      return false;
    })
    .map((key) => bookmarks[key]);

  console.log(filteredBookmarks.length);

  const renderRow = (props: ListChildComponentProps) => {
    const { index, style } = props;
    const bookmark = filteredBookmarks[index];
    if (!bookmark) return null;

    return (
      <ListItem style={style} key={index} component="div" disablePadding>
        <Stack spacing={2}>
          <Stack direction="row">
            <ListItemAvatar>
              <Avatar>
                <StarIcon />
              </Avatar>
            </ListItemAvatar>
            <ListItemText primary={bookmark.description} />
            {editing?.url !== bookmark.url && (
              <IconButton
                edge="end"
                aria-label="delete"
                onClick={() => toggleEditing(bookmark.url)}
              >
                <EditIcon />
              </IconButton>
            )}

            <Fab
              variant="circular"
              size="small"
              color="secondary"
              aria-label="delete"
              onClick={() => deleteBookmark(bookmark.url)}
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
      <Button onClick={handleUpload}>
        <UploadIcon />
      </Button>
      <a
        style={{ display: "none" }}
        download="bookmarks.json"
        href="#"
        ref={downloadLink}
      ></a>

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

      <TextField
        label="URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />

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
        itemSize={46}
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
  document.getElementById("root")
);
