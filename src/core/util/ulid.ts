import { factory, monotonicFactory } from "ulid";

/**
 * ULID wrapper that works in MV3 service workers.
 *
 * The upstream `ulid` package's `detectPrng()` only checks for
 * `window.crypto`. In an MV3 background service worker there is no
 * `window`, so it falls back to `require("crypto")`, which the bundler
 * resolves to ulid's empty browser stub. Calling `nodeCrypto.randomBytes`
 * on that empty object throws:
 *
 *     TypeError: nodeCrypto.randomBytes is not a function
 *
 * Every JS runtime we care about (service worker, side panel, popup,
 * options page, content script) exposes the WebCrypto API on
 * `globalThis.crypto`. Supply our own PRNG that uses it so ulid never
 * goes near node crypto.
 */
const prng = (): number => {
  const buf = new Uint8Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 0xff;
};

export const ulid = factory(prng);
export const monotonicUlid = monotonicFactory(prng);
