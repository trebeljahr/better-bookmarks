import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { Bookmark } from "./popup";
import TreeView from "@mui/lab/TreeView";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";
import TreeItem from "@mui/lab/TreeItem";

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

  return (
    <>
      <h1>All the Bookmarks</h1>
      <TreeView
        aria-label="gmail"
        defaultExpanded={["3"]}
        defaultCollapseIcon={<ArrowDropDownIcon />}
        defaultExpandIcon={<ArrowRightIcon />}
        defaultEndIcon={<div style={{ width: 24 }} />}
        sx={{ height: 264, flexGrow: 1, maxWidth: 400, overflowY: "auto" }}
      >
        {Object.keys(bookmarks).map((key) => {
          const bookmark = bookmarks[key];
          return (
            <TreeItem key={key} nodeId={key} label={bookmark.description} />
          );
        })}
      </TreeView>
    </>
  );
};

ReactDOM.render(
  <React.StrictMode>
    <Overview />
  </React.StrictMode>,
  document.getElementById("root")
);
