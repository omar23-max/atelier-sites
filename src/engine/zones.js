// Socle ou zone d'angle, d'après la famille d'une section (2026-11-09).
// Zones d'angle par défaut : hero, problème, histoire, bénéfices, grand CTA, et
// le premier bloc d'avis de la page (voir src/angle-zones.js). Tout le reste
// fait partie du socle (offre, mécanisme, preuves, garantie, FAQ, bloc d'achat…).
export const ANGLE_FAMILIES = new Set(["hero", "probleme", "histoire", "avantages", "cta"]);

// Section manquante (une ou plusieurs familles possibles) : « angle » si l'une
// d'elles est une zone d'angle ou des avis (le premier bloc d'avis en est une).
export const zoneOfFamilies = (families = []) => (families.some((f) => ANGLE_FAMILIES.has(f) || f === "temoignages") ? "angle" : "socle");
