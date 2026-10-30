// Import d'une page déjà reproduite par Kimi (application React + Vite) : on
// garde SON HTML, SES classes et SON CSS, sans rien mesurer ni recopier.
// Usage : node scripts/kimi-import.mjs <dossier app Kimi> <nom> [--label "Marque"]
//
// Le dossier doit être compilé (dist/) : npm install --ignore-scripts puis
// npx vite build (le lockfile de Kimi pointe parfois vers leur miroir npm
// privé : remplacer https://npm.mirrors.msh.team/ par https://registry.npmjs.org/).
//
// 1. La page compilée est ouverte dans Edge (1440 px).
// 2. Chaque bouton est cliqué une fois pour apprendre ce qu'il fait : ouvrir/
//    fermer (classes, éléments ajoutés ou retirés), choisir une option,
//    faire défiler un carrousel, aller à une ancre, ouvrir une fenêtre
//    (panier, menu) — ce dernier devient un lien modifiable.
// 3. Chaque <section> de Kimi devient une ou plusieurs sections de l'atelier
//    (50 blocs au plus par section Shopify) : textes, images et liens sont des
//    éléments modifiables, comme dans les copies (sections/<nom>-pN).
// 4. Le CSS de Kimi est gardé tel quel, rangé sous la classe de la page et
//    réduit, pour chaque section, aux règles qui y servent.
// Un petit script remplace React sur la page publiée (boutons appris,
// carrousels) ; les blocs coupés entre sections y sont recollés (data-atl-suite / data-atl-col).
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [appArg, slug] = process.argv.slice(2);
if (!appArg || !slug) {
  console.error("Usage : node scripts/kimi-import.mjs <dossier app Kimi> <nom>");
  process.exit(1);
}
const labelArg = process.argv.includes("--label") ? process.argv[process.argv.indexOf("--label") + 1] : null;
const app = resolve(appArg);
const dist = join(app, "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error(`✗ ${dist}\\index.html introuvable : compile d'abord le projet Kimi (npx vite build).`);
  process.exit(1);
}
const MAX_SLOTS = 45; // Shopify : 50 blocs au plus par section
const scope = `atl-${slug}`;
const assetBase = `/imports/${slug}/assets/`;

// ---- Serveur local de la page compilée ----
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".mp4": "video/mp4" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = join(dist, path);
  if (!file.startsWith(dist) || !existsSync(file) || path.endsWith("/")) file = join(dist, "index.html");
  try {
    res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// Rien ne sort de la machine : seules les adresses du serveur local répondent.
await page.route("**/*", (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));

async function open() {
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  // Chaque élément reçoit un numéro stable (ordre du document).
  await page.evaluate(() => {
    let k = 0;
    for (const el of document.querySelectorAll("body *")) el.setAttribute("data-atl-k", String(k++));
    window.__atlNext = k;
  });
}

// ---- Dans la page : état des éléments, règles CSS utilisées ----
const TOOLS = () => {
  const ATTRS = ["class", "style", "aria-expanded", "aria-pressed", "aria-checked", "aria-selected", "open"];
  window.__atlState = () => {
    const out = {};
    for (const el of document.querySelectorAll("[data-atl-k]")) {
      const o = {};
      for (const a of ATTRS) o[a] = el.getAttribute(a);
      out[el.getAttribute("data-atl-k")] = o;
    }
    return { els: out, y: window.scrollY };
  };
  // Règles CSS (feuilles de la page, dans l'ordre) : numéros des éléments
  // qu'elles touchent dans l'état actuel. Les pseudo-classes (:hover…) et
  // pseudo-éléments sont retirés pour le test.
  window.__atlRules = () => {
    const list = [];
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && !(r instanceof CSSStyleRule)) walk(r.cssRules);
        else if (r instanceof CSSStyleRule) list.push(r);
        if (r instanceof CSSStyleRule && r.cssRules?.length) walk(r.cssRules);
      }
    };
    for (const s of document.styleSheets) {
      try {
        walk(s.cssRules);
      } catch {}
    }
    return list;
  };
  window.__atlMatch = (acc) => {
    window.__atlRules().forEach((r, i) => {
      const keys = (acc[i] ??= []);
      if (keys === "all") return;
      const sel = r.selectorText
        .split(",")
        .map((s) => s.replace(/::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g, (m) => (/^:(not|is|where|has)\(/.test(m) ? m : "")).trim() || "*")
        .join(",");
      let els;
      try {
        els = document.querySelectorAll(sel);
      } catch {
        acc[i] = "all";
        return;
      }
      const seen = new Set(keys);
      for (const el of els) {
        const k = el.getAttribute("data-atl-k");
        if (k != null && !seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    });
    return acc;
  };
};

// ---- 1. Apprendre ce que fait chaque bouton ----
await open();
await page.evaluate(TOOLS);
const initial = await page.evaluate(() => window.__atlState());
let ruleUse = await page.evaluate(() => window.__atlMatch({}));
const buttons = await page.evaluate(() =>
  [...document.querySelectorAll("button, [role=button], summary")]
    .filter((b) => b.getClientRects().length && !b.closest("[role=dialog]") && b.type !== "submit")
    .map((b) => ({ k: b.getAttribute("data-atl-k"), label: b.getAttribute("aria-label") ?? "", text: b.innerText.trim().slice(0, 60) })),
);
// Flèches « précédent » en dernier : au départ, le carrousel est déjà au début.
const isPrev = (b) => /prev|précédent/i.test(`${b.label} ${b.text}`);
buttons.sort((a, b) => isPrev(a) - isPrev(b));

const inserts = []; // { k, parent, before, html } : éléments que React ajoute à l'ouverture
const insertKey = new Map();
const diffOf = (a, b) => {
  const changed = {};
  for (const k of new Set([...Object.keys(a.els), ...Object.keys(b.els)])) {
    const x = a.els[k];
    const y = b.els[k];
    if (!x || !y) changed[k] = { h: !y };
    else if (JSON.stringify(x) !== JSON.stringify(y)) changed[k] = y;
  }
  return changed;
};

// Attend que la page ne bouge plus (un carrousel encore en mouvement après le
// clic précédent serait pris pour l'effet du clic suivant).
async function settle() {
  let prev = "";
  for (let i = 0; i < 20; i++) {
    const now = await page.evaluate(() => JSON.stringify(window.__atlState().els));
    if (now === prev) return;
    prev = now;
    await page.waitForTimeout(250);
  }
}

async function clickAndWatch(k) {
  await settle();
  const before = await page.evaluate(() => window.__atlState());
  // Éléments ajoutés par le clic : numérotés (le même ajout garde son numéro).
  await page.evaluate(() => {
    window.__atlAdded = [];
    window.__atlObs?.disconnect();
    window.__atlObs = new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.hasAttribute("data-atl-k")) window.__atlAdded.push(n);
    });
    window.__atlObs.observe(document.body, { childList: true, subtree: true });
  });
  const dialogBefore = await page.evaluate(() => document.querySelectorAll("[role=dialog]").length);
  await page.evaluate((k) => document.querySelector(`[data-atl-k="${k}"]`)?.click(), k);
  await page.waitForTimeout(700);
  const added = await page.evaluate(() =>
    window.__atlAdded
      .filter((n) => n.isConnected && !n.parentElement.closest("[data-atl-new]"))
      .map((n) => {
        n.setAttribute("data-atl-new", "");
        const before = n.nextElementSibling?.getAttribute("data-atl-k") ?? null;
        return { parent: n.parentElement.getAttribute("data-atl-k"), before, html: n.outerHTML, dialog: Boolean(n.matches("[role=dialog]") || n.querySelector("[role=dialog]")) };
      }),
  );
  const dialog = (await page.evaluate(() => document.querySelectorAll("[role=dialog]").length)) > dialogBefore || added.some((a) => a.dialog);
  // Numéros des ajouts (hors fenêtres) : réutilisés si le même élément revient.
  for (const a of added.filter((a) => !a.dialog)) {
    const sig = `${a.parent}|${a.before}|${a.html.replace(/\s*data-atl-new=""/g, "")}`;
    let key = insertKey.get(sig);
    if (!key) {
      key = String(await page.evaluate(() => window.__atlNext++));
      insertKey.set(sig, key);
      inserts.push({ k: key, parent: a.parent, before: a.before, html: a.html.replace(/\s*data-atl-new=""/g, "") });
    }
    await page.evaluate(
      ({ html, key }) => {
        const n = [...document.querySelectorAll("[data-atl-new]")].find((x) => x.outerHTML.replace(/\s*data-atl-new=""/g, "") === html);
        if (!n) return;
        n.removeAttribute("data-atl-new");
        n.setAttribute("data-atl-k", key);
        let i = 0;
        for (const c of n.querySelectorAll("*")) c.setAttribute("data-atl-k", `${key}_${i++}`);
      },
      { html: a.html.replace(/\s*data-atl-new=""/g, ""), key },
    );
  }
  const after = await page.evaluate(() => window.__atlState());
  return { before, after, dialog };
}

const recipes = {}; // numéro du bouton → { t, st, car, link }
const transformOf = (s, k) => (s.els[k]?.style ?? "").match(/transform:\s*([^;]+)/)?.[1] ?? "";
for (const b of buttons) {
  const exists = await page.evaluate((k) => Boolean(document.querySelector(`[data-atl-k="${k}"]`)?.getClientRects().length), b.k);
  if (!exists) continue;
  // Flèche « précédent / suivant » : liée sans clic à la piste la plus proche
  // (un carrousel déjà au bout ne bougerait pas). Piste = bloc qui cache ce
  // qui dépasse, dont l'unique enfant aligne des diapos plus larges que lui.
  const arrow = /prev|précédent|next|suivant/i.exec(`${b.label} ${b.text}`);
  if (arrow) {
    const track = await page.evaluate((k) => {
      // Recherche limitée à la section de la flèche ; la plus grande piste
      // d'abord (galerie principale plutôt que ses miniatures).
      const isTrack = (e) => {
        // Un badge posé par-dessus (position absolue) ne compte pas.
        const kids = [...e.children].filter((x) => !/absolute|fixed/.test(getComputedStyle(x).position));
        const c = kids[0];
        return c && kids.length === 1 && getComputedStyle(c).display.includes("flex") && c.children.length > 1 && e.clientWidth > 0;
      };
      const btn = document.querySelector(`[data-atl-k="${k}"]`);
      const limit = btn.closest("main > *, section, footer, header") ?? document.body;
      const ts = [...limit.querySelectorAll("[data-atl-k]")].filter(isTrack);
      ts.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
      return ts[0]?.getAttribute("data-atl-k") ?? null;
    }, b.k);
    if (track) {
      recipes[b.k] = { t: "car", car: [{ track, dir: /prev|précédent/i.test(arrow[0]) ? -1 : 1, index: null }], aff: [] };
      continue;
    }
  }
  const { before, after, dialog } = await clickAndWatch(b.k);
  if (dialog) {
    // Fenêtre (panier, menu, information) : fermée, le bouton devient un lien.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    recipes[b.k] = { t: "lien", link: /cart|panier/i.test(b.text + b.label) ? "/cart" : "" };
    continue;
  }
  const d = diffOf(before, after);
  // Carrousel : la piste (Embla) se déplace par transform.
  // Seules comptent les pistes proches du bouton (même bloc, 6 niveaux au plus).
  const moved = await page.evaluate(
    ({ keys, btn }) => {
      const b = document.querySelector(`[data-atl-k="${btn}"]`);
      let zone = b;
      for (let i = 0; i < 6 && zone?.parentElement; i++) zone = zone.parentElement;
      return keys.filter((k) => zone?.contains(document.querySelector(`[data-atl-k="${k}"]`)));
    },
    { keys: Object.keys(d).filter((k) => transformOf(before, k) !== transformOf(after, k)), btn: b.k },
  );
  for (const k of Object.keys(d)) if (transformOf(before, k) !== transformOf(after, k) && !moved.includes(k)) delete d[k];
  if (moved.length) {
    const lab = `${b.label} ${b.text}`;
    const dir = /prev|précédent|gauche|left/i.test(lab) ? -1 : /next|suivant|droite|right/i.test(lab) ? 1 : 0;
    // Piste = parent du conteneur déplacé ; diapo visible = celle dont la
    // position compense le décalage (miniature, point : aller à cette diapo).
    const car = await page.evaluate(
      ({ keys, dir }) =>
        keys.map((k) => {
          const c = document.querySelector(`[data-atl-k="${k}"]`);
          const x = new DOMMatrix(getComputedStyle(c).transform).m41;
          const kids = [...c.children];
          let index = 0;
          kids.forEach((s, i) => {
            if (Math.abs(s.offsetLeft + x) < Math.abs(kids[index].offsetLeft + x)) index = i;
          });
          return { track: c.parentElement.getAttribute("data-atl-k"), dir, index: dir ? null : index };
        }),
      { keys: moved, dir },
    );
    moved.forEach((k) => delete d[k]);
    recipes[b.k] = { t: "car", car, aff: Object.keys(d).filter((k) => !d[k].h) };
    continue;
  }
  if (Math.abs(after.y - before.y) > 40 && !Object.keys(d).length) {
    const id = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].filter((e) => e.id !== "root" && e.getBoundingClientRect().height > 0);
      ids.sort((a, b) => Math.abs(a.getBoundingClientRect().top) - Math.abs(b.getBoundingClientRect().top));
      return ids[0]?.id ?? "";
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    recipes[b.k] = { t: "lien", link: id ? `#${id}` : "" };
    continue;
  }
  if (!Object.keys(d).length) {
    recipes[b.k] = { t: "vide" };
    continue;
  }
  // Deuxième clic : retour à l'état d'avant → interrupteur, sinon choix.
  const second = await clickAndWatch(b.k);
  const back = diffOf(before, second.after);
  const reverted = Object.keys(d).every((k) => !(k in back) || (d[k].h && back[k]?.h === undefined));
  recipes[b.k] = { t: reverted ? "bascule" : "choix", aff: Object.keys(d) };
  ruleUse = await page.evaluate((acc) => window.__atlMatch(acc), ruleUse);
}

// Choix : un groupe = boutons dont les éléments touchés se recoupent. Chaque
// bouton du groupe reçoit l'état complet de tous ces éléments après son clic.
const choices = Object.keys(recipes).filter((k) => ["choix", "bascule", "car"].includes(recipes[k].t));
const groups = [];
for (const k of choices.filter((k) => recipes[k].t === "choix" || (recipes[k].t === "car" && recipes[k].aff.length))) {
  const aff = new Set(recipes[k].aff);
  const g = groups.find((g) => [...aff].some((x) => g.aff.has(x)));
  if (g) {
    g.keys.push(k);
    aff.forEach((x) => g.aff.add(x));
  } else groups.push({ keys: [k], aff });
}
const pick = (state, keys) => Object.fromEntries(keys.map((k) => [k, state.els[k] ? state.els[k] : { h: true }]));
for (const g of groups) {
  // Un groupe de choix comprend aussi les boutons voisins restés « vides »
  // (l'option déjà choisie au départ).
  for (const k of g.keys) {
    const { after } = await clickAndWatch(k);
    recipes[k].st = [pick(after, [...g.aff])];
    ruleUse = await page.evaluate((acc) => window.__atlMatch(acc), ruleUse);
  }
  for (const k of Object.keys(recipes).filter((k) => recipes[k].t === "vide")) {
    const sib = await page.evaluate(
      ({ k, others }) => {
        const el = document.querySelector(`[data-atl-k="${k}"]`);
        return others.some((o) => document.querySelector(`[data-atl-k="${o}"]`)?.parentElement === el?.parentElement);
      },
      { k, others: g.keys },
    );
    if (!sib) continue;
    const { after } = await clickAndWatch(k);
    recipes[k] = { t: "choix", st: [pick(after, [...g.aff])] };
    g.keys.push(k);
  }
  // Retour à l'option de départ.
  const start = g.keys.find((k) => recipes[k].st && Object.entries(recipes[k].st[0]).every(([x, v]) => JSON.stringify(v) === JSON.stringify(initial.els[x] ?? { h: true })));
  if (start) await clickAndWatch(start);
}
for (const k of Object.keys(recipes).filter((k) => recipes[k].t === "bascule")) {
  const open1 = await clickAndWatch(k);
  ruleUse = await page.evaluate((acc) => window.__atlMatch(acc), ruleUse);
  const close1 = await clickAndWatch(k);
  const aff = [...new Set([...recipes[k].aff, ...Object.keys(diffOf(open1.before, open1.after))])];
  recipes[k].st = [pick(open1.after, aff), pick(close1.after, aff)];
}

// ---- 2. Page de départ + éléments ajoutés (cachés), puis découpe ----
await open();
await page.evaluate(TOOLS);
await page.evaluate((inserts) => {
  for (const ins of inserts) {
    const parent = document.querySelector(`[data-atl-k="${ins.parent}"]`);
    if (!parent) continue;
    const t = document.createElement("template");
    t.innerHTML = ins.html;
    const n = t.content.firstElementChild;
    n.setAttribute("data-atl-k", ins.k);
    let i = 0;
    for (const c of n.querySelectorAll("*")) c.setAttribute("data-atl-k", `${ins.k}_${i++}`);
    n.setAttribute("data-atl-h", "");
    parent.insertBefore(n, ins.before ? document.querySelector(`[data-atl-k="${ins.before}"]`) : null);
  }
}, inserts);
ruleUse = await page.evaluate((acc) => window.__atlMatch(acc), ruleUse);

// Éléments à garder numérotés dans le HTML (boutons appris et éléments qu'ils changent).
const keep = new Set();
const tracks = new Set();
for (const [k, r] of Object.entries(recipes)) {
  if (r.t === "vide") continue;
  keep.add(k);
  for (const st of r.st ?? []) Object.keys(st).forEach((x) => keep.add(x));
  for (const c of r.car ?? []) {
    tracks.add(c.track);
    keep.add(c.track);
  }
}
for (const ins of inserts) keep.add(ins.k);

const built = await page.evaluate(
  ({ recipes, keep, tracks, MAX_SLOTS, origin, assetBase }) => {
    const INLINE = new Set(["SPAN", "EM", "STRONG", "B", "I", "U", "DEL", "S", "SMALL", "SUP", "SUB", "BR", "MARK", "ABBR", "CODE"]);
    const keepSet = new Set(keep);
    const trackSet = new Set(tracks);
    const kOf = (el) => el.getAttribute("data-atl-k");
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const attrEsc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const asset = (u) => {
      try {
        const url = new URL(u, document.baseURI);
        if (url.origin !== origin) return u;
        // Fichiers de la page (images, polices) : copiés dans imports/<nom>/assets ;
        // les autres adresses du site (« / », « #avis ») restent telles quelles.
        if (!/\.[a-z0-9]{2,5}$/i.test(url.pathname)) return url.pathname + url.search + url.hash;
        return assetBase + url.pathname.replace(/^\/(assets\/)?/, "");
      } catch {
        return u;
      }
    };
    // Feuille de texte : texte et mise en forme en ligne seulement.
    const isLeaf = (el) => el.textContent.trim() && [...el.querySelectorAll("*")].every((c) => INLINE.has(c.tagName) && !c.matches("svg *"));
    // Élément qui mélange un texte direct et des icônes (bouton « Ingrédients ⌄ »).
    const mixedText = (el) => {
      const runs = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      return runs.length === 1 && [...el.children].every((c) => c.tagName === "svg" || c.tagName === "IMG" || !c.textContent.trim()) ? runs[0] : null;
    };
    const slotsOf = (el) => {
      let n = 0;
      const seen = new Set();
      const walk = (e) => {
        if (e.tagName === "svg") return;
        if (e.tagName === "IMG") {
          if (!seen.has(e.src)) n++;
          seen.add(e.src);
          return;
        }
        if (e.tagName === "A" && e.getAttribute("href") && !isLeaf(e)) n++;
        if (isLeaf(e)) {
          n++;
          return;
        }
        if (mixedText(e)) n++;
        for (const c of e.children) walk(c);
      };
      walk(el);
      return n;
    };

    // Unités : ce qui précède <main>, chaque enfant de <main>, ce qui suit.
    const shell = document.querySelector("#root")?.firstElementChild ?? document.body;
    const main = shell.querySelector(":scope > main");
    const units = [];
    let pre = [];
    let post = [];
    for (const c of shell.children) {
      if (c === main) continue;
      if (c.matches("[role=dialog], .skip-link, .sr-only") || c.getClientRects().length === 0) continue;
      (main && c.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING ? pre : post).push(c);
    }
    if (pre.length) units.push({ chain: [shell], els: pre });
    if (main) for (const c of main.children) units.push({ chain: [shell, main], els: [c] });
    if (post.length) units.push({ chain: [shell], els: post });

    // Découpe d'une unité en parties de MAX_SLOTS éléments au plus : un élément
    // trop grand est ouvert et ses enfants répartis (recollés par le script de la page).
    const parts = [];
    for (const unit of units) {
      const kept = [[]];
      let count = 0;
      const place = (el) => {
        const n = slotsOf(el);
        if (count + n <= MAX_SLOTS) {
          kept[kept.length - 1].push(el);
          count += n;
        } else if (n <= MAX_SLOTS || !el.children.length || isLeaf(el)) {
          kept.push([el]);
          count = n;
        } else {
          for (const c of el.children) place(c);
        }
      };
      for (const el of unit.els) place(el);
      const list = kept.filter((l) => l.length);
      for (const els of list) parts.push({ chain: unit.chain, els, unitSize: list.length, unitEls: unit.els });
    }

    // Éléments coupés entre plusieurs parties : la rangée la plus haute est
    // marquée (data-atl-suite), ses enfants deviennent des colonnes.
    const partOfEl = new Map();
    parts.forEach((p, i) => {
      for (const el of p.els) for (let x = el; x && x !== shell; x = x.parentElement) (partOfEl.get(x) ?? partOfEl.set(x, new Set()).get(x)).add(i);
    });
    const suites = new Set();
    for (const [el, set] of partOfEl) {
      if (set.size < 2 || p_isChain(el)) continue;
      if (partOfEl.get(el.parentElement)?.size >= 2 && !p_isChain(el.parentElement)) continue;
      suites.add(el);
    }
    function p_isChain(el) {
      return el === shell || el === main;
    }

    // HTML Liquid d'une partie.
    const blocks = [];
    const arbre = [];
    let slotSeen;
    const slotLoop = (slot, inner) => `{%- for b in section.blocks -%}{%- if b.settings.slot == '${slot}' -%}${inner}{%- endif -%}{%- endfor -%}`;
    const attrs = (el, extra = {}) => {
      let s = "";
      for (const a of el.attributes) {
        if (a.name === "data-atl-k" || a.name === "data-atl-new") continue;
        if (a.name.startsWith("data-kimi") || a.name === "data-inspect-id") continue;
        if (a.name in extra) continue;
        let v = a.value;
        if (a.name === "src" || a.name === "href" || a.name === "poster") v = asset(v);
        if (a.name === "srcset") v = v.split(",").map((p) => { const [u, w] = p.trim().split(/\s+/); return `${asset(u)}${w ? " " + w : ""}`; }).join(", ");
        s += ` ${a.name}="${attrEsc(v).replace(/\{\{/g, "{ {").replace(/\{%/g, "{ %")}"`;
      }
      const k = kOf(el);
      if (k != null && keepSet.has(k)) s += ` data-atl-k="${k}"`;
      if (trackSet.has(k)) s += ` data-atl-car="track"`;
      for (const [n, v] of Object.entries(extra)) if (v != null) s += ` ${n}${v === "" ? "" : `="${v}"`}`;
      return s;
    };
    const VOID = new Set(["IMG", "BR", "HR", "INPUT", "META", "LINK", "SOURCE", "WBR", "AREA", "COL", "EMBED", "TRACK"]);
    const label = (el) => {
      const t = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(t)) return { type: "titre", name: `Titre ${t.toUpperCase()}` };
      if (t === "button") return { type: "bouton", name: "Bouton" };
      if (t === "a") return { type: "lien", name: "Lien" };
      return { type: "texte", name: t === "p" ? "Paragraphe" : "Texte" };
    };
    const ser = (el, ctx) => {
      if (el.nodeType === 3) return esc(el.textContent).replace(/\{\{/g, "{ {").replace(/\{%/g, "{ %");
      if (el.nodeType !== 1) return "";
      if (ctx.part && !ctx.part.has(el)) return "";
      const tag = el.tagName.toLowerCase();
      const k = kOf(el);
      if (tag === "svg") return el.outerHTML.replace(/\s*data-atl-k="[^"]*"/g, "");
      if (tag === "script" || tag === "template") return "";
      const recipe = recipes[k];
      const extra = {};
      if (suites.has(el)) extra["data-atl-suite"] = `r${k}`;
      // Élément coupé entre plusieurs parties : le même repère dans chacune,
      // pour le recoller à tous les niveaux (carrousel coupé au milieu…).
      else if (partOfEl.get(el)?.size >= 2 && !p_isChain(el)) extra["data-atl-col"] = `c${k}`;
      if (el.hasAttribute("data-atl-h")) extra["data-atl-h"] = "";
      if (recipe && recipe.t !== "vide") extra["data-atl-btn"] = k;
      // Bloc collant (galerie) : l'aperçu de l'atelier imite son défilement
      // à travers les sections d'une rangée coupée (engine/puck-config.jsx).
      if (getComputedStyle(el).position === "sticky") extra["data-atl-sticky"] = "";
      const sub = ctx;
      // Image : élément modifiable (une même photo répétée = un seul élément).
      if (tag === "img") {
        const src = asset(el.currentSrc || el.getAttribute("src") || "");
        let slot = slotSeen.get("img:" + src);
        if (!slot) {
          slot = `i${k}`;
          slotSeen.set("img:" + src, slot);
          blocks.push({ slot, repere: `Image ${el.naturalWidth || el.width}×${el.naturalHeight || el.height}`, text: el.getAttribute("alt") ?? "", image: src.startsWith("/imports/") ? src : "", link: "" });
          ctx.tree.push({ slot, type: "image", name: "Image", size: `${Math.round(el.width)}×${Math.round(el.height)}` });
        }
        const w = Math.min(2400, Math.ceil((el.width || 600) * 2));
        const a = attrs(el, { src: null, srcset: null, alt: null, style: null, "data-atl-slot": slot });
        return slotLoop(slot, `{%- if b.settings.image != blank -%}<img${a} src="{{ b.settings.image | image_url: width: ${w} }}" alt="{{ b.settings.text | escape }}" style="${attrEsc(el.getAttribute("style") ?? "")}{{ b.settings.style }}">{%- else -%}<img${a} alt="" style="visibility:hidden;${attrEsc(el.getAttribute("style") ?? "")}">{%- endif -%}`);
      }
      const isLink = tag === "a" && el.getAttribute("href");
      const btnLink = recipe?.t === "lien";
      if (isLeaf(el) || mixedText(el)) {
        const slot = `s${k}`;
        const leaf = isLeaf(el);
        const run = leaf ? null : mixedText(el);
        const html = leaf ? el.innerHTML.replace(/\s*data-atl-k="[^"]*"/g, "").replace(/\s+/g, " ").trim() : run.textContent.trim();
        const lb = label(el);
        const link = isLink ? asset(el.getAttribute("href")) : btnLink ? recipe.link : "";
        blocks.push({ slot, repere: `${lb.name} · ${el.textContent.trim().replace(/\s+/g, " ").slice(0, 40)}`, text: html, image: "", link });
        ctx.tree.push({ slot, type: isLink || btnLink ? (tag === "a" ? "lien" : "bouton") : lb.type, name: lb.name });
        const linkAttr = isLink ? { href: slotLoop(slot, "{{ b.settings.link | default: '#' }}") } : btnLink ? { "data-atl-href": slotLoop(slot, "{{ b.settings.link }}") } : {};
        const a = attrs(el, { ...extra, ...linkAttr, style: null, "data-atl-slot": slot });
        const style = `style="${attrEsc(el.getAttribute("style") ?? "")}${slotLoop(slot, "{{ b.settings.style }}")}"`;
        let inner;
        if (leaf) inner = slotLoop(slot, "{{ b.settings.text | newline_to_br }}");
        else inner = [...el.childNodes].map((c) => (c === run ? slotLoop(slot, "{{ b.settings.text }}") : c.nodeType === 3 ? "" : ser(c, sub))).join("");
        return `<${tag}${a} ${style}>${inner}</${tag}>`;
      }
      let a;
      if (isLink) {
        const slot = `l${k}`;
        blocks.push({ slot, repere: `Lien · ${el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 40)}`, text: "", image: "", link: asset(el.getAttribute("href")) });
        ctx.tree.push({ slot, type: "lien", name: "Lien" });
        a = attrs(el, { ...extra, href: slotLoop(slot, "{{ b.settings.link | default: '#' }}"), "data-atl-link": slot });
      } else if (btnLink) {
        // Bouton sans texte simple (logo, icône) qui menait à une ancre ou au panier.
        const slot = `l${k}`;
        blocks.push({ slot, repere: `Lien · ${el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 40)}`, text: "", image: "", link: recipe.link });
        ctx.tree.push({ slot, type: "lien", name: "Lien" });
        a = attrs(el, { ...extra, "data-atl-href": slotLoop(slot, "{{ b.settings.link }}"), "data-atl-link": slot });
      } else a = attrs(el, extra);
      if (VOID.has(el.tagName)) return `<${tag}${a}>`;
      // Groupe : un bloc de l'arbre du panneau (cartes, colonnes…).
      const tree = [];
      // Rangée de colonnes coupée (grille, ou flex en ligne de 4 enfants au
      // plus) : une colonne absente de cette partie reste en place, vide
      // (data-atl-vide), pour que les autres ne glissent pas dans l'atelier.
      // Sur la page publiée, le script de recollage l'ignore.
      const cs = getComputedStyle(el);
      const columns = partOfEl.get(el)?.size >= 2 && el.children.length <= 4 && (cs.display.includes("grid") || (cs.display.includes("flex") && !cs.flexDirection.startsWith("column")));
      const shell = (c) => `<${c.tagName.toLowerCase()}${attrs(c, { "data-atl-vide": "" }).replace(/ data-atl-(k|car)="[^"]*"/g, "")}></${c.tagName.toLowerCase()}>`;
      const inner = [...el.childNodes]
        .map((c) => (columns && c.nodeType === 1 && ctx.part && !ctx.part.has(c) && c.tagName !== "svg" ? shell(c) : ser(c, { ...sub, tree })))
        .join("");
      if (tree.length > 1) ctx.tree.push({ group: true, kind: "groupe", label: (el.className?.baseVal ?? el.className ?? "").split(/\s+/)[0] || "Bloc", children: tree });
      else ctx.tree.push(...tree);
      return `<${tag}${a}>${inner}</${tag}>`;
    };

    const out = [];
    for (const p of parts) {
      blocks.length = 0;
      slotSeen = new Map();
      const set = new Set();
      for (const el of p.els) {
        for (let x = el; x && x !== shell; x = x.parentElement) set.add(x);
        set.add(el);
        el.querySelectorAll("*").forEach((c) => set.add(c));
      }
      const tree = [];
      const body = p.els.length && p.els[0].parentElement === shell
        ? p.els.map((el) => ser(el, { part: set, tree })).join("")
        : ser(p.chain.length > 1 ? main : p.els[0].closest("main > *, #root > * > *"), { part: set, tree });
      // Ancêtres (coque de la page, <main>) : gardés pour le CSS, sans hauteur mini.
      let html = body;
      for (const c of [...p.chain].reverse()) {
        if (c === main && body.startsWith("<main")) continue;
        html = `<${c.tagName.toLowerCase()}${attrs(c, { style: "min-height:0" })}>${html}</${c.tagName.toLowerCase()}>`;
      }
      const keys = [...set].map(kOf).filter(Boolean);
      for (const el of p.els) el.querySelectorAll("[data-atl-k]").forEach((c) => keys.push(kOf(c)));
      const title = p.els[0].querySelector("h1, h2, h3")?.textContent.trim().replace(/\s+/g, " ").slice(0, 50) ?? "";
      out.push({ html, blocks: blocks.map((b) => ({ ...b })), tree, keys: [...new Set(keys)], title, cls: (p.els[0].className?.baseVal ?? p.els[0].className ?? "").split(/\s+/)[0] || p.els[0].tagName.toLowerCase() });
    }

    // CSS : chaque règle, avec son emballage (@media…), dans l'ordre.
    const css = [];
    const walk = (rules, wrap) => {
      for (const r of rules) {
        if (r instanceof CSSStyleRule) css.push({ sel: r.selectorText, body: r.style.cssText, wrap, i: css.filter((x) => x.sel != null).length });
        else if (r instanceof CSSMediaRule) walk(r.cssRules, [...wrap, `@media ${r.conditionText}`]);
        else if (r instanceof CSSSupportsRule) walk(r.cssRules, [...wrap, `@supports ${r.conditionText}`]);
        else if (r.cssRules && r.cssText.startsWith("@layer")) walk(r.cssRules, wrap);
        else css.push({ raw: r.cssText, wrap });
      }
    };
    for (const s of document.styleSheets) {
      try {
        walk(s.cssRules, []);
      } catch {}
    }
    return { parts: out, css, sheetBase: document.styleSheets[0]?.href ?? origin + "/" };
  },
  { recipes, keep: [...keep], tracks: [...tracks], MAX_SLOTS, origin, assetBase },
);
await browser.close();
server.close();

// ---- 3. CSS de chaque partie, rangé sous la classe de sa section ----
// html, body et :root deviennent la section elle-même.
const scopeSel = (sel, scope) =>
  sel
    .split(",")
    .map((s) => {
      s = s.trim();
      if (/^(html|:root|body)\b/.test(s)) return s.replace(/^(html\s*body|html|:root|body)/, `.${scope}`);
      return `.${scope} ${s}`;
    })
    .join(", ");
const urlFix = (text) =>
  text.replace(/url\((["']?)([^)"']+)\1\)/g, (m, q, u) => {
    if (/^(data:|#)/.test(u)) return m;
    try {
      const abs = new URL(u, built.sheetBase);
      if (abs.origin !== origin) return m;
      return `url("${assetBase}${abs.pathname.replace(/^\/(assets\/)?/, "")}")`;
    } catch {
      return m;
    }
  });
// Rangé sous la classe de la section (exigé par l'export Shopify) ; une partie
// recollée dans une autre lui apporte sa classe (script de la page).
const cssFor = (keys, scope) => {
  const set = new Set(keys);
  let out = "";
  for (const r of built.css) {
    let text;
    if (r.raw != null) {
      if (/^@(font-face|keyframes|property|-webkit-keyframes)/.test(r.raw)) text = r.raw;
      else continue;
    } else {
      const use = ruleUse[r.i];
      if (use !== "all" && !(use ?? []).some((k) => set.has(k))) continue;
      // La page entière (html, body) : sans hauteur ni largeur mini (une section
      // n'est pas un écran).
      let body = r.body;
      if (/^(html|body|:root)$/.test(r.sel.trim())) body = body.replace(/(^|;)\s*(min-height|min-width|scroll-behavior)\s*:[^;]+;?/g, "$1");
      if (!body.trim()) continue;
      text = `${scopeSel(r.sel, scope)} { ${body} }`;
    }
    for (const w of [...r.wrap].reverse()) text = `${w} { ${text} }`;
    out += urlFix(text) + "\n";
  }
  // Comportements : pistes de carrousel qui défilent au doigt, éléments
  // ajoutés par un bouton cachés au départ.
  out += `.${scope} [data-atl-car="track"] { overflow-x: auto !important; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; position: relative; }
.${scope} [data-atl-car="track"]::-webkit-scrollbar { display: none; }
.${scope} [data-atl-car="track"] > * { transform: none !important; }
.${scope} [data-atl-car="track"] > * > * { scroll-snap-align: start; }
.${scope} [data-atl-h] { display: none !important; }
.${scope} [data-atl-href] { cursor: pointer; }
`;
  return out;
};

// ---- 4. Script de la page publiée (remplace React) ----
const RUNTIME =
  "<script>(function(){if(window.__atlKimi)return;window.__atlKimi=1;window.__atlKr=window.__atlKr||{};var d=document;" +
  "function q(k){return d.querySelector('[data-atl-k=\"'+k+'\"]')}" +
  "function apply(st){for(var k in st){var el=q(k),v=st[k];if(!el)continue;if(v.h){el.setAttribute('data-atl-h','');continue}el.removeAttribute('data-atl-h');" +
  "for(var a in v){if(a==='h')continue;if(a==='class'){var keep=[].filter.call(el.classList,function(c){return/^atl-/.test(c)});el.setAttribute('class',((v[a]||'')+' '+keep.join(' ')).trim());continue}" +
  "if(v[a]==null)el.removeAttribute(a);else el.setAttribute(a,v[a])}}}" +
  "d.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-atl-btn],[data-atl-href]');if(!t)return;" +
  "var h=t.getAttribute('data-atl-href');if(h){e.preventDefault();if(h.charAt(0)==='#'){var x=d.getElementById(h.slice(1));if(x)x.scrollIntoView({behavior:'smooth'})}else location.href=h;return}" +
  "var r=window.__atlKr[t.getAttribute('data-atl-btn')];if(!r)return;e.preventDefault();" +
  "if(r.st){var i=t.__atlI||0;apply(r.st[i%r.st.length]);t.__atlI=i+1}" +
  "(r.car||[]).forEach(function(m){var tr=q(m.track);if(!tr)return;if(m.dir)tr.scrollBy({left:m.dir*tr.clientWidth*0.8,behavior:'smooth'});" +
  "else{var c=tr.firstElementChild,s=c&&c.children[m.index];if(s)tr.scrollTo({left:s.offsetLeft-c.offsetLeft,behavior:'smooth'})}})});" +
  // Parties d'un bloc coupé entre sections (data-atl-suite) : recollées dans
  // la première, à tous les niveaux (data-atl-col), puis sections vidées masquées.
  "function merge(dst,src){[].slice.call(src.childNodes).forEach(function(c){if(c.nodeType===1&&c.hasAttribute('data-atl-vide'))return;var id=c.nodeType===1&&c.getAttribute('data-atl-col');" +
  "var t=id&&[].filter.call(dst.children,function(e){return e.getAttribute('data-atl-col')===id})[0];if(t)merge(t,c);else dst.appendChild(c)})}" +
  "function run(){var seen={};d.querySelectorAll('[data-atl-suite]').forEach(function(x){var id=x.getAttribute('data-atl-suite');if(seen[id])return;seen[id]=1;" +
  "var rows=d.querySelectorAll('[data-atl-suite=\"'+id+'\"]'),top=rows[0].closest('[data-atl-root]');" +
  "for(var i=1;i<rows.length;i++){var root=rows[i].closest('[data-atl-root]');" +
  "if(root&&top&&root!==top)[].forEach.call(root.classList,function(c){if(/^atl-/.test(c))top.classList.add(c)});merge(rows[0],rows[i]);" +
  "if(root&&!root.querySelector('[data-atl-slot],img,video,iframe'))(root.closest('.shopify-section')||root).style.display='none'}})}" +
  "if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',run);else run()})();</script>";
const recipeData = (keys) => {
  const set = new Set(keys);
  const out = {};
  for (const [k, r] of Object.entries(recipes)) {
    if (!set.has(k) || r.t === "vide" || r.t === "lien") continue;
    out[k] = { st: r.st, car: r.car };
  }
  return out;
};

// ---- 5. Sections de l'atelier et page ----
await mkdir(join(root, "imports", slug), { recursive: true });
await rm(join(root, "imports", slug, "assets"), { recursive: true, force: true });
await mkdir(join(root, "imports", slug, "assets"), { recursive: true });
for (const f of await readdir(join(dist, "assets"))) {
  if (/\.(js|css|map)$/.test(f)) continue;
  await cp(join(dist, "assets", f), join(root, "imports", slug, "assets", f));
}
for (const old of await readdir(join(root, "sections"))) {
  if (old.startsWith(`${slug}-p`)) await rm(join(root, "sections", old), { recursive: true, force: true });
}
const label = labelArg || slug;
const content = [];
built.parts.forEach((p, i) => {
  const id = `${slug}-p${i + 1}`;
  const data = recipeData(p.keys);
  const script = Object.keys(data).length ? `<script>window.__atlKr=Object.assign(window.__atlKr||{},${JSON.stringify(data).replace(/</g, "\\u003c")});</script>` : "";
  const template = `<div class="${scope} atl-${id}" data-atl-root>${p.html}${script}${RUNTIME}</div>`;
  const name = p.title || p.cls;
  const schema = {
    name: `Kimi · ${slug.slice(0, 12)} ${i + 1}`,
    tag: "section",
    settings: [{ type: "paragraph", content: "Page reproduite par Kimi, gardée telle quelle. Chaque bloc est un emplacement de la page : modifie son texte, son image ou son lien." }],
    blocks: [
      {
        type: "element",
        name: "Élément",
        settings: [
          { type: "text", id: "repere", label: "Repère" },
          { type: "text", id: "slot", label: "Emplacement (ne pas modifier)" },
          { type: "textarea", id: "text", label: "Texte (ou texte alternatif de l'image)" },
          { type: "image_picker", id: "image", label: "Image" },
          { type: "url", id: "link", label: "Lien (boutons et liens)" },
          { type: "text", id: "style", label: "Style de l'élément (réglé par l'atelier)" },
        ],
      },
    ],
    presets: [{ name: `Kimi · ${slug.slice(0, 12)} ${i + 1}` }],
  };
  const meta = {
    label: `${name} — ${label}`,
    fonction: name,
    families: [],
    family: "article",
    pageSpecific: slug,
    source: { url: null, capturedAt: new Date().toISOString(), note: `Page Kimi gardée telle quelle (scripts/kimi-import.mjs, ${appArg}).` },
    preview: {},
    previewBlocks: {},
    arbre: { group: true, kind: "groupe", label: name, children: p.tree },
  };
  content.push({ id, schema, template, css: cssFor(p.keys, `atl-${id}`), meta, blocks: p.blocks });
});
for (const s of content) {
  const sdir = join(root, "sections", s.id);
  await mkdir(sdir, { recursive: true });
  await writeFile(join(sdir, "schema.json"), JSON.stringify(s.schema, null, 2) + "\n", "utf8");
  await writeFile(join(sdir, "template.liquid"), s.template + "\n", "utf8");
  await writeFile(join(sdir, "style.css"), s.css, "utf8");
  await writeFile(join(sdir, "meta.json"), JSON.stringify(s.meta, null, 2) + "\n", "utf8");
}
const pageJson = {
  root: { props: { title: `Kimi — ${label}`, pageType: "produit", produit: "", profil: "", importSource: slug, design: "" } },
  content: content.map((s) => ({ type: s.id, props: { id: s.id, blocks_element: s.blocks } })),
  zones: {},
};
await writeFile(join(root, "pages", `${slug}.json`), JSON.stringify(pageJson, null, 2), "utf8");
await writeFile(join(root, "imports", slug, "kimi.json"), JSON.stringify({ app, importedAt: new Date().toISOString(), buttons: buttons.length, recipes, inserts: inserts.length }, null, 2), "utf8");

const kinds = Object.values(recipes).reduce((a, r) => ((a[r.t] = (a[r.t] ?? 0) + 1), a), {});
console.log(`✓ ${slug} : ${content.length} section(s), ${content.reduce((n, s) => n + s.blocks.length, 0)} éléments`);
console.log(`  Boutons appris : ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(" · ")} · éléments ajoutés ${inserts.length}`);
for (const s of content) console.log(`  ${s.id.padEnd(22)} ${String(s.blocks.length).padStart(3)} éléments · CSS ${Math.round(s.css.length / 1024)} ko · ${s.meta.fonction}`);
