// Test FAQ / carrousel d'une section rendue seule (scripts actifs, comme l'aperçu du catalogue).
//   node test-faq.mjs <id> [faq|car]
const A = "/home/ubuntu/atelier-sites";
const { chromium } = await import(`${A}/node_modules/playwright-core/index.mjs`);
const { renderSectionHtml, setPhotoResolver } = await import(`${A}/src/engine/render.js`);
const { loadSection, photoDataUrl } = await import(`${A}/scripts/lib/load.mjs`);
setPhotoResolver(photoDataUrl);
const [id, mode = "faq"] = process.argv.slice(2);
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
const s = await loadSection(id);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${[...new Set(s.css.match(IMPORT) ?? [])].join("\n")}
html, body { margin: 0; background: #fff; }
${s.css.replace(IMPORT, "")}</style></head><body>${renderSectionHtml(s, {}, "apercu").replace(/\s(srcset|sizes)="[^"]*"/g, "")}</body></html>`;
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on("pageerror", (e) => console.log("ERREUR", String(e).slice(0, 200)));
await p.setContent(html, { waitUntil: "load", timeout: 30000 });
await p.waitForTimeout(800);
if (mode === "faq") {
  const state = () => p.evaluate(() => [...document.querySelectorAll("[data-atl-r]")].map((a) => a.getBoundingClientRect().height > 2 ? 1 : 0).join(""));
  console.log("acc-on:", await p.evaluate(() => !!document.querySelector("[data-atl-acc-on]")), "réponses visibles avant clic:", await state());
  const q = p.locator("[data-atl-q]").first();
  await q.click();
  await p.waitForTimeout(300);
  console.log("après 1er clic:", await state());
  await p.screenshot({ path: `/home/ubuntu/apres-import/faq-${id}.png`, fullPage: true });
  await q.click();
  await p.waitForTimeout(300);
  console.log("après 2e clic:", await state());
} else {
  const info = () => p.evaluate(() => [...document.querySelectorAll('[data-atl-car="track"]')].map((t) => Math.round(t.scrollLeft) + "/" + (t.scrollWidth - t.clientWidth)).join(" "));
  console.log("carrousel actif:", await p.evaluate(() => !!document.querySelector("[data-atl-carrousel]")), "pistes:", await info());
  const next = p.locator('[data-atl-car="next"]').first();
  if (await next.count()) { await next.click(); await p.waitForTimeout(900); console.log("après flèche:", await info()); }
  else console.log("aucune flèche marquée");
}
await b.close();
