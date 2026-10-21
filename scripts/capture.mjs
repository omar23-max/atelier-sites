// Capture fidèle d'une page existante, première étape de l'import.
// Usage : npm run capture -- <url> [nom-du-dossier]
//
// Produit dans imports/<nom>/ :
//   desktop.png, mobile.png        captures pleine page (1440 px et 390 px)
//   page.html                      le HTML après exécution des scripts
//   capture.json                   sections détectées + styles réels mesurés
//   sections/NN-desktop.png        capture de chaque section
//   sections/NN-mobile.png
//   sections/NN.html               le HTML de chaque section (référence)
//   images/NN-KK.png               chaque photo d'origine, découpée dans desktop.png
//   images/planche-NN.png          planche numérotée des photos de la section NN
//
// Les photos d'origine servent uniquement de référence dans l'atelier : elles
// ne sont jamais exportées ni publiées.
//
// Rien n'est envoyé nulle part : le navigateur utilisé est Microsoft Edge
// déjà installé sur le PC, piloté en local.
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { cropPhotos } from "./photos.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.argv[2];
if (!url || !/^https?:\/\//.test(url)) {
  console.error("Usage : npm run capture -- https://exemple.com/page [nom-du-dossier]");
  process.exit(1);
}
const slug =
  process.argv[3] ??
  new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-") +
    (new URL(url).pathname.replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "") || "");
const outDir = join(root, "imports", slug);
const sectionsDir = join(outDir, "sections");

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  // Résolution 1 : au-delà de ~16 000 px réels, Chromium répète le haut de la
  // page dans les captures pleine page (limite de texture du navigateur).
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

// Ferme ce qui gêne la capture : popups d'inscription, bandeaux cookies, chats.
async function dismissOverlays(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      const isHeader = el.closest("header, .shopify-section-group-header-group, [class*=announcement]");
      const covers = r.width * r.height > vw * vh * 0.25;
      const looksLikePopup = /klaviyo|popup|modal|cookie|consent|newsletter|chat|intercom|gorgias|tidio|privy|justuno/i.test(
        `${el.id} ${el.className}`,
      );
      if (!isHeader && (covers || looksLikePopup)) el.style.setProperty("display", "none", "important");
    }
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  });
}

// Fait défiler doucement pour déclencher le chargement des images différées.
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(innerHeight * 0.7));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

// S'exécute dans la page : repère les sections et mesure les styles réels.
function measurePage() {
  const round = (n) => Math.round(n);
  const pickStyle = (el) => {
    const cs = getComputedStyle(el);
    return {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      color: cs.color,
    };
  };
  const boxOf = (el) => {
    const cs = getComputedStyle(el);
    let r = el.getBoundingClientRect();
    if (cs.display === "contents" || r.height === 0) {
      const range = document.createRange();
      range.selectNodeContents(el);
      r = range.getBoundingClientRect();
    }
    return { x: round(r.left + scrollX), y: round(r.top + scrollY), width: round(r.width), height: round(r.height) };
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.visibility !== "hidden" && cs.display !== "none" && r.width > 0 && r.height > 0;
  };
  const backgroundOf = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== "none") return { color: cs.backgroundColor, image: cs.backgroundImage.slice(0, 300) };
      if (cs.backgroundColor !== "rgba(0, 0, 0, 0)") return { color: cs.backgroundColor, image: null };
    }
    return { color: getComputedStyle(document.body).backgroundColor, image: null };
  };

  let candidates = [...document.querySelectorAll(".shopify-section")].filter((el) => !el.parentElement.closest(".shopify-section"));
  if (candidates.length === 0) {
    const main = document.querySelector("main") ?? document.body;
    candidates = [
      ...document.querySelectorAll("body > header, body > footer"),
      ...[...main.children].filter((el) => !["SCRIPT", "STYLE", "LINK", "NOSCRIPT"].includes(el.tagName)),
    ];
  }

  const sections = [];
  for (const el of candidates) {
    const box = boxOf(el);
    if (box.height < 8 || box.width < 50) continue;
    const scope = (sel) => [...el.querySelectorAll(sel)].filter(visible);

    const headings = scope("h1, h2, h3, h4, [class*=heading], [class*=title]")
      .filter((h) => h.innerText.trim().length > 0 && h.children.length < 4)
      .slice(0, 12)
      .map((h) => ({ tag: h.tagName.toLowerCase(), text: h.innerText.trim().slice(0, 120), ...pickStyle(h) }));

    const texts = scope("p, li")
      .filter((p) => p.innerText.trim().length > 20)
      .slice(0, 8)
      .map((p) => ({ text: p.innerText.trim().slice(0, 160), ...pickStyle(p) }));

    const buttons = scope("a, button")
      .filter((b) => {
        const cs = getComputedStyle(b);
        return b.innerText.trim() && (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.borderStyle !== "none");
      })
      .slice(0, 8)
      .map((b) => {
        const cs = getComputedStyle(b);
        return {
          text: b.innerText.trim().slice(0, 60),
          ...pickStyle(b),
          background: cs.backgroundColor,
          border: `${cs.borderWidth} ${cs.borderStyle} ${cs.borderColor}`,
          radius: cs.borderRadius,
          padding: cs.padding,
          size: `${round(b.getBoundingClientRect().width)}x${round(b.getBoundingClientRect().height)}`,
        };
      });

    const images = scope("img")
      .slice(0, 30)
      .map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt,
        rendered: `${round(img.getBoundingClientRect().width)}x${round(img.getBoundingClientRect().height)}`,
        natural: `${img.naturalWidth}x${img.naturalHeight}`,
        objectFit: getComputedStyle(img).objectFit,
        radius: getComputedStyle(img).borderRadius,
      }));

    // Photos d'origine : position exacte dans la page, pour les découper
    // ensuite dans la capture (scripts/photos.mjs). Images <img> et fonds CSS.
    const photos = [];
    const seen = new Set();
    for (const n of scope("*")) {
      if (photos.length >= 40) break;
      const cs = getComputedStyle(n);
      const bg = cs.backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];
      const src = n.tagName === "IMG" ? n.currentSrc || n.src : bg;
      if (!src || src.startsWith("data:image/svg")) continue;
      if (n.tagName === "IMG" && n.naturalWidth === 0) continue; // pas encore chargée
      const r = n.getBoundingClientRect();
      // Partie réellement visible : coupée par les parents en overflow hidden
      // (diapos cachées d'un carrousel) ; ignorée si quasi transparente.
      let vis = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      let hidden = false;
      for (let a = n; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (Number(acs.opacity) < 0.15) hidden = true;
        if (a !== n && acs.overflow !== "visible") {
          const ar = a.getBoundingClientRect();
          vis = { l: Math.max(vis.l, ar.left), t: Math.max(vis.t, ar.top), r: Math.min(vis.r, ar.right), b: Math.min(vis.b, ar.bottom) };
        }
      }
      const visibleArea = Math.max(0, vis.r - vis.l) * Math.max(0, vis.b - vis.t);
      if (hidden || visibleArea < r.width * r.height * 0.6) continue;
      const b = { x: round(r.left + scrollX), y: round(r.top + scrollY), width: round(r.width), height: round(r.height) };
      // Pas d'icônes minuscules, pas de copies hors écran (carrousels).
      if (b.width < 24 || b.height < 24 || b.x < -2 || b.x + b.width > innerWidth + 2) continue;
      const key = `${b.x},${b.y},${b.width},${b.height}`;
      if (seen.has(key)) continue;
      seen.add(key);
      photos.push({ kind: n.tagName === "IMG" ? "img" : "fond", src, alt: n.alt ?? "", box: b });
    }

    const videos = scope("video, iframe[src*=youtube], iframe[src*=vimeo]").map((v) => v.currentSrc || v.src);

    // Grilles et rangées : utile pour reproduire la mise en page.
    const layouts = scope("*")
      .filter((n) => {
        const d = getComputedStyle(n).display;
        return (d === "grid" || d === "flex") && n.children.length >= 2 && n.getBoundingClientRect().width > 200;
      })
      .slice(0, 10)
      .map((n) => {
        const cs = getComputedStyle(n);
        return {
          display: cs.display,
          direction: cs.flexDirection,
          columns: cs.gridTemplateColumns,
          gap: cs.gap,
          children: n.children.length,
          width: round(n.getBoundingClientRect().width),
          className: String(n.className).slice(0, 80),
        };
      });

    sections.push({
      index: sections.length,
      id: el.id || null,
      className: String(el.className).slice(0, 160),
      box,
      background: backgroundOf(el.firstElementChild ?? el),
      padding: getComputedStyle(el.firstElementChild ?? el).padding,
      text: el.innerText.replace(/\s+/g, " ").trim().slice(0, 300),
      headings,
      texts,
      buttons,
      images,
      photos,
      videos,
      layouts,
      html: el.outerHTML,
    });
  }

  const fonts = [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`))];
  return {
    title: document.title,
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    pageHeight: document.documentElement.scrollHeight,
    platform: window.Shopify ? { shopify: true, theme: window.Shopify.theme?.schema_name ?? null } : { shopify: false },
    fonts,
    sections,
  };
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await mkdir(sectionsDir, { recursive: true });
  const report = { url, capturedAt: new Date().toISOString(), views: {} };

  for (const [name, options] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ ...options, locale: "en-US" });
    const page = await context.newPage();
    console.log(`→ ${name} : chargement de ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => page.waitForLoadState("load"));
    await page.waitForTimeout(1500);
    await dismissOverlays(page);
    await scrollThrough(page);
    await dismissOverlays(page);

    await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
    const data = await page.evaluate(measurePage);

    for (const s of data.sections) {
      const n = String(s.index).padStart(2, "0");
      const clip = { x: 0, y: s.box.y, width: data.viewport.width, height: Math.min(s.box.height, 6000) };
      await page.screenshot({ path: join(sectionsDir, `${n}-${name}.png`), fullPage: true, clip }).catch(() => {});
      if (name === "desktop") await writeFile(join(sectionsDir, `${n}.html`), s.html, "utf8");
      delete s.html;
    }
    if (name === "desktop") {
      await writeFile(join(outDir, "page.html"), await page.content(), "utf8");
      // Seconde capture pour découper les photos : même mise en page, mais le
      // texte est rendu invisible et les barres flottantes sont retirées, pour
      // qu'une photo de fond soit découpée sans le texte posé dessus.
      await page.addStyleTag({
        content: "*, *::before, *::after { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; }",
      });
      await page.evaluate(() => {
        for (const el of document.querySelectorAll("body *")) {
          if (getComputedStyle(el).position === "fixed") el.style.setProperty("display", "none", "important");
        }
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(outDir, "desktop-photos.png"), fullPage: true });
    }

    report.views[name] = data;
    console.log(`  ${data.sections.length} sections détectées, page de ${data.pageHeight} px.`);
    await context.close();
  }

  await writeFile(join(outDir, "capture.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`\n✓ Capture enregistrée dans imports/${slug}/`);
  // Règle : les photos d'origine sont toujours découpées dans la capture.
  await cropPhotos(browser, slug);
  for (const s of report.views.desktop.sections) {
    console.log(`  ${String(s.index).padStart(2, "0")}  ${s.box.height}px  ${s.text.slice(0, 70)}`);
  }
} finally {
  await browser.close();
}
