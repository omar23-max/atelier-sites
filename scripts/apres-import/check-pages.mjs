// Contrôle de pages entières rendues comme à la publication (moteur de l'atelier) :
// erreurs JS, cadres du navigateur restants, FAQ (fermées / s'ouvrent), carrousels.
//   node check-pages.mjs page1 page2 …
import { chromium } from "/home/ubuntu/atelier-sites/node_modules/playwright-core/index.mjs";
const names = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const name of names) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ed = await ctx.newPage();
  await ed.goto(`http://127.0.0.1:5180/?page=${name}`, { waitUntil: "load", timeout: 90000 });
  await ed.waitForTimeout(9000);
  const html = await ed.evaluate(async (name) => {
    const { sections } = await import("/src/engine/sections.js");
    const { renderSectionHtml, setPhotoResolver } = await import("/src/engine/render.js");
    const { brandCss } = await import("/src/engine/brand.js");
    const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
    const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
    const data = await (await fetch(`/api/pages/${name}`)).json();
    const used = [...new Set(data.content.map((c) => c.type))].map((t) => byId[t]).filter(Boolean);
    const body = data.content.filter((i) => byId[i.type]).map((i) => renderSectionHtml(byId[i.type], i.props, i.props.id)).join("\n");
    const css = [brandCss(data.root?.props), ...used.map((s) => s.css)].join("\n");
    return `<!doctype html><html><head><meta charset="utf-8"><base href="http://127.0.0.1:5180/"><style>${[...new Set(css.match(IMPORT) ?? [])].join("\n")}\nhtml,body{margin:0}\n${css.replace(IMPORT, "")}</style></head><body>${body}</body></html>`;
  }, name);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await p.route("http://chk.test/**", (r) => r.fulfill({ body: html, contentType: "text/html; charset=utf-8" }));
  await p.goto("http://chk.test/p.html", { waitUntil: "load", timeout: 90000 });
  await p.waitForTimeout(2500);
  const m = await p.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.display !== "none" && cs.visibility !== "hidden"; };
    const ua = [...document.querySelectorAll("button,input,select,textarea,summary")].filter((e) => vis(e) && /outset|inset/.test(getComputedStyle(e).borderTopStyle)).length;
    const answers = [...document.querySelectorAll("[data-atl-r]")];
    return { H: document.body.scrollHeight, ua, faqQ: document.querySelectorAll("[data-atl-q]").length, ouvertes: answers.filter((a) => a.getBoundingClientRect().height > 2).length, carrousels: document.querySelectorAll("[data-atl-carrousel]").length, fleches: document.querySelectorAll('[data-atl-car="next"]').length };
  });
  let faqOk = "—";
  if (m.faqQ) {
    const q = p.locator("[data-atl-q]").first();
    await q.scrollIntoViewIfNeeded().catch(() => {});
    await q.click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(300);
    faqOk = await p.evaluate(() => [...document.querySelectorAll("[data-atl-r]")].filter((a) => a.getBoundingClientRect().height > 2).length > 0 ? "s'ouvre" : "ne s'ouvre pas");
  }
  console.log(name, JSON.stringify(m), "FAQ:", faqOk, errs.length ? "ERREURS " + errs.join(" / ") : "0 erreur");
  await ctx.close();
}
await browser.close();
