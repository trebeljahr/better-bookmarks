import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";
import { initDb } from "./db.js";
import { serve } from "./serve.js";

test("local API rejects missing tokens, hostile origins and rebinding hosts", async () => {
  const token = "test-only-token-".repeat(3);
  const origin = "chrome-extension://test-extension";
  const db = initDb(":memory:");
  const handle = await serve(db, { port: 0, token, origins: [origin] });
  const headers = { Authorization: `Bearer ${token}`, Origin: origin };
  try {
    assert.equal((await fetch(`${handle.url}/health`)).status, 401);
    assert.equal((await fetch(`${handle.url}/search`)).status, 401);
    assert.equal(
      (
        await fetch(`${handle.url}/bookmarks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookmarks: [] }),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${handle.url}/health`, {
          headers: { ...headers, Authorization: "Bearer invalid" },
        })
      ).status,
      401,
    );
    assert.equal((await fetch(`${handle.url}/health`, { headers })).status, 200);
    assert.equal(
      (
        await fetch(`${handle.url}/health`, {
          headers: { ...headers, Origin: "https://evil.invalid" },
        })
      ).status,
      403,
    );
    const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        `${handle.url}/health`,
        { headers: { ...headers, Host: "evil.invalid" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(reboundStatus, 403);
    const preflight = await fetch(`${handle.url}/bookmarks`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    const ingestHeaders = { ...headers, "Content-Type": "application/json" };
    const accepted = await fetch(`${handle.url}/bookmarks`, {
      method: "POST",
      headers: ingestHeaders,
      body: JSON.stringify({
        bookmarks: [
          {
            id: "test-bookmark",
            canonicalUrl: "https://example.com/",
            title: "Test bookmark",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    });
    assert.equal(accepted.status, 200);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM bookmarks").get() as { count: number }).count,
      1,
    );
    assert.equal(
      (
        await fetch(`${handle.url}/bookmarks`, {
          method: "POST",
          headers: ingestHeaders,
          body: JSON.stringify({ bookmarks: Array(501).fill({}) }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${handle.url}/bookmarks`, {
          method: "POST",
          headers: ingestHeaders,
          body: JSON.stringify({ text: "a".repeat(2 * 1024 * 1024) }),
        })
      ).status,
      413,
    );
  } finally {
    await handle.close();
    db.close();
  }
});
