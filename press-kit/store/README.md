# Chrome Web Store assets

Uploaded to the Ricos Labs CWS listing. Not touched by any build.

| File | Store slot | Size |
|---|---|---|
| `icon-128.png` | Store icon | 128×128 (copy of `public/full128.png`) |
| `screenshots/01-overview.jpg` … `05-dedup-import.jpg` | Screenshots, in upload order | 1280×800, no alpha |
| `promo-small-440x280.png` | Small promo tile | 440×280 |
| `promo-marquee-1400x560.png` | Marquee promo tile | 1400×560 |

Screenshots were captured headless (Playwright, Chromium) from the 5ef9cd1
build with a 32-bookmark demo library of public links, seeded through the
extension's JSON import; no personal bookmarks. The tiles are HTML rendered
in the same browser: brand blue `#0949BA` (from the icon), system sans.
