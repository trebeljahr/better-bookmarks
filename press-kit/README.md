# press-kit/

Marketing and store assets for Better Bookmarks. Every image is made from the
real extension by a script in `scripts/marketing/`, so it can be made again
after the UI changes. `manifest.json` lists each image with its size and
SHA-256.

| Path | What it is | Size | Made by | Date |
| --- | --- | --- | --- | --- |
| `screenshots/overview-light.jpg` | Overview with the demo library. README hero. | 3200×2000 (1600×1000 at 2×) | `capture-screenshots.mjs` | 2026-11-06 |
| `screenshots/search-light.jpg` | Filtered search `tag:papers rating:>=9` | 3200×2000 | `capture-screenshots.mjs` | 2026-11-06 |
| `screenshots/import-merged.jpg` | Import result: 28 new, 6 merged, with the support card | 3200×2000 | `capture-screenshots.mjs` | 2026-11-06 |
| `screenshots/detail-light.jpg` | Detail sheet of one bookmark | 3200×2000 | `capture-screenshots.mjs` | 2026-11-06 |
| `social-preview/social-preview-{a,b,c}.png` | GitHub social preview options: A screenshot-led, B typographic, C light | 1280×640 | `render-social-preview.mjs` over `social-preview/template.html` | 2026-11-06 |
| `store/` | Chrome Web Store icon, five 1280×800 screenshots and two promo tiles, as uploaded ([index](store/README.md)) | various | captured from the 5ef9cd1 build | 2026-10-09 |
| `press-kit.md`, `FAQ.md`, `CHANGELOG.md`, `LICENSE` | The text that goes into the press-kit zip | — | by hand | — |

## Making them again

```sh
pnpm build                       # the extension the screenshots show
pnpm marketing:screenshots       # press-kit/screenshots/*.jpg
pnpm marketing:social-preview    # press-kit/social-preview/*.png
pnpm marketing:manifest          # press-kit/manifest.json
pnpm build:press-kit             # press-kit-v<version>.zip of this folder
```

`capture-screenshots.mjs` loads `dist/chrome-mv3` into a throwaway headless
Chromium profile. It seeds three Chrome bookmark folders and imports a demo
library of 28 public links plus 6 second saves with tracking parameters,
through the overview's own "Import file…" button. Nothing reads a real profile.

The extension has no dark mode a person can switch on, so there are no dark
screenshots. The social preview cards are not uploaded by any script: GitHub
takes them in the repository settings.
