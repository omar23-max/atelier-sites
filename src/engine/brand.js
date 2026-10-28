import { PAGE_TYPES } from "./page-types.js";

// Kit de marque (début de la phase 4) : polices réglées au niveau de la page.
// Chaque section garde ses valeurs d'origine en secours tant qu'aucune police
// n'est choisie.

const fontUrl = (families) =>
  `https://fonts.googleapis.com/css2?${families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&")}&display=swap`;

export function brandCss(root = {}) {
  const heading = (root.font_heading ?? "").trim();
  const body = (root.font_body ?? "").trim();
  const families = [...new Set([heading, body].filter(Boolean))];
  const vars = [
    heading && `--atl-font-heading: "${heading}", sans-serif;`,
    body && `--atl-font-body: "${body}", sans-serif;`,
  ].filter(Boolean);
  return [
    families.length ? `@import url("${fontUrl(families)}");` : "",
    "body { margin: 0; }",
    vars.length ? `:root { ${vars.join(" ")} }` : "",
    // Fond de la page (Réglages de la page) : visible derrière les sections transparentes.
    /^#[0-9a-f]{3,8}$/i.test(root.fond_page ?? "") ? `body { background-color: ${root.fond_page}; }` : "",
  ].join("\n");
}

export const rootFields = {
  title: { type: "text", label: "Nom de la page" },
  pageType: {
    type: "select",
    label: "Type de page (les gens achètent-ils ici ?)",
    options: [
      { label: "— Choisir —", value: "" },
      ...PAGE_TYPES.map((t) => ({ label: `${t.achat ? "Achat" : "Pas d'achat"} · ${t.label}`, value: t.id })),
    ],
  },
  produit: { type: "text", label: "Produit (regroupe ses pages)" },
  profil: { type: "text", label: "Profil client visé par cette page" },
  pageAchat: { type: "text", label: "Page d'achat liée (si pas d'achat ici)" },
  font_heading: { type: "text", label: "Police des titres (Google Fonts, ex. Readex Pro)" },
  font_body: { type: "text", label: "Police du texte (Google Fonts, ex. Inter Tight)" },
};
