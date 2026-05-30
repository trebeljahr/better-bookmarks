/**
 * One scanner row in the "Scanners" section of the Health page.
 *
 * Shows the scanner label, its default severity, a switch to enable/disable,
 * and (if there's a finding count from the last scan) a small badge.
 */
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { HealthSeverity, Scanner } from "@/core/health";
import { cn } from "@/lib/utils";

type Props = {
  scanner: Scanner;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  /** Optional finding count from the last scan. */
  lastCount?: number;
  /** Optional duration in ms from the last scan. */
  lastDurationMs?: number;
};

const SEVERITY_BADGE_CLASS: Record<HealthSeverity, string> = {
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  error: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
};

export function ScannerToggleRow({ scanner, enabled, onToggle, lastCount, lastDurationMs }: Props) {
  const id = `scanner-toggle-${scanner.id}`;
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      <Switch id={id} checked={enabled} onCheckedChange={onToggle} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
            {scanner.label}
          </Label>
          <Badge
            variant="outline"
            className={cn("text-[10px]", SEVERITY_BADGE_CLASS[scanner.defaultSeverity])}
          >
            {scanner.defaultSeverity}
          </Badge>
          {!scanner.enabledByDefault && (
            <Badge variant="outline" className="text-[10px]">
              opt-in
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{scanner.id}</p>
      </div>
      {lastCount !== undefined && (
        <div className="text-right text-xs text-muted-foreground">
          <div>{lastCount} found</div>
          {lastDurationMs !== undefined && <div>{lastDurationMs}ms</div>}
        </div>
      )}
    </div>
  );
}
