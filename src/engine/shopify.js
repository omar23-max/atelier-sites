// Règles communes à l'atelier (navigateur) et au script d'export (Node).
// Aucune dépendance à Vite ici.

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

// Réglages à écrire dans un modèle JSON : seulement ce qui diffère du défaut
// Shopify, et jamais les images (dans l'atelier ce sont des URL, alors que
// Shopify attend un fichier de la boutique).
function settingsDiff(settings, values) {
  const out = {};
  for (const s of settings ?? []) {
    if (INFO_SETTING_TYPES.includes(s.type) || ["image_picker", "video_url"].includes(s.type)) continue;
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

export function buildShopifySectionFile({ id, schema, meta, template, css }) {
  const source = meta?.source?.url ? ` — structure inspirée de ${meta.source.url}` : "";
  return [
    `{%- comment -%}`,
    `  Généré par l'atelier (sections/${id}/)${source}.`,
    `  Ne pas modifier ici : modifier la section dans l'atelier puis réexporter.`,
    `{%- endcomment -%}`,
    `<style>`,
    css.trim(),
    `</style>`,
    template.trim(),
    ``,
    `{% schema %}`,
    JSON.stringify(schema, null, 2),
    `{% endschema %}`,
    ``,
  ].join("\n");
}
