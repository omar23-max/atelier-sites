// Sections « excentrées » : colonne vide (image absente dans une mise en page à
// deux colonnes) ou contenu vraiment décalé ?   node trier.mjs
import { readFileSync, writeFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const { chromium } = await import(`${A}/node_modules/playwright-core/index.mjs`);
const { renderSectionHtml, setPhotoResolver } = await import(`${A}/src/engine/render.js`);
const { loadSection, photoDataUrl } = await import(`${A}/scripts/lib/load.mjs`);
setPhotoResolver(photoDataUrl);
const ids = readFileSync("/home/ubuntu/apres-import/excentrees.txt", "utf8").split("\n").filter(Boolean);
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const res = [];
for (const id of ids) {
  const s = await loadSection(id);
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${[...new Set(s.css.match(IMPORT) ?? [])].join("\n")} html,body{margin:0;background:#fff} ${s.css.replace(IMPORT, "")}</style></head><body>${renderSectionHtml(s, {}, "x").replace(/\s(srcset|sizes)="[^"]*"/g, "")}</body></html>`, { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => {
    const W = innerWidth;
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
    const all = [...document.body.querySelectorAll("*")];
    const leaves = all.filter((e) => vis(e) && (e.tagName === "IMG" && e.naturalWidth > 0 || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())));
    let minX = Infinity, maxX = -Infinity;
    for (const e of leaves) { const q = e.getBoundingClientRect(); minX = Math.min(minX, q.left); maxX = Math.max(maxX, q.right); }
    const left = minX, right = W - maxX;
    const side = left > right ? "gauche" : "droite";
    const gap = side === "gauche" ? [0, minX] : [maxX, W];
    // un élément « vide » occupe-t-il le côté vide (image absente, fond, colonne) ?
    const filler = all.find((e) => {
      if (!vis(e)) return false;
      const q = e.getBoundingClientRect();
      const inGap = q.left >= gap[0] - 20 && q.right <= gap[1] + 20 && q.width > 150 && q.height > 120;
      if (!inGap) return false;
      const cs = getComputedStyle(e);
      return e.tagName === "IMG" || e.tagName === "VIDEO" || e.tagName === "PICTURE" || cs.backgroundImage !== "none" || /rgba?\((?!0, 0, 0, 0)/.test(cs.backgroundColor) && cs.backgroundColor !== "rgba(0, 0, 0, 0)" || e.querySelector("img,video,picture");
    });
    return { left: Math.round(left), right: Math.round(right), side, colonneVide: !!filler, filler: filler ? filler.tagName + "." + String(filler.className).slice(0, 30) : null };
  });
  res.push({ id, ...r });
}
await b.close();
writeFileSync("/home/ubuntu/apres-import/excentrees-tri.json", JSON.stringify(res, null, 1));
const vide = res.filter((r) => r.colonneVide), dec = res.filter((r) => !r.colonneVide);
console.log({ total: res.length, colonneVide: vide.length, vraimentDecale: dec.length });
console.log(dec.slice(0, 30).map((r) => `${r.id} g${r.left}/d${r.right}`).join("\n"));
