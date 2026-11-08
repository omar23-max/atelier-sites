// Les réponses-consignes ajoutées aux FAQ (faq-build.mjs) sont de nouveaux
// emplacements : les pages qui utilisent ces sections n'ont pas encore leurs
// blocs. On les ajoute (texte « [Réponse : 2-3 phrases] ») dans chaque page.
//   node pages-faq.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const dry = process.argv.includes("--dry");
const built = readFileSync("/home/ubuntu/apres-import/faq-build.log", "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")[0]);
const newBlocks = {};
for (const id of new Set(built)) {
  const schema = JSON.parse(readFileSync(`${A}/sections/${id}/schema.json`, "utf8"));
  const blocks = (schema.presets?.[0]?.blocks ?? []).filter((b) => /^Paragraphe · Réponse \d+$/.test(b.settings?.repere ?? ""));
  if (blocks.length) newBlocks[id] = blocks;
}
let pages = 0, added = 0;
for (const f of readdirSync(`${A}/pages`).filter((x) => x.endsWith(".json"))) {
  const file = `${A}/pages/${f}`;
  let page;
  try { page = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
  let changed = false;
  for (const item of page.content ?? []) {
    const nb = newBlocks[item.type];
    if (!nb || !Array.isArray(item.props?.blocks_element)) continue;
    const have = new Set(item.props.blocks_element.map((b) => b.slot));
    for (const b of nb) if (!have.has(b.settings.slot)) { item.props.blocks_element.push({ ...b.settings }); added++; changed = true; }
  }
  if (changed) { pages++; if (!dry) writeFileSync(file, JSON.stringify(page, null, 2) + "\n"); }
}
console.log({ sectionsAvecConsignes: Object.keys(newBlocks).length, pagesModifiees: pages, blocsAjoutes: added, dry });
