import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSON_EXPORT_VERSION } from "../importExport/json";
import { upsertBookmark } from "../storage/bookmarks";
import { getDB, resetDBForTests } from "../storage/db";
import {
  BACKUP_FILENAME_REGEX,
  backupFileNameFor,
  cleanupOldBackups,
  runBackupOnce,
} from "./autoBackup";

type DownloadItem = {
  id: number;
  filename: string;
  startTime: string;
};

type StorageEntry = Record<string, unknown>;

type FakeChrome = {
  api: {
    storage: {
      local: {
        get: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
      };
    };
    downloads: {
      download: ReturnType<typeof vi.fn>;
      search: ReturnType<typeof vi.fn>;
      erase: ReturnType<typeof vi.fn>;
      removeFile: ReturnType<typeof vi.fn>;
    };
  };
  items: DownloadItem[];
};

function fakeChrome(initialItems: DownloadItem[] = []): FakeChrome {
  const items = [...initialItems];
  const store: StorageEntry = {};
  const api = {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[] | null) => {
          if (keys === null) return { ...store };
          if (typeof keys === "string") {
            return keys in store ? { [keys]: store[keys] } : {};
          }
          const out: StorageEntry = {};
          for (const k of keys) {
            if (k in store) out[k] = store[k];
          }
          return out;
        }),
        set: vi.fn(async (entries: StorageEntry) => {
          Object.assign(store, entries);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete store[k];
        }),
      },
    },
    downloads: {
      download: vi.fn(async (opts: { url: string; filename: string }) => {
        const id = items.length + 1;
        items.push({
          id,
          filename: opts.filename,
          startTime: new Date(Date.now() + id).toISOString(),
        });
        return id;
      }),
      search: vi.fn(async (q: { filenameRegex?: string }) => {
        if (!q.filenameRegex) return [...items];
        const re = new RegExp(q.filenameRegex);
        return items.filter((it) => re.test(it.filename));
      }),
      erase: vi.fn(async (q: { id: number }) => {
        const idx = items.findIndex((it) => it.id === q.id);
        if (idx >= 0) items.splice(idx, 1);
        return [q.id];
      }),
      removeFile: vi.fn(async (_id: number) => {
        // no-op: in real chrome this removes from disk but leaves the
        // history entry; erase() drops the history entry afterwards.
      }),
    },
  };
  return { api, items };
}

function installChrome(fake: FakeChrome) {
  // biome-ignore lint/suspicious/noExplicitAny: test wiring
  (globalThis as any).chrome = fake.api;
}

beforeEach(async () => {
  await getDB().bookmarks.clear();
  await getDB().tags.clear();
  await getDB().edges.clear();
});

afterEach(() => {
  resetDBForTests();
  // biome-ignore lint/suspicious/noExplicitAny: test cleanup
  delete (globalThis as any).chrome;
  vi.restoreAllMocks();
});

describe("backupFileNameFor", () => {
  it("formats YYYY-MM-DD-HHMMSS with the configured prefix", () => {
    const t = new Date(2026, 4, 17, 9, 7, 3).getTime(); // local time
    const name = backupFileNameFor(t);
    expect(name).toMatch(/^better-bookmarks-backup-2026-05-17-090703\.json$/);
  });

  it("pads single-digit fields", () => {
    const t = new Date(2026, 0, 1, 0, 0, 0).getTime();
    expect(backupFileNameFor(t)).toBe("better-bookmarks-backup-2026-01-01-000000.json");
  });
});

describe("runBackupOnce", () => {
  it("downloads a versioned JSON blob and reports filename + byteSize", async () => {
    const fake = fakeChrome();
    installChrome(fake);

    await upsertBookmark({ rawUrl: "https://example.com/x", title: "X" });

    const now = new Date(2026, 4, 17, 12, 34, 56).getTime();
    const result = await runBackupOnce(now);

    expect(result.fileName).toBe("better-bookmarks-backup-2026-05-17-123456.json");
    expect(result.byteSize).toBeGreaterThan(0);

    expect(fake.api.downloads.download).toHaveBeenCalledTimes(1);
    const arg = fake.api.downloads.download.mock.calls[0][0];
    expect(arg.filename).toBe(result.fileName);
    expect(arg.url).toMatch(/^data:application\/json;base64,/);

    // The payload encoded in the data URL must round-trip back to a versioned
    // exportJson snapshot whose bookmarks include the seeded entry.
    const base64 = arg.url.replace(/^data:application\/json;base64,/, "");
    // biome-ignore lint/suspicious/noExplicitAny: decoded JSON is unconstrained
    const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf-8")) as any;
    expect(decoded.version).toBe(JSON_EXPORT_VERSION);
    expect(typeof decoded.exportedAt).toBe("number");
    expect(decoded.bookmarks[0].title).toBe("X");
  });

  it("uses uniquify conflictAction so concurrent backups don't clobber", async () => {
    const fake = fakeChrome();
    installChrome(fake);
    await runBackupOnce(Date.now());
    const arg = fake.api.downloads.download.mock.calls[0][0];
    expect(arg.conflictAction).toBe("uniquify");
    expect(arg.saveAs).toBe(false);
  });
});

describe("cleanupOldBackups", () => {
  it("keeps newest N and erases + removes the rest", async () => {
    const items: DownloadItem[] = [
      {
        id: 1,
        filename: "better-bookmarks-backup-2026-05-10-000000.json",
        startTime: "2026-05-10T00:00:00Z",
      },
      {
        id: 2,
        filename: "better-bookmarks-backup-2026-05-11-000000.json",
        startTime: "2026-05-11T00:00:00Z",
      },
      {
        id: 3,
        filename: "better-bookmarks-backup-2026-05-12-000000.json",
        startTime: "2026-05-12T00:00:00Z",
      },
      {
        id: 4,
        filename: "better-bookmarks-backup-2026-05-13-000000.json",
        startTime: "2026-05-13T00:00:00Z",
      },
      {
        id: 5,
        filename: "better-bookmarks-backup-2026-05-14-000000.json",
        startTime: "2026-05-14T00:00:00Z",
      },
      // Unrelated file — must be ignored by the regex.
      { id: 99, filename: "other-file.json", startTime: "2026-05-09T00:00:00Z" },
    ];
    const fake = fakeChrome(items);
    installChrome(fake);

    await cleanupOldBackups(2);

    // search was queried with the BACKUP_FILENAME_REGEX
    expect(fake.api.downloads.search).toHaveBeenCalledWith({
      filenameRegex: BACKUP_FILENAME_REGEX,
    });

    // Should have erased the three oldest backups (ids 1, 2, 3) only.
    const erasedIds = fake.api.downloads.erase.mock.calls.map((c) => c[0].id).sort();
    const removedIds = fake.api.downloads.removeFile.mock.calls.map((c) => c[0]).sort();
    expect(erasedIds).toEqual([1, 2, 3]);
    expect(removedIds).toEqual([1, 2, 3]);

    // Newest two backups + the unrelated file remain.
    expect(fake.items.map((i) => i.id).sort()).toEqual([4, 5, 99]);
  });

  it("no-ops when keep is 0 or negative", async () => {
    const items: DownloadItem[] = [
      {
        id: 1,
        filename: "better-bookmarks-backup-2026-05-10-000000.json",
        startTime: "2026-05-10T00:00:00Z",
      },
    ];
    const fake = fakeChrome(items);
    installChrome(fake);
    await cleanupOldBackups(0);
    expect(fake.api.downloads.search).not.toHaveBeenCalled();
    expect(fake.api.downloads.erase).not.toHaveBeenCalled();
  });

  it("does nothing when count is at or below keep", async () => {
    const items: DownloadItem[] = [
      {
        id: 1,
        filename: "better-bookmarks-backup-2026-05-10-000000.json",
        startTime: "2026-05-10T00:00:00Z",
      },
      {
        id: 2,
        filename: "better-bookmarks-backup-2026-05-11-000000.json",
        startTime: "2026-05-11T00:00:00Z",
      },
    ];
    const fake = fakeChrome(items);
    installChrome(fake);
    await cleanupOldBackups(5);
    expect(fake.api.downloads.erase).not.toHaveBeenCalled();
    expect(fake.api.downloads.removeFile).not.toHaveBeenCalled();
  });

  it("swallows removeFile errors and still erases the history entry", async () => {
    const items: DownloadItem[] = [
      {
        id: 1,
        filename: "better-bookmarks-backup-2026-05-10-000000.json",
        startTime: "2026-05-10T00:00:00Z",
      },
      {
        id: 2,
        filename: "better-bookmarks-backup-2026-05-11-000000.json",
        startTime: "2026-05-11T00:00:00Z",
      },
    ];
    const fake = fakeChrome(items);
    installChrome(fake);
    fake.api.downloads.removeFile.mockRejectedValueOnce(new Error("disk gone"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await cleanupOldBackups(1);
    expect(fake.api.downloads.erase).toHaveBeenCalledTimes(1);
    expect(fake.api.downloads.erase.mock.calls[0][0].id).toBe(1);
  });
});
