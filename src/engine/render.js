import { INFO_SETTING_TYPES } from "./shopify.js";
import { renderLiquid } from "./liquid.js";
import { frameCss, safeAnchor } from "./frame.js";
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
// Les scripts Node (miniatures, comparaison) n'ont pas de serveur : ils
// remplacent le chemin par le contenu du fichier.
export function setPhotoResolver(fn) {
  resolvePhoto = fn;
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
      const videoOrigine = merged.wireframe ? null : section.meta.videosOrigine?.[values.slot];
      if (videoOrigine && !values.link) values.link = videoOrigine;
      // Couleurs écrites dans le texte (lien bleu, mot en couleur) : suivent la palette.
      if (roles && typeof values.text === "string") values.text = nearRolesInHtml(values.text, roles);
      blocks.push({ id: `${block.type}-${i}`, type: block.type, settings: values, shopify_attributes: "" });
    });
  }

  const html = renderLiquid(section.template, { section: { id: instanceId, settings, blocks } });
  return withSectionFrame(section, merged, instanceId, html);
}

// Fond et marges choisis dans l'éditeur (fond_section, marge_haut, marge_bas)
// pour les sections dont le template ne les gère pas lui-même.
// Fonds des colonnes et cartes (fonds_groupes) : pour toutes (engine/frame.js).
function withSectionFrame(section, props, instanceId, html) {
  const cls = `atl-cadre-${String(instanceId).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const css = frameCss(section, props, `.${cls}`, { imageUrl: props.atl_fond_image ? resolvePhoto(props.atl_fond_image) : null });
  const anchor = safeAnchor(props.atl_ancre);
  if (!css && !anchor) return html;
  return `<div class="${cls}"${anchor ? ` id="${anchor}"` : ""}>${html}${css ? `<style>${css}</style>` : ""}</div>`;
}
