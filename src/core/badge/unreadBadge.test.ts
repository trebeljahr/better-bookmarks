import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listBookmarks, updateBookmark, upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import { BADGE_BG_COLOR, countUnread, formatBadgeText, refreshUnreadBadge } from "./unreadBadge";

type FakeAction = {
  setBadgeText: ReturnType<typeof vi.fn>;
  setBadgeBackgroundColor: ReturnType<typeof vi.fn>;
};

function installChromeAction(): FakeAction {
  const action: FakeAction = {
    setBadgeText: vi.fn(async () => undefined),
    setBadgeBackgroundColor: vi.fn(async () => undefined),
  };
  // biome-ignore lint/suspicious/noExplicitAny: test wiring
  (globalThis as any).chrome = { action };
  return action;
}

async function seedBookmark(url: string, status: "unread" | "read"): Promise<void> {
  const res = await upsertBookmark({ rawUrl: url, status });
  if (!res.ok) throw new Error("seed failed");
  if (status === "read") {
    // upsertBookmark defaults status to "unread"; ensure we set it explicitly.
    await updateBookmark(res.bookmark.id, { status: "read" });
  }
}

beforeEach(async () => {
  await getDB().bookmarks.clear();
});

afterEach(() => {
  resetDBForTests();
  // biome-ignore lint/suspicious/noExplicitAny: test cleanup
  delete (globalThis as any).chrome;
  vi.restoreAllMocks();
});

describe("formatBadgeText", () => {
  it("returns the empty string when there are zero unread", () => {
    expect(formatBadgeText(0)).toBe("");
    expect(formatBadgeText(-3)).toBe("");
  });

  it("returns the count as a string for normal values", () => {
    expect(formatBadgeText(7)).toBe("7");
    expect(formatBadgeText(999)).toBe("999");
  });

  it("caps at 999+", () => {
    expect(formatBadgeText(1000)).toBe("999+");
    expect(formatBadgeText(50_000)).toBe("999+");
  });
});

describe("countUnread", () => {
  it("counts only unread bookmarks", async () => {
    await seedBookmark("https://a.example.com/", "unread");
    await seedBookmark("https://b.example.com/", "read");
    await seedBookmark("https://c.example.com/", "unread");
    expect(await listBookmarks()).toHaveLength(3);
    expect(await countUnread()).toBe(2);
  });
});

describe("refreshUnreadBadge", () => {
  it("writes a numeric text and the brand background when there are unread bookmarks", async () => {
    const action = installChromeAction();
    await seedBookmark("https://a.example.com/", "unread");
    await seedBookmark("https://b.example.com/", "unread");

    await refreshUnreadBadge();

    expect(action.setBadgeText).toHaveBeenCalledWith({ text: "2" });
    expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: BADGE_BG_COLOR });
  });

  it("clears the badge text when there are no unread bookmarks", async () => {
    const action = installChromeAction();
    await seedBookmark("https://a.example.com/", "read");

    await refreshUnreadBadge();

    expect(action.setBadgeText).toHaveBeenCalledWith({ text: "" });
    expect(action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it("writes the 999+ cap when the unread set is huge", async () => {
    const action = installChromeAction();
    const db = getDB();
    const now = Date.now();
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      id: `id-${i}`,
      canonicalUrl: `https://example.com/${i}`,
      originalUrl: `https://example.com/${i}`,
      domain: "example.com",
      title: "",
      description: "",
      note: "",
      tags: [],
      rating: null,
      necessaryTime: null,
      contentType: "unknown" as const,
      language: null,
      status: "unread" as const,
      readAt: null,
      createdAt: now,
      updatedAt: now,
      capturedFrom: "manual" as const,
    }));
    await db.bookmarks.bulkPut(rows);

    await refreshUnreadBadge();

    expect(action.setBadgeText).toHaveBeenCalledWith({ text: "999+" });
  });
});
