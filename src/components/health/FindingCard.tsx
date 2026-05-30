/**
 * One finding row on the Health page.
 *
 * The card itself does NOT mutate state. Click body to open the review
 * sheet; explicit Open / Dismiss buttons live in the action row.
 */
import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HealthFinding, HealthSeverity } from "@/core/health";
import { cn } from "@/lib/utils";
import type { Bookmark } from "@/shared/types";

type Props = {
  finding: HealthFinding;
  bookmarks: Bookmark[];
  reviewed: boolean;
  onOpen: () => void;
  onDismiss: () => void;
};

const SEVERITY_DOT: Record<HealthSeverity, string> = {
  info: "bg-blue-400",
  warn: "bg-amber-500",
  error: "bg-rose-600",
};

const SEVERITY_LABEL: Record<HealthSeverity, string> = {
  info: "info",
  warn: "warn",
  error: "error",
};

export function FindingCard({ finding, bookmarks, reviewed, onOpen, onDismiss }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full flex-col gap-1.5 rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
        reviewed && "border-primary/40",
      )}
      aria-label={`open finding ${finding.kind}`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", SEVERITY_DOT[finding.severity])}
        />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {finding.kind}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {SEVERITY_LABEL[finding.severity]}
        </Badge>
        {reviewed && (
          <Badge variant="outline" className="text-[10px]">
            reviewed
          </Badge>
        )}
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          <X />
        </Button>
      </div>
      <p className="line-clamp-2 text-sm text-foreground">{finding.message}</p>
      {bookmarks.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {bookmarks.slice(0, 3).map((b) => (
            <li key={b.id} className="flex items-center gap-1.5">
              <ExternalLink className="size-3 shrink-0 opacity-60" />
              <span className="truncate">{b.title || b.canonicalUrl}</span>
              <span className="shrink-0 text-muted-foreground/70">·</span>
              <span className="shrink-0 truncate text-muted-foreground/70">{b.domain}</span>
            </li>
          ))}
          {bookmarks.length > 3 && (
            <li className="text-muted-foreground/70">+{bookmarks.length - 3} more</li>
          )}
        </ul>
      )}
    </button>
  );
}
