import { sections, sectionsIndex } from "./sections.js";
import { blocksKey, editableSettings, isOriginalPhoto, normalizeProps } from "./render.js";

const byId = sectionsIndex;

// Toutes les photos d'origine que la page affiche encore : champ image vide
// (photo d'origine de meta.photosOrigine) ou valeur /imports/….
export function originalPhotoTargets(content) {
  const targets = [];
  content.forEach((item) => {
    const section = byId[item.type];
    if (!section) return;
    const props = normalizeProps(section, item.props);
    const o = section.meta.photosOrigine ?? {};
    const label = section.meta.label?.split(" — ")[0] ?? item.type;
    const briefs = section.meta.imageBriefs ?? {};
    const check = (defs, values, originals, where) => {
      for (const s of editableSettings(defs)) {
        if (s.type !== "image_picker") continue;
        const v = values?.[s.id];
        const source = isOriginalPhoto(v) ? v : !v ? originals?.[s.id] : null;
        if (!source) continue;
        targets.push({
          key: [item.props.id, where?.type && `${where.type}-${where.index}`, s.id].filter(Boolean).join("__"),
          sectionId: item.props.id,
          sectionType: item.type,
          sectionLabel: label,
          settingId: s.id,
          settingLabel: s.label,
          blockType: where?.type ?? null,
          blockIndex: where?.index ?? null,
          source,
          brief: briefs[s.id] ?? "",
        });
      }
    };
    check(section.schema.settings, props, o.settings, null);
    for (const block of section.schema.blocks ?? []) {
      (props[blocksKey(block.type)] ?? []).forEach((values, index) =>
        check(block.settings, values, o.blocks?.[block.type]?.[index], { type: block.type, index }),
      );
    }
  });
  return targets;
}

