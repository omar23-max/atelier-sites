// Regroupe les sections découpées en un élément par section (raisons, avis,
// produits…) : morceaux d'une même page qui se suivent, de MÊME famille et de
// structure presque identique, en une seule section (≤ 45 emplacements).
// Les morceaux restent sur le disque, masqués (status "masquee", regroupeeDans).
//   node regrouper.mjs [--dry] [--familles a,b] [--pages a,b] [--dans approuves.json]
// Après coup, en cas de souci : node reparer-regroupes.mjs (nom, famille, CSS).
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites/sections";
const { FONCTION_BY_FAMILY } = await import("/home/ubuntu/atelier-sites/src/engine/fonctions.js");
const NOMS = { ...Object.fromEntries(Object.entries(FONCTION_BY_FAMILY).map(([k, v]) => [k, v.nom])), hero: "Hero", collection: "Grille de produits", entete: "En-tête", galerie: "Galerie photos", cta: "Appel à l'action", histoire: "Histoire", slogan: "Slogan", bonus: "Bonus offerts", livraison: "Livraison et retours", article: "Article", espace: "Espace", "sticky-atc": "Barre d'achat", autres: "Contenu" };
const dry = process.argv.includes("--dry");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const onlyPages = arg("--pages")?.split(",");
const MAX = 45;
const FAMS = new Set((arg("--familles") ?? "listicle").split(","));
const J = (p) => JSON.parse(readFileSync(p, "utf8"));
const rows = [];
for (const id of readdirSync(A)) {
  if (!existsSync(`${A}/${id}/meta.json`)) continue;
  const m = J(`${A}/${id}/meta.json`);
  if (!FAMS.has(m.family) || m.pageSpecific || m.regroupement) continue;
  if (m.status === "masquee" || m.regroupeeDans) continue;
  const mm = id.match(/^(.*)-sec-(\d+)(?:-(\d+))?$/);
  if (!mm) continue;
  const tpl = readFileSync(`${A}/${id}/template.liquid`, "utf8");
  const slots = new Set(tpl.match(/data-atl-slot="[^"]+"/g) ?? []).size;
  // signature : suite des types d'emplacements (i = image, s = texte, l = lien…)
  const sig = [...new Set(tpl.match(/data-atl-slot="[^"]+"/g) ?? [])].map((x) => x.slice(15, 16)).join("");
  rows.push({ id, page: mm[1], n: +mm[2], k: +(mm[3] || 0), slots, sig, m });
}
// structures proches : mêmes sortes d'emplacements, nombres voisins, petites sections
const compte = (sig) => [...sig].reduce((o, c) => ((o[c] = (o[c] ?? 0) + 1), o), {});
const proche = (a, b) => {
  if (a.slots > 20 || b.slots > 20) return false;
  const A = compte(a.sig), B = compte(b.sig), K = new Set([...Object.keys(A), ...Object.keys(B)]);
  let inter = 0, uni = 0;
  for (const k of K) { inter += Math.min(A[k] ?? 0, B[k] ?? 0); uni += Math.max(A[k] ?? 0, B[k] ?? 0); }
  return uni > 0 && inter / uni >= 0.7;
};
const byPage = {};
for (const r of rows) (byPage[r.page] ??= []).push(r);
const groupes = [];
for (const [page, l] of Object.entries(byPage)) {
  if (onlyPages && !onlyPages.includes(page)) continue;
  l.sort((a, b) => a.n - b.n || a.k - b.k);
  // suites consécutives
  let run = [];
  const flush = () => { if (run.length > 1) groupes.push({ page, parts: run }); run = []; };
  // même structure exigée (une section par élément répété), sauf --large
  const large = process.argv.includes("--large");
  for (const r of l) { if (run.length && (r.n - run.at(-1).n > 1 || r.m.family !== run.at(-1).m.family || (!large && !proche(r, run.at(-1))))) flush(); run.push(r); }
  flush();
}
// découpe à 45 emplacements
const lots = [];
for (const g of groupes) {
  let cur = [], n = 0;
  for (const p of g.parts) {
    if (cur.length && n + p.slots > MAX) { lots.push({ page: g.page, parts: cur }); cur = []; n = 0; }
    cur.push(p); n += p.slots;
  }
  if (cur.length) lots.push({ page: g.page, parts: cur });
}
let final = lots.filter((l) => l.parts.length > 1);
// --dans fichier.json : seulement les lots inclus dans des regroupements déjà approuvés
if (arg("--dans")) { const ok = JSON.parse(readFileSync(arg("--dans"), "utf8")).map((c) => new Set(c.ids)); final = final.filter((l) => ok.some((s) => l.parts.every((p) => s.has(p.id)))); }
if (dry) writeFileSync("/home/ubuntu/apres-import/repasse/regroup-candidats.json", JSON.stringify(final.map((l) => ({ page: l.page, famille: l.parts[0].m.family, ids: l.parts.map((p) => p.id), emplacements: l.parts.reduce((s, p) => s + p.slots, 0) })), null, 1));
const ROOT = /^<div class="([^"]*)" data-atl-root([^>]*)>/;
let idx = {};
for (const lot of final) {
  idx[lot.page] = (idx[lot.page] ?? 0) + 1;
  let nid = `${lot.page}-${lot.parts[0].m.family}${idx[lot.page] > 1 ? "-" + idx[lot.page] : ""}`;
  while (existsSync(`${A}/${nid}`)) nid += "-b";
  const total = lot.parts.reduce((s, p) => s + p.slots, 0);
  console.log(`${nid}\t${lot.parts.length} morceaux, ${total} emplacements\t${lot.parts.map((p) => p.id.replace(lot.page + "-", "")).join(" ")}`);
  if (dry) continue;
  const classes = new Set([`atl-${nid}`]);
  const scripts = new Set();
  let inner = "", extra = null;
  for (const p of lot.parts) {
    let t = readFileSync(`${A}/${p.id}/template.liquid`, "utf8").trim();
    const mr = t.match(ROOT);
    if (!mr || !t.endsWith("</div>")) throw new Error(`racine inattendue : ${p.id}`);
    mr[1].split(/\s+/).forEach((c) => classes.add(c));
    extra ??= mr[2];
    t = t.slice(mr[0].length, -"</div>".length);
    t = t.replace(/<script>[\s\S]*?<\/script>/g, (s) => { scripts.add(s); return ""; });
    inner += `<div data-atl-morceau="${p.id}">${t}</div>`;
  }
  const tpl = `<div class="${[...classes].join(" ")}" data-atl-root${extra}>${inner}${[...scripts].join("")}</div>\n`;
  // règles des morceaux préfixées par la classe de la section regroupée (même
  // racine) : l'atelier exige que le style.css contienne .atl-<id> (2026-11-08)
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const css = lot.parts.map((p) => `/* ── ${p.id} ── */\n` + readFileSync(`${A}/${p.id}/style.css`, "utf8").trim().replace(new RegExp(`\\.atl-${esc(p.id)}(?![\\w-])`, "g"), `.atl-${nid}.atl-${p.id}`)).join("\n\n") + "\n";
  const s0 = J(`${A}/${lot.parts[0].id}/schema.json`);
  const fam = lot.parts[0].m.family;
  const nom = (NOMS[fam] ?? "Section").slice(0, 25); // limite de 25 caractères
  const schema = { ...s0, name: nom, blocks: s0.blocks, presets: [{ name: nom, blocks: lot.parts.flatMap((p) => J(`${A}/${p.id}/schema.json`).presets?.[0]?.blocks ?? []) }] };
  const m0 = lot.parts[0].m;
  const meta = {
    label: `${nom} — ${lot.page}`, fonction: nom, family: fam,
    source: { ...m0.source, note: `Regroupement (2026-11-08) de ${lot.parts.length} sections consécutives : ${lot.parts.map((p) => p.id).join(", ")}.` },
    preview: {}, previewBlocks: Object.assign({}, ...lot.parts.map((p) => p.m.previewBlocks ?? {})),
    arbre: { group: true, kind: "groupe", label: "Raisons", children: lot.parts.map((p) => p.m.arbre).filter(Boolean) },
    regroupement: lot.parts.map((p) => p.id),
  };
  mkdirSync(`${A}/${nid}`, { recursive: true });
  writeFileSync(`${A}/${nid}/template.liquid`, tpl);
  writeFileSync(`${A}/${nid}/style.css`, css);
  writeFileSync(`${A}/${nid}/schema.json`, JSON.stringify(schema, null, 2) + "\n");
  writeFileSync(`${A}/${nid}/meta.json`, JSON.stringify(meta, null, 2) + "\n");
  copyFileSync(`${A}/${lot.parts[0].id}/thumbnail.png`, `${A}/${nid}/thumbnail.png`);
  for (const p of lot.parts) {
    const m = p.m;
    if (m.status !== "masquee") { m.statusAvant = m.status ?? null; m.status = "masquee"; }
    m.regroupeeDans = nid; delete m.audit;
    writeFileSync(`${A}/${p.id}/meta.json`, JSON.stringify(m, null, 2) + "\n");
  }
}
console.log({ lots: final.length, dry });
