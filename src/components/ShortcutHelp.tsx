/**
 * Keyboard-shortcut help overlay.
 *
 * A modal Dialog that renders every entry from the source-of-truth list in
 * `@/shared/shortcuts`. Mount once per surface (overview, sidepanel,
 * options) and drive it through the `open` / `onOpenChange` pair. The
 * matching `?` keyboard trigger is provided by `useShortcutHelp`.
 *
 * The overlay is the substance of the phase — actual wiring for the
 * shortcuts it advertises lands in Phase 7. Rows for shortcuts that are
 * not yet wired still belong here so the list ships as the roadmap the
 * user sees.
 */

import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUT_GROUPS, type Shortcut } from "@/shared/shortcuts";

export type ShortcutHelpProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ShortcutHelp({ open, onOpenChange }: ShortcutHelpProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <Kbd>?</Kbd> anywhere in the extension to reopen this list.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} aria-labelledby={slugify(group.title)}>
              <h3 id={slugify(group.title)} className="mb-2 text-sm font-semibold text-foreground">
                {group.title}
              </h3>
              <table className="w-full border-collapse text-sm">
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Shortcut</th>
                    <th scope="col">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {group.shortcuts.map((s) => (
                    <ShortcutRow key={rowKey(s)} shortcut={s} />
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <div className="mt-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          Ctrl+Shift+X and Ctrl+Shift+B are Chrome browser commands and can be rebound at{" "}
          <code className="font-mono">chrome://extensions/shortcuts</code>. On macOS Chrome ships
          them as Ctrl (not Cmd).
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }): React.ReactElement {
  return (
    <tr className="border-b border-border/50 last:border-b-0">
      <td className="w-[42%] py-1.5 pr-3 align-top">
        <span className="flex flex-wrap items-center gap-1">
          {shortcut.keys.map((k, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: keys in this array are unique-per-row and stable
            <span key={`${k}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/70">or</span>}
              <KbdCombo combo={k} />
            </span>
          ))}
          {shortcut.browserCommand && (
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Chrome
            </span>
          )}
        </span>
      </td>
      <td className="py-1.5 align-top text-muted-foreground">{shortcut.description}</td>
    </tr>
  );
}

/**
 * Splits a "Ctrl+Shift+X"-style combo on `+` and renders each part inside a
 * <Kbd>. Whitespace around parts is stripped.
 */
function KbdCombo({ combo }: { combo: string }): React.ReactElement {
  const parts = combo
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts in this combo are unique-per-row and stable
        <span key={`${p}-${i}`} className="inline-flex items-center gap-0.5">
          {i > 0 && <span className="text-muted-foreground/60">+</span>}
          <Kbd>{p}</Kbd>
        </span>
      ))}
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs shadow-sm">
      {children}
    </kbd>
  );
}

function slugify(s: string): string {
  return `shortcut-group-${s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}

function rowKey(s: Shortcut): string {
  return `${s.surface}::${s.keys.join("|")}::${s.description}`;
}
