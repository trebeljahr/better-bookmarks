/**
 * Tiny helpers for reading/writing `key=value&key=value` style params inside
 * `window.location.hash`. Used by the overview page to persist state that
 * should survive a refresh — the current bulk selection, the id of the
 * opened bookmark detail — without wiring in a full router.
 *
 * Writes go through `history.replaceState` so they don't push a new history
 * entry, and (importantly) they don't fire a `hashchange` event, so any
 * `hashchange` listener attached elsewhere in the page won't re-enter on
 * our own writes.
 */

export function readHashParams(): Map<string, string> {
  const raw = window.location.hash.replace(/^#/, "");
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) {
      map.set(decodeURIComponent(part), "");
      continue;
    }
    const key = decodeURIComponent(part.slice(0, eq));
    const value = decodeURIComponent(part.slice(eq + 1));
    if (key) map.set(key, value);
  }
  return map;
}

export function writeHashParams(map: Map<string, string>): void {
  const parts: string[] = [];
  for (const [k, v] of map) {
    if (v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  const next = parts.length > 0 ? `#${parts.join("&")}` : "";
  const url = window.location.pathname + window.location.search + next;
  window.history.replaceState(null, "", url);
}
