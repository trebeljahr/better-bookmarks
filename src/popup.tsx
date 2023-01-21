import { Rating, TextField } from "@mui/material";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  console.log(tab.url);
  console.log(tab.title);
  return tab;
}

const Popup = () => {
  const [currentURL, setCurrentURL] = useState<string>();
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab>();
  const [rating, setRating] = useState<number>(0);
  const [description, setDescription] = useState<string>("");
  const [necessaryTime, setNecessaryTime] = useState<number>(0);

  useEffect(() => {
    async function syncTab() {
      const tab = await getCurrentTab();
      setCurrentTab(tab);
    }
    syncTab();
  }, []);

  useEffect(() => {
    if (!currentTab) return;

    setDescription(currentTab.title || "");
  }, [currentTab]);

  const changeDescription = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDescription(event.target.value);
  };

  return (
    <>
      <TextField
        label="Title"
        value={description}
        onChange={changeDescription}
      />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <TimePicker
          ampm={false}
          views={["hours", "minutes"]}
          inputFormat="hh:mm"
          mask="__:__"
          label="Hours and Minutes"
          value={necessaryTime}
          onChange={(next) => {
            if (!next) return;
            console.log("next", next);
            setNecessaryTime(next);
          }}
          renderInput={(params) => <TextField {...params} />}
        />
      </LocalizationProvider>
      <Rating
        name="customized-10"
        defaultValue={5}
        max={10}
        onChange={(_, newValue) => {
          if (!newValue) return;
          setRating(newValue);
        }}
      />

      <button onClick={getCurrentTab}>Bookmark</button>
    </>
  );
};

ReactDOM.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
  document.getElementById("root")
);
