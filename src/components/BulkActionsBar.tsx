/**
 * BulkActionsBar — appears above the result list when 1+ bookmarks are
 * selected via the row checkboxes.
 */

import { Check, Tag as TagIcon, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  possibleTags: string[];
  onClear: () => void;
  onAddTag: (tag: string) => void;
  onSetStatus: (status: ReadStatus) => void;
  onDelete: () => void;
  onDropAdd: (ids: string[]) => void;
};

const STATUS_OPTIONS: ReadonlyArray<ReadStatus> = ["unread", "reading", "read", "archived"];

export function BulkActionsBar({
  selectedCount,
  selectedIds,
  possibleTags: _possibleTags,
  onClear,
  onAddTag,
  onSetStatus,
  onDelete,
  onDropAdd,
}: Props) {
  const [tagDraft, setTagDraft] = useState("");

  const handleSubmitTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    onAddTag(t);
    setTagDraft("");
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
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmitTag();
            }
          }}
          placeholder="Add tag…"
          className="h-8 w-44"
          aria-label="add tag to selected"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleSubmitTag}
          disabled={!tagDraft.trim()}
          aria-label="apply tag"
        >
          <Check />
        </Button>
      </div>

      <Select onValueChange={(v) => onSetStatus(v as ReadStatus)}>
        <SelectTrigger size="sm" className="w-36">
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

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (confirm(`Delete ${selectedCount} bookmarks? This cannot be undone.`)) {
            onDelete();
          }
        }}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 /> Delete
      </Button>
      <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <TagIcon className="size-3" /> tag adds to existing tags
      </span>
    </div>
  );
}
