/**
 * BulkActionsBar — appears above the result list when 1+ bookmarks are
 * selected via the row checkboxes.
 *
 * Wires the bulk verbs (add tag, remove tag, set rating, set status,
 * mark read, delete) into the transactional API in `src/core/bulk`.
 * Delete goes through a confirmation modal that names the first few
 * titles so the user can bail before losing anything.
 */

import { BookOpen, Check, Minus, Star, Tag as TagIcon, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBookmarkDragSource, useBulkSelectDropTarget } from "@/hooks/useBookmarkDnd";
import type { ReadStatus } from "@/shared/types";

type Props = {
  selectedCount: number;
  selectedIds: string[];
  /** Titles of the selected bookmarks (ordered like `selectedIds`) — used for the delete modal preview. */
  selectedTitles: string[];
  onClear: () => void;
  onAddTag: (tag: string) => void | Promise<void>;
  onRemoveTag: (tag: string) => void | Promise<void>;
  onSetRating: (rating: number | null) => void | Promise<void>;
  onSetStatus: (status: ReadStatus) => void | Promise<void>;
  onMarkRead: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onDropAdd: (ids: string[]) => void;
};

const STATUS_OPTIONS: ReadonlyArray<ReadStatus> = ["unread", "reading", "read", "archived"];
const RATING_OPTIONS: ReadonlyArray<number> = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function BulkActionsBar({
  selectedCount,
  selectedIds,
  selectedTitles,
  onClear,
  onAddTag,
  onRemoveTag,
  onSetRating,
  onSetStatus,
  onMarkRead,
  onDelete,
  onDropAdd,
}: Props) {
  const [addTagDraft, setAddTagDraft] = useState("");
  const [removeTagDraft, setRemoveTagDraft] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const submitAddTag = () => {
    const t = addTagDraft.trim();
    if (!t) return;
    void onAddTag(t);
    setAddTagDraft("");
  };

  const submitRemoveTag = () => {
    const t = removeTagDraft.trim();
    if (!t) return;
    void onRemoveTag(t);
    setRemoveTagDraft("");
  };

  const drag = useBookmarkDragSource({
    getIds: () => selectedIds,
    sourceTag: null,
    label: `${selectedCount} bookmarks`,
  });
  const dropTarget = useBulkSelectDropTarget({ onAddIds: onDropAdd });

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2.5 shadow-xs data-[drag-over=true]:ring-2 data-[drag-over=true]:ring-primary"
      {...dropTarget}
    >
      <Badge variant="default" className="cursor-grab gap-1 pr-1 active:cursor-grabbing" {...drag}>
        {selectedCount} selected
        <button
          type="button"
          onClick={onClear}
          aria-label="clear selection"
          className="rounded-sm opacity-80 hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      </Badge>

      <div className="flex items-center gap-1">
        <Input
          value={addTagDraft}
          onChange={(e) => setAddTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitAddTag();
            }
          }}
          placeholder="Add tag…"
          className="h-8 w-40"
          aria-label="add tag to selected"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={submitAddTag}
          disabled={!addTagDraft.trim()}
          aria-label="apply add tag"
        >
          <Check />
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Input
          value={removeTagDraft}
          onChange={(e) => setRemoveTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitRemoveTag();
            }
          }}
          placeholder="Remove tag…"
          className="h-8 w-40"
          aria-label="remove tag from selected"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={submitRemoveTag}
          disabled={!removeTagDraft.trim()}
          aria-label="apply remove tag"
        >
          <Minus />
        </Button>
      </div>

      <Select
        onValueChange={(v) => {
          const parsed = v === "clear" ? null : Number(v);
          void onSetRating(parsed);
        }}
      >
        <SelectTrigger size="sm" className="w-32" aria-label="set rating on selected">
          <SelectValue placeholder="Set rating…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="clear">
            <span className="inline-flex items-center gap-1">
              <Star className="size-3" /> Clear rating
            </span>
          </SelectItem>
          {RATING_OPTIONS.map((r) => (
            <SelectItem key={r} value={String(r)}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select onValueChange={(v) => void onSetStatus(v as ReadStatus)}>
        <SelectTrigger size="sm" className="w-32" aria-label="set status on selected">
          <SelectValue placeholder="Set status…" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        onClick={() => void onMarkRead()}
        aria-label="mark selected as read"
      >
        <BookOpen /> Mark read
      </Button>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        className="text-destructive hover:text-destructive"
        aria-label="delete selected"
      >
        <Trash2 /> Delete
      </Button>
      <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <TagIcon className="size-3" /> tag adds append; remove/rating/status overwrite
      </span>

      <BulkDeleteConfirm
        open={confirmOpen}
        count={selectedCount}
        firstTitles={selectedTitles.slice(0, 3)}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void onDelete();
        }}
      />
    </div>
  );
}

type ConfirmProps = {
  open: boolean;
  count: number;
  firstTitles: string[];
  onCancel: () => void;
  onConfirm: () => void;
};

export function BulkDeleteConfirm({ open, count, firstTitles, onCancel, onConfirm }: ConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent aria-label="confirm bulk delete">
        <DialogHeader>
          <DialogTitle>
            Delete {count} bookmark{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            This removes the record and its extracted page snapshot from local storage. It cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        {firstTitles.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {firstTitles.map((title, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: titles can repeat across the selection, and the list is static for the lifetime of this dialog
              <li key={i} className="truncate">
                {title || <span className="italic">(untitled)</span>}
              </li>
            ))}
            {count > firstTitles.length && (
              <li className="italic">and {count - firstTitles.length} more…</li>
            )}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} aria-label="cancel bulk delete">
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} aria-label="confirm bulk delete">
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
