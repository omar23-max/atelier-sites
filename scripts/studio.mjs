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
if (!["planches", "generer", "appliquer"].includes(command) || !folderArg) {
  console.error("Usage : node scripts/studio.mjs planches|generer|appliquer demandes/<date>-images");
  process.exit(1);
}
const dir = resolve(root, folderArg);
const demande = JSON.parse(await readFile(join(dir, "demande.json"), "utf8"));
if (demande.type !== "images") throw new Error("Ce n'est pas une demande « images ».");
const { details } = demande;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Références : « #2 = Produit · Face avant », « #4 = Marque · Logo » (les
// anciennes demandes n'ont pas de groupe).
const refLabel = (r) => `#${r.ordre} = ${r.groupe === "marque" ? "Brand" : r.groupe === "produit" ? "Product" : ""}${r.groupe ? " · " : ""}${r.etiquette}`;
const PUB_FORMATS = { "1:1": [1024, 1024], "4:5": [1024, 1280], "9:16": [1024, 1820] };

function consigneFor(cible, size) {
  const refs = details.references.map(refLabel).join(", ");
  const product = details.produit || "the product";
  const colors = details.marque?.couleurs ? Object.entries(details.marque.couleurs).map(([r, c]) => `${r} ${c}`).join(", ") : "";
  const fonts = details.marque?.polices ? Object.values(details.marque.polices).filter(Boolean).join(" / ") : "";
  const pub = details.mode === "pub";
  return [
    "This image is a reference board. LEFT (large, labelled ORIGINAL): the photo to recreate.",
    `RIGHT (numbered): the user's own references: ${refs}.`,
    pub
      ? `Turn the LEFT photo into a scroll-stopping social media AD (${details.format ?? "4:5"}), keeping its idea: bold, clean layout, product as the hero.`
      : "Recreate the LEFT photo faithfully: same composition, framing, people, setting, lighting and mood.",
    `Replace the product shown in the original with the user's product "${product}" exactly as it looks in the Product references (shape, colours, label).`,
    details.description ? `What the product is: ${details.description}.` : "",
    "Brand: use the logo and style of the Brand references; never keep the original brand name, logo or packaging.",
    colors ? `Brand colours: ${colors}.` : "",
    fonts ? `Brand fonts (for any text): ${fonts}.` : "",
    `Rewrite EVERY piece of visible text (labels, packaging, signs, captions) so it names "${product}" or is neutral; no other brand name may stay readable.`,
    details.textes ? `Exact text changes: ${details.textes}.` : "",
    pub && details.accroche ? `Headline written on the ad, large and legible: "${details.accroche}".` : "",
    pub && details.cta ? `Call-to-action button on the ad: "${details.cta}".` : "",
    cible.brief ? `Purpose of this image on the page: ${cible.brief}.` : "",
    cible.consigne ? `Extra instruction: ${cible.consigne}.` : "",
    pub
      ? "Output ONLY the finished ad, as one single image. No board, no labels, no split screen."
      : `Output ONLY the recreated photo, as one single image with the same aspect ratio as the original (${size}). No board, no labels, no split screen.`,
  ]
    .filter(Boolean)
    .join(" ");
}

// Avancement lu par l'atelier (Studio d'images) : { faites, total, etat }.
async function progress(patch) {
  const file = join(dir, "demande.json");
  const current = JSON.parse(await readFile(file, "utf8"));
  current.progression = { ...current.progression, ...patch };
  await writeFile(file, JSON.stringify(current, null, 2) + "\n", "utf8");
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

// node scripts/studio.mjs generer <dossier-demande>
//   Crée chaque image avec gpt-image-2 (OpenAI, clé OPENAI_API_KEY de
//   .env.local) : la photo d'origine et les références sont envoyées comme
//   images séparées (pas de planche). Respecte le rythme demandé : tout, les
//   5 premières, ou une par une (une image par lancement). Les images déjà
//   faites (resultats/<clé>.png) ne sont pas refaites.
if (command === "generer") {
  const { editImageFiles, sizeFor } = await import("./lib/ia.mjs");
  const env = Object.fromEntries(
    (existsSync(join(root, ".env.local")) ? await readFile(join(root, ".env.local"), "utf8") : "")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const results = join(dir, "resultats");
  await mkdir(results, { recursive: true });
  const todo = details.cibles.filter((c) => !existsSync(join(results, `${c.key}.png`)));
  // Rythme : tout, 5, un nombre choisi, ou une image par lancement (on montre
  // chaque image avant la suivante).
  const limit = details.rythme === "5" ? 5 : details.rythme === "n" ? Math.max(1, Number(details.n) || 1) : details.rythme === "une-par-une" ? 1 : todo.length;
  const refs = demande.images.map((file) => join(dir, file));
  const labels = details.references.map((r) => refLabel({ ...r, ordre: r.ordre + 1 }).replace(/^#/, "image ")).join(", ");
  const total = details.cibles.length;
  let faites = total - todo.length;
  const sautees = [];
  await progress({ faites, total, etat: "en cours", sautees });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  let done = 0;
  try {
    for (const cible of todo.slice(0, limit)) {
      const source = join(root, cible.source);
      await page.goto(pathToFileURL(source).href);
      const [w, h] = await page.evaluate(() => [document.images[0]?.naturalWidth ?? 0, document.images[0]?.naturalHeight ?? 0]);
      const prompt = consigneFor(cible, `${w}x${h}`)
        .replace("This image is a reference board. LEFT (large, labelled ORIGINAL): the photo to recreate.", "The FIRST image is the photo to recreate.")
        .replace(/RIGHT \(numbered\): the user's own references: [^.]*\./, refs.length ? `The other images are the user's own references: ${labels}.` : "")
        .replace(/the LEFT photo/g, "the first photo")
        .replace(" No board, no labels, no split screen.", " No collage, no labels, no split screen.");
      try {
        const [fw, fh] = details.mode === "pub" ? (PUB_FORMATS[details.format] ?? PUB_FORMATS["4:5"]) : [w, h];
        const png = await editImageFiles({ key: env.OPENAI_API_KEY, files: [source, ...refs], prompt, size: sizeFor(fw, fh) });
        await writeFile(join(results, `${cible.key}.png`), png);
        done++;
        await progress({ faites: ++faites });
        console.log(`✓ ${cible.key}`);
      } catch (e) {
        // Image refusée ou ratée (ex. photo d'enfant refusée par OpenAI) :
        // notée, et on passe à la suivante.
        sautees.push({ key: cible.key, raison: e.message.slice(0, 160) });
        await progress({ sautees });
        console.warn(`✗ ${cible.key} : ${e.message} — sautée, on continue`);
      }
    }
  } finally {
    await browser.close();
  }
  await progress({ etat: faites >= total ? "terminé" : "en pause, à relancer" });
  console.log(`\n${done} image(s) créée(s) avec gpt-image-2 ; ${todo.length - done} restante(s). Ensuite : node scripts/studio.mjs appliquer ${folderArg}`);
}

// Mode pub : les visuels sont rangés à part (medias/<page>/pubs/), la page
// garde ses photos.
if (command === "appliquer" && details.mode === "pub") {
  const pubsDir = join(root, "medias", demande.page, "pubs");
  await mkdir(pubsDir, { recursive: true });
  let n = 0;
  for (const cible of details.cibles) {
    const result = join(dir, "resultats", `${cible.key}.png`);
    if (!existsSync(result)) continue;
    await copyFile(result, join(pubsDir, `${cible.key}-${(details.format ?? "4:5").replace(":", "x")}.png`));
    n++;
  }
  console.log(`✓ ${n} pub(s) dans medias/${demande.page}/pubs/ (la page n'est pas modifiée).`);
}

if (command === "appliquer" && details.mode !== "pub") {
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
