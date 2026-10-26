// Refait le nom et la famille des sections extraites des pages (<page>-sec-<n>)
// avec les règles actuelles de src/engine/fonctions.js, sans les recopier.
//   node scripts/reclasser-sections.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fonctionOf } from "../src/engine/fonctions.js";

const changes = {};
for (const id of readdirSync("sections").filter((d) => /-sec-\d+/.test(d))) {
  const dir = join("sections", id);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const schema = JSON.parse(readFileSync(join(dir, "schema.json"), "utf8"));
  const text = (schema.presets?.[0]?.blocks ?? []).map((b) => `${b.settings?.repere ?? ""} ${b.settings?.text ?? ""}`).join(" ").replace(/<[^>]+>/g, " ");
  const n = Number(/-sec-(\d+)/.exec(id)[1]);
  const f = fonctionOf(text, { first: n === 1 });
  const prices = (text.match(/[$€£]\s?\d/g) ?? []).length;
  const buys = (text.match(/add to (cart|bag)|shop now|ajouter au panier|view product/gi) ?? []).length;
  const grid = prices >= 6 && buys >= 4;
  const family = grid ? "collection" : (f.families.find((x) => x !== "entete") ?? "autres");
  const nom = grid ? "Grille de produits" : f.nom;
  if (family === "autres" && f.nom === "Contenu") continue; // on garde l'ancien classement
  const [, rest] = meta.label.split(" — ");
  const suffix = /\((début|\d+\/\d+)\)/.exec(meta.label)?.[0];
  const label = `${nom}${suffix ? ` ${suffix}` : ""} — ${rest ?? meta.label}`;
  if (meta.family !== family) changes[`${meta.family} → ${family}`] = (changes[`${meta.family} → ${family}`] ?? 0) + 1;
  Object.assign(meta, { family, fonction: nom, label });
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
}
console.log(changes);
