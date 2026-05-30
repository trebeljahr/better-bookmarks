/**
 * FilterBar — search input + sort dropdown + status pills + active-token chips.
 *
 * Source of truth for filters is the parsed query string. FilterBar emits
 * token mutations back to the parent which mutates the string; the parent
 * derives chips from the parsed structure.
 */

import { ArrowDownAZ, ArrowDownWideNarrow, Clock, Hash, X } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReadStatus } from "@/shared/types";

export type SortMode = "default" | "dateAdded" | "title" | "domain";

export type ActiveChip = {
  key: string;
  label: string;
};

const STATUS_OPTIONS: ReadonlyArray<ReadStatus> = ["unread", "reading", "read", "archived"];

const SORT_LABEL: Record<SortMode, string> = {
  default: "Default",
  dateAdded: "Date added",
  title: "Title A→Z",
  domain: "Domain A→Z",
};

type Props = {
  query: string;
  setQuery: (s: string) => void;
  resultCount: number;
  parseError: string | null;
  sort: SortMode;
  onSortChange: (s: SortMode) => void;
  activeStatuses: Set<ReadStatus>;
  onToggleStatus: (s: ReadStatus) => void;
  activeChips: ActiveChip[];
  onRemoveChip: (key: string) => void;
};

export function FilterBar({
  query,
  setQuery,
  resultCount,
  parseError,
  sort,
  onSortChange,
  activeStatuses,
  onToggleStatus,
  activeChips,
  onRemoveChip,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <SearchBar
            query={query}
            setQuery={setQuery}
            resultCount={resultCount}
            parseError={parseError}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {sort === "default" && <ArrowDownWideNarrow />}
              {sort === "dateAdded" && <Clock />}
              {sort === "title" && <ArrowDownAZ />}
              {sort === "domain" && <Hash />}
              Sort: {SORT_LABEL[sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSortChange("default")}>
              <ArrowDownWideNarrow /> Default (relevance / recent)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSortChange("dateAdded")}>
              <Clock /> Date added (newest)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSortChange("title")}>
              <ArrowDownAZ /> Title A→Z
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSortChange("domain")}>
              <Hash /> Domain A→Z
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Status:</span>
        {STATUS_OPTIONS.map((s) => {
          const active = activeStatuses.has(s);
          return (
            <Badge
              key={s}
              variant={active ? "default" : "outline"}
              role="button"
              tabIndex={0}
              onClick={() => onToggleStatus(s)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleStatus(s);
                }
              }}
              className="cursor-pointer select-none"
            >
              {s}
            </Badge>
          );
        })}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">Filters:</span>
          {activeChips.map((c) => (
            <Badge key={c.key} variant="secondary" className="gap-1 pr-1">
              {c.label}
              <button
                type="button"
                onClick={() => onRemoveChip(c.key)}
                aria-label={`remove filter ${c.label}`}
                className="rounded-sm opacity-80 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
