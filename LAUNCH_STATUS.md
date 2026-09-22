# Better Bookmarks — launch status (2026-09-22 workflow snapshot)

## Version

- `package.json`: **1.0.0-rc.1**
- `CHANGELOG.md`: **[1.0.0-rc.1] — 2026-09-13**
- Git tag: **not yet** — Rico creates via `scripts/release-dry-run.sh` + `gh release create`.

## What this workflow produced

| Phase | Deliverable | Path | Repo |
| --- | --- | --- | --- |
| Launch copy bundle | Show HN post | `.../better-bookmarks/better-bookmarks-show-hn-post.md` | ricos.site (main) |
| Launch copy bundle | Reddit r/chrome_extensions post | `.../better-bookmarks/better-bookmarks-reddit-chrome-extensions-post.md` | ricos.site (main) |
| Launch copy bundle | Launch blog post | `.../better-bookmarks/better-bookmarks-launch-blog-post.md` | ricos.site (main) |
| Launch copy bundle | Newsletter | `.../better-bookmarks/better-bookmarks-newsletter-launch.md` | ricos.site (main) |
| Launch copy bundle | Bluesky thread | `.../better-bookmarks/better-bookmarks-bluesky-thread.md` | ricos.site (main) |
| Launch copy bundle | Mastodon thread | `.../better-bookmarks/better-bookmarks-mastodon-thread.md` | ricos.site (main) |
| Launch copy bundle | Cold outreach emails | `.../better-bookmarks/better-bookmarks-cold-outreach-emails.md` | ricos.site (main) |
| Press kit (`1c67963`) | Bundle root | `press-kit/press-kit.md` | better-bookmarks (master) |
| Press kit (`1c67963`) | License | `press-kit/LICENSE` | better-bookmarks (master) |
| Press kit (`1c67963`) | Changelog snapshot | `press-kit/CHANGELOG.md` | better-bookmarks (master) |
| Press kit (`1c67963`) | FAQ (7 Q/A) | `press-kit/FAQ.md` | better-bookmarks (master) |
| Press kit (`1c67963`) | Screenshot placeholders | `press-kit/PLACEHOLDER-SCREENSHOTS.md` | better-bookmarks (master) |
| Press kit (`1c67963`) | Zip builder | `scripts/build-press-kit.mjs` (npm `build:press-kit`) | better-bookmarks (master) |
| Dark-mode audit (`ea50e09`) | Programmatic WCAG contrast verdicts | `docs/DARK_MODE_AUDIT.md` | better-bookmarks (master) |
| Release dry-run (`0865d6d`) | Dry-run script | `scripts/release-dry-run.sh` | better-bookmarks (master) |
| Release dry-run (`0865d6d`) | Release notes | `scripts/release-notes-v1.0.0-rc.1.md` | better-bookmarks (master) |
| Web deploy readiness (`065262b`) | Manual deploy runbook | `apps/web/DEPLOY.md` | better-bookmarks (master) |
| Firefox sanity (`da9c1e3`) | Install-check protocol | `scripts/firefox-install-check.md` | better-bookmarks (master) |

## What still needs Rico

### Blockers for launch day

1. **Chrome Web Store submission + approval cycles** — GUI-only, unbounded (~2 h to submit, then wait days for review; iterate on rejections). Blocks item 1 of the runbook.
2. **Five 1280×800 CWS screenshots, one 440×280 promo tile** — requires running the extension UI and capturing polished shots. ~2 h.
3. **Deploy `apps/web` to Vercel with DNS + TLS** — needs Vercel creds and domain access; follow `apps/web/DEPLOY.md`. ~30 min once creds are in hand.
4. **Fix hero + FAQ copy in `apps/web/app/page.tsx`** — dead `<a href="#">Add to Chrome</a>` hero button and the "Does it work in Firefox?" answer both still point at non-existent releases. Four `TODO: replace with /screenshots/*.png` markers as well. ~1 h. Blocks item 2.
5. **Set `manifest.description` in `wxt.config.ts`** to the ≤132-char marketing short description; verify `pnpm build` writes it to `dist/chrome-mv3/manifest.json`. ~15 min. Bundled with any final `.zip` upload.
6. **Draft `docs/CWS_LISTING.md`** — three-paragraph long description for the CWS form, matching shipped behaviour (opt-in semantic model, HEAD-only dead-link checker). ~1 h. Feeds directly into item 1.
7. **Manual Firefox load test via `about:debugging`** — verify the built zip installs and the overview + side panel work end-to-end. Protocol at `scripts/firefox-install-check.md`. ~30 min.
8. **Dark-mode visual review** — 11 light-mode WCAG-fails and 3 dark-mode fails from `docs/DARK_MODE_AUDIT.md` need eyes-on judgment before fixes ship. ~1 h.
9. **Manual keyboard-walkthrough** for accessibility (complements automated axe pass). ~30 min.
10. **`gh release create v1.0.0-rc.1`** — run `scripts/release-dry-run.sh`, execute the printed command, attach the Chrome + Firefox zips. ~15 min. Depends on 1.

### Can happen after launch day

- **Firefox AMO submission** — separate review queue; safe to file post-launch. ~1 h.
- **60-second walkthrough video** — nice to have on the marketing site and Show HN comments, not blocking. ~2 h.
- **Five 1920×1080 hero screenshots** for blog post and press outreach. ~1 h.
- **Press-kit zip hosting** at a stable URL (S3, ricos.site, GitHub release asset). ~30 min once screenshots are done.
- **Skippable three-step onboarding** shown once after install (dedup / tags vs folders / Chrome sync). ~1 day.
- **"Report a bug" link** in options page + marketing-site FAQ + README section. ~1 h.
- **New manual-notes file (`2-better-bookmarks-manual-notes.md`)** once real playtesting + launch-day feedback surfaces the next round.

## Open GitHub issues

`gh issue list --repo trebeljahr/better-bookmarks --state open` → **none open**.

## Chip state in the vault

**33 chips complete, 6 open** in `1-better-bookmarks-manual-notes.md`. All 6 open chips are the "Moved from launch kits (2026-09-15)" items above (manifest description, CWS long description, Firefox FAQ answer, dead hero button, onboarding, report-a-bug link).

## Launch-day runbook (cheat sheet)

1. Confirm CWS approval.
2. Deploy `apps/web` to Vercel — see `apps/web/DEPLOY.md`.
3. Run `scripts/release-dry-run.sh`, copy the printed `gh` command, execute it, upload zips.
4. Publish blog post from `/Users/rico/projects/ricos.site/src/content/Notes/texts/misc/claude-chat-gpt-generated/projects/better-bookmarks/better-bookmarks-launch-blog-post.md` to ricos.site.
5. Send newsletter — `/Users/rico/projects/ricos.site/src/content/Notes/texts/misc/claude-chat-gpt-generated/projects/better-bookmarks/better-bookmarks-newsletter-launch.md`.
6. Show HN — `/Users/rico/projects/ricos.site/src/content/Notes/texts/misc/claude-chat-gpt-generated/projects/better-bookmarks/better-bookmarks-show-hn-post.md`.
7. Bluesky / Mastodon threads — vault (`better-bookmarks-bluesky-thread.md`, `better-bookmarks-mastodon-thread.md`).
8. Cold outreach — `/Users/rico/projects/ricos.site/src/content/Notes/texts/misc/claude-chat-gpt-generated/projects/better-bookmarks/better-bookmarks-cold-outreach-emails.md`, personalise per recipient.
9. Reddit post — `/Users/rico/projects/ricos.site/src/content/Notes/texts/misc/claude-chat-gpt-generated/projects/better-bookmarks/better-bookmarks-reddit-chrome-extensions-post.md`.
10. Answer HN comments for 6 hours. Do NOT refresh Plausible every 30 seconds.

## Links

- Repo: `/Users/rico/projects/better-bookmarks`
- Vault: `/Users/rico/projects/ricos.site/src/content/Notes/texts/misc/claude-chat-gpt-generated/projects/better-bookmarks`
- Marketing site (post-deploy): TBD
- Design docs: `/Users/rico/projects/better-bookmarks/docs/`
- Style rules: `/Users/rico/projects/ricos.site/src/content/Notes/texts/misc/claude-chat-gpt-generated/projects/marketing-plans/copywriting-style-rules.md`
