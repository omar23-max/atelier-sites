// Génère les miniatures du catalogue :
//   sections/<id>/thumbnail.png   pour chaque section
//   designs/<nom>.png             pour chaque fichier design.md
// Usage : npm run thumbs              (tout)
//         npm run thumbs -- <id>      (une section ou un design)
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { renderSectionHtml, setPhotoResolver } from "../src/engine/render.js";
import { parseDesign } from "../src/engine/design.js";
import { listSectionIds, loadSection, photoDataUrl, root, sectionsDir } from "./lib/load.mjs";

// Les miniatures montrent les photos d'origine : elles restent sur le PC.
setPhotoResolver(photoDataUrl);

const WIDTH = 1440;
const MAX_HEIGHT = 1500; // une fiche produit très haute est coupée : on garde le haut
const SCALE = 0.35; // miniature d'environ 500 px de large
const designsDir = join(root, "designs");

const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function sectionDocument(section) {
  const imports = [...new Set(section.css.match(IMPORT) ?? [])].join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${imports}
html, body { margin: 0; background: #fff; }
${section.css.replace(IMPORT, "")}
</style></head><body>${renderSectionHtml(section, {}, "miniature")}</body></html>`;
}

// Carte de design : police des titres, texte, palette, bouton, bloc sombre.
function designDocument(design) {
  const c = design.tokens.couleurs ?? {};
  const f = design.tokens.polices ?? {};
  const families = [...new Set([f.titres, f.texte].filter(Boolean))]
    .map((n) => `family=${encodeURIComponent(n).replace(/%20/g, "+")}:wght@400;500;700`)
    .join("&");
  const chips = ["fond", "surface", "texte", "accent", "bouton", "fond-sombre", "fond-sombre-2", "etoiles"]
    .filter((r) => c[r])
    .map((r) => `<span style="background:${c[r]}"></span>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">
${families ? `<link href="https://fonts.googleapis.com/css2?${families}&display=swap" rel="stylesheet">` : ""}
<style>
html, body { margin: 0; }
.card { width: 640px; height: 400px; display: grid; grid-template-columns: 1fr 230px; overflow: hidden;
  font-family: "${f.texte ?? "sans-serif"}", sans-serif; background: ${c.fond ?? "#fff"}; color: ${c.texte ?? "#111"}; }
.left { padding: 34px 32px; display: flex; flex-direction: column; }
.aa { font-family: "${f.titres ?? "sans-serif"}", sans-serif; font-size: 96px; line-height: 1; font-weight: 500; letter-spacing: -0.03em; }
h1 { font-family: "${f.titres ?? "sans-serif"}", sans-serif; font-size: 30px; line-height: 1.1; margin: 14px 0 6px; font-weight: 600; letter-spacing: -0.02em; }
p { margin: 0 0 18px; font-size: 15px; opacity: .8; }
.fonts { font-size: 13px; opacity: .65; margin-top: auto; }
.chips { display: flex; gap: 6px; margin-bottom: 16px; }
.chips span { width: 30px; height: 30px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.btn { align-self: flex-start; padding: 10px 22px; border-radius: 999px; background: ${c.bouton ?? "#111"}; color: ${c["bouton-texte"] ?? "#fff"}; font-weight: 700; font-size: 14px; }
.right { background: linear-gradient(180deg, ${c["fond-sombre"] ?? "#222"}, ${c["fond-sombre-2"] ?? c["fond-sombre"] ?? "#444"}); color: ${c["texte-sur-sombre"] ?? "#fff"};
  padding: 30px 22px; display: flex; flex-direction: column; gap: 12px; }
.right .stars { color: ${c.etoiles ?? "#fc0"}; letter-spacing: 2px; }
.right .box { background: ${c.surface ?? "#fff"}; color: ${c.texte ?? "#111"}; border-radius: 8px; padding: 14px; font-size: 13px; }
.right b { font-family: "${f.titres ?? "sans-serif"}", sans-serif; font-size: 20px; font-weight: 500; }
</style></head><body><div class="card">
<div class="left">
  <div class="aa">Aa</div>
  <h1>${esc(design.title)}</h1>
  <p>Le texte courant ressemble à ceci.</p>
  <div class="chips">${chips}</div>
  <span class="btn">Ajouter au panier</span>
  <div class="fonts">${esc(f.titres ?? "?")} · ${esc(f.texte ?? "?")}</div>
</div>
<div class="right">
  <span class="stars">★★★★★</span>
  <b>Section sombre</b>
  <div class="box">Carte sur fond sombre, avec du texte.</div>
</div>
</div></body></html>`;
}

const only = process.argv[2];
const sectionIds = (await listSectionIds()).filter((id) => !only || id === only);
const designIds = existsSync(designsDir)
  ? (await readdir(designsDir)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).filter((id) => !only || id === only)
  : [];

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  if (sectionIds.length) {
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: SCALE });
    const page = await context.newPage();
    for (const id of sectionIds) {
      const section = await loadSection(id);
      await page.setContent(sectionDocument(section), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const height = Math.min(MAX_HEIGHT, await page.evaluate(() => document.body.scrollHeight));
      await page.screenshot({ path: join(sectionsDir, id, "thumbnail.png"), fullPage: true, clip: { x: 0, y: 0, width: WIDTH, height } });
      console.log(`✓ section ${id}  (${height}px)`);
    }
    await context.close();
  }
  if (designIds.length) {
    const context = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const id of designIds) {
      const design = parseDesign(id, await readFile(join(designsDir, `${id}.md`), "utf8"));
      if (design.error) {
        console.error(`✗ design ${id} : ${design.error}`);
        continue;
      }
      await page.setContent(designDocument(design), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(designsDir, `${id}.png`), clip: { x: 0, y: 0, width: 640, height: 400 } });
      console.log(`✓ design ${id}`);
    }
  }
  // Templates : vignette = le haut de la capture du site importé.
  const importsDir = join(root, "imports");
  const templateIds = existsSync(importsDir)
    ? (await readdir(importsDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && existsSync(join(importsDir, d.name, "desktop.png")))
        .map((d) => d.name)
        .filter((id) => !only || id === only)
    : [];
  if (templateIds.length) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1600 }, deviceScaleFactor: SCALE });
    const page = await context.newPage();
    for (const id of templateIds) {
      const sheet = join(importsDir, id, "_vignette.html");
      await writeFile(sheet, `<!doctype html><body style="margin:0"><img src="desktop.png" style="display:block;width:1440px">`, "utf8");
      await page.goto(pathToFileURL(sheet).href, { waitUntil: "load" });
      await page.screenshot({ path: join(importsDir, id, "vignette.png"), clip: { x: 0, y: 0, width: 1440, height: 1600 } });
      await rm(sheet, { force: true });
      console.log(`✓ template ${id}`);
    }
  }
} finally {
  await browser.close();
}
