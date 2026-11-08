// Sections Kimi / refaites (pas de all:revert) : les boutons sans style de classe
// gardaient le cadre gris du navigateur. Même remise à zéro, au poids nul (une
// classe du site passe devant), en tête du style.css.   node controles-kimi.mjs [--dry]
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
const DIR = "/home/ubuntu/atelier-sites/sections";
const MARK = "/* atl-controles-kimi 2026-11-07 */";
const dry = process.argv.includes("--dry");
let n = 0;
for (const id of readdirSync(DIR)) {
  const f = `${DIR}/${id}/style.css`, t = `${DIR}/${id}/template.liquid`;
  if (!existsSync(f) || !existsSync(t)) continue;
  const css = readFileSync(f, "utf8");
  if (css.includes("all:revert") || css.includes(MARK) || !/<button\b/.test(readFileSync(t, "utf8"))) continue;
  const s = `.atl-${id}`;
  const block = `${MARK}\n${s} :where(button){border:0 solid;background-color:transparent;font:inherit;color:inherit;cursor:pointer}\n`;
  if (!dry) writeFileSync(f, block + css);
  n++;
}
console.log({ sections: n, dry });
