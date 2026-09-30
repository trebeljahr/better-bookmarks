import {
  isModelProgressEvent,
  isRecord,
  isSemanticRequest,
  isSemanticSender,
  MAX_PENDING_MODEL_REQUESTS,
} from "@/core/semantic/messages";
import { embed, type ModelProgressEvent, setProgressListener, warmup } from "@/core/semantic/model";

// Only the opt-in UI currently sends model requests. No content-script or
// external/page-message bridge is part of this protocol.
const REQUEST_PAGES = ["options.html", "sidepanel.html"];
let pending = 0;
let modelTail: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  if (pending >= MAX_PENDING_MODEL_REQUESTS)
    return Promise.reject(new Error("Semantic model is busy"));
  pending++;
  const result = modelTail.then(work);
  // Keep capacity reserved until work actually settles. A timeout must not
  // free a slot while WASM/GPU inference is still running.
  modelTail = result
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      pending--;
    });
  return result;
}

// At most one progress message in flight plus one replacement event. Slow
// receivers cannot accumulate an unbounded set of sendMessage promises.
let sendingProgress = false;
let latestProgress: ModelProgressEvent | null = null;
async function flushProgress(): Promise<void> {
  sendingProgress = true;
  try {
    while (latestProgress) {
      const event = latestProgress;
      latestProgress = null;
      try {
        await chrome.runtime.sendMessage({ type: "semantic:progress", event });
      } catch {
        // No open UI receiver.
      }
    }
  } finally {
    sendingProgress = false;
  }
}
setProgressListener((event) => {
  if (!isModelProgressEvent(event)) return;
  latestProgress = event;
  if (!sendingProgress) void flushProgress();
});

// Creation is consent-gated by the bridge. Keep the existing document-lifetime
// consent behavior; the offscreen context uses runtime messaging only.
// Startup shares the same queue as requests, preventing duplicate pipeline init.
void enqueue(warmup).catch((err) => console.warn("[semantic] warmup failed", err));

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (!isSemanticSender(sender, REQUEST_PAGES)) return false;
  if (!isRecord(msg) || (msg.type !== "semantic:warmup" && msg.type !== "semantic:embed"))
    return false;
  if (!isSemanticRequest(msg)) {
    sendResponse({ ok: false, error: "Invalid semantic request" });
    return false;
  }
  void enqueue(async () => {
    if (msg.type === "semantic:warmup") {
      await warmup();
      return { ok: true };
    }
    const { vector, model, dim, backend } = await embed(msg.text);
    return { ok: true, vector: Array.from(vector), model, dim, backend };
  }).then(
    (response) => sendResponse(response),
    (err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
  return true;
});
