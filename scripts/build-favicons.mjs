#!/usr/bin/env node
// Generate favicons for apps/web from the repo-root icon.
// Reads public/full128.png (falls back to the largest public/*.png if missing)
// and writes 16/32/180/256/512 PNGs plus apple-touch-icon.png into apps/web/public/.

import { readdir, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const publicDir = join(repoRoot, "public");
const outDir = join(repoRoot, "apps", "web", "public");

const PREFERRED_SOURCE = join(publicDir, "full128.png");
const SIZES = [16, 32, 180, 256, 512];

async function pickLargestPng(dir) {
  const entries = await readdir(dir);
  const pngs = entries.filter((f) => f.toLowerCase().endsWith(".png"));
  let best = null;
  let bestPixels = 0;
  for (const name of pngs) {
    const full = join(dir, name);
    try {
      const meta = await sharp(full).metadata();
      const px = (meta.width ?? 0) * (meta.height ?? 0);
      if (px > bestPixels) {
        bestPixels = px;
        best = full;
      }
    } catch (err) {
      console.warn(`skipping ${name}: ${err.message}`);
    }
  }
  return best;
}

async function resolveSource() {
  if (existsSync(PREFERRED_SOURCE)) return PREFERRED_SOURCE;
  console.warn(`source ${PREFERRED_SOURCE} not found; picking largest PNG under ${publicDir}`);
  const fallback = await pickLargestPng(publicDir);
  if (!fallback) throw new Error(`no PNG source found under ${publicDir}`);
  console.warn(`using fallback source: ${fallback}`);
  return fallback;
}

async function main() {
  const source = await resolveSource();
  const srcMeta = await sharp(source).metadata();
  console.log(`source: ${source} (${srcMeta.width}x${srcMeta.height})`);

  await mkdir(outDir, { recursive: true });

  const jobs = SIZES.map(async (size) => {
    const out = join(outDir, `favicon-${size}.png`);
    await sharp(source)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    const s = await stat(out);
    console.log(`  favicon-${size}.png  ${s.size} bytes`);
  });

  await Promise.all(jobs);

  const apple = join(outDir, "apple-touch-icon.png");
  await sharp(source)
    .resize(180, 180, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(apple);
  const as = await stat(apple);
  console.log(`  apple-touch-icon.png ${as.size} bytes`);

  console.log(`wrote ${SIZES.length + 1} files to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
