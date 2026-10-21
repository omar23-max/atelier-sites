import { validateSection } from "./shopify.js";

// Charge automatiquement chaque dossier sections/<id>/ : ajouter un dossier
// suffit pour que la section apparaisse dans l'atelier.
const schemas = import.meta.glob("/sections/*/schema.json", { eager: true, import: "default" });
const metas = import.meta.glob("/sections/*/meta.json", { eager: true, import: "default" });
const templates = import.meta.glob("/sections/*/template.liquid", { eager: true, query: "?raw", import: "default" });
const styles = import.meta.glob("/sections/*/style.css", { eager: true, query: "?raw", import: "default" });
const thumbnails = import.meta.glob("/sections/*/thumbnail.png", { eager: true, query: "?url", import: "default" });

const dirOf = (path) => path.split("/").slice(0, -1).join("/");

export const sections = Object.entries(schemas)
  .map(([path, schema]) => {
    const dir = dirOf(path);
    const id = dir.split("/").pop();
    const section = {
      id,
      schema,
      meta: metas[`${dir}/meta.json`] ?? {},
      template: templates[`${dir}/template.liquid`] ?? "",
      css: styles[`${dir}/style.css`] ?? "",
      thumbnail: thumbnails[`${dir}/thumbnail.png`] ?? null,
    };
    section.errors = validateSection(section);
    return section;
  })
  .sort((a, b) => a.id.localeCompare(b.id));
