import { useEffect, useMemo, useRef, useState } from "react";
import { createUsePuck } from "@puckeditor/core";
import { brandCss, rootFields } from "./brand.js";
import { FAMILIES, familyOf } from "./families.js";
import { blocksKey, defaultPropsFor, defaultsFor, editableSettings, renderSectionHtml } from "./render.js";
import { ROLES } from "./design.js";
import { atlCarrousels } from "./carrousel.js";
import { ensureFull } from "./sections.js";
import { MissingSlots, SLOT_CSS } from "./missing-slots.jsx";
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
// Rangée coupée entre plusieurs sections (data-atl-suite) avec une colonne
// collante (data-atl-sticky, galerie produit) : sur la page publiée, le script
// STICKY de copie.mjs recolle la rangée. Dans l'aperçu de l'atelier, chaque
// section reste à part (pour la modifier) : la colonne collante est alors
// décalée pendant le défilement, jusqu'au bas de la dernière partie.
function StickySuites() {
  const ref = useRef(null);
  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    const win = doc?.defaultView;
    if (!win) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const groups = {};
      for (const row of doc.querySelectorAll("[data-atl-suite]")) (groups[row.dataset.atlSuite] ??= []).push(row);
      for (const rows of Object.values(groups)) {
        if (rows.length < 2) continue;
        const end = rows[rows.length - 1].getBoundingClientRect().bottom;
        for (const el of rows[0].querySelectorAll("[data-atl-sticky]")) {
          el.style.transform = "";
          // Puck enveloppe chaque section dans un calque (z-index 0) : celui de
          // la section suivante passerait par-dessus le bloc décalé.
          let layer = el.parentElement;
          while (layer && layer !== doc.body && win.getComputedStyle(layer).zIndex === "auto") layer = layer.parentElement;
          if (layer === doc.body) layer = null;
          if (layer) layer.style.zIndex = "";
          const cs = win.getComputedStyle(el);
          if (cs.position !== "sticky") continue;
          const r = el.getBoundingClientRect();
          const shift = Math.max(0, Math.min((parseFloat(cs.top) || 0) - r.top, end - r.bottom));
          if (shift > 0) {
            el.style.transform = `translateY(${shift}px)`;
            el.style.zIndex = "3";
            if (layer) layer.style.zIndex = "1";
            // Un parent qui coupe ce qui dépasse (overflow: clip, page Kimi)
            // cacherait le bloc décalé hors de sa section : il laisse dépasser en hauteur.
            for (let x = el.parentElement; x && x !== layer; x = x.parentElement) {
              if (win.getComputedStyle(x).overflowY !== "visible") x.style.overflowY = "visible";
            }
          }
        }
      }
    };
    const schedule = () => (frame ||= win.setTimeout(update, 16));
    win.addEventListener("scroll", schedule, { passive: true });
    win.addEventListener("resize", schedule);
    const observer = new win.MutationObserver(schedule);
    observer.observe(doc.body, { childList: true, subtree: true });
    schedule();
    return () => {
      win.removeEventListener("scroll", schedule);
      win.removeEventListener("resize", schedule);
      observer.disconnect();
      if (frame) win.clearTimeout(frame);
    };
  }, []);
  return <span ref={ref} hidden />;
}

// Carrousels réglés (data-atl-carrousel) : le <script> posé par render.js ne
// s'exécute pas dans l'aperçu ; ils sont réglés ici, à chaque changement.
function Carrousels() {
  const ref = useRef(null);
  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    const win = doc?.defaultView;
    if (!win) return;
    let frame = 0;
    const run = () => (frame ||= win.setTimeout(() => {
      frame = 0;
      atlCarrousels(doc);
    }, 50));
    const observer = new win.MutationObserver(run);
    observer.observe(doc.body, { childList: true, subtree: true });
    run();
    return () => {
      observer.disconnect();
      if (frame) win.clearTimeout(frame);
    };
  }, []);
  return <span ref={ref} hidden />;
}

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
  // Section arrivée en version légère : complétée, puis rendue.
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (section.leger) ensureFull([section.id]).then(() => setLoaded((n) => n + 1));
  }, [section]);
  const html = useMemo(() => (section.leger ? "" : renderSectionHtml(section, props, props.id)), [section, props, section.leger]);
  const selected = usePuckSelect((s) => s.selectedItem?.props?.id === props.id);
  // Emplacements de sections manquantes (Score de vente) avant la première
  // section et après celle-ci : hors du bloc data-atl-id, pour qu'un clic
  // dessus ne sélectionne pas la section.
  return (
    <>
      <MissingSlots sectionId={props.id} where="before" />
      <div className={`atl-shopify-section${selected ? " atl-is-selected" : ""}`} data-atl-id={props.id}>
        <style>{section.css}</style>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <MissingSlots sectionId={props.id} where="after" />
    </>
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
    // Étiquette au-dessus de la section : sa fonction, sans le site d'origine.
    label: (meta.label ?? schema.name).split(" — ")[0],
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
/* Élément survolé ou choisi dans le panneau de droite. */
.atl-hl { outline: 2px solid #2c6ecb !important; outline-offset: 2px; }
.atl-hl-on { outline: 3px solid #2c6ecb !important; outline-offset: 2px; box-shadow: 0 0 0 6px rgba(44, 110, 203, 0.18) !important; }
/* Surface de l'élément choisi, éclairée en bleu (calque posé par inspector-ui). */
#atl-hl-box { position: fixed; z-index: 2147483000; pointer-events: none; display: none; background: rgba(44, 110, 203, 0.16); outline: 2px solid #2c6ecb; outline-offset: 2px; border-radius: 2px; }
/* Groupes parents de l'élément choisi : contour léger qui reste affiché. */
.atl-hl-parent:not(.atl-hl-on) { outline: 2px dashed rgba(44, 110, 203, 0.55) !important; outline-offset: 4px; }
[data-atl-slot] { cursor: pointer; }
/* Au survol, un texte ou une image gonfle à peine et s'éclaircit : effet
   « vivant » discret. La classe .atl-hover est posée par l'Atelier
   (géométrie, comme les clics), car des calques invisibles peuvent
   empêcher le :hover CSS d'atteindre le slot. */
[data-atl-slot],
[data-atl-group] {
  /* !important : le CSS importé des pages impose transition: revert partout. */
  transition: transform 0.45s ease-out, filter 0.45s ease-out !important;
}
[data-atl-slot].atl-hover,
[data-atl-group].atl-hover {
  transform: scale(1.015) !important;
  filter: brightness(1.04);
  outline: 1px dashed rgba(44, 110, 203, 0.75) !important;
  outline-offset: 2px;
}
/* Étiquette du type d'élément survolé (posée par inspector-ui). */
#atl-tag { position: fixed; z-index: 2147483001; display: none; pointer-events: none; padding: 1px 6px; border: 1px solid #b9d0f3; border-radius: 4px; background: #eef4fd; color: #2c6ecb; font: 600 10.5px/16px "Inter", system-ui, sans-serif; white-space: nowrap; }
/* Écriture directe dans la page : le texte reçoit la souris et le clavier. */
html[data-atl-editing] [class*="DraggableComponent-overlay"] { pointer-events: none !important; }
[contenteditable="true"] { pointer-events: auto !important; cursor: text; outline: 2px solid #6d4aff !important; outline-offset: 3px; }
/* Un élément ou un groupe est choisi : seul lui s'éclaire, pas toute la section. */
html[data-atl-sub] .atl-shopify-section.atl-is-selected::after { display: none; }
/* Pas de teinte de Puck au survol (ni sur la section choisie) : seule la
   sélection s'éclaire. La barre d'actions de la section reste.
   pointer-events: none : l'overlay invisible ne doit pas capter la souris,
   sinon les textes/images ne reçoivent jamais :hover (la sélection passe
   par les gestionnaires de clic de l'Atelier, qui remontent par bubbling). */
[class*="DraggableComponent-overlay"] { opacity: 0 !important; pointer-events: none !important; }
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
      fields: rootFields, // fond_page et polices : rail de gauche → Palette (2026-11-13)
      defaultProps: { title: "Nouvelle page", font_heading: "", font_body: "" },
      render: ({ children, font_heading, font_body, fond_page }) => (
        <>
          <style>{brandCss({ font_heading, font_body, fond_page }) + EDITOR_CSS + SLOT_CSS}</style>
          <StickySuites />
          <Carrousels />
          {children}
        </>
      ),
    },
  };
}
