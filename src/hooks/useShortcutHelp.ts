/**
 * Hook that manages the `?` help-overlay open/close state and installs a
 * document-level keydown listener for the shortcut. Import once per
 * surface (overview, sidepanel, options) and render <ShortcutHelp> with
 * the returned `open` / `setOpen` pair.
 *
 * The `?` binding lives here (not inside each surface) so the trigger
 * stays consistent across the extension. Typing targets (inputs,
 * textareas, contenteditable) are ignored so typing a `?` inside the
 * search box never pops the overlay.
 */

import { useCallback, useEffect, useState } from "react";
import { isHelpShortcut } from "@/shared/shortcuts";

export type UseShortcutHelp = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export function useShortcutHelp(): UseShortcutHelp {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (!isHelpShortcut(ev)) return;
      ev.preventDefault();
      setOpen((prev) => !prev);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  return { open, setOpen, toggle };
}
