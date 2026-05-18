import { BookmarkPlus, Sparkles, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Tags from "@/components/Tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Rating } from "@/components/ui/rating";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { canonicalize } from "@/core/canonicalizer";
import { detectContentType, suggestTags } from "@/core/enrichment";
import { migrateLegacyStore } from "@/core/migration/legacyToV1";
import { wireSearchIndexer } from "@/core/search";
import {
  deleteBookmark as deleteBookmarkRecord,
  getBookmarkByRawUrl,
  listBookmarks,
  upsertBookmark,
} from "@/core/storage/bookmarks";
import { getSettings } from "@/core/storage/settings";
import type { Bookmark, ContentType, ReadStatus } from "@/shared/types";
import { DEFAULT_SETTINGS } from "@/shared/types";

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

export const Popup = () => {
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
    <div className="flex w-[360px] flex-col gap-3 p-3" onKeyDown={handleKeyDown}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bb-popup-title">Title</Label>
        <Input
          id="bb-popup-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Rating</Label>
        <Rating max={10} value={rating} onChange={setRating} size="md" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Tags</Label>
        <Tags setTags={setTags} tags={tags} possibleOptions={knownTagNames} />
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="size-3" /> suggested
          </p>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <Badge
                key={s.tag}
                variant="outline"
                role="button"
                tabIndex={0}
                onClick={() => acceptSuggestion(s.tag)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    acceptSuggestion(s.tag);
                  }
                }}
                className="cursor-pointer hover:bg-accent"
              >
                {s.tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ReadStatus)}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bb-popup-note" className="text-xs text-muted-foreground">
          Note
        </Label>
        <Textarea
          id="bb-popup-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Why this bookmark? Private to you."
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <span className="text-[10px] text-muted-foreground/70">⌘/Ctrl+Enter to save</span>
        <Button size="sm" onClick={saveAndExit}>
          <BookmarkPlus /> Save
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="delete"
          onClick={deleteBookmark}
          disabled={!existingId}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </div>

      <a
        href="/overview.html"
        target="_blank"
        rel="noopener"
        className="text-xs text-primary underline-offset-4 hover:underline"
      >
        Bookmark Overview →
      </a>
    </div>
  );
};
