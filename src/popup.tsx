import { Fab, Rating, Stack, TextField } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import React, { useEffect, useState } from "react";
import Tags, { FilmOptionType } from "./Tags";
import ReactDOM from "react-dom";
import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";

async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  console.log(tab.url);
  console.log(tab.title);
  return tab;
}

export type Bookmark = {
  url: string;
  description: string;
  rating: number;
  necessaryTime: number;
  timestamp: number;
  tags: FilmOptionType[];
};

const Popup = () => {
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab>();
  const [rating, setRating] = useState<number>(0);
  const [description, setDescription] = useState<string>("");
  const [necessaryTime, setNecessaryTime] = useState<number>(0);
  const [tags, setTags] = useState<FilmOptionType[]>([]);

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
      // setTags(bookmark.tags);
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
    console.log(bookmark);

    // chrome.runtime.sendMessage(bookmark);
    await chrome.storage.local.set({ [bookmark.url]: bookmark });

    // window.close();
  };

  return (
    <Stack spacing={2}>
      <TextField
        label="Title"
        value={description}
        onChange={changeDescription}
      />
      {/* <LocalizationProvider dateAdapter={AdapterDayjs}>
        <TimePicker
          ampm={false}
          views={["hours", "minutes"]}
          inputFormat="HH:mm"
          mask="__:__"
          label="Hours and Minutes"
          value={necessaryTime}
          onChange={(next) => {
            if (!next) return;
            setNecessaryTime(next);
          }}
          renderInput={(params) => <TextField {...params} />}
        />
      </LocalizationProvider> */}
      <Rating
        name="customized-10"
        defaultValue={5}
        max={10}
        onChange={(_, newValue) => {
          if (!newValue) return;
          setRating(newValue);
        }}
      />

      <Tags tags={tags} setTags={setTags} />
      {/* <button onClick={saveBookmark}>Bookmark</button> */}
      <Fab
        variant="extended"
        size="small"
        color="primary"
        aria-label="add"
        onClick={saveBookmark}
      >
        <BookmarkAddIcon sx={{ mr: 1 }} />
        Bookmark
      </Fab>
      <a href="/overview.html" target="_blank" rel="noopener">
        {chrome.runtime.id}
      </a>
    </Stack>
  );
};

ReactDOM.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
  document.getElementById("root")
);
