import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type {
  ConflictField,
  ConflictSource,
  PendingConflictRow,
} from "@/core/sync/pendingConflicts";

export type ConflictResolutionInput = {
  conflictId: string;
  bookmarkId: string;
  choices: Record<ConflictField, ConflictSource>;
  applyToFuture: Partial<Record<ConflictField, boolean>>;
};

type Props = {
  conflict: PendingConflictRow | null;
  pendingCount: number;
  onResolve: (input: ConflictResolutionInput) => void | Promise<void>;
  onSkip: () => void;
};

function fieldLabel(field: ConflictField): string {
  return field === "title" ? "Title" : "URL";
}

function sideValue(side: { title: string; url: string }, field: ConflictField): string {
  return field === "title" ? side.title : side.url;
}

/**
 * Modal that fronts a single `PendingConflictRow`. Users pick a winning
 * side per field and optionally seed the 24h per-field policy cache via
 * the checkbox. `onResolve` performs the write and clears the row; the
 * hook re-renders with the next queued conflict if any.
 */
export function ConflictResolverModal({ conflict, pendingCount, onResolve, onSkip }: Props) {
  const [choices, setChoices] = useState<Partial<Record<ConflictField, ConflictSource>>>({});
  const [applyFuture, setApplyFuture] = useState<Partial<Record<ConflictField, boolean>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!conflict) {
      setChoices({});
      setApplyFuture({});
      setSaving(false);
      return;
    }
    // Default each field to "chrome" — the incoming edit is the reason the
    // dialog is up in the first place, so pre-select it as the likely intent.
    const defaults: Partial<Record<ConflictField, ConflictSource>> = {};
    for (const f of conflict.fields) defaults[f] = "chrome";
    setChoices(defaults);
    setApplyFuture({});
    setSaving(false);
  }, [conflict?.id]);

  const allChosen = useMemo(() => {
    if (!conflict) return false;
    return conflict.fields.every((f) => choices[f] !== undefined);
  }, [conflict, choices]);

  if (!conflict) return null;

  const handleResolve = async () => {
    if (!allChosen) return;
    setSaving(true);
    try {
      const final = {} as Record<ConflictField, ConflictSource>;
      for (const f of conflict.fields) {
        final[f] = choices[f] as ConflictSource;
      }
      await onResolve({
        conflictId: conflict.id,
        bookmarkId: conflict.bookmarkId,
        choices: final,
        applyToFuture: { ...applyFuture },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={conflict !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onSkip();
      }}
    >
      <DialogContent aria-label="resolve chrome bookmark conflict">
        <DialogHeader>
          <DialogTitle>Chrome bookmark differs from your version</DialogTitle>
          <DialogDescription>
            Choose which side wins for each field.
            {pendingCount > 1 ? ` ${pendingCount - 1} more waiting.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {conflict.fields.map((field) => {
            const chromeVal = sideValue(conflict.chromeSide, field);
            const storeVal = sideValue(conflict.storeSide, field);
            const groupName = `bb-conflict-${conflict.id}-${field}`;
            return (
              <div key={field} className="rounded-md border p-3">
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  {fieldLabel(field)}
                </p>
                <div className="flex flex-col gap-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded-sm p-1 hover:bg-accent">
                    <input
                      type="radio"
                      name={groupName}
                      value="chrome"
                      checked={choices[field] === "chrome"}
                      onChange={() => setChoices((c) => ({ ...c, [field]: "chrome" }))}
                      aria-label={`use chrome ${field}`}
                      className="mt-1"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-muted-foreground">Chrome</span>
                      <span className="block break-all text-sm">{chromeVal}</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-sm p-1 hover:bg-accent">
                    <input
                      type="radio"
                      name={groupName}
                      value="store"
                      checked={choices[field] === "store"}
                      onChange={() => setChoices((c) => ({ ...c, [field]: "store" }))}
                      aria-label={`use store ${field}`}
                      className="mt-1"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-muted-foreground">Better Bookmarks</span>
                      <span className="block break-all text-sm">{storeVal}</span>
                    </span>
                  </label>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Checkbox
                    id={`apply-future-${conflict.id}-${field}`}
                    checked={!!applyFuture[field]}
                    onCheckedChange={(v) => setApplyFuture((a) => ({ ...a, [field]: v === true }))}
                    aria-label={`apply to all future ${field} conflicts for 24h`}
                  />
                  <Label
                    htmlFor={`apply-future-${conflict.id}-${field}`}
                    className="text-xs font-normal"
                  >
                    Apply to all future {fieldLabel(field).toLowerCase()} conflicts for 24h
                  </Label>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onSkip} disabled={saving}>
            Later
          </Button>
          <Button onClick={handleResolve} disabled={!allChosen || saving}>
            {saving ? "Applying…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
