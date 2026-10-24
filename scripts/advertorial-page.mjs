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
import { readFile, writeFile } from "node:fs/promises";
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

// ---- Mise en page : rangées et colonnes relevées sur la page d'origine ----
// Les éléments qui se chevauchent verticalement sont côte à côte : ils forment
// une rangée, découpée en colonnes selon leur position horizontale. Deux
// niveaux (ex. article + barre latérale, puis 3 chiffres côte à côte).
items.forEach((it, i) => (it.idx = i));
const top = (it) => it.box.y;
const bottom = (it) => it.box.y + it.box.height;

function groupsOf(list) {
  const groups = [];
  for (const it of list) {
    const t = top(it) + 4;
    const b = bottom(it) - 4;
    const g = groups.findIndex((gr) => gr.bottom > t && gr.top < b);
    if (g >= 0) {
      const merged = groups.splice(g);
      groups.push({
        items: [...merged.flatMap((m) => m.items), it],
        top: Math.min(top(it), ...merged.map((m) => m.top)),
        bottom: Math.max(bottom(it), ...merged.map((m) => m.bottom)),
      });
    } else groups.push({ items: [it], top: top(it), bottom: bottom(it) });
  }
  return groups;
}

function columnsOf(list) {
  let cols = [];
  for (const it of [...list].sort((a, b) => a.box.x - b.box.x)) {
    const l = it.box.x + 4;
    const r = it.box.x + it.box.width - 4;
    const c = cols.find((col) => col.left < r && col.right > l);
    if (c) {
      c.items.push(it);
      c.left = Math.min(c.left, it.box.x);
      c.right = Math.max(c.right, it.box.x + it.box.width);
    } else cols.push({ items: [it], left: it.box.x, right: it.box.x + it.box.width });
  }
  // Une colonne élargie peut en recouvrir une autre : on les fusionne.
  for (let changed = true; changed; ) {
    changed = false;
    cols.sort((a, b) => a.left - b.left);
    for (let i = 1; i < cols.length; i++) {
      if (cols[i].left < cols[i - 1].right - 4) {
        cols[i - 1].items.push(...cols[i].items);
        cols[i - 1].right = Math.max(cols[i - 1].right, cols[i].right);
        cols.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  for (const c of cols) c.items.sort((a, b) => a.idx - b.idx);
  return cols;
}

function unitsOf(list, depth) {
  const units = [];
  for (const g of groupsOf(list)) {
    if (g.items.length > 1 && depth < 2) {
      const cols = columnsOf(g.items);
      if (cols.length > 1) {
        units.push({ row: true, top: g.top, bottom: g.bottom, cols: cols.map((c) => ({ left: c.left, right: c.right, units: unitsOf(c.items, depth + 1) })) });
        continue;
      }
    }
    for (const it of g.items.sort((a, b) => a.idx - b.idx)) units.push({ item: it, top: top(it), bottom: bottom(it) });
  }
  return units;
}

const countOf = (u) => (u.row ? u.cols.reduce((n, c) => n + c.units.reduce((m, x) => m + countOf(x), 0), 0) : 1);

// Rangée trop longue pour une section (barre latérale à côté de tout l'article) :
// coupée en tranches horizontales, chaque colonne garde sa place.
const MAX_PIECE = BLOCKS_PER_SECTION - 2;
function splitRow(u) {
  if (!u.row || countOf(u) <= MAX_PIECE) return [u];
  const all = u.cols.flatMap((c, ci) => c.units.map((x) => ({ x, ci }))).sort((a, b) => a.x.top - b.x.top);
  const pieces = [];
  let cur = null;
  const lastBottom = u.cols.map(() => null);
  for (const { x, ci } of all) {
    if (!cur || (cur.n + countOf(x) > MAX_PIECE && cur.n > 0)) {
      cur = { row: true, n: 0, top: x.top, bottom: x.bottom, colPrev: [...lastBottom], cols: u.cols.map((c) => ({ left: c.left, right: c.right, units: [] })) };
      pieces.push(cur);
    }
    cur.cols[ci].units.push(x);
    cur.n += countOf(x);
    cur.bottom = Math.max(cur.bottom, x.bottom);
    lastBottom[ci] = x.bottom;
  }
  return pieces;
}

const pctOf = (n, w) => (w > 0 ? (n / w) * 100 : 100);
function blockFor(it, ctx, marge) {
  const b = {
    repere: "",
    kind: it.kind,
    text: "",
    image: "",
    image_width: 100,
    link: "",
    align: "left",
    size: 0,
    bold: false,
    italic: false,
    majuscules: false,
    police_titres: false,
    interligne: 0,
    color: "",
    bg: "",
    marge: clamp(marge, 0, 120, 2),
    pleine: false,
    fond_rangee: "",
    rangee_pleine: false,
    fond_cellule: "",
    fond_cellule2: "",
    ligne: ctx.ligne ?? "",
    colonne: ctx.colonne ?? 1,
    largeur: ctx.largeur ?? 50,
    decalage: ctx.decalage ?? 0,
    ligne2: ctx.ligne2 ?? "",
    colonne2: ctx.colonne2 ?? 1,
    largeur2: ctx.largeur2 ?? 50,
    decalage2: ctx.decalage2 ?? 0,
  };
  const n = it.idx + 1;
  const wide = ctx.level === 0 && (it.box.width >= FULL || (it.style?.bgBox?.width ?? 0) >= FULL);
  // Fond déjà porté par la rangée ou la colonne : pas de fond propre.
  const inherited = (c) => ctx.fonds?.some((f) => sameColor(f, c));
  if (it.kind === "image") {
    b.image = it.file;
    b.pleine = it.box.width >= FULL && ctx.level === 0;
    b.image_width = b.pleine ? 100 : clamp(pctOf(it.box.width, ctx.width), 10, 100, 5);
    const leftGap = it.box.x - ctx.left;
    const rightGap = ctx.left + ctx.width - (it.box.x + it.box.width);
    b.align = b.image_width >= 100 || Math.abs(leftGap - rightGap) < 16 ? "center" : leftGap > rightGap ? "right" : "left";
    b.repere = `${n} · Image`;
    return b;
  }
  if (it.kind === "separateur") {
    b.repere = `${n} · Séparateur`;
    return b;
  }
  const s = it.style;
  const isHeading = it.kind === "titre" || it.kind === "intertitre";
  b.text = brief(it);
  b.align = align(s.textAlign);
  b.italic = s.fontStyle === "italic";
  b.majuscules = s.textTransform === "uppercase";
  const lh = parseFloat(s.lineHeight);
  if (lh && s.fontSize) b.interligne = clamp((lh / s.fontSize) * 10, 10, 30);
  if (!isHeading && d.headingFont && d.headingFont !== d.bodyFont && s.fontFamily === d.headingFont) b.police_titres = true;
  // Fond différent de la page : encadré (ou titre, bouton sur bandeau coloré).
  const ownBg = it.kind === "bouton" ? s.ownBackground : !sameColor(s.background, pageBg) ? s.background : null;
  if (ownBg && hex(ownBg) && !inherited(ownBg)) {
    b.bg = hex(ownBg);
    if (it.kind === "paragraphe") b.kind = "encadre";
    b.pleine = wide && it.kind !== "bouton";
  }
  const refColor = isHeading ? headingColor : it.kind === "bouton" ? d.buttonTextColor : d.bodyColor;
  if (!sameColor(s.color, refColor) && hex(s.color)) b.color = hex(s.color);
  if (it.kind === "titre" && Math.abs(s.fontSize - sectionSettings.title_size) > 3) b.size = clamp(s.fontSize, 0, 60);
  else if (it.kind === "intertitre" && Math.abs(s.fontSize - sectionSettings.subtitle_size) > 3) b.size = clamp(s.fontSize, 0, 60);
  else if (!isHeading && Math.abs(s.fontSize - sectionSettings.font_size) >= 2) b.size = clamp(s.fontSize, 0, 60);
  if (!isHeading && it.kind !== "bouton" && s.fontWeight >= 600) b.bold = true;
  b.repere = `${n} · ${LABELS[b.kind] ?? b.kind}${it.words ? ` — ${plural(it.words, "mot")}` : ""}`;
  return b;
}

let rowCounter = 0;
function emit(units, ctx, prevBottom, out) {
  for (const u of units) {
    if (!u.row) {
      out.push(blockFor(u.item, ctx, u.top - prevBottom));
      prevBottom = Math.max(prevBottom, u.bottom);
      continue;
    }
    const key = `r${++rowCounter}`;
    let prevRight = ctx.left;
    // Fond commun à toute la rangée (bandeau) ou à une colonne (carte).
    const leaves = (x) => (x.row ? x.cols.flatMap((c) => c.units.flatMap(leaves)) : [x.item]);
    const commonBg = (list) => {
      const bgs = list.map((it) => it.style?.background).filter(Boolean);
      const first = bgs[0];
      return first && bgs.length === list.length && bgs.every((c) => sameColor(c, first)) && !sameColor(first, pageBg) && !ctx.fonds?.some((f) => sameColor(f, first)) ? first : null;
    };
    const rowLeaves = leaves(u);
    const rowBg = ctx.level === 0 ? commonBg(rowLeaves) : null;
    const rowWide = rowBg && rowLeaves.some((it) => (it.style?.bgBox?.width ?? 0) >= FULL);
    let firstOfRow = true;
    u.cols.forEach((c, i) => {
      if (!c.units.length) return;
      const w = c.right - c.left;
      const largeur = clamp(pctOf(w, ctx.width), 5, 100);
      const decalage = clamp(pctOf(c.left - prevRight, ctx.width), 0, 60);
      prevRight = c.right;
      const colonne = Math.min(i + 1, 6);
      const fonds = [...(ctx.fonds ?? []), ...(rowBg ? [rowBg] : [])];
      const colBg = commonBg(c.units.flatMap(leaves));
      const cellBg = colBg && !fonds.some((f) => sameColor(f, colBg)) ? colBg : null;
      const sub =
        ctx.level === 0
          ? { level: 1, width: w, left: c.left, ligne: key, colonne, largeur, decalage, fonds: [...fonds, ...(cellBg ? [cellBg] : [])] }
          : { ...ctx, level: 2, width: w, left: c.left, ligne2: key, colonne2: colonne, largeur2: largeur, decalage2: decalage, fonds: [...fonds, ...(cellBg ? [cellBg] : [])] };
      const start = out.length;
      emit(c.units, sub, u.colPrev?.[i] ?? prevBottom, out);
      if (out.length > start) {
        if (cellBg) out[start][ctx.level === 0 ? "fond_cellule" : "fond_cellule2"] = hex(cellBg);
        if (firstOfRow && rowBg) {
          out[start].fond_rangee = hex(rowBg);
          out[start].rangee_pleine = Boolean(rowWide);
        }
        firstOfRow = false;
      }
    });
    prevBottom = Math.max(prevBottom, u.bottom);
  }
  return prevBottom;
}

const units = unitsOf(items, 0).flatMap(splitRow);
const content = [];
let chunk = [];
let carried = Math.min(...items.map(top));
const flush = () => {
  if (!chunk.length) return;
  const blocksOut = [];
  carried = emit(chunk, { level: 0, width: contentBox.width, left: contentBox.x }, carried, blocksOut);
  content.push({
    type: "advertorial-article",
    props: { id: `article-${content.length + 1}`, ...sectionSettings, blocks_element: blocksOut },
  });
  chunk = [];
};
let inChunk = 0;
for (const u of units) {
  const n = countOf(u);
  if (inChunk + n > BLOCKS_PER_SECTION) {
    flush();
    inChunk = 0;
  }
  chunk.push(u);
  inChunk += n;
}
flush();
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

const photos = items.filter((it) => it.kind === "image").length;
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
