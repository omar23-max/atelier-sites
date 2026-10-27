import { chromium } from "playwright-core";
const [page, w] = [process.argv[2], Number(process.argv[3])];
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: w, height: 1000 } });
await p.goto(`http://localhost:5180/partage/${page}`, { waitUntil: "networkidle" });
console.log(JSON.stringify(await p.evaluate(() => {
  const root = document.querySelector("[class*='-p2 ']") ?? document.body;
  const out = [];
  let e = root;
  for (let i = 0; i < 8 && e; i++) {
    const s = getComputedStyle(e);
    out.push([e.tagName, e.className.toString().split(" ").slice(-1)[0], Math.round(e.getBoundingClientRect().height), s.display, s.height, s.position, s.visibility, s.contentVisibility]);
    e = [...e.children].find((c) => c.tagName !== "STYLE");
  }
  return out;
}), null, 0));
await b.close();
