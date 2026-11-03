// Contrôle des sections du catalogue : trop hautes, qui débordent, excentrées,
// presque vides, images manquantes. Les sections Whitelabeler (wl-…, wll-…)
// ne sont pas contrôlées.
//
//   node scripts/audit-sections.mjs [<id> …]
//
// Le résultat va dans sections/<id>/meta.json (« audit » : raisons et mesures) :
// le catalogue montre ces sections sous « Sections à revoir ». Une section sans
// problème perd son « audit ».
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { renderSectionHtml, setPhotoResolver } from "../src/engine/render.js";
import { listSectionIds, loadSection, photoDataUrl, sectionsDir } from "./lib/load.mjs";

setPhotoResolver(photoDataUrl);
const WIDTH = 1440;
// Hors du serveur de l'atelier, les adresses de srcset (/imports/…) ne
// répondent pas et le navigateur les préfère à src (image intégrée) : retirées.
const noSrcset = (html) => html.replace(/\s(srcset|sizes)="[^"]*"/g, "");
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
const doc = (section) => `<!doctype html><html><head><meta charset="utf-8"><style>
${[...new Set(section.css.match(IMPORT) ?? [])].join("\n")}
html, body { margin: 0; background: #fff; }
${section.css.replace(IMPORT, "")}
</style></head><body>${noSrcset(renderSectionHtml(section, {}, "miniature"))}</body></html>`;

const only = process.argv.slice(2);
const ids = (only.length ? only : await listSectionIds()).filter((id) => !/-p\d+$/.test(id) && !id.includes("--") && !/^wll?-/.test(id));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } });
let flagged = 0;
for (const id of ids) {
  const section = await loadSection(id);
  if (section.meta.pageSpecific) continue;
  await page.setContent(doc(section), { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  // Images « lazy » : chargées tout de suite, sinon elles comptent comme manquantes.
  await page
    .evaluate(async () => {
      for (const img of document.images) img.loading = "eager";
      await Promise.race([
        Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((ok) => ((i.onload = ok), (i.onerror = ok)))))),
        new Promise((ok) => setTimeout(ok, 4000)),
      ]);
    })
    .catch(() => {});
  await page.waitForTimeout(200);
  const m = await page.evaluate((W) => {
    const visible = (e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
    };
    const leaves = [...document.body.querySelectorAll("*")].filter((e) => visible(e) && (e.tagName === "IMG" || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())));
    const texts = leaves.filter((e) => e.tagName !== "IMG");
    const imgs = [...document.images].filter(visible);
    let minX = Infinity, maxX = -Infinity;
    for (const e of leaves) {
      const r = e.getBoundingClientRect();
      minX = Math.min(minX, r.left);
      maxX = Math.max(maxX, r.right);
    }
    return {
      hauteur: document.body.scrollHeight,
      largeur: document.documentElement.scrollWidth,
      textes: texts.length,
      images: imgs.length,
      imagesCassees: imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).length,
      gauche: Math.round(minX),
      droite: Math.round(W - maxX),
    };
  }, WIDTH);
  const raisons = [];
  if (m.hauteur > 3000) raisons.push(`trop haute (${m.hauteur} px)`);
  if (m.hauteur < 60) raisons.push(`presque invisible (${m.hauteur} px de haut)`);
  if (m.largeur > WIDTH + 8) raisons.push(`déborde à droite (${m.largeur} px de large)`);
  if (m.textes + m.images <= 2) raisons.push(`presque vide (${m.textes} texte(s), ${m.images} image(s))`);
  if (m.imagesCassees) raisons.push(`${m.imagesCassees} image(s) manquante(s)`);
  const contentW = WIDTH - m.gauche - m.droite;
  if (Number.isFinite(m.gauche) && contentW < WIDTH - 200 && Math.abs(m.gauche - m.droite) > 220) raisons.push(`excentrée (marge gauche ${m.gauche} px, droite ${m.droite} px)`);

  const file = join(sectionsDir, id, "meta.json");
  const meta = JSON.parse(await readFile(file, "utf8"));
  const before = JSON.stringify(meta.audit ?? null);
  if (raisons.length) meta.audit = { raisons, mesures: m, date: new Date().toISOString().slice(0, 10) };
  else delete meta.audit;
  if (JSON.stringify(meta.audit ?? null) !== before) await writeFile(file, JSON.stringify(meta, null, 2) + "\n");
  if (raisons.length) {
    flagged++;
    console.log(`⚠ ${id} : ${raisons.join(" · ")}`);
  }
}
await browser.close();
console.log(`\n${flagged} section(s) à revoir sur ${ids.length} contrôlée(s).`);
