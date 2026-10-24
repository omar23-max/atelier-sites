// Copie modifiable d'une page au design identique, à partir du relevé
// imports/<nom>/snapshot.json (structure + styles réels en ordinateur et en
// mobile, voir lib/snapshot.mjs).
//
// - La structure HTML d'origine est gardée telle quelle, chaque élément reçoit
//   une classe qui porte ses styles réels (ordinateur, puis mobile < 750 px).
// - Chaque texte devient un emplacement modifiable (bloc « Élément ») rempli
//   d'un brief de même longueur : aucun texte d'origine n'est repris.
// - Chaque photo devient un emplacement image (photo d'origine en repère, jamais
//   exportée). Les petites icônes restent incrustées.
// - La page est découpée en sections de 45 emplacements au plus (Shopify : 50
//   blocs par section). Une rangée article + barre latérale garde sa barre en
//   haut et la largeur de l'article dans les sections suivantes.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { INHERITED, PROPS } from "./snapshot.mjs";

const MAX_SLOTS = 45;
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

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const px = (v) => parseFloat(v) || 0;

export function buildCopy({ snap, slug, root, label }) {
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
  const sideBySide = (n) => {
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

  function split(n, max = MAX_SLOTS) {
    if (count(n) <= max || n.text != null) return [full(n)];
    const kids = aliveKids(n);
    if (sideBySide(n)) {
      // Colonnes côte à côte (article + barre latérale) : chacune est découpée
      // en proportion, et chaque section garde toutes les colonnes à leur place
      // (une colonne déjà terminée reste là, vide, pour garder les largeurs).
      const elems = kids.filter((k) => k.text == null);
      const total = elems.reduce((s, k) => s + count(byId[k.n]), 0) || 1;
      const parts = new Map(elems.map((k) => [k, split(byId[k.n], Math.max(6, Math.floor((max * count(byId[k.n])) / total)))]));
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
    let curCount = 0;
    const flush = () => {
      if (cur.length) groups.push(cur);
      cur = [];
      curCount = 0;
    };
    for (const k of kids) {
      const c = k.text != null ? 1 : count(byId[k.n]);
      if (c > max) {
        flush();
        for (const piece of split(byId[k.n], max)) groups.push([piece]);
        continue;
      }
      if (curCount + c > max) flush();
      cur.push(k.text != null ? k : full(byId[k.n]));
      curCount += c;
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
      if (st[`border-${side}-style`] === "none") {
        delete out[`border-${side}-width`];
        delete out[`border-${side}-color`];
        delete out[`border-${side}-style`];
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
    const d = declOf(n, "d");
    const m = declOf(n, "m");
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
    const addText = (slot, text, words, role, link) => {
      textN += 1;
      blocks.push({ slot, repere: `${role} — ${plural(words, "mot")}`, text: brief(text, words, role), image: "", link: "" });
      return link ? slot : null;
    };

    function html(it, parentTag) {
      if (it.text != null) {
        const slot = `t${it.pid}_${it.k}`;
        addText(slot, it.text, it.words, "Texte");
        return textSlot(slot);
      }
      const n = it.n;
      const cls = classOf(n);
      used.add(cls);
      const edge = [
        it.cutTop ? "padding-top:0;margin-top:0;border-top-width:0;" : "",
        it.cutBottom ? "padding-bottom:0;margin-bottom:0;border-bottom-width:0;" : "",
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
          `{%- if b.settings.image != blank -%}<img class="${classAttr}" src="{{ b.settings.image | image_url: width: ${Math.min(2000, Math.max(200, n.box.w * 2))} }}" alt="{{ b.settings.text | escape }}" loading="lazy"${styleAttr}>{%- else -%}<div class="${classAttr} atl-vide"${styleAttr}></div>{%- endif -%}`,
        );
      }
      if (["input", "select", "textarea"].includes(tag)) {
        if (tag === "input") return `<input class="${classAttr}" type="${esc(n.type || "text")}" disabled>`;
        return `<${tag} class="${classAttr}" disabled></${tag}>`;
      }
      let open = `<${tag} class="${classAttr}"`;
      let slotLink = null;
      if (tag === "a") {
        if (n.text != null) {
          slotLink = `s${n.id}`;
          open += ` href="${"{%- for b in section.blocks -%}{%- if b.settings.slot == '" + slotLink + "' -%}{{ b.settings.link | default: '#' }}{%- endif -%}{%- endfor -%}"}"`;
        } else open += ` href="#"`;
      }
      if (n.bgImage) {
        const slot = `b${n.id}`;
        blocks.push({ slot, repere: `Image de fond ${n.box.w}×${n.box.h}`, text: "", image: fileOf(n) ?? "", link: "" });
        open += ` style="${edge}${slotLoop(slot, "{%- if b.settings.image != blank -%}background-image:url({{ b.settings.image | image_url: width: 2000 }});background-size:cover;background-position:center;{%- endif -%}")}"`;
      } else open += styleAttr;
      open += ">";
      if (["br", "hr", "img", "wbr"].includes(tag)) return open;
      let inner = "";
      if (n.text != null) {
        const slot = slotLink ?? `s${n.id}`;
        addText(slot, n.text, n.words, roleOf(n), Boolean(slotLink));
        inner = textSlot(slot);
      } else if (!it.empty) {
        inner = (it.kids ?? []).map((k, i) => (k.text != null ? html({ ...k, pid: n.id, k: i }, tag) : html(k, tag))).join("");
      }
      return `${open}${inner}</${tag}>`;
    }
    const liquid = html(piece);
    return { liquid, blocks, used };
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
    const { liquid, blocks, used } = renderSection(piece, id);
    const scope = `.atl-${id}`;
    const rules = [...used].map((c) => `${scope} .${c.name}${c.name === classOf(body).name ? `, ${scope}.${c.name}` : ""}{${declText(c.d)}}`);
    const mrules = [...used].filter((c) => Object.keys(c.m).length).map((c) => `${scope} .${c.name}${c.name === classOf(body).name ? `, ${scope}.${c.name}` : ""}{${declText(c.m)}}`);
    const css = [
      fonts,
      `/* Copie de ${label} — partie ${i + 1}. Styles relevés sur la page d'origine (ordinateur, puis mobile). */`,
      `${scope}{display:block;background:${snap.htmlBackground && !/rgba\(.*,\s*0\)$/.test(snap.htmlBackground) ? snap.htmlBackground : "transparent"}}`,
      `${scope} :where(*:not(svg, svg *)){all:revert}`,
      `${scope} img{display:inline-block}`,
      `${scope} .atl-vide{background:repeating-linear-gradient(45deg,#eee 0 10px,#f7f7f7 10px 20px)}`,
      ...rules,
      mrules.length ? `@media (max-width: 749px){\n${mrules.join("\n")}\n}` : "",
    ].join("\n");
    const schema = {
      name: `Atl · ${slug.replace(/^adv-/, "").slice(0, 12)} ${i + 1}`,
      tag: "section",
      settings: [{ type: "paragraph", content: "Copie au design identique d'une page importée. Chaque bloc est un emplacement de la page : modifie son texte, son image ou son lien." }],
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
    };
    return { id, schema, template: liquid, css, meta, blocks };
  });
  return { sections, slots: sections.reduce((n, s) => n + s.blocks.length, 0), classes: classes.size };
}
