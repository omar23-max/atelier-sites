// Regroupe les « Raisons d'acheter » (famille listicle) d'une même page, qui se
// suivent, en une seule section du catalogue (≤ 45 emplacements par section).
// Les morceaux restent sur le disque, masqués (status "masquee", regroupeeDans).
//   node regrouper.mjs [--dry] [--pages a,b]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites/sections";
const dry = process.argv.includes("--dry");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const onlyPages = arg("--pages")?.split(",");
const MAX = 45;
const J = (p) => JSON.parse(readFileSync(p, "utf8"));
const rows = [];
for (const id of readdirSync(A)) {
  if (!existsSync(`${A}/${id}/meta.json`)) continue;
  const m = J(`${A}/${id}/meta.json`);
  if (m.family !== "listicle" || m.pageSpecific || m.regroupement) continue;
  if (m.status === "masquee" && !m.regroupeeDans) continue;
  const mm = id.match(/^(.*)-sec-(\d+)(?:-(\d+))?$/);
  if (!mm) continue;
  const tpl = readFileSync(`${A}/${id}/template.liquid`, "utf8");
  const slots = new Set(tpl.match(/data-atl-slot="[^"]+"/g) ?? []).size;
  rows.push({ id, page: mm[1], n: +mm[2], k: +(mm[3] || 0), slots, m });
}
const byPage = {};
for (const r of rows) (byPage[r.page] ??= []).push(r);
const groupes = [];
for (const [page, l] of Object.entries(byPage)) {
  if (onlyPages && !onlyPages.includes(page)) continue;
  l.sort((a, b) => a.n - b.n || a.k - b.k);
  // suites consécutives
  let run = [];
  const flush = () => { if (run.length > 1) groupes.push({ page, parts: run }); run = []; };
  for (const r of l) { if (run.length && r.n - run.at(-1).n > 1) flush(); run.push(r); }
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
const final = lots.filter((l) => l.parts.length > 1);
const ROOT = /^<div class="([^"]*)" data-atl-root([^>]*)>/;
let idx = {};
for (const lot of final) {
  idx[lot.page] = (idx[lot.page] ?? 0) + 1;
  const nid = `${lot.page}-raisons${idx[lot.page] > 1 ? "-" + idx[lot.page] : ""}`;
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
  const css = lot.parts.map((p) => `/* ── ${p.id} ── */\n` + readFileSync(`${A}/${p.id}/style.css`, "utf8").trim()).join("\n\n") + "\n";
  const s0 = J(`${A}/${lot.parts[0].id}/schema.json`);
  const schema = { ...s0, name: "Raisons d'acheter (regroupées)", blocks: s0.blocks, presets: [{ name: "Raisons d'acheter", blocks: lot.parts.flatMap((p) => J(`${A}/${p.id}/schema.json`).presets?.[0]?.blocks ?? []) }] };
  const m0 = lot.parts[0].m;
  const meta = {
    label: `Raisons d'acheter — ${lot.page}`, fonction: "Raisons d'acheter", family: "listicle",
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
