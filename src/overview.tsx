import EditIcon from "@mui/icons-material/Edit";
import StarIcon from "@mui/icons-material/Star";
import {
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Rating,
  Stack,
  TextField,
} from "@mui/material";
import Avatar from "@mui/material/Avatar";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { Bookmark } from "./popup";
import Tags, { TagType } from "./Tags";
import ClearIcon from "@mui/icons-material/Clear";
import { useChromeStorageLocal } from "use-chrome-storage";

const Overview = () => {
  const [bookmarks, setBookmarks] = useState<Record<string, Bookmark>>({});

  useEffect(() => {
    async function getBookmarks() {
      const fetchedBookmarks = await chrome.storage.local.get(null);
      setBookmarks(fetchedBookmarks);
    }

    getBookmarks();
  }, []);

  useEffect(() => {
    console.log(bookmarks);
  }, [bookmarks]);

  const [editing, setEditing] = useState<Bookmark | null>(null);

  const toggleEditing = (key: string) => {
    if (key === editing?.url) {
      setEditing(null);
    }

    setEditing(bookmarks[key]);
  };

  return (
    <>
      <h1>All the Bookmarks</h1>
      <List dense={false}>
        {Object.keys(bookmarks).map((key) => {
          const bookmark = bookmarks[key];
          return (
            <ListItem
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
            </ListItem>
          );
        })}
      </List>
      {editing && <EditBookmark url={editing.url} />}
    </>
  );
};

function EditBookmark({ url }: { url: string }) {
  const [value, setValue, isPersistent, error] = useChromeStorageLocal(url) as [
    Bookmark,
    (next: Bookmark) => void,
    boolean,
    string
  ];

  console.log(value);

  if (!value) return null;

  return (
    <Stack spacing={2}>
      <TextField
        label="Title"
        value={value.description}
        onChange={(ev) => {
          setValue({ ...value, description: ev.target.value });
        }}
      />
      <Rating
        name="customized-10"
        max={10}
        value={value.rating}
        onChange={(_, newValue) => {
          if (!newValue) return;
          setValue({ ...value, rating: newValue });
        }}
      />
      <Tags
        tags={value.tags}
        setTags={(newTags) => {
          setValue({ ...value, tags: newTags as TagType[] });
        }}
      />
    </Stack>
  );
}

ReactDOM.render(
  <React.StrictMode>
    <Overview />
  </React.StrictMode>,
  document.getElementById("root")
);
