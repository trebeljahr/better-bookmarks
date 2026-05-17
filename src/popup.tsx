import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";
import DeleteIcon from "@mui/icons-material/Delete";
import { Fab, Link, Rating, Stack, TextField, ThemeProvider } from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { theme } from "./components/MaterialTheme";
import Tags from "./components/Tags";
import { canonicalize } from "./core/canonicalizer";
import { migrateLegacyStore } from "./core/migration/legacyToV1";
import { wireSearchIndexer } from "./core/search";
import {
  deleteBookmark as deleteBookmarkRecord,
  getBookmarkByRawUrl,
  upsertBookmark,
} from "./core/storage/bookmarks";

// Wire the search indexer to Dexie hooks in this popup context, so a save
// here populates postings immediately (popup may close before the service
// worker's hook fires for the same write).
wireSearchIndexer();

async function getCurrentTab() {
  const queryOptions = { active: true, lastFocusedWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

const NOT_ADDED_ICON = {
  "16": "/empty16.png",
  "32": "/empty32.png",
  "48": "/empty48.png",
  "128": "/empty128.png",
};

const ADDED_ICON = {
  "16": "/full16.png",
  "32": "/full32.png",
  "48": "/full48.png",
  "128": "/full128.png",
};

const Popup = () => {
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab>();
  const [rating, setRating] = useState<number>(5);
  const [description, setDescription] = useState<string>("");
  const [necessaryTime, setNecessaryTime] = useState<number>(0);
  const [tags, setTags] = useState<string[]>([]);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    async function syncTab() {
      try {
        await migrateLegacyStore();
      } catch (err) {
        console.error("legacy migration failed", err);
      }
      const tab = await getCurrentTab();
      setCurrentTab(tab);

      if (!tab?.url) return;
      const existing = await getBookmarkByRawUrl(tab.url);
      if (existing) {
        setExistingId(existing.id);
        setDescription(existing.title || existing.description || tab.title || "");
        setRating(existing.rating ?? 5);
        setNecessaryTime(existing.necessaryTime ?? 0);
        setTags(existing.tags);
      } else {
        setDescription(tab.title ?? "");
      }
    }
    syncTab();
  }, []);

  const changeDescription = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDescription(event.target.value);
  };

  const saveBookmark = useCallback(async () => {
    if (!currentTab?.url) return;
    const c = canonicalize(currentTab.url);
    if (!c.ok) return;
    const result = await upsertBookmark({
      rawUrl: currentTab.url,
      title: description,
      description,
      rating,
      necessaryTime,
      tags,
      capturedFrom: "popup",
    });
    if (result.ok) {
      setExistingId(result.bookmark.id);
      chrome.action.setIcon({ path: ADDED_ICON });
    }
  }, [currentTab, description, rating, necessaryTime, tags]);

  const deleteBookmark = async () => {
    if (!existingId) {
      window.close();
      return;
    }
    await deleteBookmarkRecord(existingId);
    setExistingId(null);
    chrome.action.setIcon({ path: NOT_ADDED_ICON }, window.close);
  };

  const saveAndExit = async () => {
    await saveBookmark();
    window.close();
  };

  return (
    <Stack spacing={2}>
      <TextField label="Title" value={description} onChange={changeDescription} />

      <Rating
        name="customized-10"
        value={rating}
        max={10}
        onChange={(_, newValue) => {
          if (!newValue) return;
          setRating(newValue);
        }}
      />

      <Tags setTags={setTags} tags={tags} />

      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Fab variant="extended" size="small" color="primary" aria-label="add" onClick={saveAndExit}>
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
  document.getElementById("root"),
);
