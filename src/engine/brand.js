import { PAGE_TYPES } from "./page-types.js";
import { fallbackOf } from "./fonts.js";

// Kit de marque (début de la phase 4) : polices réglées au niveau de la page.
// Chaque section garde ses valeurs d'origine en secours tant qu'aucune police
// n'est choisie.

const fontUrl = (families) =>
  `https://fonts.googleapis.com/css2?${families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&")}&display=swap`;

// Graisses 800 / 900 demandées par les styles du design (titres très gras) :
// chacune dans sa propre requête, car Google refuse TOUTE la requête si une
// graisse n'existe pas pour la police ; une graisse absente échoue seule et
// la police garde 400-700 (2026-11-16).
function heavyImports(families, styles = {}) {
  const out = [];
  for (const f of families) {
    const weights = new Set();
    for (const st of Object.values(styles)) {
      if (String(st?.police ?? "").trim().toLowerCase() !== f.toLowerCase()) continue;
      const g = Number(st?.graisse);
      if (g >= 800) weights.add(g >= 900 ? 900 : 800);
    }
    for (const w of [...weights].sort()) out.push(`@import url("https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${w}&display=swap");`);
  }
  return out;
}

// designStyles : tokens.styles du design de la page (facultatif ; les scripts
// Node ne le passent pas).
export function brandCss(root = {}, designStyles = null) {
  const heading = (root.font_heading ?? "").trim();
  const body = (root.font_body ?? "").trim();
  const families = [...new Set([heading, body].filter(Boolean))];
  const vars = [
    // Police de secours selon la famille (serif, sans-serif…), 2026-11-17.
    heading && `--atl-font-heading: "${heading}", ${fallbackOf(heading)};`,
    body && `--atl-font-body: "${body}", ${fallbackOf(body)};`,
  ].filter(Boolean);
  return [
    families.length ? `@import url("${fontUrl(families)}");` : "",
    ...heavyImports(families, designStyles ?? {}),
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
