// Sections d'une page importée (Kimi ou refaite par Claude, kimi-import.mjs)
// → sections du catalogue, nommées et rangées selon leur fonction, comme
// sections-page.mjs le fait pour les copies.
//
//   node scripts/kimi-catalogue.mjs <nom> [--marque "Magic Mind"] [--url https://…]
//
// Lit sections/<nom>-pN et leur contenu dans pages/<nom>.json. Chaque section
// du contenu (dans <main>) qui en vaut la peine devient <nom>-sec-<n> : même
// HTML, même CSS (rangé sous sa nouvelle classe), mêmes comportements, et son
// contenu d'origine comme contenu par défaut. L'en-tête et le pied de page de
// la page sont laissés de côté (le catalogue en a déjà).
// Les photos d'origine restent des repères (/imports/…) : jamais exportées.
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fonctionOf } from "../src/engine/fonctions.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const slug = args[0];
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const pageFile = join(root, "pages", `${slug}.json`);
if (!slug || !existsSync(pageFile)) {
  console.error("Usage : node scripts/kimi-catalogue.mjs <nom> [--marque Nom] [--url https://…]");
  process.exit(1);
}
const MIN_SLOTS = 3;
const page = JSON.parse(await readFile(pageFile, "utf8"));
const marque = opt("--marque") ?? page.root?.props?.title?.replace(/^Kimi — /, "").replace(/\s*\(.*\)$/, "") ?? slug;
const url = opt("--url");
const parts = page.content.filter((c) => c.type.startsWith(`${slug}-p`));
let mainIndex = 0;

const prefix = `${slug}-sec-`;
const kept = new Set();
for (const [i, item] of parts.entries()) {
  const dir = join(root, "sections", item.type);
  if (!existsSync(join(dir, "template.liquid"))) continue;
  const template = await readFile(join(dir, "template.liquid"), "utf8");
  const blocks = item.props.blocks_element ?? [];
  // En-tête et pied : hors de <main> dans la page importée.
  if (!template.includes("<main")) {
    console.log(`  – ${item.type} : en-tête ou pied de page, ignoré`);
    continue;
  }
  const text = blocks.map((b) => `${b.repere ?? ""} ${String(b.text ?? "").replace(/<[^>]+>/g, " ")}`).join(" ");
  const f = fonctionOf(text, { first: mainIndex++ === 0, last: i === parts.length - 1 });
  if (blocks.length < MIN_SLOTS) {
    console.log(`  – ${item.type} : ${blocks.length} élément(s), ignoré`);
    continue;
  }
  const prices = (text.match(/[$€£]\s?\d/g) ?? []).length;
  const buys = (text.match(/add to (cart|bag)|shop now|try (free|original|maxx|sleep)|ajouter au panier|view product/gi) ?? []).length;
  const grid = prices >= 6 && buys >= 4;
  // Bouton panier et prix : la fiche produit (galerie + colonne d'achat).
  const buyBox = !grid && /add to (cart|bag)|ajouter au panier/i.test(text) && prices >= 2;
  const family = grid ? "collection" : buyBox ? "fiche-produit" : (f.families.find((x) => x !== "entete") ?? "autres");
  const nom = grid ? "Grille de produits" : buyBox ? "Fiche produit" : f.nom;

  const sid = `${prefix}${i + 1}`;
  const from = `atl-${item.type}`;
  const to = `atl-${sid}`;
  // La classe de la section (\b : « -p1 » ne doit pas toucher « -p10 »).
  const rename = (s) => s.replace(new RegExp(`${from}(?![\\w-])`, "g"), to);
  const schema = JSON.parse(await readFile(join(dir, "schema.json"), "utf8"));
  const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8"));
  const { pageSpecific, families, ...rest } = meta;
  const outSchema = { ...schema, name: `${nom} · ${marque}`.slice(0, 25), presets: [{ name: `${nom} · ${marque}`.slice(0, 25), blocks: blocks.map((b) => ({ type: "element", settings: b })) }] };
  const outMeta = {
    ...rest,
    label: `${nom} — ${marque}`,
    family,
    fonction: nom,
    source: { url, capturedAt: new Date().toISOString().slice(0, 10), note: `Section ${i + 1} de la page importée pages/${slug}.json (scripts/kimi-catalogue.mjs).` },
  };
  const sdir = join(root, "sections", sid);
  await mkdir(sdir, { recursive: true });
  await writeFile(join(sdir, "schema.json"), JSON.stringify(outSchema, null, 2) + "\n", "utf8");
  await writeFile(join(sdir, "template.liquid"), rename(template), "utf8");
  await writeFile(join(sdir, "style.css"), rename(await readFile(join(dir, "style.css"), "utf8")), "utf8");
  await writeFile(join(sdir, "meta.json"), JSON.stringify(outMeta, null, 2) + "\n", "utf8");
  kept.add(sid);
  console.log(`  ✓ sections/${sid} : ${outMeta.label} · ${blocks.length} éléments · famille ${family}`);
}
// Sections d'un import précédent de cette page qui n'existent plus.
for (const old of await readdir(join(root, "sections"))) {
  if (old.startsWith(prefix) && !kept.has(old)) await rm(join(root, "sections", old), { recursive: true, force: true });
}
console.log(`${kept.size} section(s) au catalogue depuis ${slug}.`);

// Miniatures du catalogue (sinon les cartes restent vides).
if (kept.size && !process.env.ATL_SANS_MINIATURES) {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, [join(root, "scripts", "thumbs.mjs"), ...kept], { cwd: root, stdio: "ignore", timeout: 900000 });
    console.log("  Miniatures faites.");
  } catch {
    console.log(`  ⚠ Miniatures incomplètes. Plus tard : node scripts/thumbs.mjs ${[...kept].join(" ")}`);
  }
}
