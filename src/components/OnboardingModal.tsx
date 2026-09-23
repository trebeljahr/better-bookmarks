/**
 * First-install onboarding modal.
 *
 * Rendered once, on the very first overview mount after a fresh
 * install. Three short steps explain the three ideas that surprise
 * people the most about Better Bookmarks:
 *
 *   1. URL canonicalisation — two saves of the same page collapse.
 *   2. Tags-not-folders — Chrome folders arrive as tags automatically.
 *   3. Chrome as source of truth — two-way sync, uninstall costs nothing.
 *
 * Skip / Back / Next / Get started drive the flow. Skip (top-right) and
 * Escape both call `onDismiss`; the last-step CTA calls `onComplete`.
 * Both terminate the tour permanently — the caller writes
 * `onboardingPending: false` so the modal never returns.
 */

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type OnboardingModalProps = {
  /** When false, the dialog is not rendered at all. */
  pending: boolean;
  /** Skip button or Escape key. */
  onDismiss: () => void;
  /** "Get started" CTA on the last step. */
  onComplete: () => void;
};

type Step = {
  title: string;
  body: React.ReactNode;
};

const STEPS: Step[] = [
  {
    title: "Two saves of the same page, one bookmark.",
    body: (
      <>
        <p>
          Better Bookmarks canonicalises URLs before saving. Tracking parameters, session ids,
          trailing slashes and the http/https split all collapse to one record, so bookmarking a
          page a second time updates the row you already have instead of piling up duplicates.
        </p>
        <div
          className="mt-3 rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
          aria-hidden="true"
        >
          <div className="text-muted-foreground">
            https://example.com/post?utm_source=twitter&amp;ref=x
          </div>
          <div className="text-muted-foreground">
            http://example.com/post/?utm_source=newsletter
          </div>
          <div className="my-1 text-center text-muted-foreground/70">↓ canonicalise</div>
          <div className="font-semibold text-foreground">https://example.com/post</div>
        </div>
      </>
    ),
  },
  {
    title: "Tags, not folders.",
    body: (
      <p>
        Everything you already have in Chrome imports automatically. Each parent folder becomes a
        tag on every bookmark inside it, so a page filed under Reading / Papers arrives with both
        tags applied. Mirroring tags back into Chrome folders is opt-in — leave it off and the
        Chrome side stays exactly as you had it.
      </p>
    ),
  },
  {
    title: "Chrome stays the source of truth.",
    body: (
      <p>
        Two-way sync runs in the background: changes you make here land in Chrome bookmarks, and
        changes you make in Chrome (or on another device via Chrome Sync) land here. Uninstall costs
        nothing — the bookmarks stay in Chrome exactly where they always were.
      </p>
    ),
  },
];

export function OnboardingModal({
  pending,
  onDismiss,
  onComplete,
}: OnboardingModalProps): React.ReactElement | null {
  const [stepIndex, setStepIndex] = useState<number>(0);

  // Reset to step 1 whenever the modal is re-opened (e.g. tests reusing
  // the same mounted component). No effect on the real fresh-install
  // flow since the modal only ever opens once.
  useEffect(() => {
    if (pending) setStepIndex(0);
  }, [pending]);

  if (!pending) return null;

  const step = STEPS[stepIndex];
  if (!step) return null;
  const isLast = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;

  return (
    <Dialog
      open={pending}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        // Radix already closes on Escape via onOpenChange(false), which
        // routes to onDismiss. Nothing extra to wire here.
      >
        <DialogHeader>
          <DialogTitle>{step.title}</DialogTitle>
          <DialogDescription className="sr-only">
            Step {stepIndex + 1} of {STEPS.length} of the Better Bookmarks introduction.
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm leading-relaxed text-foreground">{step.body}</div>

        <div
          className="mt-2 flex items-center justify-center gap-1.5"
          role="tablist"
          aria-label="onboarding progress"
        >
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={
                i === stepIndex
                  ? "size-2 rounded-full bg-primary"
                  : "size-2 rounded-full bg-muted-foreground/30"
              }
              role="tab"
              aria-selected={i === stepIndex}
              aria-label={`step ${i + 1}`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            aria-label="skip onboarding"
            title="Skip onboarding"
          >
            <X /> Skip
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={isFirst}
              aria-label="previous step"
            >
              <ArrowLeft /> Back
            </Button>
            {isLast ? (
              <Button variant="default" size="sm" onClick={onComplete}>
                Get started
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
                aria-label="next step"
              >
                Next <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Exposed for tests so they don't have to guess the step count. */
export const ONBOARDING_STEP_COUNT = STEPS.length;
