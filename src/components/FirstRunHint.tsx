/**
 * First-run hint.
 *
 * One quiet line at the top of the overview, shown on the first overview
 * visit after a fresh install. It replaced a three-step modal tour: the
 * list itself shows what happened to the Chrome bookmarks, so the hint
 * only names the three things the list cannot show on its own.
 *
 * Part of the page, never a dialog. The caller hides it when it is
 * closed or when the user starts using the overview; `useOnboarding`
 * records that it was shown, so it does not come back.
 */

import { Info, X } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";

export type FirstRunHintProps = {
  onClose: () => void;
};

export function FirstRunHint({ onClose }: FirstRunHintProps): React.ReactElement {
  return (
    <aside
      aria-label="first-run hint"
      className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        Better Bookmarks reads your Chrome bookmarks. Each folder becomes a tag, and the same page
        saved twice becomes one bookmark. Edits sync back to Chrome, so uninstalling loses nothing.
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        aria-label="close hint"
        onClick={onClose}
      >
        <X />
      </Button>
    </aside>
  );
}
