// Templates Whitelabeler → pages de l'atelier (lecture seule : on ouvre
// l'aperçu public de chaque template, on ne se connecte pas, on ne dépense
// aucun crédit).
//
//   node scripts/whitelabeler-capture.mjs [--seulement wl-produit-14,…] [--sans-import]
//
// Pour chaque template :
// 1. l'aperçu public (…/templates/<id>/preview) contient la page complète
//    dans une iframe (srcdoc) : on la lit ;
// 2. les polices Google sont téléchargées et servies en local ;
// 3. la page est rangée dans kimi-pages/<nom>/dist/index.html, puis importée
//    avec kimi-import.mjs --sans-coupe --sans-catalogue : page découpée en
//    sections modifiables, rien n'est ajouté au catalogue de sections.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = "C:/Users/HP/Desktop/kimi-pages";
const opt = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const only = opt("--seulement")?.split(",");

// Templates (pages produit et advertorials) de https://app.whitelabeler.ai/templates.
const TEMPLATES = [
  ["wl-produit-14", "a4b29136-4260-431a-98c9-d6121ed9f1a0", "Product Page 14 — Every Angle · Apparel"],
  ["wl-produit-13", "24e090d1-a092-402e-af4f-df96cf6aa1d1", "Product Page 13 — Show & Tell · Pet"],
  ["wl-produit-12", "9a330215-be22-4081-a01d-9ce6b630ac20", "Product Page 12 — Variant Configurator · Gadget"],
  ["wl-produit-11", "512bccc9-79d5-40da-af38-b941635a15d7", "Product Page 11 — Bundle Builder · Pet"],
  ["wl-produit-10", "261a8a95-45fc-42bc-8fe0-e0888419fa02", "Product Page 10 — Before & After · Beauty"],
  ["wl-produit-09", "6d516356-d1fa-4ec6-b0e0-6788c685dd10", "Product Page 09 — Science Explainer · Home"],
  ["wl-produit-08", "5a5b19b2-2251-4e33-9dad-c97f09377439", "Product Page 08 — Expert Backed · Beauty"],
  ["wl-produit-07", "5edb0326-7e01-4a71-a4ef-4e30887f213e", "Product Page 07 — Results Timeline · Supplement"],
  ["wl-produit-06", "7e952419-3dbb-4252-892b-7fa086f90c10", "Product Page 06 — Routine Builder · Supplement"],
  ["wl-produit-05", "da54f4d7-561b-4c54-b5e1-4ef8fcbc1f62", "Product Page 05 — Problem Agitate · Pet"],
  ["wl-produit-04", "1a062a37-f825-414c-af2e-0a51abdee36e", "Product Page 04 — Cause Led · Beauty"],
  ["wl-produit-03", "5d701b8c-9a20-48fe-91ca-32ae0090bb51", "Product Page 03 — Value Stack · Beauty"],
  ["wl-produit-02", "e69066f2-0aff-4d64-a8a3-7392d5c17e08", "Product Page 02 — Bundle Builder · Beauty"],
  ["wl-produit-01", "f8713bf0-b656-497a-8ec5-402818145eef", "Product Page 01 — Clinical Proof · Beauty"],
  ["wl-advertorial-03", "9b04f955-70f8-42cd-8c05-fff183a33d21", "Advertorial 03 — Numbered Reasons · Pet"],
  ["wl-advertorial-02", "936a1ee3-9972-407e-8fde-d6d69fbedb69", "Advertorial 02 — Numbered Reasons · Beauty"],
  ["wl-advertorial-01", "05983ec5-39c9-42ba-851d-f31e20273e20", "Advertorial 01 — Numbered Reasons · Pet"],
].filter(([name]) => !only || only.includes(name));

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// Polices Google : la feuille et ses fichiers woff2 en local.
async function localFonts(html, dir) {
  const links = [...html.matchAll(/<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2?[^"]+)"[^>]*>/g)];
  let css = "";
  for (const [, href] of links) {
    let sheet = await (await fetch(href.replace(/&amp;/g, "&"), { headers: { "user-agent": UA } })).text();
    for (const [url] of sheet.matchAll(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g)) {
      const file = createHash("sha1").update(url).digest("hex").slice(0, 12) + (url.match(/\.\w+$/)?.[0] ?? ".woff2");
      await writeFile(join(dir, "assets", file), Buffer.from(await (await fetch(url)).arrayBuffer()));
      sheet = sheet.replaceAll(url, `/assets/${file}`);
    }
    css += sheet;
  }
  return html
    .replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g, "")
    .replace(/<\/head>/i, `<style>${css}</style></head>`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const done = [];
for (const [name, id, title] of TEMPLATES) {
  const url = `https://app.whitelabeler.ai/templates/${id}/preview`;
  console.log(`\n=== ${name} · ${title}`);
  // Le serveur est parfois lent : on attend l'iframe, jusqu'à 3 essais.
  let html = null;
  for (let essai = 1; essai <= 3 && !html; essai++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector("iframe[srcdoc]", { state: "attached", timeout: 60000 });
      html = await page.evaluate(() => document.querySelector("iframe[srcdoc]")?.srcdoc ?? null);
    } catch (e) {
      console.log(`  … essai ${essai} : ${e.message.split("\n")[0]}`);
    }
  }
  if (!html) {
    console.log("  ✗ aperçu introuvable");
    continue;
  }
  const dir = join(pagesDir, name, "dist");
  await mkdir(join(dir, "assets"), { recursive: true });
  let out = await localFonts(html, dir);
  if (!/<title>/i.test(out)) out = out.replace(/<head>/i, `<head><title>${title}</title>`);
  await writeFile(join(dir, "index.html"), out);
  const ext = [...new Set([...out.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => new URL(m[1]).host))];
  console.log(`  ✓ page lue (${Math.round(out.length / 1024)} ko)${ext.length ? ` · liens externes : ${ext.join(", ")}` : ""}`);
  done.push([name, url, title]);
}
await browser.close();

if (process.argv.includes("--sans-import")) process.exit(0);
for (const [name, url, title] of done) {
  console.log(`\n=== Import ${name}`);
  try {
    execFileSync("node", [join(root, "scripts", "kimi-import.mjs"), join(pagesDir, name), name, "--label", title, "--url", url, "--sans-coupe", "--sans-catalogue"], { cwd: root, stdio: "inherit" });
  } catch {
    console.log(`  ✗ ${name} : import en échec`);
  }
}
