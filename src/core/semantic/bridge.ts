import { getSettings } from "@/core/storage/settings";
import type { ModelProgressEvent } from "./model";

const OFFSCREEN_URL = "offscreen.html";

export type EmbedResponse =
  | {
      ok: true;
      vector: number[];
      model: string;
      dim: number;
      backend: "webgpu" | "wasm";
    }
  | { ok: false; error: string };

export async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["WORKERS" as chrome.offscreen.Reason],
    justification: "Run transformers.js for semantic search embeddings (WebGPU/WASM).",
  });
}

export async function embedViaOffscreen(text: string): Promise<EmbedResponse> {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ type: "semantic:embed", text }) as Promise<EmbedResponse>;
}

/**
 * Consent-gated boot for the offscreen document. Returns `false` and
 * skips creation when `settings.semanticSearchEnabled` is off — no
 * network calls to huggingface.co, no offscreen doc, no pipeline
 * warmup. Called from `background.ts` on every SW start so a flag flip
 * takes effect on the next boot without dedicated wiring, and directly
 * from the "Enable now" flows so the download starts immediately.
 */
export async function ensureOffscreenIfEnabled(): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.semanticSearchEnabled) return false;
  await ensureOffscreen();
  return true;
}

/**
 * Trigger the offscreen document to load and warm up the pipeline. Used
 * from the sidepanel banner and the Options section when the user
 * accepts the "Enable now" prompt — creating the offscreen doc is the
 * consent signal that unlocks the huggingface.co fetch.
 */
export async function warmupSemanticSearch(): Promise<void> {
  await ensureOffscreen();
  await (chrome.runtime.sendMessage({ type: "semantic:warmup" }) as unknown as Promise<unknown>);
}

/**
 * Subscribe to transformers.js progress events forwarded by the
 * offscreen document. Returns an unsubscribe function.
 */
export function subscribeSemanticProgress(fn: (ev: ModelProgressEvent) => void): () => void {
  const listener = (msg: unknown): void => {
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as { type?: unknown; event?: ModelProgressEvent };
    if (m.type !== "semantic:progress" || !m.event) return;
    fn(m.event);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
