#!/usr/bin/env node
/**
 * Writes press-kit/manifest.json: every screenshot and social preview card
 * with its pixel size, byte size, SHA-256 and the script that made it.
 *
 *   node scripts/marketing/write-manifest.mjs
 *
 * Run it after capture-screenshots.mjs or render-social-preview.mjs.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const kit = resolve(import.meta.dirname, "../../press-kit");

const PURPOSE = {
  "screenshots/overview-light.jpg":
    "Overview with the demo library: folders, tags, ratings. README hero.",
  "screenshots/search-light.jpg": "A filtered search, `tag:papers rating:>=9`.",
  "screenshots/import-merged.jpg":
    "Import result: 28 new bookmarks, 6 merged into existing ones, with the support card.",
  "screenshots/detail-light.jpg":
    "Detail sheet of one bookmark: tags, rating, reading time, status, type, connections.",
  "social-preview/social-preview-a.png": "GitHub social preview, option A: screenshot-led.",
  "social-preview/social-preview-b.png":
    "GitHub social preview, option B: typographic, three tracking URLs merging into one.",
  "social-preview/social-preview-c.png":
    "GitHub social preview, option C: light, the filtered search.",
  "social-preview/og-wordmark.png": "og:image, 1200×630: social preview B laid out at 1.91:1.",
  "social-preview/og-clean.png":
    "og:image without text, 1200×630: the overview capture on card B's blue (og-clean.html).",
};

/** Width and height from a PNG IHDR or a JPEG SOFn marker. */
function dimensions(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const length = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + length;
  }
  throw new Error("unknown image format");
}

const files = [];
for (const dir of ["screenshots", "social-preview"]) {
  for (const name of readdirSync(join(kit, dir)).sort()) {
    if (!/\.(png|jpg)$/.test(name)) continue;
    const path = `${dir}/${name}`;
    const buf = readFileSync(join(kit, path));
    const [width, height] = dimensions(buf);
    files.push({
      path,
      purpose: PURPOSE[path] ?? "",
      width,
      height,
      bytes: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
      source:
        dir === "screenshots"
          ? "scripts/marketing/capture-screenshots.mjs (real extension build, demo library of public links)"
          : `scripts/marketing/render-social-preview.mjs over social-preview/${name === "og-clean.png" ? "og-clean.html" : "template.html"}`,
    });
  }
}

const manifest = { generated: new Date().toISOString().slice(0, 10), files };
writeFileSync(join(kit, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`press-kit/manifest.json: ${files.length} files`);
