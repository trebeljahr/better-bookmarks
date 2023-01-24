import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";

const Overview = () => {
  const [bookmarks, setBookmarks] = useState({});

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

  return (
    <>
      <h1>All the Bookmarks</h1>
    </>
  );
};

ReactDOM.render(
  <React.StrictMode>
    <Overview />
  </React.StrictMode>,
  document.getElementById("root")
);
