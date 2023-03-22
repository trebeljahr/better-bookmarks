import ClearIcon from "@mui/icons-material/Clear";
import EditIcon from "@mui/icons-material/Edit";
import StarIcon from "@mui/icons-material/Star";
import {
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
import DeleteIcon from "@mui/icons-material/Delete";
import Avatar from "@mui/material/Avatar";
import React, { useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { EditBookmark } from "./components/EditBookmark";
import { Bookmark, useBookmarks } from "./hooks/useBookmarks";
import { theme } from "./components/MaterialTheme";
import Tags from "./components/Tags";

function getTagsFromBookmarks(bookmarks: Record<string, Bookmark>) {
  const allTags = Object.values(bookmarks).reduce((acc, bookmark) => {
    if (!bookmark?.tags) return acc;

    return [...acc, ...bookmark.tags];
  }, [] as string[]);

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

  const tagsFromBookmarks = useMemo(() => {
    return getTagsFromBookmarks(bookmarks);
  }, [bookmarks]);

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

  return (
    <Stack spacing={2}>
      <h1>All the Bookmarks</h1>
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
      <List dense={false}>
        {Object.keys(bookmarks)
          .filter((key) => {
            const bookmark = bookmarks[key];
            const tagsMatch =
              tags.length === 0 ||
              tags.every((tag) => bookmark?.tags.includes(tag));

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
          .map((key) => {
            const bookmark = bookmarks[key];
            if (!bookmark) return null;
            return (
              <ListItem key={key}>
                <Stack spacing={2}>
                  <Stack direction="row">
                    <ListItemAvatar>
                      <Avatar>
                        <StarIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={bookmark.description} />
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => toggleEditing(key)}
                    >
                      {editing?.url === key ? <ClearIcon /> : <EditIcon />}
                    </IconButton>

                    <Fab
                      variant="circular"
                      size="small"
                      color="secondary"
                      aria-label="delete"
                      onClick={() => deleteBookmark(key)}
                    >
                      <DeleteIcon />
                    </Fab>
                  </Stack>

                  {editing && editing?.url === key && (
                    <EditBookmark
                      value={editing}
                      setValue={handleEditing}
                      possibleTags={tagsFromBookmarks}
                    />
                  )}
                </Stack>
              </ListItem>
            );
          })}
      </List>
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
