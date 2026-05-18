import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SearchBarProps = {
  query: string;
  setQuery: (s: string) => void;
  resultCount: number;
  parseError?: string | null;
};

export function SearchBar({ query, setQuery, resultCount, parseError }: SearchBarProps) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <Label htmlFor="bb-search" className="sr-only">
        Search bookmarks
      </Label>
      <Input
        id="bb-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="react hooks tag:frontend rating:>=7"
        aria-label="search bookmarks"
        aria-invalid={Boolean(parseError) || undefined}
        className={cn(parseError && "border-destructive focus-visible:ring-destructive/40")}
      />
      <p className={cn("text-xs", parseError ? "text-destructive" : "text-muted-foreground")}>
        {parseError ?? (resultCount === 1 ? "1 result" : `${resultCount} results`)}
      </p>
    </div>
  );
}

export default SearchBar;
