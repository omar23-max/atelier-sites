// FAQ sans ouverture au clic : chaque question devient [data-atl-q=n] et sa
// réponse [data-atl-r=n]. Si la réponse n'a pas été relevée à l'import, une
// réponse-consigne est ajoutée (« [Réponse : 2-3 phrases] », emplacement modifiable).
//   node faq-build.mjs --ids a,b [--dry] [--shots]
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const { chromium } = await import(`${A}/node_modules/playwright-core/index.mjs`);
const { renderSectionHtml, setPhotoResolver } = await import(`${A}/src/engine/render.js`);
const { loadSection, photoDataUrl } = await import(`${A}/scripts/lib/load.mjs`);
setPhotoResolver(photoDataUrl);
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const dry = process.argv.includes("--dry");
const ids = arg("--ids").split(",");
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
const CONSIGNE = "[Réponse : 2-3 phrases]";

// Fin de l'élément ouvert à la position i (balise <tag ...>) : compte les
// ouvertures / fermetures du même nom, sans tenir compte du Liquid.
function closeEnd(tpl, i, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = i;
  let depth = 0, m;
  while ((m = re.exec(tpl))) {
    if (m[0].endsWith("/>")) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}
function findOpen(tpl, f) {
  let re;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (f.k) re = new RegExp(`<${f.tag}\\b[^>]*data-atl-k="${f.k}"[^>]*>`, "g");
  else if (f.slot) re = new RegExp(`<${f.tag}\\b[^>]*data-atl-slot="${f.slot}"[^>]*>`, "g");
  else if (f.group) re = new RegExp(`<${f.tag}\\b[^>]*data-atl-group="${f.group}"[^>]*>`, "g");
  else re = new RegExp(`<${f.tag}\\b[^>]*class="${esc(f.cls)}"[^>]*>`, "g");
  const ms = [...tpl.matchAll(re)];
  return f.k || f.slot || f.group ? ms[0] : ms[f.nth];
}

const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
for (const id of ids) {
  const s = await loadSection(id);
  if (s.template.includes("data-atl-q=")) { console.log(id, "déjà fait"); continue; }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${[...new Set(s.css.match(IMPORT) ?? [])].join("\n")} html,body{margin:0} ${s.css.replace(IMPORT, "")}</style></head><body>${renderSectionHtml(s, {}, "x").replace(/<script[\s\S]*?<\/script>/g, "")}</body></html>`;
  await p.setContent(html, { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(150);
  const items = await p.evaluate(() => {
    const desc = (e) => {
      const cls = e.getAttribute("class") || "";
      const same = [...document.querySelectorAll(e.tagName)].filter((o) => (o.getAttribute("class") || "") === cls);
      return { tag: e.tagName.toLowerCase(), cls, nth: same.indexOf(e), slot: e.getAttribute("data-atl-slot"), group: e.getAttribute("data-atl-group"), k: e.getAttribute("data-atl-k") };
    };
    const isQ = (t) => /\?\s*\+?\s*$/.test(t) && t.length > 10 && t.length < 170;
    const root = document.querySelector("[data-atl-root]") || document.body;
    // feuilles de texte qui finissent par « ? »
    let qs = [...root.querySelectorAll("*")].filter((e) => {
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      return own && isQ(e.textContent.trim()) && ![...e.children].some((c) => isQ(c.textContent.trim()));
    });
    // doublons (texte d'accessibilité répété dans le même bouton)
    const out = [], seenTxt = new Map();
    for (const q of qs) {
      const txt = q.textContent.trim();
      // la « rangée » : le plus haut ancêtre qui ne contient que cette question
      let row = q;
      while (row.parentElement && row.parentElement !== root && ![...row.parentElement.querySelectorAll("*")].some((o) => o !== q && !q.contains(o) && !o.contains(q) && qs.includes(o) && o.textContent.trim() !== txt)) row = row.parentElement;
      if (out.some((o) => o.rowEl === row)) continue;
      // ce qui est cliquable : bouton / summary / élément marqué, sinon la feuille
      const click = q.closest("button, summary, [data-atl-btn], [role=button], a") || q;
      const clickInRow = row.contains(click) ? click : q;
      // réponse : un frère (dans la rangée) qui a du texte et ne contient pas la question
      let ans = null;
      for (let x = clickInRow; x && x !== row && !ans; x = x.parentElement) {
        for (let sib = x.nextElementSibling; sib && !ans; sib = sib.nextElementSibling) {
          const t = sib.textContent.trim();
          if (t.length > 15 && !isQ(t) && !sib.contains(q)) ans = sib;
        }
      }
      out.push({ rowEl: row, q: desc(clickInRow), a: ans ? desc(ans) : null, txt: txt.slice(0, 60) });
    }
    return out.map(({ rowEl, ...r }) => r);
  });
  if (items.length < 2) { console.log(id, ": moins de 2 questions trouvées, laissée telle quelle"); continue; }
  let tpl = s.template;
  const schema = JSON.parse(readFileSync(`${A}/sections/${id}/schema.json`, "utf8"));
  const blocks = schema.presets?.[0]?.blocks;
  let added = 0, linked = 0, fail = 0;
  // de la fin vers le début : les positions restent valables
  const located = items.map((it, i) => ({ it, n: `f${i + 1}`, qm: findOpen(tpl, it.q), am: it.a ? findOpen(tpl, it.a) : null }));
  const edits = [];
  for (const L of located) {
    if (!L.qm) { fail++; continue; }
    edits.push({ at: L.qm.index + 1 + L.it.q.tag.length, ins: ` data-atl-q="${L.n}"` });
    if (L.am) { edits.push({ at: L.am.index + 1 + L.it.a.tag.length, ins: ` data-atl-r="${L.n}"` }); linked++; }
    else {
      const end = closeEnd(tpl, L.qm.index, L.it.q.tag);
      if (end < 0) { fail++; continue; }
      const slot = `s${id.length}${L.n}`.replace(/[^a-z0-9]/gi, "");
      const liquid = `{%- for b in section.blocks -%}{%- if b.settings.slot == '${slot}' -%}{{ b.settings.text | newline_to_br }}{%- endif -%}{%- endfor -%}`;
      edits.push({ at: end, ins: `<div class="atl-faq-rep" data-atl-r="${L.n}"><p data-atl-slot="${slot}" style="{%- for b in section.blocks -%}{%- if b.settings.slot == '${slot}' -%}{{ b.settings.style }}{%- endif -%}{%- endfor -%}">${liquid}</p></div>` });
      if (Array.isArray(blocks)) {
        const type = blocks[0]?.type ?? "element";
        blocks.push({ type, settings: { slot, repere: `Paragraphe · Réponse ${L.n.slice(1)}`, text: CONSIGNE, image: "", link: "" } });
      }
      added++;
    }
  }
  edits.sort((x, y) => y.at - x.at).forEach((e) => { tpl = tpl.slice(0, e.at) + e.ins + tpl.slice(e.at); });
  console.log(id, `questions ${items.length} · réponses reliées ${linked} · consignes ajoutées ${added} · échecs ${fail}`);
  if (!dry && linked + added >= 2) {
    writeFileSync(`${A}/sections/${id}/template.liquid`, tpl);
    writeFileSync(`${A}/sections/${id}/schema.json`, JSON.stringify(schema, null, 2) + "\n");
    appendFileSync("/home/ubuntu/apres-import/faq-build.log", `${id}\t${items.length}\t${linked}\t${added}\t${fail}\n`);
  }
}
await b.close();
