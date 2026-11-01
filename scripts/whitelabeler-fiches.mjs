// Fiches des templates Whitelabeler importés (après whitelabeler-capture.mjs) :
// - imports/<nom>/template.json : le template apparaît dans le catalogue des
//   templates, sous le nom de Whitelabeler (« Product Page 11 — Bundle
//   Builder · Pet - Whitelabeler ») ;
// - imports/<nom>/desktop.png (page entière, 1440 px) et vignette.png ;
// - titre de la page dans l'atelier = ce même nom.
//
//   node scripts/whitelabeler-fiches.mjs
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = "C:/Users/HP/Desktop/kimi-pages";
const src = await readFile(join(root, "scripts", "whitelabeler-capture.mjs"), "utf8");
const TEMPLATES = [...src.matchAll(/\["(wl-[a-z]+-\d+)", "([0-9a-f-]+)", "([^"]+)"\]/g)].map((m) => ({ name: m[1], id: m[2], title: m[3] }));

const TYPES = { ".html": "text/html", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".css": "text/css" };
let dist = null;
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(dist, p === "/" ? "index.html" : p);
  if (!file.startsWith(dist) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route("**/*", (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));

const today = new Date().toISOString().slice(0, 10);
for (const t of TEMPLATES) {
  const imp = join(root, "imports", t.name);
  const pageFile = join(root, "pages", `${t.name}.json`);
  dist = join(pagesDir, t.name, "dist");
  if (!existsSync(pageFile) || !existsSync(join(dist, "index.html"))) {
    console.log(`  – ${t.name} : pas encore importé`);
    continue;
  }
  const nom = `${t.title} - Whitelabeler`;
  const advertorial = t.name.startsWith("wl-advertorial"); // « Numbered Reasons » : des listicles
  const [, , , niche] = /^(.*?) — (.*?) · (.*)$/.exec(t.title) ?? [];
  await writeFile(
    join(imp, "template.json"),
    JSON.stringify(
      {
        nom,
        pageType: advertorial ? "listicle" : "produit",
        niche: niche ?? "",
        produit: "",
        marque: "Whitelabeler",
        url: `https://app.whitelabeler.ai/templates/${t.id}/preview`,
        page: t.name,
        source: "whitelabeler",
        capturedAt: today,
      },
      null,
      2,
    ) + "\n",
  );

  // Captures : page entière (aperçu agrandi) et vignette (haut de page).
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(imp, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 504 * 2, height: 560 * 2 });
  await page.screenshot({ path: join(imp, "vignette-grand.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  const small = await browser.newPage({ viewport: { width: 504, height: 560 } });
  await small.setContent(`<body style="margin:0"><img src="data:image/png;base64,${(await readFile(join(imp, "vignette-grand.png"))).toString("base64")}" style="width:504px;height:560px;display:block"></body>`);
  await small.screenshot({ path: join(imp, "vignette.png") });
  await small.close();
  await rm(join(imp, "vignette-grand.png"), { force: true });

  // Titre de la page dans l'atelier.
  const data = JSON.parse(await readFile(pageFile, "utf8"));
  data.root.props.title = nom;
  data.root.props.pageType = advertorial ? "listicle" : "produit";
  await writeFile(pageFile, JSON.stringify(data, null, 2) + "\n");
  console.log(`  ✓ ${t.name} : « ${nom} »`);
}
await browser.close();
server.close();
