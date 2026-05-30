/**
 * BookmarkDetail — full record view for a single bookmark.
 */

import { ExternalLink, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { createEdge, deleteEdge } from "@/core/edges/crud";
import type { SuggestedEdge } from "@/core/edges/suggest";
import { useEdges } from "@/hooks/useEdges";
import type { Bookmark, ContentType, EdgeType, ReadStatus } from "@/shared/types";
import { ConnectionsPanel } from "./ConnectionsPanel";

type Props = {
  bookmark: Bookmark;
  allBookmarks: Bookmark[];
  possibleTags: string[];
  onSave: (updated: Bookmark) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onClose: () => void;
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

export function BookmarkDetail({
  bookmark,
  allBookmarks,
  possibleTags,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<Bookmark>(bookmark);
  const { edges, suggestions, refresh } = useEdges(bookmark.id);

  useEffect(() => {
    setDraft(bookmark);
  }, [bookmark]);

  const dirty =
    draft.title !== bookmark.title ||
    draft.description !== bookmark.description ||
    draft.note !== bookmark.note ||
    draft.rating !== bookmark.rating ||
    draft.necessaryTime !== bookmark.necessaryTime ||
    draft.status !== bookmark.status ||
    draft.contentType !== bookmark.contentType ||
    draft.tags.join(" ") !== bookmark.tags.join(" ");

  const handleSave = async () => {
    await onSave(draft);
  };

  const handleLink = async (toId: string, type: EdgeType, note?: string) => {
    await createEdge({
      fromId: bookmark.id,
      toId,
      type,
      note: note ?? "",
      directed: true,
      source: "manual",
    });
    await refresh();
  };

  const handleUnlink = async (edgeId: string) => {
    await deleteEdge(edgeId);
    await refresh();
  };

  const handleAcceptSuggestion = async (s: SuggestedEdge) => {
    await createEdge({
      fromId: s.fromId,
      toId: s.toId,
      type: s.type,
      note: s.note,
      directed: s.directed,
      source: "manual",
    });
    await refresh();
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-y-auto p-5">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 truncate text-lg font-semibold">
          {draft.title || draft.canonicalUrl}
        </h2>
        <Button variant="ghost" size="icon-sm" asChild aria-label="open in new tab">
          <a href={bookmark.originalUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
          </a>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="close">
          <X />
        </Button>
      </div>

      <div>
        <p className="break-all text-xs text-muted-foreground">{bookmark.canonicalUrl}</p>
        {bookmark.canonicalUrl !== bookmark.originalUrl && (
          <p className="break-all text-xs text-muted-foreground/70">
            original: {bookmark.originalUrl}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{bookmark.domain}</Badge>
        <Badge variant="outline">captured: {bookmark.capturedFrom}</Badge>
        <Badge variant="outline">added: {new Date(bookmark.createdAt).toLocaleDateString()}</Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bb-detail-title">Title</Label>
        <Input
          id="bb-detail-title"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bb-detail-desc">Description</Label>
        <Textarea
          id="bb-detail-desc"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bb-detail-note">Note</Label>
        <Textarea
          id="bb-detail-note"
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          rows={2}
          placeholder="Why this bookmark? Private to you."
        />
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Rating</Label>
        <Rating
          max={10}
          value={draft.rating ?? 0}
          onChange={(v) => setDraft({ ...draft, rating: v === 0 ? null : v })}
        />
        {draft.rating !== null && (
          <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, rating: null })}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bb-detail-time">Estimated time (min)</Label>
        <Input
          id="bb-detail-time"
          type="number"
          value={draft.necessaryTime ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              necessaryTime: e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select
            value={draft.status}
            onValueChange={(v) => setDraft({ ...draft, status: v as ReadStatus })}
          >
            <SelectTrigger>
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
          <Label>Type</Label>
          <Select
            value={draft.contentType}
            onValueChange={(v) => setDraft({ ...draft, contentType: v as ContentType })}
          >
            <SelectTrigger>
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
        <Label>Tags</Label>
        <Tags
          tags={draft.tags}
          setTags={(next) => setDraft({ ...draft, tags: next })}
          possibleOptions={possibleTags}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={!dirty} aria-label="save changes">
          Save
        </Button>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          onClick={() => onDelete(bookmark.id)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 /> Delete
        </Button>
      </div>

      <Separator />

      <ConnectionsPanel
        bookmark={bookmark}
        allBookmarks={allBookmarks}
        edges={edges}
        suggestions={suggestions}
        onLink={handleLink}
        onUnlink={handleUnlink}
        onAcceptSuggestion={handleAcceptSuggestion}
      />
    </div>
  );
}
