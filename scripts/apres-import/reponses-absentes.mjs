// Réponses de FAQ reliées mais vides, SANS emplacement (rien n'a été relevé à
// l'import) : on y place un emplacement-consigne « [Réponse : 2-3 phrases] »,
// dans la section (schéma) et dans les pages qui l'utilisent.
//   node reponses-absentes.mjs --pages a,b [--dry]   (ou --ids sec1,sec2)
import { readFileSync, writeFileSync, readdirSync, appendFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const dry = process.argv.includes("--dry");
const CONSIGNE = "[Réponse : 2-3 phrases]";
let ids = arg("--ids")?.split(",") ?? [];
if (arg("--pages")) for (const pg of arg("--pages").split(",")) {
  const page = JSON.parse(readFileSync(`${A}/pages/${pg}.json`, "utf8"));
  for (const it of page.content ?? []) ids.push(it.type);
}
ids = [...new Set(ids)].filter((id) => { try { return readFileSync(`${A}/sections/${id}/template.liquid`, "utf8").includes("data-atl-r="); } catch { return false; } });
// fin de la balise ouvrante (en sautant le Liquid)
const tagEnd = (t, i) => { for (let j = i; j < t.length; j++) { if (t.startsWith("{{", j)) j = t.indexOf("}}", j) + 1; else if (t.startsWith("{%", j)) j = t.indexOf("%}", j) + 1; else if (t[j] === ">") return j + 1; } return -1; };
function closeStart(t, open, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi"); re.lastIndex = open; let d = 0, m;
  while ((m = re.exec(t))) { if (m[0].endsWith("/>")) continue; d += m[1] ? -1 : 1; if (d === 0) return m.index; }
  return -1;
}
const added = {};
for (const id of ids) {
  let t = readFileSync(`${A}/sections/${id}/template.liquid`, "utf8");
  const edits = [];
  for (const m of t.matchAll(/data-atl-r="([^"]+)"/g)) {
    const open = t.lastIndexOf("<", m.index);
    const tag = t.slice(open + 1).match(/^[a-z0-9-]+/i)?.[0];
    if (!tag) continue;
    const oe = tagEnd(t, open), cs = closeStart(t, open, tag);
    if (oe < 0 || cs < 0) continue;
    const inner = t.slice(oe, cs);
    const visible = inner.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, "").replace(/<[^>]*>/g, "").trim();
    if (inner.includes("data-atl-slot") || visible || /<img|<video|<iframe/i.test(inner)) continue;
    const slot = `sr${id.replace(/[^a-z0-9]/gi, "").slice(-12)}${m[1].replace(/[^a-z0-9]/gi, "")}`;
    const liquid = `{%- for b in section.blocks -%}{%- if b.settings.slot == '${slot}' -%}{{ b.settings.text | newline_to_br }}{%- endif -%}{%- endfor -%}`;
    edits.push({ at: oe, ins: `<p class="atl-faq-rep" data-atl-slot="${slot}" style="{%- for b in section.blocks -%}{%- if b.settings.slot == '${slot}' -%}{{ b.settings.style }}{%- endif -%}{%- endfor -%}">${liquid}</p>`, slot, n: m[1] });
  }
  if (!edits.length) continue;
  edits.sort((x, y) => y.at - x.at).forEach((e) => { t = t.slice(0, e.at) + e.ins + t.slice(e.at); });
  const schema = JSON.parse(readFileSync(`${A}/sections/${id}/schema.json`, "utf8"));
  const blocks = schema.presets?.[0]?.blocks;
  const nb = edits.map((e) => ({ type: blocks?.[0]?.type ?? "element", settings: { slot: e.slot, repere: `Paragraphe · Réponse ${e.n}`, text: CONSIGNE, image: "", link: "" } }));
  if (Array.isArray(blocks)) blocks.push(...nb.reverse());
  added[id] = nb;
  console.log(id, "consignes:", edits.length);
  if (!dry) {
    writeFileSync(`${A}/sections/${id}/template.liquid`, t);
    writeFileSync(`${A}/sections/${id}/schema.json`, JSON.stringify(schema, null, 2) + "\n");
    appendFileSync("/home/ubuntu/apres-import/repasse/reponses-absentes.log", `${id}\t${edits.length}\n`);
  }
}
let pages = 0;
for (const f of readdirSync(`${A}/pages`).filter((x) => x.endsWith(".json"))) {
  const file = `${A}/pages/${f}`; let page;
  try { page = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
  let ch = false;
  for (const it of page.content ?? []) {
    const nb = added[it.type]; if (!nb || !Array.isArray(it.props?.blocks_element)) continue;
    const have = new Set(it.props.blocks_element.map((b) => b.slot));
    for (const b of nb) if (!have.has(b.settings.slot)) { it.props.blocks_element.push({ ...b.settings }); ch = true; }
  }
  if (ch) { pages++; if (!dry) writeFileSync(file, JSON.stringify(page, null, 2) + "\n"); }
}
console.log({ sections: Object.keys(added).length, pagesModifiees: pages, dry });
