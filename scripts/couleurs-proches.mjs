// Relie aux rôles du design.md les couleurs « proches » des sections copiées
// déjà dans le catalogue (voir scripts/lib/proche.mjs).
//
//   node scripts/couleurs-proches.mjs [id…]
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withNearRoles } from "./lib/proche.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2);
let sections = 0;
let colors = 0;
for (const id of await readdir(join(root, "sections"))) {
  if (only.length && !only.includes(id)) continue;
  const dir = join(root, "sections", id);
  if (!existsSync(join(dir, "meta.json"))) continue;
  const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8"));
  if (!meta.designRoles) continue;
  const schema = JSON.parse(await readFile(join(dir, "schema.json"), "utf8"));
  const defaults = Object.fromEntries((schema.settings ?? []).filter((s) => s.id?.startsWith("role_")).map((s) => [s.id, s.default]));
  const roles = Object.fromEntries(Object.entries(meta.designRoles).filter(([k]) => defaults[k]).map(([k, r]) => [r, defaults[k]]));
  const css = await readFile(join(dir, "style.css"), "utf8");
  const template = await readFile(join(dir, "template.liquid"), "utf8");
  const out = withNearRoles({ css, template, roles });
  if (!out.count) continue;
  await writeFile(join(dir, "style.css"), out.css, "utf8");
  await writeFile(join(dir, "template.liquid"), out.template, "utf8");
  sections++;
  colors += out.count;
  if (only.length) console.log(`✓ ${id} : ${out.count} couleur(s) reliée(s)`);
}
console.log(`${sections} section(s), ${colors} couleur(s) reliées à un rôle.`);
