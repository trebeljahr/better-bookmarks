import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "@/lib/time";

const NOW = 1_800_000_000_000;

describe("formatRelativeTime", () => {
  it("returns 'just now' for anything under a minute", () => {
    expect(formatRelativeTime(NOW - 500, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe("just now");
  });

  it("returns minutes/hours/days/weeks/months/years buckets", () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(formatRelativeTime(NOW - 3 * 3600_000, NOW)).toBe("3h ago");
    expect(formatRelativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2d ago");
    expect(formatRelativeTime(NOW - 3 * 7 * 86_400_000, NOW)).toBe("3w ago");
    expect(formatRelativeTime(NOW - 60 * 86_400_000, NOW)).toBe("2mo ago");
    expect(formatRelativeTime(NOW - 400 * 86_400_000, NOW)).toBe("1y ago");
  });

  it("treats future timestamps as 'just now'", () => {
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe("just now");
  });
});
