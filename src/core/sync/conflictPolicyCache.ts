import type { ConflictField, ConflictSource } from "./pendingConflicts";

/**
 * Short-lived per-field policy cache backing the `ConflictResolverModal`'s
 * "Apply to all future conflicts on this field for 24h" checkbox. Lives in
 * `chrome.storage.local` so both the background service worker (which
 * consults the cache when it resolves a fresh conflict) and the overview
 * page (which seeds the cache from user choices) share one source of truth.
 *
 * Entries expire after 24 hours. Reads that stumble on an expired entry
 * clear it opportunistically so the store doesn't leak stale directives
 * past the window the user actually opted into.
 */
const CACHE_KEY = "__bb_conflict_policy_cache__";
export const CONFLICT_POLICY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = { source: ConflictSource; expiresAt: number };
type Cache = Partial<Record<ConflictField, CacheEntry>>;

function chromeStorage(): typeof chrome.storage.local | null {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  return chrome.storage.local;
}

async function readCache(): Promise<Cache> {
  const storage = chromeStorage();
  if (!storage) return {};
  const result = await storage.get(CACHE_KEY);
  return (result[CACHE_KEY] as Cache | undefined) ?? {};
}

async function writeCache(next: Cache): Promise<void> {
  const storage = chromeStorage();
  if (!storage) return;
  await storage.set({ [CACHE_KEY]: next });
}

export async function getFieldPolicy(
  field: ConflictField,
  now: number = Date.now(),
): Promise<ConflictSource | null> {
  const cache = await readCache();
  const entry = cache[field];
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    delete cache[field];
    await writeCache(cache);
    return null;
  }
  return entry.source;
}

export async function setFieldPolicy(
  field: ConflictField,
  source: ConflictSource,
  now: number = Date.now(),
  ttlMs: number = CONFLICT_POLICY_CACHE_TTL_MS,
): Promise<void> {
  const cache = await readCache();
  cache[field] = { source, expiresAt: now + ttlMs };
  await writeCache(cache);
}

export async function clearFieldPolicyCache(): Promise<void> {
  await writeCache({});
}
