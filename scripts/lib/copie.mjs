// Copie modifiable d'une page au design identique, à partir du relevé
// imports/<nom>/snapshot.json (structure + styles réels en ordinateur et en
// mobile, voir lib/snapshot.mjs).
//
// - La structure HTML d'origine est gardée telle quelle, chaque élément reçoit
//   une classe qui porte ses styles réels (ordinateur, puis mobile < 750 px).
// - Chaque texte devient un emplacement modifiable (bloc « Élément »). Au départ
//   la version modifiable est identique à l'original : texte d'origine
//   (choix de l'utilisateur, 2026-10-24) ; avec --briefs, un brief de même longueur.
// - Chaque photo devient un emplacement image (photo d'origine en repère, jamais
//   exportée). Les petites icônes restent incrustées.
// - La page est découpée en sections de 45 emplacements au plus (Shopify : 50
//   blocs par section). Une rangée article + barre latérale garde sa barre en
//   haut et la largeur de l'article dans les sections suivantes.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { INHERITED, PROPS } from "./snapshot.mjs";

const MAX_SLOTS = 45;
const HEADING_TAG = /^h[1-6]$/;
const TINY = 40;

const LOREM = (
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum"
).split(" ");
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
const isNumeric = (t) => /^[\d\s%$€£.,:+×x/\-*]+$/.test(t) && /\d/.test(t);

// Brief de même longueur que le texte d'origine : le design garde sa densité.
function brief(text, words, role) {
  if (isNumeric(text)) return text.replace(/\d/g, "0");
  if (words <= 3) return `[ ${Array.from({ length: words }, (_, i) => (i ? "mot" : "Mot")).join(" ")} ]`;
  const label = `[ ${role} — ${plural(words, "mot")} ]`;
  const used = label.split(/\s+/).length;
  if (words <= used + 2) return label;
  const filler = Array.from({ length: words - used }, (_, i) => LOREM[i % LOREM.length]).join(" ");
  return `${label} ${filler}.`;
}

const ROLE_LABELS = {
  fond: "Fond de page",
  surface: "Surface (encadrés)",
  "fond-sombre": "Fond sombre",
  texte: "Texte",
  "texte-sur-sombre": "Texte sur fond sombre",
  accent: "Accent (liens)",
  bouton: "Bouton",
  "bouton-texte": "Texte des boutons",
};
const hexOf = (c) => {
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c ?? "");
  return m ? `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}` : "#000000";
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const px = (v) => parseFloat(v) || 0;

export function buildCopy({ snap, slug, root, label, textes = "origine" }) {
  const nodes = snap.nodes;
  const mobile = snap.mobile;
  const byId = nodes;
  const parentOf = (n) => (n.parent == null ? null : byId[n.parent]);
  const mStyle = (n) => mobile[n.id] ?? n.style;
  const dead = (n) => n.style.display === "none" && mStyle(n).display === "none";

  // ---- Emplacements ----
  const roleOf = (n) => {
    if (/^h1$/.test(n.tag)) return "Grand titre";
    if (/^h[2-6]$/.test(n.tag)) return "Intertitre";
    if (n.tag === "a" || n.tag === "button") return "Bouton ou lien";
    if (n.tag === "li") return "Point";
    const size = px(n.style["font-size"]);
    if (size >= 28) return "Grand titre";
    if (size >= 21) return "Intertitre";
    return "Paragraphe";
  };
  const fileOf = (n) => (n.image ? snap.files?.[n.image] ?? null : null);
  const tinyImage = (n) => n.image && !n.bgImage && n.box.w <= TINY && n.box.h <= TINY;
  const isImageSlot = (n) => n.image && !tinyImage(n);

  const memo = new Map();
  function count(n) {
    if (memo.has(n.id)) return memo.get(n.id);
    let c = 0;
    if (!dead(n)) {
      if (isImageSlot(n)) c += 1;
      if (n.text != null) c += 1;
      else if (!n.svg && !(n.image && !n.bgImage)) for (const k of n.kids) c += k.text != null ? 1 : count(byId[k.n]);
    }
    memo.set(n.id, c);
    return c;
  }
  const aliveKids = (n) => n.kids.filter((k) => k.text != null || !dead(byId[k.n]));

  // ---- Découpe en sections ----
  const full = (n) => ({ n, kids: aliveKids(n).map((k) => (k.text != null ? k : full(byId[k.n]))) });
  const itemCount = (it) => (it.text != null ? 1 : it.empty ? 0 : it.kids ? it.kids.reduce((s, k) => s + itemCount(k), (isImageSlot(it.n) ? 1 : 0) + (it.n.text != null ? 1 : 0)) : count(it.n));
// Cadre dont tous les enfants sont en position absolue (Unbounce…).
  const allAbsoluteKids = (n) => {
    const kids = aliveKids(n).filter((k) => k.text == null).map((k) => byId[k.n]);
    return kids.length > 0 && aliveKids(n).every((k) => k.text == null && ["absolute", "fixed"].includes(byId[k.n].style.position));
  };
  const sideBySide = (n) => {
    // Des éléments posés en coordonnées fixes ne sont pas des colonnes.
    if (allAbsoluteKids(n)) return false;
    const kids = aliveKids(n).filter((k) => k.text == null).map((k) => byId[k.n]).filter((k) => k.box.w > 0 && k.box.h > 0);
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].box;
        const b = kids[j].box;
        const vertical = a.y < b.y + b.h - 4 && b.y < a.y + a.h - 4;
        const apart = a.x + a.w <= b.x + 4 || b.x + b.w <= a.x + 4;
        if (vertical && apart) return true;
      }
    return false;
  };

  // `first` : place restante dans la section en cours pour la première partie.
  function split(n, max = MAX_SLOTS, first = max) {
    if (count(n) <= first || n.text != null) return [full(n)];
    const kids = aliveKids(n);
    if (sideBySide(n)) {
      // Colonnes côte à côte (article + barre latérale) : chaque section garde
      // toutes les colonnes à leur place (une colonne déjà terminée reste là,
      // vide, pour garder les largeurs). Une petite colonne (barre latérale)
      // reste entière ; la grande prend toute la place restante.
      const elems = kids.filter((k) => k.text == null);
      const total = elems.reduce((s, k) => s + count(byId[k.n]), 0) || 1;
      const big = elems.reduce((a, b) => (count(byId[b.n]) > count(byId[a.n]) ? b : a));
      const others = total - count(byId[big.n]);
      const parts = new Map(
        elems.map((k) => {
          if (k !== big && others <= first / 2) return [k, [full(byId[k.n])]];
          if (k === big && others <= first / 2) return [k, split(byId[k.n], max - others, first - others)];
          const share = count(byId[k.n]) / total;
          return [k, split(byId[k.n], Math.max(6, Math.floor(max * share)), Math.max(6, Math.floor(first * share)))];
        }),
      );
      const rounds = Math.max(...[...parts.values()].map((p) => p.length));
      return Array.from({ length: rounds }, (_, i) => ({
        n,
        kids: kids
          .map((k) => (k.text != null ? (i === 0 ? k : null) : parts.get(k)[i] ?? { n: byId[k.n], kids: [], empty: true }))
          .filter(Boolean),
      }));
    }
    const groups = [];
    let cur = [];
    // La première partie démarre avec la place déjà prise dans la section en cours.
    let curCount = max - first;
    const flush = () => {
      if (cur.length) groups.push(cur);
      cur = [];
      curCount = 0;
    };
    // Cadre en positions absolues : découpé de haut en bas, par tranches.
    const ordered = allAbsoluteKids(n) ? [...kids].sort((a, b) => byId[a.n].box.y - byId[b.n].box.y) : kids;
    for (const k of ordered) {
      const c = k.text != null ? 1 : count(byId[k.n]);
      if (curCount + c <= max) {
        cur.push(k.text != null ? k : full(byId[k.n]));
        curCount += c;
        continue;
      }
      // Élément trop grand pour la place restante : s'il tient dans une section,
      // il passe à la suivante ; sinon il est coupé et remplit d'abord la place restante.
      if (c <= max || max - curCount < 6) flush();
      if (c <= max) {
        cur.push(full(byId[k.n]));
        curCount = c;
        continue;
      }
      const parts = split(byId[k.n], max, max - curCount);
      parts.forEach((p, i) => {
        if (i > 0) flush();
        cur.push(p);
        curCount += itemCount(p);
      });
    }
    flush();
    return groups.map((g) => ({ n, kids: g }));
  }
  const body = nodes[0];
  const pieces = split(body);
  // Bords coupés entre deux sections : pas de marge ni de bordure répétée.
  function markEdges(pieceList) {
    const seen = new Map();
    pieceList.forEach((p, i) => {
      const walk = (it) => {
        if (!it || it.text != null) return;
        const list = seen.get(it.n.id) ?? [];
        list.push({ it, i });
        seen.set(it.n.id, list);
        for (const k of it.kids ?? []) walk(k);
      };
      walk(p);
    });
    for (const list of seen.values()) {
      if (list.length < 2) continue;
      list.forEach(({ it }, j) => {
        it.cutTop = j > 0;
        it.cutBottom = j < list.length - 1;
      });
    }
  }
  markEdges(pieces);

  // Mise en page en positions absolues (Unbounce…) coupée en plusieurs
  // sections : chaque partie ne garde que sa tranche du cadre. Le cadre est
  // remonté (marge négative) et raccourci à la hauteur de ses éléments ; la
  // section coupe ce qui dépasse. Calculé en ordinateur et en mobile.
  const mBox = (n) => mobile[n.id]?.__box;
  function sliceOf(it, boxOf) {
    let top = Infinity;
    let bottom = -Infinity;
    const walk = (x) => {
      if (!x || x.text != null || x.empty) return;
      const b = boxOf(x.n);
      if (b && b.h > 0 && b.y != null && (x.n.text != null || x.n.image || !(x.kids ?? []).length)) {
        top = Math.min(top, b.y);
        bottom = Math.max(bottom, b.y + b.h);
      }
      for (const k of x.kids ?? []) walk(k);
    };
    for (const k of it.kids ?? []) walk(k);
    const own = boxOf(it.n);
    if (!own || own.y == null || top === Infinity) return null;
    return { top: Math.max(0, Math.round(top - own.y)), bottom: Math.round(bottom - own.y) };
  }
  pieces.forEach((piece) => {
    piece.slices = [];
    const walk = (it) => {
      if (!it || it.text != null) return;
      if ((it.cutTop || it.cutBottom) && !["absolute", "fixed"].includes(it.n.style.position) && allAbsoluteKids(it.n)) {
        it.shifted = true;
        piece.slices.push({ n: it.n, d: sliceOf(it, (n) => n.box), m: sliceOf(it, mBox) });
      }
      for (const k of it.kids ?? []) walk(k);
    };
    walk(piece);
  });

  // ---- Couleurs et polices qui jouent un rôle sur la page d'origine ----
  const opaque = (c) => typeof c === "string" && /^rgb\(/.test(c);
  const lum = (c) => {
    const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c ?? "");
    return m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 : 1;
  };
  const tally = () => new Map();
  const addTo = (m, k, w) => k && m.set(k, (m.get(k) ?? 0) + w);
  const best = (m, keep = () => true) => [...m].filter(([k]) => keep(k)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const backgroundUnder = (n) => {
    for (let x = n; x; x = parentOf(x)) if (opaque(x.style["background-color"])) return x.style["background-color"];
    return snap.htmlBackground;
  };
  // Bouton : une boîte colorée, au texte court, qui est ou contient un lien
  // (<a> ou <button>, ou <div> coloré autour d'un <a>). inButton : la boîte
  // du bouton dont fait partie l'élément (lui-même ou un parent proche).
  const wordMemo = new Map();
  const wordsIn = (n) => {
    if (wordMemo.has(n.id)) return wordMemo.get(n.id);
    const w = n.text != null ? n.words : n.kids.reduce((s, k) => s + (k.text != null ? k.words : wordsIn(byId[k.n])), 0);
    wordMemo.set(n.id, w);
    return w;
  };
  const hasLink = (n, depth) => n.tag === "a" || n.tag === "button" || (depth > 0 && n.kids.some((k) => k.text == null && hasLink(byId[k.n], depth - 1)));
  const isButtonBox = (n) => opaque(n.style["background-color"]) && n.box.h <= 140 && wordsIn(n) > 0 && wordsIn(n) <= 12 && hasLink(n, 3);
  const inButton = (n) => {
    for (let x = n, i = 0; x && i < 4; x = x.parent == null ? null : parentOf(x), i++) if (isButtonBox(x)) return x;
    return null;
  };
  const bgArea = tally();
  const textColors = tally();
  const linkColors = tally();
  const buttonBg = tally();
  const buttonText = tally();
  const darkText = tally();
  const bodyFonts = tally();
  const headingFonts = tally();
  for (const n of nodes) {
    if (dead(n) || n.style.display === "none") continue;
    const bg = n.style["background-color"];
    const btn = inButton(n);
    if (opaque(bg)) addTo(btn ? buttonBg : bgArea, bg, btn ? 1 : n.box.w * n.box.h);
    if (n.text == null) continue;
    addTo(HEADING_TAG.test(n.tag) ? headingFonts : bodyFonts, n.style["font-family"], n.words);
    if (btn) {
      addTo(buttonText, n.style.color, 1);
      continue;
    }
    if (n.tag === "a") addTo(linkColors, n.style.color, n.words);
    addTo(lum(backgroundUnder(n)) < 0.35 ? darkText : textColors, n.style.color, n.words);
  }
  // Fond de page transparent : c'est le blanc du navigateur qui s'affiche.
  if (!opaque(nodes[0].style["background-color"]) && !opaque(snap.htmlBackground)) addTo(bgArea, "rgb(255, 255, 255)", nodes[0].box.w * nodes[0].box.h);
  const roles = {};
  roles.fond = best(bgArea, (c) => lum(c) >= 0.35) ?? (opaque(snap.htmlBackground) ? snap.htmlBackground : "rgb(255, 255, 255)");
  roles.surface = best(bgArea, (c) => lum(c) >= 0.35 && c !== roles.fond);
  roles["fond-sombre"] = best(bgArea, (c) => lum(c) < 0.35);
  roles.texte = best(textColors);
  roles["texte-sur-sombre"] = best(darkText, (c) => lum(c) >= 0.6);
  roles.accent = best(linkColors, (c) => c !== roles.texte);
  roles.bouton = best(buttonBg);
  roles["bouton-texte"] = best(buttonText, (c) => Math.abs(lum(c) - lum(roles.bouton)) > 0.3);
  for (const r of Object.keys(roles)) if (!roles[r]) delete roles[r];
  const bodyFont = best(bodyFonts);
  const headingFont = best(headingFonts) ?? bodyFont;

  // ---- Styles : déclarations réelles, ordinateur et mobile ----
  const defaults = snap.defaults;
  const contentWidth = (n, st, box) => box.w - px(st["padding-left"]) - px(st["padding-right"]) - px(st["border-left-width"]) - px(st["border-right-width"]);
  const isReplaced = (n) => n.svg || n.image && !n.bgImage || ["input", "select", "textarea"].includes(n.tag);

  function declOf(n, mode) {
    const st = mode === "d" ? n.style : mStyle(n);
    const box = mode === "d" ? n.box : mobile[n.id]?.__box ?? n.box;
    const p = parentOf(n);
    const pst = p ? (mode === "d" ? p.style : mStyle(p)) : null;
    const pbox = p ? (mode === "d" ? p.box : mobile[p.id]?.__box ?? p.box) : null;
    const def = defaults[n.tag] ?? defaults.div ?? {};
    const out = {};
    for (const prop of PROPS) {
      const v = st[prop];
      if (v == null || v === "") continue;
      // Propriété héritée : comparée au parent, sauf si le navigateur la fixe
      // pour cette balise (taille d'un h1, couleur d'un lien…) : alors toujours écrite.
      const uaSets = (defaults.div ?? {})[prop] !== def[prop];
      const base = INHERITED.has(prop) && pst && !uaSets ? pst[prop] : INHERITED.has(prop) && uaSets ? null : def[prop];
      if (v !== base) out[prop] = v;
    }
    // Bordures sans style : rien à écrire.
    for (const side of ["top", "right", "bottom", "left"]) {
      if (st[`border-${side}-style`] === "none" || px(st[`border-${side}-width`]) === 0) {
        delete out[`border-${side}-width`];
        delete out[`border-${side}-color`];
        delete out[`border-${side}-style`];
      } else {
        // Bordure visible : son épaisseur est toujours écrite (sinon le
        // navigateur prendrait la sienne, 3 px).
        out[`border-${side}-width`] = st[`border-${side}-width`];
      }
    }
    if (st["text-decoration-line"] === "none") delete out["text-decoration-color"];
    // Positions fixes ou collantes : à leur place dans le flux.
    if (["fixed", "sticky"].includes(st.position)) {
      out.position = "relative";
      for (const s of ["top", "right", "bottom", "left"]) out[s] = "auto";
    }
    if (st["background-image"]?.includes("url(")) delete out["background-image"];
    // Largeur et hauteur : seulement quand elles comptent.
    delete out.width;
    delete out.height;
    const pos = st.position;
    const parentFlexGrid = pst && /flex|grid/.test(pst.display);
    if (isReplaced(n)) {
      out.width = `${box.w}px`;
      out.height = `${box.h}px`;
      out["max-width"] = "100%";
      if (n.image && !n.bgImage && !n.svg) out["object-fit"] = st["object-fit"] === "fill" ? "cover" : st["object-fit"];
    } else {
      const abs = pos === "absolute";
      const floated = st.float !== "none";
      const inlineish = /inline-block|table/.test(st.display);
      if (abs || floated || inlineish || parentFlexGrid) {
        if (st["max-width"] === "none" || abs) out.width = `${box.w}px`;
        if (!abs) out["max-width"] = st["max-width"] !== "none" ? st["max-width"] : "100%";
      } else if (pbox && st["max-width"] === "none") {
        const avail = contentWidth(p, pst, pbox) - px(st["margin-left"]) - px(st["margin-right"]);
        if (box.w < avail - 2) {
          out.width = `${box.w}px`;
          out["max-width"] = "100%";
        }
      }
      // Sans contenu dans le flux (vide, ou enfants tous en position absolue) :
      // c'est sa hauteur qui tient la place.
      const inFlow = aliveKids(n).some((k) => k.text != null || !["absolute", "fixed"].includes(byId[k.n].style.position));
      const noContent = n.text == null && !inFlow;
      if (abs || noContent || (n.bgImage && st["overflow-y"] === "hidden")) out.height = `${box.h}px`;
      // Bloc centré : marges automatiques plutôt qu'en pixels.
      const ml = px(st["margin-left"]);
      const mr = px(st["margin-right"]);
      if (!abs && !floated && /block|flex|grid|table/.test(st.display) && !/inline/.test(st.display) && ml > 0 && Math.abs(ml - mr) <= 1) {
        out["margin-left"] = "auto";
        out["margin-right"] = "auto";
      }
    }
    // Grilles en pixels → proportions (s'adaptent à la largeur).
    const cols = out["grid-template-columns"];
    if (cols && /^[\d.]+px( [\d.]+px)+$/.test(cols)) {
      out["grid-template-columns"] = cols
        .split(" ")
        .map((t) => `minmax(0, ${Math.round(px(t))}fr)`)
        .join(" ");
    }
    if (out["grid-template-rows"] && /px/.test(out["grid-template-rows"])) delete out["grid-template-rows"];
    return out;
  }

  // ---- Rôles du design.md ----
  // Chaque couleur d'origine qui joue un rôle (fond, texte, bouton…) devient
  // var(--atl-<rôle>, couleur d'origine), et les polices des titres et du texte
  // var(--atl-font-heading / body). La section porte un réglage couleur par rôle
  // (valeur d'origine au départ) : appliquer un design.md change toute la copie.
  function themeColor(n, prop, v) {
    if (!opaque(v)) return v;
    const isBtn = n.parent != null && Boolean(inButton(n));
    const order =
      prop === "background-color"
        ? isBtn
          ? ["bouton", "fond", "surface", "fond-sombre"]
          : ["fond", "surface", "fond-sombre", "bouton"]
        : prop === "color"
          ? isBtn
            ? ["bouton-texte", "texte", "texte-sur-sombre", "accent"]
            : n.tag === "a"
              ? ["accent", "texte", "texte-sur-sombre"]
              : ["texte", "texte-sur-sombre", "accent", "bouton-texte"]
          : ["texte", "surface", "accent", "fond", "fond-sombre"];
    const role = order.find((r) => roles[r] === v);
    return role ? `var(--atl-${role}, ${v})` : v;
  }
  const COLOR_PROPS = ["color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "text-decoration-color"];
  const HEADING = HEADING_TAG;
  function themed(n, d) {
    const out = { ...d };
    for (const p of COLOR_PROPS) if (out[p]) out[p] = themeColor(n, p, out[p]);
    const ff = out["font-family"] ?? (HEADING.test(n.tag) || n.tag === "body" ? n.style["font-family"] : null);
    if (ff) {
      if (HEADING.test(n.tag) || (ff === headingFont && ff !== bodyFont)) out["font-family"] = `var(--atl-font-heading, ${ff})`;
      else if (ff === bodyFont || n.tag === "body") out["font-family"] = `var(--atl-font-body, ${ff})`;
    }
    return out;
  }

  const resetValue = (n, prop) => {
    if (INHERITED.has(prop)) return "inherit";
    if (prop === "width" || prop === "height") return "auto";
    if (prop === "max-width") return "none";
    return (defaults[n.tag] ?? defaults.div ?? {})[prop] ?? "initial";
  };
  const declText = (d) =>
    Object.entries(d)
      .map(([k, v]) => `${k}:${v}`)
      .join(";");

  const classes = new Map();
  const ruleOf = new Map();
  function classOf(n) {
    if (ruleOf.has(n.id)) return ruleOf.get(n.id);
    const d = themed(n, declOf(n, "d"));
    const m = themed(n, declOf(n, "m"));
    const diff = {};
    for (const prop of new Set([...Object.keys(d), ...Object.keys(m)])) {
      const dv = d[prop] ?? resetValue(n, prop);
      const mv = m[prop] ?? resetValue(n, prop);
      if (dv !== mv) diff[prop] = mv;
    }
    const key = `${declText(d)}|${declText(diff)}`;
    let cls = classes.get(key);
    if (!cls) {
      cls = { name: `c${slug.replace(/^adv-/, "").replace(/[^a-z0-9]/g, "")}${classes.size}`, d, m: diff };
      classes.set(key, cls);
    }
    ruleOf.set(n.id, cls);
    return cls;
  }

  // ---- Rendu Liquid ----
  const slotLoop = (slot, inner) => `{%- for b in section.blocks -%}{%- if b.settings.slot == '${slot}' -%}${inner}{%- endif -%}{%- endfor -%}`;
  const textSlot = (slot) => slotLoop(slot, "{{ b.settings.text | newline_to_br }}");

  function renderSection(piece, sectionId) {
    const blocks = [];
    const used = new Set();
    let textN = 0;
    const addText = (slot, text, words, role, link, html) => {
      textN += 1;
      const debut = text.replace(/\s+/g, " ").slice(0, 38);
      // Couleurs dans le texte formaté (liens, mots colorés) : elles suivent aussi les rôles.
      const formatted = html?.replace(/color:(rgb\([^)]*\))/g, (m, c) => `color:${themeColor({ tag: "span" }, "color", c)}`);
      blocks.push({ slot, repere: `${role} · ${debut}${text.length > 38 ? "…" : ""}`, text: textes === "briefs" ? brief(text, words, role) : formatted ?? text, image: "", link: "" });
      return link ? slot : null;
    };

    function html(it, parentTag) {
      if (it.text != null) {
        const slot = `t${it.pid}_${it.k}`;
        addText(slot, it.text, it.words, "Texte");
        return `<span data-atl-slot="${slot}">${textSlot(slot)}</span>`;
      }
      const n = it.n;
      const cls = classOf(n);
      used.add(cls);
      const edge = [
        it.cutTop ? (it.shifted ? "padding-top:0;border-top-width:0;" : "padding-top:0;margin-top:0;border-top-width:0;") : "",
        it.cutBottom ? "padding-bottom:0;margin-bottom:0;border-bottom-width:0;" : "",
        // Morceau d'un bloc coupé entre plusieurs sections : pas de hauteur
        // minimale répétée (une page « plein écran » ferait un écran vide par partie).
        it.cutTop || it.cutBottom ? "min-height:0;" : "",
      ].join("");
      let tag = n.tag === "body" ? "div" : n.tag === "picture" ? "img" : ["video", "canvas", "iframe", "object", "embed"].includes(n.tag) ? "img" : n.tag;
      if (["html", "head"].includes(tag)) tag = "div";
      const classAttr = n.tag === "body" ? `atl-${sectionId} ${cls.name}` : cls.name;
      const styleAttr = edge ? ` style="${edge}"` : "";

      if (n.svg) {
        return n.svg.replace(/^<svg/, `<svg class="${classAttr}"`).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
      }
      if (n.image && !n.bgImage) {
        if (tinyImage(n)) {
          const file = fileOf(n);
          const data = file && existsSync(join(root, file)) ? `data:image/png;base64,${readFileSync(join(root, file)).toString("base64")}` : "";
          return data ? `<img class="${classAttr}" src="${data}" alt="">` : `<span class="${classAttr}"></span>`;
        }
        const slot = `i${n.id}`;
        blocks.push({ slot, repere: `Image ${n.box.w}×${n.box.h}`, text: "", image: fileOf(n) ?? "", link: "" });
        return slotLoop(
          slot,
          `{%- if b.settings.image != blank -%}<img data-atl-slot="${slot}" class="${classAttr}" src="{{ b.settings.image | image_url: width: ${Math.min(2000, Math.max(200, n.box.w * 2))} }}" alt="{{ b.settings.text | escape }}"${styleAttr}>{%- else -%}<div data-atl-slot="${slot}" class="${classAttr} atl-vide"${styleAttr}></div>{%- endif -%}`,
        );
      }
      if (["input", "select", "textarea"].includes(tag)) {
        if (tag === "input") return `<input class="${classAttr}" type="${esc(n.type || "text")}" disabled>`;
        return `<${tag} class="${classAttr}" disabled></${tag}>`;
      }
      let open = `<${tag} class="${classAttr}"`;
      if (n.text != null) open += ` data-atl-slot="s${n.id}"`;
      if (gids.has(`g${n.id}`)) open += ` data-atl-group="g${n.id}"`;
      else if (n.bgImage) open += ` data-atl-slot="b${n.id}"`;
      let slotLink = null;
      if (tag === "a") {
        if (n.text != null) {
          slotLink = `s${n.id}`;
          open += ` href="${"{%- for b in section.blocks -%}{%- if b.settings.slot == '" + slotLink + "' -%}{{ b.settings.link | default: '#' }}{%- endif -%}{%- endfor -%}"}"`;
        } else open += ` href="#"`;
      }
      if (n.tag === "body") {
        // Racine de la section : les couleurs des rôles viennent de ses réglages.
        const vars = Object.keys(roles)
          .map((r) => `--atl-${r}: {{ section.settings.role_${r.replace(/-/g, "_")} }};`)
          .join(" ");
        open += ` style="${vars} ${edge}"`;
      } else if (n.bgImage) {
        const slot = `b${n.id}`;
        blocks.push({ slot, repere: `Image de fond ${n.box.w}×${n.box.h}`, text: "", image: fileOf(n) ?? "", link: "" });
        open += ` style="${edge}${slotLoop(slot, "{%- if b.settings.image != blank -%}background-image:url({{ b.settings.image | image_url: width: 2000 }});background-size:cover;background-position:center;{%- endif -%}")}"`;
      } else open += styleAttr;
      open += ">";
      if (["br", "hr", "img", "wbr"].includes(tag)) return open;
      let inner = "";
      if (n.text != null) {
        const slot = slotLink ?? `s${n.id}`;
        addText(slot, n.text, n.words, roleOf(n), Boolean(slotLink), n.html);
        inner = textSlot(slot);
      } else if (!it.empty) {
        const parts = (it.kids ?? []).map((k, i) => (k.text != null ? html({ ...k, pid: n.id, k: i }, tag) : html(k, tag)));
        inner = gids.has(`g${n.id}`) && parts.length > 1 ? ordered(`g${n.id}`, parts) : parts.join("");
      }
      return `${open}${inner}</${tag}>`;
    }
    // Conteneurs dont on peut changer l'ordre des enfants (groupes de l'arbre).
    const tree = treeOf(piece);
    const gids = new Set();
    (function collect(t) {
      if (!t) return;
      if (t.gid) gids.add(t.gid);
      (t.children ?? []).forEach(collect);
    })(tree);
    // Enfants dans l'ordre du réglage « ordres » (« g12=2,0,1;g40=… ») ;
    // sans réglage, l'ordre d'origine. Identique dans l'atelier et sur Shopify.
    const ordered = (gid, parts) =>
      parts.map((p, i) => `{%- capture ${gid}_${i} -%}${p}{%- endcapture -%}`).join("") +
      `{%- assign o = section.settings.ordres | default: '' | prepend: ';' -%}` +
      `{%- if o contains ';${gid}=' -%}{%- assign ord = o | split: ';${gid}=' | last | split: ';' | first | split: ',' -%}` +
      `{%- else -%}{%- assign ord = '${parts.map((_, i) => i).join(",")}' | split: ',' -%}{%- endif -%}` +
      `{%- for x in ord -%}{%- case x -%}${parts.map((_, i) => `{%- when '${i}' -%}{{ ${gid}_${i} }}`).join("")}{%- endcase -%}{%- endfor -%}`;
    const liquid = html(piece);
    return { liquid, blocks, used, tree };
  }

  // Arbre affiché dans le panneau de droite (comme Shopify) : les conteneurs
  // qui regroupent plusieurs éléments deviennent des groupes ou des colonnes ;
  // les enveloppes à un seul enfant disparaissent.
  const GROUP_LABELS = { section: "Section", article: "Article", aside: "Encadré latéral", header: "En-tête", footer: "Pied", ul: "Liste", ol: "Liste", li: "Point", a: "Lien", button: "Bouton", form: "Formulaire", nav: "Menu", figure: "Figure" };
  function leafType(n) {
    if (n.image && !n.bgImage) return ["video", "iframe", "canvas", "object", "embed"].includes(n.tag) ? "video" : "image";
    if (inButton(n) || n.tag === "button") return "bouton";
    if (n.tag === "a") return "lien";
    if (HEADING_TAG.test(n.tag) || px(n.style["font-size"]) >= 21) return "titre";
    return "texte";
  }
  function treeOf(it, pid, k) {
    if (it.text != null) return { slot: `t${pid}_${k}`, type: "texte" };
    const n = it.n;
    if (n.svg || it.empty) return null;
    if (n.image && !n.bgImage) return tinyImage(n) ? null : { slot: `i${n.id}`, type: leafType(n), size: `${Math.round(n.box.w)}×${Math.round(n.box.h)}` };
    if (n.text != null) return { slot: `s${n.id}`, type: leafType(n) };
    // k : rang de l'enfant dans son conteneur (sert à changer l'ordre).
    let children = (it.kids ?? [])
      .map((kid, i) => {
        const t = treeOf(kid, n.id, i);
        return t && { ...t, k: i };
      })
      .filter(Boolean);
    if (n.bgImage) children.unshift({ slot: `b${n.id}`, type: "image-fond", size: `${Math.round(n.box.w)}×${Math.round(n.box.h)}` });
    if (!children.length) return null;
    if (children.length === 1) return children[0];
    // gid : le conteneur, dont l'ordre des enfants peut changer ; size : nombre d'enfants.
    const own = { gid: `g${n.id}`, size: (it.kids ?? []).length };
    if (sideBySide(n)) {
      children = children.map((c, i) => (c.group ? { ...c, label: `Colonne ${i + 1}`, kind: "colonne" } : { group: true, kind: "colonne", label: `Colonne ${i + 1}`, children: [c], k: c.k }));
      return { group: true, kind: "colonnes", label: `Colonnes (${children.length})`, children, ...own };
    }
    return { group: true, kind: "groupe", label: GROUP_LABELS[n.tag] ?? "Bloc", children, ...own };
  }

  // Polices : seulement celles que la page utilise, jeu latin.
  const families = new Set();
  for (const n of nodes) for (const f of (n.style["font-family"] ?? "").split(",")) families.add(f.trim().replace(/["']/g, "").toLowerCase());
  const fonts = (snap.fonts ?? "")
    .match(/@font-face\s*{[^}]*}/g)
    ?.filter((face) => {
      const fam = /font-family:\s*["']?([^;"']+)/i.exec(face)?.[1]?.trim().toLowerCase();
      const range = /unicode-range:\s*([^;]+)/i.exec(face)?.[1] ?? "";
      return fam && families.has(fam) && (!range || /U\+0(000)?-/i.test(range) || /U\+0-/i.test(range));
    })
    .join("\n") ?? "";

  const sections = pieces.map((piece, i) => {
    const id = `${slug}-p${i + 1}`;
    const { liquid, blocks, used, tree } = renderSection(piece, id);
    const scope = `.atl-${id}`;
    const rules = [...used].map((c) => `${scope} .${c.name}${c.name === classOf(body).name ? `, ${scope}.${c.name}` : ""}{${declText(c.d)}}`);
    const mrules = [...used].filter((c) => Object.keys(c.m).length).map((c) => `${scope} .${c.name}${c.name === classOf(body).name ? `, ${scope}.${c.name}` : ""}{${declText(c.m)}}`);
    // Tranche d'un cadre en positions absolues (voir plus haut).
    const slice = (s) => `margin-top:-${s.top}px;height:${s.bottom}px;min-height:0`;
    for (const s of piece.slices) {
      if (s.d) rules.push(`${scope} .${classOf(s.n).name}{${slice(s.d)}}`);
      if (s.m) mrules.push(`${scope} .${classOf(s.n).name}{${slice(s.m)}}`);
    }
    if (piece.slices.length) rules.push(`${scope}{overflow:hidden}`);
    const css = [
      fonts,
      `/* Copie de ${label} — partie ${i + 1}. Styles relevés sur la page d'origine (ordinateur, puis mobile). */`,
      `${scope}{display:block;background:${opaque(snap.htmlBackground) ? themeColor({ tag: "div" }, "background-color", snap.htmlBackground) : "transparent"}}`,
      `${scope} :where(*:not(svg, svg *)){all:revert}`,
      `${scope} img{display:inline-block}`,
      `${scope} .atl-vide{background:repeating-linear-gradient(45deg,#eee 0 10px,#f7f7f7 10px 20px)}`,
      ...rules,
      mrules.length ? `@media (max-width: 749px){\n${mrules.join("\n")}\n}` : "",
    ].join("\n");
    const schema = {
      name: `Atl · ${slug.replace(/^adv-/, "").slice(0, 12)} ${i + 1}`,
      tag: "section",
      settings: [
        { type: "paragraph", content: "Copie au design identique d'une page importée. Chaque bloc est un emplacement de la page : modifie son texte, son image ou son lien." },
        { type: "header", content: "Couleurs (suivent le design.md)" },
        ...Object.entries(roles).map(([r, c]) => ({ type: "color", id: `role_${r.replace(/-/g, "_")}`, label: ROLE_LABELS[r] ?? r, default: hexOf(c) })),
        { type: "header", content: "Ordre des éléments" },
        { type: "text", id: "ordres", label: "Ordre (réglé par l'atelier en déplaçant les éléments)" },
      ],
      max_blocks: 50,
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
          ],
        },
      ],
      presets: [{ name: `Atl · ${slug.replace(/^adv-/, "").slice(0, 12)} ${i + 1}` }],
    };
    const meta = {
      label: `${label} — partie ${i + 1}`,
      family: "article",
      pageSpecific: slug,
      source: { url: null, capturedAt: null, note: "Partie de la copie au design identique de la page importée (npm run advertorial:page)." },
      preview: {},
      previewBlocks: {},
      arbre: tree,
      designRoles: Object.fromEntries(Object.keys(roles).map((r) => [`role_${r.replace(/-/g, "_")}`, r])),
    };
    return { id, schema, template: liquid, css, meta, blocks };
  });
  const firstName = (stack) => (stack ?? "").split(",")[0].replace(/["']/g, "").trim();
  return {
    sections,
    slots: sections.reduce((n, s) => n + s.blocks.length, 0),
    classes: classes.size,
    // Pour le design.md de la page : ses couleurs et polices d'origine, par rôle.
    roles: Object.fromEntries(Object.entries(roles).map(([r, c]) => [r, hexOf(c)])),
    fonts: { titres: firstName(headingFont), texte: firstName(bodyFont) },
  };
}
