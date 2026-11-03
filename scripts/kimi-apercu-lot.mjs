// Aperçu rapide d'un lot Kimi décompressé, sans build : pour chaque app,
// rend content.js + styles.css dans Edge et prend une capture du haut de page.
// Sert à repérer les pages livrées sans style avant de lancer l'import.
// Usage : node scripts/kimi-apercu-lot.mjs <dossier-du-lot> <dossier-sortie>
import { createServer } from "node:http";
import { readFile, readdir, mkdir, writeFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const [lot, out] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const apps = [];
for (const d of await readdir(lot)) {
  try { await stat(join(lot, d, "src", "content.js")); apps.push(d); } catch {}
}

const MIME = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".css": "text/css" };
const server = createServer(async (req, res) => {
  const [, app, ...rest] = decodeURIComponent(req.url.split("?")[0]).split("/");
  try {
    if (!rest.length || rest[0] === "") {
      const { default: c } = await import(pathToFileURL(join(lot, app, "src", "content.js")).href);
      const css = (await readFile(join(lot, app, "src", "styles.css"), "utf8")).replaceAll("/assets/", `/${app}/assets/`);
      const html = (c.html || "").replaceAll('"/assets/', `"/${app}/assets/`);
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res.end(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="root">${html}</div></body></html>`);
    }
    const file = join(lot, app, "public", ...rest);
    res.setHeader("content-type", MIME[extname(file).toLowerCase()] || "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(5192, r));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
const rows = [];
for (const app of apps) {
  try {
    await page.goto(`http://localhost:5192/${app}/`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const fonts = new Set([...document.querySelectorAll("#root *")].slice(0, 400).map((e) => getComputedStyle(e).fontFamily));
      const imgs = [...document.images].filter((i) => i.getBoundingClientRect().width > 50);
      return { h: document.documentElement.scrollHeight, serif: /Times|serif$/.test(getComputedStyle(document.querySelector("#root p, #root a, #root span") || document.body).fontFamily) && !/sans/.test(getComputedStyle(document.querySelector("#root p, #root a, #root span") || document.body).fontFamily), fonts: fonts.size, imgs: imgs.length };
    });
    await page.screenshot({ path: join(out, `${app}.jpg`), type: "jpeg", quality: 55 });
    rows.push({ app, ...info });
    console.log(app, JSON.stringify(info));
  } catch (e) { console.log(app, "ERREUR", e.message); rows.push({ app, erreur: e.message }); }
}
await writeFile(join(out, "apercu.json"), JSON.stringify(rows, null, 1));
const sheet = `<!doctype html><body style="margin:0;font:12px sans-serif;display:grid;grid-template-columns:repeat(6,1fr);gap:6px;background:#ddd">${rows.map((r) => `<div style="background:#fff"><img src="${r.app}.jpg" style="width:100%;height:260px;object-fit:cover;object-position:top"><div>${r.app}</div></div>`).join("")}</body>`;
await writeFile(join(out, "planche.html"), sheet);
await browser.close();
server.close();
