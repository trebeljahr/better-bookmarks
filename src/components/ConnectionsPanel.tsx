import { Check, Link2, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SuggestedEdge } from "@/core/edges/suggest";
import type { Bookmark, Edge, EdgeType } from "@/shared/types";

type Props = {
  bookmark: Bookmark;
  allBookmarks: Bookmark[];
  edges: Edge[];
  suggestions: SuggestedEdge[];
  onLink: (toId: string, type: EdgeType, note?: string) => void;
  onUnlink: (edgeId: string) => void;
  onAcceptSuggestion: (suggestion: SuggestedEdge) => void;
};

const EDGE_TYPE_OPTIONS: ReadonlyArray<{ value: EdgeType; label: string }> = [
  { value: "related", label: "Related" },
  { value: "sequel", label: "Sequel of" },
  { value: "source", label: "Cites / source of" },
  { value: "rebuts", label: "Rebuts" },
  { value: "supersedes", label: "Supersedes" },
  { value: "translates", label: "Translation of" },
];

type LinkOption = {
  id: string;
  label: string;
  domain: string;
};

export function ConnectionsPanel({
  bookmark,
  allBookmarks,
  edges,
  suggestions,
  onLink,
  onUnlink,
  onAcceptSuggestion,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<LinkOption | null>(null);
  const [linkType, setLinkType] = useState<EdgeType>("related");
  const [note, setNote] = useState("");

  const byId = useMemo(() => {
    const map = new Map<string, Bookmark>();
    for (const b of allBookmarks) map.set(b.id, b);
    return map;
  }, [allBookmarks]);

  const linkOptions = useMemo<LinkOption[]>(() => {
    const linkedIds = new Set<string>();
    for (const e of edges) {
      linkedIds.add(e.fromId);
      linkedIds.add(e.toId);
    }
    return allBookmarks
      .filter((b) => b.id !== bookmark.id && !linkedIds.has(b.id))
      .map((b) => ({ id: b.id, label: b.title || b.canonicalUrl, domain: b.domain }));
  }, [allBookmarks, bookmark.id, edges]);

  const handleSubmitLink = () => {
    if (!selectedTarget) return;
    onLink(selectedTarget.id, linkType, note.trim() || undefined);
    setSelectedTarget(null);
    setNote("");
    setLinkType("related");
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-4">
        <section>
          <h3 className="mb-2 text-sm font-medium">Connections</h3>
          {edges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No connections yet. Link this bookmark to another below.
            </p>
          ) : (
            <ul className="flex list-none flex-wrap gap-1.5 p-0">
              {edges.map((edge) => {
                const otherId = edge.fromId === bookmark.id ? edge.toId : edge.fromId;
                const other = byId.get(otherId);
                const label = other?.title || other?.canonicalUrl || otherId;
                const directionHint =
                  edge.directed && edge.fromId === bookmark.id
                    ? " →"
                    : edge.directed && edge.toId === bookmark.id
                      ? " ←"
                      : "";
                return (
                  <li key={edge.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1 pr-1">
                          <span className="max-w-[200px] truncate">
                            {edge.type}
                            {directionHint}: {label}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUnlink(edge.id)}
                            aria-label="remove connection"
                            className="rounded-sm opacity-60 hover:opacity-100"
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{edge.note || edge.type}</TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-md border bg-card p-3">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Add a connection
          </h4>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="min-w-[240px] flex-[2]">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {selectedTarget ? selectedTarget.label : "Search bookmarks…"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by title…" />
                    <CommandList>
                      <CommandEmpty>No matches.</CommandEmpty>
                      <CommandGroup>
                        {linkOptions.map((opt) => (
                          <CommandItem
                            key={opt.id}
                            value={`${opt.label} ${opt.domain}`}
                            onSelect={() => {
                              setSelectedTarget(opt);
                              setOpen(false);
                            }}
                            className="flex-col items-start gap-0"
                          >
                            <span className="text-sm">{opt.label}</span>
                            <span className="text-xs text-muted-foreground">{opt.domain}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="min-w-[140px] flex-1">
              <Select value={linkType} onValueChange={(v) => setLinkType(v as EdgeType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDGE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px] flex-[2]">
              <Label htmlFor="bb-edge-note" className="sr-only">
                Note
              </Label>
              <Input
                id="bb-edge-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
              />
            </div>
            <Button
              variant="default"
              size="icon"
              aria-label="add connection"
              onClick={handleSubmitLink}
              disabled={!selectedTarget}
            >
              <Link2 />
            </Button>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">Suggested connections</h3>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No suggestions right now. Add more tags to surface candidates.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {suggestions.map((s) => {
                const other = byId.get(s.toId);
                const label = other?.title || other?.canonicalUrl || s.toId;
                return (
                  <div key={s.id} className="flex items-center gap-2 rounded-md border bg-card p-2">
                    <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.reason} (strength {s.strength})
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => onAcceptSuggestion(s)}>
                      <Check /> Accept
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </TooltipProvider>
  );
}
