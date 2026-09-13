# Accessibility

Better Bookmarks ships with an automated accessibility pass wired into
CI, alongside manual review notes for parts of the a11y story that
tooling cannot check.

## Policy

- **CI fails only on serious or critical axe violations.** Moderate and
  minor findings surface in local runs but do not block a merge — we
  track them as follow-ups instead of gating on noise.
- **Automated coverage is the shell, not the whole app.** The tests
  render each top-level entrypoint with empty data stores and audit the
  resulting DOM. That catches missing labels, unlabeled form controls,
  duplicate landmarks, and broken heading order — the categories where
  a bug ships to every user immediately.
- **Colour contrast lives on the manual pass.** The `color-contrast`
  rule is disabled in the CI run because happy-dom does not compute
  effective foreground/background colours reliably. Contrast is checked
  by hand against the built extension when the theme or palette
  changes; see the "Manual pass" section below.

## What is tested

The suite lives at `src/entrypoints/*/__tests__/a11y.test.tsx`. One
file per entrypoint:

| Entrypoint | File |
| ---------- | ---- |
| Overview   | `src/entrypoints/overview/__tests__/a11y.test.tsx` |
| Options    | `src/entrypoints/options/__tests__/a11y.test.tsx` |
| Side panel | `src/entrypoints/sidepanel/__tests__/a11y.test.tsx` |
| Health     | `src/entrypoints/health/__tests__/a11y.test.tsx` |

There is no separate "popup" entrypoint — the extension surface is the
overview page, the side panel, and the options page (plus the health
sub-surface). If a popup is added later, add a matching
`__tests__/a11y.test.tsx` next to it.

Each test:

1. Sets `@vitest-environment happy-dom` at the top of the file.
2. Loads the shared helper at `src/test/a11ySetup.ts`, which installs
   the `toHaveNoViolations` matcher, a permissive `chrome` global
   stub, and an `axe()` wrapper that filters findings down to
   serious / critical impact.
3. Uses `vi.mock` to shim the data hooks (`useBookmarks`, `useSearch`,
   `useTags`, `useFolders`) and the modules that hit chrome APIs
   directly. The component then renders its empty / freshly-loaded
   state.
4. Runs `axe(container)` and asserts `filterAxeResults(results)` is
   empty. Serious / critical findings print a compact summary line so
   the failure diagnoses itself.

## How to run

Locally:

```sh
pnpm test              # full suite, includes a11y
pnpm vitest run a11y   # just the a11y files
```

In CI, `pnpm test` in `.github/workflows/ci.yml` picks up the
`a11y.test.tsx` files automatically — no separate `test:a11y` script
exists because there is no need for a second scheduler.

## Adding a new entrypoint

When you add an entrypoint under `src/entrypoints/<name>/`:

1. Create `src/entrypoints/<name>/__tests__/a11y.test.tsx`.
2. Copy the shape of an existing sibling (SidePanel is the smallest
   template). Adjust the `vi.mock` calls so the component renders
   without touching real chrome APIs or IndexedDB.
3. Render the top-level component and call `axe(container)`.
4. Assert `filterAxeResults(results)` equals `[]`.

## Manual pass

Automated axe covers structure. The following belong on a hand check
whenever the UI shell or theme changes:

- **Colour contrast** — spot-check text on `bg-card`, badge text on
  `bg-muted`, and any Tailwind arbitrary-value colour against the WCAG
  AA thresholds (4.5:1 for body text, 3:1 for large text and UI
  controls). Confirm both light and dark themes.
- **Focus visibility** — tab through the overview once. Every focusable
  control should show the ring token, and the visible order should
  match reading order.
- **Keyboard-only flows** — with no pointer input, confirm you can
  search, open a bookmark, edit it, run bulk selection, and reach the
  Health page. See `src/entrypoints/overview/Overview.tsx` for the
  documented shortcut set.
- **Screen-reader labels on icon-only buttons** — every `<Button>` with
  an icon child should carry an `aria-label`. Grep with
  `grep -n 'variant="ghost" size="icon"' src/ | grep -v 'aria-label'`
  before shipping a UI change.

## Suppressing a rule

Prefer fixing the code. If a rule is genuinely wrong for a specific
scenario (for example, an off-screen input that a button triggers
programmatically), pass a rule override to `axe`:

```ts
const results = await axe(container, {
  rules: { "some-rule-id": { enabled: false } },
});
```

Document the suppression inline (why the rule is wrong here, what the
alternative validation is) rather than in this file.
