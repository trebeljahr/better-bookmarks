# Better Bookmarks marketing site — deployment

## What this is
The apps/web Next.js site. Hosted by Rico on Vercel. This runbook lists the steps Rico takes — workflow does NOT run them (needs Vercel credentials).

## Prerequisites (one-time)
- Vercel account.
- vercel CLI: pnpm add -g vercel.
- Domain configured in Vercel (Rico picks — e.g. bookmarks.trebeljahr.com).

## First-time link
```
cd apps/web
vercel link
```

## Deploy a preview
```
cd apps/web
vercel deploy
```
Test: /, /privacy, /imprint, /press, /opengraph-image.

## Promote to production
```
cd apps/web
vercel --prod
```

## Post-deploy checks
- Confirm OG meta tags point at the deployed URL.
- curl -I https://<domain>/opengraph-image.
- Confirm favicon set (16/32/180/256/512) is served.

## Current build state (workflow run 2026-09-22)
- pnpm build exit: success
- .next output size: 77M
- Build warnings:
  - `metadataBase` property in metadata export is not set; Next falls back to `http://localhost:3000` for OG/Twitter image URLs. Set `metadata.metadataBase` (e.g. to the production URL) before promoting to production so social embeds resolve absolute image URLs.
  - Node `DEP0205` deprecation warning (`module.register()`); originates in a Next.js internal, not actionable here.
- Routes emitted (all static, prerendered):
  - `/` (1.33 kB / 122 kB First Load JS)
  - `/imprint` (982 B / 115 kB)
  - `/press` (1.33 kB / 122 kB)
  - `/privacy` (978 B / 115 kB)
  - `/opengraph-image` (121 B / 102 kB)
  - `/_not-found` (996 B / 103 kB)
- TODO/PLACEHOLDER surfaces in code:
  - `apps/web/app/page.tsx:168` — TODO: replace with /screenshots/popup.png once captured
  - `apps/web/app/page.tsx:172` — TODO: replace with /screenshots/overview.png once captured
  - `apps/web/app/page.tsx:176` — TODO: replace with /screenshots/tags.png once captured
  - `apps/web/app/page.tsx:180` — TODO: replace with /screenshots/graph.png once captured

## Environment variables
None required at build time. Add PLAUSIBLE_DOMAIN when analytics wired up post-launch.
