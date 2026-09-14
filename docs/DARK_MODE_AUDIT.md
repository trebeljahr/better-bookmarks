# Dark-Mode Contrast + Hardcoded-Color Audit

Scope: every `.tsx`/`.ts` file under `src/entrypoints/**` and `src/**/components/**`
(excluding `__tests__/`). Scans for hex/rgb/rgba/hsl/hsla literals, MUI
`theme.palette.*` references (none — MUI was removed in `3d31c71`), and inline
`style` objects that set `color` / `background(Color)` / `border(Color)`.
Also flags Tailwind color-scale utilities used against text/background
where dark mode is a concern.

Design tokens live in `src/styles/globals.css` as `--background`,
`--foreground`, `--card`, `--muted`, `--primary`, `--border`, `--destructive`,
etc. Both `:root` and `.dark` scopes are defined, so `bg-background`,
`text-foreground`, `bg-card`, `bg-muted`, `text-muted-foreground`,
`bg-primary text-primary-foreground`, `bg-destructive text-destructive-foreground`,
and `border-border` are safe by construction and are NOT enumerated here.

Severity heuristic
- **Serious** — hardcoded color drives a text/background pair whose contrast
  collapses in dark mode (or whose fallback token disappears).
- **Advisory** — the color is a solid accent (dot, chip, icon, small swatch
  chosen by the user, or intentional saturated brand color) that reads in
  both themes on visual inspection; still worth an eyes-only pass.

Do NOT auto-fix. This is the code-doable prep for the eyes-only pass.

---

## src/components/TagManager.tsx

- [ ] **Serious** — L305 `bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.08)_0_4px,transparent_4px_8px)]`
      The "no color set" checker swatch uses `rgba(0,0,0,0.08)` stripes. On the
      near-black dark-mode background the black stripes vanish and the swatch
      reads as a plain empty circle. Needs a `dark:` counterpart, e.g. the
      same pattern with `rgba(255,255,255,0.08)`.
- [ ] **Serious** — L317-322 Badge with `variant={tag.color ? "default" : "outline"}`
      and `style={{ backgroundColor: tag.color }}` (L319). The `default`
      badge variant paints `text-primary-foreground`. In dark mode that
      foreground is near-black; in light mode it is near-white. For light
      preset swatches (`#ffca28` amber, `#d4e157` lime, `#26c6da` cyan) the
      light-mode text-white on the swatch is a contrast fail; for dark preset
      swatches (`#5c6bc0` indigo, `#7e57c2` deep purple) the dark-mode
      text-near-black on the swatch is a contrast fail. Text color should be
      chosen from the swatch's luminance, not from the theme token.
- [ ] **Advisory** — L40-51 `PRESET_COLORS` twelve hex literals
      (`#ef5350`…`#ff7043`). User-facing tag palette; values are intentional
      swatches. Fine as data. Related to the L319 finding above only in that
      several of these swatches trigger it.
- [ ] **Advisory** — L125 `style={{ backgroundColor: c.hex }}` on the preset
      swatch button. Swatch has no text — the outline uses `border-primary` /
      `border-border` so the picked state stays visible in both themes.
- [ ] **Advisory** — L266 `text-emerald-600 dark:text-emerald-500` — status
      line. `dark:` variant already present; keep an eye on emerald-500 on
      `bg-background` for contrast in the eyes-only pass.
- [ ] **Advisory** — L307 `style={tag.color ? { backgroundColor: tag.color } : undefined}`
      on the color-picker trigger circle. No text on the circle; the L305
      fallback pattern is the real issue.
- [ ] No-op — L131 `placeholder="#a1b2c3"` is a placeholder string, not an
      applied color.

## src/components/TagTreeSidebar.tsx

- [ ] **Advisory** — L342-345 inline
      `style={{ backgroundColor: tag.color ?? "transparent", borderColor: tag.color ?? "var(--border)" }}`
      on the 10px color dot. Fallback uses `var(--border)`, so the empty
      state theme-swaps cleanly. When `tag.color` is set it renders as a
      fixed hex; dot only, no text — visible in both themes provided the
      hex isn't near-transparent.

## src/components/FolderTreeSidebar.tsx

- [ ] No-op — L186 inline style sets `paddingLeft` only. No color.

## src/components/health/FindingCard.tsx

- [ ] **Advisory** — L23-25 `SEVERITY_DOT` uses `bg-blue-400`, `bg-amber-500`,
      `bg-rose-600`. Dot-only indicators (`size-2` circles at L48). Solid
      accents read in both themes; no dark variant needed.

## src/components/health/ScannerToggleRow.tsx

- [ ] **Already handled** — L24-26 `SEVERITY_BADGE_CLASS` has full
      `dark:bg-*-950/40 dark:text-*-200` pairings. Eyes-only pass should
      still verify the muted 950/40 on `bg-card` doesn't look flat.

## src/components/health/FindingReviewSheet.tsx

- [ ] **Already handled** — L308 amber caveat card:
      `border-amber-500/40 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100`.
      Full dark variant defined.
- [ ] **Advisory** — L324 `accent-amber-600` on the acknowledgement checkbox.
      Native CSS `accent-color`; amber-600 reads on both light and dark
      surfaces. No dark variant needed.

## src/components/ui/rating.tsx

- [ ] **Advisory** — L59 `fill-amber-400 text-amber-400` for filled stars.
      Solid saturated accent; the empty state uses `text-muted-foreground`,
      which is theme-aware.

## src/components/ui/sonner.tsx

- [ ] **OK** — L27-34 inline `style` sets `--normal-bg`, `--normal-text`,
      `--normal-border` to the theme tokens `var(--popover)`,
      `var(--popover-foreground)`, `var(--border)`. Toaster picks up the
      current theme via `next-themes`. No action needed.

## src/components/ui/button.tsx

- [ ] **Advisory** — L14 destructive variant: `bg-destructive text-white
      hover:bg-destructive/90 focus-visible:ring-destructive/20
      dark:bg-destructive/60 dark:focus-visible:ring-destructive/40`.
      `text-white` on the saturated red is a shadcn convention and reads
      well in both themes; flag left in case a future palette change moves
      `--destructive` to a lighter tone.
- [ ] **OK** — L16 outline variant, L20 ghost variant. Each has a `dark:`
      counterpart.

## src/components/ui/badge.tsx

- [ ] **Advisory** — L16 destructive badge: `bg-destructive text-white …
      dark:bg-destructive/60`. Same pattern as button; same caveat.
- [ ] **OK** — L8 root variants use `border-ring`, `ring-ring/50`,
      `border-destructive`, all token-driven.

## src/components/ui/dialog.tsx

- [ ] **Advisory** — L42 overlay `bg-black/50`. Semi-transparent scrim over
      the whole viewport; renders in both themes but darkens dark mode more
      than intended. Consider `bg-black/50 dark:bg-black/70` if the modal
      loses separation from the page during the eyes-only pass.

## src/components/ui/sheet.tsx

- [ ] **Advisory** — L37 overlay `bg-black/50`. Same call as dialog.

## src/entrypoints/sidepanel/SidePanel.tsx

- [ ] **Advisory** — L92-93 high-rating chip on the bookmark row:
      `bg-amber-200 text-amber-900` on the Avatar fallback, `fill-amber-600`
      on the Star icon. Fixed amber pair reads in both themes on their own
      but has no `dark:` counterpart — on the near-black dark surface the
      amber-200 chip is very bright. Consider `dark:bg-amber-500/20
      dark:text-amber-200` if the chip feels loud during the eyes-only pass.
- [ ] **OK** — L81 `style={style}` is react-window's row-position style
      (top/left/width/height). No color.

## src/entrypoints/overview/Overview.tsx

- [ ] **Advisory** — L888-889 identical high-rating amber chip on the
      overview row. Same call as SidePanel L92-93.
- [ ] **OK** — L554, L864 `style={style}` are react-window row styles.

## src/entrypoints/health/Health.tsx

- [ ] **Advisory** — L421 `text-rose-500` on the `HeartPulse` page-title
      icon. Saturated single-color glyph next to a headline that uses
      `text-foreground`; contrast is fine in both themes.

## src/components/health/UndoToast.tsx

- [ ] **OK** — L57 inline `style={{ width: `${...}%` }}` on the progress bar
      fill. No color — the fill uses `bg-primary` (theme-aware).

---

## Files scanned, no findings

- `src/entrypoints/background.ts`
- `src/entrypoints/offscreen/main.ts`
- `src/entrypoints/options/main.tsx`
- `src/entrypoints/options/Options.tsx`
- `src/entrypoints/sidepanel/main.tsx`
- `src/entrypoints/health/main.tsx`
- `src/entrypoints/overview/main.tsx`
- `src/components/ConnectionsPanel.tsx`
- `src/components/FilterBar.tsx`
- `src/components/SearchBar.tsx`
- `src/components/Tags.tsx`
- `src/components/WhyDuplicateTooltip.tsx`
- `src/components/BulkActionsBar.tsx`
- `src/components/ShortcutHelp.tsx`
- `src/components/BookmarkDetail.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/accordion.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/command.tsx`
- `src/components/ui/avatar.tsx`
- `src/components/ui/tag-input.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/input.tsx`

## Method

```
# hex literals
grep -rEn '#[0-9a-fA-F]{3,8}([^0-9a-fA-F]|$)' src/entrypoints/ src/components/ \
  --include='*.tsx' --include='*.ts' | grep -v __tests__

# rgb / rgba
grep -rEn 'rgba?\(' src/entrypoints/ src/components/ \
  --include='*.tsx' --include='*.ts' | grep -v __tests__

# hsl / hsla
grep -rEn 'hsla?\(' src/entrypoints/ src/components/ \
  --include='*.tsx' --include='*.ts' | grep -v __tests__

# MUI palette references (post-migration should return zero)
grep -rEn 'theme\.palette\.' src/entrypoints/ src/components/ \
  --include='*.tsx' --include='*.ts' | grep -v __tests__

# inline style objects touching color/background/border
grep -rEn 'style=\{\{[^}]*\}\}' src/entrypoints/ src/components/ \
  --include='*.tsx' --include='*.ts' | grep -Ei 'color|background|border'

# Tailwind color-scale utilities (theme-independent)
grep -rEn '\b(bg|text|border|ring|from|to|via|shadow|fill|stroke)-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b' \
  src/entrypoints/ src/components/ --include='*.tsx' --include='*.ts' \
  | grep -v __tests__
```
