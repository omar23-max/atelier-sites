// Donne à chaque section copiée d'une page un nom selon sa fonction
// (« Hero · Problème — Derila ») au lieu de « Derila — partie 1 ».
// Lit les textes dans la page du template (pages/<slug>.json). Ne touche qu'au
// nom (meta.json) : rien ne change dans les pages ni l'aperçu.
//
//   node scripts/nommer-sections.mjs            toutes les sections copiées
//   node scripts/nommer-sections.mjs adv-derila  celles d'une seule copie
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fonctionOf } from "../src/engine/fonctions.js";

const only = process.argv[2] ?? null;
const metas = readdirSync("sections")
  .map((id) => ({ id, file: join("sections", id, "meta.json") }))
  .filter((s) => existsSync(s.file))
  .map((s) => ({ ...s, meta: JSON.parse(readFileSync(s.file, "utf8")) }))
  .filter((s) => s.meta.pageSpecific && (!only || s.meta.pageSpecific === only));

const bySlug = Map.groupBy(metas, (s) => s.meta.pageSpecific);
for (const [slug, list] of bySlug) {
  const pageFile = join("pages", `${slug}.json`);
  if (!existsSync(pageFile)) {
    console.log(`– ${slug} : pas de page ${pageFile}, ignoré`);
    continue;
  }
  const page = JSON.parse(readFileSync(pageFile, "utf8"));
  const types = page.content.map((c) => c.type);
  for (const s of list) {
    const index = types.indexOf(s.id);
    const item = page.content[index];
    if (!item) continue;
    const text = (item.props.blocks_element ?? []).map((b) => `${b.repere ?? ""} ${b.text ?? ""}`).join(" ");
    const f = fonctionOf(text, { first: index === 0, last: index === types.length - 1 });
    // Produit : « Derila — partie 1 » ou, déjà renommée, « Hero — Derila ».
    const [a, b] = s.meta.label.split(" — ");
    const produit = s.meta.fonction ? b : a;
    s.meta.label = `${f.nom} — ${produit}`;
    s.meta.fonction = f.nom;
    s.meta.families = f.families;
    writeFileSync(s.file, JSON.stringify(s.meta, null, 2));
    console.log(`✓ ${s.id} : ${s.meta.label}`);
  }
}
