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
          const oldStateCopy = JSON.parse(JSON.stringify(oldState));
          console.log(Object.keys(oldStateCopy).length);

          Object.entries(changes).forEach(([key, { newValue }]) => {
            console.log("key", key);
            console.log("newValue", newValue);

            oldStateCopy[key] = newValue;

            if (newValue === undefined) {
              delete oldStateCopy[key];
            }
          });

          console.log(Object.keys(oldStateCopy).length);
          return oldStateCopy;
        });
      });
    }

    getBookmarks();
  }, []);

  return { bookmarks };
};
