// Capture d'une section rendue seule : node shot.mjs <id> [largeur] [hauteurMax]
const A = "/home/ubuntu/atelier-sites";
const { chromium } = await import(`${A}/node_modules/playwright-core/index.mjs`);
const { renderSectionHtml, setPhotoResolver } = await import(`${A}/src/engine/render.js`);
const { loadSection, photoDataUrl } = await import(`${A}/scripts/lib/load.mjs`);
setPhotoResolver(photoDataUrl);
const [id, w = "1440", maxH = "2600"] = process.argv.slice(2);
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
const s = await loadSection(id);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${[...new Set(s.css.match(IMPORT) ?? [])].join("\n")}
html, body { margin: 0; background: #fff; }
${s.css.replace(IMPORT, "")}</style></head><body>${renderSectionHtml(s, {}, "miniature").replace(/\s(srcset|sizes)="[^"]*"/g, "")}</body></html>`;
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage({ viewport: { width: +w, height: 900 } });
await p.setContent(html, { waitUntil: "load", timeout: 30000 });
await p.waitForTimeout(800);
const H = await p.evaluate(() => document.body.scrollHeight);
await p.screenshot({ path: `/home/ubuntu/apres-import/shot-${id}.png`, fullPage: true, clip: { x: 0, y: 0, width: +w, height: Math.min(H, +maxH) } });
console.log(id, "H", H);
await b.close();
