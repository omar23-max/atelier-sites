// Studio d'images : traitement d'une demande « images » (bouton « Studio
// d'images » de l'atelier).
//
//   node scripts/studio.mjs planches <dossier-demande>
//     Pour chaque photo à refaire, crée planches/<clé>.png : la photo d'origine
//     à gauche, les références de l'utilisateur à droite (numérotées), et
//     consignes.json avec la consigne de génération de chaque image. Nano
//     Banana ne prend qu'une image en entrée : la planche réunit tout.
//
//   node scripts/studio.mjs appliquer <dossier-demande>
//     Copie chaque resultats/<clé>.png dans medias/<page>/ et le pose dans le
//     bon champ image de la page (copie de sécurité de la page avant).
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { root } from "./lib/load.mjs";

const [command, folderArg] = process.argv.slice(2);
if (!["planches", "appliquer"].includes(command) || !folderArg) {
  console.error("Usage : node scripts/studio.mjs planches|appliquer demandes/<date>-images");
  process.exit(1);
}
const dir = resolve(root, folderArg);
const demande = JSON.parse(await readFile(join(dir, "demande.json"), "utf8"));
if (demande.type !== "images") throw new Error("Ce n'est pas une demande « images ».");
const { details } = demande;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function consigneFor(cible, size) {
  const refs = details.references.map((r) => `#${r.ordre} = ${r.etiquette}`).join(", ");
  const mode =
    details.mode === "pub"
      ? "Make it a stronger, scroll-stopping advertising version of the LEFT photo, keeping its idea and layout."
      : "Recreate the LEFT photo faithfully: same composition, framing, people, setting, lighting and mood.";
  return [
    "This image is a reference board. LEFT (large, labelled ORIGINAL): the photo to recreate.",
    `RIGHT (numbered): the user's own references: ${refs}.`,
    mode,
    `Replace the product shown in the original with the user's product "${details.produit || "the product"}" exactly as it looks in the references (shape, colours, label).`,
    "Use the user's logo and colours from the references; never keep the original brand name or logo.",
    details.textes ? `Text changes inside the image: ${details.textes}.` : "Keep any text short and legible; replace the original brand's words with the user's.",
    cible.brief ? `Purpose of this image on the page: ${cible.brief}.` : "",
    cible.consigne ? `Extra instruction: ${cible.consigne}.` : "",
    `Output ONLY the recreated photo, as one single image with the same aspect ratio as the original (${size}). No board, no labels, no split screen.`,
  ]
    .filter(Boolean)
    .join(" ");
}

if (command === "planches") {
  const boards = join(dir, "planches");
  await mkdir(boards, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const consignes = {};
  try {
    for (const cible of details.cibles) {
      const source = pathToFileURL(join(root, cible.source)).href;
      const refs = demande.images.map((file, i) => ({ src: pathToFileURL(join(dir, file)).href, ...details.references[i] }));
      const html = join(boards, "_planche.html");
      await writeFile(
        html,
        `<!doctype html><body style="margin:0;background:#fff;font:700 22px system-ui">
<div id="b" style="display:flex;gap:24px;padding:24px;align-items:flex-start;width:max-content">
  <figure style="margin:0"><figcaption style="margin-bottom:8px">ORIGINAL</figcaption>
    <img id="o" src="${source}" style="display:block;max-width:900px;max-height:900px;min-height:400px;object-fit:contain"></figure>
  <div style="display:grid;grid-template-columns:repeat(2,300px);gap:14px">
    ${refs
      .map(
        (r) => `<figure style="margin:0"><figcaption style="margin-bottom:6px">#${r.ordre} ${esc(r.etiquette)}</figcaption>
      <img src="${r.src}" style="display:block;width:300px;height:300px;object-fit:contain;background:#f4f4f4"></figure>`,
      )
      .join("")}
  </div>
</div>`,
        "utf8",
      );
      await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
      const size = await page.evaluate(() => {
        const o = document.getElementById("o");
        return `${o.naturalWidth}x${o.naturalHeight}`;
      });
      await page.locator("#b").screenshot({ path: join(boards, `${cible.key}.png`) });
      consignes[cible.key] = { planche: `planches/${cible.key}.png`, taille: size, consigne: consigneFor(cible, size) };
      console.log(`✓ planche ${cible.key}`);
    }
  } finally {
    await browser.close();
  }
  await writeFile(join(dir, "consignes.json"), JSON.stringify(consignes, null, 2) + "\n", "utf8");
  console.log(`\n${details.cibles.length} planche(s) dans ${folderArg}/planches/, consignes dans consignes.json.`);
}

if (command === "appliquer") {
  const pageFile = join(root, "pages", `${demande.page}.json`);
  const pageData = JSON.parse(await readFile(pageFile, "utf8"));
  await mkdir(join(root, "pages", "_historique"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  await copyFile(pageFile, join(root, "pages", "_historique", `${demande.page}__${stamp}.json`));

  const mediaDir = join(root, "medias", demande.page);
  await mkdir(mediaDir, { recursive: true });
  let applied = 0;
  for (const cible of details.cibles) {
    const result = join(dir, "resultats", `${cible.key}.png`);
    if (!existsSync(result)) {
      console.warn(`… pas encore d'image pour ${cible.key}`);
      continue;
    }
    await copyFile(result, join(mediaDir, `${cible.key}.png`));
    const item = pageData.content.find((c) => c.props?.id === cible.sectionId);
    if (!item) {
      console.warn(`✗ section ${cible.sectionId} introuvable dans la page`);
      continue;
    }
    const url = `/medias/${demande.page}/${cible.key}.png`;
    if (cible.blockType) {
      const key = `blocks_${cible.blockType}`;
      item.props[key] ??= [];
      item.props[key][cible.blockIndex] = { ...(item.props[key][cible.blockIndex] ?? {}), [cible.settingId]: url };
    } else {
      item.props[cible.settingId] = url;
    }
    applied++;
  }
  await writeFile(pageFile, JSON.stringify(pageData, null, 2) + "\n", "utf8");
  console.log(`✓ ${applied} image(s) posée(s) dans pages/${demande.page}.json (copie de sécurité dans pages/_historique/).`);
}
