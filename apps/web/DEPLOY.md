# Deploying apps/web

The marketing site is a Next static export (`output: "export"`) served by the
Cloudflare Worker `better-bookmarks` via Workers Static Assets, at
https://bookmarks.trebeljahr.com (custom domain on the Worker; Cloudflare owns
the DNS record and certificate). Preview URL: https://better-bookmarks.ricoslabs.workers.dev

## Automatic

`.github/workflows/deploy-web.yml` builds `apps/web` and runs `wrangler deploy`
on every push to `master` that touches `apps/web/**` or `wrangler.jsonc`.
`CLOUDFLARE_API_TOKEN` (an Editor token scoped to this one Worker) and
`CLOUDFLARE_ACCOUNT_ID` are repo secrets set by `hatchkit cloudflare`.

## Manual

```bash
pnpm --dir apps/web install --frozen-lockfile
pnpm --dir apps/web build
npx wrangler@4 deploy   # from the repo root; reads wrangler.jsonc
```

Needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the environment
(or `wrangler login`).

## Notes

- `apps/web/public/_headers` sets immutable caching for `/_next/static/*` and
  `Content-Type: image/png` for `/opengraph-image` (exported without an
  extension, so the asset server cannot infer it).
- Analytics: self-hosted Plausible at plausible.trebeljahr.com, site
  `bookmarks.trebeljahr.com`; the script tag is in `app/layout.tsx`.
- `metadataBase` in `app/layout.tsx` points OG/Twitter image URLs at the
  production host.
