import { useMemo } from "react";
import { createUsePuck } from "@puckeditor/core";
import { brandCss, rootFields } from "./brand.js";
import { FAMILIES, familyOf } from "./families.js";
import { blocksKey, defaultPropsFor, defaultsFor, editableSettings, renderSectionHtml } from "./render.js";
import { ROLES } from "./design.js";
import {
  ColorSetting,
  HeaderField,
  ImageSetting,
  RangeSetting,
  SelectSetting,
  TextSetting,
  ToggleSetting,
  UrlSetting,
} from "../fields-ui.jsx";
import { ProductSetting } from "../product-ui.jsx";

const roleLabel = Object.fromEntries(ROLES.map((r) => [r.id, r.label]));

// Champ image d'un bloc : la photo d'origine dépend du numéro du bloc, lu dans
// le nom du champ (« blocks_etape[1].image »).
const blockImage = (originals) =>
  function BlockImage(props) {
    const i = Number(/\[(\d+)\]/.exec(props.name ?? "")?.[1] ?? -1);
    return <ImageSetting {...props} field={{ ...props.field, original: originals?.[i]?.[props.field.settingId] }} />;
  };

// Traduit un réglage Shopify en champ Puck (panneau de droite). ctx : meta de
// la section, et le type de bloc pour les réglages d'un bloc.
function settingToField(setting, ctx) {
  const { meta, blockType } = ctx;
  // Un titre de groupe Shopify porte son texte dans « content ».
  const base = { type: "custom", label: setting.label ?? setting.content, info: setting.info, settingId: setting.id };
  switch (setting.type) {
    case "header":
      return { ...base, render: HeaderField };
    case "text":
    case "inline_richtext":
    case "video_url":
      return { ...base, placeholder: setting.placeholder, render: TextSetting };
    case "textarea":
    case "richtext":
      return { ...base, multiline: true, placeholder: setting.placeholder, render: TextSetting };
    case "url":
      return { ...base, render: UrlSetting };
    case "number":
      return { type: "number", label: setting.label };
    case "range":
      return { ...base, min: setting.min, max: setting.max, step: setting.step, unit: setting.unit, render: RangeSetting };
    case "checkbox":
      return { ...base, render: ToggleSetting };
    case "select":
    case "radio":
      return { ...base, options: setting.options, render: SelectSetting };
    case "color": {
      const role = blockType ? null : meta.designRoles?.[setting.id];
      return { ...base, role: role ? roleLabel[role] ?? role : null, render: ColorSetting };
    }
    case "product":
      return { ...base, render: ProductSetting };
    case "image_picker":
      return {
        ...base,
        brief: meta.imageBriefs?.[setting.id],
        original: blockType ? undefined : meta.photosOrigine?.settings?.[setting.id],
        render: blockType ? blockImage(meta.photosOrigine?.blocks?.[blockType]) : ImageSetting,
      };
    default:
      return null;
  }
}

// Les titres de groupe (« header ») restent dans le panneau, à leur place.
// Exporté : le panneau de droite (inspector-ui) affiche aussi ces champs.
export function fieldsFor(settings, ctx) {
  const fields = {};
  (settings ?? []).forEach((s, i) => {
    if (s.type === "paragraph") return;
    const field = settingToField(s, ctx);
    if (field) fields[s.type === "header" ? `_groupe_${i}` : s.id] = field;
  });
  return fields;
}

const usePuckSelect = createUsePuck();

function SectionView({ section, props }) {
  const html = useMemo(() => renderSectionHtml(section, props, props.id), [section, props]);
  const selected = usePuckSelect((s) => s.selectedItem?.props?.id === props.id);
  return (
    <div className={`atl-shopify-section${selected ? " atl-is-selected" : ""}`} data-atl-id={props.id}>
      <style>{section.css}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function componentFor(section) {
  const { schema, meta } = section;
  const fields = fieldsFor(schema.settings, { meta });

  for (const block of schema.blocks ?? []) {
    const titleSetting = editableSettings(block.settings).find((s) => s.type === "text");
    fields[blocksKey(block.type)] = {
      type: "array",
      label: `${block.name} (blocs)`,
      arrayFields: fieldsFor(block.settings, { meta, blockType: block.type }),
      defaultItemProps: defaultsFor(block.settings, meta.previewBlocks?.[block.type]),
      getItemSummary: (item, i) => (titleSetting && item?.[titleSetting.id]) || `${block.name} ${i + 1}`,
    };
  }

  return {
    label: meta.label ?? schema.name,
    fields,
    defaultProps: defaultPropsFor(section),
    render: (props) => <SectionView section={section} props={props} />,
  };
}

// Styles propres à l'aperçu de l'éditeur (jamais exportés) : la section
// sélectionnée s'illumine avec un bord lumineux.
const EDITOR_CSS = `
.atl-shopify-section { position: relative; }
.atl-shopify-section.atl-is-selected::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  border: 3px solid #5b7cff;
  background: rgba(91, 124, 255, 0.06);
  box-shadow: 0 0 28px 6px rgba(91, 124, 255, 0.55), inset 0 0 26px rgba(91, 124, 255, 0.35);
  animation: atl-glow 1.4s ease-out 1;
}
/* Photo d'origine du site d'inspiration : repère orange tant qu'elle n'est pas remplacée. */
.atl-shopify-section img[src^="/imports/"] { outline: 3px dashed #f59e0b; outline-offset: -3px; }
.atl-shopify-section [style*="/imports/"] { box-shadow: inset 0 0 0 3px #f59e0b; }
/* Élément survolé ou choisi dans le panneau de droite. */
.atl-hl { outline: 2px solid #2c6ecb !important; outline-offset: 2px; }
.atl-hl-on { outline: 3px solid #2c6ecb !important; outline-offset: 2px; box-shadow: 0 0 0 6px rgba(44, 110, 203, 0.18) !important; }
[data-atl-slot] { cursor: pointer; }
/* Écriture directe dans la page : le texte reçoit la souris et le clavier. */
html[data-atl-editing] [class*="DraggableComponent-overlay"] { pointer-events: none !important; }
[contenteditable="true"] { pointer-events: auto !important; cursor: text; outline: 2px solid #6d4aff !important; outline-offset: 3px; }
/* Un élément ou un groupe est choisi : seul lui s'éclaire, pas toute la section. */
html[data-atl-sub] .atl-shopify-section.atl-is-selected::after { display: none; }
/* Pas de teinte de Puck au survol (ni sur la section choisie) : seule la
   sélection s'éclaire. La barre d'actions de la section reste. */
[class*="DraggableComponent-overlay"] { opacity: 0 !important; }
@keyframes atl-glow {
  0% { box-shadow: 0 0 0 0 rgba(91, 124, 255, 0.9), inset 0 0 40px rgba(91, 124, 255, 0.6); background: rgba(91, 124, 255, 0.18); }
  100% { box-shadow: 0 0 28px 6px rgba(91, 124, 255, 0.55), inset 0 0 26px rgba(91, 124, 255, 0.35); background: rgba(91, 124, 255, 0.06); }
}
`;

export function buildPuckConfig(sections) {
  const components = {};
  const categories = {};
  // Catégories de la colonne de gauche = familles, dans l'ordre d'une page type.
  for (const family of [...FAMILIES, { id: "autres", label: "Autres" }]) {
    categories[family.id] = { title: family.label, components: [] };
  }
  for (const section of sections) {
    // Toutes les sections restent déclarées (une page peut en utiliser une
    // masquée), mais seules les visibles sont proposées à gauche.
    components[section.id] = componentFor(section);
    if (section.meta.status !== "masquee") categories[familyOf(section).id].components.push(section.id);
  }
  for (const id of Object.keys(categories)) {
    if (categories[id].components.length === 0) delete categories[id];
  }

  return {
    components,
    categories,
    root: {
      fields: { ...rootFields, fond_page: { type: "custom", label: "Fond de la page (derrière toutes les sections)", render: ColorSetting } },
      defaultProps: { title: "Nouvelle page", font_heading: "", font_body: "" },
      render: ({ children, font_heading, font_body, fond_page }) => (
        <>
          <style>{brandCss({ font_heading, font_body, fond_page }) + EDITOR_CSS}</style>
          {children}
        </>
      ),
    },
  };
}
