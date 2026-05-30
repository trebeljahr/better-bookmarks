/**
 * 30s countdown toast for a single undo snapshot.
 *
 * Holds an interval ticker so the progress bar drains while the snapshot
 * is live. Clicking "Undo" calls back; once the snapshot expires we
 * auto-dismiss.
 */
import { Undo2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { UndoSnapshot } from "@/core/health";
import { cn } from "@/lib/utils";

type Props = {
  snapshot: UndoSnapshot;
  onUndo: () => void;
  onDismiss: () => void;
  /** Tooltip-style hint to surface beneath the label, e.g. sync caveat. */
  caveat?: string;
};

export function UndoToast({ snapshot, onUndo, onDismiss, caveat }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(handle);
  }, []);

  const total = snapshot.expiresAt - snapshot.createdAt;
  const remaining = Math.max(0, snapshot.expiresAt - now);
  const progress = total <= 0 ? 0 : remaining / total;
  const seconds = Math.ceil(remaining / 1000);

  useEffect(() => {
    if (remaining <= 0) onDismiss();
  }, [remaining, onDismiss]);

  return (
    <div className="pointer-events-auto flex w-[360px] flex-col gap-2 overflow-hidden rounded-md border bg-popover p-3 shadow-lg">
      <div className="flex items-center gap-2">
        <p className="flex-1 truncate text-sm font-medium">{snapshot.label}</p>
        <Button variant="ghost" size="icon-xs" aria-label="dismiss undo" onClick={onDismiss}>
          <X />
        </Button>
      </div>
      {caveat && <p className="text-xs text-muted-foreground">{caveat}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onUndo}>
          <Undo2 /> Undo
        </Button>
        <span className="text-xs text-muted-foreground">{seconds}s</span>
      </div>
      <div aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full bg-primary transition-[width] duration-200")}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
