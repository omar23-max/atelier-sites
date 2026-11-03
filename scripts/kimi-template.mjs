// Fiche template d'une page importée par Kimi (kimi-import.mjs) : sans elle,
// la page n'apparaît pas dans Catalogue → Templates.
//   imports/<nom>/template.json   nom, type, marque, adresse d'origine…
//   imports/<nom>/desktop.png     la page entière (1440 px), rendue par /partage
//   imports/<nom>/vignette.png    le haut de la page (1440 × 1600)
// Le dev server doit tourner (http://localhost:5180).
//
//   node scripts/kimi-template.mjs <nom> [<nom> …] [--origine daydreamer-vault]
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { pageTypeById } from "../src/engine/page-types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const at = args.indexOf("--origine");
const origine = at >= 0 ? args.splice(at, 2)[1] : null;
const TYPES = { pdp: "produit", product: "produit", landing: "landing", lp: "landing", home: "accueil", advertorial: "advertorial", adv: "advertorial" };
const marqueOf = (url) => {
  try {
    const host = new URL(url).hostname.replace(/^(www|shop|get|try)\./, "").split(".")[0];
    return host.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch { return ""; }
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
const tab = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
for (const nom of args) {
  const dir = join(root, "imports", nom);
  if (!existsSync(join(dir, "kimi.json"))) { console.log(`✗ ${nom} : pas d'import Kimi`); continue; }
  const kimi = JSON.parse(await readFile(join(dir, "kimi.json"), "utf8"));
  const metaFile = join(kimi.app, "meta.json");
  const meta = existsSync(metaFile) ? JSON.parse(await readFile(metaFile, "utf8")) : {};
  const page = JSON.parse(await readFile(join(root, "pages", `${nom}.json`), "utf8"));
  const pageType = pageTypeById[meta.type] ? meta.type : TYPES[meta.type] ?? page.root?.props?.pageType ?? "autre";
  const old = existsSync(join(dir, "template.json")) ? JSON.parse(await readFile(join(dir, "template.json"), "utf8")) : {};
  const marque = marqueOf(meta.source);
  const tpl = {
    nom: `${marque || nom} — ${pageTypeById[pageType]?.label ?? pageType}${meta.title ? ` (${meta.title.slice(0, 70)})` : ""}`,
    pageType,
    niche: "",
    produit: "",
    marque,
    url: meta.source ?? null,
    page: nom,
    source: "kimi",
    ...(origine && { origine }),
    capturedAt: kimi.importedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    ...old,
  };
  await writeFile(join(dir, "template.json"), JSON.stringify(tpl, null, 2) + "\n", "utf8");
  try {
    await tab.goto(`http://localhost:5180/partage/${nom}`, { waitUntil: "load", timeout: 60000 });
    await tab.waitForTimeout(800);
    // Certaines pages bloquent le défilement (html/body à 100 % de haut) : libéré
    // pour la capture, la hauteur est celle du dernier élément visible.
    await tab.addStyleTag({ content: "html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; }" });
    const height = Math.min(16000, Math.max(1600, Math.ceil(await tab.evaluate(() => Math.max(document.documentElement.scrollHeight, ...[...document.body.querySelectorAll("*")].map((e) => e.getBoundingClientRect().bottom + scrollY))))));
    await tab.screenshot({ path: join(dir, "desktop.png"), clip: { x: 0, y: 0, width: 1440, height }, fullPage: true, timeout: 120000, animations: "disabled" });
    await tab.screenshot({ path: join(dir, "vignette.png"), clip: { x: 0, y: 0, width: 1440, height: 1600 } });
    console.log(`✓ ${nom}  ${pageType}  ${height}px`);
  } catch (e) {
    console.log(`⚠ ${nom} : fiche écrite, capture impossible (${e.message.split("\n")[0]})`);
  }
}
await browser.close();
