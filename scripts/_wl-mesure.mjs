// Hauteur de chaque aperçu de la Section library (rendu à 1200 px, comme la carte).
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
const p = JSON.parse(readFileSync("imports/wl-library/previews.json", "utf8"));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const out = [];
for (const [type, v] of Object.entries(p)) {
  for (const [i, doc] of v.docs.entries()) {
    await page.setContent(doc, { waitUntil: "load", timeout: 30000 }).catch(() => {});
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    const card = v.cards[i];
    const visible = Math.round(card.h * (1200 / card.w));
    out.push({ type, label: v.label, i: i + 1, h, visible, entier: h <= visible + 10 });
  }
}
await browser.close();
writeFileSync("imports/wl-library/mesures.json", JSON.stringify(out, null, 1));
const by = {};
for (const o of out) (by[o.label] ??= [0, 0])[o.entier ? 0 : 1]++;
console.log("entiers", out.filter((o) => o.entier).length, "/", out.length);
console.log(by);
