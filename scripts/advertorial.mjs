// Recopie entière d'un advertorial (ou listicle, presell) : la page n'est pas
// découpée en sections du catalogue, elle est relevée élément par élément, dans
// l'ordre (titres, paragraphes, images, listes, boutons), avec ses styles réels.
// Usage : npm run advertorial -- <url> <nom-du-dossier>
//
// Produit dans imports/<nom>/ :
//   desktop.png, mobile.png    captures pleine page (1440 px et 390 px)
//   page.html                  le HTML après exécution des scripts
//   advertorial.json           les éléments dans l'ordre + styles + couleurs
//   images/NN.png              chaque photo, découpée dans la page (texte masqué)
//
// Les textes d'origine restent dans advertorial.json comme référence locale ;
// la page de l'atelier ne garde que des briefs (npm run advertorial:page).
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { PROPS, TEXT_PROPS, snapshotDesktop, snapshotMobile, snapshotMobileByPath } from "./lib/snapshot.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [url, slug] = process.argv.slice(2);
if (!url || !/^https?:\/\//.test(url) || !slug) {
  console.error("Usage : npm run advertorial -- https://exemple.com/page nom-du-dossier");
  process.exit(1);
}
const outDir = join(root, "imports", slug);
const imagesDir = join(outDir, "images");
// Au-delà, Chromium répète le haut de la page dans les captures pleine page.
const MAX_SHOT = 15000;

async function dismissOverlays(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const looksLikePopup = /klaviyo|popup|modal|cookie|consent|newsletter|chat|intercom|gorgias|tidio|privy|justuno|exit-?intent/i.test(
        `${el.id} ${typeof el.className === "string" ? el.className : ""}`,
      );
      if (cs.position === "fixed" || cs.position === "sticky") {
        const covers = r.width * r.height > vw * vh * 0.25;
        if (covers || looksLikePopup || r.top > vh * 0.5) el.style.setProperty("display", "none", "important");
      } else if (looksLikePopup && cs.position === "absolute" && r.width * r.height > vw * vh * 0.25) {
        el.style.setProperty("display", "none", "important");
      }
    }
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  });
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(innerHeight * 0.7));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);
}

// Polices web de la page (@font-face), adresses rendues absolues.
async function fontFaces(page) {
  const sheets = await page.evaluate(() =>
    [...document.styleSheets].map((sh) => {
      try {
        return { href: sh.href ?? location.href, css: [...sh.cssRules].map((r) => r.cssText).join("\n") };
      } catch {
        return { href: sh.href, css: null };
      }
    }),
  );
  const out = [];
  for (const sh of sheets) {
    let css = sh.css;
    if (css == null && sh.href) css = await page.request.get(sh.href, { timeout: 15000 }).then((r) => r.text()).catch(() => "");
    for (const face of (css ?? "").match(/@font-face\s*{[^}]*}/g) ?? []) {
      out.push(
        face.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
          try {
            return `url("${new URL(u, sh.href).href}")`;
          } catch {
            return m;
          }
        }),
      );
    }
  }
  return [...new Set(out)].join("\n");
}

// S'exécute dans la page : relève les éléments de l'article dans l'ordre.
function extract() {
  const TRANSPARENT = (c) => !c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
  const round = (n) => Math.round(n);
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05 && r.width > 1 && r.height > 1;
  };
  const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const clean = (t) => t.replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.left + scrollX), y: round(r.top + scrollY), width: round(r.width), height: round(r.height) };
  };
  const bgOf = (el) => bgHolder(el).color;
  // Élément qui porte le fond visible derrière el (et sa boîte : bandeau pleine largeur ?).
  const bgHolder = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (!TRANSPARENT(c)) return { color: c, box: boxOf(n) };
    }
    return { color: "rgb(255, 255, 255)", box: null };
  };
  const styleOf = (el) => {
    const cs = getComputedStyle(el);
    return {
      fontFamily: cs.fontFamily,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: Number(cs.fontWeight) || 400,
      fontStyle: cs.fontStyle,
      lineHeight: cs.lineHeight,
      color: cs.color,
      textAlign: cs.textAlign,
      background: bgOf(el),
      bgBox: bgHolder(el).box,
      ownBackground: TRANSPARENT(cs.backgroundColor) ? null : cs.backgroundColor,
      borderRadius: cs.borderRadius,
      textTransform: cs.textTransform,
    };
  };
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME", "svg", "SVG", "LINK", "META", "SELECT", "INPUT", "TEXTAREA", "FORM"]);
  const BLOCK_TAGS = /^(DIV|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|MAIN|NAV|P|H[1-6]|UL|OL|LI|TABLE|FIGURE|BLOCKQUOTE|PICTURE|VIDEO|IMG)$/;
  const isButtonLike = (el) => {
    if (!["A", "BUTTON"].includes(el.tagName)) return false;
    const cs = getComputedStyle(el);
    const t = el.innerText.trim();
    const padded = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) >= 10;
    const filled = !TRANSPARENT(cs.backgroundColor) || /gradient/.test(cs.backgroundImage) || parseFloat(cs.borderTopWidth) >= 2;
    return t.length > 0 && t.length < 120 && padded && filled;
  };
  const hasBlockChild = (el) =>
    [...el.children].some((c) => {
      if (!visible(c)) return false;
      const d = getComputedStyle(c).display;
      return BLOCK_TAGS.test(c.tagName) && !["inline", "inline-block", "contents"].includes(d)
        ? true
        : c.tagName === "IMG" && c.getBoundingClientRect().width >= 100;
    });
  const directText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const items = [];
  let imageIndex = 0;
  const pushImage = (el, kind = "image") => {
    const box = boxOf(el);
    if (box.width < 30 || box.height < 30) return false;
    imageIndex += 1;
    el.setAttribute("data-atl-old", String(imageIndex));
    const holder = bgHolder(el.parentElement ?? el);
    items.push({ kind, image: imageIndex, box, src: el.currentSrc || el.src || el.poster || null, alt: el.alt ?? "", style: { background: holder.color, bgBox: holder.box } });
    return true;
  };
  const pushText = (el, kind, extra = {}) => {
    const text = clean(el.innerText);
    if (!text) return;
    const link = el.closest("a")?.href ?? el.querySelector?.("a")?.href ?? null;
    items.push({ kind, text, words: words(text), style: styleOf(el), box: boxOf(el), link, ...extra });
  };

  // Menu, en-tête et pied de page du thème d'une boutique Shopify : la page
  // d'achat garde ceux de la boutique, l'article ne les recopie pas.
  const CHROME = window.Shopify
    ? "nav, header, footer, .shopify-section-group-header-group, .shopify-section-group-footer-group, [id*=announcement], [class*=announcement]"
    : "nav";
  function walk(el) {
    for (const c of el.children) {
      if (SKIP.has(c.tagName) || c.matches(CHROME)) continue;
      const tag = c.tagName;
      if (!visible(c)) {
        // Conteneur de taille nulle aux enfants positionnés (Unbounce…) : on descend.
        const cs = getComputedStyle(c);
        if (c.children.length && cs.display !== "none" && cs.visibility !== "hidden") walk(c);
        continue;
      }
      if (isButtonLike(c)) {
        pushText(c, "bouton", { link: c.href ?? c.closest("a")?.href ?? null });
        continue;
      }
      if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS") {
        pushImage(c);
        continue;
      }
      if (/^H[1-6]$/.test(tag)) {
        if (c.querySelector("img")) {
          walk(c);
          continue;
        }
        pushText(c, tag === "H1" ? "titre" : "intertitre", { level: Number(tag[1]) });
        continue;
      }
      if (tag === "UL" || tag === "OL") {
        const lis = [...c.children].filter((li) => li.tagName === "LI" && visible(li));
        const simple = lis.length > 0 && lis.every((li) => !li.querySelector("img, h1, h2, h3, ul, ol, table") && li.innerText.trim().length < 500);
        if (simple) {
          const text = lis.map((li) => clean(li.innerText).replace(/\n+/g, " ")).filter(Boolean).join("\n");
          if (text) items.push({ kind: "liste", text, words: words(text), points: lis.length, style: styleOf(c), box: boxOf(c) });
          continue;
        }
        walk(c);
        continue;
      }
      if (tag === "BLOCKQUOTE" && !c.querySelector("img")) {
        pushText(c, "citation");
        continue;
      }
      if (tag === "HR") {
        items.push({ kind: "separateur", box: boxOf(c) });
        continue;
      }
      // Fond en image sans texte : une photo.
      const cs = getComputedStyle(c);
      if (cs.backgroundImage.startsWith("url(") && !c.innerText.trim() && c.children.length === 0) {
        pushImage(c, "image");
        continue;
      }
      // Bloc de texte : du texte direct, ou seulement des enfants en ligne.
      if (c.innerText.trim() && !hasBlockChild(c) && (directText(c) || tag === "P" || c.children.length > 0)) {
        pushText(c, "paragraphe");
        for (const img of c.querySelectorAll("img")) if (visible(img)) pushImage(img);
        continue;
      }
      walk(c);
    }
  }
  walk(document.body);

  // Page en positions absolues (Unbounce) : l'ordre du code n'est pas l'ordre affiché.
  if (document.querySelector(".lp-pom-root")) items.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  // Fragments posés sur une même ligne (compte à rebours, prix barré) : un seul élément.
  for (let i = items.length - 1; i > 0; i--) {
    const a = items[i - 1];
    const b = items[i];
    if (a.kind === "paragraphe" && b.kind === "paragraphe" && b.words <= 3 && Math.abs(a.box.y - b.box.y) < 12 && a.box.height < 80) {
      a.text = `${a.text} ${b.text}`;
      a.words += b.words;
      a.box.width = b.box.x + b.box.width - a.box.x;
      items.splice(i, 1);
    }
  }

  // Taille du texte courant = la plus fréquente parmi les paragraphes (pondérée par les mots).
  const weight = new Map();
  for (const it of items) if (it.kind === "paragraphe") weight.set(it.style.fontSize, (weight.get(it.style.fontSize) ?? 0) + it.words);
  const bodySize = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 16;
  const bodyItems = items.filter((it) => it.kind === "paragraphe" && it.style.fontSize === bodySize);
  const pick = (list, key) => {
    const m = new Map();
    for (const it of list) m.set(it.style[key], (m.get(it.style[key]) ?? 0) + (it.words ?? 1));
    return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  // Paragraphe nettement plus grand et court : un intertitre écrit en <div>.
  for (const it of items) {
    if (it.kind === "paragraphe" && it.style.fontSize >= bodySize * 1.3 && it.words <= 30) it.kind = it.style.fontSize >= bodySize * 1.9 ? "titre" : "intertitre";
  }
  const widths = bodyItems.map((it) => it.box.width).sort((a, b) => a - b);
  const columnWidth = widths[Math.floor(widths.length / 2)] ?? 720;
  const headings = items.filter((it) => it.kind === "intertitre");
  const buttons = items.filter((it) => it.kind === "bouton");

  return {
    title: document.title,
    h1: items.find((it) => it.kind === "titre")?.text ?? null,
    pageHeight: document.documentElement.scrollHeight,
    textLength: document.body.innerText.trim().length,
    design: {
      bodyFont: pick(bodyItems, "fontFamily"),
      bodySize,
      bodyColor: pick(bodyItems, "color"),
      pageBackground: pick(bodyItems, "background"),
      headingFont: pick(items.filter((it) => it.kind === "titre" || it.kind === "intertitre"), "fontFamily"),
      headingColor: pick(headings.length ? headings : items.filter((it) => it.kind === "titre"), "color"),
      titleSize: Math.max(0, ...items.filter((it) => it.kind === "titre").map((it) => it.style.fontSize)),
      subtitleSize: pick(headings, "fontSize"),
      linkColor: (() => {
        const a = [...document.querySelectorAll("p a, li a")].find((x) => visible(x));
        return a ? getComputedStyle(a).color : null;
      })(),
      buttonColor: pick(buttons, "ownBackground"),
      buttonTextColor: pick(buttons, "color"),
      buttonRadius: buttons[0]?.style.borderRadius ?? null,
      columnWidth,
    },
    links: [...new Set(buttons.map((b) => b.link).filter(Boolean))],
    items,
  };
}

await mkdir(imagesDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const report = { url, slug, capturedAt: new Date().toISOString().slice(0, 10) };
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "en-US" });
  const page = await ctx.newPage();
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
  if (!res) await page.waitForLoadState("load").catch(() => {});
  report.status = res?.status() ?? null;
  report.finalUrl = page.url();
  await page.waitForTimeout(1500);
  await dismissOverlays(page);
  await scrollThrough(page);
  await dismissOverlays(page);

  Object.assign(report, await page.evaluate(extract));
  const gone = (report.status && report.status >= 400) || report.textLength < 400 || /404|not found|page introuvable/i.test(report.title ?? "");
  report.disparue = Boolean(gone);

  const height = Math.min(report.pageHeight, MAX_SHOT);
  await page.screenshot({ path: join(outDir, "desktop.png"), clip: { x: 0, y: 0, width: 1440, height }, fullPage: true });
  await writeFile(join(outDir, "page.html"), await page.content(), "utf8");

  // Structure et styles réels, en ordinateur puis en mobile (mêmes éléments) :
  // la copie modifiable garde ainsi le design d'origine (lib/copie.mjs).
  const chromeSelector = await page.evaluate(() =>
    window.Shopify
      ? "nav, header, footer, .shopify-section-group-header-group, .shopify-section-group-footer-group, [id*=announcement], [class*=announcement]"
      : "nav",
  );
  // ATL_GARDER_MENU=1 : la page est une section seule (Whitelabeler), son menu compris.
  const snap = await page.evaluate(snapshotDesktop, { props: PROPS, chromeSelector: process.env.ATL_GARDER_MENU ? "atl-aucun" : chromeSelector, textProps: TEXT_PROPS });
  snap.fonts = await fontFaces(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await scrollThrough(page);
  snap.mobile = await page.evaluate(snapshotMobile, { props: PROPS, textProps: TEXT_PROPS });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1200);
  await scrollThrough(page);

  // Photos : texte rendu transparent, puis chaque image découpée à sa place.
  await page.addStyleTag({ content: "* { color: transparent !important; text-shadow: none !important; }" });
  let cut = 0;
  snap.files = {};
  for (let k = 1; k <= snap.images; k++) {
    const file = `${String(k).padStart(2, "0")}.png`;
    try {
      const loc = page.locator(`[data-atl-img="${k}"]`).first();
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
      await page.waitForTimeout(80);
      await loc.screenshot({ path: join(imagesDir, file), timeout: 8000 });
      snap.files[k] = `/imports/${slug}/images/${file}`;
      cut += 1;
    } catch {
      // image masquée ou hors écran : son emplacement restera vide
    }
  }
  report.photos = cut;
  await ctx.close();

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "en-US" });
  const m = await mctx.newPage();
  await m.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await m.waitForTimeout(1200);
  await dismissOverlays(m);
  await scrollThrough(m);
  await dismissOverlays(m);
  // Styles mobile relevés sur la page chargée en mobile (certains sites,
  // comme Unbounce, choisissent leur mise en page mobile au chargement) :
  // chaque élément est retrouvé par sa place dans la page. À défaut, on garde
  // la valeur relevée en rétrécissant la fenêtre.
  const targets = snap.nodes.map((n) => ({ id: n.id, tag: n.tag, path: n.path, domPath: n.domPath ?? null, leaf: n.text != null }));
  const fresh = await m.evaluate(snapshotMobileByPath, { props: PROPS, textProps: TEXT_PROPS, targets });
  const found = Object.keys(fresh).length;
  for (const [id, styles] of Object.entries(fresh)) snap.mobile[id] = styles;
  report.mobileRetrouves = `${found}/${snap.nodes.length}`;
  const mh = Math.min(await m.evaluate(() => document.documentElement.scrollHeight), MAX_SHOT);
  await m.screenshot({ path: join(outDir, "mobile.png"), clip: { x: 0, y: 0, width: 390, height: mh }, fullPage: true });
  await mctx.close();

  // Tablette (1024 px), chargée directement à cette largeur : la copie a ainsi
  // trois paliers (ordinateur, tablette 750-1199 px, mobile < 750 px).
  const tctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, locale: "en-US" });
  const tp = await tctx.newPage();
  await tp.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await tp.waitForTimeout(1200);
  await dismissOverlays(tp);
  await scrollThrough(tp);
  await dismissOverlays(tp);
  snap.tablet = await tp.evaluate(snapshotMobileByPath, { props: PROPS, textProps: TEXT_PROPS, targets });
  report.tabletteRetrouves = `${Object.keys(snap.tablet).length}/${snap.nodes.length}`;
  await tctx.close();
  await writeFile(join(outDir, "snapshot.json"), JSON.stringify(snap), "utf8");
} catch (error) {
  report.error = String(error?.message ?? error).slice(0, 400);
  report.disparue = report.disparue ?? true;
} finally {
  await browser.close();
}
await writeFile(join(outDir, "advertorial.json"), JSON.stringify(report, null, 2), "utf8");
const n = report.items?.length ?? 0;
console.log(`${report.disparue ? "✗ disparue ou vide" : "✓"} ${slug} : ${n} éléments, ${report.photos ?? 0} photos${report.error ? ` — ${report.error}` : ""}`);
