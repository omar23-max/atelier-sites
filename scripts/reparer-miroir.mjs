// Réparation des pages copiées dont une partie du CSS d'origine manque (souvent
// dans le zip de Kimi lui-même) : la copie devient deux à dix fois trop haute.
//
//   node scripts/reparer-miroir.mjs <page> [<page> …] [--essai]
//
// La page est rendue à 1440 px (/partage/<page>?reperes=1, l'atelier doit
// tourner). Quatre défauts sont repérés :
// 1. icône géante : <svg> à petit viewBox (≤ 64) sans taille, étirée sur
//    toute la largeur (étoiles d'avis…) → ramenée à la taille de son viewBox ;
// 2. carrousel empilé : piste (track, swiper-wrapper, marquee, media-list…)
//    dont les diapos tombent les unes sous les autres, plus de 2500 px → remise
//    en ligne, défilement horizontal ;
// 3. menu déroulant affiché en entier (pays, langues…) → masqué ;
// 4. hauteur minimale figée par Kimi au-dessus d'un de ces défauts (prise
//    sur sa capture ratée) → levée.
// Les règles vont à la fin du style.css de la section concernée, entre
// /* atl-reparation */ et /* fin atl-reparation */ (remplacées si on relance),
// et dans sa copie du catalogue (<page>-sec-N) si elle existe. --essai :
// affiche seulement ce qui serait fait.
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.ATL_SERVEUR ?? "http://localhost:5180";
const args = process.argv.slice(2);
const essai = args.includes("--essai");
const pages = args.filter((a) => !a.startsWith("--"));
if (!pages.length) {
  console.error("Usage : node scripts/reparer-miroir.mjs <page> [<page> …] [--essai]");
  process.exit(1);
}

// Dans la page : les défauts, rangés par section (rang dans la page).
function detect() {
  const H = (e) => e.getBoundingClientRect().height;
  const marks = [...document.querySelectorAll("template[data-atl-sec]")];
  const sectionOf = (el) => {
    let n = -1;
    for (const m of marks) if (m.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) n = Number(m.dataset.atlSec);
    return n;
  };
  const esc = (c) => CSS.escape(c);
  // Sélecteur stable : les classes de l'élément ; sans classe, celles du plus
  // proche ancêtre qui en a, suivies des balises jusqu'à l'élément.
  const classes = (e) => [...e.classList].filter((c) => !/^(is-|js-|active|selected|swiper-slide-)/.test(c) && !c.startsWith("atl-")).slice(0, 2);
  const selector = (e) => {
    const own = classes(e);
    if (own.length) return `${e.tagName.toLowerCase()}.${own.map(esc).join(".")}`;
    const path = [];
    let cur = e;
    while (cur && cur !== document.body && !classes(cur).length) {
      path.unshift(cur.tagName.toLowerCase());
      cur = cur.parentElement;
    }
    if (!cur || cur === document.body) return null;
    return `${cur.tagName.toLowerCase()}.${classes(cur).map(esc).join(".")} ${path.join(" > ")}`;
  };
  const found = [];

  for (const s of document.querySelectorAll("svg")) {
    const vb = s.viewBox?.baseVal;
    if (!vb?.width || vb.width > 64 || s.hasAttribute("width") || s.hasAttribute("height")) continue;
    const w = s.getBoundingClientRect().width;
    if (H(s) < 150 || w < vb.width * 4) continue;
    const sel = selector(s);
    if (sel) found.push({ section: sectionOf(s), kind: "icone", sel, w: Math.round(vb.width), h: Math.round(vb.height), px: Math.round(H(s)) });
  }

  const TRACK = /track|swiper-wrapper|marquee|media-list|thumbnail-list|slider|carousel|slides|gallery__viewer/i;
  const tracks = [...document.querySelectorAll("*")].filter((t) => {
    if (!TRACK.test(String(t.className)) || H(t) < 2500) return false;
    const kids = [...t.children].filter((c) => H(c) > 20);
    if (kids.length < 3) return false;
    const a = kids[0].getBoundingClientRect();
    const b = kids[1].getBoundingClientRect();
    return b.top >= a.bottom - 5; // diapos les unes sous les autres
  });
  // La piste la plus intérieure (pas le bloc qui la contient).
  for (const t of tracks.filter((t) => !tracks.some((o) => o !== t && t.contains(o)))) {
    const sel = selector(t);
    if (!sel) continue;
    const kids = [...t.children];
    const text = kids.reduce((n, c) => n + c.textContent.trim().length, 0) / kids.length;
    const pics = kids.filter((c) => c.querySelector("img,video,picture")).length;
    // Bandeau défilant (petits éléments), vignettes d'une galerie, galerie (une
    // image par diapo, peu de texte) ou cartes (avis…).
    const cls = String(t.className);
    const mode = /marquee|ticker|logos/i.test(cls) ? "bandeau" : /thumb|nav/i.test(cls) ? "vignettes" : /galler|media|product/i.test(cls) && pics >= kids.length / 2 && text < 40 ? "galerie" : "cartes";
    found.push({ section: sectionOf(t), kind: "piste", sel, mode, enfants: kids.length, px: Math.round(H(t)) });
  }
  // 3. menu déroulant affiché en entier (liste des pays, des langues…) : masqué.
  for (const l of document.querySelectorAll("ul,ol,div")) {
    if (!/disclosure|dropdown|localization|country|currency|language/i.test(String(l.className)) || H(l) < 1500 || l.children.length < 20) continue;
    if ([...document.querySelectorAll("ul,ol,div")].some((o) => o !== l && o.contains(l) && found.some((f) => f.el === o))) continue;
    const sel = selector(l);
    if (sel) found.push({ section: sectionOf(l), kind: "menu", sel, enfants: l.children.length, px: Math.round(H(l)), el: l });
  }
  // Hauteur minimale figée (capture ratée) au-dessus d'un défaut : levée.
  for (const f of [...found]) {
    const el = f.el ?? document.querySelector(f.sel);
    for (let a = el?.parentElement; a && a !== document.body; a = a.parentElement) {
      if (!(parseFloat(getComputedStyle(a).minHeight) >= 1000)) continue; // « auto » : rien à lever
      const sel = a.id ? `#${CSS.escape(a.id)}` : selector(a);
      if (sel && !found.some((x) => x.kind === "hauteur" && x.sel === sel)) found.push({ section: f.section, kind: "hauteur", sel, px: Math.round(parseFloat(getComputedStyle(a).minHeight)) });
    }
  }
  return { total: document.documentElement.scrollHeight, found: found.map(({ el, ...f }) => f) };
}

const rule = (prefix, d) => {
  const s = `${prefix} ${d.sel}`;
  if (d.kind === "menu") return `${s} { display: none !important; }`;
  if (d.kind === "hauteur") return `${s} { min-height: 0 !important; }`;
  if (d.kind === "icone") return `${s} { width: ${d.w}px !important; height: ${d.h}px !important; display: inline-block !important; vertical-align: middle; }`;
  const item = { bandeau: "flex: 0 0 auto !important; width: auto !important;", vignettes: "flex: 0 0 80px !important; width: 80px !important; max-width: 80px !important;", galerie: "flex: 0 0 100% !important; width: 100% !important; max-width: 100% !important;", cartes: "flex: 0 0 min(380px, 85%) !important; width: min(380px, 85%) !important; max-width: 85% !important;" }[d.mode];
  return `${s} { display: flex !important; flex-wrap: nowrap !important; overflow-x: auto !important; overflow-y: hidden !important; scroll-snap-type: x mandatory; gap: 16px; height: auto !important; scrollbar-width: none; }\n${s} > * { ${item} scroll-snap-align: start; margin-top: 0 !important; }`;
};

const START = "/* atl-reparation */";
const END = "/* fin atl-reparation */";
async function writeRules(id, rules) {
  const file = join(root, "sections", id, "style.css");
  if (!existsSync(file)) return false;
  let css = await readFile(file, "utf8");
  const a = css.indexOf(START);
  if (a >= 0) css = css.slice(0, a).trimEnd() + css.slice(css.indexOf(END, a) + END.length);
  css = `${css.trimEnd()}\n\n${START}\n${rules.join("\n")}\n${END}\n`;
  await writeFile(file, css, "utf8");
  return true;
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
let touched = 0;
for (const name of pages) {
  const file = join(root, "pages", `${name}.json`);
  if (!existsSync(file)) {
    console.log(`✗ ${name} : page introuvable`);
    continue;
  }
  const page = JSON.parse(await readFile(file, "utf8"));
  const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await tab.goto(`${ORIGIN}/partage/${encodeURIComponent(name)}?reperes=1`, { waitUntil: "load", timeout: 180000 });
  await tab.waitForTimeout(1500);
  const { total, found } = await tab.evaluate(detect);
  await tab.close();
  if (!found.length) {
    console.log(`– ${name} : rien à réparer (${total} px)`);
    continue;
  }
  // Une règle par sélecteur et par section.
  const bySection = new Map();
  for (const d of found) {
    const type = page.content?.[d.section]?.type;
    if (!type) continue;
    const list = bySection.get(type) ?? new Map();
    list.set(`${d.kind}|${d.sel}`, d);
    bySection.set(type, list);
  }
  console.log(`✓ ${name} (${total} px) :`);
  for (const [type, list] of bySection) {
    const ds = [...list.values()];
    const what = (d) =>
      ({ icone: `icône ${d.sel} (${d.px} px → ${d.h} px)`, piste: `piste ${d.sel} (${d.enfants} diapos, ${d.px} px, ${d.mode})`, menu: `menu déroulant ${d.sel} (${d.enfants} lignes, ${d.px} px) masqué`, hauteur: `hauteur figée ${d.sel} (${d.px} px) levée` })[d.kind];
    for (const d of ds) console.log(`    ${type} · ${what(d)}`);
    if (essai) continue;
    await writeRules(type, ds.map((d) => rule(`.atl-${type}`, d)));
    touched++;
    const copy = type.replace(/-p(\d+)$/, "-sec-$1");
    if (copy !== type && (await writeRules(copy, ds.map((d) => rule(`.atl-${copy}`, d))))) touched++;
  }
}
await browser.close();
console.log(essai ? "\nEssai : rien n'a été écrit." : `\n${touched} section(s) réparée(s).`);
