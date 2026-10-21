// Exporte les sections de l'atelier pour un thème Shopify.
//   npm run export:shopify                      toutes les sections
//   npm run export:shopify -- <id>              une seule section
//   npm run export:shopify -- --page <nom>      sections + modèle de page
//
// Résultat dans export/shopify/ :
//   sections/atl-<id>.liquid
//   templates/page.atelier-<nom>.json   (avec --page)
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildShopifySectionFile, buildShopifyTemplate, validateSection } from "../src/engine/shopify.js";
import { normalizeProps } from "../src/engine/render.js";
import { sectionsWithOriginalPhotos } from "./render-page.mjs";
import { listSectionIds, loadPage, loadSection, root } from "./lib/load.mjs";

const args = process.argv.slice(2);
const pageIndex = args.indexOf("--page");
const pageName = pageIndex >= 0 ? args[pageIndex + 1] : null;
const only = pageIndex >= 0 ? null : args[0];

const outDir = join(root, "export", "shopify");
const ids = (await listSectionIds()).filter((id) => !only || id === only);

if (ids.length === 0) {
  console.error(only ? `Section "${only}" introuvable dans sections/.` : "Aucune section dans sections/.");
  process.exit(1);
}

await mkdir(join(outDir, "sections"), { recursive: true });
const sectionsById = {};
let failed = 0;

for (const id of ids) {
  const section = await loadSection(id);
  sectionsById[id] = section;
  const errors = validateSection(section);
  if (errors.length > 0) {
    failed++;
    console.error(`✗ ${id}`);
    for (const e of errors) console.error(`    ${e}`);
    continue;
  }
  await writeFile(join(outDir, "sections", `atl-${id}.liquid`), buildShopifySectionFile(section), "utf8");
  console.log(`✓ ${id}  →  export/shopify/sections/atl-${id}.liquid`);
}

if (pageName && failed === 0) {
  await mkdir(join(outDir, "templates"), { recursive: true });
  // Complète la page avec les valeurs par défaut (dont les blocs des presets),
  // comme dans l'atelier, pour que Shopify affiche la même chose.
  const page = await loadPage(pageName);
  page.content = page.content.map((item) =>
    sectionsById[item.type] ? { ...item, props: normalizeProps(sectionsById[item.type], item.props) } : item,
  );
  // Les photos d'origine ne partent jamais (les images ne sont pas exportées) :
  // on liste les sections où il faut encore mettre ses propres images.
  const toReplace = sectionsWithOriginalPhotos(page, sectionsById);
  if (toReplace.length > 0) {
    console.warn(`⚠ Photos d'origine non exportées — mets tes propres images dans Shopify pour :`);
    for (const item of toReplace) console.warn(`    ${sectionsById[item.type].meta.label ?? item.type}`);
  }
  const template = buildShopifyTemplate(page, sectionsById);
  const file = `page.atelier-${pageName}.json`;
  await writeFile(join(outDir, "templates", file), JSON.stringify(template, null, 2), "utf8");
  console.log(`✓ page ${pageName}  →  export/shopify/templates/${file}`);
}

console.log(`\n${ids.length - failed} section(s) exportée(s), ${failed} en erreur.`);
process.exit(failed > 0 ? 1 : 0);
