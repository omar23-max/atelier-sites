// Résumé de chaque section du catalogue pour le reclassement (index|famille|libellé|textes).
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites/sections", R = "/home/ubuntu/apres-import/repasse";
const ids = [], lines = [];
for (const id of readdirSync(A).sort()) {
  if (/^wll?-/.test(id) || !existsSync(`${A}/${id}/meta.json`)) continue;
  const m = JSON.parse(readFileSync(`${A}/${id}/meta.json`, "utf8"));
  if (m.pageSpecific || m.status === "masquee") continue;
  let txt = [];
  try {
    const s = JSON.parse(readFileSync(`${A}/${id}/schema.json`, "utf8"));
    for (const b of s.presets?.[0]?.blocks ?? []) { const t = (b.settings?.text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); if (t && !/^\[/.test(t)) txt.push(t.slice(0, 70)); }
  } catch {}
  if (!txt.length) txt = [(m.label || "")];
  const imgs = (readFileSync(`${A}/${id}/template.liquid`, "utf8").match(/data-atl-slot="i/g) ?? []).length;
  lines.push(`${ids.length}|${m.family}|${imgs}img|${txt.join(" / ").slice(0, 230)}`);
  ids.push(id);
}
writeFileSync(`${R}/digest-ids.json`, JSON.stringify(ids));
writeFileSync(`${R}/digest.txt`, lines.join("\n") + "\n");
console.log(ids.length);
