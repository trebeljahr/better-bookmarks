# Semantic Search

The thing that makes Better Bookmarks *better*: search by meaning, not just by the words you happened to type into the title field three years ago.

This doc is both the design and the implementation prompt. A fresh agent should be able to read it and ship the feature.

## Why this matters

Today's search (`src/core/search/`) is an inverted index over title + description + note + tag + domain. It finds bookmarks containing the exact terms you queried. That is the floor; it does not find a bookmark titled "vaswani-2017" when you query "transformer attention paper."

Semantic search closes that gap. It is the single feature most likely to make someone uninstall Pocket / Raindrop / native Chrome bookmarks and stay here.

**The bar is the wow moment.** A new user opens the sidepanel, types "ML paper about attention," and the right bookmark surfaces even though the title is opaque. They go "oh." They tell a friend.

## Non-negotiable constraints

1. **Zero install for non-technical users.** No terminal, no Node, no Ollama, no Docker. They install one extension and it works.
2. **Runs entirely on their machine.** No cloud APIs by default. Privacy is a primary feature for a personal bookmarks tool. No telemetry by default.
3. **Works offline after first setup.**
4. **Cross-browser.** Chrome + Firefox via WXT. Falls back to WASM where WebGPU absent.
5. **Doesn't melt their laptop.** Embed jobs respect CPU; throttled; pausable; resumable.
6. **Bundle size discipline.** Model is downloaded on first enable, not bundled in the .zip.

Anything that breaks these is opt-in for power users (see "Power-user tier" below).

## Vision (the user story)

A user installs the extension. On first sidepanel open they see a banner: *"Better Bookmarks supports semantic search ✨ — finds bookmarks by meaning, not just keywords. Enable now? (~33 MB one-time download.)"* They click Enable.

Progress UI:
1. Downloads the model (10–30 sec on broadband).
2. Initializes WebGPU (or falls back to WASM).
3. Embeds existing bookmarks in batches in the background. Progress shown ("4,823 / 20,480 — at this rate ~12 min").
4. Status badge turns green: "Semantic search ready."

They never opened a terminal. From that point on, every new bookmark is embedded within seconds in the background. Search has a mode toggle (Keyword | Semantic | Hybrid, default Hybrid) and a score badge on semantic hits.

## Architecture

### Stack

| Concern | Choice |
|---|---|
| Embedding runtime | `@huggingface/transformers` (formerly `@xenova/transformers`) — ONNX in JS |
| Backend | WebGPU when available, WASM (with SIMD threads) fallback |
| Default model | `Xenova/bge-small-en-v1.5` (33 MB, 384-dim) — English-first, strong quality/size ratio |
| Storage | Dexie — new `vectors` table |
| KNN | Linear cosine scan over in-memory `Float32Array` cache (sub-100 ms at 20k) |
| Embed host | WXT offscreen document (service workers can't host WebGPU contexts) |

Model is configurable. Document `multilingual-e5-small` (115 MB, 384-dim) for non-English audiences and `nomic-embed-text-v1.5` (137 MB, 768-dim) as a quality upgrade option. The vector dimension is fixed per database; switching models requires re-embedding (gated by an explicit user action).

### Message flow

```
sidepanel  ─query──▶  background.ts  ─proxy──▶  offscreen doc (transformers.js)
options    ─enqueue▶  background.ts                          │
                              │                              ▼
                              ├──persist vectors──▶  Dexie (vectors table)
                              │
                              ▼
                       in-memory vector cache (Float32Array, lazy-loaded on first query)
```

The offscreen doc only does embedding (CPU/GPU work). Background owns scheduling and persistence. Sidepanel/options own UI.

### New files

```
src/core/semantic/
  model.ts          # load + cache pipeline (transformers.js), pick backend
  store.ts          # Dexie CRUD for vectors table
  cache.ts          # in-memory Float32Array of all vectors; lazy-load, hot-update on writes
  search.ts         # cosine search over cache, with filter pushdown to bookmarks
  embedQueue.ts     # priority queue, batching, throttling, resumability
  wire.ts           # subscribes to bookmark mutations → enqueue embed/delete
  bridge.ts         # background↔offscreen typed message channel
  index.ts          # public API for hooks/UI

src/entrypoints/offscreen/
  index.html        # empty page; required by chrome.offscreen
  main.ts           # listens for embed messages; calls model.ts; returns vectors

src/entrypoints/sidepanel/
  SearchModeToggle.tsx
  SemanticResultRow.tsx     # score badge + snippet
  (modify existing SearchBar to feed mode)

src/entrypoints/options/
  SemanticSection.tsx       # enable toggle, progress, model picker, re-embed, stats

src/hooks/
  useSemanticSearch.ts
  useEmbedProgress.ts
```

### Schema additions (Dexie v3 migration)

```ts
// src/core/storage/db.ts — version 3
db.version(3).stores({
  vectors: "id,model,dim,embeddedAt",
});

// Vector row shape
type VectorRow = {
  id: string;            // matches Bookmark.id
  embedding: Uint8Array; // Float32Array.buffer packed; length = dim * 4
  model: string;         // e.g. "Xenova/bge-small-en-v1.5"
  dim: number;           // 384, 768, ...
  embeddedAt: number;
  metaHash: string;      // sha1(title|description|note|tags|canonicalUrl) — re-embed trigger
};
```

Settings additions (`src/shared/types.ts`):
```ts
semanticEnabled: boolean;          // default false; user must opt-in
semanticModel: string;             // default "Xenova/bge-small-en-v1.5"
semanticHybridWeight: number;      // 0..1 share of semantic vs keyword in hybrid (default 0.6)
```

## UX flows

### First-run prompt
- Trigger: first sidepanel open after install (or after upgrade if user hasn't seen it yet)
- Banner across the top of the sidepanel:
  > ✨ Try semantic search — finds bookmarks by meaning. ~33 MB one-time download, runs on your machine. [Enable] [Later]
- Dismissable; sets `settings.semanticPromptDismissedAt`
- Clicking Enable → routes to options page Semantic section in "enabling" state

### Initial embed
Steps shown in a stepper:
1. **Download model** — progress bar tied to fetch progress events
2. **Initialize backend** — single line: "Using WebGPU" or "Using WASM"
3. **Embed bookmarks** — `n / total` with rolling ETA based on last 60 sec throughput
4. **Done** — checkmark, total time, vector storage size

Cancellable at any step. Persists state in `chrome.storage.local` so reload resumes.

### Daily use
- New bookmark added → background's existing enrichment queue pattern (see `src/entrypoints/background.ts`) adds a `semantic-embed` job; runs within seconds
- Sidepanel search has a mode toggle:
  - **Hybrid** (default): cosine top-K ∪ keyword top-K, scored by `w_sem * cos + (1-w_sem) * normalized_bm25`, dedupe by id
  - **Semantic**: pure cosine
  - **Keyword**: existing inverted index
- Semantic/Hybrid results show a small score badge and (later) a "matched on: …" snippet
- Mode persists per-session

### Options — Semantic section
- Enable toggle
- Model picker (with download size shown per option)
- "Re-embed all" button (greyed unless model differs from current embeddings)
- Stats card: bookmarks total, embedded count + percent, last embed timestamp, vector storage MB
- "Pause embedding" toggle (for users on battery)
- Backend indicator: WebGPU / WASM

### Error states
- **Model download fails** — retry button; if user previously downloaded, offer "use cached model"
- **WebGPU init fails** — silently fall back to WASM; log to console; note in stats
- **Embed job throws** — skip, log, retry next sweep; mark bookmark for retry
- **Vector storage > 500 MB** — banner: "Vector storage is large. Re-embed with a smaller model?"
- **Bookmark mutated but semantic disabled** — no-op; mutation hook respects the flag

## Performance targets

| Metric | Target |
|---|---|
| Search latency, 20k vectors, linear scan | p50 < 100 ms, p95 < 250 ms |
| Embed throughput (WebGPU, M-series) | ≥ 150 tokens/sec |
| Embed throughput (WASM fallback) | ≥ 30 tokens/sec |
| Initial embed of 20k bookmarks (WebGPU) | < 15 min |
| Initial embed of 20k bookmarks (WASM) | < 90 min |
| JS bundle size impact | +60 KB (transformers.js loader only; model is external) |
| Vector storage, 20k @ 384-dim | ~30 MB |

If linear scan stops meeting target at >100k bookmarks, swap in `hnswlib-wasm`. Not in v1 scope.

## Power-user tier (separate, optional, already scaffolded in `apps/`)

Some users will want more. The extension auto-detects `http://127.0.0.1:51847/health` on startup. If reachable:

- Uses the local CLI server for **page-content RAG** (crawled bodies, chunked + embedded server-side with the heavier `nomic-embed-text` model)
- Surfaces page-level snippets in results
- Otherwise falls back silently to the in-browser path

The CLI also exposes:
- An MCP server (`apps/rag-mcp/`) Claude Code can call as `bookmarks_search`
- A Raycast extension shell (`apps/raycast-bookmarks/`)

Non-technical users never see or need any of this. Power users get extra depth without changing the default experience.

## Out of scope for v1

- Page-content crawl inside the browser (CORS jungle for arbitrary domains; defer to the power-user CLI)
- HNSW / ANN index (linear scan fast enough below 100k)
- Cloud embedding APIs (privacy posture; can add later behind a clearly-labeled flag)
- Multi-vector per bookmark (one meta embedding only)
- Cross-lingual reranking
- Embedding `Edge` relationships or `Tag` descriptions

## Acceptance criteria

1. Fresh install on a clean profile → enable semantic in ≤ 3 clicks → embedding starts and shows progress.
2. Query "ML paper about attention" returns the Attention paper bookmark in the top 3 even when its title is opaque (e.g. "vaswani-2017").
3. Creating a new bookmark causes its vector to be available to search within 5 seconds (assuming idle browser).
4. Search p50 latency < 100 ms over 20k embedded bookmarks (linear scan).
5. Browser restart resumes any pending embed jobs from where they paused.
6. Switching the model in settings prompts before re-embedding; "Re-embed all" works.
7. Disabling semantic in settings stops queue work and frees the in-memory cache.
8. Firefox build (`pnpm dev:firefox`) works end-to-end via WASM backend.
9. No network requests after initial model download (verified via DevTools).
10. Existing keyword search continues to work, untouched.

## Edge cases to handle explicitly

- User has 100k+ bookmarks → warn before starting initial embed; offer to embed only top-rated subset
- User is on battery → pause queue (`navigator.getBattery()` if available; else just smaller batches)
- User imports a 50k Goodreads dump → queue absorbs gracefully, throttled
- User deletes a bookmark → vector row cascades via wire.ts hook
- User edits a bookmark's title/note → meta_hash check decides whether to re-embed (cheap if unchanged)
- Two browser windows open → only one offscreen doc instance (chrome.offscreen.hasDocument)
- Service worker restarts mid-embed → background re-attaches to offscreen, picks up queue
- Model file corrupt after partial download → checksum check, redownload

## Implementation order (recommended)

1. Wire offscreen doc + transformers.js, prove single-embed round-trip with a hardcoded string
2. Dexie schema v3 migration + `store.ts` CRUD
3. `embedQueue.ts` + `wire.ts` — get new bookmarks auto-embedded
4. `cache.ts` + `search.ts` + minimal sidepanel toggle, test on small set
5. Options Semantic section: enable flow + progress UI + initial embed
6. Hybrid scoring + dedupe
7. Settings: model picker, re-embed all
8. Error states + battery awareness + throttle
9. Firefox parity check
10. Power-user tier detection (`fetch localhost:51847/health` on startup)

## Open product decisions (before starting)

These should be locked by the product owner:

1. **Default model.** `bge-small-en` (English, 33 MB) is the recommendation. Switch to `multilingual-e5-small` (115 MB) only if the audience is non-English-first.
2. **Auto-enable for new users vs. always opt-in.** Always opt-in is safer (privacy + bandwidth). Recommended.
3. **Hybrid weight default.** Suggest 0.6 semantic / 0.4 keyword. Tune after dogfooding.
4. **Where does the model live?** HuggingFace CDN (default for transformers.js) is fine. If you want a fully self-hosted option, mirror the ONNX files to GitHub Releases for this repo.
5. **Telemetry.** Default off. Even basic "how many users enabled this" needs an explicit opt-in checkbox.

## References

- transformers.js: https://huggingface.co/docs/transformers.js
- WXT offscreen: https://wxt.dev/guide/essentials/entrypoints.html
- chrome.offscreen API: https://developer.chrome.com/docs/extensions/reference/api/offscreen
- BGE small en v1.5 ONNX: https://huggingface.co/Xenova/bge-small-en-v1.5
