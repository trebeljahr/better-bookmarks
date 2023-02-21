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
} from "@mui/material";
import Avatar from "@mui/material/Avatar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { EditBookmark } from "./EditBookmark";
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

        console.log({ changes });

        setBookmarks((oldState) => {
          const newState = Object.keys(changes).reduce(
            (acc, key) => {
              console.log({ acc });
              const newBookmark = changes[key].newValue as Bookmark;
              return { ...acc, [key]: newBookmark };
            },
            { ...oldState }
          );

          console.log({ newState });
          return newState;
        });

        // if (!changes.bookmarks) return;
        // setBookmarks(changes.bookmarks as Record<string, Bookmark>);
      });
    }

    getBookmarks();
  }, []);

  return { bookmarks };
};

function getTagsFromBookmarks(bookmarks: Record<string, Bookmark>) {
  const allTags = Object.values(bookmarks).reduce((acc, bookmark) => {
    return [...acc, ...bookmark.tags];
  }, [] as string[]);

  console.log(allTags);

  const dedupedTags = [...new Set(allTags)];
  return dedupedTags;
}

const Overview = () => {
  const { bookmarks } = useBookmarks();
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    console.log(bookmarks);
  }, [bookmarks]);

  const [editing, setEditing] = useState<Bookmark | null>(null);

  const toggleEditing = async (key: string) => {
    if (key === editing?.url) {
      console.log(editing);
      await chrome.storage.local.set({ [key]: editing });
      setEditing(null);
      return;
    }

    setEditing(bookmarks[key]);
  };

  const tagsFromBookmarks = useMemo(() => {
    return getTagsFromBookmarks(bookmarks);
  }, [bookmarks]);

  useEffect(() => {
    console.log({ tags });
  }, [tags]);

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
    console.log(url);

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
            const hasAllTags = tags.every((tag) => bookmark.tags.includes(tag));
            console.log({ hasAllTags });
            return hasAllTags;
          })
          .map((key) => {
            const bookmark = bookmarks[key];
            return (
              <ListItem
                key={key}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => toggleEditing(key)}
                  >
                    {editing?.url === key ? <ClearIcon /> : <EditIcon />}
                  </IconButton>
                }
              >
                <ListItemAvatar>
                  <Avatar>
                    <StarIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={bookmark.description} />
                {editing && editing?.url === key && (
                  <EditBookmark
                    value={editing}
                    setValue={handleEditing}
                    possibleTags={tagsFromBookmarks}
                  />
                )}
              </ListItem>
            );
          })}
      </List>
    </Stack>
  );
};

ReactDOM.render(
  <React.StrictMode>
    <Overview />
  </React.StrictMode>,
  document.getElementById("root")
);
