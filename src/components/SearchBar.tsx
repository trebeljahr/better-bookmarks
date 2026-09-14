import type React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SearchBarProps = {
  query: string;
  setQuery: (s: string) => void;
  resultCount: number;
  parseError?: string | null;
  /**
   * When true, show a one-line hint listing supported syntax under the
   * input. Callers surface it when the visible list is empty — either
   * because the store is empty or the current query matched nothing.
   */
  showSyntaxHint?: boolean;
};

const SYNTAX_HINT =
  'Try: tag:foo, domain:example.com, is:unread, rating:>=7, or a "quoted phrase".';

export function SearchBar({
  query,
  setQuery,
  resultCount,
  parseError,
  showSyntaxHint = false,
}: SearchBarProps) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape inside the input clears the query and blurs so the overview's
    // document-level Escape handler (bulk / detail sheet) takes over for
    // the next press.
    if (e.key === "Escape") {
      if (query.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        setQuery("");
      }
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <Label htmlFor="bb-search" className="sr-only">
        Search bookmarks
      </Label>
      <Input
        id="bb-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="react hooks tag:frontend rating:>=7"
        aria-label="search bookmarks"
        aria-describedby={showSyntaxHint ? "bb-search-hint" : undefined}
        aria-invalid={Boolean(parseError) || undefined}
        className={cn(parseError && "border-destructive focus-visible:ring-destructive/40")}
      />
      <p className={cn("text-xs", parseError ? "text-destructive" : "text-muted-foreground")}>
        {parseError ?? (resultCount === 1 ? "1 result" : `${resultCount} results`)}
      </p>
      {showSyntaxHint && !parseError && (
        <p id="bb-search-hint" className="text-xs text-muted-foreground">
          {SYNTAX_HINT}
        </p>
      )}
    </div>
  );
}

export default SearchBar;
