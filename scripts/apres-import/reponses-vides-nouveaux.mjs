// FAQ dont les réponses n'ont pas été relevées à l'import (réponse présente mais
// tous ses textes vides) : le premier texte de la réponse reçoit la consigne
// « [Réponse : 2-3 phrases] », dans la section (contenu par défaut) et dans les
// pages qui l'utilisent (si le texte y est vide aussi).   node reponses-vides.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const { chromium } = await import(`${A}/node_modules/playwright-core/index.mjs`);
const { renderSectionHtml, setPhotoResolver } = await import(`${A}/src/engine/render.js`);
const { loadSection } = await import(`${A}/scripts/lib/load.mjs`);
setPhotoResolver(() => "");
const dry = process.argv.includes("--dry");
const CONSIGNE = "[Réponse : 2-3 phrases]";
const NOUV = new Set(readFileSync("/home/ubuntu/apres-import/nouveaux-2026-11-10.txt", "utf8").split(/\s+/).filter(Boolean));
const ids = readdirSync(`${A}/sections`).filter((id) => NOUV.has(id)).filter((id) => existsSync(`${A}/sections/${id}/template.liquid`) && readFileSync(`${A}/sections/${id}/template.liquid`, "utf8").includes("data-atl-r="));
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const fill = {}; // id -> [slots]
for (const id of ids) {
  const s = await loadSection(id);
  await p.setContent(`<!doctype html><html><body>${renderSectionHtml(s, {}, "x").replace(/<script[\s\S]*?<\/script>/g, "")}</body></html>`).catch(() => {});
  const slots = await p.evaluate(() => [...document.querySelectorAll("[data-atl-r]")].map((a) => {
    const texts = [...a.querySelectorAll("[data-atl-slot^=s]")];
    if (!texts.length || texts.some((t) => t.textContent.trim())) return null;
    return texts[0].getAttribute("data-atl-slot");
  }).filter(Boolean));
  if (slots.length) fill[id] = slots;
}
await b.close();
let sec = 0, pg = 0;
for (const [id, slots] of Object.entries(fill)) {
  const f = `${A}/sections/${id}/schema.json`;
  const schema = JSON.parse(readFileSync(f, "utf8"));
  for (const bl of schema.presets?.[0]?.blocks ?? []) if (slots.includes(bl.settings?.slot) && !String(bl.settings.text ?? "").trim()) bl.settings.text = CONSIGNE;
  if (!dry) writeFileSync(f, JSON.stringify(schema, null, 2) + "\n");
  sec++;
}
for (const name of readdirSync(`${A}/pages`).filter((x) => x.endsWith(".json"))) {
  const file = `${A}/pages/${name}`;
  let page;
  try { page = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
  let changed = false;
  for (const item of page.content ?? []) {
    const slots = fill[item.type];
    if (!slots) continue;
    if (!Array.isArray(item.props?.blocks_element)) continue;
    const have = new Map(item.props.blocks_element.map((bl) => [bl.slot, bl]));
    for (const slot of slots) {
      const bl = have.get(slot);
      if (!bl) { item.props.blocks_element.push({ slot, repere: "Paragraphe · Réponse", text: CONSIGNE, image: "", link: "" }); changed = true; }
      else if (!String(bl.text ?? "").trim()) { bl.text = CONSIGNE; changed = true; }
    }
  }
  if (changed) { pg++; if (!dry) writeFileSync(file, JSON.stringify(page, null, 2) + "\n"); }
}
console.log({ sectionsAvecFAQ: ids.length, sectionsReponsesVides: sec, reponses: Object.values(fill).flat().length, pagesModifiees: pg, dry });
