/**
 * Support card after the first file import.
 *
 * A small card under the import button: what the import did, and one
 * light line linking the donate page on ricos.site. Part of the page,
 * never a dialog; `claimImportSupportCard` makes sure it shows once.
 */

import { X } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";

export const DONATE_URL = "https://ricos.site/donate/better-bookmarks";

export type ImportSupportCardProps = {
  /** Bookmarks the import created. */
  added: number;
  /** Bookmarks the import folded into ones that were already here. */
  merged: number;
  onClose: () => void;
};

const plural = (count: number, one: string, many: string): string =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

export function importSummary(added: number, merged: number): string {
  const parts: string[] = [];
  if (added > 0) parts.push(plural(added, "new bookmark", "new bookmarks"));
  if (merged > 0) {
    parts.push(
      `${plural(merged, "bookmark", "bookmarks")} merged into ${merged === 1 ? "one" : "ones"} you already had`,
    );
  }
  return `Import done: ${parts.join(", ")}.`;
}

export function ImportSupportCard({
  added,
  merged,
  onClose,
}: ImportSupportCardProps): React.ReactElement {
  return (
    <aside
      aria-label="import finished"
      className="flex items-start gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm"
    >
      <span aria-hidden="true" className="text-base leading-5">
        🍪
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p>{importSummary(added, merged)}</p>
        <p className="text-muted-foreground">
          Better Bookmarks is free and open source. If it saves you some tidying, you can{" "}
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-4"
          >
            buy me some cookies
          </a>
          .
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0"
        aria-label="close import summary"
        onClick={onClose}
      >
        <X />
      </Button>
    </aside>
  );
}
