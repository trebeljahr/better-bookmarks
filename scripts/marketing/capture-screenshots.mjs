#!/usr/bin/env node
/**
 * Captures the README and press-kit screenshots from the real extension.
 *
 *   pnpm build
 *   node scripts/marketing/capture-screenshots.mjs [out-dir]
 *
 * Loads `dist/chrome-mv3` into a throwaway Chromium profile (headless, no
 * window), seeds a few Chrome bookmark folders, imports a demo library of
 * public links through the overview's own "Import file…" input, then
 * captures the overview at 1600×1000 (device scale 2), a filtered search,
 * the import result that shows merged duplicates, and a bookmark's detail
 * view. The extension has no dark mode a person can switch on, so there is
 * no dark capture.
 *
 * Every link in the demo library is a public page. Nothing here reads a
 * real profile or a person's bookmarks. Writes JPEGs (quality 88) because
 * the PNGs are 2–3 MB each.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const extensionDir = join(root, "dist/chrome-mv3");
const outDir = resolve(process.argv[2] ?? join(root, "press-kit/screenshots"));
const VIEWPORT = { width: 1600, height: 1000 };

if (!existsSync(join(extensionDir, "manifest.json"))) {
  console.error("dist/chrome-mv3 is missing. Run `pnpm build` first.");
  process.exit(1);
}

const HOUR = 3_600_000;
const now = Date.now();

/** [url, title, tags, rating, minutes, contentType, status, ageHours, note] */
const LIBRARY = [
  [
    "https://doc.rust-lang.org/book/",
    "The Rust Programming Language",
    ["rust", "books"],
    9,
    900,
    "book",
    "reading",
    2,
  ],
  [
    "https://grugbrain.dev/",
    "The Grug Brained Developer",
    ["engineering", "essays"],
    8,
    25,
    "article",
    "read",
    9,
  ],
  [
    "https://arxiv.org/abs/1706.03762",
    "Attention Is All You Need",
    ["ml", "papers"],
    9,
    45,
    "paper",
    "unread",
    18,
  ],
  ["https://github.com/BurntSushi/ripgrep", "ripgrep", ["rust", "tools"], 9, 5, "repo", "read", 26],
  [
    "https://doc.rust-lang.org/rust-by-example/",
    "Rust by Example",
    ["rust", "reference"],
    8,
    240,
    "reference",
    "reading",
    40,
  ],
  [
    "https://www.kalzumeus.com/2010/06/17/falsehoods-programmers-believe-about-names/",
    "Falsehoods Programmers Believe About Names",
    ["engineering", "checklists"],
    8,
    12,
    "article",
    "read",
    52,
  ],
  [
    "https://curtclifton.net/papers/MoseleyMarks06a.pdf",
    "Out of the Tar Pit",
    ["engineering", "papers"],
    10,
    90,
    "paper",
    "read",
    60,
  ],
  [
    "https://craftinginterpreters.com/",
    "Crafting Interpreters",
    ["compilers", "books"],
    10,
    1200,
    "book",
    "reading",
    75,
  ],
  [
    "https://ciechanow.ski/mechanical-watch/",
    "Mechanical Watch",
    ["explorables", "essays"],
    10,
    40,
    "article",
    "read",
    90,
  ],
  [
    "https://www.youtube.com/watch?v=PUv66718DII",
    "Inventing on Principle",
    ["talks", "design"],
    9,
    54,
    "video",
    "read",
    100,
  ],
  [
    "https://use-the-index-luke.com/",
    "Use The Index, Luke",
    ["databases", "reference"],
    8,
    300,
    "book",
    "unread",
    120,
  ],
  [
    "https://www.sqlite.org/arch.html",
    "Architecture of SQLite",
    ["databases"],
    7,
    15,
    "reference",
    "unread",
    130,
  ],
  [
    "https://practicaltypography.com/",
    "Practical Typography",
    ["design", "books"],
    8,
    180,
    "book",
    "reading",
    150,
  ],
  ["https://lawsofux.com/", "Laws of UX", ["design", "reference"], 7, 20, "reference", "read", 170],
  [
    "https://beej.us/guide/bgnet/",
    "Beej's Guide to Network Programming",
    ["networking", "books"],
    8,
    400,
    "book",
    "unread",
    190,
  ],
  [
    "https://hpbn.co/",
    "High Performance Browser Networking",
    ["networking", "books"],
    8,
    600,
    "book",
    "unread",
    210,
  ],
  [
    "https://missing.csail.mit.edu/",
    "The Missing Semester of Your CS Education",
    ["course", "tools"],
    9,
    600,
    "course",
    "reading",
    230,
  ],
  [
    "https://en.wikipedia.org/wiki/Bloom_filter",
    "Bloom filter",
    ["databases", "reference"],
    7,
    10,
    "reference",
    "read",
    260,
  ],
  ["https://github.com/sharkdp/fd", "fd", ["tools", "rust"], 8, 5, "repo", "read", 280],
  [
    "https://jvns.ca/blog/2016/10/10/what-even-is-a-container/",
    "What even is a container?",
    ["networking", "essays"],
    8,
    10,
    "article",
    "read",
    300,
  ],
  [
    "https://ncase.me/trust/",
    "The Evolution of Trust",
    ["explorables"],
    9,
    30,
    "article",
    "read",
    320,
  ],
  [
    "https://www.paulgraham.com/avg.html",
    "Beating the Averages",
    ["essays"],
    6,
    20,
    "article",
    "read",
    350,
  ],
  [
    "https://norvig.com/21-days.html",
    "Teach Yourself Programming in Ten Years",
    ["essays", "engineering"],
    8,
    15,
    "article",
    "read",
    380,
  ],
  [
    "https://cooking.nytimes.com/guides/1-how-to-make-bread",
    "How to Make Bread",
    ["cooking"],
    7,
    20,
    "article",
    "unread",
    400,
  ],
  [
    "https://www.seriouseats.com/the-food-lab",
    "The Food Lab",
    ["cooking", "books"],
    8,
    60,
    "book",
    "unread",
    420,
  ],
  [
    "https://lamport.azurewebsites.net/pubs/time-clocks.pdf",
    "Time, Clocks, and the Ordering of Events",
    ["papers", "databases"],
    10,
    60,
    "paper",
    "unread",
    450,
  ],
  [
    "https://teachyourselfcs.com/",
    "Teach Yourself Computer Science",
    ["course", "books"],
    8,
    30,
    "course",
    "unread",
    470,
  ],
  [
    "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching",
    "HTTP caching",
    ["networking", "reference"],
    8,
    25,
    "reference",
    "read",
    500,
  ],
];

/** Second saves of pages already in the library, as they arrive from links. */
const DUPLICATES = [
  "https://grugbrain.dev/?utm_source=newsletter&utm_medium=email",
  "https://arxiv.org/abs/1706.03762?fbclid=IwAR0demo",
  "https://github.com/BurntSushi/ripgrep?utm_campaign=weekly",
  "https://youtu.be/PUv66718DII?si=demo&t=42",
  "https://www.kalzumeus.com/2010/06/17/falsehoods-programmers-believe-about-names/?utm_source=social",
  "https://craftinginterpreters.com/?ref=reading-list",
];

const TAG_COLORS = {
  rust: "#ff7043",
  engineering: "#42a5f5",
  essays: "#26a69a",
  ml: "#7e57c2",
  papers: "#ab47bc",
  compilers: "#5c6bc0",
  explorables: "#ec407a",
  design: "#ffca28",
  databases: "#66bb6a",
  networking: "#26c6da",
  cooking: "#ef5350",
};

const id = (n) => `01JDEMO${String(n).padStart(19, "0")}`;

/**
 * Pages that are also seeded as Chrome bookmarks (below). Their imported
 * record is stamped newer than the synced copy, so the import's rating and
 * status win the merge; the order here is the order they list in.
 */
const IN_CHROME_FOLDERS = [
  "https://doc.rust-lang.org/book/",
  "https://ciechanow.ski/mechanical-watch/",
  "https://ncase.me/trust/",
  "https://cooking.nytimes.com/guides/1-how-to-make-bread",
];

function demoLibrary() {
  const bookmarks = LIBRARY.map(
    ([url, title, tags, rating, minutes, contentType, status, ageHours], i) => {
      const at = now - ageHours * HOUR;
      const inChrome = IN_CHROME_FOLDERS.indexOf(url);
      const updatedAt = inChrome === -1 ? at : now + (IN_CHROME_FOLDERS.length - inChrome) * 60_000;
      return {
        id: id(i + 1),
        canonicalUrl: url,
        originalUrl: url,
        domain: new URL(url).hostname,
        title,
        description: "",
        note: "",
        tags,
        rating,
        necessaryTime: minutes,
        contentType,
        language: "en",
        status,
        readAt: status === "read" ? at : null,
        createdAt: at,
        updatedAt,
        capturedFrom: "manual",
      };
    },
  );
  const byCanonical = new Map(bookmarks.map((b) => [b.canonicalUrl.replace(/\/$/, ""), b]));
  const dupes = DUPLICATES.map((url, i) => {
    const youtube = url.includes("PUv66718DII");
    const base = [...byCanonical.entries()].find(([key]) =>
      youtube ? key.includes("PUv66718DII") : url.startsWith(key),
    )?.[1];
    if (!base) throw new Error(`no library entry for duplicate ${url}`);
    return {
      ...base,
      id: id(100 + i),
      originalUrl: url,
      canonicalUrl: url,
      updatedAt: base.updatedAt - 1,
    };
  });
  const tagNames = [...new Set(LIBRARY.flatMap((row) => row[2]))].sort();
  const tags = tagNames.map((name) => ({
    name,
    lowercaseName: name,
    parentName: null,
    color: TAG_COLORS[name] ?? null,
    description: "",
    mirrorFolderId: null,
    createdAt: now - 600 * HOUR,
  }));
  return { version: 1, exportedAt: now, bookmarks: [...bookmarks, ...dupes], tags, edges: [] };
}

/** Reloads the overview until `pattern` shows, for state the background worker writes. */
async function reloadUntil(page, pattern, seconds = 30) {
  for (let i = 0; i < seconds; i++) {
    await page.getByRole("textbox", { name: "search bookmarks" }).waitFor();
    if (await page.getByText(pattern).count()) return;
    await page.waitForTimeout(1000);
    await page.reload();
  }
  throw new Error(`timed out waiting for ${pattern}`);
}

async function settle(page, ms = 900) {
  await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2);
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  await page.screenshot({ path: join(outDir, `${name}.jpg`), type: "jpeg", quality: 88 });
  console.log(`captured ${name}`);
}

await mkdir(outDir, { recursive: true });
const work = await mkdtemp(join(tmpdir(), "bb-capture-"));
const libraryFile = join(work, "better-bookmarks-demo.json");
await writeFile(libraryFile, JSON.stringify(demoLibrary(), null, 2));

// The full Chromium build in new headless mode runs extensions; the
// headless shell does not. No window is ever shown.
const context = await chromium.launchPersistentContext(join(work, "profile"), {
  channel: "chromium",
  headless: true,
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  colorScheme: "light",
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  const overviewUrl = `chrome-extension://${extensionId}/overview.html`;
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(overviewUrl);
  // The worker reads the (empty) Chrome tree on install; wait for that first,
  // or bookmarks created during the read are missed.
  await reloadUntil(page, /^Bookmarks bar$/);

  // A few Chrome folders, so the folder sidebar shows the native tree the
  // extension mirrors. Each folder becomes a tag on its bookmarks.
  await page.evaluate(async () => {
    const other = (await chrome.bookmarks.getTree())[0].children.find((n) => n.id === "2");
    const folders = {
      Reading: [
        ["https://ciechanow.ski/mechanical-watch/", "Mechanical Watch"],
        ["https://ncase.me/trust/", "The Evolution of Trust"],
      ],
      Rust: [["https://doc.rust-lang.org/book/", "The Rust Programming Language"]],
      Recipes: [["https://cooking.nytimes.com/guides/1-how-to-make-bread", "How to Make Bread"]],
    };
    for (const [title, links] of Object.entries(folders)) {
      const folder = await chrome.bookmarks.create({ parentId: other.id, title });
      for (const [url, name] of links)
        await chrome.bookmarks.create({ parentId: folder.id, url, title: name });
    }
  });
  await reloadUntil(page, /^4 bookmarks total/);

  // The real import path: the hidden file input behind "Import file…".
  await page.locator('input[aria-label="import bookmarks file"]').setInputFiles(libraryFile);
  await page.getByText(/Import done:/).waitFor({ timeout: 60_000 });
  await settle(page, 1500);
  await shot(page, "import-merged");

  // Clean overview: close the import card and the first-run hint if shown.
  for (const label of ["close hint", "close import summary"]) {
    const button = page.getByRole("button", { name: label, exact: true });
    if (await button.count()) await button.first().click();
  }
  await page.reload();
  await page.getByRole("textbox", { name: "search bookmarks" }).waitFor();
  const hint = page.getByRole("button", { name: "close hint" });
  if (await hint.count()) await hint.click();
  await settle(page);
  await shot(page, "overview-light");

  await page.getByRole("textbox", { name: "search bookmarks" }).fill("tag:papers rating:>=9");
  await settle(page, 1200);
  await shot(page, "search-light");

  await page.getByRole("textbox", { name: "search bookmarks" }).fill("");
  await settle(page, 600);
  await page.getByText("Attention Is All You Need", { exact: true }).first().click();
  // The detail sheet focuses and selects the title field; a capture should
  // show the form at rest.
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await settle(page, 800);
  await shot(page, "detail-light");
} finally {
  await context.close();
  await rm(work, { recursive: true, force: true });
}
