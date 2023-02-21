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
  Stack,
  ThemeProvider,
} from "@mui/material";
import Avatar from "@mui/material/Avatar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { EditBookmark } from "./EditBookmark";
import { theme } from "./MaterialTheme";
import { Bookmark } from "./popup";
import Tags from "./Tags";

export const useBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<Record<string, Bookmark>>({});

  useEffect(() => {
    async function getBookmarks() {
      const fetchedBookmarks = await chrome.storage.local.get(null);
      setBookmarks(fetchedBookmarks);

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;

        setBookmarks((oldState) => {
          const newState = Object.keys(changes).reduce(
            (acc, key) => {
              const newBookmark = changes[key].newValue as Bookmark;
              return { ...acc, [key]: newBookmark };
            },
            { ...oldState }
          );

          return newState;
        });
      });
    }

    getBookmarks();
  }, []);

  return { bookmarks };
};

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
      <Tags setTags={setTags} tags={tags} possibleOptions={tagsFromBookmarks} />
      <List dense={false}>
        {Object.keys(bookmarks)
          .filter((key) => {
            const bookmark = bookmarks[key];
            if (tags.length === 0) return true;
            return tags.every((tag) => bookmark?.tags.includes(tag));
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
