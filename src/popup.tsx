import {
  Fab,
  Link,
  Rating,
  Stack,
  TextField,
  ThemeProvider,
} from "@mui/material";
import React, { useEffect, useState } from "react";
import Tags from "./Tags";
import ReactDOM from "react-dom";
import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";
import DeleteIcon from "@mui/icons-material/Delete";
import { theme } from "./MaterialTheme";

async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

export type Bookmark = {
  url: string;
  description: string;
  rating: number;
  necessaryTime: number;
  timestamp: number;
  tags: string[];
};

const Popup = () => {
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab>();
  const [rating, setRating] = useState<number>(0);
  const [description, setDescription] = useState<string>("");
  const [necessaryTime, setNecessaryTime] = useState<number>(0);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    async function syncTab() {
      const tab = await getCurrentTab();
      setCurrentTab(tab);
    }
    syncTab();
  }, []);

  useEffect(() => {
    async function syncStorage() {
      if (!currentTab) return;

      setDescription(currentTab.title || "");

      if (!currentTab.url) return;

      const result = await chrome.storage.local.get(currentTab.url);
      const bookmark = result[currentTab.url] as Bookmark;

      if (!bookmark) return;

      setRating(bookmark.rating);
      setNecessaryTime(bookmark.necessaryTime);
      setTags(bookmark?.tags);
    }

    syncStorage();
  }, [currentTab]);

  const changeDescription = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDescription(event.target.value);
  };

  const saveBookmark = async () => {
    const bookmark: Bookmark = {
      url: currentTab?.url || "",
      description,
      rating,
      necessaryTime,
      timestamp: Date.now(),
      tags,
    };
    await chrome.storage.local.set({ [bookmark.url]: bookmark });

    const alreadyAddedIcon = {
      "16": "/full16.png",
      "32": "/full32.png",
      "48": "/full48.png",
      "128": "/full128.png",
    };

    chrome.action.setIcon({ path: alreadyAddedIcon });

    // window.close();
  };

  const deleteBookmark = async () => {
    if (!currentTab?.url) return;

    await chrome.storage.local.remove(currentTab.url);

    const alreadyAddedIcon = {
      "16": "/empty16.png",
      "32": "/empty32.png",
      "48": "/empty48.png",
      "128": "/empty128.png",
    };

    chrome.action.setIcon({ path: alreadyAddedIcon });
  };

  return (
    <Stack spacing={2}>
      <TextField
        label="Title"
        value={description}
        onChange={changeDescription}
      />

      <Rating
        name="customized-10"
        defaultValue={5}
        max={10}
        onChange={(_, newValue) => {
          if (!newValue) return;
          setRating(newValue);
        }}
      />

      <Tags setTags={setTags} tags={tags} />
      {/* <button onClick={saveBookmark}>Bookmark</button> */}

      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Fab
          variant="extended"
          size="small"
          color="primary"
          aria-label="add"
          onClick={saveBookmark}
        >
          <BookmarkAddIcon sx={{ mr: 1 }} />
          Save Bookmark
        </Fab>
        <Fab
          variant="circular"
          size="small"
          color="secondary"
          aria-label="delete"
          onClick={deleteBookmark}
        >
          <DeleteIcon />
        </Fab>
      </Stack>

      <Link href="/overview.html" target="_blank" rel="noopener">
        Bookmark Overview
      </Link>
    </Stack>
  );
};

ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <Popup />
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
