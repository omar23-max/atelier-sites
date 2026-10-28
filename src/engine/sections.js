import { validateSection } from "./shopify.js";

// Chaque dossier sections/<id>/ devient une section : ajouter un dossier
// suffit pour qu'elle apparaisse dans l'atelier. Elles arrivent en une seule
// réponse JSON compressée (/api/sections-data, plugin « atelier-sections » de
// vite.config.js). Dans l'atelier (?page=…) : les sections du catalogue plus
// les parties copiées de cette page seulement ; dans le catalogue : toutes.
const page = location.pathname === "/" ? new URLSearchParams(location.search).get("page") : null;
const all = await fetch(`/api/sections-data${page ? `?page=${encodeURIComponent(page)}` : ""}`).then((r) => r.json());

export const sections = all
  .map((section) => ({ ...section, errors: validateSection(section) }))
  .sort((a, b) => a.id.localeCompare(b.id));

// Sections du catalogue : sans les parties d'une copie de page (meta.pageSpecific),
// qui n'ont de sens que dans la page importée dont elles viennent.
export const catalogueSections = sections.filter((s) => !s.meta.pageSpecific);
