import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Box,
  Chip,
  Fab,
  Link,
  MenuItem,
  Rating,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { theme } from "./components/MaterialTheme";
import Tags from "./components/Tags";
import { canonicalize } from "./core/canonicalizer";
import { detectContentType, suggestTags } from "./core/enrichment";
import { migrateLegacyStore } from "./core/migration/legacyToV1";
import { wireSearchIndexer } from "./core/search";
import {
  deleteBookmark as deleteBookmarkRecord,
  getBookmarkByRawUrl,
  listBookmarks,
  upsertBookmark,
} from "./core/storage/bookmarks";
import { getSettings } from "./core/storage/settings";
import type { Bookmark, ContentType, ReadStatus } from "./shared/types";
import { DEFAULT_SETTINGS } from "./shared/types";

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

const STATUS_OPTIONS: ReadonlyArray<ReadStatus> = ["unread", "reading", "read", "archived"];
const CONTENT_TYPE_OPTIONS: ReadonlyArray<ContentType> = [
  "unknown",
  "article",
  "paper",
  "video",
  "podcast",
  "tool",
  "library",
  "repo",
  "book",
  "thread",
  "course",
  "reference",
];

const Popup = () => {
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab>();
  const [rating, setRating] = useState<number>(DEFAULT_SETTINGS.defaultRating);
  const [title, setTitle] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [necessaryTime, setNecessaryTime] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [contentType, setContentType] = useState<ContentType>("unknown");
  const [status, setStatus] = useState<ReadStatus>(DEFAULT_SETTINGS.defaultStatus);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [allBookmarks, setAllBookmarks] = useState<Bookmark[]>([]);
  const [knownTagNames, setKnownTagNames] = useState<string[]>([]);

  useEffect(() => {
    async function init() {
      try {
        await migrateLegacyStore();
      } catch (err) {
        console.error("legacy migration failed", err);
      }
      const [tab, settings, bookmarks] = await Promise.all([
        getCurrentTab(),
        getSettings(),
        listBookmarks(),
      ]);
      setCurrentTab(tab);
      setAllBookmarks(bookmarks);

      const tagSet = new Set<string>();
      for (const b of bookmarks) for (const t of b.tags) tagSet.add(t);
      setKnownTagNames(Array.from(tagSet).sort());

      if (!tab?.url) return;
      const existing = await getBookmarkByRawUrl(tab.url);
      if (existing) {
        setExistingId(existing.id);
        setTitle(existing.title || existing.description || tab.title || "");
        setRating(existing.rating ?? settings.defaultRating);
        setNecessaryTime(existing.necessaryTime);
        setNote(existing.note);
        setTags(existing.tags);
        setContentType(existing.contentType);
        setStatus(existing.status);
      } else {
        setTitle(tab.title ?? "");
        setRating(settings.defaultRating);
        setNecessaryTime(settings.defaultNecessaryTime || null);
        setStatus(settings.defaultStatus);
        const c = canonicalize(tab.url);
        if (c.ok) {
          setContentType(detectContentType(c.canonical));
        }
      }
    }
    init();
  }, []);

  const suggestions = useMemo(() => {
    if (!currentTab?.url) return [];
    const c = canonicalize(currentTab.url);
    if (!c.ok) return [];
    return suggestTags(c.canonical, allBookmarks, {
      excludeAlreadySelected: tags,
      limit: 6,
    });
  }, [currentTab, allBookmarks, tags]);

  const acceptSuggestion = (tag: string) => {
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    setTags([...tags, tag]);
  };

  const saveBookmark = useCallback(async () => {
    if (!currentTab?.url) return;
    const c = canonicalize(currentTab.url);
    if (!c.ok) return;
    const result = await upsertBookmark({
      rawUrl: currentTab.url,
      title,
      description: title,
      note,
      rating,
      necessaryTime,
      tags,
      contentType,
      status,
      capturedFrom: "popup",
    });
    if (result.ok) {
      setExistingId(result.bookmark.id);
      chrome.action.setIcon({ path: ADDED_ICON });
    }
  }, [currentTab, title, note, rating, necessaryTime, tags, contentType, status]);

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

  const handleKeyDown = (ev: React.KeyboardEvent) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
      ev.preventDefault();
      saveAndExit();
    }
  };

  return (
    <Stack spacing={2} sx={{ width: 360, p: 1.5 }} onKeyDown={handleKeyDown}>
      <TextField
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        size="small"
      />

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          Rating
        </Typography>
        <Rating
          max={10}
          value={rating}
          onChange={(_, v) => {
            if (v !== null) setRating(v);
          }}
        />
      </Stack>

      <Tags setTags={setTags} tags={tags} possibleOptions={knownTagNames} />

      {suggestions.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            <AutoAwesomeIcon fontSize="inherit" sx={{ verticalAlign: "middle", mr: 0.5 }} />
            suggested
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {suggestions.map((s) => (
              <Chip
                key={s.tag}
                label={s.tag}
                size="small"
                variant="outlined"
                onClick={() => acceptSuggestion(s.tag)}
                clickable
              />
            ))}
          </Stack>
        </Box>
      )}

      <Stack direction="row" spacing={1}>
        <TextField
          select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ReadStatus)}
          size="small"
          sx={{ flex: 1 }}
        >
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Type"
          value={contentType}
          onChange={(e) => setContentType(e.target.value as ContentType)}
          size="small"
          sx={{ flex: 1 }}
        >
          {CONTENT_TYPE_OPTIONS.map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <TextField
        label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        size="small"
        multiline
        minRows={2}
        placeholder="Why this bookmark? Private to you."
      />

      <Stack direction="row" spacing={2} justifyContent="flex-end" alignItems="center">
        <Typography variant="caption" color="text.disabled">
          ⌘/Ctrl+Enter to save
        </Typography>
        <Fab variant="extended" size="small" color="primary" aria-label="add" onClick={saveAndExit}>
          <BookmarkAddIcon sx={{ mr: 1 }} />
          Save
        </Fab>
        <Fab
          variant="circular"
          size="small"
          color="secondary"
          aria-label="delete"
          onClick={deleteBookmark}
          disabled={!existingId}
        >
          <DeleteIcon />
        </Fab>
      </Stack>

      <Link href="/overview.html" target="_blank" rel="noopener" variant="caption">
        Bookmark Overview →
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
