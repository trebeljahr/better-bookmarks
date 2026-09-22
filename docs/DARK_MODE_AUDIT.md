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

---

## Contrast verdict (2026-09-22 programmatic pass)

Each flagged literal above was converted to sRGB, linearised, and its relative
luminance computed as `L = 0.2126*R + 0.7152*G + 0.0722*B` (with the gamma
`c ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`). Contrast is
`(L_lighter + 0.05) / (L_darker + 0.05)`. Reference tokens taken from
`src/styles/globals.css`:

- Light: `--background` L=1.000, `--card` L=1.000, `--muted` L=0.929,
  `--foreground` L=0.017
- Dark: `--background` L=0.017, `--card` L=0.033, `--muted` L=0.056,
  `--foreground` L=0.960

WCAG 2.1 thresholds applied:
- Normal text: **≥ 4.5**
- Large text (≥ 18pt / ≥ 14pt bold): **≥ 3.0**
- Non-text UI/graphical components (SC 1.4.11): **≥ 3.0**

For text/background pairs (`bg-*` + `text-*` in the same class list, or an
inline `backgroundColor` combined with a themed foreground token) the pair's
own contrast is computed in isolation.

### Summary

| Category              | Count |
| --------------------- | ----- |
| WCAG-fail-both        | 2     |
| WCAG-fail-in-light    | 11    |
| WCAG-fail-in-dark     | 3     |
| passes-both           | 7     |
| not-a-text-pair       | 10    |

### Findings

**WCAG-fail-both**

- `src/components/ui/button.tsx` L14 — `bg-destructive text-white` — pair
  contrast **3.76** (light) / **~3.76** (dark, before the additional
  `dark:bg-destructive/60` opacity drop that lowers it further). Fails
  4.5 for normal text in both themes; the shadcn convention passes only
  the large-text 3.0 threshold. Same red-on-white ratio drives both modes.
- `src/components/ui/badge.tsx` L16 — `bg-destructive text-white …
  dark:bg-destructive/60` — identical destructive pair to the button
  variant; pair contrast **3.76** in both themes, fails 4.5 for normal
  text everywhere and the dark variant's 60 % opacity fill drives it
  below 3.0 in dark against `--card`.

**WCAG-fail-in-light**

- `src/components/TagManager.tsx` L266 — `text-emerald-600 dark:text-emerald-500`
  on `bg-background` — light **3.77**, dark **6.18** — emerald-600 on
  `#fff` misses 4.5 for a small status line; the `dark:` variant clears it.
- `src/components/ui/rating.tsx` L59 — `fill-amber-400 text-amber-400` on
  the filled star glyph — light **1.67** vs `--background`, dark **9.39** —
  amber-400 on `#fff` is well below the 3.0 non-text-UI threshold for the
  star's silhouette; the empty-state stars use `text-muted-foreground` so
  only the filled-star affordance is affected.
- `src/components/TagManager.tsx` L317-322 (default badge variant) with
  `PRESET Red #ef5350` swatch — pair vs `text-primary-foreground`
  (near-white) light **3.35**, vs near-black dark **4.49** — light pair
  fails 4.5; light swatch is too bright for white text.
- Same L317-322 with `PRESET Pink #ec407a` — light **3.62** / dark
  **4.16** — light pair fails 4.5 (dark also fails 4.5 for near-black
  text; borderline).
- Same L317-322 with `PRESET Blue #42a5f5` — light **2.55** / dark **5.92**
  — light pair well below 4.5 with white text on saturated blue.
- Same L317-322 with `PRESET Cyan #26c6da` — light **1.99** / dark **7.59**
  — light pair fails 3.0 even for large text; cyan is much too light for
  white text.
- Same L317-322 with `PRESET Teal #26a69a` — light **2.88** / dark **5.23**
  — light pair fails 4.5.
- Same L317-322 with `PRESET Green #66bb6a` — light **2.27** / dark **6.63**
  — light pair fails 3.0 for large text.
- Same L317-322 with `PRESET Lime #d4e157` — light **1.37** / dark **10.98**
  — light pair fails 3.0; lime is the worst offender against white text.
- Same L317-322 with `PRESET Amber #ffca28` — light **1.47** / dark **10.25**
  — light pair fails 3.0; amber near white is unreadable.
- Same L317-322 with `PRESET Deep Orange #ff7043` — light **2.64** / dark
  **5.71** — light pair fails 4.5 (fails 3.0 for large-text bar as well
  by a small margin).

**WCAG-fail-in-dark**

- `src/components/TagManager.tsx` L317-322 with `PRESET Purple #ab47bc` —
  light **4.63** / dark **3.25** — near-black text on purple in dark
  mode fails 4.5 for normal text (passes 3.0 for large).
- Same L317-322 with `PRESET Deep Purple #7e57c2` — light **5.01** / dark
  **3.01** — dark pair scrapes the 3.0 large-text floor and fails 4.5;
  deep purple is the darkest preset.
- Same L317-322 with `PRESET Indigo #5c6bc0` — light **4.86** / dark
  **3.22** — dark pair fails 4.5; indigo behaves like deep purple with
  near-black text.

**passes-both**

- `src/components/health/FindingReviewSheet.tsx` L308 — amber caveat card
  `bg-amber-50 text-amber-900` (light **8.75**) and
  `dark:bg-amber-950/30 dark:text-amber-100` (dark **13.88** against
  the 30 % amber-950 tint over `--background`) — both variants pass 4.5.
- `src/entrypoints/sidepanel/SidePanel.tsx` L92-93 — high-rating chip
  `bg-amber-200 text-amber-900` — pair contrast **7.28** in both themes
  (fixed pair, no themed component); passes 4.5 everywhere.
- `src/entrypoints/overview/Overview.tsx` L888-889 — identical amber
  chip; pair contrast **7.28** — passes both.
- `src/entrypoints/health/Health.tsx` L421 — `text-rose-500` on
  `HeartPulse` glyph — light **3.67** vs `--background`, dark **4.27** —
  both above the 3.0 non-text-UI threshold; passes as a graphical
  component in both themes (would fail the 4.5 threshold if used as
  small text, but this is an icon).
- `src/components/health/ScannerToggleRow.tsx` L24-26 (blue scale) —
  `bg-blue-100 text-blue-900` (light **8.49**) /
  `dark:bg-blue-950/40 dark:text-blue-200` (dark **10.74**) — both pass 4.5.
- Same L24-26 (amber scale) — `bg-amber-100 text-amber-900` (light
  **8.15**) / `dark:bg-amber-950/40 dark:text-amber-200` (dark **12.35**)
  — both pass 4.5.
- Same L24-26 (rose scale) — `bg-rose-100 text-rose-900` (light **7.97**)
  / `dark:bg-rose-950/40 dark:text-rose-200` (dark **11.10**) — both
  pass 4.5.

**not-a-text-pair**

- `src/components/TagManager.tsx` L305 — `rgba(0,0,0,0.08)` checker
  stripes on transparent background — pattern element, no text; contrast
  test does not apply, but the visual finding stands (near-black stripes
  disappear on near-black surface in dark mode).
- `src/components/TagManager.tsx` L40-51 — twelve `PRESET_COLORS` hex
  literals declared as data; no rendered pair at this line (see L317-322
  entries above for the rendered-pair verdicts).
- `src/components/TagManager.tsx` L125 — inline
  `backgroundColor: c.hex` on the preset swatch button; swatch has no
  text, outline uses themed tokens.
- `src/components/TagManager.tsx` L307 — inline
  `backgroundColor: tag.color` on the color-picker trigger circle; no text.
- `src/components/TagManager.tsx` L131 — `placeholder="#a1b2c3"` string
  literal; never applied as a color.
- `src/components/TagTreeSidebar.tsx` L342-345 — 10 px color dot,
  `backgroundColor: tag.color ?? "transparent"` with themed border
  fallback; no text.
- `src/components/health/FindingCard.tsx` L23-25 — `SEVERITY_DOT`
  `size-2` dots (`bg-blue-400`, `bg-amber-500`, `bg-rose-600`) beside
  themed text; the dot itself carries no text and the badge label uses
  the themed severity classes.
- `src/components/health/FindingReviewSheet.tsx` L324 — `accent-amber-600`
  on the acknowledgement checkbox; native CSS `accent-color`, not a
  text/bg pair.
- `src/components/ui/dialog.tsx` L42 — overlay `bg-black/50`; scrim over
  the viewport, no text on the overlay itself.
- `src/components/ui/sheet.tsx` L37 — overlay `bg-black/50`; identical
  scrim call as `dialog.tsx`.

### Notes on scope

- The Badge L317-322 finding expands into 12 separate pair verdicts
  because the single call site cycles through the twelve `PRESET_COLORS`;
  the underlying source line count is one, but the WCAG verdict is per
  swatch.
- The star-icon and heart-icon findings are computed against the 3.0
  non-text-UI threshold (WCAG 2.1 SC 1.4.11), not the 4.5 text
  threshold; the audit copy above already treats them as glyphs.
- `bg-*/40` and `bg-*/30` fills were composited against the theme's
  `--background` at their stated opacity before contrast was measured,
  so the dark severity badges and the amber caveat card reflect the
  rendered pixel values rather than the raw palette hex.
- The `bg-destructive text-white` line in `button.tsx` uses the shadcn
  default `--destructive` token, which resolves to Tailwind red-500
  (`#ef4444`) in the current palette; the number is stable for the light
  theme and worsens under the dark `dark:bg-destructive/60` opacity.
