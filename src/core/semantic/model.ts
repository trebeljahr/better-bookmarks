import { env, type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";

export const DEFAULT_MODEL = "Xenova/bge-small-en-v1.5";

export type EmbedResult = {
  vector: Float32Array;
  model: string;
  dim: number;
  backend: "webgpu" | "wasm";
};

let pipe: FeatureExtractionPipeline | null = null;
let chosenBackend: "webgpu" | "wasm" = "wasm";
let configured = false;

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
  try {
    pipe = await pipeline("feature-extraction", DEFAULT_MODEL, {
      device: wantsGPU ? "webgpu" : "wasm",
      dtype: "fp32",
    });
    chosenBackend = wantsGPU ? "webgpu" : "wasm";
  } catch (err) {
    console.warn("[semantic] webgpu init failed, falling back to wasm", err);
    pipe = await pipeline("feature-extraction", DEFAULT_MODEL, {
      device: "wasm",
      dtype: "fp32",
    });
    chosenBackend = "wasm";
  }
  console.log(`[semantic] backend=${chosenBackend} model=${DEFAULT_MODEL} dim=384`);
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
