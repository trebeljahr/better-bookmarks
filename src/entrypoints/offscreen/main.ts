import { embed, type ModelProgressEvent, setProgressListener, warmup } from "@/core/semantic/model";

/**
 * The offscreen document is only ever created when the user has opted
 * into semantic search (see `background.ts` gate on
 * `settings.semanticSearchEnabled`). Its existence is itself the
 * consent signal, so warming up the pipeline — and thus fetching the
 * ~33 MB `Xenova/bge-small-en-v1.5` weights from huggingface.co — is
 * fine to do at load time. Progress events are rebroadcast over
 * `chrome.runtime` so the sidepanel / options page can render a
 * download bar instead of a silent stall.
 */

setProgressListener((event: ModelProgressEvent) => {
  // The @types/chrome runtime signature for sendMessage is `void` but
  // the runtime returns a Promise. Cast so a rejection (nobody
  // listening — sidepanel closed) is swallowed instead of surfacing as
  // an unhandled rejection.
  const p = chrome.runtime.sendMessage({
    type: "semantic:progress",
    event,
  }) as unknown as Promise<unknown> | undefined;
  p?.catch(() => {
    // No listener attached (sidepanel closed) — dropping progress
    // pings is intentional. The next opened surface picks up the
    // current stage on its own poll.
  });
});

void warmup();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "semantic:warmup") {
    (async () => {
      try {
        await warmup();
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  }
  if (msg?.type !== "semantic:embed") return false;
  (async () => {
    try {
      const { vector, model, dim, backend } = await embed(String(msg.text ?? ""));
      sendResponse({ ok: true, vector: Array.from(vector), model, dim, backend });
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true;
});
