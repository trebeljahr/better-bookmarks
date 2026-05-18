import {
  Download,
  ExternalLink,
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
import { SearchBar } from "@/components/SearchBar";
import { TagManager } from "@/components/TagManager";
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
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { canonicalize } from "@/core/canonicalizer";
import {
  exportJson,
  exportNetscape,
  importGoodreadsHtml,
  importJson,
  importPocketCsv,
  importRawUrlList,
} from "@/core/importExport";
import { ensureSearchIndexInitialized, wireSearchIndexer } from "@/core/search";
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
import { type Bookmark, useBookmarks } from "@/hooks/useBookmarks";
import { useSearch } from "@/hooks/useSearch";
import { useTags } from "@/hooks/useTags";
import { cn } from "@/lib/utils";
import type { ReadStatus } from "@/shared/types";

wireSearchIndexer();
ensureSearchIndexInitialized().catch((err) =>
  console.error("ensureSearchIndexInitialized failed", err),
);

type BookmarksById = Record<string, chrome.bookmarks.BookmarkTreeNode>;

function recursivelyFlattenBookmarks(bookmarkItem: chrome.bookmarks.BookmarkTreeNode) {
  const bookmarksById: BookmarksById = {};
  function recurse(node: chrome.bookmarks.BookmarkTreeNode) {
    bookmarksById[node.id] = node;
    node.children?.forEach(recurse);
  }
  recurse(bookmarkItem);
  return bookmarksById;
}

async function importChromeTree(tree: chrome.bookmarks.BookmarkTreeNode): Promise<number> {
  const all = recursivelyFlattenBookmarks(tree);
  function tagsFor(item: chrome.bookmarks.BookmarkTreeNode): string[] {
    const tags: string[] = [];
    let current = item.parentId ? all[item.parentId] : undefined;
    while (current && current.title !== "Bookmarks Bar" && current.parentId) {
      if (current.title) tags.push(current.title);
      current = current.parentId ? all[current.parentId] : undefined;
    }
    return tags;
  }
  let imported = 0;
  for (const node of Object.values(all)) {
    if (!node.url) continue;
    const c = canonicalize(node.url);
    if (!c.ok) continue;
    await upsertBookmark({
      rawUrl: node.url,
      title: node.title,
      description: node.title,
      tags: tagsFor(node),
      capturedFrom: "chrome-import",
    });
    imported += 1;
  }
  return imported;
}

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

export const Overview = () => {
  const { bookmarks, loading } = useBookmarks();
  const { query, setQuery, results, parseError } = useSearch();
  const { tags: tagRecords, counts: tagCounts } = useTags();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursorIndex, setCursorIndex] = useState<number>(0);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string>("");
  const [tagManagerOpen, setTagManagerOpen] = useState<boolean>(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<FixedSizeList | null>(null);

  const tagsFromBookmarks = useMemo(() => getTagsFromBookmarks(bookmarks), [bookmarks]);

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

  const handleChromeImport = async () => {
    setStatus("importing Chrome tree…");
    const tree = await chrome.bookmarks.getTree();
    const count = await importChromeTree(tree[0]);
    setStatus(`Chrome: ${count} bookmarks processed`);
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

  const selected = useMemo(
    () => (selectedId ? (bookmarks.find((b) => b.id === selectedId) ?? null) : null),
    [bookmarks, selectedId],
  );

  const displayed = useMemo<Bookmark[]>(() => {
    if (query.trim().length > 0) return results;
    return [...bookmarks].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [bookmarks, query, results]);

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

  const clearBulk = useCallback(() => setBulkSelected(new Set()), []);

  const handleBulkAddTag = useCallback(
    async (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      await upsertTag({ name: trimmed });
      const affected = bookmarks.filter((b) => bulkSelected.has(b.id));
      for (const b of affected) {
        if (b.tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) continue;
        await updateBookmark(b.id, { tags: [...b.tags, trimmed] });
      }
      setStatus(`added tag "${trimmed}" to ${affected.length} bookmarks`);
    },
    [bookmarks, bulkSelected],
  );

  const handleBulkSetStatus = useCallback(
    async (next: ReadStatus) => {
      const ids = Array.from(bulkSelected);
      for (const id of ids) {
        await updateBookmark(id, { status: next });
      }
      setStatus(`set status "${next}" on ${ids.length} bookmarks`);
    },
    [bulkSelected],
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(bulkSelected);
    for (const id of ids) {
      await deleteBookmarkRecord(id);
    }
    clearBulk();
    setStatus(`deleted ${ids.length} bookmarks`);
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
      if (isTypingTarget(ev.target)) return;

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
          const b = displayed[cursorIndex];
          if (b) toggleBulk(b.id);
          break;
        }
        case "o": {
          ev.preventDefault();
          const b = displayed[cursorIndex];
          if (b) window.open(b.originalUrl, "_blank", "noopener,noreferrer");
          break;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [bulkSelected.size, clearBulk, cursorIndex, displayed, selectedId, toggleBulk]);

  const renderRow = (props: ListChildComponentProps) => {
    const { index, style } = props;
    const bookmark = displayed[index];
    if (!bookmark) return null;
    const isCursor = index === cursorIndex;
    const isChecked = bulkSelected.has(bookmark.id);
    const ratingHigh = bookmark.rating && bookmark.rating >= 8;
    return (
      <div
        style={style}
        key={bookmark.id}
        onClick={() => setCursorIndex(index)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setSelectedId(bookmark.id);
        }}
        role="button"
        tabIndex={0}
        className={cn(
          "group flex items-center gap-2 border-l-[3px] border-transparent pl-1 pr-2",
          isCursor && "border-primary bg-accent",
        )}
      >
        <Checkbox
          checked={isChecked}
          onCheckedChange={() => toggleBulk(bookmark.id)}
          onClick={(e) => e.stopPropagation()}
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
              setSelectedId(bookmark.id);
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
              deleteBookmarkRecord(bookmark.id);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold">Better Bookmarks</h1>
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
      </div>
      <p className="text-sm text-muted-foreground">
        {loading
          ? "loading…"
          : `${bookmarks.length} bookmarks total, ${displayed.length} showing · /focus, j/k move, Enter/e open, x select, o open URL, Esc clear`}
      </p>

      <SearchBar
        query={query}
        setQuery={setQuery}
        resultCount={displayed.length}
        parseError={parseError}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleChromeImport}>
          <Upload /> Import from Chrome
        </Button>
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
            <DropdownMenuItem onClick={handleExportJson}>JSON (round-trippable)</DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportNetscape}>
              HTML (Chrome / Firefox)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {status && <span className="text-xs text-muted-foreground">{status}</span>}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".json,.csv,.html,.htm,.txt,.urls"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {bulkSelected.size > 0 && (
        <BulkActionsBar
          selectedCount={bulkSelected.size}
          possibleTags={tagsFromBookmarks}
          onClear={clearBulk}
          onAddTag={handleBulkAddTag}
          onSetStatus={handleBulkSetStatus}
          onDelete={handleBulkDelete}
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

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="max-w-[100vw] sm:max-w-[600px]">
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
    </div>
  );
};
