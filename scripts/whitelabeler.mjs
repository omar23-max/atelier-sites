// Sections d'une page Whitelabeler (fichier « Download HTML ») → sections du
// catalogue, au design identique et modifiables comme les copies de pages.
//
//   node scripts/whitelabeler.mjs imports/<dossier>/source.html [n°…]
//
// Chaque section du fichier porte sa nature (data-wld-section) : on en fait une
// page à part (les autres sections masquées), servie par l'atelier (port 5180),
// capturée comme un advertorial (ordinateur, tablette, mobile), puis copiée en
// section du catalogue nommée par sa fonction, avec ses textes comme contenu
// de départ. Les numéros (1 = première section) limitent l'import.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCopy } from "./lib/copie.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Options pour un aperçu de la Section library (une section par fichier) :
//   --type <code du menu> (catégorie), --id <id de la section>, --numero <n>.
const argv = process.argv.slice(2);
const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const optType = opt("--type");
const optId = opt("--id");
const optNum = opt("--numero");
const positional = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const [source, ...only] = positional;
if (!source || !existsSync(source)) {
  console.error("Usage : node scripts/whitelabeler.mjs imports/<dossier>/source.html [n°…]");
  process.exit(1);
}
const dir = dirname(source);
const folder = relative(join(root, "imports"), dir).replace(/\\/g, "/");
const ORIGIN = process.env.ATL_SERVEUR ?? "http://localhost:5180";

// Nature Whitelabeler → famille du catalogue et nom en français.
const NATURES = {
  announcement_bar: ["bandeaux", "Bandeau d'annonce"],
  nav: ["entete", "Navigation"],
  hero: ["hero", "Hero"],
  hero_with_buy_box: ["fiche-produit", "Hero avec achat"],
  social_proof_strip: ["presse", "Preuve sociale"],
  testimonials_grid: ["temoignages", "Avis clients"],
  infographic_row: ["chiffres", "Infographie"],
  trust_features: ["confiance", "Garanties de confiance"],
  reasons_listicle: ["listicle", "Raisons d'acheter"],
  ingredient_feature_grid: ["ingredients", "Ingrédients / caractéristiques"],
  viral_videos_grid: ["video", "Vidéos clients"],
  comparison_table: ["comparatif", "Tableau comparatif"],
  newsletter_review: ["newsletter", "Newsletter"],
  faq_accordion: ["faq", "FAQ"],
  money_back_guarantee: ["garantie", "Garantie"],
  footer: ["pied-de-page", "Pied de page"],
  // Codes des 24 types de la « Section library » (menu déroulant de Whitelabeler).
  reviews: ["temoignages", "Customer reviews"],
  guarantee: ["garantie", "Guarantee"],
  how_to_use: ["mode-emploi", "How it works"],
  cta_band: ["cta", "Big call to action"],
  sticky_bar: ["sticky-atc", "Sticky Add to cart"],
  results_stats: ["resultats", "Results"],
  comparison: ["comparatif", "Us vs. the rest"],
  benefits_features: ["avantages", "Benefits"],
  video: ["video", "Video"],
  faq: ["faq", "Questions and answers"],
  trust_badges: ["confiance", "Trust badges"],
  founder_brand: ["marque", "Our story"],
  problem: ["probleme", "The problem it solves"],
  ingredients_science: ["ingredients", "What's inside"],
  offer_urgency: ["offre", "Special offer"],
  gallery_lifestyle: ["galerie", "Photo gallery"],
  expert_endorsement: ["expert", "Expert pick"],
  email_capture: ["newsletter", "Email sign-up"],
  tagline_band: ["slogan", "Tagline band"],
  content_article: ["histoire", "Story"],
  product_details: ["details-produit", "Product details"],
  bundle_upsell: ["packs", "Bundle offer"],
};

let html = await readFile(source, "utf8");
// Une section = une balise ouvrante portant data-wld-section.
const opens = [...html.matchAll(/<(\w+)([^>]*?)\sdata-wld-section="([a-z_]+)"([^>]*)>/g)];
console.log(`${opens.length} section(s) dans ${source}`);
const HIDE = "<style>[data-wld-section]:not([data-atl-garder]){display:none!important}</style>";

const counters = {};
for (const [i, m] of opens.entries()) {
  const nature = m[3];
  counters[nature] = (counters[nature] ?? 0) + 1;
  const n = i + 1;
  if (only.length && !only.includes(String(n))) continue;
  const [family, nom] = NATURES[optType ?? nature] ?? NATURES[nature] ?? ["autres", nature.replace(/_/g, " ")];
  const titre = /aria-label="([^"]+)"/.exec(m[0])?.[1];
  const num = String(n).padStart(2, "0");
  // La page de cette section seule.
  const one = html.slice(0, m.index) + m[0].replace(/>$/, " data-atl-garder>") + html.slice(m.index + m[0].length);
  const file = `s${num}.html`;
  await writeFile(join(dir, file), one.replace("</head>", `${HIDE}</head>`), "utf8");
  const slug = `${folder}-s${num}`;
  console.log(`\n— ${n}. ${nom}${titre && titre !== "Reasons to buy" ? ` (« ${titre} »)` : ""}`);
  try {
    execFileSync("node", ["scripts/advertorial.mjs", `${ORIGIN}/imports/${folder}/${file}`, slug], {
      cwd: root,
      env: { ...process.env, ATL_GARDER_MENU: "1" },
      stdio: ["ignore", "pipe", "inherit"],
      timeout: 600000,
    });
  } catch (e) {
    console.log(`  ✗ capture impossible : ${e.message.split("\n")[0]}`);
    continue;
  }
  const snap = JSON.parse(await readFile(join(root, "imports", slug, "snapshot.json"), "utf8"));
  const id = optId ?? `wl-${nature.replace(/_/g, "-")}-${counters[nature]}`;
  const numero = optNum ?? counters[nature];
  const copy = buildCopy({ snap, slug: id, root, label: nom });
  // Parties d'un import précédent devenues inutiles. Les dossiers gardés sont
  // réécrits sur place : le serveur de l'atelier perd la trace d'un dossier
  // supprimé puis recréé.
  const keep = new Set(copy.sections.length === 1 ? [id] : copy.sections.map((_, p) => `${id}-${p + 1}`));
  for (const old of await readdir(join(root, "sections"))) {
    if ((old === id || old.startsWith(`${id}-`)) && !keep.has(old)) await rm(join(root, "sections", old), { recursive: true, force: true });
  }
  for (const [p, s] of copy.sections.entries()) {
    // Une section du catalogue : utilisable sur toute page, textes et images
    // d'origine comme contenu de départ.
    const sid = copy.sections.length === 1 ? id : `${id}-${p + 1}`;
    const css = s.css.replaceAll(`atl-${s.id}`, `atl-${sid}`);
    const template = s.template.replaceAll(`atl-${s.id}`, `atl-${sid}`);
    const schema = { ...s.schema, presets: [{ name: `${nom} ${numero}`, blocks: s.blocks.map((b) => ({ type: "element", settings: b })) }] };
    const { pageSpecific, families, fonction, ...rest } = s.meta;
    const suffix = copy.sections.length > 1 ? ` (${p + 1}/${copy.sections.length})` : "";
    const meta = {
      ...rest,
      label: `${nom}${titre && titre !== "Reasons to buy" ? ` · ${titre}` : ""}${suffix} — Whitelabeler ${numero}`,
      family,
      fonction: nom,
      source: { url: null, capturedAt: new Date().toISOString().slice(0, 10), note: `Section Whitelabeler « ${nature} » copiée depuis imports/${folder}/source.html (scripts/whitelabeler.mjs).` },
    };
    const sdir = join(root, "sections", sid);
    await mkdir(sdir, { recursive: true });
    await writeFile(join(sdir, "schema.json"), JSON.stringify(schema, null, 2) + "\n", "utf8");
    await writeFile(join(sdir, "template.liquid"), template + "\n", "utf8");
    await writeFile(join(sdir, "style.css"), css + "\n", "utf8");
    await writeFile(join(sdir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
    console.log(`  ✓ sections/${sid} : ${meta.label} · ${s.blocks.length} éléments`);
  }
}
