// Découpe les photos d'origine directement dans la capture pleine page.
// Usage : node scripts/photos.mjs <nom-du-dossier>   (relance sur un import existant)
// Appelé aussi automatiquement à la fin de chaque capture (scripts/capture.mjs).
//
// Lit imports/<nom>/capture.json (positions mesurées des photos) et
// imports/<nom>/desktop-photos.png (la capture sans texte), et produit dans
// imports/<nom>/images/ :
//   NN-KK.png         la photo KK de la section NN, au pixel près
//   planche-NN.png    toutes les photos de la section NN, numérotées
//   photos.json       la liste (section, numéro, fichier, taille, source)
//
// Ces fichiers restent sur le PC : ils servent de référence dans l'atelier et
// ne sont jamais exportés vers Shopify ni publiés.
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function cropPhotos(browser, slug) {
  const dir = join(root, "imports", slug);
  const capture = JSON.parse(await readFile(join(dir, "capture.json"), "utf8"));
  const view = capture.views.desktop;
  const imagesDir = join(dir, "images");
  await rm(imagesDir, { recursive: true, force: true });
  await mkdir(imagesDir, { recursive: true });

  // La capture affichée telle quelle, à l'échelle 1 : une découpe = un clip.
  // desktop-photos.png = la même capture sans le texte (voir capture.mjs).
  const source = existsSync(join(dir, "desktop-photos.png")) ? "desktop-photos.png" : "desktop.png";
  const sheet = join(imagesDir, "_capture.html");
  await writeFile(sheet, `<!doctype html><body style="margin:0"><img src="../${source}" style="display:block">`, "utf8");
  const context = await browser.newContext({ viewport: { width: view.viewport.width, height: 900 } });
  const page = await context.newPage();
  await page.goto(pathToFileURL(sheet).href, { waitUntil: "load" });
  const size = await page.evaluate(() => ({ w: document.images[0].naturalWidth, h: document.images[0].naturalHeight }));

  const list = [];
  for (const s of view.sections) {
    const n = String(s.index).padStart(2, "0");
    let k = 0;
    for (const p of s.photos ?? []) {
      const x = Math.max(0, p.box.x);
      const y = Math.max(0, p.box.y);
      const width = Math.min(p.box.width, size.w - x);
      const height = Math.min(p.box.height, size.h - y);
      if (width < 8 || height < 8) continue;
      const file = `${n}-${String(++k).padStart(2, "0")}.png`;
      // Photo en partie cachée sur le site : sa capture entière (voir capture.mjs).
      if (p.shot && existsSync(join(dir, p.shot))) await copyFile(join(dir, p.shot), join(imagesDir, file));
      else await page.screenshot({ path: join(imagesDir, file), fullPage: true, clip: { x, y, width, height } });
      list.push({ section: s.index, n: k, file, kind: p.kind, size: `${width}x${height}`, alt: p.alt, src: p.src });
    }
  }
  await writeFile(join(imagesDir, "photos.json"), JSON.stringify(list, null, 2), "utf8");

  // Planches numérotées : pour associer chaque photo au bon réglage de section.
  for (const index of [...new Set(list.map((p) => p.section))]) {
    const n = String(index).padStart(2, "0");
    const items = list.filter((p) => p.section === index);
    const board = join(imagesDir, "_planche.html");
    await writeFile(
      board,
      `<!doctype html><body style="margin:0;padding:12px;background:#eee;font:600 14px system-ui;display:flex;flex-wrap:wrap;gap:12px;width:1176px">
${items
  .map(
    (p) => `<figure style="margin:0;background:#fff;padding:6px;border-radius:6px"><img src="${p.file}" style="display:block;max-width:280px;max-height:220px">
<figcaption>${p.file} · ${p.size}${p.kind === "fond" ? " · fond" : ""}</figcaption></figure>`,
  )
  .join("\n")}`,
      "utf8",
    );
    await page.setViewportSize({ width: 1200, height: 400 });
    await page.goto(pathToFileURL(board).href, { waitUntil: "load" });
    await page.screenshot({ path: join(imagesDir, `planche-${n}.png`), fullPage: true });
  }
  await context.close();
  await rm(sheet, { force: true });
  await rm(join(imagesDir, "_planche.html"), { force: true });
  console.log(`✓ ${list.length} photo(s) d'origine découpée(s) dans imports/${slug}/images/`);
  return list;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const slug = process.argv[2];
  if (!slug || !existsSync(join(root, "imports", slug, "capture.json"))) {
    console.error("Usage : node scripts/photos.mjs <nom-du-dossier-dans-imports>");
    process.exit(1);
  }
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await cropPhotos(browser, slug);
  } finally {
    await browser.close();
  }
}
