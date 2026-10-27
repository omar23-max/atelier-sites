// Langue de la page (root.props.langue) : anglais par défaut. Tout ce que
// l'IA écrit pour la page (réécriture, section ajoutée ou refaite, adaptation)
// est dans cette langue.
export const LANGUES_PAGE = [
  { code: "en", court: "EN", nom: "anglais (américain)" },
  { code: "fr", court: "FR", nom: "français" },
];

export const langueOf = (root) => LANGUES_PAGE.find((l) => l.code === root?.langue) ?? LANGUES_PAGE[0];

export const consigneLangue = (root) => `Langue : écris tous les textes en ${langueOf(root).nom}, même si le modèle ou les informations fournies sont dans une autre langue.`;
