import {
  env,
  type FeatureExtractionPipeline,
  type ProgressInfo,
  pipeline,
} from "@huggingface/transformers";

export const DEFAULT_MODEL = "Xenova/bge-small-en-v1.5";

export type EmbedResult = {
  vector: Float32Array;
  model: string;
  dim: number;
  backend: "webgpu" | "wasm";
};

/**
 * Progress event emitted by transformers.js during pipeline init.
 * `status: "progress"` events carry `loaded` / `total` byte counts for
 * each downloaded file (there are several — model weights, tokenizer,
 * config). `status: "done"` fires per-file; `status: "ready"` fires
 * once when the whole pipeline is usable.
 */
export type ModelProgressEvent = {
  status: "initiate" | "download" | "progress" | "done" | "ready";
  name?: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
};

export type ProgressListener = (ev: ModelProgressEvent) => void;

let pipe: FeatureExtractionPipeline | null = null;
let chosenBackend: "webgpu" | "wasm" = "wasm";
let configured = false;
let progressListener: ProgressListener | null = null;

/**
 * Register a single listener for transformers.js progress events. The
 * offscreen document uses this to rebroadcast progress to the sidepanel
 * / options page over chrome.runtime.sendMessage so the user sees the
 * ~33 MB one-time download instead of a silent stall.
 */
export function setProgressListener(fn: ProgressListener | null): void {
  progressListener = fn;
}

function emitProgress(ev: ModelProgressEvent): void {
  if (!progressListener) return;
  try {
    progressListener(ev);
  } catch (err) {
    console.warn("[semantic] progress listener threw", err);
  }
}

function configureEnv(): void {
  if (configured) return;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    wasm.wasmPaths = chrome.runtime.getURL("transformers/");
    wasm.numThreads = 1;
  }
  configured = true;
}

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (pipe) return pipe;
  configureEnv();
  const wantsGPU = typeof (navigator as { gpu?: unknown }).gpu !== "undefined";
  const progress_callback = (ev: ProgressInfo) => {
    // UI tracks per-file bytes; aggregate events would count the same bytes twice.
    if (ev.status !== "progress_total") emitProgress(ev);
  };
  try {
    pipe = await pipeline("feature-extraction", DEFAULT_MODEL, {
      device: wantsGPU ? "webgpu" : "wasm",
      dtype: "fp32",
      progress_callback,
    });
    chosenBackend = wantsGPU ? "webgpu" : "wasm";
  } catch (err) {
    console.warn("[semantic] webgpu init failed, falling back to wasm", err);
    pipe = await pipeline("feature-extraction", DEFAULT_MODEL, {
      device: "wasm",
      dtype: "fp32",
      progress_callback,
    });
    chosenBackend = "wasm";
  }
  console.log(`[semantic] backend=${chosenBackend} model=${DEFAULT_MODEL} dim=384`);
  emitProgress({ status: "ready", name: DEFAULT_MODEL });
  return pipe;
}

export async function warmup(): Promise<void> {
  await getPipeline();
}

export async function embed(text: string): Promise<EmbedResult> {
  const p = await getPipeline();
  const t = await p(text, { pooling: "mean", normalize: true });
  return {
    vector: t.data as Float32Array,
    model: DEFAULT_MODEL,
    dim: t.data.length,
    backend: chosenBackend,
  };
}
