import { describe, expect, it } from "vitest";
import { createInFlightTracker } from "./inFlight";

describe("InFlightTracker", () => {
  it("add then consume returns true", () => {
    const t = createInFlightTracker();
    t.add("create", "key1");
    expect(t.consume("create", "key1")).toBe(true);
  });

  it("consume on missing token returns false", () => {
    const t = createInFlightTracker();
    expect(t.consume("update", "missing")).toBe(false);
  });

  it("kinds are independent", () => {
    const t = createInFlightTracker();
    t.add("create", "x");
    expect(t.consume("update", "x")).toBe(false);
    expect(t.consume("create", "x")).toBe(true);
  });

  it("expires tokens after timeout", () => {
    let now = 1000;
    const t = createInFlightTracker(() => now);
    t.add("create", "stale", 100);
    now += 200;
    expect(t.has("create", "stale")).toBe(false);
    expect(t.consume("create", "stale")).toBe(false);
  });

  it("multiple tokens with different keys all work", () => {
    const t = createInFlightTracker();
    t.add("create", "a");
    t.add("create", "b");
    t.add("remove", "c");
    expect(t.size()).toBe(3);
    expect(t.consume("create", "a")).toBe(true);
    expect(t.consume("create", "b")).toBe(true);
    expect(t.consume("remove", "c")).toBe(true);
    expect(t.size()).toBe(0);
  });
});
