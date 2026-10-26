import { chromium } from "playwright-core";
import { renderPage } from "./render-page.mjs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.setContent(await renderPage(process.argv[2], { withPhotos: true }), { waitUntil: "load", timeout: 120000 });
console.log(JSON.stringify(await page.evaluate((limit) => {
  const out = [];
  for (const e of document.querySelectorAll("body *")) {
    const r = e.getBoundingClientRect();
    if (r.bottom + scrollY > limit && !(e.parentElement && e.parentElement.getBoundingClientRect().bottom + scrollY > limit)) {
      const cs = getComputedStyle(e);
      out.push({ cls: e.className.toString().slice(0, 40), tag: e.tagName, top: Math.round(r.top + scrollY), h: Math.round(r.height), pos: cs.position, vis: cs.visibility, disp: cs.display, sec: e.closest("[data-atl-id], [class^=atl-]")?.className.split(" ")[0], txt: e.textContent.trim().slice(0, 50) });
    }
  }
  return out.slice(0, 12);
}, Number(process.argv[3])), null, 1));
await browser.close();
