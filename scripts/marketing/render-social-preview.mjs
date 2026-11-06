#!/usr/bin/env node
/**
 * Renders the three GitHub social preview cards (1280×640 PNG) from
 * press-kit/social-preview/template.html.
 *
 *   node scripts/marketing/capture-screenshots.mjs   # first, for the screenshots
 *   node scripts/marketing/render-social-preview.mjs
 *
 * Writes press-kit/social-preview/social-preview-{a,b,c}.png. GitHub wants
 * under 1 MB; the script fails if a card is larger.
 */
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const dir = resolve(import.meta.dirname, "../../press-kit/social-preview");
const template = pathToFileURL(join(dir, "template.html")).href;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 640 },
    deviceScaleFactor: 1,
  });
  for (const v of ["a", "b", "c"]) {
    await page.goto(`${template}?v=${v}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].every((img) => img.complete));
    const out = join(dir, `social-preview-${v}.png`);
    await page.screenshot({ path: out });
    const kb = Math.round(statSync(out).size / 1024);
    console.log(`social-preview-${v}.png ${kb} KB`);
    if (kb >= 1024)
      throw new Error(`social-preview-${v}.png is ${kb} KB, over GitHub's 1 MB limit`);
  }
} finally {
  await browser.close();
}
