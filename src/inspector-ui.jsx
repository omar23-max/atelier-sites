import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { sections } from "./engine/sections.js";
import { fieldsFor } from "./engine/puck-config.jsx";
import { blocksKey, editableSettings, normalizeProps } from "./engine/render.js";
import { familyOf } from "./engine/families.js";
import { StyleEditor } from "./style-editor-ui.jsx";
import { ROOT_ZONE, Thumb, scrollCanvasTo, usePuckSelect } from "./library-ui.jsx";
import { designById } from "./engine/designs.js";
import { consigneLangue, langueOf } from "./engine/langue.js";

// Panneau de droite, façon éditeur de thème Shopify :
//   - en haut, l'arbre de la page : sections, sous-sections (groupes,
//     colonnes), puis chaque texte, titre, bouton, lien, image et vidéo ;
//   - en bas, les réglages de ce qui est choisi ;
//   - le choix est lié dans les deux sens : un clic dans l'arbre éclaire
//     l'élément dans l'aperçu (et seulement lui), un clic dans l'aperçu
//     ouvre et éclaire sa ligne dans l'arbre ;
//   - glisser-déposer (sections entre elles, éléments entre frères) ;
//   - clic droit : Retravailler avec l'IA, Monter, Descendre, Dupliquer, Supprimer.
// Les sections copiées d'une page (meta.arbre) donnent leur arbre détaillé et
// l'ordre de leurs éléments (réglage « ordres ») ; les autres listent leurs blocs.

const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
const pageName = new URLSearchParams(location.search).get("page");

const TYPE = {
  titre: { icon: "H", label: "Titre" },
  texte: { icon: "¶", label: "Texte" },
  bouton: { icon: "▭", label: "Bouton" },
  lien: { icon: "↗", label: "Lien" },
  image: { icon: "🖼", label: "Image" },
  "image-fond": { icon: "🖼", label: "Image de fond" },
  video: { icon: "▶", label: "Vidéo" },
  bloc: { icon: "▣", label: "Bloc" },
};
const GROUP_ICON = { colonnes: "▥", colonne: "▯", groupe: "▤" };
const plain = (html) =>
  String(html ?? "")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
const isImageType = (t) => t === "image" || t === "image-fond" || t === "video";

// ---- Ordre des éléments d'une copie : « g12=2,0,1;g40=… » ----
const parseOrders = (s) =>
  Object.fromEntries(
    String(s ?? "")
      .split(";")
      .filter((p) => p.includes("="))
      .map((p) => {
        const [g, v] = p.split("=");
        return [g, v.split(",").map(Number)];
      }),
  );
const writeOrders = (o) =>
  Object.entries(o)
    .map(([g, v]) => `${g}=${v.join(",")}`)
    .join(";");
const orderOf = (orders, gid, size) => (orders[gid]?.length === size ? orders[gid] : Array.from({ length: size }, (_, i) => i));

// ---- Modèle : arbre d'une section ----
// Feuille : { key, type, label, k, parent } ; groupe : { group, id, gid, size, label, kind, children, k, parent }.
// parent : le conteneur où l'élément peut changer de place (gid, ou « @<type> »
// pour les blocs d'une section du catalogue).
function treeForItem(item) {
  const section = byId[item.type];
  if (!section) return [];
  const props = normalizeProps(section, item.props);
  if (section.meta.arbre) {
    const blocks = props.blocks_element ?? [];
    const bySlot = new Map(blocks.map((b, i) => [b.slot, i]));
    const orders = parseOrders(props.ordres);
    const walk = (n, parent) => {
      if (!n) return null;
      if (n.group) {
        const id = n.gid ?? `w${parent}_${n.k}`;
        let children = n.children.map((c) => walk(c, n.gid ?? null)).filter(Boolean);
        if (n.gid && n.size) {
          const ord = orderOf(orders, n.gid, n.size);
          const pos = (c) => (c.k == null ? -1 : ord.indexOf(c.k));
          children = [...children].sort((a, b) => pos(a) - pos(b));
        }
        children = textRuns(children, n.gid ?? null);
        return children.length ? { group: true, id, gid: n.gid ?? null, size: n.size ?? 0, kind: n.kind, label: n.label, children, k: n.k, parent } : null;
      }
      const i = bySlot.get(n.slot);
      if (i == null) return null;
      const b = blocks[i];
      return {
        key: n.slot,
        k: n.k,
        parent,
        type: n.type,
        // Nom de l'élément (Titre H2, Paragraphe, Lien, Bouton (CTA), Question…), relevé par copie.mjs.
        name: n.name ?? TYPE[n.type]?.label,
        // Lien qui contient cet élément (copies récentes) : son adresse et son style.
        lien: n.lien ?? null,
        text: b.text,
        image: b.image,
        size: n.size,
        label: isImageType(n.type) ? `${TYPE[n.type].label}${n.size ? ` ${n.size}` : ""}` : plain(b.text),
      };
    };
    const root = walk(section.meta.arbre, null);
    return root ? (root.group ? root.children : [root]) : [];
  }
  // Section du catalogue : ses blocs, par type (déplaçables entre blocs du même type).
  const leaves = [];
  for (const block of section.schema.blocks ?? []) {
    (props[blocksKey(block.type)] ?? []).forEach((values, i) => {
      const defs = editableSettings(block.settings);
      const textDef = defs.find((s) => ["text", "textarea", "richtext", "inline_richtext"].includes(s.type) && values[s.id]);
      const imageDef = defs.find((s) => s.type === "image_picker");
      leaves.push({
        key: `${block.type}:${i}`,
        k: i,
        parent: `@${block.type}`,
        type: imageDef && !textDef ? "image" : "bloc",
        image: imageDef ? values[imageDef.id] : null,
        label: `${block.name}${textDef ? ` · ${plain(values[textDef.id])}` : ` ${i + 1}`}`,
      });
    });
  }
  return leaves;
}

// Paragraphes qui se suivent (sans titre, image ni bouton entre eux) : un
// seul élément « Texte », comme sur Whitelabeler. Chaque paragraphe garde son
// emplacement dans la page ; seul l'éditeur les regroupe.
function textRuns(children, parent) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length > 1) out.push({ group: true, run: true, id: `t:${run[0].key}`, gid: null, size: 0, kind: "texte", label: run.map((l) => plain(l.text)).join(" "), children: run, k: null, parent });
    else out.push(...run);
    run = [];
  };
  for (const c of children) {
    if (!c.group && c.type === "texte" && plain(c.text)) run.push(c);
    else (flush(), out.push(c));
  }
  flush();
  return out;
}
const runHtml = (leaves) => leaves.map((l) => l.text ?? "").join("<br><br>");
// Texte modifié → un morceau par paragraphe (les morceaux en trop vont dans le
// dernier, les paragraphes en trop deviennent vides).
function splitRun(html, leaves) {
  const parts = String(html ?? "").split(/(?:\s*<br\s*\/?>\s*){2,}/i);
  return Object.fromEntries(leaves.map((l, i) => [l.key, { text: i === leaves.length - 1 ? parts.slice(i).join("<br><br>") : (parts[i] ?? "") }]));
}

const leavesOf = (nodes) => nodes.flatMap((n) => (n.group ? leavesOf(n.children) : [n]));
// Chemin (groupes ancêtres) jusqu'au nœud qui vérifie `test`.
function pathTo(nodes, test, path = []) {
  for (const n of nodes) {
    if (test(n)) return [...path, n];
    if (n.group) {
      const found = pathTo(n.children, test, [...path, n]);
      if (found) return found;
    }
  }
  return null;
}
const sameNode = (sel) => (n) => (sel.key ? n.key === sel.key : sel.group ? n.group && n.id === sel.group : false);

// Textes et images retravaillables d'une section (ou d'une partie : `keys`).
export function aiTargets(item, keys = null) {
  const section = byId[item.type];
  const props = normalizeProps(section, item.props);
  const texts = [];
  const images = [];
  if (section.meta.arbre) {
    const leaves = leavesOf(treeForItem(item)).filter((l) => !keys || keys.includes(l.key));
    for (const l of leaves) {
      if (isImageType(l.type)) {
        if (l.image) images.push({ key: l.key, src: l.image, size: l.size });
      } else if (plain(l.text)) texts.push({ id: l.key, text: l.text });
    }
    return { texts, images };
  }
  const textual = (s) => ["text", "textarea", "richtext", "inline_richtext"].includes(s.type);
  if (!keys) {
    for (const s of editableSettings(section.schema.settings)) {
      if (textual(s) && plain(props[s.id])) texts.push({ id: `@:${s.id}`, text: props[s.id] });
      if (s.type === "image_picker" && props[s.id]) images.push({ key: `@:${s.id}`, src: props[s.id] });
    }
  }
  for (const block of section.schema.blocks ?? []) {
    (props[blocksKey(block.type)] ?? []).forEach((values, i) => {
      const key = `${block.type}:${i}`;
      if (keys && !keys.includes(key)) return;
      for (const s of editableSettings(block.settings)) {
        if (textual(s) && plain(values[s.id])) texts.push({ id: `${key}:${s.id}`, text: values[s.id] });
        if (s.type === "image_picker" && values[s.id]) images.push({ key: `${key}:${s.id}`, src: values[s.id] });
      }
    });
  }
  return { texts, images };
}

// Écrit des valeurs (clé → { text } ou { image }) dans les props d'une section.
export function applyValues(item, values) {
  const section = byId[item.type];
  const props = normalizeProps(section, item.props);
  if (section.meta.arbre) {
    const blocks = (props.blocks_element ?? []).map((b) => {
      const v = values[b.slot];
      return v
        ? { ...b, ...(v.text != null ? { text: v.text } : {}), ...(v.image != null ? { image: v.image } : {}), ...(v.style != null ? { style: v.style } : {}) }
        : b;
    });
    return { ...item, props: { ...props, blocks_element: blocks } };
  }
  const next = { ...props };
  for (const [key, v] of Object.entries(values)) {
    const val = v.text ?? v.image;
    const parts = key.split(":");
    if (parts[0] === "@") next[parts[1]] = val;
    else {
      const [type, i, setting] = parts;
      const k = blocksKey(type);
      next[k] = next[k].map((b, j) => (j === Number(i) ? { ...b, [setting]: val } : b));
    }
  }
  return { ...item, props: next };
}

// Déplace l'enfant `k` avant (ou après) l'enfant `target` dans son conteneur.
function moveInItem(item, parent, k, target, after) {
  const section = byId[item.type];
  const props = normalizeProps(section, item.props);
  if (parent?.startsWith("@")) {
    const key = blocksKey(parent.slice(1));
    const list = [...(props[key] ?? [])];
    const [moved] = list.splice(k, 1);
    let at = list.indexOf((props[key] ?? [])[target]);
    if (after) at += 1;
    list.splice(at, 0, moved);
    return { ...item, props: { ...props, [key]: list } };
  }
  const group = pathTo(treeForItem(item), (n) => n.group && n.gid === parent)?.at(-1);
  const orders = parseOrders(props.ordres);
  const size = group?.size ?? Math.max(k, target) + 1;
  const ord = orderOf(orders, parent, size).filter((x) => x !== k);
  let at = ord.indexOf(target);
  if (after) at += 1;
  ord.splice(at, 0, k);
  return { ...item, props: { ...props, ordres: writeOrders({ ...orders, [parent]: ord }) } };
}

// ---- Aperçu : surbrillance et défilement ----
function canvasFrame() {
  for (const frame of document.querySelectorAll("iframe")) {
    if (frame.contentDocument?.querySelector("[data-atl-id]")) return frame;
  }
  return null;
}
// Élément de l'aperçu d'un nœud : texte/image (data-atl-slot), groupe
// (data-atl-group), ou, pour une colonne sans conteneur propre, son contenu.
function domOf(sectionId, node) {
  const root = canvasFrame()?.contentDocument.querySelector(`[data-atl-id="${CSS.escape(sectionId)}"]`);
  if (!root || !node) return null;
  if (node.key) return root.querySelector(`[data-atl-slot="${CSS.escape(node.key)}"]`);
  if (node.gid) return root.querySelector(`[data-atl-group="${CSS.escape(node.gid)}"]`);
  if (node.group) return domOf(sectionId, node.children[0]);
  return null;
}
function mark(el, cls) {
  canvasFrame()?.contentDocument.querySelectorAll(`.${cls}`).forEach((e) => e.classList.remove(cls));
  el?.classList.add(cls);
}


// ---- Reconstruire une section avec l'IA (aussi utilisé par le Page Score) ----
// « ADN » de la page : palette et polices du design.md, plus un extrait du CSS
// d'une partie copiée voisine (rayons, ombres, boutons, tailles) comme modèle.
// produit : les textes sont en plus réécrits pour ce produit.
export function adaptInstructionFor(data, sectionId, { produit = null } = {}) {
  const root = data.root?.props ?? {};
  const design = designById[root.design];
  const index = data.content.findIndex((c) => c.props.id === sectionId);
  const neighbours = [index - 1, index + 1, index - 2, index + 2, index - 3, index + 3].map((i) => data.content[i]).filter((c) => c && byId[c.type]?.meta.pageSpecific);
  const css = neighbours[0] ? byId[neighbours[0].type].css.replace(/@font-face\s*{[^}]*}/g, "").slice(0, 6000) : "";
  const colors = design?.tokens?.couleurs ? Object.entries(design.tokens.couleurs).map(([r, c]) => `${r} ${c}`).join(", ") : "";
  const fonts = [root.font_heading || design?.tokens?.polices?.titres, root.font_body || design?.tokens?.polices?.texte].filter(Boolean).join(" / ");
  return [
    "Adapte cette section au style du reste de la page, pour qu'elle s'y fonde : mêmes couleurs, polices, tailles de texte, espacements, coins arrondis, ombres et style de boutons.",
    colors && `Palette de la page (rôle couleur) : ${colors}.`,
    fonts && `Polices de la page (titres / texte) : ${fonts}.`,
    css && `Extrait du CSS d'une section voisine, à prendre comme modèle de style (pas de structure) :\n${css}`,
    consigneLangue(root),
    produit
      ? `Réécris aussi tous les textes pour le produit « ${produit} »${root.profil ? `, pour ce profil de client : ${root.profil}` : ""} : même longueur, même rôle (titre, liste, avis…), pas de chiffres inventés. Garde les images et l'ordre du contenu.`
      : "Garde tous les textes, toutes les images et l'ordre du contenu.",
  ]
    .filter(Boolean)
    .join("\n");
}

// Refait une section : l'IA rend HTML + CSS, qui deviennent une section de la
// page (sections/<page>-ia-…). reload : false pour enchaîner plusieurs
// sections ; on reçoit alors { sectionId, item } et c'est à l'appelant
// d'enregistrer la page puis de la recharger.
export async function rebuildSectionWith(getPuck, sectionId, instruction, reference, { reload = true } = {}) {
  const data = getPuck().appState.data;
  const item = data.content.find((c) => c.props.id === sectionId);
  const section = byId[item.type];
  const root = canvasFrame()?.contentDocument.querySelector(`[data-atl-id="${CSS.escape(sectionId)}"]`);
  if (!root) throw new Error("Section introuvable dans l'aperçu.");
  const html = root.querySelector(":scope > div:last-child")?.innerHTML ?? root.innerHTML;
  const res = await fetch("/api/ia/section", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, css: section.css, prompt: `${instruction}
${consigneLangue(data.root?.props)}`, reference, rootClass: "ROOT" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  const id = `${pageName}-ia-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 80);
  const label = (section.meta.label ?? section.id).replace(/ — refaite par l'IA$/, "");
  const made = htmlToSection(body.html, body.css, id, "ROOT", label, pageName);
  const saved = await fetch("/api/sections-ia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, schema: made.schema, template: made.template, css: made.css, meta: { ...made.meta, family: section.meta.family ?? made.meta.family } }),
  });
  if (!saved.ok) throw new Error((await saved.json()).error);
  const replacement = { sectionId, item: { type: id, props: { id, blocks_element: made.blocks } } };
  if (!reload) return replacement;
  await savePageWith(getPuck, [replacement]);
  location.reload();
}

// Enregistre la page avec des sections remplacées (copie de sécurité avant).
export async function savePageWith(getPuck, replacements) {
  await fetch(`/api/pages/${pageName}/snapshot`, { method: "POST" });
  const data = getPuck().appState.data;
  const byOld = new Map(replacements.map((r) => [r.sectionId, r.item]));
  const content = data.content.map((c) => byOld.get(c.props.id) ?? c);
  const put = await fetch(`/api/pages/${pageName}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, content }) });
  if (!put.ok) throw new Error((await put.json()).error);
}

// ---- Panneau ----
export function Inspector({ children }) {
  const getPuck = useGetPuck();
  const content = usePuckSelect((s) => s.appState.data.content);
  const selected = usePuckSelect((s) => s.selectedItem);
  // sel : { sectionId, key? (élément), group? (groupe) } ou { page: true }.
  const [sel, setSel] = useState(null);
  const [openSec, setOpenSec] = useState({});
  const [openGroups, setOpenGroups] = useState({});
  const [menu, setMenu] = useState(null);
  const [ai, setAi] = useState(null);
  // Action IA rapide (clic droit) : petit indicateur flottant pendant / après.
  const [quick, setQuick] = useState(null);
  const treeRef = useRef(null);
  const editRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const selRef = useRef(sel);
  selRef.current = sel;
  // Puck affiche ce panneau à deux endroits (dont un caché) : seul le panneau
  // visible écoute l'aperçu, sinon chaque clic compterait deux fois.
  const rootRef = useRef(null);
  // Le panneau de droite de Puck (pas sa copie cachée) : c'est lui qui pilote.
  const isMain = () => Boolean(rootRef.current?.closest('[class*="Sidebar--right"]'));
  const visible = () => isMain() && (rootRef.current?.getBoundingClientRect().width ?? 0) > 0;

  const indexOf = (id) => content.findIndex((c) => c.props.id === id);
  const itemOf = (id) => getPuck().appState.data.content[indexOf(id)];
  const nodeOf = (s) => (s?.sectionId && (s.key || s.group) && content[indexOf(s.sectionId)] ? pathTo(treeForItem(content[indexOf(s.sectionId)]), sameNode(s))?.at(-1) : null);

  function choose(next, { scroll = true } = {}) {
    // Un paragraphe d'un texte regroupé : c'est tout le texte qui est choisi.
    if (next?.key && next.sectionId && content[indexOf(next.sectionId)]) {
      const owner = pathTo(treeForItem(content[indexOf(next.sectionId)]), sameNode(next))?.at(-2);
      if (owner?.run) next = { sectionId: next.sectionId, group: owner.id, fromTree: next.fromTree };
    }
    // Tout de suite : la sélection de section que Puck déclenche ensuite ne
    // doit pas effacer l'élément choisi.
    selRef.current = next;
    setSel(next);
    if (!next?.sectionId) return;
    const index = indexOf(next.sectionId);
    if (index < 0) return;
    if (getPuck().appState.ui.itemSelector?.index !== index) getPuck().dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
    // Ouvre le chemin dans l'arbre.
    const path = pathTo(treeForItem(content[index]), sameNode(next)) ?? [];
    setOpenSec((o) => ({ ...o, [next.sectionId]: true }));
    setOpenGroups((o) => ({ ...o, ...Object.fromEntries(path.filter((n) => n.group).map((n) => [`${next.sectionId}/${n.id}`, true])) }));
    if (scroll && !next.key && !next.group) scrollCanvasTo(next.sectionId);
  }

  // Aperçu : seul l'élément choisi s'éclaire (pas toute la section) ; l'arbre
  // fait défiler sa ligne.
  useEffect(() => {
    const doc = canvasFrame()?.contentDocument;
    const sub = Boolean(sel?.key || sel?.group);
    // Sur <html> : la classe de <body> est réécrite par ailleurs.
    if (doc) sub ? doc.documentElement.setAttribute("data-atl-sub", "") : doc.documentElement.removeAttribute("data-atl-sub");
    const node = sub ? nodeOf(sel) : null;
    const el = node ? domOf(sel.sectionId, node) : null;
    mark(el, "atl-hl-on");
    if (node?.run) node.children.forEach((c) => domOf(sel.sectionId, c)?.classList.add("atl-hl-on"));
    if (el && sel.fromTree) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const row = treeRef.current?.querySelector(".is-chosen");
    row?.scrollIntoView({ block: "nearest" });
  }, [sel, content]);

  // Comme Whitelabeler : l'éditeur s'ouvre à gauche (à côté du rail) quand
  // une section, un élément ou les réglages de la page sont choisis, et se
  // referme sinon ; un outil du rail ouvert le referme.
  useEffect(() => {
    if (!isMain()) return;
    document.documentElement.toggleAttribute("data-atl-edit", Boolean(sel));
    if (sel) window.dispatchEvent(new CustomEvent("atl-left-tool", { detail: null }));
  }, [sel]);
  useEffect(() => {
    const onClose = () => isMain() && selRef.current && close();
    const onPage = () => isMain() && (getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } }), setSel({ page: true }));
    window.addEventListener("atl-close-editor", onClose);
    window.addEventListener("atl-open-page-settings", onPage);
    return () => {
      window.removeEventListener("atl-close-editor", onClose);
      window.removeEventListener("atl-open-page-settings", onPage);
      if (isMain()) document.documentElement.removeAttribute("data-atl-edit");
    };
  }, []);

  // Section choisie dans l'aperçu (hors élément) : elle devient le choix.
  useEffect(() => {
    if (!selected) return;
    const id = selected.props.id;
    if (selRef.current?.sectionId !== id) choose({ sectionId: id }, { scroll: false });
  }, [selected?.props?.id]);

  // Clics dans l'aperçu : l'élément (ou le groupe) sous la souris est choisi ;
  // clic droit : le menu.
  useEffect(() => {
    let doc = null;
    // Puck rend l'aperçu insensible à la souris : on cherche l'élément dont
    // le cadre contient le point cliqué (le plus petit gagne).
    const under = (e, sel) => {
      let best = null;
      let area = Infinity;
      for (const x of doc.querySelectorAll(sel)) {
        const r = x.getBoundingClientRect();
        if (!r.width || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue;
        if (r.width * r.height < area) {
          best = x;
          area = r.width * r.height;
        }
      }
      return best;
    };
    const target = (e) => {
      const sec = under(e, "[data-atl-id]");
      if (!sec) return null;
      const el = under(e, `[data-atl-id="${CSS.escape(sec.dataset.atlId)}"] [data-atl-slot], [data-atl-id="${CSS.escape(sec.dataset.atlId)}"] [data-atl-group]`);
      return { sectionId: sec.dataset.atlId, key: el?.dataset.atlSlot ?? undefined, group: el?.dataset.atlGroup ?? undefined };
    };
    const onClick = (e) => {
      // Un clic lancé par un script de la page (défilement automatique d'un
      // bandeau, d'un carrousel) n'est pas un clic de l'utilisateur : le
      // bouton le reçoit, mais il s'arrête à la section (Puck ne doit pas
      // sélectionner la section pour autant).
      if (!e.isTrusted) {
        const sec = e.target?.closest?.("[data-atl-id]");
        sec?.addEventListener("click", (ev) => ev.stopPropagation(), { once: true });
        return;
      }
      if (!isMain() || editRef.current) return;
      const t = target(e);
      if (t) setTimeout(() => choose(t, { scroll: false }), 0);
    };
    // Double-clic sur un texte : on écrit directement dans la page.
    const onDouble = (e) => {
      if (!isMain() || editRef.current) return;
      const t = target(e);
      if (!t?.key) return;
      e.preventDefault();
      choose(t, { scroll: false });
      setTimeout(() => startEdit(t, { x: e.clientX, y: e.clientY }), 0);
    };
    const onMenu = (e) => {
      if (!isMain()) return;
      const t = target(e);
      if (!t) return;
      e.preventDefault();
      const frame = canvasFrame();
      const r = frame.getBoundingClientRect();
      const scale = r.width / frame.offsetWidth || 1;
      choose(t, { scroll: false });
      setMenu({ x: r.left + e.clientX * scale, y: r.top + e.clientY * scale, ...t });
    };
    // Pas d'éclairage au survol : seul l'élément choisi s'éclaire.
    const attach = () => {
      const next = canvasFrame()?.contentDocument ?? null;
      if (next === doc) return;
      doc?.removeEventListener("click", onClick, true);
      doc?.removeEventListener("contextmenu", onMenu, true);
      doc?.removeEventListener("dblclick", onDouble, true);
      doc = next;
      doc?.addEventListener("click", onClick, true);
      doc?.addEventListener("contextmenu", onMenu, true);
      doc?.addEventListener("dblclick", onDouble, true);
    };
    attach();
    const timer = setInterval(attach, 1000);
    return () => {
      clearInterval(timer);
      doc?.removeEventListener("click", onClick, true);
      doc?.removeEventListener("contextmenu", onMenu, true);
      doc?.removeEventListener("dblclick", onDouble, true);
    };
  }, [content]);

  function run(action, nextIndex) {
    const { dispatch } = getPuck();
    dispatch(action);
    dispatch({ type: "setUi", ui: { itemSelector: nextIndex == null ? null : { index: nextIndex, zone: ROOT_ZONE } } });
  }
  function replaceItem(id, data) {
    const index = indexOf(id);
    if (index >= 0) getPuck().dispatch({ type: "replace", destinationIndex: index, destinationZone: ROOT_ZONE, data });
  }
  const updateValues = (id, values) => itemOf(id) && replaceItem(id, applyValues(itemOf(id), values));
  const updateProps = (id, props) => itemOf(id) && replaceItem(id, { ...itemOf(id), props });

  // Déplacer : sections entre elles, éléments entre frères d'un même conteneur.
  function moveNode(sectionId, node, target, after) {
    if (!node || !target || node === target || node.parent !== target.parent || node.k == null || target.k == null || !node.parent) return;
    replaceItem(sectionId, moveInItem(itemOf(sectionId), node.parent, node.k, target.k, after));
  }
  function moveSection(fromId, toId, after) {
    const from = indexOf(fromId);
    let to = indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    if (after) to += 1;
    if (from < to) to -= 1;
    run({ type: "reorder", sourceIndex: from, destinationIndex: to, destinationZone: ROOT_ZONE }, to);
  }
  function siblingsOf(sectionId, node) {
    const nodes = treeForItem(itemOf(sectionId));
    const path = pathTo(nodes, (n) => n === node || (node.key ? n.key === node.key : n.group && n.id === node.id)) ?? [];
    const parentNode = path.at(-2);
    return (parentNode ? parentNode.children : nodes).filter((n) => n.parent === node.parent && n.k != null);
  }
  function step(sectionId, node, dir) {
    const sibs = siblingsOf(sectionId, node);
    const i = sibs.findIndex((n) => (node.key ? n.key === node.key : n.id === node.id));
    const other = sibs[i + dir];
    if (other) moveNode(sectionId, sibs[i], other, dir > 0);
  }

  // Action IA en un clic depuis le menu contextuel : même pipeline que la
  // fenêtre (gpt-5.4-mini via /api/ia/textes), avec une consigne prête à l'emploi.
  async function quickAi(sectionId, keys, prompt, label) {
    const item = content[indexOf(sectionId)];
    if (!item) return;
    const { texts } = aiTargets(item, keys);
    if (!texts.length) {
      setQuick({ error: "Pas de texte à retravailler ici." });
      return setTimeout(() => setQuick(null), 2600);
    }
    setQuick({ label });
    try {
      const root = getPuck().appState.data.root?.props ?? {};
      const res = await fetch("/api/ia/textes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: texts,
          prompt: `${prompt}\n${consigneLangue(root)}`,
          contexte: { produit: root.produit ?? "", profil: root.profil ?? "", typeDePage: root.pageType ?? "" },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      updateValues(sectionId, Object.fromEntries(body.items.map((x) => [x.id, { text: x.text }])));
      setQuick({ done: label });
    } catch (e) {
      setQuick({ error: e.message });
    }
    setTimeout(() => setQuick(null), 2600);
  }

  const menuItems = (m) => {
    const index = indexOf(m.sectionId);
    const item = content[index];
    if (!item) return [];
    const section = byId[item.type];
    const node = nodeOf(m);
    const keys = node ? (node.group ? leavesOf(node.children).map((l) => l.key) : [node.key]) : null;
    const items = [{ label: "✨ Retravailler avec l'IA…", action: () => setAi({ sectionId: m.sectionId, keys, label: node?.group ? node.label : null }) }];
    // Actions rapides : appliquées directement, sans fenêtre.
    if (aiTargets(item, keys).texts.length) {
      items.push(
        { sep: true },
        ...QUICK_ACTIONS.map((q) => ({ label: `✨ ${q.label}`, action: () => quickAi(m.sectionId, keys, q.prompt, q.label) })),
      );
    }
    if (node) {
      const sibs = siblingsOf(m.sectionId, node);
      const i = sibs.findIndex((n) => (node.key ? n.key === node.key : n.id === node.id));
      items.push(
        { label: "Modifier", action: () => choose({ sectionId: m.sectionId, key: node.key, group: node.group ? node.id : undefined, fromTree: true }) },
        { sep: true },
        { label: "Monter", disabled: i <= 0, action: () => step(m.sectionId, node, -1) },
        { label: "Descendre", disabled: i < 0 || i >= sibs.length - 1, action: () => step(m.sectionId, node, 1) },
      );
    } else {
      items.push(
        { label: "Réglages de la section", action: () => choose({ sectionId: m.sectionId }) },
        { sep: true },
        { label: "Monter", disabled: index === 0, action: () => run({ type: "reorder", sourceIndex: index, destinationIndex: index - 1, destinationZone: ROOT_ZONE }, index - 1) },
        { label: "Descendre", disabled: index === content.length - 1, action: () => run({ type: "reorder", sourceIndex: index, destinationIndex: index + 1, destinationZone: ROOT_ZONE }, index + 1) },
        { label: "Dupliquer", action: () => run({ type: "duplicate", sourceIndex: index, sourceZone: ROOT_ZONE }, index + 1) },
        {
          label: "Supprimer la section",
          danger: true,
          action: () => confirm(`Supprimer la section « ${section?.meta.label ?? item.type} » de la page ?`) && (run({ type: "remove", index, zone: ROOT_ZONE }, null), setSel(null)),
        },
      );
    }
    return items;
  };

  const selNode = nodeOf(sel);
  const close = () => {
    finishEdit();
    setSel(null);
    getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
  };

  // ---- Écrire directement dans la page ----
  // Le texte choisi devient modifiable dans l'aperçu ; Échap, un clic ailleurs
  // ou ✓ enregistre. Les raccourcis de Puck sont coupés pendant la frappe.
  function startEdit(target, point) {
    const node = nodeOf(target);
    const el = node && !node.group && !isImageType(node.type) ? domOf(target.sectionId, node) : null;
    if (!el) return;
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    const before = el.innerHTML;
    el.contentEditable = "true";
    doc.documentElement.setAttribute("data-atl-editing", "");
    el.focus();
    const range = point && doc.caretRangeFromPoint?.(point.x, point.y);
    if (range) {
      const s = win.getSelection();
      s.removeAllRanges();
      s.addRange(range);
    }
    const keys = (e) => {
      if (!el.contains(e.target)) return;
      e.stopPropagation();
      if (e.key === "Escape") finishEdit();
    };
    const blur = () => setTimeout(() => editRef.current?.el === el && finishEdit(), 120);
    win.addEventListener("keydown", keys, true);
    el.addEventListener("blur", blur);
    editRef.current = { el, key: node.key, sectionId: target.sectionId, before, keys, blur, win };
    setEditing(true);
  }
  function finishEdit() {
    const ed = editRef.current;
    if (!ed) return;
    editRef.current = null;
    ed.win.removeEventListener("keydown", ed.keys, true);
    ed.el.removeEventListener("blur", ed.blur);
    ed.el.contentEditable = "false";
    ed.el.ownerDocument.documentElement.removeAttribute("data-atl-editing");
    const html = cleanHtml(ed.el.innerHTML);
    setEditing(false);
    if (html !== cleanHtml(ed.before)) updateValues(ed.sectionId, { [ed.key]: { text: html } });
  }
  function format(cmd) {
    const ed = editRef.current;
    if (!ed) return;
    if (cmd === "done") return finishEdit();
    ed.el.focus();
    if (cmd === "link") {
      const url = prompt("Lien (https://… ou /products/…) :");
      if (url) ed.el.ownerDocument.execCommand("createLink", false, url);
      return;
    }
    ed.el.ownerDocument.execCommand(cmd, false);
  }

  // ---- « ADN » de la page : une section ajoutée prend son style ----
  // Palette et polices du design.md de la page, plus un extrait du CSS d'une
  // partie copiée voisine (rayons, ombres, boutons, tailles) comme modèle.
  const adaptToPage = (sectionId) => rebuildSectionWith(getPuck, sectionId, adaptInstructionFor(getPuck().appState.data, sectionId), null);
  const rebuildSection = (sectionId, instruction, reference) => rebuildSectionWith(getPuck, sectionId, instruction, reference);

  return (
    <div className="atl-insp" ref={rootRef}>
      {/* Comme Whitelabeler : soit la structure de la page, soit les réglages
          de l'élément choisi, jamais les deux (un seul ascenseur). */}
      {!sel && <TreeView
        content={content}
        sel={sel}
        openSec={openSec}
        setOpenSec={setOpenSec}
        openGroups={openGroups}
        setOpenGroups={setOpenGroups}
        onChoose={(s) => choose({ ...s, fromTree: true })}
        onPage={() => (getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } }), setSel({ page: true }))}
        onMenu={(m) => (choose({ sectionId: m.sectionId, key: m.key, group: m.group }, { scroll: false }), setMenu(m))}
        onMove={moveNode}
        onMoveSection={moveSection}
        treeRef={treeRef}
      />}
      <div className="atl-insp__detail">
        {sel?.page && (
          <div className="atl-insp__panel">
            <PanelHead onBack={close} title="Réglages de la page" sub="Titre, type, produit, polices" />
            <RewritePage content={content} root={getPuck().appState.data.root?.props ?? {}} onApply={(id, values) => updateValues(id, values)} />
            <TranslatePage
              content={content}
              root={getPuck().appState.data.root?.props ?? {}}
              onApply={(id, values) => updateValues(id, values)}
              onLangue={(code) => {
                const { appState, dispatch } = getPuck();
                dispatch({ type: "replaceRoot", root: { ...appState.data.root, props: { ...appState.data.root.props, langue: code } } });
              }}
            />
            <div className="atl-insp__puck">{children}</div>
          </div>
        )}
        {sel?.sectionId && !sel.key && !sel.group && content[indexOf(sel.sectionId)] &&
          (byId[content[indexOf(sel.sectionId)].type]?.meta.arbre ? (
            <CopySectionSettings
              key={sel.sectionId}
              item={content[indexOf(sel.sectionId)]}
              onBack={close}
              onChange={(props) => updateProps(sel.sectionId, props)}
              onAiTexts={() => setAi({ sectionId: sel.sectionId, keys: null })}
              onRebuild={(instruction, reference) => rebuildSection(sel.sectionId, instruction, reference)}
              onValues={(values) => updateValues(sel.sectionId, values)}
              onOpen={(key) => setSel({ sectionId: sel.sectionId, key })}
              onMoveNode={(child, dir) => step(sel.sectionId, child, dir)}
            />
          ) : (
            <SectionSettings
              item={content[indexOf(sel.sectionId)]}
              onBack={close}
              onAi={() => setAi({ sectionId: sel.sectionId, keys: null })}
              onChange={(props) => updateProps(sel.sectionId, props)}
              onAdapt={content.some((c) => byId[c.type]?.meta.pageSpecific) || getPuck().appState.data.root?.props?.design ? () => adaptToPage(sel.sectionId) : null}
              onRebuild={(instruction, reference) => rebuildSection(sel.sectionId, instruction, reference)}
            />
          ))}
        {sel?.key && content[indexOf(sel.sectionId)] && (
          <ElementSettings
            item={content[indexOf(sel.sectionId)]}
            elementKey={sel.key}
            onBack={close}
            onAi={() => setAi({ sectionId: sel.sectionId, keys: [sel.key] })}
            onChange={(values) => updateValues(sel.sectionId, values)}
            onChangeProps={(props) => updateProps(sel.sectionId, props)}
          />
        )}
        {sel?.group && selNode?.run && (
          <TextRunSettings
            key={selNode.id}
            item={content[indexOf(sel.sectionId)]}
            node={selNode}
            onBack={close}
            onAi={() => setAi({ sectionId: sel.sectionId, keys: selNode.children.map((l) => l.key), label: "Texte" })}
            onChange={(values) => updateValues(sel.sectionId, values)}
            onChangeProps={(props) => updateProps(sel.sectionId, props)}
          />
        )}
        {sel?.group && selNode && !selNode.run && (
          <div className="atl-insp__panel">
            <PanelHead
              onBack={close}
              title={`${GROUP_ICON[selNode.kind] ?? "▤"} ${selNode.label}`}
              sub={`${leavesOf(selNode.children).length} élément(s)`}
              onAi={() => setAi({ sectionId: sel.sectionId, keys: leavesOf(selNode.children).map((l) => l.key), label: selNode.label })}
            />
            <div className="atl-insp__moves">
              <button type="button" onClick={() => step(sel.sectionId, selNode, -1)}>
                ↑ Monter
              </button>
              <button type="button" onClick={() => step(sel.sectionId, selNode, 1)}>
                ↓ Descendre
              </button>
            </div>
            {selNode.gid ? (
              <StyleEditor
                key={selNode.gid}
                kind="groupe"
                targets={[selNode.gid]}
                props={content[indexOf(sel.sectionId)].props}
                onChangeProps={(props) => updateProps(sel.sectionId, props)}
                el={domOf(sel.sectionId, selNode)}
              />
            ) : (
              <p className="atl-insp__hint">Cette colonne n'a pas de conteneur propre : règle ses éléments un par un, ou la section entière.</p>
            )}
            <GroupContents
              node={selNode}
              onChange={(values) => updateValues(sel.sectionId, values)}
              onOpen={(key) => setSel({ sectionId: sel.sectionId, key })}
              onMove={(child, dir) => step(sel.sectionId, child, dir)}
            />
            <p className="atl-insp__hint">Glisse les lignes de l'arbre pour changer l'ordre. Clic droit pour l'IA sur tout le groupe.</p>
          </div>
        )}
      </div>
      {!sel?.page && <div style={{ display: "none" }}>{children}</div>}
      {sel?.sectionId && isMain() && (
        <CanvasToolbar
          sel={sel}
          node={selNode}
          label={selNode ? (selNode.run ? "Paragraphes" : selNode.group ? selNode.label : selNode.name ?? (TYPE[selNode.type] ?? TYPE.texte).label) : "Section"}
          editing={editing}
          onFormat={format}
          onParent={() => {
            const path = pathTo(treeForItem(itemOf(sel.sectionId)), sameNode(sel)) ?? [];
            const parent = path.at(-2);
            choose(parent ? { sectionId: sel.sectionId, group: parent.id } : { sectionId: sel.sectionId });
          }}
          onUp={() => (selNode ? step(sel.sectionId, selNode, -1) : moveSection(sel.sectionId, content[indexOf(sel.sectionId) - 1]?.props.id, false))}
          onDown={() => (selNode ? step(sel.sectionId, selNode, 1) : moveSection(sel.sectionId, content[indexOf(sel.sectionId) + 1]?.props.id, true))}
          onEdit={() => startEdit(sel)}
          onMoveSection={moveSection}
          onAi={() => setAi({ sectionId: sel.sectionId, keys: selNode ? (selNode.group ? leavesOf(selNode.children).map((l) => l.key) : [selNode.key]) : null, label: selNode?.group ? selNode.label : null })}
          onHide={() => {
            const block = (normalizeProps(byId[itemOf(sel.sectionId).type], itemOf(sel.sectionId).props).blocks_element ?? []).find((b) => b.slot === sel.key);
            const d = parseStyle(block?.style);
            d.display = /none/.test(d.display ?? "") ? "" : "none";
            updateValues(sel.sectionId, { [sel.key]: { style: writeStyle(d) } });
          }}
        />
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu)} onClose={() => setMenu(null)} />}
      {quick && (
        <div className="atl-quick" role="status">
          {quick.error ? `⚠ ${quick.error}` : quick.done ? `✓ ${quick.done} — fait. Ctrl+Z pour annuler.` : `✨ ${quick.label}…`}
        </div>
      )}
      {ai && content[indexOf(ai.sectionId)] && (
        <AiDialog target={ai} item={content[indexOf(ai.sectionId)]} onClose={() => setAi(null)} onApply={(values) => updateValues(ai.sectionId, values)} root={getPuck().appState.data.root?.props ?? {}} />
      )}
    </div>
  );
}

// ---- L'arbre ----
const dragState = { current: null };

function TreeView({ content, sel, openSec, setOpenSec, openGroups, setOpenGroups, onChoose, onPage, onMenu, onMove, onMoveSection, treeRef }) {
  const [hint, setHint] = useState(null);
  const dropSide = (e) => (e.clientY - e.currentTarget.getBoundingClientRect().top > e.currentTarget.offsetHeight / 2 ? "after" : "before");
  return (
    <div className="atl-insp__tree" ref={treeRef}>
      <div className="atl-insp__head">
        <b>Page</b>
        <small>{content.length} section(s) · glisser pour déplacer · clic droit pour l'IA</small>
      </div>
      <button type="button" className={`atl-insp__row atl-insp__row--page${sel?.page ? " is-chosen" : ""}`} onClick={onPage}>
        <span className="atl-insp__ico">⚙</span>
        <span className="atl-insp__name">Réglages de la page</span>
      </button>
      {content.map((item) => {
        const section = byId[item.type];
        if (!section) return null;
        const id = item.props.id;
        const isOpen = openSec[id];
        const nodes = isOpen ? treeForItem(item) : null;
        // Partie d'une copie de page : on garde « — partie N ».
        const name = section.meta.pageSpecific ? section.meta.label.replace(" — ", " · ") : (section.meta.label ?? section.id).split(" — ")[0];
        const chosen = sel?.sectionId === id && !sel.key && !sel.group;
        const h = hint?.id === `sec:${id}` ? ` is-drop-${hint.side}` : "";
        return (
          <div key={id} className={`atl-insp__sec${sel?.sectionId === id ? " is-sel" : ""}`}>
            <div
              className={`atl-insp__row atl-insp__row--sec${chosen ? " is-chosen" : ""}${h}`}
              draggable
              onDragStart={(e) => ((dragState.current = { section: id }), (e.dataTransfer.effectAllowed = "move"))}
              onDragOver={(e) => {
                if (!dragState.current?.section) return;
                e.preventDefault();
                setHint({ id: `sec:${id}`, side: dropSide(e) });
              }}
              onDragLeave={() => setHint(null)}
              onDrop={(e) => {
                e.preventDefault();
                const d = dragState.current;
                setHint(null);
                if (d?.section) onMoveSection(d.section, id, dropSide(e) === "after");
              }}
              onContextMenu={(e) => (e.preventDefault(), onMenu({ x: e.clientX, y: e.clientY, sectionId: id }))}
            >
              <button type="button" className="atl-insp__chev" onClick={() => setOpenSec({ ...openSec, [id]: !isOpen })} aria-label={isOpen ? "Replier" : "Déplier"}>
                {isOpen ? "▾" : "▸"}
              </button>
              <span className="atl-insp__ico">▦</span>
              <button type="button" className="atl-insp__name" onClick={() => onChoose({ sectionId: id })} title={`${name} — ${familyOf(section).label}`}>
                {name}
              </button>
              <button type="button" className="atl-insp__ai" title="Actions" onClick={(e) => onMenu({ x: e.clientX, y: e.clientY, sectionId: id })}>
                ⋯
              </button>
            </div>
            {isOpen && (
              <Nodes
                nodes={nodes}
                sectionId={id}
                depth={1}
                sel={sel}
                openGroups={openGroups}
                setOpenGroups={setOpenGroups}
                onChoose={onChoose}
                onMenu={onMenu}
                onMove={onMove}
                hint={hint}
                setHint={setHint}
                dropSide={dropSide}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Nodes({ nodes, sectionId, depth, sel, openGroups, setOpenGroups, onChoose, onMenu, onMove, hint, setHint, dropSide }) {
  const movable = (n) => n.k != null && n.parent;
  const dragProps = (n, rowId) => ({
    draggable: movable(n),
    onDragStart: (e) => {
      e.stopPropagation();
      dragState.current = { sectionId, node: n };
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e) => {
      const d = dragState.current;
      if (!d?.node || d.sectionId !== sectionId || d.node.parent !== n.parent || !movable(n)) return;
      e.preventDefault();
      e.stopPropagation();
      setHint({ id: rowId, side: dropSide(e) });
    },
    onDragLeave: () => setHint(null),
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const d = dragState.current;
      setHint(null);
      if (d?.node && d.sectionId === sectionId) onMove(sectionId, d.node, n, dropSide(e) === "after");
    },
  });
  return nodes.map((n, i) => {
    // Texte de plusieurs paragraphes : une seule ligne, comme un élément.
    if (n.run) {
      const chosen = sel?.sectionId === sectionId && sel.group === n.id;
      return (
        <div
          key={n.id}
          className={`atl-insp__row atl-insp__row--leaf${chosen ? " is-chosen" : ""}`}
          style={{ paddingLeft: 22 + depth * 14 }}
          onContextMenu={(e) => (e.preventDefault(), onMenu({ x: e.clientX, y: e.clientY, sectionId, group: n.id }))}
        >
          <span className="atl-insp__ico atl-insp__ico--texte">¶</span>
          <button type="button" className="atl-insp__name" onClick={() => onChoose({ sectionId, group: n.id })} title={n.label}>
            {n.label}
          </button>
        </div>
      );
    }
    if (n.group) {
      const gkey = `${sectionId}/${n.id}`;
      const isOpen = openGroups[gkey] ?? depth <= 1;
      const keys = leavesOf(n.children).map((l) => l.key);
      const rowId = `g:${gkey}`;
      const chosen = sel?.sectionId === sectionId && sel.group === n.id;
      return (
        <div key={n.id}>
          <div
            className={`atl-insp__row${chosen ? " is-chosen" : ""}${hint?.id === rowId ? ` is-drop-${hint.side}` : ""}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            {...dragProps(n, rowId)}
            onContextMenu={(e) => (e.preventDefault(), onMenu({ x: e.clientX, y: e.clientY, sectionId, group: n.id }))}
          >
            <button type="button" className="atl-insp__chev" onClick={() => setOpenGroups({ ...openGroups, [gkey]: !isOpen })}>
              {isOpen ? "▾" : "▸"}
            </button>
            <span className="atl-insp__ico">{GROUP_ICON[n.kind] ?? "▤"}</span>
            <button type="button" className="atl-insp__name atl-insp__name--group" onClick={() => onChoose({ sectionId, group: n.id })}>
              {n.label} <small>{keys.length}</small>
            </button>
            {movable(n) && <span className="atl-insp__grip">⋮⋮</span>}
          </div>
          {isOpen && (
            <Nodes
              nodes={n.children}
              sectionId={sectionId}
              depth={depth + 1}
              sel={sel}
              openGroups={openGroups}
              setOpenGroups={setOpenGroups}
              onChoose={onChoose}
              onMenu={onMenu}
              onMove={onMove}
              hint={hint}
              setHint={setHint}
              dropSide={dropSide}
            />
          )}
        </div>
      );
    }
    const t = TYPE[n.type] ?? TYPE.texte;
    const rowId = `l:${sectionId}/${n.key}`;
    const chosen = sel?.sectionId === sectionId && sel.key === n.key;
    return (
      <div
        key={n.key}
        className={`atl-insp__row atl-insp__row--leaf${chosen ? " is-chosen" : ""}${hint?.id === rowId ? ` is-drop-${hint.side}` : ""}`}
        style={{ paddingLeft: 22 + depth * 14 }}
        {...dragProps(n, rowId)}
        onContextMenu={(e) => (e.preventDefault(), onMenu({ x: e.clientX, y: e.clientY, sectionId, key: n.key }))}
      >
        {n.image && isImageType(n.type) ? <img className="atl-insp__thumb" src={n.image} alt="" /> : <span className={`atl-insp__ico atl-insp__ico--${n.type}`}>{t.icon}</span>}
        <button type="button" className="atl-insp__name" onClick={() => onChoose({ sectionId, key: n.key })} title={`${n.name ?? t.label} : ${n.label}`}>
          <small className="atl-insp__kind">{n.name ?? t.label}</small>
          {n.label || t.label}
        </button>
        {movable(n) && <span className="atl-insp__grip">⋮⋮</span>}
      </div>
    );
  });
}

// ---- Réglages ----
function FieldList({ settings, meta, blockType, values, onChange, namePrefix = "" }) {
  const fields = fieldsFor(settings, { meta, blockType });
  return Object.entries(fields).map(([id, field]) => {
    const Render = field.render;
    if (!Render) return null;
    return (
      <div className="atl-insp__field" key={id}>
        <Render field={field} name={`${namePrefix}${id}`} id={id} value={values[id]} onChange={(v) => onChange({ ...values, [id]: v })} />
      </div>
    );
  });
}

function PanelHead({ onBack, title, sub, onAi }) {
  return (
    <div className="atl-insp__bar">
      <button type="button" className="atl-insp__back" onClick={onBack} title="Revenir à la page">
        ←
      </button>
      <div className="atl-insp__bartitle">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </div>
      {onAi && (
        <button type="button" className="atl-insp__aibtn" onClick={onAi} title="Retravailler avec l'IA">
          ✨ IA
        </button>
      )}
    </div>
  );
}

function SectionSettings({ item, onBack, onAi, onChange, onAdapt, onRebuild }) {
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const section = byId[item.type];
  const props = normalizeProps(section, item.props);
  const [name, variant] = (section.meta.label ?? section.id).split(" — ");
  const hasSettings = editableSettings(section.schema.settings).length > 0;
  return (
    <div className="atl-insp__panel">
      <PanelHead onBack={onBack} title={name} sub={variant ?? familyOf(section).label} onAi={onAi} />
      <div className="atl-insp__thumbbox">
        <Thumb section={section} />
      </div>
      {/* Fond et marges : pour toute section (rendu dans engine/render.js). */}
      <div className="atl-style">
        <p className="atl-style__title">Fond de la section</p>
        <div className="atl-style__row">
          <span>Couleur</span>
          <span className="atl-style__color">
            <input type="color" value={props.fond_section || "#ffffff"} onChange={(e) => onChange({ ...props, fond_section: e.target.value })} />
            <code>{props.fond_section || "d'origine"}</code>
            {props.fond_section && (
              <button type="button" onClick={() => onChange({ ...props, fond_section: "" })}>
                ↺
              </button>
            )}
          </span>
        </div>
        <div className="atl-style__two">
          {[
            ["marge_haut", "Marge haut"],
            ["marge_bas", "Marge bas"],
          ].map(([id, label]) => (
            <label key={id}>
              <span>{label}</span>
              <span className="atl-style__px">
                <input type="number" min="0" max="400" value={props[id] ?? ""} placeholder="—" onChange={(e) => onChange({ ...props, [id]: e.target.value })} />
                px
              </span>
            </label>
          ))}
        </div>
      </div>
      <StyleEditor
        key={item.props.id}
        kind="section"
        targets={["section"]}
        props={props}
        onChangeProps={onChange}
        el={canvasFrame()?.contentDocument.querySelector(`[data-atl-id="${CSS.escape(item.props.id)}"] [class^="atl-"]`)}
      />
      {hasSettings ? (
        <FieldList settings={section.schema.settings} meta={section.meta} values={props} onChange={onChange} />
      ) : (
        <p className="atl-insp__empty">Cette section n'a pas de réglage général : ouvre ses éléments dans l'arbre.</p>
      )}
      {onRebuild && <RebuildBox onRebuild={onRebuild} />}
      {onAdapt && (
        <div className="atl-aibox">
          <p className="atl-aibox__title">✨ Adapter au style de la page</p>
          <p className="atl-aibox__hint">
            L'IA redessine cette section avec la palette, les polices, les espacements et l'allure du reste de la page, en gardant ses textes et ses images.
          </p>
          <button
            type="button"
            className="atl-aibox__go"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAdapt();
              } catch (e) {
                setBusy(false);
                alert(e.message);
              }
            }}
          >
            {busy ? "Adaptation en cours (30 à 90 s)…" : "Adapter la section"}
          </button>
        </div>
      )}
    </div>
  );
}

// Contenu d'un groupe, modifiable sur place (comme la liste « Blocks » de
// Whitelabeler) : une FAQ montre une carte par question (question + réponse,
// ↑ ↓) ; tout autre groupe, ses éléments avec leur nom. Le texte est modifié
// en texte simple ; la mise en forme se règle dans l'éditeur de l'élément.
function GroupContents({ node, onChange, onOpen, onMove }) {
  const setText = (leaf, value) => onChange({ [leaf.key]: { text: value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") } });
  const Field = ({ leaf, rows }) =>
    isImageType(leaf.type) ? (
      <button type="button" className="atl-gc__img" onClick={() => onOpen(leaf.key)} title="Ouvrir l'image">
        {leaf.image ? <img src={leaf.image} alt="" /> : <span>{leaf.name}</span>}
      </button>
    ) : rows > 1 ? (
      <textarea rows={rows} defaultValue={plain(leaf.text)} onBlur={(e) => e.target.value !== plain(leaf.text) && setText(leaf, e.target.value)} />
    ) : (
      <input defaultValue={plain(leaf.text)} onBlur={(e) => e.target.value !== plain(leaf.text) && setText(leaf, e.target.value)} />
    );
  const Label = ({ leaf }) => (
    <button type="button" className="atl-gc__label" onClick={() => onOpen(leaf.key)} title="Ouvrir l'élément (style, IA…)">
      {leaf.name ?? TYPE[leaf.type]?.label}
    </button>
  );

  if (node.kind === "faq") {
    const items = node.children.filter((c) => c.group);
    return (
      <div className="atl-gc">
        <p className="atl-gc__title">Questions ({items.length})</p>
        {items.map((q, i) => {
          const leaves = leavesOf(q.children);
          const question = leaves.find((l) => l.name === "Question") ?? leaves[0];
          const answers = leaves.filter((l) => l !== question);
          return (
            <div key={q.id ?? i} className="atl-gc__card">
              <div className="atl-gc__head">
                <b>{q.label}</b>
                <span>
                  <button type="button" disabled={i === 0} onClick={() => onMove(q, -1)} title="Monter">
                    ↑
                  </button>
                  <button type="button" disabled={i === items.length - 1} onClick={() => onMove(q, 1)} title="Descendre">
                    ↓
                  </button>
                </span>
              </div>
              {question && <Field leaf={question} rows={1} />}
              {answers.map((a) => (
                <Field key={a.key} leaf={a} rows={3} />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  const leaves = leavesOf(node.children);
  return (
    <div className="atl-gc">
      <p className="atl-gc__title">Contenu ({leaves.length})</p>
      {leaves.slice(0, 40).map((leaf) => (
        <div key={leaf.key} className="atl-gc__row">
          <Label leaf={leaf} />
          <Field leaf={leaf} rows={plain(leaf.text).length > 70 ? 3 : 1} />
        </div>
      ))}
      {leaves.length > 40 && <p className="atl-insp__hint">… et {leaves.length - 40} autres : ouvre les sous-groupes dans l'arbre.</p>}
    </div>
  );
}

function ElementSettings({ item, elementKey, onBack, onAi, onChange, onChangeProps }) {
  if (!item) return null;
  const section = byId[item.type];
  const props = normalizeProps(section, item.props);
  const [sectionName] = (section.meta.label ?? section.id).split(" — ");
  if (section.meta.arbre) {
    const leaf = leavesOf(treeForItem(item)).find((l) => l.key === elementKey);
    const block = (props.blocks_element ?? []).find((b) => b.slot === elementKey);
    if (!leaf || !block) return <PanelHead onBack={onBack} title="Élément introuvable" onAi={onAi} />;
    const t = TYPE[leaf.type] ?? TYPE.texte;
    const set = (patch) => onChange({ [elementKey]: patch });
    // Lien ou bouton : son propre emplacement de lien si la copie en a un (« l12 »),
    // sinon l'élément lui-même quand c'est le lien.
    const linkSlot = leaf.lien ?? (leaf.type === "bouton" || leaf.type === "lien" ? elementKey : null);
    const linkBlock = linkSlot ? (props.blocks_element ?? []).find((b) => b.slot === linkSlot) : null;
    const isButton = Boolean(leaf.lien) || leaf.type === "bouton" || leaf.type === "lien" || /Lien|Bouton|CTA/.test(leaf.name ?? "");
    const blockDefs = section.schema.blocks[0].settings;
    const fields = fieldsFor(blockDefs, { meta: section.meta, blockType: "element" });
    const F = (id, patchKey = id) => {
      const field = fields[id];
      const Render = field?.render;
      return Render ? (
        <div className="atl-insp__field">
          <Render field={field} name={`blocks_element[0].${id}`} id={id} value={block[id]} onChange={(v) => (patchKey === "text" ? set({ text: v }) : patchKey === "image" ? set({ image: v }) : onChange({ [elementKey]: { [patchKey]: v } }))} />
        </div>
      ) : null;
    };
    return (
      <div className="atl-insp__panel">
        <PanelHead onBack={onBack} title={`${t.icon} ${leaf.name ?? t.label}${leaf.size ? ` ${leaf.size}` : ""}`} sub={sectionName} onAi={onAi} />
        {isImageType(leaf.type) ? (
          <>
            {F("image", "image")}
            {F("text", "text")}
          </>
        ) : (
          <>
            <div className="atl-insp__field">
              <span className="atl-rte__label">{t.label}</span>
              <RichText value={block.text} onChange={(v) => set({ text: v })} />
            </div>
            {linkBlock && <LinkField block={linkBlock} onChange={(link) => onChangeLink(onChangeProps, props, linkBlock.slot, link)} />}
            <p className="atl-insp__hint">Double-clic sur le texte dans la page pour l'écrire directement.</p>
          </>
        )}
        <StyleEditor
          key={elementKey}
          kind={isImageType(leaf.type) ? "image" : isButton ? "bouton" : "texte"}
          targets={[!isImageType(leaf.type) && leaf.lien ? leaf.lien : elementKey]}
          props={props}
          onChangeProps={onChangeProps}
          el={domOf(item.props.id, leaf)}
          legacy={block.style}
          onResetLegacy={() => onChange({ [elementKey]: { style: "" } })}
        />
        <p className="atl-insp__hint">Clic droit sur un élément (ici ou dans l'aperçu) pour le retravailler avec l'IA.</p>
      </div>
    );
  }
  // Bloc d'une section du catalogue : tous ses réglages.
  const [type, i] = elementKey.split(":");
  const block = section.schema.blocks.find((b) => b.type === type);
  const list = props[blocksKey(type)] ?? [];
  const values = list[Number(i)] ?? {};
  return (
    <div className="atl-insp__panel">
      <PanelHead onBack={onBack} title={`${block?.name ?? "Bloc"} ${Number(i) + 1}`} sub={sectionName} onAi={onAi} />
      <FieldList
        settings={block?.settings}
        meta={section.meta}
        blockType={type}
        values={values}
        namePrefix={`${blocksKey(type)}[${i}].`}
        onChange={(v) => onChangeProps({ ...props, [blocksKey(type)]: list.map((b, j) => (j === Number(i) ? v : b)) })}
      />
      <button
        type="button"
        className="atl-insp__remove"
        onClick={() => confirm("Supprimer ce bloc ?") && (onChangeProps({ ...props, [blocksKey(type)]: list.filter((_, j) => j !== Number(i)) }), onBack())}
      >
        Supprimer le bloc
      </button>
    </div>
  );
}

// Texte de plusieurs paragraphes : une seule zone (une ligne vide sépare les
// paragraphes) ; le style choisi s'applique à tous.
function TextRunSettings({ item, node, onBack, onAi, onChange, onChangeProps }) {
  if (!item) return null;
  const section = byId[item.type];
  const props = normalizeProps(section, item.props);
  const [sectionName] = (section.meta.label ?? section.id).split(" — ");
  const leaves = node.children;
  const first = (props.blocks_element ?? []).find((b) => b.slot === leaves[0].key);
  return (
    <div className="atl-insp__panel">
      <PanelHead onBack={onBack} title="¶ Texte" sub={`${sectionName} · ${leaves.length} paragraphes`} onAi={onAi} />
      <div className="atl-insp__field">
        <span className="atl-rte__label">Texte</span>
        <RichText value={runHtml(leaves)} onChange={(v) => onChange(splitRun(v, leaves))} />
        <p className="atl-insp__hint">Une ligne vide sépare deux paragraphes. Double-clic dans la page pour écrire directement.</p>
      </div>
      {first && (
        <StyleEditor
          key={node.id}
          kind="texte"
          targets={leaves.map((l) => l.key)}
          props={props}
          onChangeProps={onChangeProps}
          el={domOf(item.props.id, leaves[0])}
          legacy={first.style}
          onResetLegacy={() => onChange(Object.fromEntries(leaves.map((l) => [l.key, { style: "" }])))}
        />
      )}
    </div>
  );
}

function onChangeLink(onChangeProps, props, slot, link) {
  onChangeProps({ ...props, blocks_element: (props.blocks_element ?? []).map((b) => (b.slot === slot ? { ...b, link } : b)) });
}

// Lien d'un bouton : adresse libre, ancre d'une section (#offre), ou ajout
// direct au panier d'une variante de la boutique (/cart/add?id=…).
function LinkField({ block, onChange }) {
  const [products, setProducts] = useState(null);
  const load = () =>
    products ??
    fetch("/api/shopify/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((c) => setProducts(c.produits ?? []))
      .catch(() => setProducts([]));
  const variants = (products ?? []).flatMap((p) => (p.variants ?? []).map((v) => ({ id: String(v.id).split("/").pop(), label: p.variants.length > 1 ? `${p.title} — ${v.title}` : p.title })));
  return (
    <div className="atl-insp__field atl-insp__link">
      <label>
        <span>Lien</span>
        <input value={block.link ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="https://…, /products/… ou #ancre" />
      </label>
      <select value="" onFocus={load} onMouseDown={load} onChange={(e) => e.target.value && onChange(`/cart/add?id=${e.target.value}&quantity=1`)}>
        <option value="">🛒 Ajouter au panier…</option>
        {products === null && <option disabled>Chargement des produits…</option>}
        {products?.length === 0 && <option disabled>Aucun produit (synchronise la boutique)</option>}
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---- Menu du clic droit ----
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && onClose();
    const esc = (e) => e.key === "Escape" && onClose();
    setTimeout(() => window.addEventListener("mousedown", close), 0);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, []);
  const left = Math.min(x, innerWidth - 240);
  const top = Math.min(y, innerHeight - 40 * items.length - 20);
  return createPortal(
    <div className="atl-ctx" ref={ref} style={{ left, top }} role="menu">
      {items.map((it, i) =>
        it.sep ? (
          <hr key={i} />
        ) : (
          <button key={i} type="button" role="menuitem" disabled={it.disabled} className={it.danger ? "is-danger" : ""} onClick={() => (onClose(), it.action())}>
            {it.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

// ---- Retravailler avec l'IA ----
const QUICK = ["Plus court", "Plus percutant", "Plus émotionnel", "Adapter à mon produit", "Traduire en français", "Traduire en anglais"];
// Actions rapides du clic droit : consigne prête à l'emploi, appliquée sans fenêtre.
const QUICK_ACTIONS = [
  { label: "Raccourcir", prompt: "Rends ce texte nettement plus court, sans perdre son sens ni son argument principal." },
  { label: "Étendre", prompt: "Développe ce texte avec plus de détails et de bénéfices concrets, sans répéter ce qui est dit." },
  { label: "Plus percutant", prompt: "Rends ce texte plus percutant, direct et concret, sans exagération ni promesse invérifiable." },
  { label: "Plus émotionnel", prompt: "Rends ce texte plus émotionnel et empathique, en gardant la même longueur approximative." },
];
const REFS_KEY = "atl-ia-references";

function AiDialog({ target, item, onClose, onApply, root }) {
  const { texts, images } = useMemo(() => aiTargets(item, target.keys), [item, target.keys]);
  const [prompt, setPrompt] = useState("");
  const [doTexts, setDoTexts] = useState(texts.length > 0);
  const [doImages, setDoImages] = useState(images.length > 0 && texts.length === 0);
  const [refs, setRefs] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(REFS_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [state, setState] = useState(null);
  const section = byId[item.type];
  const [sectionName] = (section.meta.label ?? section.id).split(" — ");
  const what = target.keys?.length === 1 ? "cet élément" : target.label ? `« ${target.label} »` : `la section « ${sectionName} »`;

  useEffect(() => {
    try {
      sessionStorage.setItem(REFS_KEY, JSON.stringify(refs));
    } catch {
      // stockage plein ou bloqué : les références restent pour cette fenêtre
    }
  }, [refs]);

  async function addFiles(files) {
    const read = (f) => new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.readAsDataURL(f);
    });
    const added = [];
    for (const f of files) if (f.type.startsWith("image/")) added.push(await read(f));
    setRefs((r) => [...r, ...added].slice(0, 6));
  }

  async function launch() {
    if (!prompt.trim()) return setState({ error: "Écris ce que tu veux changer." });
    setState({ busy: true, step: "" });
    try {
      if (doTexts && texts.length) {
        setState({ busy: true, step: `Textes : ${texts.length} en cours…` });
        const res = await fetch("/api/ia/textes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: texts, prompt: /tradui|translat/i.test(prompt) ? prompt : `${prompt}
${consigneLangue(root)}`, contexte: { produit: root.produit ?? "", profil: root.profil ?? "", typeDePage: root.pageType ?? "" } }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        onApply(Object.fromEntries(body.items.map((x) => [x.id, { text: x.text }])));
      }
      if (doImages && images.length) {
        for (const [i, img] of images.entries()) {
          setState({ busy: true, step: `Images : ${i + 1} / ${images.length}…` });
          const [w, h] = (img.size ?? "").split("×").map(Number);
          const res = await fetch("/api/ia/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ page: pageName, source: img.src, prompt, references: refs, width: w, height: h }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          onApply({ [img.key]: { image: body.url } });
        }
      }
      setState({ done: true });
      setTimeout(onClose, 700);
    } catch (e) {
      setState({ error: e.message });
    }
  }

  return createPortal(
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && !state?.busy && onClose()}>
      <div className="atl-modal__panel atl-aidlg">
        <header className="atl-modal__head">
          <h2>✨ Retravailler avec l'IA</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer" disabled={state?.busy}>
            ×
          </button>
        </header>
        <div className="atl-aidlg__body">
          <p className="atl-aidlg__target">
            Sur {what} : {texts.length} texte(s), {images.length} image(s).
          </p>
          <label className="atl-aidlg__prompt">
            <span>Ce que tu veux changer</span>
            <textarea
              rows={4}
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="ex. Pour ma crème au collagène, une maman de 35 ans raconte, ton rassurant. / Montre le produit dans la main d'une femme, salle de bain lumineuse."
            />
          </label>
          <div className="atl-aidlg__chips">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => setPrompt((p) => (p ? `${p} ${q}.` : `${q}.`))}>
                {q}
              </button>
            ))}
          </div>
          <div className="atl-aidlg__what">
            <label>
              <input type="checkbox" checked={doTexts} disabled={!texts.length} onChange={(e) => setDoTexts(e.target.checked)} /> Réécrire les textes ({texts.length}) — gpt-5.4-mini, immédiat
            </label>
            <label>
              <input type="checkbox" checked={doImages} disabled={!images.length} onChange={(e) => setDoImages(e.target.checked)} /> Refaire les images ({images.length}) — gpt-image-2, ~30 s et quelques cents par image
            </label>
          </div>
          {doImages && (
            <div className="atl-aidlg__refs" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), addFiles(e.dataTransfer.files))}>
              <span>Photos de ton produit (références, facultatif) — glisse-les ici</span>
              <div>
                {refs.map((r, i) => (
                  <button key={i} type="button" title="Retirer" onClick={() => setRefs(refs.filter((_, j) => j !== i))}>
                    <img src={r} alt="" />
                  </button>
                ))}
                <label className="atl-aidlg__add">
                  +
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                </label>
              </div>
            </div>
          )}
        </div>
        <footer className="atl-newpage__foot">
          {state?.error && <span className="atl-topbar__error">{state.error}</span>}
          {state?.busy && <span className="atl-aidlg__step">{state.step}</span>}
          {state?.done && <span className="atl-topbar__ok">Fait. Ctrl+Z pour annuler.</span>}
          <button type="button" onClick={onClose} disabled={state?.busy}>
            Annuler
          </button>
          <button type="button" className="atl-newpage__create" disabled={state?.busy || (!doTexts && !doImages)} onClick={launch}>
            {state?.busy ? "En cours…" : "Lancer"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ---- Texte riche (comme Shopify) : gras, italique, souligné, lien ----
// Le texte garde la mise en forme d'origine (<span style>) ; seules les
// balises de mise en forme simples sont conservées.
const ALLOWED = /^(span|b|strong|i|em|u|a|br)$/i;
function cleanHtml(html) {
  const box = document.createElement("div");
  box.innerHTML = html.replace(/<div>/gi, "<br>").replace(/<\/div>/gi, "").replace(/&nbsp;/g, " ");
  const walk = (node) => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType !== 1) continue;
      walk(c);
      if (!ALLOWED.test(c.tagName)) c.replaceWith(...c.childNodes);
      else for (const a of [...c.attributes]) if (!["style", "href"].includes(a.name)) c.removeAttribute(a.name);
    }
  };
  walk(box);
  return box.innerHTML.replace(/^(<br>)+|(<br>)+$/g, "").trim();
}

function RichText({ value, onChange }) {
  const ref = useRef(null);
  const last = useRef(null);
  useEffect(() => {
    // On ne réécrit la zone que si la valeur vient d'ailleurs (IA, annuler),
    // pour ne pas déplacer le curseur pendant la frappe.
    if (ref.current && value !== last.current) {
      ref.current.innerHTML = value ?? "";
      last.current = value;
    }
  }, [value]);
  const emit = () => {
    const html = cleanHtml(ref.current.innerHTML);
    last.current = html;
    onChange(html);
  };
  const cmd = (name, arg) => {
    ref.current.focus();
    document.execCommand(name, false, arg);
    emit();
  };
  const keep = (e) => e.preventDefault();
  return (
    <div className="atl-rte">
      <div className="atl-rte__bar">
        <button type="button" onMouseDown={keep} onClick={() => cmd("bold")} title="Gras">
          <b>B</b>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => cmd("italic")} title="Italique">
          <i>I</i>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => cmd("underline")} title="Souligné">
          <u>U</u>
        </button>
        <button type="button" onMouseDown={keep} onClick={() => {
          const url = prompt("Lien (https://… ou /products/…) :");
          if (url) cmd("createLink", url);
        }} title="Lien">
          🔗
        </button>
        <button type="button" onMouseDown={keep} onClick={() => cmd("removeFormat")} title="Retirer la mise en forme">
          ✕
        </button>
      </div>
      <div ref={ref} className="atl-rte__area" contentEditable suppressContentEditableWarning onInput={emit} />
    </div>
  );
}

// ---- Style d'un élément (comme Whitelabeler) : police, taille, graisse,
// interligne, couleur, alignement, masquer. Écrit dans le réglage « style » du
// bloc (CSS en ligne, après le style d'origine). ----
const parseStyle = (s) =>
  Object.fromEntries(
    String(s ?? "")
      .split(";")
      .map((p) => p.trim())
      .filter((p) => p.includes(":"))
      .map((p) => [p.slice(0, p.indexOf(":")).trim(), p.slice(p.indexOf(":") + 1).trim()]),
  );
const writeStyle = (d) =>
  Object.entries(d)
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
const FONT_CHOICES = [
  { value: "", label: "D'origine" },
  { value: "var(--atl-font-heading, inherit)", label: "Police des titres" },
  { value: "var(--atl-font-body, inherit)", label: "Police du texte" },
];
const toHex = (c) => {
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c ?? "");
  return m ? `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}` : "#000000";
};

function Seg({ value, options, onChange }) {
  return (
    <div className="atl-seg2">
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? "is-on" : ""} onClick={() => onChange(value === o.value ? "" : o.value)} title={o.title ?? o.label}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Réglages d'une partie copiée : Design · Layout · Couleurs, et l'IA ----
function CopySectionSettings({ item, onBack, onChange, onAiTexts, onRebuild, onValues, onOpen, onMoveNode }) {
  const [tab, setTab] = useState("design");
  const [prompt, setPrompt] = useState("");
  const [ref, setRef] = useState(null);
  const [busy, setBusy] = useState(null);
  const section = byId[item.type];
  const props = normalizeProps(section, item.props);
  const [name, variant] = (section.meta.label ?? section.id).split(" — ");
  const set = (k, v) => onChange({ ...props, [k]: v });
  const root = canvasFrame()?.contentDocument.querySelector(`[data-atl-id="${CSS.escape(item.props.id)}"] [class^="atl-"]`);
  const cs = root ? root.ownerDocument.defaultView.getComputedStyle(root) : null;
  const roles = editableSettings(section.schema.settings).filter((s) => s.id.startsWith("role_"));
  const rebuild = async (instruction) => {
    setBusy(instruction ? "Reconstruction en cours (30 à 90 s)…" : "Nettoyage en cours (30 à 90 s)…");
    try {
      await onRebuild(instruction || "Remets de l'ordre dans cette section : alignements, espacements et tailles cohérents et réguliers, sans changer les textes ni les images.", ref);
    } catch (e) {
      setBusy(null);
      alert(e.message);
    }
  };
  const readRef = (file) => {
    const r = new FileReader();
    r.onload = () => setRef(r.result);
    r.readAsDataURL(file);
  };
  return (
    <div className="atl-insp__panel">
      <PanelHead onBack={onBack} title={name} sub={variant ?? "Section"} />
      {/* Section qui est une FAQ (sa racine) : ses questions, modifiables ici. */}
      {section.meta.arbre?.kind === "faq" && <GroupContents node={{ kind: "faq", children: treeForItem(item) }} onChange={onValues} onOpen={onOpen} onMove={onMoveNode} />}
      <div className="atl-tabs2">
        {[
          ["design", "Design"],
          ["layout", "Layout"],
          ["couleurs", "Couleurs"],
        ].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "design" && (
        <div className="atl-style">
          <p className="atl-style__title">Fond</p>
          <div className="atl-style__row">
            <span>Couleur</span>
            <span className="atl-style__color">
              <input type="color" value={props.fond_section || toHex(cs?.backgroundColor)} onChange={(e) => set("fond_section", e.target.value)} />
              <code>{props.fond_section || "d'origine"}</code>
              {props.fond_section && (
                <button type="button" onClick={() => set("fond_section", "")}>
                  ↺
                </button>
              )}
            </span>
          </div>
          <p className="atl-style__title">Marges</p>
          <div className="atl-style__two">
            <label>
              <span>Haut</span>
              <span className="atl-style__px">
                <input type="number" min="0" max="400" value={props.marge_haut ?? ""} placeholder={cs ? Math.round(parseFloat(cs.paddingTop)) : ""} onChange={(e) => set("marge_haut", e.target.value)} />
                px
              </span>
            </label>
            <label>
              <span>Bas</span>
              <span className="atl-style__px">
                <input type="number" min="0" max="400" value={props.marge_bas ?? ""} placeholder={cs ? Math.round(parseFloat(cs.paddingBottom)) : ""} onChange={(e) => set("marge_bas", e.target.value)} />
                px
              </span>
            </label>
          </div>
        </div>
      )}
      {tab === "design" && <StyleEditor key={item.props.id} kind="section" targets={["section"]} props={props} onChangeProps={onChange} el={root} />}
      {tab === "layout" && (
        <div className="atl-style">
          <p className="atl-style__title">Largeur du contenu</p>
          <Seg
            value={props.largeur ?? ""}
            options={[
              { value: "", label: "D'origine" },
              { value: "large", label: "Large" },
              { value: "etroite", label: "Étroite" },
            ]}
            onChange={(v) => set("largeur", v)}
          />
          <p className="atl-insp__hint">L'ordre des éléments se change en les glissant dans l'arbre, ou avec Monter / Descendre.</p>
        </div>
      )}
      {tab === "couleurs" && <FieldList settings={roles} meta={section.meta} values={props} onChange={onChange} />}

      <div className="atl-aibox">
        <p className="atl-aibox__title">✨ Reconstruire avec l'IA</p>
        <p className="atl-aibox__hint">Dis ce qui doit changer : l'IA redessine cette section, le reste de la page ne bouge pas.</p>
        <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="ex. Mets les avis sur 2 colonnes · Moins chargé, titre plus gros · Cette vidéo devient une image" />
        <label className="atl-aibox__ref">
          {ref ? <img src={ref} alt="" /> : <span>+ Image de référence (facultatif)</span>}
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && readRef(e.target.files[0])} />
        </label>
        <button type="button" className="atl-aibox__go" disabled={!!busy || !prompt.trim()} onClick={() => rebuild(prompt.trim())}>
          Reconstruire la section
        </button>
        <div className="atl-aibox__row">
          <button type="button" onClick={onAiTexts} disabled={!!busy}>
            Réécrire les textes
          </button>
          <button type="button" onClick={() => rebuild("")} disabled={!!busy}>
            Nettoyer ✨
          </button>
        </div>
        {busy && <p className="atl-aidlg__step">{busy}</p>}
      </div>
    </div>
  );
}

// « Reconstruire avec l'IA » pour une section du catalogue : consigne et image
// de référence facultative (la même chose que pour les sections copiées).
function RebuildBox({ onRebuild }) {
  const [prompt, setPrompt] = useState("");
  const [ref, setRef] = useState(null);
  const [busy, setBusy] = useState(false);
  const readRef = (file) => {
    const r = new FileReader();
    r.onload = () => setRef(r.result);
    r.readAsDataURL(file);
  };
  return (
    <div className="atl-aibox">
      <p className="atl-aibox__title">✨ Reconstruire avec l'IA</p>
      <p className="atl-aibox__hint">Dis ce qui doit changer, et montre un exemple si tu veux : l'IA redessine cette section.</p>
      <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="ex. Comme sur l'image · 3 colonnes au lieu de 2 · Plus aéré" />
      <label className="atl-aibox__ref">
        {ref ? <img src={ref} alt="" /> : <span>+ Image de référence (facultatif)</span>}
        <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && readRef(e.target.files[0])} />
      </label>
      <button
        type="button"
        className="atl-aibox__go"
        disabled={busy || (!prompt.trim() && !ref)}
        onClick={async () => {
          setBusy(true);
          try {
            await onRebuild(prompt.trim() || "Redessine cette section comme sur l'image de référence, en gardant ses textes et ses images.", ref);
          } catch (e) {
            setBusy(false);
            alert(e.message);
          }
        }}
      >
        {busy ? "Reconstruction en cours (30 à 90 s)…" : "Reconstruire la section"}
      </button>
    </div>
  );
}

// ---- Section refaite par l'IA → nouvelle section de l'atelier ----
// Le HTML rendu par l'IA devient un gabarit Liquid : chaque texte et chaque
// image devient un emplacement modifiable (comme les copies de page).
const INLINE_TAGS = /^(SPAN|B|STRONG|I|EM|U|A|BR|SMALL|SUP|SUB|MARK)$/;
function htmlToSection(html, css, id, rootClass, label, page) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) throw new Error("L'IA n'a pas rendu de HTML exploitable.");
  root.classList.add(`atl-${id}`);
  const blocks = [];
  const leaves = [];
  let n = 0;
  const isLeaf = (el) => el.textContent.trim() && [...el.querySelectorAll("*")].every((c) => INLINE_TAGS.test(c.tagName));
  const walk = (el) => {
    for (const c of [...el.children]) {
      if (c.tagName === "IMG") {
        const slot = `i${++n}`;
        blocks.push({ slot, repere: "Image", text: c.getAttribute("alt") ?? "", image: c.getAttribute("src") ?? "", link: "", style: "" });
        leaves.push({ slot, type: "image" });
        c.setAttribute("src", `@@IMG_${slot}@@`);
        c.setAttribute("data-atl-slot", slot);
        c.setAttribute("style", `@@STYLE_${slot}@@`);
        continue;
      }
      if (isLeaf(c)) {
        const slot = `s${++n}`;
        const text = c.innerHTML.trim();
        const type = /^H[1-4]$/.test(c.tagName) ? "titre" : c.tagName === "A" || c.tagName === "BUTTON" ? "bouton" : "texte";
        blocks.push({ slot, repere: `${TYPE[type].label} · ${plain(text).slice(0, 38)}`, text, image: "", link: "", style: "" });
        leaves.push({ slot, type });
        c.innerHTML = `@@TEXT_${slot}@@`;
        c.setAttribute("data-atl-slot", slot);
        c.setAttribute("style", `@@STYLE_${slot}@@`);
        if (c.tagName === "A") c.setAttribute("href", `@@LINK_${slot}@@`);
        continue;
      }
      walk(c);
    }
  };
  walk(root);
  const loop = (slot, inner) => `{%- for b in section.blocks -%}{%- if b.settings.slot == '${slot}' -%}${inner}{%- endif -%}{%- endfor -%}`;
  const template = root.outerHTML
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    .replace(/@@TEXT_(\w+)@@/g, (_, s) => loop(s, "{{ b.settings.text | newline_to_br }}"))
    .replace(/@@IMG_(\w+)@@/g, (_, s) => loop(s, "{{ b.settings.image | image_url: width: 1600 }}"))
    .replace(/@@STYLE_(\w+)@@/g, (_, s) => loop(s, "{{ b.settings.style }}"))
    .replace(/@@LINK_(\w+)@@/g, (_, s) => loop(s, "{{ b.settings.link | default: '#' }}"));
  const scoped = css.replaceAll(`.${rootClass}`, `.atl-${id}`);
  const schema = {
    name: `Atl · IA ${id.slice(-10)}`,
    tag: "section",
    settings: [{ type: "paragraph", content: "Section refaite par l'IA dans l'atelier." }],
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
          { type: "text", id: "style", label: "Style de l'élément (réglé par l'atelier)" },
        ],
      },
    ],
    presets: [{ name: `Atl · IA ${id.slice(-10)}` }],
  };
  const meta = {
    label: `${label} — refaite par l'IA`,
    family: "article",
    pageSpecific: page,
    source: { url: null, capturedAt: new Date().toISOString().slice(0, 10), note: "Section reconstruite avec l'IA (Reconstruire / Nettoyer)." },
    preview: {},
    previewBlocks: {},
    arbre: { group: true, kind: "groupe", label: "Section", children: leaves.map((l) => ({ slot: l.slot, type: l.type })) },
  };
  return { schema, template, css: scoped, meta, blocks: blocks.slice(0, 50) };
}

// ---- Barre flottante sur l'élément choisi (comme Whitelabeler) ----
// Glisser une section dans l'aperçu : on suit la souris sur toute la fenêtre
// (l'aperçu de Puck ne reçoit pas la souris), une ligne montre où elle ira,
// l'aperçu défile près des bords ; au relâchement, la section est déplacée.
function startSectionDrag(e, sectionId, onMoveSection) {
  e.preventDefault();
  const frame = canvasFrame();
  if (!frame) return;
  const doc = frame.contentDocument;
  const shield = document.createElement("div");
  shield.className = "atl-dragshield";
  const line = document.createElement("div");
  line.className = "atl-dropline";
  document.body.append(shield, line);
  let target = null;
  let timer = null;
  const where = (clientY) => {
    const fr = frame.getBoundingClientRect();
    const scale = fr.width / frame.offsetWidth || 1;
    const y = (clientY - fr.top) / scale;
    const secs = [...doc.querySelectorAll("[data-atl-id]")].filter((el) => !el.parentElement.closest("[data-atl-id]"));
    let best = null;
    for (const el of secs) {
      const r = el.getBoundingClientRect();
      if (!r.height) continue;
      const after = y > r.top + r.height / 2;
      const edge = after ? r.bottom : r.top;
      const d = Math.abs(y - edge);
      if (!best || d < best.d) best = { d, id: el.dataset.atlId, after, edge };
    }
    if (!best) return null;
    line.style.top = `${fr.top + best.edge * scale - 2}px`;
    line.style.left = `${fr.left}px`;
    line.style.width = `${fr.width}px`;
    return best;
  };
  const onMove = (ev) => {
    target = where(ev.clientY);
    const fr = frame.getBoundingClientRect();
    clearInterval(timer);
    const dir = ev.clientY < fr.top + 60 ? -1 : ev.clientY > fr.bottom - 60 ? 1 : 0;
    if (dir) timer = setInterval(() => (doc.defaultView.scrollBy(0, dir * 40), (target = where(ev.clientY))), 30);
  };
  const onUp = () => {
    clearInterval(timer);
    shield.remove();
    line.remove();
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (target && target.id !== sectionId) onMoveSection(sectionId, target.id, target.after);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function CanvasToolbar({ sel, node, label, onParent, onUp, onDown, onAi, onEdit, onHide, editing, onFormat, onMoveSection }) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    let raf;
    const tick = () => {
      const frame = canvasFrame();
      const el = node ? domOf(sel.sectionId, node) : frame?.contentDocument.querySelector(`[data-atl-id="${CSS.escape(sel.sectionId)}"]`);
      if (frame && el) {
        const fr = frame.getBoundingClientRect();
        const scale = fr.width / frame.offsetWidth || 1;
        const r = el.getBoundingClientRect();
        const top = fr.top + r.top * scale;
        const visible = top > fr.top - 10 && top < fr.bottom;
        const next = visible ? { top: Math.round(Math.max(fr.top + 4, top - 34)), left: Math.round(Math.min(fr.right - 300, fr.left + (r.left + r.width) * scale - 290)) } : null;
        // Seulement si la barre a bougé : sinon on redessinerait à chaque image.
        setPos((p) => (p?.top === next?.top && p?.left === next?.left ? p : next));
      } else setPos((p) => (p ? null : p));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sel?.sectionId, sel?.key, sel?.group, node]);
  if (!pos) return null;
  const isText = node && !node.group && !isImageType(node.type);
  return createPortal(
    <div className="atl-float" style={{ top: pos.top, left: Math.max(8, pos.left) }} onMouseDown={(e) => e.preventDefault()}>
      <b>{label}</b>
      {editing ? (
        <>
          <button type="button" onClick={() => onFormat("bold")} title="Gras">
            <strong>B</strong>
          </button>
          <button type="button" onClick={() => onFormat("italic")} title="Italique">
            <i>I</i>
          </button>
          <button type="button" onClick={() => onFormat("underline")} title="Souligné">
            <u>U</u>
          </button>
          <button type="button" onClick={() => onFormat("link")} title="Lien">
            🔗
          </button>
          <button type="button" onClick={() => onFormat("done")} title="Terminer (Échap)">
            ✓
          </button>
        </>
      ) : (
        <>
          {node && (
            <button type="button" onClick={onParent} title="Sélectionner le parent">
              ⬆
            </button>
          )}
          {!node && (
            <button type="button" className="atl-float__grip" onMouseDown={(e) => startSectionDrag(e, sel.sectionId, onMoveSection)} title="Glisser pour déplacer la section">
              ⋮⋮
            </button>
          )}
          <button type="button" onClick={onUp} title="Monter">
            ▲
          </button>
          <button type="button" onClick={onDown} title="Descendre">
            ▼
          </button>
          {isText && (
            <button type="button" onClick={onEdit} title="Écrire dans la page (double-clic)">
              ✎
            </button>
          )}
          <button type="button" onClick={onAi} title="Retravailler avec l'IA">
            ✨
          </button>
          {node && !node.group && (
            <button type="button" onClick={onHide} title="Masquer">
              👁
            </button>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}

// ---- Traduire toute la page en un clic (comme « Rewrite in another language ») ----
// Tous les textes de toutes les sections, section par section, par lots ;
// mise en forme et longueur gardées. Ctrl+Z annule section par section.
const LANGUES = [
  { value: "français du Québec", label: "Français (Québec)" },
  { value: "français de France", label: "Français (France)" },
  { value: "anglais américain", label: "Anglais (États-Unis)" },
  { value: "espagnol", label: "Espagnol" },
  { value: "allemand", label: "Allemand" },
  { value: "italien", label: "Italien" },
  { value: "portugais du Brésil", label: "Portugais (Brésil)" },
  { value: "arabe", label: "Arabe" },
];

// Comme « Rewrite copy » de Whitelabeler : une seule fiche (marque + tout ce
// qu'on sait du produit) et toute la page est réécrite, longueur gardée pour
// chaque emplacement, mise en forme comprise. Par lots de 40 textes.
function RewritePage({ content, root, onApply }) {
  const [form, setForm] = useState({ marque: "", infos: "" });
  const [state, setState] = useState(null);
  async function run() {
    if (!form.infos.trim() && !root.produit) return setState({ error: "Colle d'abord ce que tu sais du produit." });
    const jobs = content.map((item) => ({ id: item.props.id, texts: byId[item.type] ? aiTargets(item).texts : [] })).filter((j) => j.texts.length);
    const total = jobs.reduce((n, j) => n + j.texts.length, 0);
    if (!total) return setState({ error: "Aucun texte à réécrire." });
    if (!confirm(`Réécrire les ${total} textes de la page pour ${form.marque || root.produit || "ton produit"} ?`)) return;
    let done = 0;
    try {
      for (const job of jobs) {
        for (let i = 0; i < job.texts.length; i += 40) {
          const batch = job.texts.slice(i, i + 40);
          setState({ busy: true, step: `${done} / ${total} textes réécrits…` });
          const res = await fetch("/api/ia/textes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: batch,
              prompt:
                "Réécris chaque texte pour MON produit et MA marque (voir contexte), en gardant le rôle du texte dans la page (titre, accroche, liste, avis, bouton…), sa longueur et ses balises de mise en forme. Remplace tout nom de marque, de produit, prix ou chiffre de la page d'origine par les miens ; si une information manque, reste général plutôt que d'inventer. " + consigneLangue(root),
              contexte: { marque: form.marque || "", produit: root.produit ?? "", profilClient: root.profil ?? "", infosProduit: form.infos.slice(0, 8000), typeDePage: root.pageType ?? "" },
            }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          onApply(job.id, Object.fromEntries(body.items.map((x) => [x.id, { text: x.text }])));
          done += batch.length;
        }
      }
      setState({ done: `${done} textes réécrits. Ctrl+Z pour annuler, Publish pour enregistrer.` });
    } catch (e) {
      setState({ error: `${e.message} (${done} / ${total} déjà réécrits)` });
    }
  }
  return (
    <div className="atl-aibox">
      <p className="atl-aibox__title">✍️ Réécrire toute la page pour mon produit</p>
      <p className="atl-aibox__hint">Colle tout ce que tu sais du produit (page fournisseur, notes, bénéfices, ingrédients). Chaque texte est réécrit à sa longueur.</p>
      <input value={form.marque} onChange={(e) => setForm({ ...form, marque: e.target.value })} placeholder="Nom de ta marque" disabled={state?.busy} />
      <textarea rows={5} value={form.infos} onChange={(e) => setForm({ ...form, infos: e.target.value })} placeholder={`Ce que tu sais de ${root.produit || "ton produit"}…`} disabled={state?.busy} />
      <button type="button" className="atl-aibox__go" disabled={state?.busy} onClick={run}>
        {state?.busy ? "Réécriture en cours…" : "Réécrire toute la page"}
      </button>
      {state?.busy && <p className="atl-aidlg__step">{state.step}</p>}
      {state?.done && <p className="atl-topbar__ok">{state.done}</p>}
      {state?.error && <p className="atl-topbar__error">{state.error}</p>}
    </div>
  );
}

function TranslatePage({ content, root, onApply, onLangue }) {
  // Par défaut : l'autre langue que celle de la page.
  const [langue, setLangue] = useState(langueOf(root).code === "en" ? "français du Québec" : "anglais américain");
  const [state, setState] = useState(null);
  async function run() {
    const jobs = content.map((item) => ({ id: item.props.id, texts: byId[item.type] ? aiTargets(item).texts : [] })).filter((j) => j.texts.length);
    const total = jobs.reduce((n, j) => n + j.texts.length, 0);
    if (!total) return setState({ error: "Aucun texte à traduire." });
    if (!confirm(`Traduire les ${total} textes de la page en ${langue} ?`)) return;
    let done = 0;
    try {
      for (const job of jobs) {
        for (let i = 0; i < job.texts.length; i += 40) {
          const batch = job.texts.slice(i, i + 40);
          setState({ busy: true, step: `${done} / ${total} textes traduits…` });
          const res = await fetch("/api/ia/textes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: batch,
              prompt: `Traduis chaque texte en ${langue}, de façon naturelle et vendeuse pour une page de vente (pas mot à mot). Garde les chiffres, les noms de marque et de produit, les balises de mise en forme, et une longueur proche de l'original.`,
              contexte: { produit: root.produit ?? "", typeDePage: root.pageType ?? "" },
            }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          onApply(job.id, Object.fromEntries(body.items.map((x) => [x.id, { text: x.text }])));
          done += batch.length;
        }
      }
      if (/^(anglais|français)/.test(langue)) onLangue?.(langue.startsWith("anglais") ? "en" : "fr");
      setState({ done: `${done} textes traduits en ${langue}. Ctrl+Z pour annuler, Publish pour enregistrer.` });
    } catch (e) {
      setState({ error: `${e.message} (${done} / ${total} déjà traduits)` });
    }
  }
  return (
    <div className="atl-aibox">
      <p className="atl-aibox__title">🌐 Traduire la page</p>
      <p className="atl-aibox__hint">Tous les textes de la page, dans une autre langue, en gardant la mise en forme et la longueur.</p>
      <select value={langue} onChange={(e) => setLangue(e.target.value)} disabled={state?.busy}>
        {LANGUES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <button type="button" className="atl-aibox__go" disabled={state?.busy} onClick={run}>
        {state?.busy ? "Traduction en cours…" : "Traduire toute la page"}
      </button>
      {state?.busy && <p className="atl-aidlg__step">{state.step}</p>}
      {state?.done && <p className="atl-topbar__ok">{state.done}</p>}
      {state?.error && <p className="atl-topbar__error">{state.error}</p>}
    </div>
  );
}
