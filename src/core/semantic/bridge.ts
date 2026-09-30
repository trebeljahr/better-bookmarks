import { getSettings } from "@/core/storage/settings";
import { isEmbedText, isModelProgressEvent, isRecord, isSemanticSender } from "./messages";
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

let offscreenCreation: Promise<void> | null = null;

export async function ensureOffscreen(): Promise<void> {
  if (!(await getSettings()).semanticSearchEnabled) throw new Error("Semantic search is disabled");
  if (!offscreenCreation) {
    offscreenCreation = createOffscreen().finally(() => {
      offscreenCreation = null;
    });
  }
  await offscreenCreation;
}

async function createOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["WORKERS" as chrome.offscreen.Reason],
    justification: "Run transformers.js for semantic search embeddings (WebGPU/WASM).",
  });
}

export async function embedViaOffscreen(text: string): Promise<EmbedResponse> {
  if (!isEmbedText(text)) return { ok: false, error: "Invalid embedding text" };
  await ensureOffscreen();
  return chrome.runtime.sendMessage({
    type: "semantic:embed",
    text,
  }) as unknown as Promise<EmbedResponse>;
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
  const response: unknown = await chrome.runtime.sendMessage({ type: "semantic:warmup" });
  if (!isRecord(response) || response.ok !== true) {
    throw new Error(
      isRecord(response) && typeof response.error === "string"
        ? response.error
        : "Semantic warmup failed",
    );
  }
}

/**
 * Subscribe to transformers.js progress events forwarded by the
 * offscreen document. Returns an unsubscribe function.
 */
export function subscribeSemanticProgress(fn: (ev: ModelProgressEvent) => void): () => void {
  const listener = (msg: unknown, sender: chrome.runtime.MessageSender): void => {
    if (!isSemanticSender(sender, [OFFSCREEN_URL])) return;
    if (!isRecord(msg) || Object.keys(msg).length !== 2 || msg.type !== "semantic:progress") return;
    if (!isModelProgressEvent(msg.event)) return;
    fn(msg.event);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
