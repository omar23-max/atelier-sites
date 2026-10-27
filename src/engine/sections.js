import { validateSection } from "./shopify.js";

// Chaque dossier sections/<id>/ devient une section : ajouter un dossier
// suffit pour qu'elle apparaisse dans l'atelier. Toutes arrivent en un seul
// module (plugin « atelier-sections » de vite.config.js), pour un chargement rapide.
import all from "virtual:atelier-sections";

export const sections = all
  .map((section) => ({ ...section, errors: validateSection(section) }))
  .sort((a, b) => a.id.localeCompare(b.id));

// Sections du catalogue : sans les parties d'une copie de page (meta.pageSpecific),
// qui n'ont de sens que dans la page importée dont elles viennent.
export const catalogueSections = sections.filter((s) => !s.meta.pageSpecific);
