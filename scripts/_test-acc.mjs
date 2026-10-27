import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto("http://localhost:5180/partage/luma-landing", { waitUntil: "networkidle" });
const before = await p.evaluate(() => {
  const d = [...document.querySelectorAll("details")];
  return { total: d.length, ouverts: d.filter((x) => x.open).length, actifs: document.querySelectorAll("[data-atl-acc-on]").length, h: document.documentElement.scrollHeight };
});
const s = p.locator("details summary").first();
await s.scrollIntoViewIfNeeded();
const q = (await s.textContent()).trim().slice(0, 50);
await s.click();
const after = await p.evaluate(() => [...document.querySelectorAll("details")].filter((x) => x.open).length);
console.log(JSON.stringify({ before, question: q, ouvertsApresClic: after, errors }));
await b.close();
