import type { ModelProgressEvent } from "./model";

// Single-text model calls only; no batch caller currently exists. Count UTF-16
// units before tokenization and reject oversize input rather than truncating it.
export const MAX_EMBED_TEXT_LENGTH = 16_384;
export const MAX_PENDING_MODEL_REQUESTS = 8;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSemanticSender(sender: chrome.runtime.MessageSender, pages: string[]): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    // Page hashes and query parameters are UI state, not different principals.
    url.hash = "";
    url.search = "";
    return pages.some((page) => url.href === chrome.runtime.getURL(page));
  } catch {
    return false;
  }
}

export function isEmbedText(text: unknown): text is string {
  return typeof text === "string" && text.length > 0 && text.length <= MAX_EMBED_TEXT_LENGTH;
}

type SemanticRequest = { type: "semantic:warmup" } | { type: "semantic:embed"; text: string };

export function isSemanticRequest(msg: unknown): msg is SemanticRequest {
  if (!isRecord(msg)) return false;
  if (msg.type === "semantic:warmup") return Object.keys(msg).length === 1;
  return msg.type === "semantic:embed" && Object.keys(msg).length === 2 && isEmbedText(msg.text);
}

export function isModelProgressEvent(event: unknown): event is ModelProgressEvent {
  if (!isRecord(event)) return false;
  if (
    typeof event.status !== "string" ||
    !["initiate", "download", "progress", "done", "ready"].includes(event.status)
  )
    return false;
  if (
    Object.keys(event).some(
      (key) => !["status", "name", "file", "loaded", "total", "progress"].includes(key),
    )
  )
    return false;
  for (const key of ["name", "file"]) {
    if (event[key] !== undefined && (typeof event[key] !== "string" || event[key].length > 1024))
      return false;
  }
  for (const key of ["loaded", "total", "progress"]) {
    const value = event[key];
    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > (key === "progress" ? 100 : Number.MAX_SAFE_INTEGER))
    )
      return false;
  }
  return true;
}
