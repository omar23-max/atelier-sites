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

// Passe « capture » : la page telle qu'enregistrée à l'import (snapshot.json,
// la source de la copie), mesurée comme les autres.
async function capturePass() {
  const file = join(dir, "snapshot.json");
  if (!existsSync(file)) throw new Error("pas de snapshot.json");
  const snap = JSON.parse(await readFile(file, "utf8"));
  const nodes = snap.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map();
  for (const n of nodes) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  const textOf = (n) => [n.text ?? "", ...(kids.get(n.id) ?? []).map(textOf)].join(" ");
  const hidden = (n) => !n.box || n.box.x < -1000 || n.box.w <= 2 || n.box.h <= 2 || n.style?.display === "none" || n.style?.visibility === "hidden" || Number(n.style?.opacity ?? 1) <= 0.05;
  // Partie visible : coupée par les parents en overflow (carrousels).
  const shown = (n) => {
    let [l, t, r, b] = [n.box.x, n.box.y, n.box.x + n.box.w, n.box.y + n.box.h];
    for (let p = byId.get(n.parent); p; p = byId.get(p.parent)) {
      if (!/hidden|clip|auto|scroll/.test(`${p.style?.["overflow-x"] ?? ""} ${p.style?.["overflow-y"] ?? ""} ${p.style?.overflow ?? ""}`) || !p.box) continue;
      [l, t, r, b] = [Math.max(l, p.box.x), Math.max(t, p.box.y), Math.min(r, p.box.x + p.box.w), Math.min(b, p.box.y + p.box.h)];
    }
    return Math.max(0, r - l) * Math.max(0, b - t) >= 0.5 * n.box.w * n.box.h;
  };
  const seen = new Set();
  const images = nodes
    .filter((n) => !hidden(n) && (["img", "svg", "video"].includes(n.tag) || /url\(/.test(n.style?.["background-image"] ?? "")) && n.box.w >= 40 && n.box.h >= 40 && shown(n))
    .map((n) => ({ w: Math.round(n.box.w), h: Math.round(n.box.h), x: Math.round(n.box.x), y: Math.round(n.box.y), tag: n.tag, src: "" }))
    .filter((i) => {
      const k = `${i.x}|${i.y}|${i.w}|${i.h}`;
      return !seen.has(k) && seen.add(k);
    });
  const headings = nodes.filter((n) => /^h[1-3]$/.test(n.tag) && !hidden(n)).map((n) => textOf(n).replace(/\s+/g, " ").trim()).filter(Boolean);
  const text = nodes.filter((n) => n.text && !hidden(n)).map((n) => n.text).join(" ").replace(/\s+/g, " ");
  // Hauteur : celle de la capture d'écran enregistrée (en-tête PNG).
  const png = join(dir, "desktop.png");
  const height = existsSync(png) ? (await readFile(png)).readUInt32BE(20) : Math.max(...nodes.filter((n) => n.box).map((n) => n.box.y + n.box.h));
  return { height, images, headings, text, words: text.split(" ").length };
}

// Diff de pixels entre la copie et desktop.png, dans un navigateur (canvas) :
// pourcentage global, bandes de 200 px les plus différentes, et une planche
// original | copie | différences enregistrée en imports/<slug>/compare-copie.png.
async function compareScreens(copyPng, originalUrl) {
  return withBrowser({ channel: "msedge" }, async (p) => {
    // Même origine que desktop.png (le canvas reste lisible), sans redirection.
    await p.goto(originalUrl, { waitUntil: "load" });
    const out = await p.evaluate(
      async ({ copyData, originalUrl }) => {
        const load = (src) => new Promise((ok, ko) => Object.assign(new Image(), { onload() { ok(this); }, onerror: () => ko(new Error(`image illisible : ${src.slice(0, 60)}`)), src }));
        const [a, b] = await Promise.all([load(originalUrl), load(copyData)]);
        const W = 480;
        const H = Math.min(Math.round((Math.max(a.height, b.height) * W) / a.width), 12000);
        const draw = (img) => {
          const c = Object.assign(document.createElement("canvas"), { width: W, height: H });
          const x = c.getContext("2d");
          x.fillStyle = "#fff";
          x.fillRect(0, 0, W, H);
          x.drawImage(img, 0, 0, W, Math.round((img.height * W) / img.width));
          return x.getImageData(0, 0, W, H);
        };
        const da = draw(a);
        const db = draw(b);
        const diff = new ImageData(W, H);
        const band = Math.round((200 * W) / 1440);
        const bands = [];
        let total = 0;
        for (let y = 0; y < H; y++) {
          let rowDiff = 0;
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const d = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]);
            const bad = d > 90;
            rowDiff += bad;
            const g = (da.data[i] + da.data[i + 1] + da.data[i + 2]) / 3;
            diff.data.set(bad ? [230, 30, 60, 255] : [g, g, g, 70], i);
          }
          total += rowDiff;
          const k = Math.floor(y / band);
          bands[k] = (bands[k] ?? 0) + rowDiff;
        }
        const sheet = Object.assign(document.createElement("canvas"), { width: W * 3 + 20, height: H });
        const s = sheet.getContext("2d");
        s.fillStyle = "#fff";
        s.fillRect(0, 0, sheet.width, H);
        s.putImageData(da, 0, 0);
        s.putImageData(db, W + 10, 0);
        s.putImageData(diff, 2 * W + 20, 0);
        const zones = bands
          .map((v, k) => ({ y: Math.round((k * band * 1440) / W), ecart: Math.round((v / (band * W)) * 100) }))
          .sort((x, y) => y.ecart - x.ecart)
          .slice(0, 4);
        return { ecart: Math.round((total / (W * H)) * 1000) / 10, zones, sheet: sheet.toDataURL("image/png") };
      },
      { copyData: `data:image/png;base64,${copyPng.toString("base64")}`, originalUrl },
    );
    await writeFile(join(dir, "compare-copie.png"), Buffer.from(out.sheet.split(",")[1], "base64"));
    delete out.sheet;
    return out;
  });
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
await run("copie", () =>
  withBrowser({ channel: "msedge" }, async (p) => {
    const m = await measure(p, `${ORIGIN}/partage/${encodeURIComponent(page)}`);
    m.screenshot = await p.screenshot({ fullPage: true, animations: "disabled", timeout: 120000 });
    return m;
  }),
);

await run("capture", capturePass);

const live = passes.edge ?? passes.chromium;
const copy = passes.copie;
// Référence de fidélité : la capture enregistrée (ce que la copie devait
// reproduire) ; à défaut, le site en ligne.
const orig = passes.capture ?? live;
if (!orig || !copy) {
  console.log("Comparaison impossible : il manque l'original ou la copie.");
  await writeFile(join(dir, "verification.json"), JSON.stringify({ page, url, date: new Date().toISOString(), errors }, null, 2), "utf8");
  process.exit(1);
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 100);

// Compare deux mesures (référence → autre) : hauteur, images (même taille
// ±15 %, position comparable), titres et phrases retrouvés, score / 100.
function compare(ref, other) {
  const used = new Set();
  const missing = [];
  const scale = other.height / ref.height;
  for (const img of ref.images) {
    const k = other.images.findIndex(
      (c, i) => !used.has(i) && Math.abs(c.w - img.w) <= img.w * 0.15 + 4 && Math.abs(c.h - img.h) <= img.h * 0.15 + 4 && Math.abs(c.y - img.y * scale) < 1500,
    );
    if (k >= 0) used.add(k);
    else missing.push(img);
  }
  const text = norm(other.text);
  const headingsMissing = ref.headings.filter((h) => norm(h).length > 3 && !text.includes(norm(h)));
  const sentences = ref.text.split(/(?<=[.!?])\s+/).map(norm).filter((s) => s.split(" ").length >= 6);
  const found = sentences.filter((s) => text.includes(s)).length;
  const h = pct(other.height, ref.height) - 100;
  const score = Math.round((Math.max(0, 100 - Math.abs(h) * 2) + pct(ref.images.length - missing.length, ref.images.length) + pct(ref.headings.length - headingsMissing.length, ref.headings.length) + pct(found, sentences.length)) / 4);
  return { h, images: { matched: ref.images.length - missing.length, total: ref.images.length, missing }, headingsMissing, sentences: sentences.length, found, score };
}
const c = compare(orig, copy);
const images = c.images;
const headingsMissing = c.headingsMissing;
const sentences = { length: c.sentences };
const sentencesFound = c.found;
// Le site a-t-il changé depuis la capture ? (capture → site en ligne)
const change = passes.capture && live ? compare(passes.capture, live) : null;
const copyVsLive = live ? compare(live, copy) : null;

// Ce qui diffère entre les deux navigateurs : instable sur le site d'origine.
const stable = passes.edge && passes.chromium;
const instable = stable
  ? {
      hauteur: Math.abs(passes.edge.height - passes.chromium.height) > passes.edge.height * 0.03,
      images: Math.abs(passes.edge.images.length - passes.chromium.images.length),
      titres: passes.edge.headings.filter((h) => !passes.chromium.headings.includes(h)).length,
    }
  : null;

// Comparaison visuelle : capture d'écran de la copie contre desktop.png.
const visuel = copy.screenshot && existsSync(join(dir, "desktop.png")) ? await compareScreens(copy.screenshot, `${ORIGIN}/imports/${slug}/desktop.png`).catch((e) => ((errors.visuel = e.message.split("\n")[0]), null)) : null;
delete copy.screenshot;

const report = {
  page,
  url,
  date: new Date().toISOString(),
  largeur: WIDTH,
  reference: passes.capture ? "capture enregistrée" : "site en ligne",
  hauteur: { capture: passes.capture?.height ?? null, edge: passes.edge?.height ?? null, chromium: passes.chromium?.height ?? null, copie: copy.height, ecart: `${c.h} %` },
  images: { original: images.total, copie: copy.images.length, retrouvees: images.matched, manquantes: images.missing.slice(0, 30), htmlBrut: passes.brut?.images ?? null },
  titres: { original: orig.headings.length, manquants: headingsMissing, htmlBrut: passes.brut?.headings.length ?? null },
  textes: { phrases: sentences.length, retrouvees: sentencesFound, couverture: `${pct(sentencesFound, sentences.length)} %`, motsOriginal: orig.words, motsCopie: copy.words },
  visuel,
  // Site en ligne comparé à la capture : bas = le site a changé depuis.
  siteChange: change ? { score: change.score, hauteur: `${change.h} %`, textes: `${pct(change.found, change.sentences)} %`, verdict: change.score < 80 ? "le site a changé depuis la capture" : "site identique à la capture" } : null,
  copieContreSiteEnLigne: copyVsLive ? copyVsLive.score : null,
  instable,
  errors,
};
const score = c.score;
report.score = score;
await writeFile(join(dir, "verification.json"), JSON.stringify(report, null, 2), "utf8");

console.log(`
Score de fidélité : ${score} / 100 (contre la ${report.reference})
  Site      : ${report.siteChange ? `${report.siteChange.verdict} (${report.siteChange.score} / 100)` : "—"} · copie contre le site en ligne : ${report.copieContreSiteEnLigne ?? "—"} / 100
  Visuel    : ${visuel ? `${visuel.ecart} % de pixels différents · zones les plus différentes : ${visuel.zones.map((z) => `${z.y} px (${z.ecart} %)`).join(", ")} · imports/${slug}/compare-copie.png` : errors.visuel ?? "—"}
  Hauteur   : capture ${passes.capture?.height ?? "—"} px (en ligne : Edge ${passes.edge?.height ?? "—"}, Chrome ${passes.chromium?.height ?? "—"}) · copie ${copy.height} px (${report.hauteur.ecart})
  Images    : ${images.matched} / ${images.total} retrouvées${images.missing.length ? ` · ${images.missing.length} manquante(s)` : ""}
  Titres    : ${orig.headings.length - headingsMissing.length} / ${orig.headings.length}${headingsMissing.length ? ` · manquants : ${headingsMissing.slice(0, 5).map((h) => `« ${h.slice(0, 40)} »`).join(", ")}` : ""}
  Textes    : ${report.textes.couverture} des phrases retrouvées
  HTML brut : ${passes.brut ? `${passes.brut.headings.length} titres, ${passes.brut.images} balises <img>` : errors.brut}
  Instable  : ${instable ? `hauteur ${instable.hauteur ? "différente" : "identique"} entre Edge et Chrome, ${instable.images} image(s) d'écart, ${instable.titres} titre(s) d'écart` : "—"}
Rapport : imports/${slug}/verification.json`);
