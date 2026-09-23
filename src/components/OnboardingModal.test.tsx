// @vitest-environment happy-dom

/**
 * OnboardingModal — first-install tour behaviour.
 *
 * Covers the four state transitions that matter:
 *   - pending=false renders nothing at all.
 *   - pending=true renders the first step and the Skip button.
 *   - Skip fires `onDismiss`.
 *   - Next×(N-1) walks to the last step where the CTA becomes
 *     "Get started" and clicking it fires `onComplete`.
 *   - Escape closes via Radix's onOpenChange -> `onDismiss`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const { render, cleanup, screen, fireEvent } = await import("@testing-library/react");
const { OnboardingModal, ONBOARDING_STEP_COUNT } = await import("@/components/OnboardingModal");

afterEach(() => cleanup());

describe("OnboardingModal", () => {
  it("renders nothing when pending=false", () => {
    render(<OnboardingModal pending={false} onDismiss={() => {}} onComplete={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the first step and a Skip control when pending=true", () => {
    render(<OnboardingModal pending={true} onDismiss={() => {}} onComplete={() => {}} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Step 1 title from OnboardingModal.tsx
    expect(screen.getByText(/Two saves of the same page/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /skip onboarding/i })).toBeTruthy();
  });

  it("Skip fires onDismiss", () => {
    const onDismiss = vi.fn();
    const onComplete = vi.fn();
    render(<OnboardingModal pending={true} onDismiss={onDismiss} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /skip onboarding/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("Next walks through every step and Get started fires onComplete", () => {
    const onDismiss = vi.fn();
    const onComplete = vi.fn();
    render(<OnboardingModal pending={true} onDismiss={onDismiss} onComplete={onComplete} />);

    // Guard against the constant drifting from the fixture in this test.
    expect(ONBOARDING_STEP_COUNT).toBe(3);

    // Advance from step 1 -> step 2 -> step 3.
    for (let i = 1; i < ONBOARDING_STEP_COUNT; i++) {
      fireEvent.click(screen.getByRole("button", { name: /next step/i }));
    }

    // Last step: CTA text switches to "Get started".
    const getStarted = screen.getByRole("button", { name: /get started/i });
    expect(getStarted).toBeTruthy();
    fireEvent.click(getStarted);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("Back returns to a previous step and is disabled on step 1", () => {
    render(<OnboardingModal pending={true} onDismiss={() => {}} onComplete={() => {}} />);

    const back = screen.getByRole("button", { name: /previous step/i });
    // On step 1 the Back button is disabled.
    expect(back.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /next step/i }));
    // Step 2 title visible.
    expect(screen.getByText(/Tags, not folders\./i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /previous step/i }));
    expect(screen.getByText(/Two saves of the same page/i)).toBeTruthy();
  });

  it("Escape fires onDismiss", () => {
    const onDismiss = vi.fn();
    const onComplete = vi.fn();
    render(<OnboardingModal pending={true} onDismiss={onDismiss} onComplete={onComplete} />);

    // Radix Dialog listens for Escape and calls onOpenChange(false), which
    // the component maps to onDismiss. Dispatch the key on the dialog
    // element (Radix attaches the handler at the content root).
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
