// Vérifie une page copiée (« miroir ») contre son original, en plusieurs
// passes faites avec des outils différents, puis compare les résultats.
//
//   node scripts/verifier-miroir.mjs <slug> [page]
//
//   Passe 1 : l'original rendu dans Edge (Playwright, canal msedge).
//   Passe 2 : l'original rendu dans Google Chrome (autre navigateur, autre
//             session ; à défaut le Chromium de Playwright) : ce qui diffère entre 1 et 2 est
//             instable (contenu chargé tard, carrousel, A/B test…).
//   Passe 3 : le HTML brut du serveur, sans JavaScript (fetch) : titres et
//             images présents dans le code d'origine.
//   Copie   : la page de l'atelier (/partage/<page>), mesurée comme 1 et 2.
//
// Compare hauteur, images (par taille), titres et textes, et écrit
// imports/<slug>/verification.json. L'atelier (port 5180) doit tourner.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [slug, pageArg] = process.argv.slice(2);
if (!slug) {
  console.error("Usage : node scripts/verifier-miroir.mjs <slug> [page]");
  process.exit(1);
}
const dir = join(root, "imports", slug);
const tpl = existsSync(join(dir, "template.json")) ? JSON.parse(await readFile(join(dir, "template.json"), "utf8")) : {};
const url = tpl.urlComplete ?? tpl.url;
if (!url) throw new Error(`Pas d'URL d'origine dans imports/${slug}/template.json`);
const page = pageArg ?? tpl.page ?? slug;
const ORIGIN = process.env.ATL_SERVEUR ?? "http://localhost:5180";
const WIDTH = 1440;

const norm = (t) => (t ?? "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9à-ÿ' ]+/g, " ").replace(/\s+/g, " ").trim();

// Mesures prises dans la page (original ou copie), après défilement complet
// pour charger les images différées.
async function measure(browserPage, target) {
  await browserPage.goto(target, { waitUntil: "domcontentloaded", timeout: 90000 });
  await browserPage.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await browserPage.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await browserPage.waitForTimeout(1500);
  return browserPage.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
    };
    const top = (el) => Math.round(el.getBoundingClientRect().top + scrollY);
    // Partie réellement visible : coupée par les blocs « overflow » parents
    // (diapositives de carrousel, bande de vignettes qui défile).
    const shown = (el) => {
      let r = el.getBoundingClientRect();
      let [l, t, rr, b] = [r.left, r.top, r.right, r.bottom];
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (!/hidden|clip|auto|scroll/.test(getComputedStyle(p).overflow)) continue;
        const q = p.getBoundingClientRect();
        [l, t, rr, b] = [Math.max(l, q.left), Math.max(t, q.top), Math.min(rr, q.right), Math.min(b, q.bottom)];
      }
      return Math.max(0, rr - l) * Math.max(0, b - t) >= 0.5 * r.width * r.height;
    };
    const seen = new Set();
    const images = [...document.querySelectorAll("img, svg, video, [style*='background-image']")]
      .filter((el) => visible(el) && shown(el))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: top(el), tag: el.tagName.toLowerCase(), src: el.currentSrc || el.src || "" };
      })
      .filter((i) => i.w >= 40 && i.h >= 40)
      // Images empilées au même endroit (diapositives en fondu) : une seule se voit.
      .filter((i) => {
        const k = `${i.x}|${i.y}|${i.w}|${i.h}`;
        return !seen.has(k) && seen.add(k);
      });
    const headings = [...document.querySelectorAll("h1, h2, h3")]
      .filter(visible)
      .map((h) => h.innerText.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const text = document.body.innerText.replace(/\s+/g, " ");
    return { height: document.documentElement.scrollHeight, images, headings, text, words: text.split(" ").length };
  });
}

// Passe 3 : HTML brut, sans navigateur.
async function rawPass() {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" } });
  const html = await res.text();
  const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => strip(m[2])).filter(Boolean);
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].length;
  return { status: res.status, headings, images, bytes: html.length };
}

async function withBrowser(options, fn) {
  const browser = await chromium.launch({ headless: true, ...options });
  try {
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
    return await fn(await ctx.newPage());
  } finally {
    await browser.close();
  }
}

console.log(`Vérification du miroir « ${page} » contre ${url}`);
const passes = {};
const errors = {};
const run = async (name, fn) => {
  const t = Date.now();
  try {
    passes[name] = await fn();
    console.log(`  ✓ ${name} (${Math.round((Date.now() - t) / 1000)} s)`);
  } catch (e) {
    errors[name] = e.message.split("\n")[0];
    console.log(`  ✗ ${name} : ${errors[name]}`);
  }
};
await run("edge", () => withBrowser({ channel: "msedge" }, (p) => measure(p, url)));
const CHROMIUM = join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1217", "chrome-win64", "chrome.exe");
await run("chromium", () => withBrowser({ channel: "chrome" }, (p) => measure(p, url)).catch(() => withBrowser({ executablePath: CHROMIUM }, (p) => measure(p, url))));
await run("brut", rawPass);
await run("copie", () => withBrowser({ channel: "msedge" }, (p) => measure(p, `${ORIGIN}/partage/${encodeURIComponent(page)}`)));

const orig = passes.edge ?? passes.chromium;
const copy = passes.copie;
if (!orig || !copy) {
  console.log("Comparaison impossible : il manque l'original ou la copie.");
  await writeFile(join(dir, "verification.json"), JSON.stringify({ page, url, date: new Date().toISOString(), errors }, null, 2), "utf8");
  process.exit(1);
}

// Images : chaque image d'origine cherche une image de la copie de même taille
// (±15 %), à une position verticale comparable.
function matchImages(a, b) {
  const used = new Set();
  const missing = [];
  const scale = copy.height / orig.height;
  for (const img of a) {
    const k = b.findIndex(
      (c, i) => !used.has(i) && Math.abs(c.w - img.w) <= img.w * 0.15 + 4 && Math.abs(c.h - img.h) <= img.h * 0.15 + 4 && Math.abs(c.y - img.y * scale) < 1500,
    );
    if (k >= 0) used.add(k);
    else missing.push(img);
  }
  return { matched: a.length - missing.length, missing };
}
const images = matchImages(orig.images, copy.images);
const copyText = norm(copy.text);
const headingsMissing = orig.headings.filter((h) => norm(h).length > 3 && !copyText.includes(norm(h)));
const sentences = orig.text.split(/(?<=[.!?])\s+/).map(norm).filter((s) => s.split(" ").length >= 6);
const sentencesFound = sentences.filter((s) => copyText.includes(s)).length;

// Ce qui diffère entre les deux navigateurs : instable sur le site d'origine.
const stable = passes.edge && passes.chromium;
const instable = stable
  ? {
      hauteur: Math.abs(passes.edge.height - passes.chromium.height) > passes.edge.height * 0.03,
      images: Math.abs(passes.edge.images.length - passes.chromium.images.length),
      titres: passes.edge.headings.filter((h) => !passes.chromium.headings.includes(h)).length,
    }
  : null;

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 100);
const report = {
  page,
  url,
  date: new Date().toISOString(),
  largeur: WIDTH,
  hauteur: { edge: passes.edge?.height ?? null, chromium: passes.chromium?.height ?? null, copie: copy.height, ecart: `${pct(copy.height, orig.height) - 100} %` },
  images: { original: orig.images.length, copie: copy.images.length, retrouvees: images.matched, manquantes: images.missing.slice(0, 30), htmlBrut: passes.brut?.images ?? null },
  titres: { original: orig.headings.length, manquants: headingsMissing, htmlBrut: passes.brut?.headings.length ?? null },
  textes: { phrases: sentences.length, retrouvees: sentencesFound, couverture: `${pct(sentencesFound, sentences.length)} %`, motsOriginal: orig.words, motsCopie: copy.words },
  instable,
  errors,
};
const score = Math.round(
  (Math.max(0, 100 - Math.abs(pct(copy.height, orig.height) - 100) * 2) + pct(images.matched, orig.images.length) + pct(orig.headings.length - headingsMissing.length, orig.headings.length) + pct(sentencesFound, sentences.length)) / 4,
);
report.score = score;
await writeFile(join(dir, "verification.json"), JSON.stringify(report, null, 2), "utf8");

console.log(`
Score de fidélité : ${score} / 100
  Hauteur   : original ${orig.height} px (Edge ${passes.edge?.height ?? "—"}, Chrome ${passes.chromium?.height ?? "—"}) · copie ${copy.height} px (${report.hauteur.ecart})
  Images    : ${images.matched} / ${orig.images.length} retrouvées${images.missing.length ? ` · ${images.missing.length} manquante(s)` : ""}
  Titres    : ${orig.headings.length - headingsMissing.length} / ${orig.headings.length}${headingsMissing.length ? ` · manquants : ${headingsMissing.slice(0, 5).map((h) => `« ${h.slice(0, 40)} »`).join(", ")}` : ""}
  Textes    : ${report.textes.couverture} des phrases retrouvées
  HTML brut : ${passes.brut ? `${passes.brut.headings.length} titres, ${passes.brut.images} balises <img>` : errors.brut}
  Instable  : ${instable ? `hauteur ${instable.hauteur ? "différente" : "identique"} entre Edge et Chrome, ${instable.images} image(s) d'écart, ${instable.titres} titre(s) d'écart` : "—"}
Rapport : imports/${slug}/verification.json`);
