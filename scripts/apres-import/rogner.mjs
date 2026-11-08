// Sections taillées dans une page à positions fixes (Unbounce…) : la section
// garde toute la hauteur de la page d'origine et son contenu est perdu au milieu.
// On mesure le contenu (ordinateur et téléphone) et on rogne : bloc « atl-rogner ».
//   node rogner.mjs id1 id2 … [--dry]
import { readFileSync, writeFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const { chromium } = await import(`${A}/node_modules/playwright-core/index.mjs`);
const { renderSectionHtml, setPhotoResolver } = await import(`${A}/src/engine/render.js`);
const { loadSection, photoDataUrl } = await import(`${A}/scripts/lib/load.mjs`);
setPhotoResolver(photoDataUrl);
const dry = process.argv.includes("--dry");
const ids = process.argv.slice(2).filter((x) => !x.startsWith("--"));
const START = "/* atl-rogner 2026-11-07 */", END = "/* fin atl-rogner */";
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
const b = await chromium.launch({ channel: "msedge", headless: true });
for (const id of ids) {
  const s = await loadSection(id);
  let css0 = readFileSync(`${A}/sections/${id}/style.css`, "utf8");
  const i = css0.indexOf(START);
  if (i >= 0) css0 = css0.slice(0, i) + css0.slice(css0.indexOf(END) + END.length);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${[...new Set(s.css.match(IMPORT) ?? [])].join("\n")} html,body{margin:0} ${css0.replace(IMPORT, "")}</style></head><body>${renderSectionHtml(s, {}, "x").replace(/\s(srcset|sizes)="[^"]*"/g, "")}</body></html>`;
  const m = {};
  for (const w of [1440, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.setContent(doc, { waitUntil: "load", timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(300);
    m[w] = await p.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
      const leaves = [...document.body.querySelectorAll("*")].filter((e) => vis(e) && (["IMG", "VIDEO", "IFRAME", "svg", "BUTTON"].includes(e.tagName) || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || (getComputedStyle(e).backgroundImage !== "none" && e.getBoundingClientRect().height > 40)));
      let top = Infinity, bot = 0;
      for (const e of leaves) { const r = e.getBoundingClientRect(); top = Math.min(top, r.top + scrollY); bot = Math.max(bot, r.bottom + scrollY); }
      return { H: document.body.scrollHeight, top: Math.round(top), bot: Math.round(bot) };
    });
    await p.close();
  }
  const rule = (mm) => {
    const cut = Math.max(0, mm.top - 40), h = mm.bot - cut + 40;
    if (mm.H - h < 300) return null; // rien à gagner
    return `.atl-${id}{overflow:hidden!important;height:${h}px!important;min-height:0!important}.atl-${id}>*:first-child{position:relative!important;margin-top:-${cut}px!important}`;
  };
  const d = rule(m[1440]), mo = rule(m[390]);
  console.log(id, JSON.stringify(m), d ? "rogné" : "", mo ? "rogné-mobile" : "");
  if (!d && !mo) continue;
  const css = css0.trimEnd() + "\n" + [START, d ? `@media (min-width: 750px){${d}}` : "", mo ? `@media (max-width: 749px){${mo}}` : "", END].filter(Boolean).join("\n") + "\n";
  if (!dry) writeFileSync(`${A}/sections/${id}/style.css`, css);
}
await b.close();
