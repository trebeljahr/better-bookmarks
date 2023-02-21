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
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { Bookmark } from "./popup";
import Tags, { TagAutocompleteType } from "./Tags";
import ClearIcon from "@mui/icons-material/Clear";

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

  return (
    <>
      <h1>All the Bookmarks</h1>
      <Tags setTags={setTags} tags={tags} />
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
      {editing && <EditBookmark value={editing} setValue={handleEditing} />}
    </>
  );
};

// function useChromeStorage<T>() {
//   const [value, setValue] = useState<T | null>("bookmarks");

//   useEffect(() => {
//     async function getStorage() {
//       const result = await chrome.storage.local.get("bookmarks");
//       setValue(result as T);
//     }

//     getStorage();
//   }, []);

//   async function setStorage(next: T) {
//     await chrome.storage.local.set({ [key]: next });
//     setValue(next);
//   }

//   return [value, setStorage] as [T | null, (next: T) => void];
// }

function EditBookmark({
  value,
  setValue,
}: {
  value: Bookmark;
  setValue: (value: Bookmark) => void;
}) {
  // console.log(url);
  // const [value, setValue] = useState<Bookmark>({});

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
          console.log(newTags);
          setValue({ ...value, tags: newTags as string[] });
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
