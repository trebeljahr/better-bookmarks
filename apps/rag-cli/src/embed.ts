export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
export const DEFAULT_EMBED_MODEL = "nomic-embed-text";
export const MAX_INPUT_CHARS = 6000;

export type EmbedOpts = {
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
};

export function truncate(text: string, max = MAX_INPUT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function metaText(b: {
  title?: string | null;
  domain?: string | null;
  tags?: string[];
  description?: string | null;
  note?: string | null;
}): string {
  const parts = [
    b.title?.trim() || "(untitled)",
    b.domain ? `domain: ${b.domain}` : "",
    b.tags && b.tags.length > 0 ? `tags: ${b.tags.join(", ")}` : "",
    b.description?.trim() ?? "",
    b.note?.trim() ?? "",
  ].filter(Boolean);
  return truncate(parts.join("\n\n"));
}

type OllamaEmbedResponse = {
  embeddings: number[][];
};

export async function embedBatch(inputs: string[], opts: EmbedOpts = {}): Promise<Float32Array[]> {
  if (inputs.length === 0) return [];
  const baseUrl = opts.baseUrl ?? DEFAULT_OLLAMA_URL;
  const model = opts.model ?? DEFAULT_EMBED_MODEL;
  const res = await fetch(`${baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: inputs }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ollama embed HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as OllamaEmbedResponse;
  if (!Array.isArray(json.embeddings) || json.embeddings.length !== inputs.length) {
    throw new Error(
      `ollama embed: expected ${inputs.length} vectors, got ${json.embeddings?.length ?? "?"}`,
    );
  }
  return json.embeddings.map((v) => Float32Array.from(v));
}

export async function embedBatchWithRetry(
  inputs: string[],
  opts: EmbedOpts & { maxAttempts?: number } = {},
): Promise<Float32Array[]> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await embedBatch(inputs, opts);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const wait = 500 * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function vectorToBuffer(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}
