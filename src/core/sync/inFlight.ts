/**
 * Loop-prevention tokens for bidirectional sync.
 *
 * Before writing into the Chrome bookmarks tree we register a token
 * here so the corresponding Chrome event (which echoes back our own
 * write) can be filtered out.
 *
 * Tokens are short-lived; if a Chrome event doesn't arrive within
 * the timeout we consider them dropped and clear the token to avoid
 * leaks.
 */

const DEFAULT_TIMEOUT_MS = 5000;

type Token = {
  kind: "create" | "update" | "remove" | "move";
  key: string;
  expiresAt: number;
};

class InFlightTracker {
  private tokens = new Map<string, Token>();

  constructor(private now: () => number = Date.now) {}

  add(kind: Token["kind"], key: string, timeoutMs = DEFAULT_TIMEOUT_MS): void {
    const expiresAt = this.now() + timeoutMs;
    this.tokens.set(this.makeKey(kind, key), { kind, key, expiresAt });
  }

  consume(kind: Token["kind"], key: string): boolean {
    this.evictExpired();
    const compoundKey = this.makeKey(kind, key);
    if (!this.tokens.has(compoundKey)) return false;
    this.tokens.delete(compoundKey);
    return true;
  }

  has(kind: Token["kind"], key: string): boolean {
    this.evictExpired();
    return this.tokens.has(this.makeKey(kind, key));
  }

  clear(): void {
    this.tokens.clear();
  }

  size(): number {
    this.evictExpired();
    return this.tokens.size;
  }

  private makeKey(kind: Token["kind"], key: string): string {
    return `${kind}:${key}`;
  }

  private evictExpired(): void {
    const now = this.now();
    for (const [k, t] of this.tokens) {
      if (t.expiresAt <= now) this.tokens.delete(k);
    }
  }
}

export const inFlight = new InFlightTracker();

export function createInFlightTracker(now?: () => number): InFlightTracker {
  return new InFlightTracker(now);
}

export type { InFlightTracker };
