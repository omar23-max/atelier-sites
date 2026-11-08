// Flèches de carrousel non reconnues à l'import : repérées dans le rendu
// (boutons ou liens à gauche / à droite de la piste, avec flèche ou libellé
// prev/next), puis marquées data-atl-car="prev|next" dans template.liquid.
//   node fleches.mjs [--dry] [--ids a,b]
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const { chromium } = await import(`${A}/node_modules/playwright-core/index.mjs`);
const { renderSectionHtml, setPhotoResolver } = await import(`${A}/src/engine/render.js`);
const { loadSection, photoDataUrl, listSectionIds } = await import(`${A}/scripts/lib/load.mjs`);
setPhotoResolver(photoDataUrl);
const dry = process.argv.includes("--dry");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
let ids = arg("--ids") ? arg("--ids").split(",") : (await listSectionIds());
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const log = [];
let marked = 0, seen = 0;
for (const id of ids) {
  let s;
  try { s = await loadSection(id); } catch { continue; }
  if (!s.template.includes('data-atl-car="track"') || /data-atl-car="(prev|next)"/.test(s.template)) continue;
  seen++;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${[...new Set(s.css.match(IMPORT) ?? [])].join("\n")}
html, body { margin: 0; } ${s.css.replace(IMPORT, "")}</style></head><body>${renderSectionHtml(s, {}, "x").replace(/<script[\s\S]*?<\/script>/g, "").replace(/\s(srcset|sizes)="[^"]*"/g, "")}</body></html>`;
  await p.setContent(html, { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(150);
  const found = await p.evaluate(() => {
    const out = [];
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 4 && r.height > 4 && cs.display !== "none" && cs.visibility !== "hidden"; };
    const tracks = [...document.querySelectorAll('[data-atl-car="track"]')].filter((t) => t.scrollWidth > t.clientWidth + 10);
    if (!tracks.length) return out;
    const cands = [...document.querySelectorAll("button, a, [role=button], div, span")].filter((e) => {
      if (!vis(e) || e.closest('[data-atl-car="track"]')) return false;
      const r = e.getBoundingClientRect();
      if (r.width > 90 || r.height > 90) return false;
      const lab = ((e.getAttribute("aria-label") || "") + " " + (e.className && e.className.baseVal === undefined ? e.className : "") + " " + (e.getAttribute("title") || "")).toLowerCase();
      const txt = e.textContent.trim();
      const arrowTxt = /^(‹|›|<|>|←|→|❮|❯|〈|〉|«|»|prev|next|previous)$/i.test(txt);
      const named = /\b(prev|previous|next|arrow|chevron|slick-|swiper-button|splide__arrow|flickity-prev|flickity-next)/.test(lab);
      const svgOnly = !txt && e.querySelector("svg") && (e.tagName === "BUTTON" || e.tagName === "A" || e.getAttribute("role") === "button");
      return arrowTxt || named || svgOnly;
    });
    // le plus extérieur seulement
    const top = cands.filter((e) => !cands.some((o) => o !== e && o.contains(e)));
    for (const t of tracks) {
      const tr = t.getBoundingClientRect();
      const near = top.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > tr.top - 160 && r.top < tr.bottom + 160; });
      if (near.length < 2) continue;
      near.sort((a, c) => a.getBoundingClientRect().left - c.getBoundingClientRect().left);
      const pick = [near[0], near[near.length - 1]];
      pick.forEach((e, i) => {
        const cls = e.getAttribute("class") || "";
        const same = [...document.querySelectorAll(e.tagName)].filter((o) => (o.getAttribute("class") || "") === cls);
        out.push({ dir: i ? "next" : "prev", tag: e.tagName.toLowerCase(), cls, nth: same.indexOf(e), slot: e.getAttribute("data-atl-slot"), group: e.getAttribute("data-atl-group") });
      });
      break;
    }
    return out;
  });
  if (found.length !== 2) { log.push(`${id}: aucune paire de flèches trouvée`); continue; }
  let tpl = s.template, ok = true;
  for (const f of found) {
    let re;
    if (f.slot) re = new RegExp(`<${f.tag}\\b[^>]*data-atl-slot="${f.slot}"`, "g");
    else if (f.group) re = new RegExp(`<${f.tag}\\b[^>]*data-atl-group="${f.group}"`, "g");
    else if (f.cls) re = new RegExp(`<${f.tag}\\b[^>]*class="${f.cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g");
    else { ok = false; break; }
    const ms = [...tpl.matchAll(re)];
    const m = f.slot || f.group ? ms[0] : ms[f.nth];
    if (!m) { ok = false; break; }
    tpl = tpl.slice(0, m.index) + `<${f.tag} data-atl-car="${f.dir}"` + tpl.slice(m.index + f.tag.length + 1);
  }
  if (!ok) { log.push(`${id}: flèches vues mais introuvables dans le template`); continue; }
  if (!dry) writeFileSync(`${A}/sections/${id}/template.liquid`, tpl);
  marked++;
  log.push(`${id}: flèches marquées (${found.map((f) => f.tag + "." + (f.cls || "").slice(0, 30)).join(" / ")})`);
}
await b.close();
writeFileSync("/home/ubuntu/apres-import/fleches.log", log.join("\n") + "\n");
console.log({ sansFleches: seen, marquees: marked, dry });
