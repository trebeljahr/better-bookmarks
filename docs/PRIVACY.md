# Privacy & Network Egress

Every outbound network call the Better Bookmarks extension can make, and every
external service the surrounding repo can reach, listed here so the audit
trail is public and the "no data leaves your browser" claim on the marketing
site is checkable.

Audit method: grep of `src/`, `src/entrypoints/`, `apps/web/`, and
`apps/rag-cli/` for `sentry`, `posthog`, `mixpanel`, `analytics`, `gtag`,
`_paq`, `fetch(`, `XMLHttpRequest`, `navigator.sendBeacon`, plus a scan for
third-party CDN loads and script tags. Last run against `master` at
commit `e6c7fb7`, 2026-09-09.

## Summary

- **No third-party telemetry, analytics, or crash-reporting SDK is present.**
  No Sentry, PostHog, Mixpanel, Segment, Amplitude, Plausible, Google
  Analytics, Datadog, Bugsnag, LogRocket, Hotjar, FullStory, or similar.
- **The extension makes no network calls to any Better Bookmarks server.**
  There is no server.
- The extension can, under specific conditions, talk to (a) hosts of URLs the
  user has bookmarked, and (b) `huggingface.co` for the semantic-search
  model. Both are documented below.

## Extension network egress

### 1. Dead-link sweep — `src/core/maintenance/deadLinkChecker.ts`

**What:** HTTP HEAD requests to each bookmarked URL's own host to check
whether the page still exists.

**When:** On the `dead-link` alarm. `deadLinkCheckEnabled` defaults to
`true` in `src/shared/types.ts` (`DEFAULT_SETTINGS`). Sweep interval defaults
to 360 minutes (6 h), batch size 50, entries considered stale after 30 days.

**Where the request goes:** the URL the user bookmarked. Requests are HEAD
only, `redirect: "follow"`, `AbortSignal.timeout(8000)`, no body, no custom
headers beyond what `fetch` adds by default.

**What is sent:** the URL itself, plus whatever headers the browser attaches
by default for extension-origin requests. No bookmark titles, notes, tags,
or ratings ever leave the browser through this path.

**How to disable:** Options → toggle *Dead-link checking* off (writes
`deadLinkCheckEnabled: false` to `chrome.storage.local`).

### 2. Opt-in metadata enrichment — `src/core/enrichment/fetcher.ts`

**What:** GET requests to bookmarked URLs to parse `<title>`, `og:*`, and
`meta[name=description]` tags, and to compute a word-count reading-time
estimate.

**When:** Off by default. `networkEnrichmentEnabled: false` in
`DEFAULT_SETTINGS` (`src/shared/types.ts:167`). Only runs on the enrichment
alarm when the user has flipped that setting on. Content-type must be
`text/html`; response is capped at 5 MB and a 15 s timeout.

**Where the request goes:** the URL the user bookmarked.

**What is sent:** the URL. Nothing from Better Bookmarks' own storage.

**How to disable:** stays disabled unless explicitly enabled in Options.

### 3. Semantic-search model download — `src/core/semantic/model.ts`

**What:** `@huggingface/transformers` (transformers.js) pulls the
`Xenova/bge-small-en-v1.5` ONNX model (~33 MB) and its tokenizer files from
the Hugging Face Hub CDN (`huggingface.co`) on first use, then caches them
in the browser cache (`env.useBrowserCache = true`) so subsequent boots are
offline.

**When:** The offscreen document runs `warmup()` on load
(`src/entrypoints/offscreen/main.ts:3`), and the background service worker
boots that document via `ensureOffscreen()` on startup
(`src/entrypoints/background.ts:105`). Net effect: the extension downloads
the model automatically on first service-worker boot after install, not on
an explicit user opt-in. See open GitHub issue for the plan to gate this
behind a setting so it matches the "enable now?" first-run flow described in
`docs/SEMANTIC_SEARCH.md`.

**Where the request goes:** `huggingface.co` (declared in
`wxt.config.ts` under `host_permissions`). The WASM/JS runtime files
(`ort-wasm-simd-threaded.*`) are copied into the extension bundle at build
time (`modules/copy-onnx-wasm.ts`) and served from
`chrome.runtime.getURL("transformers/")`, so those do **not** hit the
network at runtime.

**What is sent:** an HTTP GET for model artifacts under the model's public
path on the Hub. No bookmarks, no queries, no identifying information.
Whatever standard headers Hugging Face's CDN logs (IP, User-Agent, Referer
for the extension origin) will be visible to them for the duration of the
download.

**How to disable today:** not user-facing yet. Interim workaround: run the
extension offline on first boot to prevent the initial download, or block
`huggingface.co` in your network. A settings toggle is tracked in the GH
issue.

### 4. Auto-backup writes — `src/core/backup/autoBackup.ts`

**What:** Writes a JSON snapshot of the bookmark DB to `~/Downloads` via
`chrome.downloads.download` (with a `data:application/json;base64,...` URL
built in-process). Rolling-N retention keeps only the newest N matching
files.

**When:** `autoBackupEnabled: true` in `DEFAULT_SETTINGS`. Alarm-driven
(default every 24 h). `chromeTreeBackup.ts` does the same for a raw Chrome
bookmark-tree snapshot.

**Where the data goes:** the local `~/Downloads` folder. No network
involved. Documented here because "wrote a file to disk" is still an egress
category worth naming for a privacy-conscious user.

**What is written:** the full exported bookmark JSON (URLs, titles, tags,
notes, ratings, connections). The file lives on disk with whatever
permissions the OS gives it.

**How to disable:** Options → toggle *Auto-backup* off.

## Chrome APIs the extension uses

- `chrome.bookmarks.*` — reads and writes the native bookmark tree. Chrome's
  own sync propagates that tree across the user's signed-in Chrome
  installs; that sync is a Chrome feature, not something this extension
  initiates.
- `chrome.storage.local` — settings, per-bookmark metadata index, sync
  state. Not mirrored to `chrome.storage.sync`.
- `chrome.downloads.*` — see auto-backup above.
- `chrome.tabs.*`, `chrome.alarms.*`, `chrome.action.*`, `chrome.omnibox.*`,
  `chrome.contextMenus.*`, `chrome.sidePanel.*`, `chrome.offscreen.*`,
  `chrome.commands.*`, `chrome.windows.*`, `chrome.runtime.*` — UI plumbing,
  no external egress.

## Third-party libraries loaded at runtime

- **`@huggingface/transformers`** — see §3 above. Model weights fetched from
  `huggingface.co` on first use, then browser-cached.
- **`onnxruntime-web`** — WASM runtime for the model. Bundled into the
  extension via `modules/copy-onnx-wasm.ts`, served from
  `chrome.runtime.getURL(...)`. No CDN fetch.
- **Dexie, React, radix-ui, cmdk, lucide-react, sonner, ulid,
  react-window, tailwind-merge, clsx, class-variance-authority,
  next-themes** — all bundled by WXT/Vite into the extension. No runtime
  CDN loads.

## Marketing site — `apps/web/`

- **No analytics or telemetry libraries.** No Plausible, no Vercel Analytics,
  no Google Analytics, nothing.
- **`next/font/google` (Geist).** Next.js downloads the Geist font from
  Google Fonts **at build time** and self-hosts it. Runtime page loads do
  not hit `fonts.googleapis.com` or `fonts.gstatic.com`.
- Outbound links to `github.com/trebeljahr/better-bookmarks` are plain
  `<a>` tags — the user's click, not an automatic request.

## Power-user CLI — `apps/rag-cli/`

The optional local RAG CLI (`bb`) is separately installed and run manually
by the user. It is not part of the extension distribution.

- **`apps/rag-cli/src/embed.ts:41`** — POSTs embed requests to a local
  Ollama server at `http://127.0.0.1:11434/api/embed` (configurable via
  `--base-url`). Loopback address only; nothing leaves the machine unless
  the user points `--base-url` at a remote host.
- **`apps/rag-cli/src/serve.ts:66`** — starts a local HTTP server bound to
  `127.0.0.1:51847` (configurable) that exposes `/health`, `/search`, and
  `/bookmarks`. CORS is set to echo the request origin
  (`cors({ origin: true })`), which is fine for a loopback dev server but
  worth knowing if the user rebinds the listener to a non-loopback address.

## Reproducing this audit

```
cd better-bookmarks
grep -rniE "sentry|posthog|mixpanel|analytics|gtag|_paq|amplitude|plausible|hotjar|fullstory|logrocket|datadog|bugsnag|rollbar|snowplow" src apps
grep -rniE "\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket|EventSource\(" src apps
grep -rniE "importScripts|jsdelivr|unpkg|cdnjs|googleapis|gstatic|huggingface" src apps
```

If any of those greps grows a new hit that is not already listed above,
open a GitHub issue proposing removal or an explicit opt-in toggle before
merging.
