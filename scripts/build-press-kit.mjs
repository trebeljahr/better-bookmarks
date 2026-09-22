#!/usr/bin/env node
// Build the Better Bookmarks press-kit zip.
// Reads the version from package.json and shells out to /usr/bin/zip so the
// output matches what a reviewer would produce by hand. Fails hard if any of
// the required text files are missing; screenshots and other assets are
// optional and picked up when present.

import { spawn } from "node:child_process";
import { readFileSync, statSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const pressKitDir = join(repoRoot, "press-kit");

const requiredFiles = ["press-kit.md", "LICENSE", "CHANGELOG.md", "FAQ.md"];
const missing = requiredFiles.filter((f) => !existsSync(join(pressKitDir, f)));
if (missing.length > 0) {
  console.error(
    `Missing required press-kit files: ${missing.join(", ")}\n` +
      `Expected under ${pressKitDir}`,
  );
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const version = pkg.version;
const zipName = `press-kit-v${version}.zip`;
const zipPath = join(repoRoot, zipName);

async function countFiles(dir) {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(p);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

const child = spawn("/usr/bin/zip", ["-r", "-X", zipName, "press-kit"], {
  cwd: repoRoot,
  stdio: "inherit",
});

child.on("exit", async (code) => {
  if (code !== 0) {
    console.error(`zip exited with code ${code}`);
    process.exit(code ?? 1);
  }
  const size = statSync(zipPath).size;
  const fileCount = await countFiles(pressKitDir);
  const sizeKb = (size / 1024).toFixed(1);
  console.log("");
  console.log(`Output: ${relative(process.cwd(), zipPath) || zipPath}`);
  console.log(`Size:   ${sizeKb} KB (${size} bytes)`);
  console.log(`Files:  ${fileCount} inside press-kit/`);
});
