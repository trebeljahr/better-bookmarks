/**
 * Single source of truth for every keyboard shortcut the extension exposes.
 *
 * Two flavours live here:
 *
 * 1. **Browser commands** — declared in `wxt.config.ts` under
 *    `manifest.commands`. Chrome renders these in chrome://extensions/shortcuts
 *    and the user can rebind them; the strings below are the shipped defaults.
 *
 * 2. **In-app shortcuts** — attached with `keydown`/`onKeyDown` handlers in
 *    React components (grep for `keydown` across `src/`). Overview, side
 *    panel, options and the detail drawer all read from this list; the
 *    overlay renders straight off it.
 *
 * The `?` help overlay (see `components/ShortcutHelp.tsx`) renders straight
 * off this array, so add new shortcuts here as they land — the overlay stays
 * in sync automatically. If a shortcut is different on Mac vs the rest, list
 * both forms as separate entries in `keys` (rendered as "or").
 */

export type ShortcutSurface = "overview" | "sidepanel" | "options" | "detail" | "everywhere";

export type Shortcut = {
  /** Human-readable key combos, e.g. ["Ctrl+Shift+B"]. Multiple entries are shown as alternates. */
  keys: string[];
  /** What the shortcut does. One short imperative sentence. */
  description: string;
  /** Where the shortcut is active. */
  surface: ShortcutSurface;
  /**
   * True for the browser-command shortcuts declared in `wxt.config.ts`.
   * These are user-customizable at chrome://extensions/shortcuts.
   */
  browserCommand?: boolean;
};

export type ShortcutGroup = {
  title: string;
  shortcuts: Shortcut[];
};

/**
 * Grouped list rendered by the help overlay. Order matters — the first
 * group is the most useful for a new user.
 */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Open the extension",
    shortcuts: [
      {
        keys: ["Ctrl+Shift+X"],
        description: "Open the Better Bookmarks overview tab.",
        surface: "everywhere",
        browserCommand: true,
      },
      {
        keys: ["Ctrl+Shift+B"],
        description: "Open the Better Bookmarks side panel.",
        surface: "everywhere",
        browserCommand: true,
      },
      {
        keys: ["bb  <query>"],
        description:
          "Type 'bb' in the address bar, then Tab, to search bookmarks from the omnibox.",
        surface: "everywhere",
      },
    ],
  },
  {
    title: "Help",
    shortcuts: [
      {
        keys: ["?", "Shift+/"],
        description: "Show this shortcut list.",
        surface: "everywhere",
      },
      {
        keys: ["Esc"],
        description: "Close this help overlay.",
        surface: "everywhere",
      },
    ],
  },
  {
    title: "Search & navigation (overview)",
    shortcuts: [
      {
        keys: ["/"],
        description: "Focus the search box.",
        surface: "overview",
      },
      {
        keys: ["j", "Down"],
        description: "Move the row cursor down.",
        surface: "overview",
      },
      {
        keys: ["k", "Up"],
        description: "Move the row cursor up.",
        surface: "overview",
      },
      {
        keys: ["Enter", "e"],
        description: "Open the detail panel for the cursor row (edit selected).",
        surface: "overview",
      },
      {
        keys: ["o"],
        description: "Open the cursor row's URL in a new tab.",
        surface: "overview",
      },
      {
        keys: ["x"],
        description: "Toggle bulk selection on the cursor row.",
        surface: "overview",
      },
      {
        keys: ["a"],
        description: "Select all visible rows for bulk actions.",
        surface: "overview",
      },
      {
        keys: ["Esc"],
        description: "Close the detail panel, else clear bulk selection.",
        surface: "overview",
      },
    ],
  },
  {
    title: "Bookmark actions (overview)",
    shortcuts: [
      {
        keys: ["n"],
        description: "New bookmark — capture the active tab and open its detail drawer.",
        surface: "overview",
      },
      {
        keys: ["t"],
        description:
          "Prompt for a tag and apply it to the bulk selection, or to the cursor row when nothing is selected.",
        surface: "overview",
      },
      {
        keys: ["d"],
        description:
          "Delete (with confirm) the bulk selection, or the cursor row when nothing is selected.",
        surface: "overview",
      },
    ],
  },
  {
    title: "Side panel & options",
    shortcuts: [
      {
        keys: ["Enter"],
        description: "Open the focused row in the side panel.",
        surface: "sidepanel",
      },
      {
        keys: ["/"],
        description: "Focus the search box.",
        surface: "sidepanel",
      },
      {
        keys: ["/"],
        description: "Focus the first search input on the settings page.",
        surface: "options",
      },
    ],
  },
  {
    title: "Row & detail actions",
    shortcuts: [
      {
        keys: ["Ctrl+Enter", "Cmd+Enter"],
        description: "Save the currently open bookmark detail drawer.",
        surface: "detail",
      },
      {
        keys: ["Esc"],
        description: "Close the detail drawer without saving.",
        surface: "detail",
      },
      {
        keys: ["Enter"],
        description: "In an inline edit field, submit the change.",
        surface: "detail",
      },
      {
        keys: ["Esc"],
        description: "In an inline edit field, cancel the change.",
        surface: "detail",
      },
    ],
  },
];

/**
 * Flat view for tests and consumers that don't care about grouping.
 */
export const ALL_SHORTCUTS: Shortcut[] = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts);

/**
 * True when the given event target is one that swallows single-letter
 * keystrokes (typing into an input, textarea, select, or contenteditable).
 * Copy of the helper used by Overview.tsx — duplicated here so surfaces
 * without their own list navigation can still gate `?` correctly without
 * pulling on Overview internals.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * True when a keyboard event should open the help overlay.
 * We accept both a bare `?` (US layouts) and Shift+/ (which produces `?`
 * on most Latin layouts but not all keyboard events report `key === "?"`).
 */
export function isHelpShortcut(ev: KeyboardEvent): boolean {
  if (isTypingTarget(ev.target)) return false;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  return ev.key === "?" || (ev.shiftKey && ev.key === "/");
}
