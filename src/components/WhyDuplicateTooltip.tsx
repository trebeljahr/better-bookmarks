/**
 * WhyDuplicateTooltip — sits next to the canonical URL and explains,
 * per bookmark, which canonicalisation rules were applied to collapse
 * the original URL into the canonical one. Clicking (or focusing) the
 * "why?" trigger opens a popover with one bullet per applied rule.
 *
 * It re-runs `canonicalize(originalUrl)` to recover the list of applied
 * rule ids — we never persist those on the record. That keeps the store
 * unchanged and means the tooltip always reflects the current rule set
 * even for old bookmarks. When `canonicalUrl === originalUrl` and no
 * rules fired, the trigger hides itself.
 */

import { HelpCircle } from "lucide-react";
import { useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { canonicalize } from "@/core/canonicalizer";
import { ruleDescription } from "@/core/canonicalizer/rules";

type Props = {
  originalUrl: string;
  canonicalUrl: string;
};

export function WhyDuplicateTooltip({ originalUrl, canonicalUrl }: Props) {
  // Re-run the canonicaliser on the original URL to recover the list
  // of rules that fired. `originalUrl` is what Chrome/the user gave
  // us; `canonicalUrl` is what we deduped against. The two match
  // only when no rule fired at all, in which case there is nothing
  // to explain and we render nothing.
  const applied = useMemo(() => {
    const result = canonicalize(originalUrl);
    if (!result.ok) return [] as readonly string[];
    return result.appliedRules;
  }, [originalUrl]);

  if (applied.length === 0 || canonicalUrl === originalUrl) return null;

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Why is this a duplicate?"
        className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HelpCircle className="size-3" aria-hidden />
        Why is this a duplicate?
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Why is this a duplicate?</PopoverTitle>
          <PopoverDescription>
            {applied.length === 1
              ? "One canonicalisation rule fired for this URL."
              : `${applied.length} canonicalisation rules fired for this URL.`}
          </PopoverDescription>
        </PopoverHeader>
        <ul className="mt-3 flex flex-col gap-2">
          {applied.map((id) => (
            <li key={id} className="text-xs leading-snug">
              <span className="mr-1 font-mono text-[10px] text-muted-foreground">{id}</span>
              <span className="block text-foreground">{ruleDescription(id)}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
