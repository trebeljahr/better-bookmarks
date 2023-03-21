import { useEffect, useState } from "react";

export type Bookmark = {
  url: string;
  description: string;
  rating: number;
  necessaryTime: number;
  timestamp: number;
  tags: string[];
};

export const useBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<Record<string, Bookmark>>({});

  useEffect(() => {
    async function getBookmarks() {
      const fetchedBookmarks = await chrome.storage.local.get(null);
      setBookmarks(fetchedBookmarks);

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;

        setBookmarks((oldState) => {
          const newState = Object.keys(changes).reduce(
            (acc, key) => {
              const newBookmark = changes[key].newValue as Bookmark;
              return { ...acc, [key]: newBookmark };
            },
            { ...oldState }
          );

          return newState;
        });
      });
    }

    getBookmarks();
  }, []);

  return { bookmarks };
};
