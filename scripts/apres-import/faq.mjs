// FAQ des copies : réponses visibles dans l'éditeur, ouvertes / fermées au clic
// ailleurs (script ACC_SCRIPT de render.js). Bloc « atl-faq » ajouté à la fin du
// style.css de chaque section qui a des réponses [data-atl-r]. Refait proprement
// si on relance.   node faq.mjs [--dry]
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
const DIR = "/home/ubuntu/atelier-sites/sections";
const START = "/* atl-faq 2026-11-07 */", END = "/* fin atl-faq */";
const dry = process.argv.includes("--dry");
let n = 0;
for (const id of readdirSync(DIR)) {
  const t = `${DIR}/${id}/template.liquid`, f = `${DIR}/${id}/style.css`;
  if (!existsSync(t) || !existsSync(f)) continue;
  if (!readFileSync(t, "utf8").includes("data-atl-r=")) continue;
  let css = readFileSync(f, "utf8");
  const i = css.indexOf(START);
  if (i >= 0) css = css.slice(0, i) + css.slice(css.indexOf(END) + END.length);
  const s = `.atl-${id}`;
  const show = "display:block!important;height:auto!important;max-height:none!important;overflow:visible!important;opacity:1!important;visibility:visible!important;transform:none!important;clip-path:none!important";
  css = css.trimEnd() + "\n" + [
    START,
    `${s}:not([data-atl-acc-on]) [data-atl-r],${s}[data-atl-acc-on] [data-atl-r][data-atl-open]{${show}}`,
    `${s}[data-atl-acc-on] [data-atl-r]:not([data-atl-open]){display:none!important}`,
    `${s}[data-atl-acc-on] [data-atl-q]{cursor:pointer;position:relative;z-index:3}`,
    `${s} .atl-faq-rep{padding:6px 0 14px}`,
    `${s} .atl-faq-rep p{margin:0;font-family:var(--atl-font-body, system-ui, sans-serif);font-size:15px;line-height:1.55;color:inherit;opacity:.85}`,
    END,
  ].join("\n") + "\n";
  if (!dry) writeFileSync(f, css);
  n++;
}
console.log({ sections: n, dry });
