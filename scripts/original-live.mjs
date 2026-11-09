// « Original » de l'éditeur = la page EN LIGNE, telle qu'elle apparaît sur
// internet aujourd'hui (2026-11-08). Les sites (Shopify…) refusent d'être
// affichés dans un cadre d'une autre adresse (frame-ancestors 'none') : le
// serveur ouvre donc la page dans Edge, attend son rendu complet (images
// différées, popups fermés), puis enregistre le HTML obtenu. L'atelier le sert
// depuis sa propre adresse, scripts coupés : le défilement reste lié à la
// version modifiable (les deux pages s'ouvrent au même endroit).
//
//   node scripts/original-live.mjs <dossier-import> <url>
// Produit imports/<dossier>/live.html et live.json { url, le, largeur }.
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [slug, url] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(slug ?? "") || !/^https?:\/\//.test(url ?? "")) {
  console.error("Usage : node scripts/original-live.mjs <dossier-import> <url>");
  process.exit(1);
}
const outDir = join(root, "imports", slug);

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // Popups d'inscription, bandeaux cookies, chats (même règle que capture.mjs).
  const dismiss = () =>
    page
      .evaluate(() => {
        const vw = innerWidth;
        const vh = innerHeight;
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.position !== "fixed" && cs.position !== "sticky") continue;
          const r = el.getBoundingClientRect();
          const isHeader = el.closest("header, .shopify-section-group-header-group, [class*=announcement]");
          const covers = r.width * r.height > vw * vh * 0.25;
          const looksLikePopup = /klaviyo|popup|modal|cookie|consent|newsletter|chat|intercom|gorgias|tidio|privy|justuno/i.test(`${el.id} ${el.className}`);
          if (!isHeader && (covers || looksLikePopup)) el.style.setProperty("display", "none", "important");
        }
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
      })
      .catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await dismiss();
  // Défilement lent : charge les images différées (lazy-load).
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(innerHeight * 0.7));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
  await dismiss();
  // Images différées : la source réelle remplace l'image d'attente, et le
  // « loading=lazy » est retiré (la page servie n'a plus de scripts).
  await page.evaluate(() => {
    for (const img of document.querySelectorAll("img")) {
      if (img.currentSrc && img.currentSrc !== img.getAttribute("src")) img.setAttribute("src", img.currentSrc);
      img.removeAttribute("loading");
    }
  });
  const html = await page.content();
  await writeFile(join(outDir, "live.html"), html, "utf8");
  await writeFile(join(outDir, "live.json"), JSON.stringify({ url: page.url(), le: new Date().toISOString(), largeur: 1440 }, null, 2) + "\n");
  console.log("ok", html.length);
} finally {
  await browser.close();
}
