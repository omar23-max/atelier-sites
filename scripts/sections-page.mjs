// Sections d'une page capturée → sections du catalogue (au design identique,
// modifiables comme les copies), nommées et rangées selon leur fonction.
//
//   node scripts/sections-page.mjs <dossier> [--marque "Rho"] [--url https://…]
//
// Lit imports/<dossier>/snapshot.json (capture d'advertorial.mjs, qui marque
// les débuts de section : thème Shopify ou balise <section>). Chaque section
// de la page devient une section du catalogue <dossier>-sec-<n>, si elle en
// vaut la peine : assez d'éléments (texte et image), une fonction reconnue,
// pas l'en-tête ni le pied de page du thème (le catalogue en a déjà).
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCopy } from "./lib/copie.mjs";
import { fonctionOf } from "../src/engine/fonctions.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const slug = args[0];
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
if (!slug || !existsSync(join(root, "imports", slug, "snapshot.json"))) {
  console.error("Usage : node scripts/sections-page.mjs <dossier> [--marque Nom] [--url https://…]");
  process.exit(1);
}
const dir = join(root, "imports", slug);
const snap = JSON.parse(await readFile(join(dir, "snapshot.json"), "utf8"));
const report = existsSync(join(dir, "advertorial.json")) ? JSON.parse(await readFile(join(dir, "advertorial.json"), "utf8")) : {};
const url = opt("--url") ?? report.url ?? null;
const marque = opt("--marque") ?? (url ? new URL(url).hostname.replace(/^www\.|^try\.|^shop\./, "").split(".")[0] : slug);
const MIN_SLOTS = 4;
const CHROME = /header|footer|announcement|menu-drawer|cart-drawer|popup|newsletter-popup/i;

const nodes = snap.nodes;
// Sections : les nœuds marqués les plus hauts (aucun ancêtre marqué).
const marked = nodes.filter((n) => n.sec);
const hasMarkedAncestor = (n) => {
  for (let p = n.parent; p != null; p = nodes[p].parent) if (nodes[p].sec) return true;
  return false;
};
let tops = marked.filter((n) => !hasMarkedAncestor(n) && n.box.h > 40);
if (!tops.length) {
  // Page sans repère (tunnel, constructeur de pages) : on descend les
  // enveloppes uniques, puis chaque enfant visible est une section.
  let cur = nodes[0];
  while (cur.kids.length) {
    const big = cur.kids.map((k) => nodes[k.n]).filter((n) => n.box.h > 40);
    if (big.length !== 1) break;
    cur = big[0];
  }
  tops = cur.kids.map((k) => nodes[k.n]).filter((n) => n.box.h > 40);
}
tops.sort((a, b) => a.box.y - b.box.y);
console.log(`${slug} : ${tops.length} section(s) repérée(s)`);

// Anciennes sections de cette page : remplacées (dossiers réécrits sur place).
const prefix = `${slug}-sec-`;
const kept = new Set();
let n = 0;
for (const [i, top] of tops.entries()) {
  if (CHROME.test(String(top.sec ?? ""))) {
    console.log(`  – ${i + 1}. ${top.sec} : en-tête ou pied du thème, ignoré`);
    continue;
  }
  const sub = { ...snap, nodes: nodes.map((x, j) => (j === 0 ? { ...x, kids: [{ n: top.id }] } : x)) };
  let copy;
  try {
    copy = buildCopy({ snap: sub, slug: `${prefix}${i + 1}`, root, label: marque });
  } catch (e) {
    console.log(`  ✗ ${i + 1}. copie impossible : ${e.message}`);
    continue;
  }
  const slots = copy.sections.reduce((t, s) => t + s.blocks.length, 0);
  const images = copy.sections.reduce((t, s) => t + s.blocks.filter((b) => b.image).length, 0);
  const text = copy.sections.flatMap((s) => s.blocks.map((b) => `${b.repere ?? ""} ${b.text ?? ""}`)).join(" ");
  const f = fonctionOf(text, { first: i === 0, last: i === tops.length - 1 });
  if (slots < MIN_SLOTS || f.nom === "Contenu" || copy.sections.length > 2) {
    console.log(`  – ${i + 1}. ${f.nom} : ${slots} élément(s), ${copy.sections.length} partie(s), ignoré`);
    continue;
  }
  n++;
  const family = f.families.find((x) => x !== "entete") ?? "autres";
  for (const [p, s] of copy.sections.entries()) {
    const sid = copy.sections.length === 1 ? `${prefix}${i + 1}` : `${prefix}${i + 1}-${p + 1}`;
    const css = s.css.replaceAll(`atl-${s.id}`, `atl-${sid}`);
    const template = s.template.replaceAll(`atl-${s.id}`, `atl-${sid}`);
    const schema = { ...s.schema, presets: [{ name: `${f.nom} · ${marque}`.slice(0, 25), blocks: s.blocks.map((b) => ({ type: "element", settings: b })) }] };
    const { pageSpecific, families, fonction, ...rest } = s.meta;
    const suffix = copy.sections.length > 1 ? ` (${p + 1}/${copy.sections.length})` : "";
    const meta = {
      ...rest,
      label: `${f.nom}${suffix} — ${marque}`,
      family,
      fonction: f.nom,
      source: { url, capturedAt: new Date().toISOString().slice(0, 10), note: `Section ${i + 1} de la page imports/${slug} (scripts/sections-page.mjs).` },
    };
    const sdir = join(root, "sections", sid);
    await mkdir(sdir, { recursive: true });
    await writeFile(join(sdir, "schema.json"), JSON.stringify(schema, null, 2) + "\n", "utf8");
    await writeFile(join(sdir, "template.liquid"), template + "\n", "utf8");
    await writeFile(join(sdir, "style.css"), css + "\n", "utf8");
    await writeFile(join(sdir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
    kept.add(sid);
    console.log(`  ✓ ${i + 1}. sections/${sid} : ${meta.label} · ${s.blocks.length} éléments, ${images} image(s) · famille ${family}`);
  }
}
for (const old of await readdir(join(root, "sections"))) {
  if (old.startsWith(prefix) && !kept.has(old)) await rm(join(root, "sections", old), { recursive: true, force: true });
}
console.log(`${n} section(s) au catalogue depuis ${slug}.`);
