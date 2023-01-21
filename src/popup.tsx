import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";

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

  const changeTime = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNecessaryTime(Number(event.target.value));
  };

  const changeDescription = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDescription(event.target.value);
  };

  const changeRating = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRating(Number(event.target.value));
  };

  return (
    <>
      <input type="number" onChange={changeRating} value={rating} />
      <input type="text" onChange={changeDescription} value={description} />
      <input type="number" onChange={changeTime} value={necessaryTime} />
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
