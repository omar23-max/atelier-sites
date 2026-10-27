import { chromium } from "playwright-core";
const [page, w] = [process.argv[2], Number(process.argv[3])];
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: w, height: 1000 } });
await p.goto(`http://localhost:5180/partage/${page}`, { waitUntil: "networkidle" });
const r = await p.evaluate(() => {
  const secs = [...document.querySelectorAll("[class*='atl-'][class*='-p']")].filter((e) => /atl-[a-z0-9-]+-p\d+\b/.test(e.className) && !e.parentElement.closest("[class*='-p'][class*='atl-']"));
  const out = secs.map((e) => [e.className.match(/atl-[a-z0-9-]+-p\d+/)[0], Math.round(e.getBoundingClientRect().height)]);
  // le plus grand descendant de la section la plus haute
  const big = secs.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
  const tall = [...big.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().height > 8000).slice(-4).map((e) => { const s = getComputedStyle(e); return [e.tagName, e.className.toString().slice(0, 40), Math.round(e.getBoundingClientRect().height), Math.round(e.getBoundingClientRect().width), s.display, s.gridTemplateColumns?.slice(0, 60), s.flexDirection, s.width, (e.textContent || "").trim().slice(0, 40)]; });
  return { h: document.documentElement.scrollHeight, out, tall };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
