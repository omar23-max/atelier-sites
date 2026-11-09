// Sections regroupées : nom d'après la vraie famille (≤ 25 caractères) et
// règles CSS des morceaux préfixées par la classe de la section regroupée
// (même élément racine : .atl-<regroupée>.atl-<morceau>).
//   node reparer-regroupes.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const { FONCTION_BY_FAMILY } = await import(`${A}/src/engine/fonctions.js`);
const { FAMILIES } = await import(`${A}/src/engine/families.js`);
const { validateSection } = await import(`${A}/src/engine/shopify.js`);
const lab = Object.fromEntries(FAMILIES.map((f) => [f.id, f.label]));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let n = 0, errs = 0;
for (const id of readdirSync(`${A}/sections`)) {
  const mf = `${A}/sections/${id}/meta.json`;
  if (!existsSync(mf)) continue;
  const m = JSON.parse(readFileSync(mf, "utf8"));
  const parts = m.regroupement ?? m.regroupementAnnule;
  if (!parts) continue;
  // vraie famille : celle des morceaux (l'outil mettait « listicle » partout)
  try { m.family = JSON.parse(readFileSync(`${A}/sections/${parts[0]}/meta.json`, "utf8")).family ?? m.family; } catch {}
  const nom = (FONCTION_BY_FAMILY[m.family]?.nom ?? lab[m.family] ?? "Section").slice(0, 25);
  const page = parts[0].replace(/-sec-\d+(-\d+)?$/, "");
  const sf = `${A}/sections/${id}/schema.json`;
  const s = JSON.parse(readFileSync(sf, "utf8"));
  s.name = nom;
  for (const p of s.presets ?? []) p.name = nom;
  writeFileSync(sf, JSON.stringify(s, null, 2) + "\n");
  m.label = `${nom} — ${page}`;
  m.fonction = nom;
  writeFileSync(mf, JSON.stringify(m, null, 2) + "\n");
  const cf = `${A}/sections/${id}/style.css`;
  let css = readFileSync(cf, "utf8");
  for (const p of parts) css = css.replace(new RegExp(`(?<!\\.atl-${esc(id)})\\.atl-${esc(p)}(?![\\w-])`, "g"), `.atl-${id}.atl-${p}`);
  writeFileSync(cf, css);
  const e = validateSection({ id, schema: s, template: readFileSync(`${A}/sections/${id}/template.liquid`, "utf8"), css });
  if (e.length) { errs++; console.log("⚠", id, e.join(" | ")); }
  n++;
}
console.log({ reparees: n, encoreEnErreur: errs });
