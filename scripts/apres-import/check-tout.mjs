// Contrôle complet des pages (templates) rendues comme à la publication, sur
// ordinateur (1440) et mobile (390) : erreurs JS, cadres du navigateur, FAQ,
// carrousels, images manquantes, débordement à droite, sections vides.
//   node check-tout.mjs [page …]   → ~/apres-import/repasse/pages.jsonl (reprend où il en était)
import { readdirSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { chromium } from "/home/ubuntu/atelier-sites/node_modules/playwright-core/index.mjs";
const OUT = process.env.OUT ?? "/home/ubuntu/apres-import/repasse/pages.jsonl";
const done = new Set(existsSync(OUT) ? readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).page) : []);
let names = process.argv.slice(2);
if (!names.length) names = readdirSync("/home/ubuntu/atelier-sites/pages").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
names = names.filter((n) => !done.has(n));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ed = await ctx.newPage();
for (const name of names) {
  let html;
  try {
    // le moteur ne charge les morceaux d'un template que dans le contexte de sa page
    await ed.goto(`http://127.0.0.1:5180/?page=${name}`, { waitUntil: "load", timeout: 90000 });
    await ed.waitForFunction(async (name) => {
      try {
        const { sections } = await import("/src/engine/sections.js");
        const ids = new Set(sections.map((s) => s.id));
        const data = await (await fetch(`/api/pages/${name}`)).json();
        return (data.content ?? []).every((i) => ids.has(i.type));
      } catch { return false; }
    }, name, { timeout: 25000, polling: 1000 }).catch(() => {});
    html = await ed.evaluate(async (name) => {
      const { sections } = await import("/src/engine/sections.js");
      const { renderSectionHtml } = await import("/src/engine/render.js");
      const { brandCss } = await import("/src/engine/brand.js");
      const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
      const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
      const data = await (await fetch(`/api/pages/${name}`)).json();
      const items = data.content ?? [];
      const missing = [...new Set(items.filter((i) => !byId[i.type]).map((i) => i.type))];
      const used = [...new Set(items.map((c) => c.type))].map((t) => byId[t]).filter(Boolean);
      const body = items.filter((i) => byId[i.type]).map((i) => `<div data-chk-sec="${i.type}">${renderSectionHtml(byId[i.type], i.props, i.props.id)}</div>`).join("\n");
      const css = [brandCss(data.root?.props), ...used.map((s) => s.css)].join("\n");
      return { missing, n: items.length, doc: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="http://127.0.0.1:5180/"><style>${[...new Set(css.match(IMPORT) ?? [])].join("\n")}\nhtml,body{margin:0}\n${css.replace(IMPORT, "")}</style></head><body>${body}</body></html>` };
    }, name);
  } catch (e) { appendFileSync(OUT, JSON.stringify({ page: name, erreur: String(e).slice(0, 200) }) + "\n"); continue; }
  const res = { page: name, sections: html.n, sectionsAbsentes: html.missing };
  for (const [vue, w, h] of [["ordi", 1440, 900], ["mobile", 390, 844]]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await c2.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
    await p.route("http://127.0.0.1:5180/__chk/**", (r) => r.fulfill({ body: html.doc, contentType: "text/html; charset=utf-8" }));
    await p.goto("http://127.0.0.1:5180/__chk/p.html", { waitUntil: "load", timeout: 90000 }).catch(() => {});
    await p.evaluate(async () => { for (const i of document.images) i.loading = "eager"; await new Promise((ok) => setTimeout(ok, 2500)); }).catch(() => {});
    const m = await p.evaluate(() => {
      const W = innerWidth;
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.display !== "none" && cs.visibility !== "hidden"; };
      const ua = [...document.querySelectorAll("button,input,select,textarea,summary")].filter((e) => vis(e) && /outset|inset/.test(getComputedStyle(e).borderTopStyle)).map((e) => e.closest("[data-chk-sec]")?.dataset.chkSec);
      const cassees = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src") && !/^data:/.test(i.src) && !/\.svg(\?|$)/i.test(i.src)).map((i) => i.closest("[data-chk-sec]")?.dataset.chkSec);
      const deb = [];
      for (const s of document.querySelectorAll("[data-chk-sec]")) { if (s.scrollWidth > W + 8) deb.push(s.dataset.chkSec); }
      const vides = [...document.querySelectorAll("[data-chk-sec]")].filter((s) => s.getBoundingClientRect().height < 4).map((s) => s.dataset.chkSec);
      return { H: document.body.scrollHeight, largeur: document.documentElement.scrollWidth, ua: [...new Set(ua)], imagesCassees: cassees.length, sectionsImagesCassees: [...new Set(cassees)], deborde: deb, invisibles: vides, faqQ: document.querySelectorAll("[data-atl-q]").length, carrousels: document.querySelectorAll("[data-atl-carrousel]").length };
    }).catch((e) => ({ erreur: String(e).slice(0, 120) }));
    if (m.faqQ && vue === "ordi") {
      const q = p.locator("[data-atl-q]").first();
      await q.scrollIntoViewIfNeeded().catch(() => {});
      await q.click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(300);
      m.faqOuvre = await p.evaluate(() => [...document.querySelectorAll("[data-atl-r]")].some((a) => a.getBoundingClientRect().height > 2)).catch(() => null);
    }
    m.erreursJS = errs;
    res[vue] = m;
    await c2.close();
  }
  appendFileSync(OUT, JSON.stringify(res) + "\n");
}
await browser.close();
console.log("fini");
