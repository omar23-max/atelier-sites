// Analyse de nuit : chaque section rendue seule à 1440 px (comme sa miniature).
//   node analyse.mjs [--all | --catalogue | --ids a,b,c] [--out fichier.jsonl]
// Mesures : hauteur, vide en haut avant le premier contenu, contrôles au style
// du navigateur (cadres carrés), FAQ, carrousels.
import { writeFileSync, appendFileSync, existsSync, readFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const { chromium } = await import(`${A}/node_modules/playwright-core/index.mjs`);
const { renderSectionHtml, setPhotoResolver } = await import(`${A}/src/engine/render.js`);
const { listSectionIds, loadSection, photoDataUrl } = await import(`${A}/scripts/lib/load.mjs`);
setPhotoResolver(photoDataUrl);

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const out = arg("--out") ?? "/tmp/analyse.jsonl";
const done = new Set(existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
let ids = arg("--ids") ? arg("--ids").split(",") : await listSectionIds();
const onlyCatalogue = process.argv.includes("--catalogue");
const onlyPageSpecific = process.argv.includes("--templates");

const WIDTH = 1440;
const noSrcset = (html) => html.replace(/\s(srcset|sizes)="[^"]*"/g, "");
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
const doc = (section) => `<!doctype html><html><head><meta charset="utf-8"><style>
${[...new Set(section.css.match(IMPORT) ?? [])].join("\n")}
html, body { margin: 0; background: #fff; }
${section.css.replace(IMPORT, "")}
</style></head><body>${noSrcset(renderSectionHtml(section, {}, "miniature"))}</body></html>`;

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } });
let n = 0;
for (const id of ids) {
  if (done.has(id)) continue;
  let section;
  try { section = await loadSection(id); } catch { continue; }
  if (onlyCatalogue && section.meta.pageSpecific) continue;
  if (onlyPageSpecific && !section.meta.pageSpecific) continue;
  const rec = { id, family: section.meta.family ?? null, ps: !!section.meta.pageSpecific, label: section.meta.label ?? "", kimi: !/all:revert/.test(section.css) };
  try {
    await page.setContent(doc(section), { waitUntil: "load", timeout: 30000 });
    await page.evaluate(async () => {
      for (const img of document.images) img.loading = "eager";
      await Promise.race([Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((ok) => ((i.onload = ok), (i.onerror = ok)))))), new Promise((ok) => setTimeout(ok, 3000))]);
    }).catch(() => {});
    await page.waitForTimeout(150);
    Object.assign(rec, await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
      const all = [...document.body.querySelectorAll("*")];
      const leaves = all.filter((e) => vis(e) && (["IMG", "VIDEO", "IFRAME", "svg", "CANVAS", "INPUT", "BUTTON"].includes(e.tagName) || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || (getComputedStyle(e).backgroundImage !== "none" && e.getBoundingClientRect().height > 40)));
      let top = Infinity;
      for (const e of leaves) top = Math.min(top, e.getBoundingClientRect().top + scrollY);
      const H = document.body.scrollHeight;
      // Cadres du navigateur : bordure « outset/inset » ou bordure grise de 2 px par défaut.
      const ua = [];
      for (const e of all) {
        if (!["BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "FIELDSET"].includes(e.tagName) || !vis(e)) continue;
        const cs = getComputedStyle(e);
        const st = cs.borderTopStyle, w = parseFloat(cs.borderTopWidth);
        if (w > 0 && (st === "outset" || st === "inset" || /rgb\(118, 118, 118\)|rgb\(133, 133, 133\)|rgb\(0, 0, 0\)/.test(cs.borderTopColor) && w >= 1.5)) ua.push(e.tagName + (e.type ? ":" + e.type : "") + " " + (e.textContent || e.placeholder || "").trim().slice(0, 30));
      }
      const qs = leaves.filter((e) => e.tagName !== "IMG" && /\?\s*$/.test(e.textContent.trim()) && e.textContent.trim().length > 12 && e.textContent.trim().length < 160);
      const tracks = document.querySelectorAll('[data-atl-car="track"]').length;
      const arrows = document.querySelectorAll('[data-atl-car="prev"],[data-atl-car="next"]').length;
      const txt = leaves.filter((e) => e.tagName !== "IMG").map((e) => e.textContent.trim()).join(" | ").replace(/\s+/g, " ").slice(0, 400);
      return { H, top: Number.isFinite(top) ? Math.round(top) : null, ua: ua.length, uaEx: ua.slice(0, 4), questions: qs.length, accQ: document.querySelectorAll("[data-atl-q]").length, details: document.querySelectorAll("details").length, tracks, arrows, txt };
    }));
  } catch (e) { rec.err = String(e).slice(0, 120); }
  appendFileSync(out, JSON.stringify(rec) + "\n");
  if (++n % 100 === 0) console.log(n, id);
}
await browser.close();
console.log("fini", n);
