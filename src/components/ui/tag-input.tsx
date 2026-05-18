import { Check, Plus, X } from "lucide-react";
import * as React from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type TagInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  options?: string[];
  placeholder?: string;
  className?: string;
};

export function TagInput({
  value,
  onChange,
  options = [],
  placeholder = "Add tags…",
  className,
}: TagInputProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const lowerValue = React.useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);
  const merged = React.useMemo(() => {
    const all = new Set<string>([...options, ...HARDCODED_OPTIONS]);
    return Array.from(all).sort((a, b) => a.localeCompare(b));
  }, [options]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((o) => o.toLowerCase().includes(q));
  }, [merged, search]);

  const trimmed = search.trim();
  const canCreate =
    trimmed.length > 0 && !merged.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  function add(tag: string) {
    const t = tag.trim();
    if (!t) return;
    if (lowerValue.has(t.toLowerCase())) return;
    onChange([...value, t]);
    setSearch("");
  }

  function remove(tag: string) {
    onChange(value.filter((v) => v !== tag));
  }

  function toggle(tag: string) {
    if (lowerValue.has(tag.toLowerCase())) remove(tag);
    else add(tag);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          <span>{tag}</span>
          <button
            type="button"
            onClick={() => remove(tag)}
            aria-label={`Remove ${tag}`}
            className="rounded-sm opacity-60 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="xs" className="h-7 gap-1">
            <Plus className="size-3" />
            {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search or create…"
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) {
                  e.preventDefault();
                  add(trimmed);
                }
              }}
            />
            <CommandList>
              <CommandEmpty>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => add(trimmed)}
                    className="text-sm underline-offset-4 hover:underline"
                  >
                    Create "{trimmed}"
                  </button>
                ) : (
                  "No matches."
                )}
              </CommandEmpty>
              {canCreate && (
                <CommandGroup>
                  <CommandItem onSelect={() => add(trimmed)} value={`__create__${trimmed}`}>
                    <Plus className="size-3.5" /> Create "{trimmed}"
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup>
                {filtered.map((option) => {
                  const checked = lowerValue.has(option.toLowerCase());
                  return (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => toggle(option)}
                      className="gap-2"
                    >
                      <Check className={cn("size-3.5", checked ? "opacity-100" : "opacity-0")} />
                      {option}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const HARDCODED_OPTIONS: readonly string[] = [
  "Biochemistry",
  "Programming",
  "Web Dev",
  "Philosophy",
  "Psychology",
  "Politics",
  "Neuroscience",
  "Engineering",
  "Electronics",
  "Hardware",
  "Arduino",
  "Game Development",
  "Personal Development",
  "Productivity",
  "AI",
  "Hacking",
  "Finances",
  "Design",
  "Art",
  "Traveling",
  "Mathematics",
  "Music",
  "Piano",
  "Go",
  "Ruby",
  "Haskell",
  "C",
  "Python",
  "Clojure",
  "Rust",
  "Forth",
  "JS/TS",
  "Algorithms",
  "Compilers",
  "Crypto",
  "Linux",
  "Terminal",
  "Graphics",
  "3D",
  "three-js",
  "DevOps",
  "Mobile Development",
  "Desktop Development",
  "Favorite Articles",
  "Writing",
  "Content Marketing",
  "SEO",
  "Freediving",
  "Videos",
  "Online Shop",
  "Brain",
  "Neuroplasticity",
  "Meditation",
  "Wisdom",
];
