import {
  BookmarkPlus,
  Download,
  ExternalLink,
  Filter,
  HeartPulse,
  Keyboard,
  Pencil,
  Settings as SettingsIcon,
  Star,
  Tag as TagIcon,
  Trash2,
  Upload,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { BookmarkDetail } from "@/components/BookmarkDetail";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import {
  type ConflictResolutionInput,
  ConflictResolverModal,
} from "@/components/ConflictResolverModal";
import { type ActiveChip, FilterBar, type SortMode } from "@/components/FilterBar";
import { FolderTreeSidebar } from "@/components/FolderTreeSidebar";
import { ShortcutHelp } from "@/components/ShortcutHelp";
import { TagManager } from "@/components/TagManager";
import { TagTreeSidebar } from "@/components/TagTreeSidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { bulkAddTag, bulkDelete, bulkRemoveTag, bulkSetRating, bulkSetStatus } from "@/core/bulk";
import { loadSampleBookmarks } from "@/core/dev/sampleBookmarks";
import {
  exportJson,
  exportNetscape,
  importGoodreadsHtml,
  importJson,
  importPocketCsv,
  importRawUrlList,
} from "@/core/importExport";
import { ensureSearchIndexInitialized, wireSearchIndexer } from "@/core/search";
import { parseQuery } from "@/core/search/query";
import {
  deleteBookmark as deleteBookmarkRecord,
  updateBookmark,
  upsertBookmark,
} from "@/core/storage/bookmarks";
import {
  deleteTag,
  mergeTags,
  renameTag,
  setTagColor,
  setTagParent,
  upsertTag,
} from "@/core/storage/tags";
import { resolvePendingConflict } from "@/core/sync/resolvePendingConflict";
import { useBookmarkDragSource } from "@/hooks/useBookmarkDnd";
import { type Bookmark, useBookmarks } from "@/hooks/useBookmarks";
import { useFolders } from "@/hooks/useFolders";
import { usePendingConflicts } from "@/hooks/usePendingConflicts";
import { useSearch } from "@/hooks/useSearch";
import { useShortcutHelp } from "@/hooks/useShortcutHelp";
import { useTags } from "@/hooks/useTags";
import { readHashParams, writeHashParams } from "@/lib/hash";
import { cn } from "@/lib/utils";
import type { ReadStatus } from "@/shared/types";

wireSearchIndexer();
ensureSearchIndexInitialized().catch((err) =>
  console.error("ensureSearchIndexInitialized failed", err),
);

const FILTER_ONLY_LIMIT = 2000;

function getTagsFromBookmarks(bookmarks: Bookmark[]): string[] {
  const all = new Set<string>();
  for (const b of bookmarks) for (const t of b.tags) all.add(t);
  return Array.from(all).sort();
}

function detectFormat(file: File): "json" | "goodreads" | "pocket" | "raw-url" | "unknown" {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".csv")) return "pocket";
  if (name.endsWith(".html") || name.endsWith(".htm")) return "goodreads";
  if (name.endsWith(".txt") || name.endsWith(".urls")) return "raw-url";
  return "unknown";
}

function triggerDownload(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/** Tokenize a query string preserving the original spelling of each token. */
function tokenize(query: string): string[] {
  return query.split(/\s+/).filter(Boolean);
}

function joinTokens(tokens: string[]): string {
  return tokens.join(" ");
}

function hasToken(query: string, token: string): boolean {
  const target = token.toLowerCase();
  return tokenize(query).some((t) => t.toLowerCase() === target);
}

function addToken(query: string, token: string): string {
  if (hasToken(query, token)) return query;
  const tokens = tokenize(query);
  tokens.push(token);
  return joinTokens(tokens);
}

function removeToken(query: string, token: string): string {
  const target = token.toLowerCase();
  return joinTokens(tokenize(query).filter((t) => t.toLowerCase() !== target));
}

function toggleToken(query: string, token: string): string {
  return hasToken(query, token) ? removeToken(query, token) : addToken(query, token);
}

export const Overview = () => {
  const { bookmarks, loading } = useBookmarks();
  const [sort, setSort] = useState<SortMode>("default");
  const { query, setQuery, results, parseError } = useSearch({ limit: FILTER_ONLY_LIMIT });
  const { tags: tagRecords, counts: tagCounts } = useTags();
  const { forest: folderForest, counts: folderCounts } = useFolders();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursorIndex, setCursorIndex] = useState<number>(0);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string>("");
  const [tagManagerOpen, setTagManagerOpen] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const { open: shortcutHelpOpen, setOpen: setShortcutHelpOpen } = useShortcutHelp();
  const { conflicts: pendingConflicts } = usePendingConflicts();
  const [skippedConflictIds, setSkippedConflictIds] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<FixedSizeList | null>(null);
  const selectionHydrated = useRef(false);
  const queryHydrated = useRef(false);
  // Anchor for shift-click range extension. Reset whenever selection is
  // cleared so the next plain click becomes the new anchor.
  const rangeAnchor = useRef<number | null>(null);

  // Show the oldest queued conflict the user has not skipped this session.
  // Skipping just hides one row until the modal is dismissed and re-opened
  // (a new inbound conflict, or the page reloaded), so a bad choice can't
  // corrupt the queue.
  const activeConflict = useMemo(() => {
    for (const c of pendingConflicts) if (!skippedConflictIds.has(c.id)) return c;
    return null;
  }, [pendingConflicts, skippedConflictIds]);

  const visibleConflictCount = useMemo(
    () => pendingConflicts.filter((c) => !skippedConflictIds.has(c.id)).length,
    [pendingConflicts, skippedConflictIds],
  );

  const handleResolveConflict = useCallback(
    async (input: ConflictResolutionInput) => {
      const conflict = pendingConflicts.find((c) => c.id === input.conflictId);
      if (!conflict) return;
      await resolvePendingConflict({
        conflict,
        choices: input.choices,
        applyToFuture: input.applyToFuture,
      });
      setStatus(`resolved conflict for bookmark ${conflict.bookmarkId}`);
    },
    [pendingConflicts],
  );

  const handleSkipConflict = useCallback(() => {
    if (!activeConflict) return;
    setSkippedConflictIds((prev) => {
      const next = new Set(prev);
      next.add(activeConflict.id);
      return next;
    });
  }, [activeConflict]);

  const tagsFromBookmarks = useMemo(() => getTagsFromBookmarks(bookmarks), [bookmarks]);

  const parsedQuery = useMemo(() => parseQuery(query), [query]);
  const activeTagSet = useMemo(() => new Set(parsedQuery.tags), [parsedQuery.tags]);
  const excludedTagSet = useMemo(() => new Set(parsedQuery.excludeTags), [parsedQuery.excludeTags]);
  const activeStatusSet = useMemo(() => new Set(parsedQuery.statuses), [parsedQuery.statuses]);
  const activeFolderSet = useMemo(() => new Set(parsedQuery.folders), [parsedQuery.folders]);
  const folderTitleById = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (nodes: typeof folderForest) => {
      for (const n of nodes) {
        map.set(n.chromeId, n.title);
        walk(n.children);
      }
    };
    walk(folderForest);
    return map;
  }, [folderForest]);
  const untaggedCount = useMemo(
    () => bookmarks.reduce((n, b) => (b.tags.length === 0 ? n + 1 : n), 0),
    [bookmarks],
  );
  const noFilterActive =
    query.trim().length === 0 && bulkSelected.size === 0 && !parsedQuery.untagged;

  // Handle a deep link like `overview.html#edit=<id>` (used by context menu
  // and the native-bookmark hook to surface the detail sheet for a specific
  // bookmark). Runs whenever bookmarks finish loading or the hash changes.
  useEffect(() => {
    if (loading) return;
    const apply = () => {
      const params = readHashParams();
      const id = params.get("edit");
      if (id && bookmarks.some((b) => b.id === id)) {
        setSelectedId(id);
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [loading, bookmarks]);

  // Rehydrate the bulk selection from `#sel=<id>,<id>,…` on the first load
  // after `useBookmarks` finishes. Anything the hash names but the store
  // doesn't have (deleted bookmark, stale link) is silently dropped so the
  // selection can't grow from a refresh past what exists.
  useEffect(() => {
    if (loading || selectionHydrated.current) return;
    selectionHydrated.current = true;
    const params = readHashParams();
    const raw = params.get("sel");
    if (!raw) return;
    const known = new Set(bookmarks.map((b) => b.id));
    const filtered = raw.split(",").filter((id) => id && known.has(id));
    if (filtered.length > 0) setBulkSelected(new Set(filtered));
  }, [loading, bookmarks]);

  // Seed the search box from `#q=<query>` on first mount. Used by the
  // omnibox `bb` keyword: when the user hits Enter without picking a
  // suggestion, the background handler routes them to overview.html#q=…
  // so the same search runs here. One-shot: after hydration the user is
  // free to type over it without us clobbering their edit.
  useEffect(() => {
    if (queryHydrated.current) return;
    queryHydrated.current = true;
    const q = readHashParams().get("q");
    if (q) setQuery(q);
  }, [setQuery]);

  // Persist the bulk selection back to the URL hash. `writeHashParams` uses
  // `history.replaceState`, so it does not fire a `hashchange` — the edit-id
  // listener above won't loop on us.
  useEffect(() => {
    const params = readHashParams();
    if (bulkSelected.size === 0) {
      params.delete("sel");
    } else {
      params.set("sel", Array.from(bulkSelected).join(","));
    }
    writeHashParams(params);
  }, [bulkSelected]);

  async function handleFileImport(file: File) {
    setStatus(`importing ${file.name}…`);
    const text = await file.text();
    const fmt = detectFormat(file);
    try {
      if (fmt === "json") {
        const report = await importJson(text);
        setStatus(
          `JSON: ${report.bookmarksImported} new + ${report.bookmarksMerged} merged bookmarks, ${report.edgesImported} edges`,
        );
      } else if (fmt === "goodreads") {
        const report = await importGoodreadsHtml(text);
        setStatus(`Goodreads: ${report.imported} imported, ${report.merged} merged`);
      } else if (fmt === "pocket") {
        const report = await importPocketCsv(text);
        setStatus(`Pocket: ${report.imported} imported, ${report.merged} merged`);
      } else if (fmt === "raw-url") {
        const report = await importRawUrlList(text);
        setStatus(`Raw URLs: ${report.imported} imported, ${report.merged} merged`);
      } else {
        setStatus(`unknown format for ${file.name}`);
      }
    } catch (err) {
      setStatus(`import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFileImport(file);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleExportJson = async () => {
    const json = await exportJson();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    triggerDownload(json, `better-bookmarks-${stamp}.json`, "application/json");
  };

  const handleExportNetscape = async () => {
    const html = await exportNetscape();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    triggerDownload(html, `bookmarks-${stamp}.html`, "text/html");
  };

  const openSettings = () => {
    if (chrome?.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open("/options.html", "_blank");
    }
  };

  const openHealth = () => {
    if (chrome?.runtime?.getURL && chrome?.tabs?.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL("health.html") });
    } else {
      window.open("/health.html", "_blank");
    }
  };

  const handleLoadSampleBookmarks = useCallback(async () => {
    setStatus("loading sample bookmarks…");
    try {
      const report = await loadSampleBookmarks();
      setStatus(
        `sample loaded: ${report.created} new, ${report.merged} merged (dedup collapsed ${report.dedupCollapsed} of ${report.attempted})`,
      );
    } catch (err) {
      setStatus(`sample load failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleBookmarkThisTab = useCallback(async () => {
    if (!chrome?.tabs?.query) return;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.url) {
      setStatus("no active tab URL");
      return;
    }
    const result = await upsertBookmark({
      rawUrl: tab.url,
      title: tab.title ?? "",
      description: tab.title ?? "",
      capturedFrom: "manual",
    });
    if (!result.ok) {
      setStatus(`cannot bookmark: ${result.reason.reason}`);
      return;
    }
    setSelectedId(result.bookmark.id);
    setStatus(result.created ? "bookmark added" : "bookmark already exists — opened");
  }, []);

  const selected = useMemo(
    () => (selectedId ? (bookmarks.find((b) => b.id === selectedId) ?? null) : null),
    [bookmarks, selectedId],
  );

  const displayed = useMemo<Bookmark[]>(() => {
    const base = query.trim().length > 0 ? results : [...bookmarks];
    if (sort === "default") {
      if (query.trim().length > 0) return base;
      return base.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    if (sort === "dateAdded") {
      return base.sort((a, b) => b.createdAt - a.createdAt);
    }
    if (sort === "title") {
      return base.sort((a, b) =>
        (a.title || a.canonicalUrl).localeCompare(b.title || b.canonicalUrl),
      );
    }
    if (sort === "domain") {
      return base.sort((a, b) => {
        const d = a.domain.localeCompare(b.domain);
        if (d !== 0) return d;
        return (a.title || a.canonicalUrl).localeCompare(b.title || b.canonicalUrl);
      });
    }
    return base;
  }, [bookmarks, query, results, sort]);

  useEffect(() => {
    if (displayed.length === 0) {
      setCursorIndex(0);
      return;
    }
    setCursorIndex((idx) => Math.min(idx, displayed.length - 1));
  }, [displayed.length]);

  const toggleBulk = useCallback((id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearBulk = useCallback(() => {
    setBulkSelected(new Set());
    rangeAnchor.current = null;
  }, []);

  const addIdsToBulk = useCallback((ids: string[]) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  /**
   * Toggle a row's membership in the bulk selection. When `shift` is true
   * and there is a live anchor, every row from anchor to `index` (inclusive)
   * is added to the selection — matches the "select a range" gesture common
   * to file managers and mail clients.
   */
  const toggleBulkAt = useCallback(
    (index: number, shift: boolean) => {
      const row = displayed[index];
      if (!row) return;
      if (shift && rangeAnchor.current !== null && rangeAnchor.current !== index) {
        const lo = Math.min(rangeAnchor.current, index);
        const hi = Math.max(rangeAnchor.current, index);
        const rangeIds: string[] = [];
        for (let i = lo; i <= hi; i++) {
          const b = displayed[i];
          if (b) rangeIds.push(b.id);
        }
        setBulkSelected((prev) => {
          const next = new Set(prev);
          for (const id of rangeIds) next.add(id);
          return next;
        });
      } else {
        toggleBulk(row.id);
      }
      rangeAnchor.current = index;
    },
    [displayed, toggleBulk],
  );

  const selectAllVisible = useCallback(() => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      for (const b of displayed) next.add(b.id);
      return next;
    });
  }, [displayed]);

  const selectedTitles = useMemo(() => {
    if (bulkSelected.size === 0) return [] as string[];
    const byId = new Map(bookmarks.map((b) => [b.id, b] as const));
    const titles: string[] = [];
    // Iterate the selection in insertion order to keep the preview stable
    // as the user shift-adds more items. Cap at 3 — the modal only shows
    // that many anyway.
    let taken = 0;
    for (const id of bulkSelected) {
      if (taken >= 3) break;
      const b = byId.get(id);
      if (b) {
        titles.push(b.title || b.canonicalUrl);
        taken++;
      }
    }
    return titles;
  }, [bulkSelected, bookmarks]);

  const handleBulkAddTag = useCallback(
    async (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      const ids = Array.from(bulkSelected);
      // Make sure the tag record exists first (color, parent, etc). The
      // bookmark write itself is transactional inside `bulkAddTag`.
      await upsertTag({ name: trimmed });
      const result = await bulkAddTag(ids, trimmed);
      setStatus(`added tag "${trimmed}" to ${result.updated} bookmarks`);
    },
    [bulkSelected],
  );

  const handleBulkRemoveTag = useCallback(
    async (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      const ids = Array.from(bulkSelected);
      const result = await bulkRemoveTag(ids, trimmed);
      setStatus(`removed tag "${trimmed}" from ${result.updated} bookmarks`);
    },
    [bulkSelected],
  );

  const handleBulkSetRating = useCallback(
    async (rating: number | null) => {
      const ids = Array.from(bulkSelected);
      const result = await bulkSetRating(ids, rating);
      setStatus(
        rating === null
          ? `cleared rating on ${result.updated} bookmarks`
          : `set rating ${rating} on ${result.updated} bookmarks`,
      );
    },
    [bulkSelected],
  );

  const handleBulkSetStatus = useCallback(
    async (next: ReadStatus) => {
      const ids = Array.from(bulkSelected);
      const result = await bulkSetStatus(ids, next);
      setStatus(`set status "${next}" on ${result.updated} bookmarks`);
    },
    [bulkSelected],
  );

  const handleBulkMarkRead = useCallback(async () => {
    const ids = Array.from(bulkSelected);
    const result = await bulkSetStatus(ids, "read");
    setStatus(`marked ${result.updated} bookmarks as read`);
  }, [bulkSelected]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(bulkSelected);
    const result = await bulkDelete(ids);
    clearBulk();
    setStatus(`deleted ${result.deleted} bookmarks`);
  }, [bulkSelected, clearBulk]);

  const handleSaveDetail = async (updated: Bookmark) => {
    await updateBookmark(updated.id, {
      title: updated.title,
      description: updated.description,
      note: updated.note,
      rating: updated.rating,
      necessaryTime: updated.necessaryTime,
      status: updated.status,
      contentType: updated.contentType,
      tags: updated.tags,
    });
  };

  const handleDeleteDetail = async (id: string) => {
    await deleteBookmarkRecord(id);
    setSelectedId(null);
  };

  // Sidebar / FilterBar token mutators.
  const onToggleTag = useCallback(
    (name: string, mode: "include" | "exclude") => {
      const includeToken = `tag:${name}`;
      const excludeToken = `-tag:${name}`;
      let next = query;
      if (mode === "include") {
        next = removeToken(next, excludeToken);
        next = toggleToken(next, includeToken);
      } else {
        next = removeToken(next, includeToken);
        next = toggleToken(next, excludeToken);
      }
      setQuery(next);
    },
    [query, setQuery],
  );

  const onToggleUntagged = useCallback(() => {
    setQuery(toggleToken(query, "is:untagged"));
  }, [query, setQuery]);

  const onToggleFolder = useCallback(
    (chromeId: string) => {
      setQuery(toggleToken(query, `folder:${chromeId}`));
    },
    [query, setQuery],
  );

  const onClearAll = useCallback(() => {
    setQuery("");
    clearBulk();
  }, [setQuery, clearBulk]);

  const onToggleStatus = useCallback(
    (s: ReadStatus) => {
      setQuery(toggleToken(query, `is:${s}`));
    },
    [query, setQuery],
  );

  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];
    for (const t of parsedQuery.tags) chips.push({ key: `tag:${t}`, label: `tag:${t}` });
    for (const t of parsedQuery.excludeTags) chips.push({ key: `-tag:${t}`, label: `-tag:${t}` });
    for (const d of parsedQuery.domains) chips.push({ key: `domain:${d}`, label: `domain:${d}` });
    for (const s of parsedQuery.statuses) chips.push({ key: `is:${s}`, label: `is:${s}` });
    for (const f of parsedQuery.folders) {
      const title = folderTitleById.get(f) ?? f;
      chips.push({ key: `folder:${f}`, label: `folder:${title}` });
    }
    for (const f of parsedQuery.excludeFolders) {
      const title = folderTitleById.get(f) ?? f;
      chips.push({ key: `-folder:${f}`, label: `-folder:${title}` });
    }
    if (parsedQuery.untagged) chips.push({ key: "is:untagged", label: "untagged" });
    if (parsedQuery.rating) {
      const r = parsedQuery.rating;
      chips.push({ key: `rating:${r.op}${r.value}`, label: `rating ${r.op}${r.value}` });
    }
    return chips;
  }, [parsedQuery, folderTitleById]);

  const removeChip = useCallback(
    (key: string) => {
      // The chip key is lowercased token text — but tokens are
      // case-insensitive in our matcher so this works.
      setQuery(removeToken(query, key));
    },
    [query, setQuery],
  );

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "/" && !isTypingTarget(ev.target)) {
        ev.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label="search bookmarks"]',
        );
        input?.focus();
        return;
      }
      if (ev.key === "Escape") {
        if (selectedId) {
          setSelectedId(null);
          return;
        }
        if (bulkSelected.size > 0) {
          clearBulk();
          return;
        }
      }
      // Cmd/Ctrl-A → select every currently-displayed row. Deliberately
      // runs even when a text input has focus, since the browser default
      // (select-all in the input) is less useful than seeding a bulk
      // action against the filtered result set — but we still bail if
      // the user is inside a contenteditable region (WYSIWYG edits).
      if (
        (ev.metaKey || ev.ctrlKey) &&
        !ev.shiftKey &&
        !ev.altKey &&
        ev.key.toLowerCase() === "a"
      ) {
        const target = ev.target;
        const inTextField =
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
        if (!inTextField && displayed.length > 0) {
          ev.preventDefault();
          selectAllVisible();
          return;
        }
      }
      if (isTypingTarget(ev.target)) return;
      // Ignore chords that carry a modifier — those are reserved for
      // native or browser-command bindings (Cmd+Enter, Ctrl+F, …). Only
      // bare single-key strokes drive the overview shortcut map.
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      // Silence single-letter shortcuts while a modal is on top. Those
      // surfaces own their own key handling (detail: Cmd+Enter to save;
      // tag manager & help overlay: Esc to close) and pass-through
      // "d" would still delete the row underneath the sheet.
      if (selectedId || tagManagerOpen || shortcutHelpOpen) return;

      switch (ev.key) {
        case "j":
        case "ArrowDown": {
          ev.preventDefault();
          setCursorIndex((i) => {
            const next = Math.min(displayed.length - 1, i + 1);
            listRef.current?.scrollToItem(next, "smart");
            return next;
          });
          break;
        }
        case "k":
        case "ArrowUp": {
          ev.preventDefault();
          setCursorIndex((i) => {
            const next = Math.max(0, i - 1);
            listRef.current?.scrollToItem(next, "smart");
            return next;
          });
          break;
        }
        case "Enter":
        case "e": {
          ev.preventDefault();
          const b = displayed[cursorIndex];
          if (b) setSelectedId(b.id);
          break;
        }
        case "x": {
          ev.preventDefault();
          toggleBulkAt(cursorIndex, ev.shiftKey);
          break;
        }
        case "o": {
          ev.preventDefault();
          const b = displayed[cursorIndex];
          if (b) window.open(b.originalUrl, "_blank", "noopener,noreferrer");
          break;
        }
        case "n": {
          ev.preventDefault();
          void handleBookmarkThisTab();
          break;
        }
        case "a": {
          ev.preventDefault();
          if (displayed.length === 0) break;
          addIdsToBulk(displayed.map((b) => b.id));
          setStatus(`selected all ${displayed.length} visible bookmarks`);
          break;
        }
        case "t": {
          ev.preventDefault();
          const ids =
            bulkSelected.size > 0
              ? Array.from(bulkSelected)
              : displayed[cursorIndex]
                ? [displayed[cursorIndex].id]
                : [];
          if (ids.length === 0) break;
          const tag = window.prompt(
            `Add tag to ${ids.length} bookmark${ids.length === 1 ? "" : "s"}:`,
          );
          if (!tag) break;
          const trimmed = tag.trim();
          if (!trimmed) break;
          if (bulkSelected.size > 0) {
            void handleBulkAddTag(trimmed);
          } else {
            const b = displayed[cursorIndex];
            if (!b) break;
            if (b.tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
              setStatus(`"${trimmed}" already tags this bookmark`);
              break;
            }
            void (async () => {
              await upsertTag({ name: trimmed });
              await updateBookmark(b.id, { tags: [...b.tags, trimmed] });
              setStatus(`added tag "${trimmed}"`);
            })();
          }
          break;
        }
        case "d": {
          ev.preventDefault();
          const ids =
            bulkSelected.size > 0
              ? Array.from(bulkSelected)
              : displayed[cursorIndex]
                ? [displayed[cursorIndex].id]
                : [];
          if (ids.length === 0) break;
          const confirmed = window.confirm(
            `Delete ${ids.length} bookmark${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
          );
          if (!confirmed) break;
          if (bulkSelected.size > 0) {
            void handleBulkDelete();
          } else {
            void (async () => {
              for (const id of ids) await deleteBookmarkRecord(id);
              setStatus(`deleted ${ids.length} bookmark${ids.length === 1 ? "" : "s"}`);
            })();
          }
          break;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    addIdsToBulk,
    bulkSelected,
    clearBulk,
    cursorIndex,
    displayed,
    handleBookmarkThisTab,
    handleBulkAddTag,
    handleBulkDelete,
    selectAllVisible,
    selectedId,
    shortcutHelpOpen,
    tagManagerOpen,
    toggleBulkAt,
  ]);

  const renderRow = (props: ListChildComponentProps) => {
    const { index, style } = props;
    const bookmark = displayed[index];
    if (!bookmark) return null;
    return (
      <BookmarkRow
        key={bookmark.id}
        bookmark={bookmark}
        index={index}
        style={style}
        isCursor={index === cursorIndex}
        isChecked={bulkSelected.has(bookmark.id)}
        getDragIds={() =>
          bulkSelected.has(bookmark.id) ? Array.from(bulkSelected) : [bookmark.id]
        }
        onCursor={() => setCursorIndex(index)}
        onOpenDetail={() => setSelectedId(bookmark.id)}
        onDelete={() => deleteBookmarkRecord(bookmark.id)}
        onToggleBulk={(shift) => toggleBulkAt(index, shift)}
      />
    );
  };

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-[180px] flex-[0_0_auto]">
        <FolderTreeSidebar
          forest={folderForest}
          counts={folderCounts}
          activeFolders={activeFolderSet}
          onToggleFolder={onToggleFolder}
        />
      </div>
      <div className="min-h-0 flex-1">
        <TagTreeSidebar
          tags={tagRecords}
          counts={tagCounts}
          totalCount={bookmarks.length}
          untaggedCount={untaggedCount}
          activeTags={activeTagSet}
          excludedTags={excludedTagSet}
          activeUntagged={parsedQuery.untagged}
          noFilterActive={noFilterActive}
          onToggleTag={onToggleTag}
          onToggleUntagged={onToggleUntagged}
          onClearAll={onClearAll}
        />
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="open filters"
          onClick={() => setSidebarOpen(true)}
          className="md:hidden"
        >
          <Filter />
        </Button>
        <h1 className="flex-1 text-2xl font-semibold">Better Bookmarks</h1>
        <Button
          variant="default"
          size="sm"
          onClick={handleBookmarkThisTab}
          aria-label="bookmark this tab"
        >
          <BookmarkPlus /> Bookmark this tab
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="manage tags"
          onClick={() => setTagManagerOpen(true)}
        >
          <TagIcon />
        </Button>
        <Button variant="ghost" size="icon" aria-label="settings" onClick={openSettings}>
          <SettingsIcon />
        </Button>
        <Button variant="ghost" size="icon" aria-label="health" onClick={openHealth}>
          <HeartPulse />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => setShortcutHelpOpen(true)}
        >
          <Keyboard />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {loading
          ? "loading…"
          : `${bookmarks.length} bookmarks total, ${displayed.length} showing · /focus, j/k move, Enter/e open, n new, x select, a select all, t tag, d delete, o open URL, Esc clear, ? help`}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[260px_1fr]">
        <div className="hidden md:block md:max-h-[80vh]">{sidebar}</div>
        <div className="flex min-w-0 flex-col gap-3">
          <FilterBar
            query={query}
            setQuery={setQuery}
            resultCount={displayed.length}
            parseError={parseError}
            sort={sort}
            onSortChange={setSort}
            activeStatuses={activeStatusSet}
            onToggleStatus={onToggleStatus}
            activeChips={activeChips}
            onRemoveChip={removeChip}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload /> Import file…
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download /> Export…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleExportJson}>
                  JSON (round-trippable)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportNetscape}>
                  HTML (Chrome / Firefox)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {import.meta.env.DEV && (
              <Button
                variant="outline"
                size="sm"
                aria-label="load 100 sample bookmarks (dev only)"
                title="Populates IndexedDB with 100 curated sample bookmarks — dev builds only."
                onClick={handleLoadSampleBookmarks}
              >
                Load 100 sample bookmarks (DEV)
              </Button>
            )}
            {status && <span className="text-xs text-muted-foreground">{status}</span>}
          </div>

          <input
            ref={fileInput}
            type="file"
            accept=".json,.csv,.html,.htm,.txt,.urls"
            className="hidden"
            aria-label="import bookmarks file"
            aria-hidden="true"
            tabIndex={-1}
            onChange={handleFileInputChange}
          />

          {bulkSelected.size > 0 && (
            <BulkActionsBar
              selectedCount={bulkSelected.size}
              selectedIds={Array.from(bulkSelected)}
              selectedTitles={selectedTitles}
              onClear={clearBulk}
              onAddTag={handleBulkAddTag}
              onRemoveTag={handleBulkRemoveTag}
              onSetRating={handleBulkSetRating}
              onSetStatus={handleBulkSetStatus}
              onMarkRead={handleBulkMarkRead}
              onDelete={handleBulkDelete}
              onDropAdd={addIdsToBulk}
            />
          )}

          <div className="rounded-md border">
            <FixedSizeList
              ref={listRef}
              height={Math.min(700, Math.max(300, window.innerHeight - 280))}
              width="100%"
              itemSize={72}
              itemCount={displayed.length}
              overscanCount={5}
            >
              {renderRow}
            </FixedSizeList>
          </div>
        </div>
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[280px] p-3 sm:max-w-[280px]">
          <SheetTitle className="sr-only">Folders sidebar</SheetTitle>
          <SheetDescription className="sr-only">Browse bookmark folders and tags.</SheetDescription>
          {sidebar}
        </SheetContent>
      </Sheet>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full max-w-[100vw] sm:max-w-[760px]">
          <SheetTitle className="sr-only">Bookmark detail</SheetTitle>
          <SheetDescription className="sr-only">
            Edit bookmark fields, tags, rating and connections.
          </SheetDescription>
          {selected && (
            <BookmarkDetail
              bookmark={selected}
              allBookmarks={bookmarks}
              possibleTags={tagsFromBookmarks}
              onSave={handleSaveDetail}
              onDelete={handleDeleteDetail}
              onClose={() => setSelectedId(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={tagManagerOpen} onOpenChange={setTagManagerOpen}>
        <SheetContent side="right" className="max-w-[100vw] sm:max-w-[560px]">
          <SheetTitle className="sr-only">Tag manager</SheetTitle>
          <SheetDescription className="sr-only">
            Rename, merge, delete and recolor tags.
          </SheetDescription>
          {tagManagerOpen && (
            <TagManager
              tags={tagRecords}
              counts={tagCounts}
              onRename={async (oldName, newName) => {
                await renameTag(oldName, newName);
              }}
              onMerge={async (from, into) => mergeTags(from, into)}
              onDelete={async (name) => {
                await deleteTag(name);
              }}
              onSetColor={async (name, color) => {
                await setTagColor(name, color);
              }}
              onSetParent={async (name, parentName) => {
                await setTagParent(name, parentName);
              }}
              onValidateParent={async (name, parentName) => {
                try {
                  if (parentName.toLowerCase() === name.toLowerCase()) {
                    return { ok: false, error: "A tag cannot be its own parent" };
                  }
                  const exists = tagRecords.some(
                    (t) => t.lowercaseName === parentName.toLowerCase(),
                  );
                  if (!exists) {
                    return { ok: false, error: `Parent tag "${parentName}" does not exist` };
                  }
                  const byLower = new Map(tagRecords.map((t) => [t.lowercaseName, t] as const));
                  let cursor: string | null = parentName;
                  const seen = new Set<string>([name.toLowerCase()]);
                  while (cursor !== null) {
                    const cl = cursor.toLowerCase();
                    if (seen.has(cl)) {
                      return {
                        ok: false,
                        error: `Cycle: "${name}" → "${parentName}" would loop`,
                      };
                    }
                    seen.add(cl);
                    const next = byLower.get(cl);
                    if (!next) break;
                    cursor = next.parentName;
                  }
                  return { ok: true };
                } catch (err) {
                  return {
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                  };
                }
              }}
              onClose={() => setTagManagerOpen(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ShortcutHelp open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />

      <ConflictResolverModal
        conflict={activeConflict}
        pendingCount={visibleConflictCount}
        onResolve={handleResolveConflict}
        onSkip={handleSkipConflict}
      />
    </div>
  );
};

type BookmarkRowProps = {
  bookmark: Bookmark;
  index: number;
  style: React.CSSProperties;
  isCursor: boolean;
  isChecked: boolean;
  getDragIds: () => string[];
  onCursor: () => void;
  onOpenDetail: () => void;
  onDelete: () => void;
  /** `shift` is true when the user clicked with Shift held (range-extend). */
  onToggleBulk: (shift: boolean) => void;
};

function BookmarkRow({
  bookmark,
  style,
  isCursor,
  isChecked,
  getDragIds,
  onCursor,
  onOpenDetail,
  onDelete,
  onToggleBulk,
}: BookmarkRowProps) {
  const ratingHigh = bookmark.rating && bookmark.rating >= 8;
  const drag = useBookmarkDragSource({
    getIds: getDragIds,
    sourceTag: null,
    label: bookmark.title || bookmark.canonicalUrl,
    firstUrl: bookmark.originalUrl,
  });
  return (
    <div
      style={style}
      onClick={() => {
        onCursor();
        onOpenDetail();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpenDetail();
      }}
      role="button"
      tabIndex={0}
      {...drag}
      className={cn(
        "group flex items-center gap-2 border-l-[3px] border-transparent pl-1 pr-2",
        isCursor && "border-primary bg-accent",
        "cursor-grab active:cursor-grabbing",
      )}
    >
      <Checkbox
        checked={isChecked}
        onClick={(e) => {
          e.stopPropagation();
          onToggleBulk(e.shiftKey);
        }}
        aria-label={`select ${bookmark.title || bookmark.canonicalUrl}`}
      />
      <Avatar className="size-9 shrink-0">
        <AvatarFallback className={cn(ratingHigh && "bg-amber-200 text-amber-900")}>
          <Star className={cn("size-4", ratingHigh && "fill-amber-600")} />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{bookmark.title || bookmark.canonicalUrl}</p>
        <div className="flex flex-wrap items-center gap-1">
          <span className="truncate text-xs text-muted-foreground">{bookmark.domain}</span>
          {bookmark.tags.slice(0, 4).map((t) => (
            <Badge key={t} variant="outline" className="text-[10px]">
              {t}
            </Badge>
          ))}
          {bookmark.tags.length > 4 && (
            <span className="text-xs text-muted-foreground/70">+{bookmark.tags.length - 4}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" asChild aria-label="open">
          <a
            href={bookmark.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="edit"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail();
          }}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="delete"
          className="text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
