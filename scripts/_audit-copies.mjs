// Audit : chaque copie (pages/<slug>.json) face à sa capture d'origine.
import { readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { renderPage } from "./render-page.mjs";
const list = JSON.parse(readFileSync("imports/_liste-sites.json", "utf8")).filter((o) => existsSync(`pages/${o.slug}.json`));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const rows = [];
for (const o of list) {
  const snap = JSON.parse(readFileSync(`imports/${o.slug}/snapshot.json`, "utf8"));
  const pageJson = JSON.parse(readFileSync(`pages/${o.slug}.json`, "utf8"));
  const imgSlots = pageJson.content.flatMap((c) => c.props.blocks_element ?? []).filter((b) => b.image).length;
  const imgFiles = Object.keys(snap.files ?? {}).length;
  const origH = snap.nodes[0].box.h;
  await page.setContent(await renderPage(o.slug, { withPhotos: true }), { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => ({
    h: document.documentElement.scrollHeight,
    imgs: [...document.images].filter((i) => i.naturalWidth > 0 && i.getBoundingClientRect().width > 20).length,
    broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
  }));
  rows.push({ slug: o.slug, hauteur: `${Math.round((100 * m.h) / origH)}%`, imagesCapturees: imgFiles, emplacements: imgSlots, affichees: m.imgs, cassees: m.broken });
}
await browser.close();
console.table(rows);
