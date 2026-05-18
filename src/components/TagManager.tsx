/**
 * TagManager — manage every tag in the store: rename, merge, delete,
 * recolor, and re-parent.
 */

import { Check, GitMerge, Pencil, Trash2, X } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Tag } from "@/shared/types";

type Props = {
  tags: Tag[];
  counts: Record<string, number>;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onMerge: (from: string, into: string) => Promise<{ affected: number }>;
  onDelete: (name: string) => Promise<void>;
  onSetColor: (name: string, color: string | null) => Promise<void>;
  onSetParent: (name: string, parentName: string | null) => Promise<void>;
  onValidateParent?: (name: string, parentName: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
};

type Mode = { kind: "rename"; name: string; draft: string } | { kind: "merge"; from: string };

const PRESET_COLORS: { hex: string; name: string }[] = [
  { hex: "#ef5350", name: "Red" },
  { hex: "#ec407a", name: "Pink" },
  { hex: "#ab47bc", name: "Purple" },
  { hex: "#7e57c2", name: "Deep Purple" },
  { hex: "#5c6bc0", name: "Indigo" },
  { hex: "#42a5f5", name: "Blue" },
  { hex: "#26c6da", name: "Cyan" },
  { hex: "#26a69a", name: "Teal" },
  { hex: "#66bb6a", name: "Green" },
  { hex: "#d4e157", name: "Lime" },
  { hex: "#ffca28", name: "Amber" },
  { hex: "#ff7043", name: "Deep Orange" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function descendantNamesOf(rootName: string, tags: Tag[]): Set<string> {
  const childrenByParent = new Map<string, Tag[]>();
  for (const t of tags) {
    if (!t.parentName) continue;
    const key = t.parentName.toLowerCase();
    const list = childrenByParent.get(key);
    if (list) list.push(t);
    else childrenByParent.set(key, [t]);
  }
  const out = new Set<string>();
  const queue = [rootName.toLowerCase()];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur) break;
    const kids = childrenByParent.get(cur) ?? [];
    for (const k of kids) {
      const kl = k.name.toLowerCase();
      if (out.has(kl)) continue;
      out.add(kl);
      queue.push(kl);
    }
  }
  return out;
}

function ancestorChainOf(name: string, tags: Tag[]): Tag[] {
  const byLower = new Map(tags.map((t) => [t.lowercaseName, t] as const));
  const start = byLower.get(name.toLowerCase());
  if (!start) return [];
  const seen = new Set<string>([start.lowercaseName]);
  const chain: Tag[] = [];
  let cursor: string | null = start.parentName;
  while (cursor !== null) {
    const cl = cursor.toLowerCase();
    if (seen.has(cl)) break;
    seen.add(cl);
    const parent = byLower.get(cl);
    if (!parent) break;
    chain.push(parent);
    cursor = parent.parentName;
  }
  return chain;
}

function ColorPickerContent({
  current,
  onPick,
}: {
  current: string | null;
  onPick: (color: string | null) => void;
}) {
  const [hex, setHex] = useState(current ?? "");
  const validHex = HEX_RE.test(hex);
  return (
    <div className="w-60 p-3">
      <p className="mb-1.5 text-xs text-muted-foreground">Preset</p>
      <div className="mb-3 grid grid-cols-6 gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            aria-label={`Set color ${c.name}`}
            onClick={() => onPick(c.hex)}
            className={cn(
              "size-6 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              current?.toLowerCase() === c.hex.toLowerCase()
                ? "border-2 border-primary"
                : "border-border",
            )}
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>
      <div className="mb-2 flex items-center gap-1.5">
        <Input
          placeholder="#a1b2c3"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          aria-invalid={hex.length > 0 && !validHex}
          className="h-8"
        />
        <Button
          size="icon-sm"
          variant="default"
          disabled={!validHex}
          onClick={() => onPick(hex.toLowerCase())}
          aria-label="apply custom color"
        >
          <Check />
        </Button>
      </div>
      <Separator className="my-2" />
      <Button variant="outline" size="sm" className="w-full" onClick={() => onPick(null)}>
        Clear color
      </Button>
    </div>
  );
}

export function TagManager({
  tags,
  counts,
  onRename,
  onMerge,
  onDelete,
  onSetColor,
  onSetParent,
  onValidateParent,
  onClose,
}: Props) {
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [parentOpenFor, setParentOpenFor] = useState<string | null>(null);
  const [colorOpenFor, setColorOpenFor] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [parentError, setParentError] = useState<{ name: string; message: string } | null>(null);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(needle));
  }, [filter, tags]);

  const otherTagNames = useMemo(() => {
    if (mode?.kind !== "merge") return [] as string[];
    return tags.map((t) => t.name).filter((n) => n.toLowerCase() !== mode.from.toLowerCase());
  }, [mode, tags]);

  const handleRenameSubmit = async () => {
    if (mode?.kind !== "rename") return;
    const trimmed = mode.draft.trim();
    if (!trimmed || trimmed.toLowerCase() === mode.name.toLowerCase()) {
      setMode(null);
      return;
    }
    await onRename(mode.name, trimmed);
    setStatus(`renamed "${mode.name}" → "${trimmed}"`);
    setMode(null);
  };

  const handleMergeSubmit = async () => {
    if (mode?.kind !== "merge" || !mergeTarget.trim()) return;
    const r = await onMerge(mode.from, mergeTarget.trim());
    setStatus(`merged "${mode.from}" → "${mergeTarget}" (${r.affected} bookmarks)`);
    setMode(null);
    setMergeTarget("");
  };

  const handleDelete = async (name: string) => {
    if (
      !confirm(
        `Delete tag "${name}"? It will be removed from ${counts[name] ?? 0} bookmarks. The bookmarks themselves are not deleted.`,
      )
    ) {
      return;
    }
    await onDelete(name);
    setStatus(`deleted "${name}"`);
  };

  const handleColorPick = async (name: string, color: string | null) => {
    setColorOpenFor(null);
    await onSetColor(name, color);
    setStatus(color ? `colored "${name}" ${color}` : `cleared color on "${name}"`);
  };

  const handleParentChange = async (name: string, nextParent: string | null) => {
    setParentError(null);
    setParentOpenFor(null);
    if (nextParent !== null && onValidateParent) {
      const check = await onValidateParent(name, nextParent);
      if (!check.ok) {
        setParentError({ name, message: check.error ?? "Invalid parent" });
        return;
      }
    }
    try {
      await onSetParent(name, nextParent);
      setStatus(nextParent ? `"${name}" now under "${nextParent}"` : `cleared parent of "${name}"`);
    } catch (err) {
      setParentError({
        name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-5 sm:w-[520px]">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">Tags ({tags.length})</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="close">
          <X />
        </Button>
      </div>

      <div>
        <Label htmlFor="bb-tag-filter" className="sr-only">
          Filter
        </Label>
        <Input
          id="bb-tag-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="search tag names…"
        />
      </div>

      {status && <p className="text-xs text-emerald-600 dark:text-emerald-500">{status}</p>}

      <Separator />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags match.</p>
      ) : (
        <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
          {filtered.map((tag) => {
            const isRenaming = mode?.kind === "rename" && mode.name === tag.name;
            const isMerging = mode?.kind === "merge" && mode.from === tag.name;
            const ancestors = ancestorChainOf(tag.name, tags);
            const blockedParents = descendantNamesOf(tag.name, tags);
            const parentOptions = tags
              .map((t) => t.name)
              .filter(
                (n) =>
                  n.toLowerCase() !== tag.name.toLowerCase() &&
                  !blockedParents.has(n.toLowerCase()),
              );
            const errForThisTag =
              parentError?.name.toLowerCase() === tag.name.toLowerCase()
                ? parentError.message
                : null;

            return (
              <div key={tag.name} className="rounded-md border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Popover
                    open={colorOpenFor === tag.name}
                    onOpenChange={(o) => setColorOpenFor(o ? tag.name : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={`change color of ${tag.name}`}
                        className={cn(
                          "size-5 rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          !tag.color &&
                            "bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.08)_0_4px,transparent_4px_8px)]",
                        )}
                        style={tag.color ? { backgroundColor: tag.color } : undefined}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <ColorPickerContent
                        current={tag.color}
                        onPick={(c) => handleColorPick(tag.name, c)}
                      />
                    </PopoverContent>
                  </Popover>
                  <Badge
                    variant={tag.color ? "default" : "outline"}
                    style={tag.color ? { backgroundColor: tag.color } : undefined}
                  >
                    {tag.name}
                  </Badge>
                  {ancestors.length > 0 && (
                    <span className="text-xs italic text-muted-foreground">
                      {ancestors
                        .slice()
                        .reverse()
                        .map((a) => a.name)
                        .join(" › ")}
                      {" › "}
                      {tag.name}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {counts[tag.name] ?? 0} bookmarks
                  </span>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="rename"
                    onClick={() => setMode({ kind: "rename", name: tag.name, draft: tag.name })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="merge into"
                    onClick={() => {
                      setMode({ kind: "merge", from: tag.name });
                      setMergeTarget("");
                    }}
                  >
                    <GitMerge />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="delete"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(tag.name)}
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <Popover
                    open={parentOpenFor === tag.name}
                    onOpenChange={(o) => setParentOpenFor(o ? tag.name : null)}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 justify-start font-normal"
                      >
                        Parent: {tag.parentName || "(none)"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search parents…" />
                        <CommandList>
                          <CommandEmpty>No options.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => handleParentChange(tag.name, null)}
                            >
                              (no parent)
                            </CommandItem>
                            {parentOptions.map((p) => (
                              <CommandItem
                                key={p}
                                value={p}
                                onSelect={() => handleParentChange(tag.name, p)}
                              >
                                {p}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {errForThisTag && <p className="mt-1 text-xs text-destructive">{errForThisTag}</p>}

                {isRenaming && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Input
                      value={mode.draft}
                      onChange={(e) => setMode({ ...mode, draft: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit();
                        if (e.key === "Escape") setMode(null);
                      }}
                      placeholder="New name"
                      autoFocus
                    />
                    <Button variant="default" size="icon-sm" onClick={handleRenameSubmit}>
                      <Check />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setMode(null)}>
                      <X />
                    </Button>
                  </div>
                )}

                {isMerging && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Popover open={mergeOpen} onOpenChange={setMergeOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="flex-1 justify-start font-normal">
                          {mergeTarget || `Merge "${tag.name}" into…`}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Type tag name…"
                            value={mergeTarget}
                            onValueChange={setMergeTarget}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {mergeTarget.trim() ? (
                                <button
                                  type="button"
                                  className="text-sm underline-offset-4 hover:underline"
                                  onClick={() => setMergeOpen(false)}
                                >
                                  Use "{mergeTarget.trim()}" (free-form)
                                </button>
                              ) : (
                                "No matches."
                              )}
                            </CommandEmpty>
                            <CommandGroup>
                              {otherTagNames
                                .filter((n) =>
                                  n.toLowerCase().includes(mergeTarget.trim().toLowerCase()),
                                )
                                .map((n) => (
                                  <CommandItem
                                    key={n}
                                    value={n}
                                    onSelect={() => {
                                      setMergeTarget(n);
                                      setMergeOpen(false);
                                    }}
                                  >
                                    {n}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="default"
                      size="icon-sm"
                      onClick={handleMergeSubmit}
                      disabled={!mergeTarget.trim()}
                    >
                      <Check />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setMode(null);
                        setMergeTarget("");
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1" />
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
