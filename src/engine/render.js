import { INFO_SETTING_TYPES } from "./shopify.js";
import { renderLiquid } from "./liquid.js";
import { frameCss, safeAnchor } from "./frame.js";
import { CARROUSEL_SCRIPT, carrouselAttr, hasCarrouselTrack } from "./carrousel.js";
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
  if (!css && !anchor && !car) return html;
  return `<div class="${cls}"${anchor ? ` id="${anchor}"` : ""}${car ? ` data-atl-carrousel="${car}"` : ""}>${html}${css ? `<style>${css}</style>` : ""}${car ? CARROUSEL_SCRIPT : ""}</div>`;
}
