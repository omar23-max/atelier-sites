// Centre le contenu des sections « excentrées » (côté vide sans emplacement
// d'image) : le plus petit bloc qui contient tout le contenu est décalé de la
// moitié de l'écart, sur ordinateur (≥ 1024 px). Bloc « atl-centrer » dans le
// style.css ; vérifié après coup, retiré si l'écart ne baisse pas.
//   node centrer.mjs [--dry] [--ids a,b]
import { readFileSync, writeFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const { chromium } = await import(`${A}/node_modules/playwright-core/index.mjs`);
const { renderSectionHtml, setPhotoResolver } = await import(`${A}/src/engine/render.js`);
const { loadSection, photoDataUrl } = await import(`${A}/scripts/lib/load.mjs`);
setPhotoResolver(photoDataUrl);
const dry = process.argv.includes("--dry");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const tri = JSON.parse(readFileSync("/home/ubuntu/apres-import/excentrees-tri.json", "utf8"));
const ids = arg("--ids") ? arg("--ids").split(",") : tri.filter((r) => !r.colonneVide).map((r) => r.id);
const START = "/* atl-centrer 2026-11-08 */", END = "/* fin atl-centrer */";
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
const strip = (css) => { const i = css.indexOf(START); return i < 0 ? css : css.slice(0, i) + css.slice(css.indexOf(END) + END.length); };
const doc = (s, css) => `<!doctype html><html><head><meta charset="utf-8"><style>${[...new Set(css.match(IMPORT) ?? [])].join("\n")} html,body{margin:0} ${css.replace(IMPORT, "")}</style></head><body>${renderSectionHtml(s, {}, "x").replace(/\s(srcset|sizes)="[^"]*"/g, "")}</body></html>`;
const MEASURE = () => {
  const W = innerWidth;
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
  const leaves = [...document.body.querySelectorAll("*")].filter((e) => vis(e) && (e.tagName === "IMG" || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())));
  let minX = Infinity, maxX = -Infinity;
  for (const e of leaves) { const q = e.getBoundingClientRect(); minX = Math.min(minX, q.left); maxX = Math.max(maxX, q.right); }
  return { W, left: minX, right: W - maxX, leaves };
};
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const log = [];
let ok = 0, ko = 0;
for (const id of ids) {
  const s = await loadSection(id);
  const file = `${A}/sections/${id}/style.css`;
  const base = strip(readFileSync(file, "utf8"));
  await p.setContent(doc(s, base), { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(200);
  const plan = await p.evaluate((MEASURE_SRC) => {
    const m = new Function(`return (${MEASURE_SRC})()`)();
    const root = document.querySelector("[data-atl-root]");
    if (!root || !m.leaves.length) return null;
    // plus petit ancêtre commun de tout le contenu
    let lca = m.leaves[0];
    while (lca && !m.leaves.every((l) => lca.contains(l))) lca = lca.parentElement;
    if (!lca || !root.contains(lca)) return null;
    // bloc pleine largeur : on décale ses enfants qui portent du contenu
    let targets = [lca];
    if (lca.getBoundingClientRect().width > m.W - 40) targets = [...lca.children].filter((c) => m.leaves.some((l) => c.contains(l)));
    const path = (el) => {
      const parts = [];
      for (let x = el; x && x !== root; x = x.parentElement) parts.unshift(`:nth-child(${[...x.parentElement.children].indexOf(x) + 1})`);
      return parts.join(" > ");
    };
    const shift = Math.round((m.right - m.left) / 2);
    return { shift, sel: targets.map(path).filter(Boolean) };
  }, MEASURE.toString());
  if (!plan || !plan.sel.length || Math.abs(plan.shift) < 40) { log.push(`${id}\tignorée`); ko++; continue; }
  const scope = `.atl-${id}`;
  const marges = process.argv.includes("--marges");
  const decl = marges ? "margin-left:auto!important;margin-right:auto!important;transform:none!important" : `transform:translateX(${plan.shift}px)!important`;
  const rule = `@media (min-width: 1024px){${plan.sel.map((x) => `${scope} > ${x}`).join(",")}{${decl}}}`;
  const css = base.trimEnd() + "\n" + START + "\n" + rule + "\n" + END + "\n";
  // vérification
  await p.setContent(doc(s, css), { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(200);
  const after = await p.evaluate(([MEASURE_SRC, sels, scope]) => {
    const m = new Function(`return (${MEASURE_SRC})()`)();
    // les blocs décalés (fonds, cadres compris) doivent rester dans l'écran
    let out = false;
    for (const sel of sels) for (const el of document.querySelectorAll(`${scope} > ${sel}`)) {
      const q = el.getBoundingClientRect();
      if (q.width > 2 && (q.left < -2 || q.right > m.W + 2)) out = true;
    }
    return { left: m.left, right: m.right, out };
  }, [MEASURE.toString(), plan.sel, scope]);
  const before = tri.find((r) => r.id === id) ?? {};
  const better = Math.abs(after.left - after.right) < Math.abs((before.left ?? 0) - (before.right ?? 0)) - 60 && after.left >= 0 && after.right >= 0 && !after.out;
  if (better) { if (!dry) writeFileSync(file, css); ok++; log.push(`${id}\tcentrée\t${Math.round(after.left)}/${Math.round(after.right)}`); }
  else { ko++; log.push(`${id}\tpas mieux\t${Math.round(after.left)}/${Math.round(after.right)}`); }
}
await b.close();
writeFileSync(process.argv.includes("--marges") ? "/home/ubuntu/apres-import/centrer-marges.log" : "/home/ubuntu/apres-import/centrer.log", log.join("\n") + "\n");
console.log({ centrees: ok, laissees: ko, dry });
