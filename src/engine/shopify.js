// Règles communes à l'atelier (navigateur) et au script d'export (Node).
// Aucune dépendance à Vite ici.
import { frameCss, safeAnchor } from "./frame.js";
import { CARROUSEL_SCRIPT, CAR_DEFAULTS, carrouselAttr, hasCarrouselTrack } from "./carrousel.js";

export const SUPPORTED_SETTING_TYPES = [
  "text",
  "textarea",
  "inline_richtext",
  "richtext",
  "url",
  "image_picker",
  "video_url",
  "color",
  "number",
  "range",
  "checkbox",
  "select",
  "radio",
  "product",
  "header",
  "paragraph",
];

// Types purement informatifs dans Shopify : pas de valeur à éditer.
export const INFO_SETTING_TYPES = ["header", "paragraph"];

const ID_PATTERN = /^[a-z0-9_]+$/;

function validateSettings(settings, where, errors) {
  const seen = new Set();
  for (const s of settings ?? []) {
    if (INFO_SETTING_TYPES.includes(s.type)) continue;
    const label = `${where} › réglage "${s.id ?? "?"}"`;
    if (!s.id || !ID_PATTERN.test(s.id)) errors.push(`${label} : id manquant ou invalide (a-z, 0-9, _).`);
    if (seen.has(s.id)) errors.push(`${label} : id en double.`);
    seen.add(s.id);
    if (!SUPPORTED_SETTING_TYPES.includes(s.type)) errors.push(`${label} : type "${s.type}" non géré par l'atelier.`);
    if (!s.label) errors.push(`${label} : label manquant.`);
    if (["image_picker", "video_url"].includes(s.type) && s.default !== undefined) {
      errors.push(`${label} : Shopify refuse une valeur par défaut pour "${s.type}" (mettre l'aperçu dans meta.json).`);
    }
    if (s.type === "url" && s.default !== undefined && !["/collections", "/collections/all"].includes(s.default)) {
      errors.push(`${label} : Shopify n'accepte comme lien par défaut que "/collections" ou "/collections/all".`);
    }
    if (s.type === "range") {
      if ([s.min, s.max, s.step].some((v) => typeof v !== "number")) errors.push(`${label} : range demande min, max et step.`);
      if (typeof s.default !== "number" || s.default < s.min || s.default > s.max) errors.push(`${label} : défaut hors de [min, max].`);
    }
    if (s.type === "color" && s.default && !/^#[0-9a-fA-F]{6}$/.test(s.default)) {
      errors.push(`${label} : couleur par défaut attendue au format #rrggbb.`);
    }
    if (["select", "radio"].includes(s.type) && !Array.isArray(s.options)) errors.push(`${label} : options manquantes.`);
  }
}

export function validateSection({ id, schema, template, css }) {
  const errors = [];
  if (!schema?.name) errors.push("schema.json : name manquant.");
  if (schema?.name && schema.name.length > 25) errors.push(`schema.json : name "${schema.name}" dépasse 25 caractères (limite Shopify).`);
  validateSettings(schema?.settings, "section", errors);

  const blockTypes = new Set();
  for (const b of schema?.blocks ?? []) {
    if (!b.type || !ID_PATTERN.test(b.type)) errors.push(`bloc "${b.type}" : type invalide.`);
    if (blockTypes.has(b.type)) errors.push(`bloc "${b.type}" : type en double.`);
    blockTypes.add(b.type);
    if (!b.name || b.name.length > 25) errors.push(`bloc "${b.type}" : name manquant ou > 25 caractères.`);
    validateSettings(b.settings, `bloc "${b.type}"`, errors);
  }

  if (!Array.isArray(schema?.presets) || schema.presets.length === 0) {
    errors.push("schema.json : au moins un preset est nécessaire pour que la section apparaisse dans « Ajouter une section ».");
  }
  for (const p of schema?.presets ?? []) {
    for (const pb of p.blocks ?? []) {
      if (!blockTypes.has(pb.type)) errors.push(`preset "${p.name}" : bloc "${pb.type}" inconnu.`);
    }
  }

  if (/{%-?\s*schema/.test(template ?? "")) errors.push("template.liquid : ne doit pas contenir {% schema %} (ajouté à l'export).");
  if (!(template ?? "").includes(`atl-${id}`)) errors.push(`template.liquid : la racine doit porter la classe "atl-${id}".`);
  if (css && !css.includes(`.atl-${id}`)) errors.push(`style.css : les règles doivent commencer par ".atl-${id}".`);
  return errors;
}

// Images créées dans l'atelier (medias/<page>/…) : seules images exportées.
// Dans Shopify, un réglage image pointe vers un fichier de la boutique
// (Contenu → Fichiers) : shopify://shop_images/<nom>. Le nom est préfixé par la
// page pour éviter les doublons entre pages. Les photos d'origine (/imports/…)
// et les liens externes ne partent jamais.
export const isAtelierImage = (v) => typeof v === "string" && v.startsWith("/medias/");
export const shopifyImageName = (v) =>
  `atl-${v.replace(/^\/medias\//, "").replace(/\//g, "-")}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-");

// Toutes les images de l'atelier utilisées par une page : [{ src, name }].
export function atelierImagesOf(page) {
  const found = new Map();
  const walk = (v) => {
    if (isAtelierImage(v)) found.set(v, shopifyImageName(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  (page.content ?? []).forEach((item) => walk(item.props));
  return [...found].map(([src, name]) => ({ src, name }));
}

// Réglages à écrire dans un modèle JSON : seulement ce qui diffère du défaut
// Shopify ; pour les images, seulement celles créées dans l'atelier.
function settingsDiff(settings, values) {
  const out = {};
  for (const s of settings ?? []) {
    if (INFO_SETTING_TYPES.includes(s.type) || s.type === "video_url") continue;
    if (s.type === "image_picker") {
      if (isAtelierImage(values?.[s.id])) out[s.id] = `shopify://shop_images/${shopifyImageName(values[s.id])}`;
      continue;
    }
    const v = values?.[s.id];
    if (v === undefined || v === "" || v === s.default) continue;
    out[s.id] = v;
  }
  return out;
}

// Page de l'atelier (format Puck) → modèle JSON de thème Shopify.
export function buildShopifyTemplate(page, sectionsById) {
  const template = { sections: {}, order: [] };
  (page.content ?? []).forEach((item, i) => {
    const section = sectionsById[item.type];
    if (!section) return;
    const key = `atl_${String(i).padStart(2, "0")}_${item.type.replace(/-/g, "_")}`.slice(0, 50);
    const entry = { type: `atl-${item.type}`, settings: settingsDiff(section.schema.settings, item.props) };
    // Fond de la page : porté par la 1re section.
    const props = item.props ?? {};
    const frame = frameCss(section, props, FRAME_SCOPE, { pageBackground: i === 0 ? page.root?.props?.fond_page : null, imageUrl: "@@IMG@@" });
    if (frame) entry.settings[FRAME_SETTING] = frame;
    // Image de fond : seulement une image créée dans l'atelier (envoyée dans Fichiers).
    if (isAtelierImage(props.atl_fond_image)) entry.settings.atl_bg = shopifyImageName(props.atl_fond_image);
    if (safeAnchor(props.atl_ancre)) entry.settings.atl_ancre = safeAnchor(props.atl_ancre);
    if (hasCarrouselTrack(section) && carrouselAttr(props.atl_carrousel)) entry.settings.atl_carrousel = JSON.stringify({ ...CAR_DEFAULTS, ...props.atl_carrousel });

    const blockTypes = section.schema.blocks ?? [];
    if (blockTypes.length > 0) {
      entry.blocks = {};
      entry.block_order = [];
      for (const block of blockTypes) {
        (item.props?.[`blocks_${block.type}`] ?? []).forEach((values, j) => {
          const blockKey = `${block.type}_${j + 1}`;
          entry.blocks[blockKey] = { type: block.type, settings: settingsDiff(block.settings, values) };
          entry.block_order.push(blockKey);
        });
      }
    }
    template.sections[key] = entry;
    template.order.push(key);
  });
  return template;
}

// Réglage caché ajouté à chaque section exportée : le style posé par l'atelier
// (fonds de section, de colonne, de carte, de page, marges — engine/frame.js),
// avec @@SCOPE@@ à la place du conteneur Shopify de la section.
export const FRAME_SETTING = "atl_style";
const FRAME_SCOPE = "@@SCOPE@@";

export function buildShopifySectionFile({ id, schema, meta, template, css }) {
  const source = meta?.source?.url ? ` — structure inspirée de ${meta.source.url}` : "";
  const withFrame = {
    ...schema,
    settings: [
      ...(schema.settings ?? []),
      { type: "textarea", id: FRAME_SETTING, label: "Style ajouté par l'atelier (ne pas modifier)" },
      { type: "text", id: "atl_bg", label: "Image de fond (fichier de Contenu → Fichiers)" },
      { type: "text", id: "atl_ancre", label: "Ancre (lien #nom vers cette section)" },
      ...(template.includes('data-atl-car="track"') ? [{ type: "text", id: "atl_carrousel", label: "Carrousel réglé dans l'atelier (ne pas modifier)" }] : []),
    ],
  };
  const car = template.includes('data-atl-car="track"');
  return [
    `{%- comment -%}`,
    `  Généré par l'atelier (sections/${id}/)${source}.`,
    `  Ne pas modifier ici : modifier la section dans l'atelier puis réexporter.`,
    `{%- endcomment -%}`,
    `<style>`,
    css.trim(),
    `</style>`,
    `{%- if section.settings.${FRAME_SETTING} != blank -%}{%- capture atl_scope -%}#shopify-section-{{ section.id }}{%- endcapture -%}{%- capture atl_img -%}{%- if section.settings.atl_bg != blank -%}{{ section.settings.atl_bg | file_url }}{%- endif -%}{%- endcapture -%}<style>{{ section.settings.${FRAME_SETTING} | replace: '${FRAME_SCOPE}', atl_scope | replace: '@@IMG@@', atl_img }}</style>{%- endif -%}`,
    `{%- if section.settings.atl_ancre != blank -%}<span id="{{ section.settings.atl_ancre | handleize }}" style="display:block;position:relative;top:-80px;height:0"></span>{%- endif -%}`,
    car ? `{%- if section.settings.atl_carrousel != blank -%}<div data-atl-carrousel="{{ section.settings.atl_carrousel | escape }}">{%- endif -%}` : "",
    template.trim(),
    car ? `{%- if section.settings.atl_carrousel != blank -%}</div>{% raw %}${CARROUSEL_SCRIPT}{% endraw %}{%- endif -%}` : "",
    ``,
    `{% schema %}`,
    JSON.stringify(withFrame, null, 2),
    `{% endschema %}`,
    ``,
  ].join("\n");
}
