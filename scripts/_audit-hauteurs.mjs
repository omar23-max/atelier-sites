// Les blocs les plus hauts d'une copie, comparés à leur hauteur d'origine.
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { renderPage } from "./render-page.mjs";
const slug = process.argv[2];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.setContent(await renderPage(slug, { withPhotos: true }), { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(500);
const out = await page.evaluate(() => {
  const secs = [...document.querySelectorAll("body > *")].map((e) => [e.className.split(" ")[0], Math.round(e.getBoundingClientRect().height)]);
  // Éléments dont la hauteur dépasse 3000 px sans enfant aussi haut : le coupable.
  const tall = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().height > 3000 && ![...e.children].some((c) => c.getBoundingClientRect().height > 0.8 * e.getBoundingClientRect().height));
  return { secs, tall: tall.slice(0, 6).map((e) => { const cs = getComputedStyle(e); return { cls: e.className, tag: e.tagName, h: Math.round(e.getBoundingClientRect().height), kids: e.children.length, minH: cs.minHeight, height: cs.height, pad: cs.paddingTop + "/" + cs.paddingBottom, display: cs.display, txt: e.textContent.trim().slice(0, 60) }; }) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
