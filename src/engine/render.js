import { INFO_SETTING_TYPES } from "./shopify.js";
import { renderLiquid } from "./liquid.js";
import { frameCss, safeAnchor } from "./frame.js";
import { CARROUSEL_SCRIPT, carrouselAttr, hasCarrouselTrack } from "./carrousel.js";
import { GALERIE_SCRIPT } from "./galerie.js";
import { nearRolesInHtml } from "../../scripts/lib/proche.mjs";

// Partagé par l'atelier (Puck) et les scripts Node (export HTML, comparaison).

// Couleurs d'origine des rôles d'une section copiée ({ texte: "#262626", … }).
const rolesCache = new WeakMap();
function rolesOf(section) {
  if (!section.meta?.designRoles) return null;
  if (!rolesCache.has(section)) {
    const defaults = Object.fromEntries((section.schema.settings ?? []).filter((s) => s.id?.startsWith("role_")).map((s) => [s.id, s.default]));
    rolesCache.set(section, Object.fromEntries(Object.entries(section.meta.designRoles).filter(([k]) => defaults[k]).map(([k, r]) => [r, defaults[k]])));
  }
  return rolesCache.get(section);
}

export const blocksKey = (type) => `blocks_${type}`;

export const editableSettings = (settings = []) => settings.filter((s) => !INFO_SETTING_TYPES.includes(s.type));

function defaultFor(setting, preview) {
  if (preview && setting.id in preview) return preview[setting.id];
  if (setting.default !== undefined) return setting.default;
  if (setting.type === "checkbox") return false;
  if (setting.type === "range") return setting.min;
  return "";
}

export function defaultsFor(settings, preview) {
  return Object.fromEntries(editableSettings(settings).map((s) => [s.id, defaultFor(s, preview)]));
}

// Valeurs par défaut d'une section, au format des props Puck.
export function defaultPropsFor(section) {
  const { schema, meta } = section;
  const props = defaultsFor(schema.settings, meta.preview);
  const presetBlocks = schema.presets?.[0]?.blocks ?? [];
  for (const block of schema.blocks ?? []) {
    const itemDefaults = defaultsFor(block.settings, meta.previewBlocks?.[block.type]);
    props[blocksKey(block.type)] = presetBlocks
      .filter((b) => b.type === block.type)
      .map((b) => ({ ...itemDefaults, ...(b.settings ?? {}) }));
  }
  // Section enregistrée depuis l'atelier (« Enregistrer dans le catalogue ») :
  // ses textes, images, styles et réglages tels qu'ils étaient dans la page.
  if (meta.presetProps) Object.assign(props, structuredClone(meta.presetProps));
  return props;
}

// Complète des props partielles (page importée, ancienne sauvegarde) avec les
// valeurs par défaut, y compris dans chaque bloc.
export function normalizeProps(section, props = {}) {
  const merged = { ...defaultPropsFor(section), ...props };
  for (const block of section.schema.blocks ?? []) {
    const itemDefaults = defaultsFor(block.settings, section.meta.previewBlocks?.[block.type]);
    const key = blocksKey(block.type);
    merged[key] = (merged[key] ?? []).map((item) => ({ ...itemDefaults, ...item }));
  }
  return merged;
}

// Photos d'origine : découpées dans la capture du site d'inspiration
// (imports/<site>/images/), déclarées dans meta.photosOrigine. Elles ne servent
// qu'à l'aperçu : un champ image vide les affiche, ta propre image les remplace.
// Elles ne sont jamais écrites dans la page ni exportées.
export const isOriginalPhoto = (value) => typeof value === "string" && value.startsWith("/imports/");

let resolvePhoto = (path) => path;
// Médias d'origine (photos ET vidéos) montrés ? Les exports (HTML, Mirror,
// partage sans photos) passent un résolveur qui rend "" : les vidéos d'origine
// sont alors retirées elles aussi.
let originalsShown = true;
// Les scripts Node (miniatures, comparaison) n'ont pas de serveur : ils
// remplacent le chemin par le contenu du fichier.
export function setPhotoResolver(fn) {
  resolvePhoto = fn;
  try {
    originalsShown = fn("/imports/_essai.png") !== "";
  } catch {
    originalsShown = true;
  }
}

function withOriginalPhotos(settingsDef, values, originals) {
  if (!originals) return values;
  const out = { ...values };
  for (const s of settingsDef ?? []) {
    if (s.type === "image_picker" && !out[s.id] && originals[s.id]) out[s.id] = originals[s.id];
    if (isOriginalPhoto(out[s.id])) out[s.id] = resolvePhoto(out[s.id]);
  }
  return out;
}

// Props Puck → contexte Liquid identique à celui de Shopify.
export function renderSectionHtml(section, props, instanceId = "apercu") {
  const merged = normalizeProps(section, props);
  // Version wireframe d'une page (props.wireframe) : emplacements d'image vides,
  // sans les photos d'origine.
  const originals = merged.wireframe ? {} : section.meta.photosOrigine ?? {};
  let settings = {};
  for (const s of editableSettings(section.schema.settings)) settings[s.id] = merged[s.id];
  settings = withOriginalPhotos(section.schema.settings, settings, originals.settings ?? {});

  const roles = rolesOf(section);
  const blocks = [];
  for (const block of section.schema.blocks ?? []) {
    merged[blocksKey(block.type)].forEach((item, i) => {
      const values = withOriginalPhotos(block.settings, item, originals.blocks?.[block.type]?.[i] ?? {});
      // Vidéo d'origine : jouée dans l'aperçu tant qu'aucune vidéo n'est choisie
      // (comme les photos d'origine, jamais écrite dans la page ni exportée).
      const videoOrigine = merged.wireframe || !originalsShown ? null : section.meta.videosOrigine?.[values.slot];
      if (videoOrigine && !values.link) values.link = videoOrigine;
      // Couleurs écrites dans le texte (lien bleu, mot en couleur) : suivent la palette.
      if (roles && typeof values.text === "string") values.text = nearRolesInHtml(values.text, roles);
      blocks.push({ id: `${block.type}-${i}`, type: block.type, settings: values, shopify_attributes: "" });
    });
  }

  let html = keepChosenImages(renderLiquid(section.template, { section: { id: instanceId, settings, blocks } }));
  html = injectAjouts(html, merged.atl_ajouts);
  if (/data-atl-(q|acc)=/.test(html)) html += ACC_SCRIPT;
  return withSectionFrame(section, merged, instanceId, html);
}

// FAQ et accordéons des copies (2026-11-07) : question [data-atl-q=n], réponse
// [data-atl-r=n]. Dans l'éditeur (le script ne s'exécute pas) les réponses
// restent ouvertes pour être modifiées ; dans l'aperçu du catalogue et sur la
// page publiée, elles se ferment et s'ouvrent au clic sur leur question.
// Le style qui force l'affichage d'une réponse ouverte est dans le style.css
// de chaque copie (bloc « atl-faq »).
const ACC_SCRIPT =
  "<script>(function(s){var r=s&&s.previousElementSibling;while(r&&!r.hasAttribute('data-atl-root'))r=r.previousElementSibling;" +
  "if(!r&&s&&s.parentElement)r=s.parentElement.querySelector('[data-atl-root]');if(!r||r.__atlAcc)return;r.__atlAcc=1;" +
  "r.setAttribute('data-atl-acc-on','');" +
  "[].forEach.call(r.querySelectorAll('details[data-atl-acc=ferme]'),function(d){d.open=false});" +
  "[].forEach.call(r.querySelectorAll('[data-atl-q]'),function(q){q.setAttribute('aria-expanded','false');" +
  "q.addEventListener('click',function(e){var a=r.querySelector('[data-atl-r=\"'+q.getAttribute('data-atl-q')+'\"]');if(!a)return;" +
  "e.preventDefault();e.stopPropagation();var o=a.hasAttribute('data-atl-open');if(o)a.removeAttribute('data-atl-open');else a.setAttribute('data-atl-open','');" +
  "q.setAttribute('aria-expanded',o?'false':'true')})})})(document.currentScript)</script>";

// Copies de sites (Replo, Kimi…) : beaucoup d'images sont dans un <picture>
// dont les <source> (une par taille d'écran) pointent en dur vers les fichiers
// du site d'origine. Le navigateur les préfère au src de l'<img> : une image
// choisie dans l'atelier ne s'affichait donc pas. Règle (2026-11-07) : on garde
// les <source> seulement si l'image vient du même import qu'elles (photo
// d'origine) ; sinon on les retire et l'image choisie s'affiche partout.
const importFolder = (url) => /^\/imports\/([^/]+)\//.exec(String(url ?? "").trim())?.[1] ?? null;
export function keepChosenImages(html) {
  if (!html.includes("<source")) return html;
  return html.replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/g, (pic) => {
    const src = /<img\b[^>]*\bsrc="([^"]*)"/.exec(pic)?.[1];
    if (!src) return pic;
    const folder = importFolder(src);
    const sources = [...pic.matchAll(/<source\b[^>]*\bsrcset="([^"]*)"[^>]*>/g)];
    if (!sources.length) return pic;
    if (folder && sources.some((m) => importFolder(m[1]) === folder)) return pic;
    if (!folder && /^(https?:)?\/\//.test(src)) return pic; // image d'origine restée en ligne

    return pic.replace(/<source\b[^>]*>/g, "");
  });
}

// Fond et marges choisis dans l'éditeur (fond_section, marge_haut, marge_bas)
// pour les sections dont le template ne les gère pas lui-même.
// Fonds des colonnes et cartes (fonds_groupes) : pour toutes (engine/frame.js).
function withSectionFrame(section, props, instanceId, html) {
  const cls = `atl-cadre-${String(instanceId).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const css = frameCss(section, props, `.${cls}`, { imageUrl: props.atl_fond_image ? resolvePhoto(props.atl_fond_image) : null });
  const anchor = safeAnchor(props.atl_ancre);
  // Carrousel réglé dans le panneau de droite (engine/carrousel.js) : le script
  // tourne sur la page publiée ; dans l'atelier, puck-config.jsx l'appelle.
  const car = hasCarrouselTrack(section) ? carrouselAttr(props.atl_carrousel, true) : null;
  // Bloc d'achat : vignettes → image principale + carrousel (engine/galerie.js).
  // Aussi les blocs d'achat des pages copiées (rangés « article ») : un
  // bouton ou formulaire d'ajout au panier dans le modèle.
  const gal = section.meta?.family === "fiche-produit" || /add[ -]?to[ -]?cart|ajouter au panier|buy now|product-form|add-to-cart/i.test(section.template ?? "");
  if (!css && !anchor && !car && !gal) return html;
  return `<div class="${cls}"${anchor ? ` id="${anchor}"` : ""}${car ? ` data-atl-carrousel="${car}"` : ""}${gal ? " data-atl-galerie" : ""}>${html}${css ? `<style>${css}</style>` : ""}${car ? CARROUSEL_SCRIPT : ""}${gal ? GALERIE_SCRIPT : ""}</div>`;
}


// ---- Blocs ajoutés ou dupliqués dans une copie (2026-11-22) ----
// props.atl_ajouts = [{ id: "x1", apres: "s40", type: "copie" | "titre" |
// "paragraphe" | "image" | "video", modele: "s40", text, image, video }].
// Chaque bloc est inséré juste après l'élément « apres » (ou un bloc ajouté
// avant lui). « modele » : élément dont on reprend la balise et le style ;
// sans modèle, balise simple. Le bloc porte data-atl-slot="xN" : il se
// sélectionne, se stylise (atl_styles) et se déplace comme les autres.
const VOID_TAGS = new Set(["img", "br", "hr", "input", "source", "meta", "link", "wbr", "area", "col", "embed", "track"]);
const IMG_VIDE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="100%" height="100%" fill="#e8e8ee"/><text x="50%" y="50%" fill="#8a8aa0" font-family="sans-serif" font-size="34" text-anchor="middle" dominant-baseline="middle">Image</text></svg>');
function slotRange(html, slot) {
  const at = html.indexOf(`data-atl-slot="${slot}"`);
  if (at < 0) return null;
  const start = html.lastIndexOf("<", at);
  const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(start, start + 40));
  if (!m) return null;
  const tag = m[1].toLowerCase();
  const openEnd = html.indexOf(">", at) + 1;
  if (!openEnd) return null;
  if (VOID_TAGS.has(tag) || html[openEnd - 2] === "/") return { start, openEnd, end: openEnd, tag, closeStart: null };
  const re = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  re.lastIndex = openEnd;
  let depth = 1;
  let mm;
  while ((mm = re.exec(html))) {
    if (mm[0][1] === "/") depth--;
    else if (!mm[0].endsWith("/>")) depth++;
    if (depth === 0) return { start, openEnd, end: re.lastIndex, tag, closeStart: mm.index };
  }
  return null;
}
const escAttr = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const asHtml = (t) => String(t ?? "").replace(/\n/g, "<br>");
function ajoutHtml(html, a) {
  const id = escAttr(a.id);
  // Titre : niveau choisi (H1 à H4). Le modèle (titre du même niveau dans la
  // section) donne le style ; sinon balise simple du niveau.
  const level = a.type === "titre" && /^[1-6]$/.test(String(a.niveau ?? "")) ? `h${a.niveau}` : null;
  const model = a.modele ? slotRange(html, a.modele) : null;
  if (a.type === "video") {
    return a.video
      ? `<video data-atl-slot="${id}" data-atl-ajout controls playsinline preload="metadata" src="${escAttr(a.video)}" style="width:100%;height:auto;display:block;border-radius:inherit"></video>`
      : `<div data-atl-slot="${id}" data-atl-ajout style="display:grid;place-items:center;min-height:200px;background:#e8e8ee;color:#8a8aa0;font:600 18px sans-serif">Vidéo</div>`;
  }
  if (model) {
    let out = html.slice(model.start, model.end);
    if (model.tag === "img") {
      const src = a.image || IMG_VIDE;
      out = out.replace(/\s(srcset|sizes)="[^"]*"/g, "").replace(/visibility:\s*hidden;?/g, "");
      out = /\ssrc="[^"]*"/.test(out) ? out.replace(/\ssrc="[^"]*"/, ` src="${escAttr(src)}"`) : out.replace(/^<img/, `<img src="${escAttr(src)}"`);
    } else if (model.closeStart != null && a.text != null) {
      const innerStart = model.openEnd - model.start;
      const innerEnd = model.closeStart - model.start;
      out = out.slice(0, innerStart) + asHtml(a.text) + out.slice(innerEnd);
    }
    if (level && model.tag !== level) out = out.replace(new RegExp(`^<${model.tag}\\b`, "i"), `<${level}`).replace(new RegExp(`</${model.tag}>$`, "i"), `</${level}>`);
    // En dernier : le contenu ci-dessus est repéré par positions.
    return out.replace(`data-atl-slot="${a.modele}"`, `data-atl-slot="${id}" data-atl-ajout`);
  }
  if (a.type === "image") return `<img data-atl-slot="${id}" data-atl-ajout src="${escAttr(a.image || IMG_VIDE)}" alt="" style="width:100%;height:auto;display:block">`;
  const tag = a.type === "titre" ? level ?? "h2" : "p";
  return `<${tag} data-atl-slot="${id}" data-atl-ajout>${asHtml(a.text ?? "")}</${tag}>`;
}
export function injectAjouts(html, ajouts) {
  if (!Array.isArray(ajouts) || !ajouts.length) return html;
  for (const a of ajouts) {
    if (!a || !/^x\d+$/.test(a.id ?? "") || !a.apres) continue;
    const after = slotRange(html, a.apres);
    if (!after) continue;
    html = html.slice(0, after.end) + ajoutHtml(html, a) + html.slice(after.end);
  }
  return html;
}
