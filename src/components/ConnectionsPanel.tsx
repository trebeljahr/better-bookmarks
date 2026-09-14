import { Check, Link2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { search as defaultSearch } from "@/core/search";
import type { Bookmark, Edge, EdgeType } from "@/shared/types";

type SearchFn = (query: string, opts?: { limit?: number }) => Promise<Bookmark[]>;

type Props = {
  bookmark: Bookmark;
  allBookmarks: Bookmark[];
  edges: Edge[];
  suggestions: SuggestedEdge[];
  onLink: (toId: string, type: EdgeType, note?: string) => void;
  onUnlink: (edge: Edge) => void;
  onAcceptSuggestion: (suggestion: SuggestedEdge) => void;
  /**
   * Injectable for tests. Defaults to the Phase 3 `search()` runner.
   */
  searchFn?: SearchFn;
};

const EDGE_TYPE_OPTIONS: ReadonlyArray<{ value: EdgeType; label: string }> = [
  { value: "related", label: "Related" },
  { value: "sequel", label: "Sequel of" },
  { value: "source", label: "Cites / source of" },
  { value: "rebuts", label: "Rebuts" },
  { value: "supersedes", label: "Supersedes" },
  { value: "translates", label: "Translation of" },
];

const PICKER_LIMIT = 20;
const PICKER_DEBOUNCE_MS = 120;

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
  searchFn,
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

  // Group stored edges by source so the panel can render them under
  // separate "Manual" and "Auto" headings. Auto is anything the
  // suggester promoted (`source` starts with "auto-") or any other
  // non-manual source we may add in the future.
  const { manualEdges, autoEdges } = useMemo(() => {
    const manual: Edge[] = [];
    const auto: Edge[] = [];
    for (const edge of edges) {
      if (edge.source === "manual") manual.push(edge);
      else auto.push(edge);
    }
    return { manualEdges: manual, autoEdges: auto };
  }, [edges]);

  // Ids we should exclude from the picker: the bookmark itself + every
  // one already linked from either direction. Recomputed with edges so
  // freshly-linked targets disappear from the search results.
  const excludeIds = useMemo(() => {
    const s = new Set<string>();
    s.add(bookmark.id);
    for (const e of edges) {
      s.add(e.fromId);
      s.add(e.toId);
    }
    return s;
  }, [bookmark.id, edges]);

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
            <div className="flex flex-col gap-3">
              <EdgeGroup
                heading="Manual"
                subjectId={bookmark.id}
                edges={manualEdges}
                byId={byId}
                onUnlink={onUnlink}
                emptyLabel="No manual connections yet."
              />
              <EdgeGroup
                heading="Auto"
                subjectId={bookmark.id}
                edges={autoEdges}
                byId={byId}
                onUnlink={onUnlink}
                emptyLabel="No auto connections."
                showAutoHint
              />
            </div>
          )}
        </section>

        <section className="rounded-md border bg-card p-3">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Add a connection
          </h4>
          <div className="flex flex-col gap-2">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start font-normal"
                  aria-label="link to another bookmark"
                >
                  {selectedTarget ? selectedTarget.label : "Link to another bookmark…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <BookmarkSearchPicker
                  excludeIds={excludeIds}
                  searchFn={searchFn ?? defaultSearch}
                  onPick={(opt) => {
                    setSelectedTarget(opt);
                    setOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1 basis-[140px]">
                <Select value={linkType} onValueChange={(v) => setLinkType(v as EdgeType)}>
                  <SelectTrigger className="w-full">
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
              <div className="min-w-0 flex-[2] basis-[180px]">
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

type EdgeGroupProps = {
  heading: string;
  subjectId: string;
  edges: Edge[];
  byId: Map<string, Bookmark>;
  onUnlink: (edge: Edge) => void;
  emptyLabel: string;
  showAutoHint?: boolean;
};

function EdgeGroup({
  heading,
  subjectId,
  edges,
  byId,
  onUnlink,
  emptyLabel,
  showAutoHint,
}: EdgeGroupProps) {
  const headingId = `bb-conn-group-${heading.toLowerCase()}`;
  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset would need a legend + form context; a labelled group reads the same to AT.
    <div role="group" aria-labelledby={headingId} aria-label={`${heading} connections`}>
      <h4
        id={headingId}
        className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {heading}
      </h4>
      {edges.length === 0 ? (
        <p className="text-xs text-muted-foreground/80">{emptyLabel}</p>
      ) : (
        <ul className="flex list-none flex-wrap gap-1.5 p-0">
          {edges.map((edge) => {
            const otherId = edge.fromId === subjectId ? edge.toId : edge.fromId;
            const other = byId.get(otherId);
            const label = other?.title || other?.canonicalUrl || otherId;
            const directionHint =
              edge.directed && edge.fromId === subjectId
                ? " →"
                : edge.directed && edge.toId === subjectId
                  ? " ←"
                  : "";
            const tooltipBody = showAutoHint
              ? `${edge.note || edge.type} · removing hides this pair from future suggestions`
              : edge.note || edge.type;
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
                        onClick={() => onUnlink(edge)}
                        aria-label={`remove ${heading.toLowerCase()} connection to ${label}`}
                        className="rounded-sm opacity-60 hover:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{tooltipBody}</TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type BookmarkSearchPickerProps = {
  excludeIds: Set<string>;
  searchFn: SearchFn;
  onPick: (opt: LinkOption) => void;
};

/**
 * Popover body: a live search over the Phase 3 `search()` runner. cmdk's
 * internal filter is turned off (`shouldFilter={false}`) so the query
 * flows straight through to the ranked search backend and back into the
 * list. Empty query returns the most recent bookmarks (search() falls
 * back to `updatedAt desc`), which gives users a useful default set.
 */
function BookmarkSearchPicker({ excludeIds, searchFn, onPick }: BookmarkSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  // Guard against stale responses when the user types faster than
  // `search()` resolves — every effect run bumps `runIdRef` and only the
  // most recent id is allowed to write results.
  const runIdRef = useRef(0);

  useEffect(() => {
    const runId = ++runIdRef.current;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const r = await searchFn(query, { limit: PICKER_LIMIT + excludeIds.size });
        if (runId !== runIdRef.current) return;
        setResults(r);
      } catch (err) {
        if (runId !== runIdRef.current) return;
        console.error("connections search failed", err);
        setResults([]);
      } finally {
        if (runId === runIdRef.current) setLoading(false);
      }
    }, PICKER_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [query, searchFn, excludeIds]);

  const options = useMemo<LinkOption[]>(() => {
    const out: LinkOption[] = [];
    for (const b of results) {
      if (excludeIds.has(b.id)) continue;
      out.push({ id: b.id, label: b.title || b.canonicalUrl, domain: b.domain });
      if (out.length >= PICKER_LIMIT) break;
    }
    return out;
  }, [results, excludeIds]);

  return (
    <Command shouldFilter={false}>
      <CommandInput placeholder="Search bookmarks…" value={query} onValueChange={setQuery} />
      <CommandList>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
        ) : options.length === 0 ? (
          <CommandEmpty>No matches.</CommandEmpty>
        ) : (
          <CommandGroup>
            {options.map((opt) => (
              <CommandItem
                key={opt.id}
                value={opt.id}
                onSelect={() => onPick(opt)}
                className="flex-col items-start gap-0"
              >
                <span className="text-sm">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.domain}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
