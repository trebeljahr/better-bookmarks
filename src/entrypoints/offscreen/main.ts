import { embed, warmup } from "@/core/semantic/model";

void warmup();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
