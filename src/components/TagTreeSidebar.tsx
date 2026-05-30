/**
 * TagTreeSidebar — recursive sidebar of tags-as-folders.
 *
 * Click a tag = include filter (toggle). Hover reveals a minus button =
 * exclude filter (toggle). "All bookmarks" and "Untagged" are virtual
 * entries at the top. The sidebar is purely presentational; it emits
 * include/exclude/untagged toggles back to the parent which mutates the
 * query string (the single source of truth for filters).
 */

import { ChevronDown, ChevronRight, Inbox, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTagDropTarget, useUntaggedDropTarget } from "@/hooks/useBookmarkDnd";
import { cn } from "@/lib/utils";
import type { Tag } from "@/shared/types";

type Props = {
  tags: Tag[];
  counts: Record<string, number>;
  totalCount: number;
  untaggedCount: number;
  activeTags: Set<string>; // lowercased
  excludedTags: Set<string>; // lowercased
  activeUntagged: boolean;
  noFilterActive: boolean;
  onToggleTag: (name: string, mode: "include" | "exclude") => void;
  onToggleUntagged: () => void;
  onClearAll: () => void;
};

type TreeNode = {
  tag: Tag;
  children: TreeNode[];
};

function buildTree(tags: Tag[]): TreeNode[] {
  const byLower = new Map<string, Tag>();
  for (const t of tags) byLower.set(t.lowercaseName, t);
  const childrenByParent = new Map<string, Tag[]>();
  const roots: Tag[] = [];
  for (const t of tags) {
    const parent = t.parentName?.toLowerCase();
    if (parent && byLower.has(parent)) {
      const list = childrenByParent.get(parent);
      if (list) list.push(t);
      else childrenByParent.set(parent, [t]);
    } else {
      roots.push(t);
    }
  }
  function node(t: Tag): TreeNode {
    const kids = childrenByParent.get(t.lowercaseName) ?? [];
    return {
      tag: t,
      children: kids
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(node),
    };
  }
  return roots.sort((a, b) => a.name.localeCompare(b.name)).map(node);
}

export function TagTreeSidebar({
  tags,
  counts,
  totalCount,
  untaggedCount,
  activeTags,
  excludedTags,
  activeUntagged,
  noFilterActive,
  onToggleTag,
  onToggleUntagged,
  onClearAll,
}: Props) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildTree(tags), [tags]);

  const filteredFlat = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return null;
    return tags
      .filter((t) => t.lowercaseName.includes(needle))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filter, tags]);

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtersActive = activeTags.size > 0 || excludedTags.size > 0 || activeUntagged;

  return (
    <aside className="flex h-full min-h-0 flex-col gap-2 rounded-md border bg-card p-2">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="filter tags…"
        className="h-8 text-xs"
        aria-label="filter tag tree"
      />
      <div className="flex flex-col gap-0.5">
        <VirtualEntry
          label="All bookmarks"
          count={totalCount}
          active={noFilterActive}
          icon={<Inbox className="size-3.5" />}
          onClick={onClearAll}
        />
        <UntaggedEntry count={untaggedCount} active={activeUntagged} onClick={onToggleUntagged} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {filteredFlat ? (
          <div className="flex flex-col gap-0.5 pr-2">
            {filteredFlat.map((t) => (
              <TagRow
                key={t.name}
                tag={t}
                depth={0}
                count={counts[t.name] ?? 0}
                expanded={false}
                hasChildren={false}
                included={activeTags.has(t.lowercaseName)}
                excluded={excludedTags.has(t.lowercaseName)}
                onToggleInclude={() => onToggleTag(t.name, "include")}
                onToggleExclude={() => onToggleTag(t.name, "exclude")}
                onToggleExpand={() => undefined}
              />
            ))}
            {filteredFlat.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">no tags match</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 pr-2">
            {tree.map((node) => (
              <TreeBranch
                key={node.tag.name}
                node={node}
                depth={0}
                counts={counts}
                expanded={expanded}
                activeTags={activeTags}
                excludedTags={excludedTags}
                onToggleInclude={(name) => onToggleTag(name, "include")}
                onToggleExclude={(name) => onToggleTag(name, "exclude")}
                onToggleExpand={toggleExpanded}
              />
            ))}
            {tree.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">no tags yet</p>
            )}
          </div>
        )}
      </ScrollArea>
      {filtersActive && (
        <Button variant="ghost" size="sm" onClick={onClearAll} className="text-xs">
          clear all filters
        </Button>
      )}
    </aside>
  );
}

function VirtualEntry({
  label,
  count,
  active,
  icon,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
        active && "bg-accent font-medium",
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function UntaggedEntry({
  count,
  active,
  onClick,
}: {
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const dropTarget = useUntaggedDropTarget();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
        active && "bg-accent font-medium",
        "data-[drag-over=true]:ring-2 data-[drag-over=true]:ring-primary",
      )}
      {...dropTarget}
    >
      <span className="text-muted-foreground">
        <Inbox className="size-3.5" />
      </span>
      <span className="flex-1 truncate">Untagged</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function TreeBranch({
  node,
  depth,
  counts,
  expanded,
  activeTags,
  excludedTags,
  onToggleInclude,
  onToggleExclude,
  onToggleExpand,
}: {
  node: TreeNode;
  depth: number;
  counts: Record<string, number>;
  expanded: Set<string>;
  activeTags: Set<string>;
  excludedTags: Set<string>;
  onToggleInclude: (name: string) => void;
  onToggleExclude: (name: string) => void;
  onToggleExpand: (key: string) => void;
}) {
  const isOpen = expanded.has(node.tag.lowercaseName);
  return (
    <>
      <TagRow
        tag={node.tag}
        depth={depth}
        count={counts[node.tag.name] ?? 0}
        expanded={isOpen}
        hasChildren={node.children.length > 0}
        included={activeTags.has(node.tag.lowercaseName)}
        excluded={excludedTags.has(node.tag.lowercaseName)}
        onToggleInclude={() => onToggleInclude(node.tag.name)}
        onToggleExclude={() => onToggleExclude(node.tag.name)}
        onToggleExpand={() => onToggleExpand(node.tag.lowercaseName)}
      />
      {isOpen &&
        node.children.map((child) => (
          <TreeBranch
            key={child.tag.name}
            node={child}
            depth={depth + 1}
            counts={counts}
            expanded={expanded}
            activeTags={activeTags}
            excludedTags={excludedTags}
            onToggleInclude={onToggleInclude}
            onToggleExclude={onToggleExclude}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </>
  );
}

function TagRow({
  tag,
  depth,
  count,
  expanded,
  hasChildren,
  included,
  excluded,
  onToggleInclude,
  onToggleExclude,
  onToggleExpand,
}: {
  tag: Tag;
  depth: number;
  count: number;
  expanded: boolean;
  hasChildren: boolean;
  included: boolean;
  excluded: boolean;
  onToggleInclude: () => void;
  onToggleExclude: () => void;
  onToggleExpand: () => void;
}) {
  const dropTarget = useTagDropTarget(tag.name);
  return (
    <div
      data-tag-name={tag.name}
      className={cn(
        "group flex items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-accent",
        included && "bg-primary/10 ring-1 ring-primary/40",
        excluded && "opacity-70",
        "data-[drag-over=true]:ring-2 data-[drag-over=true]:ring-primary",
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      {...dropTarget}
    >
      <button
        type="button"
        aria-label={hasChildren ? (expanded ? "collapse" : "expand") : undefined}
        onClick={hasChildren ? onToggleExpand : undefined}
        className={cn(
          "inline-flex size-4 items-center justify-center text-muted-foreground",
          !hasChildren && "invisible",
        )}
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      <span
        aria-hidden="true"
        className="inline-block size-2.5 shrink-0 rounded-full border"
        style={{
          backgroundColor: tag.color ?? "transparent",
          borderColor: tag.color ?? "var(--border)",
        }}
      />
      <button
        type="button"
        onClick={onToggleInclude}
        className={cn(
          "flex-1 truncate text-left text-sm",
          excluded && "line-through decoration-destructive",
        )}
      >
        {tag.name}
      </button>
      <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
        {count}
      </Badge>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExclude();
        }}
        aria-label={excluded ? `un-exclude tag ${tag.name}` : `exclude tag ${tag.name}`}
        className={cn(
          "inline-flex size-4 items-center justify-center text-muted-foreground opacity-0 transition group-hover:opacity-100",
          excluded && "text-destructive opacity-100",
        )}
      >
        {excluded ? <Plus className="size-3" /> : <Minus className="size-3" />}
      </button>
    </div>
  );
}
