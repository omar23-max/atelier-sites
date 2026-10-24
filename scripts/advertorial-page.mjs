// Deuxième étape d'un import d'advertorial : à partir de imports/<nom>/advertorial.json
// (npm run advertorial), crée la page mirror, le template et le design.md.
// Usage : npm run advertorial:page -- <nom>
//
// La fiche imports/<nom>/fiche.json (écrite à la main après lecture de la page)
// donne le nom du template, le produit, la marque, le secteur et le type :
//   { "nom": "...", "produit": "...", "marque": "...", "secteur": "...",
//     "pageType": "advertorial", "ambiance": "..." }
//
// La page ne reprend aucun texte d'origine : chaque texte devient un brief
// « [ Paragraphe — 48 mots ] » à la même place, avec le même style. Les photos
// d'origine (/imports/…) servent de repère dans l'atelier et ne sont jamais exportées.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { buildCopy } from "./lib/copie.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
if (!slug) {
  console.error("Usage : npm run advertorial:page -- <nom-du-dossier>");
  process.exit(1);
}
const dir = join(root, "imports", slug);
const report = JSON.parse(await readFile(join(dir, "advertorial.json"), "utf8"));
const fiche = existsSync(join(dir, "fiche.json")) ? JSON.parse(await readFile(join(dir, "fiche.json"), "utf8")) : {};
if (report.disparue) {
  console.error(`✗ ${slug} : page disparue ou vide, rien à créer.`);
  process.exit(2);
}

const BLOCKS_PER_SECTION = 40; // Shopify : 50 blocs au plus par section
const clamp = (n, min, max, step = 1) => Math.min(max, Math.max(min, Math.round(n / step) * step));
function hex(color) {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(color ?? "");
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) < 0.5) return null;
  return `#${[m[1], m[2], m[3]].map((v) => Math.round(Number(v)).toString(16).padStart(2, "0")).join("")}`;
}
// Police d'origine → nom Google Fonts (le kit de marque charge Google Fonts).
const FONT_EQUIV = {
  "proxima-nova": "Montserrat",
  "proxima nova": "Montserrat",
  "helvetica neue": "Arimo",
  helvetica: "Arimo",
  arial: "Arimo",
  georgia: "Gelasio",
  "times new roman": "Tinos",
  times: "Tinos",
  "-apple-system": "Inter",
  "system-ui": "Inter",
  blinkmacsystemfont: "Inter",
  "segoe ui": "Inter",
  verdana: "Inter",
  tahoma: "Inter",
  "sans-serif": "Inter",
  serif: "Gelasio",
  "futura pt": "Jost",
  futura: "Jost",
  "avenir next": "Nunito Sans",
  avenir: "Nunito Sans",
  "gt walsheim": "DM Sans",
  "circular std": "DM Sans",
  "sofia pro": "Figtree",
  "brandon grotesque": "Josefin Sans",
};
function googleFont(stack) {
  const first = (stack ?? "").split(",")[0].replace(/["']/g, "").trim();
  if (!first) return "";
  return FONT_EQUIV[first.toLowerCase()] ?? first;
}
const sameColor = (a, b) => hex(a) && hex(b) && hex(a) === hex(b);
const align = (a) => (a === "center" ? "center" : a === "right" || a === "end" ? "right" : "left");
const isNumeric = (t) => /^[\d\s%$€£.,:+×x/\-*]+$/.test(t) && /\d/.test(t);
const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

const d = report.design;
const pageBg = d.pageBackground;
const items = report.items.filter((it) => (it.kind === "image" ? it.file : true));
const headingsOnPage = items.filter((it) => ["titre", "intertitre"].includes(it.kind) && sameColor(it.style.background, pageBg));
const headingColor = headingsOnPage[0]?.style.color ?? d.headingColor ?? d.bodyColor;

// Zone de contenu : bords gauche et droit des éléments (hors bandeaux pleine largeur).
const FULL = 1300;
const pct = (arr, p) => arr.sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))] ?? 0;
const inner = items.filter((it) => it.box.width < FULL);
const contentLeft = pct(inner.map((it) => it.box.x), 0.05);
const contentRight = pct(inner.map((it) => it.box.x + it.box.width), 0.95);
const contentBox = { x: contentLeft, width: Math.max(320, contentRight - contentLeft) };

const sectionSettings = {
  width: clamp(contentBox.width || d.columnWidth || 720, 480, 1200, 10),
  padding_y: 0,
  font_size: clamp(d.bodySize || 18, 14, 24),
  title_size: clamp(d.titleSize || 38, 24, 64),
  subtitle_size: clamp(d.subtitleSize || 26, 18, 44),
  color_bg: hex(pageBg) ?? "#ffffff",
  color_text: hex(d.bodyColor) ?? "#222222",
  color_heading: hex(headingColor) ?? "#111111",
  color_link: hex(d.linkColor) ?? "#0b57d0",
  color_button: hex(d.buttonColor) ?? "#e4572e",
  color_button_text: hex(d.buttonTextColor) ?? "#ffffff",
  color_box: "#f4f4f4",
};

function brief(it) {
  const n = it.words ?? 0;
  if (isNumeric(it.text ?? "")) return `[ ${it.text.replace(/\d/g, "0")} ]`;
  switch (it.kind) {
    case "titre":
      return `[ Grand titre — ${plural(n, "mot")} ]`;
    case "intertitre":
      return `[ Intertitre — ${plural(n, "mot")} ]`;
    case "bouton":
      return `[ Bouton — ${plural(n, "mot")} ]`;
    case "citation":
      return `[ Citation ou avis — ${plural(n, "mot")} ]`;
    case "liste":
      return it.text
        .split("\n")
        .map((line) => `[ Point — ${plural(line.trim().split(/\s+/).length, "mot")} ]`)
        .join("\n");
    default:
      return n <= 6 ? `[ Texte court — ${plural(n, "mot")} ]` : `[ Paragraphe — ${plural(n, "mot")} ]`;
  }
}

const LABELS = {
  titre: "Grand titre",
  intertitre: "Intertitre",
  paragraphe: "Paragraphe",
  encadre: "Encadré",
  image: "Image",
  liste: "Liste",
  citation: "Citation",
  bouton: "Bouton",
  separateur: "Séparateur",
};

// ---- Copie au design identique (structure et styles d'origine, lib/copie.mjs) ----
const snap = JSON.parse(await readFile(join(dir, "snapshot.json"), "utf8"));
const host0 = new URL(report.url).hostname.replace(/^www\./, "");
const copy = buildCopy({ snap, slug, root, label: fiche.marque || host0, textes: process.argv.includes("--briefs") ? "briefs" : "origine" });
// Les parties d'une ancienne copie de cette page sont remplacées.
for (const old of await readdir(join(root, "sections"))) {
  if (old.startsWith(`${slug}-p`)) await rm(join(root, "sections", old), { recursive: true, force: true });
}
for (const s of copy.sections) {
  const sdir = join(root, "sections", s.id);
  await mkdir(sdir, { recursive: true });
  await writeFile(join(sdir, "schema.json"), JSON.stringify(s.schema, null, 2) + "\n", "utf8");
  await writeFile(join(sdir, "template.liquid"), s.template + "\n", "utf8");
  await writeFile(join(sdir, "style.css"), s.css + "\n", "utf8");
  await writeFile(join(sdir, "meta.json"), JSON.stringify(s.meta, null, 2) + "\n", "utf8");
}
const content = copy.sections.map((s) => ({ type: s.id, props: { id: s.id, blocks_element: s.blocks } }));
const blocks = content.flatMap((c) => c.props.blocks_element);


const host = new URL(report.url).hostname.replace(/^www\./, "");
const cleanUrl = `${new URL(report.url).origin}${new URL(report.url).pathname}`;
const pageType = fiche.pageType ?? "advertorial";
const fonts = { titres: googleFont(d.headingFont) || googleFont(d.bodyFont), texte: googleFont(d.bodyFont) };
const designId = `${slug}-design`;

const page = {
  root: {
    props: {
      title: `Import — ${host} (${pageType})`,
      font_heading: fonts.titres,
      font_body: fonts.texte,
      design: designId,
      pageType,
      produit: fiche.produit ?? "",
      profil: "",
      importSource: slug,
    },
  },
  content,
  zones: {},
};
await writeFile(join(root, "pages", `${slug}.json`), JSON.stringify(page, null, 2), "utf8");

const photos = report.photos ?? 0;
const template = {
  nom: fiche.nom ?? `${host} — ${pageType}`,
  pageType,
  niche: fiche.secteur ?? "",
  secteur: fiche.secteur ?? "",
  produit: fiche.produit ?? "",
  marque: fiche.marque ?? "",
  url: cleanUrl,
  urlComplete: report.url,
  lienProduit: fiche.lienProduit ?? report.links?.[0] ?? null,
  page: slug,
  design: designId,
  copieEntiere: true,
  elements: items.length,
  photos,
  sectionsSite: null,
  sections: ["advertorial-article"],
  capturedAt: report.capturedAt,
};
await writeFile(join(dir, "template.json"), JSON.stringify(template, null, 2), "utf8");

// design.md : relevé des styles réels de la page.
const count = (k) => items.filter((it) => it.kind === k).length;
const buttonBg = sectionSettings.color_button;
const boxes = [...new Set(blocks.map((b) => b.bg).filter(Boolean))].slice(0, 4);
const tokens = {
  polices: fonts,
  couleurs: {
    fond: sectionSettings.color_bg,
    surface: boxes[0] ?? "#f4f4f4",
    texte: sectionSettings.color_text,
    accent: sectionSettings.color_link,
    bouton: buttonBg,
    "bouton-texte": sectionSettings.color_button_text,
    "fond-sombre": boxes.find((c) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16) < 300) ?? sectionSettings.color_heading,
    "texte-sur-sombre": "#ffffff",
  },
};
const md = `# ${fiche.marque || host} — ${pageType}

Source : ${cleanUrl}
Capturé le : ${report.capturedAt} (desktop 1440 px et mobile 390 px)
Produit : ${fiche.produit || "?"} · Secteur : ${fiche.secteur || "?"}
${template.lienProduit ? `Page d'achat d'origine : ${template.lienProduit}\n` : ""}
## Ambiance

${fiche.ambiance ?? "Article de type presse, une seule colonne de lecture."}

## Structure relevée

${items.length} éléments dans l'ordre : ${count("titre")} grands titres, ${count("intertitre")} intertitres,
${count("paragraphe")} paragraphes, ${count("liste")} listes, ${photos} images, ${count("bouton")} boutons.
Copie entière dans la section « Advertorial — article complet » (${content.length} section${content.length > 1 ? "s" : ""}).

## Typographie

- **Titres : ${d.headingFont ?? "?"}**${fonts.titres ? ` (équivalent Google Fonts : ${fonts.titres})` : ""}.
  Grand titre ${d.titleSize || "?"} px ; intertitres ${d.subtitleSize || "?"} px.
- **Texte : ${d.bodyFont ?? "?"}**${fonts.texte ? ` (équivalent : ${fonts.texte})` : ""}, ${d.bodySize} px, interligne d'origine conservé à 1,6.

## Couleurs

| Rôle | Couleur |
|---|---|
| Fond de page | ${sectionSettings.color_bg} |
| Texte | ${sectionSettings.color_text} |
| Titres | ${sectionSettings.color_heading} |
| Liens | ${sectionSettings.color_link} |
| Bouton | ${buttonBg} |
| Texte des boutons | ${sectionSettings.color_button_text} |
${boxes.map((c) => `| Encadré / bandeau | ${c} |`).join("\n")}

## Formes

- Colonne de lecture : ${d.columnWidth} px à 1440 px.
- Rayon des boutons : ${d.buttonRadius ?? "?"}.

## Jetons (utilisés par l'atelier)

\`\`\`json
${JSON.stringify(tokens, null, 2)}
\`\`\`
`;
await writeFile(join(root, "designs", `${designId}.md`), md, "utf8");
console.log(`✓ ${slug} : page ${content.length} section(s), ${blocks.length} éléments, ${photos} photos · template · ${designId}.md`);
