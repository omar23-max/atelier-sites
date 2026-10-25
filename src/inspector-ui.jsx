import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { sections } from "./engine/sections.js";
import { fieldsFor } from "./engine/puck-config.jsx";
import { blocksKey, editableSettings, normalizeProps } from "./engine/render.js";
import { familyOf } from "./engine/families.js";
import { ROOT_ZONE, Thumb, scrollCanvasTo, usePuckSelect } from "./library-ui.jsx";

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
function aiTargets(item, keys = null) {
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
function applyValues(item, values) {
  const section = byId[item.type];
  const props = normalizeProps(section, item.props);
  if (section.meta.arbre) {
    const blocks = (props.blocks_element ?? []).map((b) => {
      const v = values[b.slot];
      return v ? { ...b, ...(v.text != null ? { text: v.text } : {}), ...(v.image != null ? { image: v.image } : {}) } : b;
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
  const treeRef = useRef(null);
  const selRef = useRef(sel);
  selRef.current = sel;
  // Puck affiche ce panneau à deux endroits (dont un caché) : seul le panneau
  // visible écoute l'aperçu, sinon chaque clic compterait deux fois.
  const rootRef = useRef(null);
  const visible = () => (rootRef.current?.getBoundingClientRect().width ?? 0) > 0;

  const indexOf = (id) => content.findIndex((c) => c.props.id === id);
  const itemOf = (id) => getPuck().appState.data.content[indexOf(id)];
  const nodeOf = (s) => (s?.sectionId && (s.key || s.group) && content[indexOf(s.sectionId)] ? pathTo(treeForItem(content[indexOf(s.sectionId)]), sameNode(s))?.at(-1) : null);

  function choose(next, { scroll = true } = {}) {
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
    const el = sub ? domOf(sel.sectionId, nodeOf(sel)) : null;
    mark(el, "atl-hl-on");
    if (el && sel.fromTree) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const row = treeRef.current?.querySelector(".is-chosen");
    row?.scrollIntoView({ block: "nearest" });
  }, [sel, content]);

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
      if (!visible()) return;
      const t = target(e);
      if (t) setTimeout(() => choose(t, { scroll: false }), 0);
    };
    const onMenu = (e) => {
      if (!visible()) return;
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
      doc = next;
      doc?.addEventListener("click", onClick, true);
      doc?.addEventListener("contextmenu", onMenu, true);
    };
    attach();
    const timer = setInterval(attach, 1000);
    return () => {
      clearInterval(timer);
      doc?.removeEventListener("click", onClick, true);
      doc?.removeEventListener("contextmenu", onMenu, true);
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

  const menuItems = (m) => {
    const index = indexOf(m.sectionId);
    const item = content[index];
    if (!item) return [];
    const section = byId[item.type];
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
    setSel(null);
    getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
  };

  return (
    <div className="atl-insp" ref={rootRef}>
      <TreeView
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
      />
      <div className="atl-insp__detail">
        {sel?.page && (
          <div className="atl-insp__panel">
            <PanelHead onBack={close} title="Réglages de la page" sub="Titre, type, produit, polices" />
            <div className="atl-insp__puck">{children}</div>
          </div>
        )}
        {sel?.sectionId && !sel.key && !sel.group && content[indexOf(sel.sectionId)] && (
          <SectionSettings item={content[indexOf(sel.sectionId)]} onBack={close} onAi={() => setAi({ sectionId: sel.sectionId, keys: null })} onChange={(props) => updateProps(sel.sectionId, props)} />
        )}
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
        {sel?.group && selNode && (
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
            <p className="atl-insp__hint">Glisse les lignes de l'arbre pour changer l'ordre. Clic droit pour l'IA sur tout le groupe.</p>
          </div>
        )}
      </div>
      {!sel?.page && <div style={{ display: "none" }}>{children}</div>}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu)} onClose={() => setMenu(null)} />}
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
        <button type="button" className="atl-insp__name" onClick={() => onChoose({ sectionId, key: n.key })} title={n.label}>
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

function SectionSettings({ item, onBack, onAi, onChange }) {
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
      {hasSettings ? (
        <FieldList settings={section.schema.settings} meta={section.meta} values={props} onChange={onChange} />
      ) : (
        <p className="atl-insp__empty">Cette section n'a pas de réglage général : ouvre ses éléments dans l'arbre.</p>
      )}
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
        <PanelHead onBack={onBack} title={`${t.icon} ${t.label}${leaf.size ? ` ${leaf.size}` : ""}`} sub={sectionName} onAi={onAi} />
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
            {(leaf.type === "bouton" || leaf.type === "lien") && <LinkField block={block} onChange={(link) => onChangeLink(onChangeProps, props, elementKey, link)} />}
          </>
        )}
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

function onChangeLink(onChangeProps, props, slot, link) {
  onChangeProps({ ...props, blocks_element: (props.blocks_element ?? []).map((b) => (b.slot === slot ? { ...b, link } : b)) });
}

function LinkField({ block, onChange }) {
  return (
    <label className="atl-insp__field atl-insp__link">
      <span>Lien</span>
      <input value={block.link ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="https://… ou /products/…" />
    </label>
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
          body: JSON.stringify({ items: texts, prompt, contexte: { produit: root.produit ?? "", profil: root.profil ?? "", typeDePage: root.pageType ?? "" } }),
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
