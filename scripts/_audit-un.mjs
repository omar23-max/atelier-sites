import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { renderPage } from "./render-page.mjs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const slug of process.argv.slice(2)) {
  await page.setContent(await renderPage(slug, { withPhotos: true }), { waitUntil: "load", timeout: 120000 });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const orig = JSON.parse(readFileSync(`imports/${slug}/advertorial.json`, "utf8")).pageHeight;
  console.log(slug, h, "/", orig, `${Math.round((100 * h) / orig)}%`);
}
await browser.close();
