/**
 * FolderTreeSidebar — recursive sidebar of Chrome folders synced into our
 * `chromeMappings` table.
 *
 * Click a folder = include filter (toggle by folder chromeId). The active
 * folder is highlighted; counts are recursive (descendants included).
 * "All bookmarks" stays as a virtual entry on the tag sidebar — this one
 * is folders-only, with the Chrome top-level containers (Bookmarks bar,
 * Other bookmarks, Mobile bookmarks) appearing as roots.
 */

import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FolderNode } from "@/core/storage/folders";
import { cn } from "@/lib/utils";

type Props = {
  forest: FolderNode[];
  counts: Record<string, number>;
  activeFolders: Set<string>; // chromeIds
  onToggleFolder: (chromeId: string) => void;
};

export function FolderTreeSidebar({ forest, counts, activeFolders, onToggleFolder }: Props) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Default-expand the top-level Chrome containers so the user sees
    // their folders immediately without having to drill in.
    return new Set(forest.map((n) => n.chromeId));
  });

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const flatMatches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return null;
    const out: FolderNode[] = [];
    const visit = (n: FolderNode) => {
      if (n.title.toLowerCase().includes(needle)) out.push(n);
      for (const c of n.children) visit(c);
    };
    for (const root of forest) visit(root);
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }, [filter, forest]);

  return (
    <aside className="flex h-full min-h-0 flex-col gap-2 rounded-md border bg-card p-2">
      <div className="flex items-center gap-2 px-1">
        <Folder className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Folders</span>
      </div>
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="filter folders…"
        className="h-8 text-xs"
        aria-label="filter folder tree"
      />
      <ScrollArea className="min-h-0 flex-1">
        {flatMatches ? (
          <div className="flex flex-col gap-0.5 pr-2">
            {flatMatches.map((n) => (
              <FolderRow
                key={n.chromeId}
                node={n}
                depth={0}
                count={counts[n.chromeId] ?? 0}
                expanded={false}
                hasChildren={false}
                active={activeFolders.has(n.chromeId)}
                onToggleActive={() => onToggleFolder(n.chromeId)}
                onToggleExpand={() => undefined}
              />
            ))}
            {flatMatches.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">no folders match</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 pr-2">
            {forest.map((node) => (
              <Branch
                key={node.chromeId}
                node={node}
                depth={0}
                counts={counts}
                expanded={expanded}
                activeFolders={activeFolders}
                onToggleActive={onToggleFolder}
                onToggleExpand={toggleExpanded}
              />
            ))}
            {forest.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">no folders synced yet</p>
            )}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}

function Branch({
  node,
  depth,
  counts,
  expanded,
  activeFolders,
  onToggleActive,
  onToggleExpand,
}: {
  node: FolderNode;
  depth: number;
  counts: Record<string, number>;
  expanded: Set<string>;
  activeFolders: Set<string>;
  onToggleActive: (chromeId: string) => void;
  onToggleExpand: (chromeId: string) => void;
}) {
  const isOpen = expanded.has(node.chromeId);
  return (
    <>
      <FolderRow
        node={node}
        depth={depth}
        count={counts[node.chromeId] ?? 0}
        expanded={isOpen}
        hasChildren={node.children.length > 0}
        active={activeFolders.has(node.chromeId)}
        onToggleActive={() => onToggleActive(node.chromeId)}
        onToggleExpand={() => onToggleExpand(node.chromeId)}
      />
      {isOpen &&
        node.children.map((child) => (
          <Branch
            key={child.chromeId}
            node={child}
            depth={depth + 1}
            counts={counts}
            expanded={expanded}
            activeFolders={activeFolders}
            onToggleActive={onToggleActive}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </>
  );
}

function FolderRow({
  node,
  depth,
  count,
  expanded,
  hasChildren,
  active,
  onToggleActive,
  onToggleExpand,
}: {
  node: FolderNode;
  depth: number;
  count: number;
  expanded: boolean;
  hasChildren: boolean;
  active: boolean;
  onToggleActive: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div
      data-folder-id={node.chromeId}
      className={cn(
        "group flex items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-accent",
        active && "bg-primary/10 ring-1 ring-primary/40",
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <button
        type="button"
        aria-label={hasChildren ? (expanded ? "collapse folder" : "expand folder") : undefined}
        onClick={hasChildren ? onToggleExpand : undefined}
        className={cn(
          "inline-flex size-4 items-center justify-center text-muted-foreground",
          !hasChildren && "invisible",
        )}
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      <span aria-hidden="true" className="inline-flex size-4 items-center justify-center">
        {expanded && hasChildren ? (
          <FolderOpen className="size-3.5 text-muted-foreground" />
        ) : (
          <Folder className="size-3.5 text-muted-foreground" />
        )}
      </span>
      <button
        type="button"
        onClick={onToggleActive}
        className="flex-1 truncate text-left text-sm"
        title={node.title}
      >
        {node.title || "(untitled)"}
      </button>
      <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
        {count}
      </Badge>
    </div>
  );
}
