import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { addSections, sections, sectionsIndex } from "./engine/sections.js";
import { fieldsFor } from "./engine/puck-config.jsx";
import { blocksKey, editableSettings, normalizeProps } from "./engine/render.js";
import { familyOf } from "./engine/families.js";
import { StyleEditor, currentDevice } from "./style-editor-ui.jsx";
import { CarrouselPanel } from "./carrousel-ui.jsx";
import { ROOT_ZONE, Thumb, scrollCanvasTo, usePuckSelect, AddSectionButton } from "./library-ui.jsx";
import { designById } from "./engine/designs.js";
import { ROLES_VISUELS, autoRole, charteForItem, measureIn, roleLabel } from "./engine/charte.js";
import { consigneLangue, langueOf } from "./engine/langue.js";
import { scorePage, familiesOf } from "./engine/page-score.js";
import { TYPES_CONTENU, briefFor } from "./engine/page-blueprints.js";
import { pageTypeById } from "./engine/page-types.js";
import { fondationsPourAudit, localFidelity, knownNumbers, hasUnknownFigure } from "./engine/fidelite.js";
import { isAngleZone, pageRole, zonesFromMother } from "./angle-zones.js";
import { getPage } from "./projects.js";

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

const byId = sectionsIndex;
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
  if (!section) return { texts: [], images: [] };
  const props = normalizeProps(section, item.props);
  const texts = [];
  const images = [];
  if (section.meta.arbre) {
    const leaves = leavesOf(treeForItem(item)).filter((l) => !keys || keys.includes(l.key));
    for (const l of leaves) {
      if (isImageType(l.type)) {
        if (l.image) images.push({ key: l.key, src: l.image, size: l.size });
      } else if (plain(l.text)) texts.push({ id: l.key, text: l.text, role: l.name ?? l.type }); // rôle : « Titre H1 », « Bouton »… (règles de l'IA)
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
  if (!section) return item;
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
  if (node.group) {
    // Groupe sans conteneur marqué : le plus petit bloc qui contient tous ses
    // éléments (le groupe entier s'éclaire, pas seulement le premier élément).
    const els = leavesOf(node.children)
      .map((l) => domOf(sectionId, l))
      .filter(Boolean);
    if (!els.length) return null;
    let common = els[0];
    while (common && common !== root && !els.every((e) => common.contains(e))) common = common.parentElement;
    return common && common !== root ? common : els[0];
  }
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
  const replacement = { sectionId, item: { type: id, props: { id, blocks_element: made.blocks } }, old: item };
  if (!reload) return replacement;
  await applyReplacements(getPuck, [replacement]);
  return replacement;
}

// Pose des sections retravaillées dans l'éditeur, sans recharger la page
// (2026-11-16) : copie de sécurité, sections chargées, puis remplacement dans
// Puck (Ctrl+Z l'annule ; la page s'enregistre toute seule).
export async function applyReplacements(getPuck, replacements) {
  await fetch(`/api/pages/${pageName}/snapshot`, { method: "POST" }).catch(() => {});
  await addSections(replacements.map((r) => r.item.type));
  // Puck applique la nouvelle config après le rendu d'App : attendre un
  // court instant avant de poser la section, sinon elle reste invisible.
  await new Promise((r) => setTimeout(r, 400)); // pas requestAnimationFrame : suspendu dans un onglet caché
  // Puck refuse de changer l'id d'une section par « replace » : on remplace
  // tout le contenu en une seule étape (un seul Ctrl+Z l'annule).
  const { appState, dispatch } = getPuck();
  const byOld = new Map(replacements.map((r) => [r.sectionId, r.item]));
  dispatch({ type: "setData", data: { ...appState.data, content: appState.data.content.map((c) => byOld.get(c.props.id) ?? c) } });
  // Position dans l'historique de Puck juste après le retravail : « Revenir à
  // avant » y revient (comme Ctrl+Z), sans reconstruire la page à la main.
  await new Promise((r) => setTimeout(r, 50));
  const at = getPuck().history?.index;
  for (const r of replacements) r.historyIndex = at;
}

// « Revenir à avant » : revient à l'état d'avant le retravail dans
// l'historique de Puck (comme Ctrl+Z). Si d'autres changements ont été faits
// depuis, ils seraient annulés aussi : on demande d'abord.
export function undoReplacements(getPuck, replacements) {
  const history = getPuck().history;
  const at = replacements[0]?.historyIndex;
  if (!history || typeof at !== "number") return false;
  const later = history.index - at;
  if (later < 0) return false;
  if (later > 0 && !confirm(`Revenir à avant annulera aussi ${later} modification(s) faite(s) depuis le retravail. Continuer ?`)) return false;
  history.setHistoryIndex(at - 1);
  return true;
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
  // Sélection multiple (Ctrl+clic, 2026-11-17) : plusieurs éléments ou
  // groupes, même dans des sections différentes → style, masquer, supprimer.
  const [multi, setMulti] = useState([]);
  const multiRef = useRef(multi);
  multiRef.current = multi;
  const [openSec, setOpenSec] = useState({});
  const [openGroups, setOpenGroups] = useState({});
  const [menu, setMenu] = useState(null);
  const [ai, setAi] = useState(null);
  // Outil IA de la page ouvert depuis le rail de gauche : « reecrire »,
  // « traduire » ou « adapter ».
  const [pageAi, setPageAi] = useState(null);
  const [rebuilt, setRebuilt] = useState(null); // dernier retravail : { list, label }
  const patchRoot = (patch) => {
    const { appState, dispatch } = getPuck();
    dispatch({ type: "replaceRoot", root: { ...appState.data.root, props: { ...appState.data.root.props, ...patch } } });
  };
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
    // Un paragraphe d'un texte regroupé est choisi SEUL (demande du
    // 2026-11-14 : chaque texte sélectionnable seul). Tout le texte reste
    // accessible par la ligne « ¶ » de l'arbre ou par ⬆ (parent).
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
    // Groupes parents (dossiers de l'arbre) : contour léger, tant que l'élément
    // reste choisi. Seuls ceux qui ont un conteneur propre (data-atl-group).
    doc?.querySelectorAll(".atl-hl-parent").forEach((e) => e.classList.remove("atl-hl-parent"));
    if (node) {
      const path = pathTo(treeForItem(content[indexOf(sel.sectionId)]), sameNode(sel)) ?? [];
      for (const p of path.slice(0, -1)) if (p.gid) domOf(sel.sectionId, p)?.classList.add("atl-hl-parent");
    }
    if (el && sel.fromTree) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const row = treeRef.current?.querySelector(".is-chosen");
    row?.scrollIntoView({ block: "nearest" });

    // Toute la surface de l'élément choisi s'éclaire en bleu (calque posé
    // par-dessus, sans toucher à la page) : on voit où commence et où finit un
    // grand groupe. Il suit le défilement et les changements de taille.
    const win = doc?.defaultView;
    if (!doc || !win) return;
    let box = doc.getElementById("atl-hl-box");
    if (!el) {
      box?.remove();
      return;
    }
    if (!box) {
      box = doc.createElement("div");
      box.id = "atl-hl-box";
      doc.body.appendChild(box);
    }
    const targets = node?.run ? node.children.map((c) => domOf(sel.sectionId, c)).filter(Boolean) : [el];
    const place = () => {
      const rects = targets.filter((t) => t.isConnected).map((t) => t.getBoundingClientRect());
      if (!rects.length) return void (box.style.display = "none");
      const top = Math.min(...rects.map((r) => r.top));
      const left = Math.min(...rects.map((r) => r.left));
      box.style.display = "block";
      box.style.top = `${top}px`;
      box.style.left = `${left}px`;
      box.style.width = `${Math.max(...rects.map((r) => r.right)) - left}px`;
      box.style.height = `${Math.max(...rects.map((r) => r.bottom)) - top}px`;
    };
    place();
    win.addEventListener("scroll", place, { capture: true, passive: true });
    win.addEventListener("resize", place);
    const ro = new win.ResizeObserver(place);
    targets.forEach((t) => ro.observe(t));
    return () => {
      win.removeEventListener("scroll", place, { capture: true });
      win.removeEventListener("resize", place);
      ro.disconnect();
    };
  }, [sel, content]);

  // Comme Whitelabeler : l'éditeur s'ouvre à gauche (à côté du rail) quand
  // une section, un élément ou les réglages de la page sont choisis, et se
  // referme sinon ; un outil du rail ouvert le referme.
  useEffect(() => {
    if (!isMain()) return;
    document.documentElement.toggleAttribute("data-atl-edit", Boolean(sel) || multi.length > 1);
    if (sel || multi.length > 1) window.dispatchEvent(new CustomEvent("atl-left-tool", { detail: null }));
  }, [sel, multi]);
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
    if (!selected || multiRef.current.length > 1) return;
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
    // Le plus petit élément sous la souris qui a une ligne dans l'arbre. Le
    // cadre extérieur d'une copie (groupe racine de meta.arbre) n'en a pas :
    // c'est la section elle-même. Avant (2026-11-17), cliquer dessus ouvrait
    // un panneau vide ; maintenant la section est choisie.
    const target = (e) => {
      const sec = under(e, "[data-atl-id]");
      if (!sec) return null;
      const sectionId = sec.dataset.atlId;
      const item = getPuck().appState.data.content.find((c) => c.props.id === sectionId);
      const tree = item ? treeForItem(item) : [];
      const hits = [];
      for (const x of sec.querySelectorAll("[data-atl-slot], [data-atl-group]")) {
        const r = x.getBoundingClientRect();
        if (r.width && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) hits.push([r.width * r.height, x]);
      }
      hits.sort((m, n) => m[0] - n[0]);
      for (const [, x] of hits) {
        const t = { sectionId, key: x.dataset.atlSlot ?? undefined, group: x.dataset.atlSlot ? undefined : x.dataset.atlGroup ?? undefined };
        if (pathTo(tree, sameNode(t))) return t;
      }
      return { sectionId };
    };
    // Emplacement de section conseillée (« + Ajouter une section « … » ici ») :
    // repéré par la géométrie comme le reste (Puck peut couper les clics).
    // Le clic ne doit PAS choisir la section voisine : il ouvre directement le
    // choix du modèle de cette famille (bogue du 2026-11-14).
    const slotBoxAt = (e) => {
      for (const box of doc.querySelectorAll(".atl-slot")) {
        const r = box.getBoundingClientRect();
        if (r.width && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return box;
      }
      return null;
    };
    const onSlotPress = (e) => {
      if (e.isTrusted && (slotBoxAt(e) || ((e.ctrlKey || e.metaKey) && isMain() && !editRef.current))) e.stopPropagation();
    };
    const onClick = (e) => {
      if (e.isTrusted) {
        const box = slotBoxAt(e);
        if (box) {
          e.stopPropagation();
          e.preventDefault();
          // L'élément de l'emplacement sous la souris (ou le seul) → son bouton.
          // Le plus proche verticalement (0 = la souris est dessus).
          const dist = (it) => {
            const r = it.getBoundingClientRect();
            return e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
          };
          const items = [...box.querySelectorAll(".atl-slot__item")];
          const item = items.reduce((best, it) => (!best || dist(it) < dist(best) ? it : best), null);
          item?.querySelector("button[data-slot-key]")?.click();
          return;
        }
      }
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
      // Ctrl+clic (Cmd+clic sur Mac) : ajoute ou retire de la sélection.
      if (t && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => toggleMulti(t), 0);
        return;
      }
      if (multiRef.current.length) setMulti([]);
      if (t) setTimeout(() => choose(t, { scroll: false }), 0);
    };
    // Double-clic sur un texte : on écrit directement dans la page.
    const onDouble = (e) => {
      if (slotBoxAt(e)) return void e.stopPropagation();
      if (!isMain() || editRef.current) return;
      const t = target(e);
      if (!t?.key) return;
      e.preventDefault();
      choose(t, { scroll: false });
      setTimeout(() => startEdit(t, { x: e.clientX, y: e.clientY }), 0);
    };
    const onMenu = (e) => {
      if (slotBoxAt(e)) return;
      if (!isMain()) return;
      let t = target(e);
      if (!t) return;
      e.preventDefault();
      // Clic droit dans ce qui est déjà choisi (la section entière, un
      // groupe) : le menu porte sur tout le choix, pas sur l'élément pointé.
      const cur = selRef.current;
      if (cur?.sectionId === t.sectionId && (t.key || t.group)) {
        const sec = doc.querySelector(`[data-atl-id="${CSS.escape(t.sectionId)}"]`);
        const box = cur.group ? sec?.querySelector(`[data-atl-group="${CSS.escape(cur.group)}"]`) : null;
        const pointed = e.target?.nodeType === 1 ? e.target : null;
        const r = box?.getBoundingClientRect();
        const inBox = r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!cur.key && !cur.group) t = { sectionId: t.sectionId };
        else if (cur.group && (inBox || box?.contains(pointed))) t = { sectionId: t.sectionId, group: cur.group };
      }
      const frame = canvasFrame();
      const r = frame.getBoundingClientRect();
      const scale = r.width / frame.offsetWidth || 1;
      choose(t, { scroll: false });
      setMenu({ x: r.left + e.clientX * scale, y: r.top + e.clientY * scale, ...t });
    };
    // Pas d'éclairage au survol : seul l'élément choisi s'éclaire.
    // Léger soulèvement de l'élément (texte/image) survolé : la géométrie
    // décide (comme les clics), car des calques peuvent recouvrir le slot.
    let hovered = null;
    let rafPending = false;
    let lastMove = null;
    const applyHover = () => {
      rafPending = false;
      const e = lastMove;
      if (!e || !doc) return;
      if (editRef.current) {
        hovered?.classList.remove("atl-hover");
        hovered = null;
        placeTag(null);
        return;
      }
      const sec = under(e, "[data-atl-id]");
      const el = sec ? under(e, `[data-atl-id="${CSS.escape(sec.dataset.atlId)}"] [data-atl-slot], [data-atl-id="${CSS.escape(sec.dataset.atlId)}"] [data-atl-group]`) : null;
      if (el === hovered) return;
      hovered?.classList.remove("atl-hover");
      hovered = el;
      hovered?.classList.add("atl-hover");
      placeTag(el);
    };
    // Étiquette du type d'élément survolé (Titre, Texte, Bouton, Image, Bloc),
    // posée dans le coin haut gauche, comme dans les éditeurs visuels.
    const tagLabel = (el) => {
      if (el.hasAttribute("data-atl-group") && !el.hasAttribute("data-atl-slot")) return "▢ Bloc";
      if (el.tagName === "IMG" || el.tagName === "PICTURE" || el.querySelector?.(":scope > img:only-child")) return "🖼 Image";
      if (el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button") return "⚡ Bouton";
      if (/^H[1-6]$/.test(el.tagName)) return `T ${el.tagName === "H1" ? "Titre 1" : el.tagName === "H2" ? "Titre 2" : "Titre"}`;
      return "T Texte";
    };
    const placeTag = (el) => {
      let tag = doc.getElementById("atl-tag");
      if (!el) return void (tag && (tag.style.display = "none"));
      if (!tag) {
        tag = doc.createElement("div");
        tag.id = "atl-tag";
        doc.body.appendChild(tag);
      }
      const r = el.getBoundingClientRect();
      tag.textContent = tagLabel(el);
      tag.style.display = "block";
      tag.style.left = `${Math.max(0, r.left)}px`;
      tag.style.top = `${r.top > 22 ? r.top - 20 : r.top + 2}px`;
    };
    const onScrollDoc = () => {
      const tag = doc?.getElementById("atl-tag");
      if (tag) tag.style.display = "none";
      hovered?.classList.remove("atl-hover");
      hovered = null;
    };
    const onMove = (e) => {
      lastMove = e;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(applyHover);
      }
    };
    const onLeaveDoc = () => {
      lastMove = null;
      onScrollDoc();
    };
    const attach = () => {
      const next = canvasFrame()?.contentDocument ?? null;
      if (next === doc) return;
      doc?.removeEventListener("click", onClick, true);
      doc?.removeEventListener("pointerdown", onSlotPress, true);
      doc?.removeEventListener("mousedown", onSlotPress, true);
      doc?.removeEventListener("contextmenu", onMenu, true);
      doc?.removeEventListener("dblclick", onDouble, true);
      doc?.removeEventListener("mousemove", onMove, true);
      doc?.removeEventListener("mouseleave", onLeaveDoc, true);
      doc?.removeEventListener("scroll", onScrollDoc, true);
      onLeaveDoc();
      doc = next;
      doc?.addEventListener("click", onClick, true);
      doc?.addEventListener("pointerdown", onSlotPress, true);
      doc?.addEventListener("mousedown", onSlotPress, true);
      doc?.addEventListener("contextmenu", onMenu, true);
      doc?.addEventListener("dblclick", onDouble, true);
      doc?.addEventListener("mousemove", onMove, true);
      doc?.addEventListener("mouseleave", onLeaveDoc, true);
      doc?.addEventListener("scroll", onScrollDoc, { capture: true, passive: true });
    };
    attach();
    const timer = setInterval(attach, 1000);
    return () => {
      clearInterval(timer);
      doc?.removeEventListener("click", onClick, true);
      doc?.removeEventListener("pointerdown", onSlotPress, true);
      doc?.removeEventListener("mousedown", onSlotPress, true);
      doc?.removeEventListener("contextmenu", onMenu, true);
      doc?.removeEventListener("dblclick", onDouble, true);
      doc?.removeEventListener("mousemove", onMove, true);
      doc?.removeEventListener("mouseleave", onLeaveDoc, true);
      doc?.removeEventListener("scroll", onScrollDoc, true);
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

  // Arrivée depuis le catalogue (« + Ajouter ») : ?section=<id> → la section
  // ajoutée est choisie et l'aperçu défile jusqu'à elle, dès qu'elle est là.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const target = params.get("section");
    if (!target) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const doc = canvasFrame()?.contentDocument;
      if (doc?.querySelector(`[data-atl-id="${CSS.escape(target)}"]`)) {
        clearInterval(timer);
        choose({ sectionId: target });
        setTimeout(() => scrollCanvasTo(target), 300);
        params.delete("section");
        history.replaceState(null, "", `${location.pathname}?${params}`);
      } else if (tries > 60) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Menu ✨ IA du rail de gauche (outils de toute la page), et « Refaire avec
  // l'IA » d'une image : la fenêtre Retravailler, sur cette image seulement.
  useEffect(() => {
    const onPage = (e) => setPageAi(e.detail);
    const onImage = () => {
      const cur = selRef.current;
      if (cur?.sectionId && cur.key) setAi({ sectionId: cur.sectionId, keys: [cur.key], tab: "images" });
      // Image hors d'un élément (fond de section…) : le Studio d'images
      // (la planche des images a été retirée le 2026-11-12).
      else window.dispatchEvent(new CustomEvent("atl-open-studio"));
    };
    window.addEventListener("atl-ai-page", onPage);
    window.addEventListener("atl-ai-image", onImage);
    return () => {
      window.removeEventListener("atl-ai-page", onPage);
      window.removeEventListener("atl-ai-image", onImage);
    };
  }, []);

  // Suppressions, toujours après confirmation.
  // Section : retirée de la page (Annuler / Historique pour revenir).
  const removeSection = (sectionId) => {
    const index = indexOf(sectionId);
    const item = content[index];
    if (!item) return;
    if (!confirm(`Supprimer la section « ${(byId[item.type]?.meta.label ?? item.type).split(" — ")[0]} » de la page ?`)) return;
    run({ type: "remove", index, zone: ROOT_ZONE }, null);
    setSel(null);
  };
  // Élément ou groupe d'une copie : masqué partout (display: none dans
  // atl_styles), comme « Masquer partout » du panneau de style, qui le fait
  // revenir. Le texte et l'image restent dans la page, au cas où.
  const removeNode = (sectionId, node) => {
    const item = itemOf(sectionId);
    if (!item || !node) return;
    const targets = node.group ? (node.gid ? [node.gid] : leavesOf(node.children).map((l) => l.key)) : [node.key];
    const what = node.group ? `le groupe « ${node.label} »` : `l'élément « ${(node.label ?? node.name ?? "").slice(0, 50)} »`;
    if (!confirm(`Supprimer ${what} ?\n\nIl est masqué sur tous les écrans ; pour le faire revenir : panneau de style, « Masquer partout ».`)) return;
    const styles = structuredClone(item.props.atl_styles ?? {});
    for (const t of targets) {
      styles[t] ??= {};
      styles[t].all ??= {};
      styles[t].all.base = { ...styles[t].all.base, display: "none" };
    }
    updateProps(sectionId, { ...item.props, atl_styles: styles });
    close();
  };

  const menuItems = (m) => {
    const index = indexOf(m.sectionId);
    const item = content[index];
    if (!item) return [];
    const node = nodeOf(m);
    const keys = node ? (node.group ? leavesOf(node.children).map((l) => l.key) : [node.key]) : null;
    const items = [{ label: "✨ Retravailler avec l'IA…", action: () => setAi({ sectionId: m.sectionId, keys, label: node?.group ? node.label : null }) }];
    if (node) {
      const sibs = siblingsOf(m.sectionId, node);
      const i = sibs.findIndex((n) => (node.key ? n.key === node.key : n.id === node.id));
      items.push(
        { label: "Modifier", action: () => choose({ sectionId: m.sectionId, key: node.key, group: node.group ? node.id : undefined, fromTree: true }) },
        { sep: true },
        { label: "Monter", disabled: i <= 0, action: () => step(m.sectionId, node, -1) },
        { label: "Descendre", disabled: i < 0 || i >= sibs.length - 1, action: () => step(m.sectionId, node, 1) },
        { sep: true },
        { label: node.group ? "Supprimer le groupe" : "Supprimer l'élément", danger: true, action: () => removeNode(m.sectionId, node) },
      );
    } else {
      items.push(
        { label: "Réglages de la section", action: () => choose({ sectionId: m.sectionId }) },
        { sep: true },
        { label: "Monter", disabled: index === 0, action: () => run({ type: "reorder", sourceIndex: index, destinationIndex: index - 1, destinationZone: ROOT_ZONE }, index - 1) },
        { label: "Descendre", disabled: index === content.length - 1, action: () => run({ type: "reorder", sourceIndex: index, destinationIndex: index + 1, destinationZone: ROOT_ZONE }, index + 1) },
        { label: "Dupliquer", action: () => run({ type: "duplicate", sourceIndex: index, sourceZone: ROOT_ZONE }, index + 1) },
        { label: "Supprimer la section", danger: true, action: () => removeSection(m.sectionId) },
      );
    }
    return items;
  };

  // ---- Sélection multiple (Ctrl+clic) ----
  function toggleMulti(t) {
    if (!t.key && !t.group) return; // une section entière : pas en multiple
    const same = (a, b) => a.sectionId === b.sectionId && a.key === b.key && a.group === b.group;
    const cur = selRef.current;
    let list = multiRef.current.length ? multiRef.current : cur?.key || cur?.group ? [{ sectionId: cur.sectionId, key: cur.key, group: cur.group }] : [];
    list = list.some((x) => same(x, t)) ? list.filter((x) => !same(x, t)) : [...list, { sectionId: t.sectionId, key: t.key, group: t.group }];
    if (list.length < 2) {
      setMulti([]);
      if (list[0]) choose(list[0], { scroll: false });
      return;
    }
    finishEdit();
    selRef.current = null;
    setSel(null);
    setMulti(list);
  }
  const multiEntries = multi
    .map((m) => {
      const item = content[indexOf(m.sectionId)];
      const node = nodeOf(m);
      if (!item || !node) return null;
      const keys = node.group ? (node.gid ? [node.gid] : leavesOf(node.children).map((l) => l.key)) : [!isImageType(node.type) && node.lien ? node.lien : node.key];
      const kind = node.group ? "groupe" : isImageType(node.type) ? "image" : node.lien || node.type === "bouton" || node.type === "lien" ? "bouton" : "texte";
      const label = node.group ? node.label : node.name ?? (TYPE[node.type] ?? TYPE.texte).label;
      return { ...m, item, node, keys, kind, label, el: domOf(m.sectionId, node) };
    })
    .filter(Boolean);
  // Les éléments choisis : un contour violet dans l'aperçu.
  // (Relevé un peu après le rendu : l'aperçu redessine ses sections ensuite.)
  useEffect(() => {
    const marked = [];
    const paint = () => {
      for (const e of multiEntries) {
        const el = domOf(e.sectionId, e.node);
        if (!el || marked.some(([m]) => m === el)) continue;
        marked.push([el, el.style.outline, el.style.outlineOffset]);
        el.style.outline = "2px solid #4f46e5";
        el.style.outlineOffset = "2px";
      }
    };
    const timers = [0, 120, 500].map((ms) => setTimeout(paint, ms));
    return () => {
      timers.forEach(clearTimeout);
      marked.forEach(([el, o, oo]) => ((el.style.outline = o), (el.style.outlineOffset = oo)));
    };
  }, [multi, content]);
  // Échap vide la sélection multiple (aussi depuis l'aperçu).
  useEffect(() => {
    if (multi.length < 2) return;
    const onKey = (e) => e.key === "Escape" && setMulti([]);
    const win = canvasFrame()?.contentWindow;
    window.addEventListener("keydown", onKey);
    win?.addEventListener("keydown", onKey);
    return () => (window.removeEventListener("keydown", onKey), win?.removeEventListener("keydown", onKey));
  }, [multi.length > 1]);
  // Une seule étape d'historique pour toutes les sections touchées (Ctrl+Z).
  function patchMultiStyles(fn) {
    const { appState, dispatch } = getPuck();
    const bySection = new Map();
    for (const e of multiEntries) bySection.set(e.sectionId, [...(bySection.get(e.sectionId) ?? []), ...e.keys]);
    const next = appState.data.content.map((c) => {
      const keys = bySection.get(c.props.id);
      if (!keys) return c;
      const styles = structuredClone(c.props.atl_styles ?? {});
      fn(styles, keys);
      return { ...c, props: { ...c.props, atl_styles: styles } };
    });
    dispatch({ type: "setData", data: { ...appState.data, content: next }, recordHistory: true });
  }
  const setDisplay = (styles, keys, dev, value) => {
    for (const k of keys) {
      if (value) {
        styles[k] ??= {};
        styles[k][dev] ??= {};
        styles[k][dev].base = { ...styles[k][dev].base, display: value };
      } else if (styles[k]?.[dev]?.base) {
        delete styles[k][dev].base.display;
      }
    }
  };
  function multiHide() {
    const dev = currentDevice().value;
    const allHidden = multiEntries.every((e) => e.keys.every((k) => e.item.props.atl_styles?.[k]?.[dev]?.base?.display === "none"));
    patchMultiStyles((styles, keys) => setDisplay(styles, keys, dev, allHidden ? "" : "none"));
  }
  function multiDelete() {
    if (!confirm(`Supprimer ces ${multiEntries.length} éléments ?\n\nIls sont masqués sur tous les écrans ; Ctrl+Z les fait revenir.`)) return;
    patchMultiStyles((styles, keys) => setDisplay(styles, keys, "all", "none"));
    setMulti([]);
  }
  // Le panneau de style du premier élément, appliqué à tous : seules les
  // retouches faites ici sont recopiées (le reste de chaque style est gardé).
  function multiStyle(before, after) {
    patchMultiStyles((styles, keys) => {
      for (const k of keys) styles[k] = mergeStyleDiff(styles[k], before, after);
      for (const k of Object.keys(styles)) if (!styles[k] || !Object.keys(styles[k]).length) delete styles[k];
    });
  }

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
  const withUndoBar = async (job) => {
    const r = await job;
    if (r?.old) setRebuilt({ list: [r], label: "Section retravaillée" });
    return r;
  };
  const adaptToPage = (sectionId) => withUndoBar(rebuildSectionWith(getPuck, sectionId, adaptInstructionFor(getPuck().appState.data, sectionId), null));
  const rebuildSection = (sectionId, instruction, reference) => withUndoBar(rebuildSectionWith(getPuck, sectionId, instruction, reference));

  return (
    <div className="atl-insp" ref={rootRef}>
      {/* Comme Whitelabeler : soit la structure de la page, soit les réglages
          de l'élément choisi, jamais les deux (un seul ascenseur). */}
      {multi.length > 1 && (
        <MultiPanel
          entries={multiEntries}
          onClear={() => setMulti([])}
          onRemove={(e) => toggleMulti(e)}
          onHide={multiHide}
          onDelete={multiDelete}
          onStyle={multiStyle}
        />
      )}
      {!sel && multi.length < 2 && <TreeView
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
            <PanelHead onBack={close} title="Réglages de la page" sub="Titre, type de page, page d'achat liée" />
            <BrandSheet root={getPuck().appState.data.root?.props ?? {}} onChange={patchRoot} />
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
              onAiDesign={(prompt) => setAi({ sectionId: sel.sectionId, keys: null, tab: "design", prompt })}
              onValues={(values) => updateValues(sel.sectionId, values)}
              onOpen={(key) => setSel({ sectionId: sel.sectionId, key })}
              onMoveNode={(child, dir) => step(sel.sectionId, child, dir)}
              onDelete={() => removeSection(sel.sectionId)}
            />
          ) : (
            <SectionSettings
              item={content[indexOf(sel.sectionId)]}
              onBack={close}
              onAi={() => setAi({ sectionId: sel.sectionId, keys: null })}
              onAiDesign={(prompt) => setAi({ sectionId: sel.sectionId, keys: null, tab: "design", prompt })}
              onChange={(props) => updateProps(sel.sectionId, props)}
              onDelete={() => removeSection(sel.sectionId)}
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
            onDelete={() => removeNode(sel.sectionId, selNode)}
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
            onDelete={() => removeNode(sel.sectionId, selNode)}
          />
        )}
        {sel?.group && selNode && !selNode.run && (
          <div className="atl-insp__panel">
            <PanelHead
              onBack={close}
              title={`${GROUP_ICON[selNode.kind] ?? "▤"} ${selNode.label}`}
              sub={`${leavesOf(selNode.children).length} élément(s)`}
              onAi={() => setAi({ sectionId: sel.sectionId, keys: leavesOf(selNode.children).map((l) => l.key), label: selNode.label })}
              onDelete={() => removeNode(sel.sectionId, selNode)}
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
        {/* Barre « Demander une modification » retirée le 2026-11-16 (demande de
            l'utilisateur) : l'IA s'ouvre par le clic droit ou le bouton ✨ IA. */}
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
          onAddSection={() => window.dispatchEvent(new CustomEvent("atl-add-section", { detail: { index: indexOf(sel.sectionId) + 1 } }))}
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
      {ai && content[indexOf(ai.sectionId)] && (
        <AiDialog
          target={ai}
          item={content[indexOf(ai.sectionId)]}
          onClose={() => setAi(null)}
          onApply={(values) => updateValues(ai.sectionId, values)}
          root={getPuck().appState.data.root?.props ?? {}}
          // Design : toujours la section entière qui est redessinée ; pour un
          // élément ou un groupe, la consigne ne vise que cette partie.
          onRebuild={(instruction, reference) => {
            if (!ai.keys) return rebuildSection(ai.sectionId, instruction, reference);
            const part = aiTargets(content[indexOf(ai.sectionId)], ai.keys)
              .texts.map((t) => String(t.text ?? "").replace(/<[^>]+>/g, " ").trim())
              .filter(Boolean)
              .slice(0, 3)
              .join(" / ")
              .slice(0, 200);
            const which = `« ${ai.label ?? "élément choisi"} »${part ? ` (celle qui contient : ${part})` : ""}`;
            return rebuildSection(ai.sectionId, `Ne change QUE la partie ${which} ; tout le reste de la section reste identique. Consigne : ${instruction}`, reference);
          }}
          onAdapt={!ai.keys ? () => adaptToPage(ai.sectionId) : null}
          onUndo={(r) => undoReplacements(getPuck, [r])}
        />
      )}
      {pageAi && (
        <PageAiDialog
          tool={pageAi}
          content={content}
          root={getPuck().appState.data.root?.props ?? {}}
          onApplyMany={(map) => {
            // Propositions acceptées : une seule étape d'historique (Ctrl+Z).
            const { appState, dispatch } = getPuck();
            const next = appState.data.content.map((c) => (map[c.props.id] ? applyValues(c, map[c.props.id]) : c));
            dispatch({ type: "setData", data: { ...appState.data, content: next }, recordHistory: true });
          }}
          onRoot={patchRoot}
          onAdaptAll={async (onStep) => {
            const data = getPuck().appState.data;
            const replacements = [];
            for (const [i, item] of data.content.entries()) {
              onStep(`Section ${i + 1} / ${data.content.length}…`);
              replacements.push(await rebuildSectionWith(getPuck, item.props.id, adaptInstructionFor(data, item.props.id), null, { reload: false }));
            }
            onStep("Mise en place…");
            await applyReplacements(getPuck, replacements);
            setRebuilt({ list: replacements, label: "Page adaptée" });
            return replacements;
          }}
          onUndoAll={(replacements) => undoReplacements(getPuck, replacements)}
          onClose={() => setPageAi(null)}
        />
      )}
      {rebuilt &&
        createPortal(
          <div className="atl-undobar" role="status">
            <span>✓ {rebuilt.label}, déjà dans la page (enregistrement automatique).</span>
            <button type="button" onClick={() => (undoReplacements(getPuck, rebuilt.list), setRebuilt(null))}>
              ↶ Revenir à avant
            </button>
            <button type="button" className="atl-undobar__x" onClick={() => setRebuilt(null)} aria-label="Fermer">
              ×
            </button>
          </div>,
          document.body,
        )}
      {/* « + Ajouter une section » entre les sections de l'aperçu. */}
      {isMain() && <CanvasInsertChips content={content} />}
      {/* Modale d'ajout, ouverte par la barre flottante ou un espace entre sections. */}
      {isMain() && <AddSectionButton variant="hidden" />}
    </div>
  );
}

// ---- « + Ajouter une section » entre les sections (comme les éditeurs visuels) ----
// Un sillon discret sur chaque joint entre sections : au survol, une pastille
// « + » ; un clic ouvre la modale d'ajout, qui insère à cet emplacement exact.
function CanvasInsertChips({ content }) {
  const [chips, setChips] = useState([]);
  useEffect(() => {
    let raf;
    const tick = () => {
      const frame = canvasFrame();
      const next = [];
      const doc = frame?.contentDocument;
      if (frame && doc) {
        const fr = frame.getBoundingClientRect();
        const scale = fr.width / frame.offsetWidth || 1;
        // Joint au-dessus de chaque section (sauf la première) + un en fin de page.
        content.forEach((item, i) => {
          if (i === 0) return;
          const el = doc.querySelector(`[data-atl-id="${CSS.escape(item.props.id)}"]`);
          if (!el) return;
          const r = el.getBoundingClientRect();
          const top = fr.top + r.top * scale;
          if (top > fr.top + 40 && top < fr.bottom - 8) {
            next.push({ key: `j${item.props.id}`, index: i, top: Math.round(top), left: Math.round(fr.left + r.left * scale), width: Math.max(120, Math.round(r.width * scale)) });
          }
        });
        const last = content[content.length - 1];
        const lastEl = last && doc.querySelector(`[data-atl-id="${CSS.escape(last.props.id)}"]`);
        if (lastEl) {
          const r = lastEl.getBoundingClientRect();
          const top = fr.top + r.bottom * scale;
          if (top > fr.top + 40 && top < fr.bottom - 8) {
            next.push({ key: "j-fin", index: content.length, top: Math.round(top), left: Math.round(fr.left + r.left * scale), width: Math.max(120, Math.round(r.width * scale)) });
          }
        }
      }
      setChips((c) => (JSON.stringify(c) === JSON.stringify(next) ? c : next));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [content]);
  return createPortal(
    <>
      {chips.map((c) => (
        <div
          key={c.key}
          className="atl-chip"
          style={{ top: c.top, left: c.left, width: c.width }}
          onClick={() => window.dispatchEvent(new CustomEvent("atl-add-section", { detail: { index: c.index } }))}
        >
          <span className="atl-chip__line" />
          <span className="atl-chip__btn" title="Ajouter une section ici">
            ＋<em>Ajouter une section</em>
          </span>
        </div>
      ))}
    </>,
    document.body,
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
        // Nom de la section seulement, sans le site d'où elle vient (2026-11-16).
        const name = (section.meta.label ?? section.id).split(" — ")[0];
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
      // Dossier parent de l'élément choisi : il reste éclairé (plus clair).
      const onPath = !chosen && sel?.sectionId === sectionId && Boolean(pathTo(n.children, sameNode(sel)));
      return (
        <div key={n.id}>
          <div
            className={`atl-insp__row${chosen ? " is-chosen" : ""}${onPath ? " is-on-path" : ""}${hint?.id === rowId ? ` is-drop-${hint.side}` : ""}`}
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

// onDelete : bouton 🗑 (section, élément, groupe) ; la confirmation est
// demandée par l'action elle-même.
// Recopie dans `target` ce qui a changé entre `before` et `after`
// ({ écran: { partie: { propriété: valeur } } }).
function mergeStyleDiff(target, before = {}, after = {}) {
  const out = structuredClone(target ?? {});
  const devs = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const dev of devs) {
    const parts = new Set([...Object.keys(before?.[dev] ?? {}), ...Object.keys(after?.[dev] ?? {})]);
    for (const part of parts) {
      const b = before?.[dev]?.[part] ?? {};
      const a = after?.[dev]?.[part] ?? {};
      for (const p of new Set([...Object.keys(b), ...Object.keys(a)])) {
        if (a[p] === b[p]) continue;
        if (a[p] == null || a[p] === "") {
          delete out[dev]?.[part]?.[p];
        } else {
          out[dev] ??= {};
          out[dev][part] ??= {};
          out[dev][part][p] = a[p];
        }
      }
      if (out[dev]?.[part] && !Object.keys(out[dev][part]).length) delete out[dev][part];
    }
    if (out[dev] && !Object.keys(out[dev]).length) delete out[dev];
  }
  return out;
}

// Panneau de la sélection multiple : la liste, Masquer, Supprimer, et le
// panneau de style (celui du premier élément, appliqué à tous).
function MultiPanel({ entries, onClear, onRemove, onHide, onDelete, onStyle }) {
  if (!entries.length) return null;
  const first = entries[0];
  const kinds = new Set(entries.map((e) => e.kind));
  // Textes et boutons mêlés : la typographie leur est commune.
  const kind = kinds.size === 1 ? first.kind : [...kinds].every((k) => k === "texte" || k === "bouton") ? "texte" : "groupe";
  const own = structuredClone(first.item.props.atl_styles?.[first.keys[0]] ?? {});
  const synth = { atl_styles: { __multi: own } };
  const where = currentDevice().where;
  return (
    <div className="atl-insp__panel atl-multi">
      <PanelHead onBack={onClear} title={`${entries.length} éléments choisis`} sub="Ctrl+clic pour en ajouter ou en retirer" onDelete={onDelete} />
      <ul className="atl-multi__list">
        {entries.map((e) => (
          <li key={`${e.sectionId}/${e.key ?? e.group}`}>
            <span>{String(e.label ?? "").slice(0, 40)}</span>
            <button type="button" onClick={() => onRemove(e)} title="Retirer de la sélection" aria-label="Retirer de la sélection">
              ×
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="atl-multi__hide" onClick={onHide}>
        Masquer / afficher {where}
      </button>
      <StyleEditor
        key={entries.map((e) => `${e.sectionId}/${e.keys.join("+")}`).join(",")}
        kind={kind}
        targets={["__multi"]}
        props={synth}
        el={first.el}
        onChangeProps={(next) => onStyle(own, next.atl_styles?.__multi ?? {})}
      />
    </div>
  );
}

// Rôle visuel d'un élément pour la charte (lot 2, 2026-11-17) : deviné
// d'après son nom et sa taille, corrigeable ici. Si la page suit une charte,
// la section est recalculée tout de suite.
function RoleSelect({ item, leaf, props, onChangeProps }) {
  const getPuck = useGetPuck();
  const doc = canvasFrame()?.contentDocument;
  const auto = autoRole(leaf, measureIn(doc, item.props.id)(leaf.key), byId[item.type]?.meta?.family);
  const own = props.atl_roles?.[leaf.key] ?? "";
  const change = (value) => {
    const roles = { ...(props.atl_roles ?? {}) };
    if (value) roles[leaf.key] = value;
    else delete roles[leaf.key];
    const next = { ...props, atl_roles: roles };
    const ch = getPuck().appState.data.root?.props?.charte;
    const design = ch && designById[ch.design];
    if (design) {
      const { charte } = charteForItem({ ...item, props: next }, byId[item.type], design, ch, measureIn(doc, item.props.id));
      if (charte) next.atl_charte = charte;
      else delete next.atl_charte;
    }
    onChangeProps(next);
  };
  return (
    <label className="atl-insp__field atl-role">
      <span className="atl-rte__label">Rôle visuel (charte)</span>
      <select value={own} onChange={(e) => change(e.target.value)}>
        <option value="">Automatique : {auto ? roleLabel(auto) : "aucun"}</option>
        {ROLES_VISUELS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PanelHead({ onBack, title, sub, onAi, onDelete, saveItem }) {
  return (
    <div className="atl-insp__bar">
      <button type="button" className="atl-insp__back" onClick={onBack} title="Revenir à la page">
        ←
      </button>
      <div className="atl-insp__bartitle">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </div>
      {saveItem && <SaveSectionMenu item={saveItem} />}
      {onAi && (
        <button type="button" className="atl-insp__aibtn" onClick={onAi} title="Retravailler avec l'IA">
          ✨ IA
        </button>
      )}
      {onDelete && (
        <button type="button" className="atl-insp__delete" onClick={onDelete} title="Supprimer">
          🗑
        </button>
      )}
      <button
        type="button"
        className="atl-insp__collapse"
        title="Ranger le panneau (Échap)"
        onClick={() => window.dispatchEvent(new CustomEvent("atl-close-editor"))}
      >
        →
      </button>
    </div>
  );
}

function SectionSettings({ item, onBack, onAi, onAiDesign, onChange, onDelete }) {
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const section = byId[item.type];
  if (!section) return null; // section en cours de chargement (retravail IA)
  const props = normalizeProps(section, item.props);
  const [name, variant] = (section.meta.label ?? section.id).split(" — ");
  const hasSettings = editableSettings(section.schema.settings).length > 0;
  return (
    <div className="atl-insp__panel">
      <PanelHead onBack={onBack} title={name} sub={familyOf(section).label} onAi={onAi} onDelete={onDelete} saveItem={item} />
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
      <CarrouselPanel section={section} props={props} el={canvasFrame()?.contentDocument.querySelector(`[data-atl-id="${CSS.escape(item.props.id)}"]`)} onChange={onChange} onAiDesign={onAiDesign} />
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
      <button type="button" className="atl-aibtn-wide" onClick={onAi}>
        ✨ Retravailler avec l'IA…
        <small>Textes, images ou design de la section</small>
      </button>
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

function ElementSettings({ item, elementKey, onBack, onAi, onChange, onChangeProps, onDelete }) {
  if (!item) return null;
  const section = byId[item.type];
  if (!section) return null; // section en cours de chargement (retravail IA)
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
        <PanelHead onBack={onBack} title={`${t.icon} ${leaf.name ?? t.label}${leaf.size ? ` ${leaf.size}` : ""}`} sub={sectionName} onAi={onAi} onDelete={onDelete} />
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
            <RoleSelect item={item} leaf={leaf} props={props} onChangeProps={onChangeProps} />
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
  const removeBlock = () => confirm("Supprimer ce bloc ?") && (onChangeProps({ ...props, [blocksKey(type)]: list.filter((_, j) => j !== Number(i)) }), onBack());
  return (
    <div className="atl-insp__panel">
      <PanelHead onBack={onBack} title={`${block?.name ?? "Bloc"} ${Number(i) + 1}`} sub={sectionName} onAi={onAi} onDelete={removeBlock} />
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
        onClick={removeBlock}
      >
        Supprimer le bloc
      </button>
    </div>
  );
}

// Texte de plusieurs paragraphes : une seule zone (une ligne vide sépare les
// paragraphes) ; le style choisi s'applique à tous.
function TextRunSettings({ item, node, onBack, onAi, onChange, onChangeProps, onDelete }) {
  if (!item) return null;
  const section = byId[item.type];
  if (!section) return null; // section en cours de chargement (retravail IA)
  const props = normalizeProps(section, item.props);
  const [sectionName] = (section.meta.label ?? section.id).split(" — ");
  const leaves = node.children;
  const first = (props.blocks_element ?? []).find((b) => b.slot === leaves[0].key);
  return (
    <div className="atl-insp__panel">
      <PanelHead onBack={onBack} title="¶ Texte" sub={`${sectionName} · ${leaves.length} paragraphes`} onAi={onAi} onDelete={onDelete} />
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
    const shut = () => onClose();
    // L'aperçu est un autre document : un clic, un défilement ou une touche
    // dedans ferment aussi le menu.
    const frames = [...document.querySelectorAll("iframe")].map((f) => f.contentWindow).filter(Boolean);
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", close);
      frames.forEach((w) => {
        w.addEventListener("mousedown", shut);
        w.addEventListener("wheel", shut, { passive: true });
        w.addEventListener("keydown", esc);
      });
    }, 0);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", shut);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("blur", shut);
      frames.forEach((w) => {
        w.removeEventListener("mousedown", shut);
        w.removeEventListener("wheel", shut);
        w.removeEventListener("keydown", esc);
      });
    };
  }, []);
  // zoom: sur .atl-ctx dilate aussi les coordonnées inline : on divise par la
  // compensation de zoom (voir App.jsx) pour que le menu reste sous la souris.
  const uiZoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--atl-ui-zoom")) || 1;
  // Une action ne part qu'une fois (appui, puis « click » éventuel).
  const fired = useRef(false);
  const fire = (it) => {
    if (fired.current || it.disabled) return;
    fired.current = true;
    onClose();
    try {
      it.action();
    } catch (err) {
      console.error("Action du menu contextuel:", err);
    }
  };
  const left = Math.min(x / uiZoom, innerWidth / uiZoom - 240);
  const top = Math.min(y / uiZoom, innerHeight / uiZoom - 40 * items.length - 20);
  return createPortal(
    <div className="atl-ctx" ref={ref} style={{ left, top }} role="menu">
      {items.map((it, i) =>
        it.sep ? (
          <hr key={i} />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            className={it.danger ? "is-danger" : ""}
            // L'action part dès l'appui (bouton gauche) : entre l'appui et le
            // relâchement, l'éditeur peut redessiner le menu (la page perd le
            // focus, la sélection change) et le navigateur annule alors le
            // « click ». onClick reste pour le clavier (Entrée).
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              fire(it);
            }}
            onClick={() => fire(it)}
          >
            {it.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

// ---- Retravailler avec l'IA ----
const QUICK =["Plus court", "Plus percutant", "Plus émotionnel", "Adapter à mon produit", "Traduire en français", "Traduire en anglais"];
const REFS_KEY = "atl-ia-references";

// Trois onglets : Textes, Images, Design (section entière seulement :
// redessiner, nettoyer, adapter au style de la page).
function AiDialog({ target, item, onClose, onApply, root, onRebuild, onAdapt, onUndo }) {
  const { texts, images } = useMemo(() => aiTargets(item, target.keys), [item, target.keys]);
  const [prompt, setPrompt] = useState(target.prompt ?? "");
  const [tab, setTab] = useState(target.tab ?? (texts.length ? "textes" : images.length ? "images" : "design"));
  const doTexts = tab === "textes";
  const doImages = tab === "images";
  const [designRef, setDesignRef] = useState(null);
  const [refs, setRefs] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(REFS_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [state, setState] = useState(null);
  const section = byId[item.type];
  if (!section) return null;
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

  // Onglet Design : la section est redessinée et posée dans la page, sans
  // rechargement ; « Revenir à avant » ou Ctrl+Z l'annulent (2026-11-16).
  async function design(kind) {
    setState({ busy: true, step: "Section en cours de redessin (30 à 90 s)…" });
    try {
      const r = kind === "adapter" ? await onAdapt() : await onRebuild(kind === "nettoyer" ? "Remets de l'ordre dans cette section : alignements, espacements et tailles cohérents et réguliers, sans changer les textes ni les images." : prompt.trim() || "Redessine cette section comme sur l'image de référence, en gardant ses textes et ses images.", designRef);
      setState({ rebuilt: r ?? true });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  async function launch() {
    if (tab === "design") return design("redessiner");
    if (!prompt.trim()) return setState({ error: "Écris ce que tu veux changer." });
    setState({ busy: true, step: "" });
    try {
      if (doTexts && texts.length) {
        setState({ busy: true, step: `Textes : ${texts.length} en cours…` });
        const res = await fetch("/api/ia/textes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: texts, regles: !/tradui|translat/i.test(prompt), prompt: /tradui|translat/i.test(prompt) ? prompt : `${prompt}
${consigneLangue(root)}`, contexte: { marque: root.marque ?? "", produit: root.produit ?? "", profil: root.profil ?? "", infosProduit: String(root.infos ?? "").slice(0, 8000), typeDePage: root.pageType ?? "" }, references: refs }),
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
          <div className="atl-tabs2 atl-aidlg__tabs">
            {[
              ["textes", `Textes (${texts.length})`, texts.length > 0],
              ["images", `Images (${images.length})`, images.length > 0],
              ["design", "Design", Boolean(onRebuild)],
            ].map(([id, label, ok]) => (
              <button key={id} type="button" className={tab === id ? "is-on" : ""} disabled={!ok || state?.busy} onClick={() => (setTab(id), setState(null))}>
                {label}
              </button>
            ))}
          </div>
          <p className="atl-aidlg__how">
            {tab === "textes" && "Réécrit les textes choisis — gpt-5.4-mini, immédiat."}
            {tab === "images" && `Refait ${images.length > 1 ? `les ${images.length} images` : "l'image"} — gpt-image-2, ~30 s et quelques cents par image.`}
            {tab === "design" && "Redessine la section (disposition, tailles, espacements) en gardant ses textes et ses images — 30 à 90 s."}
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
          {tab === "design" && (
            <div className="atl-aidlg__design">
              <label className="atl-aibox__ref">
                {designRef ? <img src={designRef} alt="" /> : <span>+ Exemple à imiter (image, facultatif)</span>}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const r = new FileReader();
                    r.onload = () => setDesignRef(r.result);
                    r.readAsDataURL(file);
                  }}
                />
              </label>
              <div className="atl-aibox__row">
                <button type="button" disabled={state?.busy} onClick={() => design("nettoyer")} title="Alignements, espacements et tailles réguliers, sans rien changer d'autre">
                  Nettoyer la mise en page
                </button>
                {onAdapt && (
                  <button type="button" disabled={state?.busy} onClick={() => design("adapter")} title="Palette, polices, espacements et boutons du reste de la page">
                    Adapter au style de la page
                  </button>
                )}
              </div>
            </div>
          )}
          {tab !== "design" && (
            <div className="atl-aidlg__refs" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), addFiles(e.dataTransfer.files))}>
              <span>Photos de référence (facultatif) — l'IA s'en inspire pour les textes et les images : glisse-les ici ou clique sur +</span>
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
          {state?.rebuilt && (
            <span className="atl-topbar__ok">
              Section retravaillée, déjà dans la page (enregistrement automatique).{" "}
              {state.rebuilt?.old && onUndo && (
                <button type="button" className="atl-aidlg__undo" onClick={() => (onUndo(state.rebuilt), setState({ undone: true }))}>
                  ↶ Revenir à avant
                </button>
              )}
            </span>
          )}
          {state?.undone && <span className="atl-topbar__ok">Section d'avant remise en place.</span>}
          <button type="button" onClick={onClose} disabled={state?.busy}>
            Annuler
          </button>
          <button type="button" className="atl-newpage__create" disabled={state?.busy || (tab === "design" && !prompt.trim() && !designRef)} onClick={launch}>
            {state?.busy ? "En cours…" : tab === "design" ? "Redessiner" : tab === "images" ? "Refaire" : "Réécrire"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ---- Enregistrer la section modifiée dans le catalogue (menu en haut à droite) ----
// « Nouvelle section » : copie avec ces textes, images et styles, sous un nom
// choisi. « Remplacer » : la section du catalogue d'où vient celle-ci (elle-même,
// ou l'originale d'une copie figée / d'une section perso) prend ces valeurs ;
// les pages qui l'utilisent sont listées avant de confirmer (elles ne bougent pas).
function catalogueTargetOf(section) {
  if (!section.meta.pageSpecific) return section.id;
  // L'atelier charge toutes les sections du catalogue : une originale absente
  // de l'index est une partie de template (ou supprimée) → rien à remplacer.
  const orig = section.meta.figeeDepuis || section.meta.copieDe;
  return orig && byId[orig] && !byId[orig].meta.pageSpecific ? orig : null;
}

function SaveSectionMenu({ item }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(null); // null | "nouvelle" | "ecraser"
  const [label, setLabel] = useState("");
  const [pages, setPages] = useState(null);
  const [state, setState] = useState(null);
  const [pos, setPos] = useState(null);
  const box = useRef(null);
  const pop = useRef(null);
  const section = byId[item.type];
  useEffect(() => {
    if (!open) return;
    // Menu affiché par-dessus tout (portail) : le panneau de droite le couperait.
    const place = () => {
      const r = box.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener("resize", place);
    const away = (e) => !box.current?.contains(e.target) && !pop.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  if (!section) return null;
  const name = (section.meta.label ?? section.id).replace(/ — .*$/, "");
  const target = catalogueTargetOf(section);
  const targetName = target ? (byId[target]?.meta.label ?? target) : null;

  const toggle = () => {
    setOpen((o) => !o);
    setStep(null);
    setState(null);
  };
  const askNew = () => {
    setLabel(`${name} — perso`);
    setStep("nouvelle");
    setState(null);
  };
  const askReplace = async () => {
    setStep("ecraser");
    setState(null);
    setPages(null);
    try {
      const list = await fetch(`/api/sections/${encodeURIComponent(target)}/pages`).then((r) => (r.ok ? r.json() : []));
      setPages(list);
    } catch {
      setPages([]);
    }
  };
  async function save(mode) {
    if (mode === "nouvelle" && !label.trim()) return;
    setState({ busy: true });
    try {
      const res = await fetch("/api/sections-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: section.id, target: mode === "ecraser" ? target : undefined, mode, props: item.props, label: mode === "nouvelle" ? label.trim() : null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Enregistrement refusé.");
      // Disponible tout de suite dans « Ajouter une section », sans recharger.
      if (mode === "nouvelle") addSections([body.id]).catch(() => {});
      setStep(null);
      setState({ done: mode === "nouvelle" ? `✓ Ajoutée au catalogue : « ${label.trim()} ».` : `✓ « ${targetName} » mise à jour dans le catalogue.` });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  return (
    <div className="atl-savemenu" ref={box}>
      <button
        type="button"
        className={`atl-savemenu__btn${open ? " is-open" : ""}`}
        onClick={toggle}
        title="Enregistrer cette section dans le catalogue"
        aria-label="Enregistrer cette section dans le catalogue"
        aria-expanded={open}
      >
        💾<span aria-hidden="true">▾</span>
      </button>
      {open && pos && createPortal(
        <div className="atl-savemenu__pop" ref={pop} style={{ top: pos.top, right: pos.right }} role="dialog" aria-label="Enregistrer la section">
          <p className="atl-savemenu__title">Enregistrer cette version dans le catalogue</p>
          <p className="atl-savemenu__hint">Textes, images, styles et réglages tels qu'ils sont dans la page.</p>

          {step !== "ecraser" && (
            <div className={`atl-savemenu__opt${step === "nouvelle" ? " is-on" : ""}`}>
              {step === "nouvelle" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("nouvelle");
                  }}
                >
                  <label>
                    <span>Nom de la nouvelle section</span>
                    <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} />
                  </label>
                  <div className="atl-savemenu__row">
                    <button type="button" onClick={() => setStep(null)} disabled={state?.busy}>
                      Retour
                    </button>
                    <button type="submit" className="is-primary" disabled={state?.busy || !label.trim()}>
                      {state?.busy ? "Enregistrement…" : "Enregistrer"}
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" className="atl-savemenu__choice" onClick={askNew}>
                  <b>Nouvelle section</b>
                  <small>Une copie sous un nouveau nom ; l'originale ne change pas.</small>
                </button>
              )}
            </div>
          )}

          {step !== "nouvelle" && (
            <div className={`atl-savemenu__opt${step === "ecraser" ? " is-on" : ""}`}>
              {step === "ecraser" ? (
                <>
                  <p>
                    <b>Remplacer « {targetName} »</b> du catalogue par cette version ?
                  </p>
                  {pages === null ? (
                    <small>Recherche des pages qui l'utilisent…</small>
                  ) : pages.length ? (
                    <>
                      <small>
                        {pages.length} page{pages.length > 1 ? "s l'utilisent" : " l'utilise"} — elle{pages.length > 1 ? "s" : ""} ne change{pages.length > 1 ? "nt" : ""} pas ; seuls les prochains ajouts prendront cette version :
                      </small>
                      <ul className="atl-savemenu__pages">
                        {pages.map((p) => (
                          <li key={p.name}>
                            {p.title || p.name}
                            {p.name === pageName && <em> (cette page)</em>}
                            {p.projet && <small> · {p.projet}</small>}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <small>Aucune page ne l'utilise encore. Les prochains ajouts prendront cette version.</small>
                  )}
                  <div className="atl-savemenu__row">
                    <button type="button" onClick={() => setStep(null)} disabled={state?.busy}>
                      Retour
                    </button>
                    <button type="button" className="is-danger" disabled={state?.busy || pages === null} onClick={() => save("ecraser")}>
                      {state?.busy ? "Enregistrement…" : "Remplacer"}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="atl-savemenu__choice"
                  disabled={!target}
                  onClick={askReplace}
                  title={target ? "" : "Section propre à cette page : pas d'original dans le catalogue"}
                >
                  <b>Remplacer l'originale{target && target !== section.id ? ` (${targetName})` : ""}</b>
                  <small>{target ? "La section du catalogue prend cette version." : "Section propre à cette page (venue d'un template) : pas d'originale dans le catalogue. Enregistre-la comme nouvelle section."}</small>
                </button>
              )}
            </div>
          )}

          {state?.done && <p className="atl-topbar__ok">{state.done}</p>}
          {state?.error && <p className="atl-topbar__error">{state.error}</p>}
        </div>,
        document.body,
      )}
    </div>
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
function CopySectionSettings({ item, onBack, onChange, onAiTexts, onAiDesign, onValues, onOpen, onMoveNode, onDelete }) {
  const [tab, setTab] = useState("design");
  const section = byId[item.type];
  const props = normalizeProps(section, item.props);
  const [name, variant] = (section.meta.label ?? section.id).split(" — ");
  const set = (k, v) => onChange({ ...props, [k]: v });
  const root = canvasFrame()?.contentDocument.querySelector(`[data-atl-id="${CSS.escape(item.props.id)}"] [class^="atl-"]`);
  const cs = root ? root.ownerDocument.defaultView.getComputedStyle(root) : null;
  const roles = editableSettings(section.schema.settings).filter((s) => s.id.startsWith("role_"));
  return (
    <div className="atl-insp__panel">
      <PanelHead onBack={onBack} title={name} sub={familyOf(section).label} onDelete={onDelete} saveItem={item} />
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
      {tab === "design" && <CarrouselPanel section={section} props={props} el={root?.closest("[data-atl-id]")} onChange={onChange} onAiDesign={onAiDesign} />}
      {tab === "design" && (
        <div className="atl-style">
          {/* Le fond se règle plus bas (« Fond de la section » : couleurs du
              style, autre couleur, dégradé, image). Un ancien réglage reste
              visible ici pour pouvoir le retirer. */}
          {props.fond_section && (
            <div className="atl-style__row">
              <span>Ancien fond</span>
              <span className="atl-style__color">
                <code>{props.fond_section}</code>
                <button type="button" onClick={() => set("fond_section", "")} title="Retirer">
                  ↺
                </button>
              </span>
            </div>
          )}
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

      <button type="button" className="atl-aibtn-wide" onClick={onAiTexts}>
        ✨ Retravailler avec l'IA…
        <small>Textes, images ou design de la section</small>
      </button>
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

function CanvasToolbar({ sel, node, label, onParent, onUp, onDown, onAi, onEdit, onHide, editing, onFormat, onMoveSection, onAddSection }) {
  const [pos, setPos] = useState(null);
  const barRef = useRef(null);
  useEffect(() => {
    let raf;
    const tick = () => {
      const frame = canvasFrame();
      const el = node ? domOf(sel.sectionId, node) : frame?.contentDocument.querySelector(`[data-atl-id="${CSS.escape(sel.sectionId)}"]`);
      if (frame && el) {
        const fr = frame.getBoundingClientRect();
        const scale = fr.width / frame.offsetWidth || 1;
        const r = el.getBoundingClientRect();
        const bw = (barRef.current?.offsetWidth ?? 320) + 16;
        const top = fr.top + r.top * scale;
        const visible = top > fr.top - 10 && top < fr.bottom;
        // Ancrée en haut à droite de la section, toujours dans le canvas.
        // Panneau de droite visible en édition : la barre ne doit pas passer dessous.
        const sb = document.querySelector('[class*="Sidebar--right"]');
        const sbLeft = sb && document.documentElement.hasAttribute("data-atl-edit") ? sb.getBoundingClientRect().left : fr.right;
        const next = visible
          ? {
              top: Math.round(Math.min(fr.bottom - 48, Math.max(fr.top + 8, top - 44))),
              left: Math.round(Math.min(Math.min(fr.right, sbLeft) - bw, Math.max(fr.left + 8, fr.left + (r.left + r.width) * scale - bw))),
            }
          : null;
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
  // Le zoom CSS dilate aussi les coordonnées inline : on divise par la
  // compensation de zoom pour rester ancrée à la section (voir App.jsx).
  const uiZoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--atl-ui-zoom")) || 1;
  return createPortal(
    <div ref={barRef} className="atl-float" style={{ top: pos.top / uiZoom, left: pos.left / uiZoom }} onMouseDown={(e) => e.preventDefault()}>
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
          <button type="button" className="atl-float__add" onClick={onAddSection} title="Ajouter une section après celle-ci">
            ＋ Section
          </button>
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
// ---- Fiche « Ma marque et mon produit » (⚙ Réglages de la page) ----
// Remplie une fois, reprise par tous les outils IA : réécrire la page,
// retravailler une section, Studio d'images (photos du produit, logo).
// Page d'un projet (2026-11-13, « Réglages » allégés) : produit, client visé
// et ce qu'on sait du produit viennent du projet (Fondations, Angles) et ne
// se saisissent plus ici ; seules les photos du produit et le logo restent.
// Texte « ce que tu sais du produit » tiré du projet, sans les notes
// [MANQUE] / [À VALIDER] (garde-fou : aucune preuve non validée).
export function infosFromProject(p) {
  const r = p?.fondations?.reponses ?? {};
  const clean = (v) =>
    String(Array.isArray(v) ? v.join(", ") : v ?? "")
      .split("\n")
      .filter((l) => !/\[(MANQUE|À VALIDER)/.test(l))
      .join("\n")
      .trim();
  return [p?.description && clean(p.description), r.role && `Bénéfices : ${clean(r.role)}`, r.ingredients && `Composition : ${clean(r.ingredients)}`, r.usage && `Utilisation : ${clean(r.usage)}`]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);
}

// À l'ouverture d'une page de projet : remplit les champs que lisent les
// outils ✨ IA et le Studio (infos, produit, logo) depuis le projet. « infos »
// n'est réécrit que s'il est vide ou déjà rempli automatiquement (infosAuto).
// Le client visé (profil) n'est jamais touché : c'est celui de l'angle.
export function ProjectBrandSync() {
  const getPuck = useGetPuck();
  useEffect(() => {
    const root = getPuck().appState.data.root?.props ?? {};
    if (!root.projet) return;
    fetch(`/api/projects/${encodeURIComponent(root.projet)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!p) return;
        const cur = getPuck().appState.data.root?.props ?? {};
        const patch = {};
        const infos = infosFromProject(p);
        if (infos && (!cur.infos || cur.infosAuto) && cur.infos !== infos) Object.assign(patch, { infos, infosAuto: true });
        if (p.produit && !cur.produit) patch.produit = p.produit;
        const logo = p.marque?.logos?.[0];
        if (logo && !cur.logo) patch.logo = logo;
        if (!Object.keys(patch).length) return;
        const { appState, dispatch } = getPuck();
        dispatch({ type: "replaceRoot", root: { ...appState.data.root, props: { ...appState.data.root.props, ...patch } } });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function BrandSheet({ root, onChange }) {
  const [busy, setBusy] = useState(false);
  const photos = Array.isArray(root.photos_produit) ? root.photos_produit : [];
  async function add(files, field) {
    setBusy(true);
    try {
      const urls = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const dataUrl = await new Promise((ok) => {
          const r = new FileReader();
          r.onload = () => ok(r.result);
          r.readAsDataURL(file);
        });
        const res = await fetch(`/api/medias/${pageName}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, dataUrl }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        urls.push(body.url);
      }
      if (field === "logo") onChange({ logo: urls[0] ?? root.logo ?? "" });
      else onChange({ photos_produit: [...photos, ...urls].slice(0, 8) });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }
  const text = (key, label, ph, rows) => (
    <label className="atl-brand__field">
      <span>{label}</span>
      {rows ? (
        <textarea rows={rows} value={root[key] ?? ""} placeholder={ph} onChange={(e) => onChange({ [key]: e.target.value })} />
      ) : (
        <input value={root[key] ?? ""} placeholder={ph} onChange={(e) => onChange({ [key]: e.target.value })} />
      )}
    </label>
  );
  const fromProject = Boolean(root.projet);
  return (
    <div className="atl-brand">
      <p className="atl-brand__title">{fromProject ? "Marque et produit · du projet" : "Ma marque et mon produit"}</p>
      {fromProject ? (
        <>
          <p className="atl-brand__hint">Se modifient dans le projet (Fondations, Angles, Marque & design). Tous les outils ✨ IA s'en servent.</p>
          <dl className="atl-brand__ro">
            <dt>Produit</dt>
            <dd>{root.produit || "—"}</dd>
            <dt>Client visé</dt>
            <dd>
              {root.profil || "—"} <small>(celui de l'angle de cette page)</small>
            </dd>
            <dt>Ce que tu sais du produit</dt>
            <dd className="is-long">{root.infos ? (root.infos.length > 360 ? `${root.infos.slice(0, 360)}…` : root.infos) : "Remplis les Fondations du projet."}</dd>
          </dl>
          <a className="atl-brand__link" href={`/catalogue.html#projet-${root.projet}`}>
            Modifier dans le projet →
          </a>
        </>
      ) : (
        <>
          <p className="atl-brand__hint">Rempli une fois : tous les outils ✨ IA s'en servent.</p>
          {text("marque", "Marque", "ex. Clearflow")}
          {text("produit", "Produit", "ex. Crème au collagène")}
          {text("profil", "Client visé", "ex. Femmes de 35-50 ans, peau sèche")}
          {text("infos", "Ce que tu sais du produit", "Page fournisseur, bénéfices, ingrédients, prix, garanties…", 5)}
        </>
      )}
      <div className="atl-brand__field">
        <span>Photos du produit {busy && "· envoi…"}</span>
        <div className="atl-brand__imgs">
          {photos.map((u) => (
            <button key={u} type="button" title="Retirer" onClick={() => onChange({ photos_produit: photos.filter((x) => x !== u) })}>
              <img src={u} alt="" />
            </button>
          ))}
          <label className="atl-brand__add" title="Ajouter des photos">
            +
            <input type="file" accept="image/*" multiple hidden onChange={(e) => add([...e.target.files], "photos")} />
          </label>
        </div>
      </div>
      <div className="atl-brand__field">
        <span>Logo</span>
        <div className="atl-brand__imgs">
          {root.logo && (
            <button type="button" title="Retirer" onClick={() => onChange({ logo: "" })}>
              <img src={root.logo} alt="" />
            </button>
          )}
          {!root.logo && (
            <label className="atl-brand__add" title="Ajouter le logo">
              +
              <input type="file" accept="image/*" hidden onChange={(e) => add([...e.target.files], "logo")} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Outils IA de toute la page (menu ✨ IA du rail de gauche) ----
// Propositions IA avant application (audit « Ensuite », 2026-11-17) : les
// outils de page (Réécrire, Décliner, Remplir depuis les Fondations, Traduire)
// ne touchent plus la page ; leurs textes s'ajoutent ici, section par section,
// avant → après. On coche ce qu'on garde, puis « Appliquer » (une étape,
// Ctrl+Z). Une erreur en cours de route ne laisse plus une page à moitié
// réécrite : rien n'est écrit sans validation.
const shorten = (t, n = 90) => (t.length > n ? `${t.slice(0, n)}…` : t);
function ProposalReview({ content, proposals, onApply, onReject }) {
  const [off, setOff] = useState(() => new Set());
  const [open, setOpen] = useState(null);
  const rows = Object.keys(proposals)
    .map((id) => {
      const item = content.find((c) => c.props.id === id);
      if (!item) return null;
      const old = Object.fromEntries(aiTargets(item).texts.map((t) => [t.id, t.text]));
      const changes = Object.entries(proposals[id])
        .filter(([k, v]) => v?.text != null && plain(v.text) !== plain(old[k] ?? ""))
        .map(([k, v]) => ({ k, avant: plain(old[k] ?? ""), apres: plain(v.text) }));
      return { id, index: content.indexOf(item), name: (byId[item.type]?.meta?.label ?? item.type).split(" — ")[0], changes };
    })
    .filter((r) => r && r.changes.length)
    .sort((a, b) => a.index - b.index);
  if (!rows.length) return null;
  const chosen = rows.filter((r) => !off.has(r.id));
  const toggle = (id) => setOff((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <div className="atl-prop">
      <p className="atl-prop__title">
        Propositions : {rows.length} section(s), {rows.reduce((n, r) => n + r.changes.length, 0)} texte(s) · <b>rien n'est encore dans la page</b>
      </p>
      <div className="atl-prop__bar">
        <button type="button" onClick={() => setOff(new Set())}>
          Tout cocher
        </button>
        <button type="button" onClick={() => setOff(new Set(rows.map((r) => r.id)))}>
          Tout décocher
        </button>
      </div>
      <ul className="atl-prop__list">
        {rows.map((r) => (
          <li key={r.id} className={off.has(r.id) ? "is-off" : ""}>
            <div className="atl-prop__head">
              <label>
                <input type="checkbox" checked={!off.has(r.id)} onChange={() => toggle(r.id)} />
                <b>
                  {r.index + 1}. {r.name}
                </b>
                <small>{r.changes.length} texte(s)</small>
              </label>
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {open === r.id ? "Masquer" : "Voir tout"}
              </button>
              <button type="button" onClick={() => scrollCanvasTo(r.id)} title="Voir la section dans la page">
                ↗
              </button>
            </div>
            {(open === r.id ? r.changes : r.changes.slice(0, 1)).map((c) => (
              <div key={c.k} className="atl-prop__diff">
                <del>{open === r.id ? c.avant || "(vide)" : shorten(c.avant || "(vide)")}</del>
                <ins>{open === r.id ? c.apres : shorten(c.apres)}</ins>
              </div>
            ))}
          </li>
        ))}
      </ul>
      <div className="atl-prop__actions">
        <button type="button" className="atl-aibox__go" disabled={!chosen.length} onClick={() => onApply(Object.fromEntries(chosen.map((r) => [r.id, proposals[r.id]])))}>
          Appliquer {chosen.length} section(s)
        </button>
        <button type="button" className="atl-prop__reject" onClick={onReject}>
          Tout rejeter
        </button>
      </div>
    </div>
  );
}

function PageAiDialog({ tool, content, root, onApplyMany, onRoot, onAdaptAll, onUndoAll, onClose: close }) {
  const [state, setState] = useState(null);
  const [proposals, setProposals] = useState({});
  const [applied, setApplied] = useState(null);
  const onApply = (id, values) => setProposals((p) => ({ ...p, [id]: { ...(p[id] ?? {}), ...values } }));
  const pending = Object.keys(proposals).length;
  const onClose = () => {
    if (pending && !confirm("Fermer sans appliquer les propositions ? Elles seront perdues.")) return;
    close();
  };
  const titles = { reecrire: "✍️ Réécrire pour mon produit", traduire: "🌐 Traduire la page", adapter: "🎨 Adapter toute la page à son style", auditer: "🔍 Auditer la page", decliner: "🎯 Décliner pour cet angle", fondations: "📐 Remplir depuis les Fondations" };
  return createPortal(
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && !state?.busy && onClose()}>
      <div className="atl-modal__panel atl-aidlg">
        <header className="atl-modal__head">
          <h2>{titles[tool] ?? "✨ IA"}</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="atl-aidlg__body">
          {tool === "reecrire" && <RewritePage content={content} root={root} onApply={onApply} onRoot={onRoot} />}
          {tool === "decliner" && <DeclinePage content={content} root={root} onApply={onApply} />}
          {tool === "fondations" && <FillFromFoundations content={content} root={root} onApply={onApply} />}
          {tool === "auditer" && <AuditPage content={content} root={root} onClose={onClose} />}
          {tool === "traduire" && <TranslatePage content={content} root={root} onApply={onApply} onLangue={(code) => onRoot({ langue: code })} />}
          {pending > 0 && (
            <ProposalReview
              content={content}
              proposals={proposals}
              onApply={(map) => {
                onApplyMany(map);
                setApplied(Object.keys(map).length);
                setProposals((p) => Object.fromEntries(Object.entries(p).filter(([id]) => !map[id])));
              }}
              onReject={() => (setProposals({}), setApplied(null))}
            />
          )}
          {applied != null && <p className="atl-topbar__ok">✓ {applied} section(s) appliquée(s) dans la page. Ctrl+Z pour annuler.</p>}
          {tool === "adapter" && (
            <div className="atl-aibox">
              <p className="atl-aibox__hint">
                Chaque section ({content.length}) est redessinée avec la palette, les polices, les espacements et les boutons de la page, en gardant ses textes et ses images. Utile quand la page mélange des sections venues de templates différents. Compte 30 à 90 s par section ; une copie de sécurité est faite avant (Historique).
              </p>
              <button
                type="button"
                className="atl-aibox__go"
                disabled={state?.busy}
                onClick={async () => {
                  if (!confirm(`Redessiner les ${content.length} sections de la page ?`)) return;
                  setState({ busy: true, step: "" });
                  try {
                    const replacements = await onAdaptAll((step) => setState({ busy: true, step }));
                    setState({ adapted: replacements });
                  } catch (e) {
                    setState({ error: e.message });
                  }
                }}
              >
                {state?.busy ? "Adaptation en cours…" : "Adapter toute la page"}
              </button>
              {state?.busy && <p className="atl-aidlg__step">{state.step}</p>}
              {state?.error && <p className="atl-topbar__error">{state.error}</p>}
              {state?.adapted && (
                <p className="atl-topbar__ok">
                  Page adaptée, sans rechargement (enregistrement automatique).{" "}
                  {onUndoAll && (
                    <button type="button" className="atl-aidlg__undo" onClick={() => (onUndoAll(state.adapted), setState({ undone: true }))}>
                      ↶ Revenir à avant
                    </button>
                  )}
                </p>
              )}
              {state?.undone && <p className="atl-topbar__ok">Sections d'avant remises en place.</p>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---- Auditer la page : grille du skill (Score de vente local + IA) ----
function AuditPage({ content, root, onClose }) {
  const getPuck = useGetPuck();
  const [state, setState] = useState(null);
  async function run() {
    setState({ busy: true });
    try {
      const data = getPuck().appState.data;
      const score = scorePage(data, byId);
      // Page d'un projet : l'audit juge aussi la fidélité aux Fondations
      // (2026-11-10) ; il lui faut alors plus de texte par section.
      const project = root.projet
        ? await fetch(`/api/projects/${encodeURIComponent(root.projet)}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : null;
      const fondations = project?.fondations?.message?.promesse ? fondationsPourAudit(project, root.pageType ?? "") : null;
      // Le contrôle local (chiffres absents des Fondations) est donné à l'IA :
      // elle ne peut pas passer à côté d'un prix ou d'un nombre d'avis resté
      // du site d'origine.
      if (fondations) fondations.chiffresHorsFondations = localFidelity(data, byId, project).chiffres.slice(0, 30).map((c) => ({ valeur: c.valeur, extrait: c.extrait, sectionId: c.sectionId }));
      const sectionsOut = data.content.map((item) => {
        const section = byId[item.type];
        const texts = aiTargets(item).texts.map((t) => ({ role: t.role ?? "", text: plain(t.text).slice(0, fondations ? 260 : 160) })).filter((t) => t.text);
        const important = [...texts.filter((t) => /Titre|Bouton/.test(t.role)), ...texts.filter((t) => !/Titre|Bouton/.test(t.role))].slice(0, fondations ? 24 : 10);
        return { id: item.props.id, famille: section?.meta.family ?? "", nom: (section?.meta.label ?? item.type).split(" — ")[0], textes: important };
      });
      const page = {
        type: root.pageType ?? "",
        fiche: { marque: root.marque ?? "", produit: root.produit ?? "", profil: root.profil ?? "", infos: String(root.infos ?? "").slice(0, 3000), pageAchat: root.pageAchat ?? "" },
        score: score.type
          ? {
              note: score.score,
              sectionsManquantes: score.missing.map((m) => ({ section: m.rule.families?.join(" ou ") ?? m.rule.label, ou: m.where, pourquoi: m.rule.why })),
              croyances: score.beliefs.map((b) => ({ n: b.n, croyance: b.label, installee: b.ok })),
              textesAReprendre: score.texts.map((t) => ({ texte: t.text, section: t.name, probleme: t.fix })),
            }
          : null,
        sections: sectionsOut,
        ...(fondations ? { fondations } : {}),
      };
      const res = await fetch("/api/ia/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setState({ result: body });
    } catch (e) {
      setState({ error: e.message });
    }
  }
  const go = (sectionId) => {
    if (!sectionId) return;
    const index = getPuck().appState.data.content.findIndex((c) => c.props.id === sectionId);
    if (index < 0) return;
    getPuck().dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
    onClose();
    setTimeout(() => scrollCanvasTo(sectionId), 100);
  };
  const r = state?.result;
  return (
    <div className="atl-audit">
      {!r && (
        <div className="atl-aibox">
          <p className="atl-aibox__hint">
            L'IA passe la page à la grille de la méthode (5 croyances, règle des 5 secondes, confiance, circulation, bloc d'achat), vérifie
            sa fidélité aux Fondations du projet (promesse, mécanisme, preuves, objections, offre, affirmations sans preuve) et liste
            les gains rapides, les changements à fort impact et des titres et boutons prêts à coller. Environ 30 s, un appel OpenAI.
          </p>
          <button type="button" className="atl-aibox__go" disabled={state?.busy} onClick={run}>
            {state?.busy ? "Audit en cours…" : "Auditer la page"}
          </button>
          {state?.error && <p className="atl-topbar__error">{state.error}</p>}
        </div>
      )}
      {r && (
        <>
          <p className="atl-audit__verdict">{r.verdict}</p>
          {r.fondations && (
            <>
              <h4>Fidélité aux Fondations{r.fondations.note != null ? ` · ${r.fondations.note} / 100` : ""}</h4>
              <ul className="atl-audit__list">
                {(r.fondations.points ?? []).map((p, i) => (
                  <li key={i}>
                    <b className={`atl-audit__state is-${p.etat === "ok" ? "ok" : p.etat === "absente" || p.etat === "ecart" ? "absente" : "faible"}`}>{p.etat === "ok" ? "✓" : "!"}</b> <b>{p.critere} :</b> {p.comment}{" "}
                    {p.ou && <small>{p.ou}</small>}
                    {p.sectionId && content.some((c) => c.props.id === p.sectionId) && (
                      <button type="button" className="atl-linkbtn" onClick={() => go(p.sectionId)}>
                        voir
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {r.fondations.nonAutorise?.length > 0 && (
                <>
                  <h4>Affirmations sans preuve dans les Fondations</h4>
                  <ul className="atl-audit__list">
                    {r.fondations.nonAutorise.map((n, i) => (
                      <li key={i}>
                        « {n.texte} » <small>{n.pourquoi}</small>
                        {n.sectionId && content.some((c) => c.props.id === n.sectionId) && (
                          <button type="button" className="atl-linkbtn" onClick={() => go(n.sectionId)}>
                            voir
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          {r.croyances?.length > 0 && (
            <>
              <h4>Les 5 croyances</h4>
              <ul className="atl-audit__list">
                {r.croyances.map((c) => (
                  <li key={c.n}>
                    <b className={`atl-audit__state is-${c.etat}`}>{c.n}</b> {c.comment}
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.gainsRapides?.length > 0 && (
            <>
              <h4>Gains rapides</h4>
              <ul className="atl-audit__list">
                {r.gainsRapides.map((g, i) => (
                  <li key={i}>
                    {g.quoi} <small>{g.ou}</small>
                    {g.sectionId && content.some((c) => c.props.id === g.sectionId) && (
                      <button type="button" className="atl-linkbtn" onClick={() => go(g.sectionId)}>
                        voir
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.fortImpact?.length > 0 && (
            <>
              <h4>Changements à fort impact</h4>
              <ul className="atl-audit__list">
                {r.fortImpact.map((g, i) => (
                  <li key={i}>
                    <b>{g.quoi}</b> <small>{g.pourquoi} — {g.ou}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
          {[
            ["Titres à essayer", r.titres],
            ["Boutons à essayer", r.boutons],
            ["Tests A/B", r.tests],
          ].map(([title, list]) =>
            list?.length ? (
              <div key={title}>
                <h4>{title}</h4>
                <ul className="atl-audit__list">
                  {list.map((t, i) => (
                    <li key={i}>
                      {t}
                      {title !== "Tests A/B" && (
                        <button type="button" className="atl-linkbtn" onClick={() => navigator.clipboard?.writeText(t)} title="Copier">
                          copier
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          <button type="button" className="atl-aibox__go" onClick={run} disabled={state?.busy}>
            {state?.busy ? "Audit en cours…" : "Refaire l'audit"}
          </button>
        </>
      )}
    </div>
  );
}

function RewritePage({ content, root, onApply, onRoot }) {
  const [form, setForm] = useState({ marque: root.marque ?? "", infos: root.infos ?? "" });
  const [state, setState] = useState(null);
  async function run() {
    if (!form.infos.trim() && !root.produit) return setState({ error: "Colle d'abord ce que tu sais du produit." });
    const jobs = content.map((item) => ({ id: item.props.id, texts: byId[item.type] ? aiTargets(item).texts : [] })).filter((j) => j.texts.length);
    const total = jobs.reduce((n, j) => n + j.texts.length, 0);
    if (!total) return setState({ error: "Aucun texte à réécrire." });
    if (!confirm(`Réécrire les ${total} textes de la page pour ${form.marque || root.produit || "ton produit"} ?`)) return;
    // Ce qui est tapé ici complète la fiche « Ma marque et mon produit ».
    if (form.marque !== (root.marque ?? "") || form.infos !== (root.infos ?? "")) onRoot?.({ marque: form.marque, infos: form.infos });
    // Listicle ou page d'accueil d'un projet (une seule page pour tous les
    // angles, 2026-11-09) : les angles cochés dans le projet vont dans le
    // contexte ; dans un listicle, chaque raison porte un angle.
    let anglesCtx = null;
    let anglesPrompt = "";
    if (root.projet && (root.pageType === "listicle" || root.pageType === "accueil")) {
      const project = await fetch(`/api/projects/${encodeURIComponent(root.projet)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const chosen = (project?.angles ?? []).filter((a) => a.choisi);
      if (chosen.length) {
        anglesCtx = chosen.map((a, i) => ({ rang: i + 1, angle: a.titre ?? "", avatar: a.avatar ?? "", douleur: a.douleur ?? "", promesse: a.promesse ?? "" }));
        anglesPrompt =
          root.pageType === "listicle"
            ? " Cette page est un listicle qui sert TOUS les angles du contexte : chaque raison numérotée porte un angle, dans l'ordre (raison 1 = angle de rang 1, raison 2 = rang 2…), en parlant à son avatar, de sa douleur et en menant vers sa promesse. Repère le numéro de la raison dans le texte ou dans son titre. S'il y a plus de raisons que d'angles, les raisons en plus parlent du mécanisme, de l'offre ou de la garantie. Le titre principal et l'introduction restent généraux (ils annoncent les raisons pour tous)."
            : " Cette page d'accueil sert TOUS les angles du contexte : le titre et l'ouverture portent le message central du produit ; les angles apparaissent comme les profils que le produit aide (blocs « Pour qui », bénéfices, avis), sans en privilégier un.";
      }
    }
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
                "Réécris chaque texte pour MON produit et MA marque (voir contexte), en gardant le rôle du texte dans la page (titre, accroche, liste, avis, bouton…), sa longueur et ses balises de mise en forme. Remplace tout nom de marque, de produit, prix ou chiffre de la page d'origine par les miens ; si une information manque, reste général plutôt que d'inventer." + anglesPrompt + " " + consigneLangue(root),
              contexte: { marque: form.marque || "", produit: root.produit ?? "", profilClient: anglesCtx ? "tous les angles" : root.profil ?? "", infosProduit: form.infos.slice(0, 8000), typeDePage: root.pageType ?? "", ...(anglesCtx ? { angles: anglesCtx } : {}) },
            }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          onApply(job.id, Object.fromEntries(body.items.map((x) => [x.id, { text: x.text }])));
          done += batch.length;
        }
      }
      setState({ done: `${done} textes réécrits. Vérifie les propositions ci-dessous, puis applique celles que tu gardes.` });
    } catch (e) {
      setState({ error: `${e.message} (${done} / ${total} déjà réécrits)` });
    }
  }
  return (
    <div className="atl-aibox">
      <p className="atl-aibox__title">✍️ Réécrire pour mon produit</p>
      <p className="atl-aibox__hint">Tous les textes de la page, consignes entre crochets comprises, réécrits pour ta marque et ton produit, chacun à sa longueur. Repris de la fiche « Ma marque et mon produit » (⚙ Réglages de la page).</p>
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

// ---- Remplir depuis les Fondations (2026-11-10) ----
// Chaque section de la page reçoit le contenu validé dans les Fondations du
// projet pour ce type de page (fondations.contenus, partie 9). Le lien se fait
// par la famille de la section (la même détection que le Page Score). On coche
// les sections à remplir : une seule, quelques-unes ou toute la page. Sur une
// page d'angle, les zones d'angle reçoivent aussi la carte de l'angle.
// Une information marquée « [MANQUE …] » ou « [À VALIDER …] » dans les
// Fondations n'est pas utilisable : la ligne (ou le morceau séparé par « · »)
// qui porte la marque n'est pas envoyé à l'IA. Retirer seulement la marque
// ferait passer un chiffre non validé pour un fait (essai du 2026-11-10 :
// « 4,9/5 sur 115 avis [À VALIDER] » écrit comme une vraie note).
const NOTE_FD = /\[\s*(MANQUE|À VALIDER|A VALIDER)/i;
// Une ligne faite seulement d'une marque « [À VALIDER …] » porte sur tout le
// champ (ex. « vérifier que ces avis portent bien sur ce produit ») : le champ
// entier attend alors la validation de l'utilisateur.
const CHAMP_A_VALIDER = /(^|\n)\s*\[\s*(À VALIDER|A VALIDER)[^\]]*\]\s*(\n|$)/i;
const sansNotes = (v) =>
  CHAMP_A_VALIDER.test(String(v ?? "")) ? "" :
  String(v ?? "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(" · ")
        .filter((part) => !NOTE_FD.test(part))
        .join(" · ")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");

function FillFromFoundations({ content, root, onApply }) {
  const [info, setInfo] = useState(null);
  const [picked, setPicked] = useState(null);
  const [state, setState] = useState(null);
  useEffect(() => {
    pageRole(pageName, root)
      .then(setInfo)
      .catch((e) => setInfo({ error: e.message }));
  }, [root.projet]);
  const type = root.pageType ?? "";
  const fd = info?.project?.fondations ?? {};
  const rows = content.map((item, i) => {
    const label = byId[item.type]?.meta?.label ?? byId[item.type]?.schema?.name ?? item.type;
    // En-tête et pied de page : jamais remplis (dans une copie de page, leurs
    // liens de menu ressemblent à des titres de sections et trompent la détection).
    const nav = ["entete", "pied-de-page"].includes(byId[item.type]?.meta?.family) || /^(header|footer|en-?t[êe]te|pied de page|menu)/i.test(label);
    const all = info?.project && !nav ? briefFor(type, familiesOf(item, i, byId), fd.contenus) : [];
    // Règles dures (2026-11-10, après un essai où l'IA a réécrit de faux avis) :
    // 1. les avis clients ne sont jamais écrits par l'IA (à placer à la main) ;
    // 2. un contenu encore marqué [À VALIDER] ou [MANQUE] n'est pas envoyé.
    const briefs = all
      .filter((b) => b.key !== "temoignages")
      .map((b) => ({ ...b, champs: b.champs.map((c) => ({ ...c, valeur: sansNotes(c.valeur) })).filter((c) => c.valeur) }))
      .filter((b) => b.champs.length);
    const pourquoi = briefs.length ? "" : !all.length ? "" : all.every((b) => b.key === "temoignages") ? "avis clients : à placer à la main, jamais écrits par l'IA" : "contenu encore marqué [À VALIDER] ou [MANQUE] dans les Fondations";
    const texts = byId[item.type] ? aiTargets(item).texts : [];
    return { id: item.props.id, item, label, nav, briefs, pourquoi, texts };
  });
  // Nombres connus du projet : tout chiffre « qui engage » écrit par l'IA et
  // absent de cette liste est remplacé par une consigne entre crochets.
  const known = info?.project ? knownNumbers(info.project, root) : new Set();
  const ready = rows.filter((r) => r.briefs.length && r.texts.length);
  const chosen = picked ?? new Set(ready.map((r) => r.id));
  const toggle = (id) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const message = fd.message ?? {};
  const angle = info?.angle ?? null;

  async function run() {
    const jobs = ready.filter((r) => chosen.has(r.id));
    const total = jobs.reduce((n, j) => n + j.texts.length, 0);
    if (!total) return setState({ error: "Coche au moins une section." });
    if (!confirm(`Remplir ${jobs.length} section(s) (${total} textes) avec le contenu des Fondations ? Les textes actuels de ces sections seront remplacés (Ctrl+Z pour annuler).`)) return;
    let done = 0;
    let guarded = 0;
    try {
      for (const job of jobs) {
        const enAngle = angle && isAngleZone(job.item);
        const contexte = {
          marque: root.marque ?? "",
          produit: root.produit ?? "",
          typeDePage: root.pageType ?? "",
          section: job.briefs.map((b) => ({ section: b.label, role: b.why, contenu: Object.fromEntries(b.champs.map((c) => [c.label, c.valeur])) })),
          messageCentral: {
            promesse: message.promesse ?? "",
            mecanisme: message.mecanisme ?? "",
            preuves: (message.preuves ?? []).filter(Boolean),
            objections: (message.objections ?? []).filter((o) => o?.objection),
          },
          ...(enAngle ? { angle: { titre: angle.titre, avatar: angle.avatar, douleur: angle.douleur, promesse: angle.promesse } } : {}),
        };
        for (let i = 0; i < job.texts.length; i += 40) {
          const batch = job.texts.slice(i, i + 40);
          setState({ busy: true, step: `${done} / ${total} textes écrits…` });
          const res = await fetch("/api/ia/textes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: batch,
              prompt:
                "Écris chaque texte de cette section à partir du BRIEF du contexte (« section » → « contenu ») : c'est le contenu validé dans les Fondations du projet pour cette section de la page. Répartis ce contenu dans les textes selon leur rôle (titre, sous-titre, liste, avis, bouton…), en gardant la longueur de chaque texte et ses balises de mise en forme. N'ajoute aucune information, aucun chiffre, aucune preuve ni aucun avis absent du brief ou du message central. Un passage du brief entre crochets (« [MANQUE … ] », « [À VALIDER … ] ») n'est pas une information : ne le recopie pas et n'invente rien à la place ; à cet endroit, reste général. Ne recopie pas les notes destinées à l'équipe (« coché d'avance », « en petit dessous », « ne pas écrire… »). Garde les signes † et * des allégations. La page d'origine vend UN AUTRE produit, d'une autre marque : n'en garde aucun nom de marque ou de produit, aucun prix, aucune monnaie, aucun chiffre, aucun avis, aucun ingrédient, aucun animal ni aucune promesse. Avis clients : recopie chaque avis du brief mot pour mot, avec son auteur, un avis par emplacement ; ne mélange pas deux avis, ne les complète pas, n'en crée pas ; n'écris ni « achat vérifié », ni note moyenne, ni nombre d'avis, ni répartition par étoiles si le brief ne les donne pas. S'il y a moins de contenu que de textes : un texte en trop qui est un simple libellé (« Quantité », « Voir plus », un intertitre neutre) est adapté au produit ; un texte en trop qui portait une information de la page d'origine (nom, prix, chiffre, avis, promesse, caractéristique) devient une consigne courte entre crochets qui dit quoi écrire, par exemple « [Avis client à ajouter] », « [Prix à compléter] », « [Bénéfice à compléter] ». Mieux vaut une consigne entre crochets qu'une information non prouvée." +
                (enAngle ? " Cette section est une zone d'angle : parle à l'avatar de l'angle du contexte, de sa douleur, vers sa promesse, sans contredire le brief." : "") +
                " " +
                consigneLangue(root),
              contexte,
            }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          // Garde-fou : un chiffre qui engage (prix, %, durée, nombre d'avis…)
          // absent du projet ne passe pas, quoi qu'ait écrit l'IA.
          const safe = body.items.map((x) => {
            if (!hasUnknownFigure(x.text, known)) return x;
            guarded++;
            return { ...x, text: "[À compléter : chiffre absent des Fondations]" };
          });
          onApply(job.id, Object.fromEntries(safe.map((x) => [x.id, { text: x.text }])));
          done += batch.length;
        }
      }
      setState({
        done: `${done} textes écrits depuis les Fondations${guarded ? `, dont ${guarded} remplacé(s) par une consigne entre crochets (chiffre absent des Fondations)` : ""}. Vérifie avec l'outil Couverture → Fidélité aux Fondations. Vérifie les propositions ci-dessous, puis applique celles que tu gardes.`,
      });
    } catch (e) {
      setState({ error: `${e.message} (${done} / ${total} déjà écrits)` });
    }
  }

  if (!info) return <p className="atl-aibox__hint">Chargement du projet…</p>;
  if (info.error || !info.project) return <p className="atl-topbar__error">{info.error ?? "Cette page n'est rattachée à aucun projet : pas de Fondations à reprendre."}</p>;
  const typeLabel = pageTypeById[type]?.label ?? "type non réglé";
  return (
    <div className="atl-aibox">
      <p className="atl-aibox__title">📐 Remplir depuis les Fondations</p>
      <p className="atl-aibox__hint">
        Chaque section cochée reçoit le contenu préparé dans les Fondations du projet « {info.project.nom} » pour ce type de page ({typeLabel}), partie 9. Rien n'est inventé : ce qui est marqué [MANQUE] n'est pas écrit.
        {angle ? ` Page de l'angle « ${angle.titre} » : ses zones d'angle parlent à cet avatar.` : ""}
      </p>
      {!TYPES_CONTENU.includes(type) && <p className="atl-topbar__error">Ce type de page ({typeLabel}) n'a pas de carte dans les Fondations. Règle le type de page (⚙ Réglages de la page).</p>}
      {TYPES_CONTENU.includes(type) && !ready.length && (
        <p className="atl-topbar__error">Aucune section de cette page n'a de contenu prêt : remplis d'abord la carte « {typeLabel} » dans les Fondations du projet (partie 9).</p>
      )}
      <ul className="atl-fill">
        {rows.map((r, i) => {
          const ok = r.briefs.length && r.texts.length;
          return (
            <li key={r.id} className={ok ? "" : "is-off"}>
              <label>
                <input type="checkbox" disabled={!ok || state?.busy} checked={Boolean(ok) && chosen.has(r.id)} onChange={() => toggle(r.id)} />
                <span>
                  <b>
                    {i + 1}. {r.label}
                  </b>
                  <small>{ok ? `${r.briefs.map((b) => b.label).join(" + ")} · ${r.texts.length} texte(s)` : r.nav ? "en-tête ou pied de page : laissé tel quel" : !r.texts.length ? "pas de texte" : r.pourquoi || "pas de contenu dans les Fondations pour cette section"}</small>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {ready.length > 0 && (
        <p className="atl-aibox__hint">
          <button type="button" className="atl-linkbtn" onClick={() => setPicked(new Set(ready.map((r) => r.id)))}>
            tout cocher
          </button>{" "}
          ·{" "}
          <button type="button" className="atl-linkbtn" onClick={() => setPicked(new Set())}>
            tout décocher
          </button>
        </p>
      )}
      <button type="button" className="atl-aibox__go" disabled={state?.busy || !ready.some((r) => chosen.has(r.id))} onClick={run}>
        {state?.busy ? "Écriture en cours…" : `Remplir ${ready.filter((r) => chosen.has(r.id)).length} section(s)`}
      </button>
      {state?.busy && <p className="atl-aidlg__step">{state.step}</p>}
      {state?.done && <p className="atl-topbar__ok">{state.done}</p>}
      {state?.error && <p className="atl-topbar__error">{state.error}</p>}
    </div>
  );
}

// ---- Décliner pour cet angle : seules les zones d'angle sont réécrites ----
// (sections marquées « Angle » dans Structure ; le socle ne bouge pas). Brief :
// la carte de l'angle (avatar, douleur, promesse) + le message central des
// Fondations du projet.
function DeclinePage({ content, root, onApply }) {
  const [info, setInfo] = useState(null);
  const [angleId, setAngleId] = useState("");
  const [state, setState] = useState(null);
  useEffect(() => {
    pageRole(pageName, root)
      .then((r) => {
        setInfo(r);
        setAngleId(r.angle?.id ?? "");
      })
      .catch((e) => setInfo({ error: e.message }));
  }, [root.projet]);
  const angles = (info?.project?.angles ?? []).filter((a) => a.choisi);
  const angle = angles.find((a) => a.id === angleId);
  const zones = content.filter(isAngleZone);
  const message = info?.project?.fondations?.message ?? {};

  async function run() {
    if (!angle) return setState({ error: "Choisis l'angle de cette page." });
    let items = zones;
    // Page copiée avant le marquage de la mère : on reprend ses zones.
    if (!items.length && info.motherName && info.motherName !== pageName) {
      const mother = await getPage(info.motherName).catch(() => null);
      const ids = mother ? zonesFromMother(content, mother.content ?? []) : new Set();
      items = content.filter((it) => ids.has(it.props.id));
    }
    if (!items.length) return setState({ error: "Aucune zone d'angle : marque-les d'abord dans Structure (bouton Socle / Angle de chaque section)." });
    const jobs = items.map((item) => ({ id: item.props.id, texts: byId[item.type] ? aiTargets(item).texts : [] })).filter((j) => j.texts.length);
    const total = jobs.reduce((n, j) => n + j.texts.length, 0);
    if (!total) return setState({ error: "Aucun texte dans les zones d'angle." });
    if (!confirm(`Décliner les ${total} textes des ${jobs.length} zones d'angle pour « ${angle.titre} » ? Le socle ne change pas.`)) return;
    const contexte = {
      marque: root.marque ?? "",
      produit: root.produit ?? "",
      typeDePage: root.pageType ?? "",
      infosProduit: (root.infos ?? "").slice(0, 6000),
      angle: { titre: angle.titre, lentille: angle.lentille, avatar: angle.avatar, douleur: angle.douleur, promesse: angle.promesse },
      messageCentral: {
        promesse: message.promesse ?? "",
        mecanisme: message.mecanisme ?? "",
        preuves: (message.preuves ?? []).filter(Boolean),
        objections: (message.objections ?? []).filter((o) => o?.objection),
      },
    };
    let done = 0;
    try {
      for (const job of jobs) {
        for (let i = 0; i < job.texts.length; i += 40) {
          const batch = job.texts.slice(i, i + 40);
          setState({ busy: true, step: `${done} / ${total} textes déclinés…` });
          const res = await fetch("/api/ia/textes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: batch,
              prompt:
                "Décline chaque texte pour l'ANGLE du contexte. Ces textes sont les zones d'angle de la page (titre, accroche, ouverture, problème, bénéfices, avis mis en avant, boutons) : parle directement à l'avatar de l'angle et à sa douleur, et mène vers la promesse de l'angle, en restant fidèle au message central (même produit, même mécanisme, même offre). Garde le rôle du texte dans la page, sa longueur et ses balises de mise en forme. Ne change ni les prix, ni l'offre, ni la garantie, ni les chiffres ; n'invente aucune preuve, étude ou avis. " +
                consigneLangue(root),
              contexte,
            }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          onApply(job.id, Object.fromEntries(body.items.map((x) => [x.id, { text: x.text }])));
          done += batch.length;
        }
      }
      setState({ done: `${done} textes déclinés pour « ${angle.titre} ». Vérifie les propositions ci-dessous, puis applique celles que tu gardes.` });
    } catch (e) {
      setState({ error: `${e.message} (${done} / ${total} déjà déclinés)` });
    }
  }

  if (!info) return <p className="atl-aibox__hint">Chargement du projet…</p>;
  if (info.error || !info.project) return <p className="atl-topbar__error">{info.error ?? "Cette page n'est rattachée à aucun projet : pas d'angle à décliner."}</p>;
  return (
    <div className="atl-aibox">
      <p className="atl-aibox__title">🎯 Décliner pour cet angle</p>
      <p className="atl-aibox__hint">
        Réécrit seulement les zones d'angle ({zones.length || "à reprendre de la page mère"}) : hero, ouverture, problème, bénéfices, avis mis en avant, boutons. Le socle (offre, preuves, garantie, FAQ, bloc d'achat) ne change pas. Brief : la carte de l'angle et le message central des Fondations.
      </p>
      {info.role === "mere" && <p className="atl-topbar__error">C'est la page mère : décliner la réécrit pour un autre angle. En général, on décline plutôt ses copies (pages d'angle).</p>}
      <select value={angleId} onChange={(e) => setAngleId(e.target.value)} disabled={state?.busy}>
        <option value="">— Choisir l'angle —</option>
        {angles.map((a) => (
          <option key={a.id} value={a.id}>
            {a.titre}
            {a.page === pageName ? " (cette page)" : ""}
          </option>
        ))}
      </select>
      {angle && (
        <p className="atl-aibox__hint">
          {angle.avatar && <><b>Avatar :</b> {angle.avatar}<br /></>}
          {angle.douleur && <><b>Douleur :</b> {angle.douleur}<br /></>}
          {angle.promesse && <><b>Promesse :</b> {angle.promesse}</>}
        </p>
      )}
      {!message.promesse && <p className="atl-aibox__hint">Message central vide dans les Fondations : la déclinaison sera moins précise.</p>}
      <button type="button" className="atl-aibox__go" disabled={state?.busy || !angle} onClick={run}>
        {state?.busy ? "Déclinaison en cours…" : "Décliner les zones d'angle"}
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
              regles: false, // une traduction ne réécrit pas : pas de règles de copy
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
      setState({ done: `${done} textes traduits en ${langue}. Vérifie les propositions ci-dessous, puis applique celles que tu gardes.` });
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
