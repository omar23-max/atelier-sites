// Cadres carrés : les copies remettent tout au style du navigateur (all:revert),
// donc un bouton, un champ ou une question de FAQ dont le site d'origine n'a pas
// livré le style prend la bordure grise du navigateur. Règles ajoutées juste après
// le « revert », au même poids : un style relevé sur le site (classe) passe devant.
//   node controles.mjs [--dry]
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
const DIR = "/home/ubuntu/atelier-sites/sections";
const MARK = "/* atl-controles 2026-11-07";
const RE = /^(\.atl-[A-Za-z0-9_-]+) :where\(\*:not\(svg, svg \*\)\)\{all:revert\}$/m;
const rules = (s) => [
  `${MARK} : contrôles sans style relevé (boutons, champs, questions de FAQ) */`,
  `${s} :where(button){border:0;background:none;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;text-align:inherit}`,
  `${s} :where(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea){font:inherit;color:inherit;background:#fff;border:1px solid #d6d6d6;border-radius:6px;padding:10px 12px;box-sizing:border-box;max-width:100%}`,
  `${s} :where(fieldset){border:0;padding:0;margin:0;min-width:0}`,
  `${s} :where(summary){cursor:pointer}`,
].join("\n");
const dry = process.argv.includes("--dry");
let n = 0, skip = 0, already = 0;
for (const id of readdirSync(DIR)) {
  const f = `${DIR}/${id}/style.css`;
  if (!existsSync(f)) continue;
  const css = readFileSync(f, "utf8");
  const clean = css.split("\n").filter((l) => !l.startsWith(MARK) && !/^\.atl-[A-Za-z0-9_-]+ :where\((button|form button|input:not|fieldset|summary)/.test(l)).join("\n");
  if (clean !== css) already++;
  const m = RE.exec(clean);
  if (!m) { skip++; continue; }
  const next = clean.replace(m[0], `${m[0]}\n${rules(m[1])}`);
  if (!dry) writeFileSync(f, next);
  n++;
}
console.log({ modifiees: n, sansRevert: skip, dejaFaites: already, dry });
