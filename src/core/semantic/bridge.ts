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
