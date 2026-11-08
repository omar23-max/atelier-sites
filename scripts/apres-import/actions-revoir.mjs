// 5 actions sur les « Sections à revoir » (2026-11-08). Réversible :
// masquée = meta.status "masquee" (+ statusAvant) ; acceptée = meta.auditAccepte ;
// famille changée = familyAvant ; débordement = bloc /* atl-debord */ dans style.css.
import { readFileSync, writeFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites", R = "/home/ubuntu/apres-import";
const list = (f) => readFileSync(`${R}/${f}`, "utf8").split("\n").filter(Boolean);
const d = JSON.parse(readFileSync(`${R}/decisions-vide.json`, "utf8"));
const masquer = new Set([...d.masquer, ...d.sansMiniature]);
const meta = (id) => JSON.parse(readFileSync(`${A}/sections/${id}/meta.json`, "utf8"));
const save = (id, m) => writeFileSync(`${A}/sections/${id}/meta.json`, JSON.stringify(m, null, 2) + "\n");
const accept = (m, r) => { m.auditAccepte = [...new Set([...(m.auditAccepte ?? []), r])]; };
const log = [];
// 1 et 4 (vides) : masquer
for (const id of masquer) {
  const m = meta(id);
  if (m.status !== "masquee") { m.statusAvant = m.status ?? null; m.status = "masquee"; }
  m.masqueeRaison = "vide (revue 2026-11-08)";
  delete m.audit; save(id, m); log.push(`${id}\tmasquée`);
}
// 1 : presque vides utiles
for (const id of d.accepter) { const m = meta(id); accept(m, "presque vide"); save(id, m); log.push(`${id}\taccepte presque vide`); }
// 2 : trop hautes
for (const id of list("r-trophaute.txt")) { if (masquer.has(id)) continue; const m = meta(id); accept(m, "trop haute"); save(id, m); log.push(`${id}\taccepte trop haute`); }
// 4 : presque invisibles avec du texte
const ENTETE = new Set(["igk-accueil-sec-5", "replo-atoms-produit-sec-1", "replo-floyd-produit-sec-15", "replo-larq-produit-sec-1", "replo-our-place-produit-sec-2"]);
for (const id of list("r-presqueinvisible.txt")) {
  if (masquer.has(id)) continue;
  const m = meta(id);
  if (!m.audit?.mesures?.hauteur) { log.push(`${id}\thauteur 0 : laissée`); continue; }
  const fam = ENTETE.has(id) ? "entete" : "bandeaux";
  if (m.family !== fam) { m.familyAvant ??= m.family; m.family = fam; m.familyRevue = "2026-11-08"; }
  accept(m, "presque invisible"); save(id, m); log.push(`${id}\t${fam}, accepte presque invisible`);
}
// 3 : débordement à droite
const S = "/* atl-debord 2026-11-08 */", E = "/* fin atl-debord */";
for (const id of list("r-dbordedroite.txt")) {
  if (masquer.has(id)) continue;
  const f = `${A}/sections/${id}/style.css`;
  let css = readFileSync(f, "utf8");
  if (css.includes(S)) continue;
  css = css.trimEnd() + `\n${S}\n.atl-${id}{overflow-x:clip!important;max-width:100%}\n${E}\n`;
  writeFileSync(f, css); log.push(`${id}\tdébord coupé`);
}
writeFileSync(`${R}/actions-revoir.log`, log.join("\n") + "\n");
const c = (k) => log.filter((l) => l.includes(k)).length;
console.log({ masquees: c("masquée"), vides: c("presque vide"), hautes: c("trop haute"), invisibles: c("presque invisible"), h0: c("hauteur 0"), debord: c("débord") });
