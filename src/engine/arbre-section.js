// Arbre d'une section et écriture de ses valeurs (audit F23, 2026-11-25).
// Sorti de inspector-ui.jsx : Canvas et le tableau n'importent plus toute
// l'interface de l'inspecteur (≈ 700 ko) pour deux fonctions de données.
import { sectionsIndex } from "./sections.js";
import { blocksKey, editableSettings, normalizeProps } from "./render.js";

const byId = sectionsIndex;

export const TYPE = {
  titre: { icon: "H", label: "Titre" },
  texte: { icon: "¶", label: "Texte" },
  bouton: { icon: "▭", label: "Bouton" },
  lien: { icon: "↗", label: "Lien" },
  image: { icon: "🖼", label: "Image" },
  "image-fond": { icon: "🖼", label: "Image de fond" },
  video: { icon: "▶", label: "Vidéo" },
  bloc: { icon: "▣", label: "Bloc" },
};
export const GROUP_ICON = { colonnes: "▥", colonne: "▯", groupe: "▤" };
export const plain = (html) =>
  String(html ?? "")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
export const isImageType = (t) => t === "image" || t === "image-fond" || t === "video";

// ---- Ordre des éléments d'une copie : « g12=2,0,1;g40=… » ----
export const parseOrders = (s) =>
  Object.fromEntries(
    String(s ?? "")
      .split(";")
      .filter((p) => p.includes("="))
      .map((p) => {
        const [g, v] = p.split("=");
        return [g, v.split(",").map(Number)];
      }),
  );
export const writeOrders = (o) =>
  Object.entries(o)
    .map(([g, v]) => `${g}=${v.join(",")}`)
    .join(";");
export const orderOf = (orders, gid, size) => (orders[gid]?.length === size ? orders[gid] : Array.from({ length: size }, (_, i) => i));

// ---- Modèle : arbre d'une section ----
// Feuille : { key, type, label, k, parent } ; groupe : { group, id, gid, size, label, kind, children, k, parent }.
// parent : le conteneur où l'élément peut changer de place (gid, ou « @<type> »
// pour les blocs d'une section du catalogue).
export function treeForItem(item) {
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
    return withAjouts(root ? (root.group ? root.children : [root]) : [], props.atl_ajouts);
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
export function textRuns(children, parent) {
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
export const runHtml = (leaves) => leaves.map((l) => l.text ?? "").join("<br><br>");
// Texte modifié → un morceau par paragraphe (les morceaux en trop vont dans le
// dernier, les paragraphes en trop deviennent vides).
export function splitRun(html, leaves) {
  const parts = String(html ?? "").split(/(?:\s*<br\s*\/?>\s*){2,}/i);
  return Object.fromEntries(leaves.map((l, i) => [l.key, { text: i === leaves.length - 1 ? parts.slice(i).join("<br><br>") : (parts[i] ?? "") }]));
}

export const leavesOf = (nodes) => nodes.flatMap((n) => (n.group ? leavesOf(n.children) : [n]));
// Chemin (groupes ancêtres) jusqu'au nœud qui vérifie `test`.
export function pathTo(nodes, test, path = []) {
  for (const n of nodes) {
    if (test(n)) return [...path, n];
    if (n.group) {
      const found = pathTo(n.children, test, [...path, n]);
      if (found) return found;
    }
  }
  return null;
}
export const sameNode = (sel) => (n) => (sel.key ? n.key === sel.key : sel.group ? n.group && n.id === sel.group : false);

// Textes et images retravaillables d'une section (ou d'une partie : `keys`).
export function aiTargets(item, keys = null) {
  const section = byId[item.type];
  if (!section) return { texts: [], images: [], vides: [] };
  const props = normalizeProps(section, item.props);
  const texts = [];
  const images = [];
  // Cadres d'image encore vides (2026-11-23) : l'IA crée l'image d'après la
  // consigne du cadre (« [ SUBJECT … ] ») au lieu de la refaire.
  const vides = [];
  if (section.meta.arbre) {
    const leaves = leavesOf(treeForItem(item)).filter((l) => !keys || keys.includes(l.key));
    for (const l of leaves) {
      if (isImageType(l.type)) {
        if (l.image) images.push({ key: l.key, src: l.image, size: l.size });
        else if (l.type === "image") vides.push({ key: l.key, consigne: plain(l.text ?? ""), size: l.size });
      } else if (plain(l.text)) texts.push({ id: l.key, text: l.text, role: l.name ?? l.type }); // rôle : « Titre H1 », « Bouton »… (règles de l'IA)
    }
    return { texts, images, vides };
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

// Blocs ajoutés ou dupliqués (2026-11-22) : feuilles insérées juste après
// leur élément, dans le même conteneur (pas de place dans l'ordre du modèle,
// k = null : ils se déplacent avec la poignée ✥).
export const AJOUT_NOM = { titre: "Titre", paragraphe: "Paragraphe", image: "Image", video: "Vidéo" };
export function withAjouts(nodes, ajouts) {
  if (!Array.isArray(ajouts) || !ajouts.length) return nodes;
  const all = (list) => list.flatMap((n) => (n.group ? [n, ...all(n.children)] : [n]));
  let out = nodes;
  for (const a of ajouts) {
    if (!/^x\d+$/.test(a?.id ?? "")) continue;
    const model = a.modele ? all(out).find((n) => n.key === a.modele) : null;
    const type = a.type === "copie" ? model?.type ?? "texte" : a.type === "paragraphe" ? "texte" : a.type === "titre" ? model?.type ?? "titre" : a.type;
    const name = a.type === "copie" ? `${model?.name ?? TYPE[type]?.label ?? "Élément"} (copie)` : a.type === "titre" && a.niveau ? `Titre H${a.niveau} ajouté` : `${AJOUT_NOM[a.type] ?? "Élément"} ajouté`;
    const leaf = { key: a.id, k: null, parent: null, type, name, text: a.text, image: a.image, ajout: true, ajoutType: a.type, niveau: a.niveau ?? null, label: isImageType(type) ? name : plain(a.text) || name };
    const insert = (list) => {
      const i = list.findIndex((n) => n.key === a.apres);
      if (i >= 0) return [...list.slice(0, i + 1), { ...leaf, parent: list[i].parent }, ...list.slice(i + 1)];
      let hit = false;
      const next = list.map((n) => {
        if (hit || !n.group) return n;
        const c = insert(n.children);
        if (c !== n.children) {
          hit = true;
          return { ...n, children: c };
        }
        return n;
      });
      return hit ? next : list;
    };
    const inserted = insert(out);
    out = inserted !== out ? inserted : [...out, leaf];
  }
  return out;
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
    const ajouts = Array.isArray(props.atl_ajouts)
      ? props.atl_ajouts.map((a) => {
          const v = values[a.id];
          return v ? { ...a, ...(v.text != null ? { text: v.text } : {}), ...(v.image != null ? { image: v.image } : {}) } : a;
        })
      : undefined;
    return { ...item, props: { ...props, blocks_element: blocks, ...(ajouts ? { atl_ajouts: ajouts } : {}) } };
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

