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
  // produit et profil : dans la fiche « Ma marque et mon produit » (Réglages de la page).
  pageAchat: { type: "text", label: "Page d'achat liée (si pas d'achat ici)" },
  // Polices (font_heading, font_body) et fond (fond_page) : réglés dans le
  // rail de gauche → Palette depuis le 2026-11-13 (plus dans les Réglages).
};
