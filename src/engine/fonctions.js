// Fonction d'une section d'après ses textes : « Hero », « Avis clients »,
// « FAQ »… Sert à nommer les sections copiées d'une vraie page ou ajoutées au
// catalogue (comme Whitelabeler, qui nomme chaque section par sa nature, pas
// par le produit), et au Page Score pour voir ce qu'une copie contient.
// Fichier sans dépendance : lu par l'atelier et par les scripts Node.

// family : famille du catalogue correspondante (src/engine/families.js).
// re : signes dans les textes (anglais et français). Plusieurs familles par
// section sont possibles ; le nom garde les deux plus marquées.
export const FONCTIONS = [
  { family: "bandeaux", nom: "Bandeau d'annonce", re: /\b(free shipping|livraison (offerte|gratuite)|limited time|today only|advertorial|advertisement)\b/gi },
  { family: "temoignages", nom: "Avis clients", re: /\b(verified (buyer|purchase)|reviews?|testimonials?|avis clients?)\b|★|⭐|\bi (love|felt|tried|bought|was skeptical)\b|\bj'ai (testé|essayé|acheté)/gi },
  { family: "garantie", nom: "Garantie", re: /money[- ]back|guarantee|satisfaction garantie|garantie|rembours/gi },
  { family: "offre", nom: "Offre", re: /\b(order now|buy now|shop now|get (yours|it|my)|claim|limited|in stock|discount|sold out|check availability)\b|% off|commander|profitez|stock limité|\d+ ?% de réduction/gi },
  { family: "faq", nom: "FAQ", re: /\bfaq\b|frequently asked|questions fréquentes/gi },
  { family: "expert", nom: "Avis d'expert", re: /\b(dr\.|doctor|dermatologist|physician|nutritionist|expert|médecin|docteur)/gi },
  { family: "comparatif", nom: "Tableau comparatif", re: /\bvs\.?\s|compared to|comparison|other brands|contrairement aux|par rapport aux/gi },
  { family: "resultats", nom: "Résultats", re: /\b(within|after) \d+ (days?|weeks?)\b|\bresults?\b|en \d+ (jours|semaines)|résultats?/gi },
  { family: "probleme", nom: "Problème", re: /\b(pain|suffer|struggl|tired of|problem|frustrat)|douleur|souffr|problème|marre de/gi },
  { family: "solution", nom: "Solution", re: /\b(how (it|does it) works?|secret|discover|breakthrough|technology|solution)|découv|fonctionne|technologie/gi },
  { family: "ingredients", nom: "Ingrédients", re: /\b(ingredients?|formula|extract|vitamin|mineral|collagen)\b|ingrédients?|formule|extrait/gi },
  { family: "avantages", nom: "Avantages", re: /\b(benefits?|reasons? (why|to)|why (people|customers))\b|avantages?|bienfaits?|raisons? de/gi },
  { family: "mode-emploi", nom: "Mode d'emploi", re: /\b(step \d|how to use|simply)\b|étape \d|mode d'emploi/gi },
  { family: "newsletter", nom: "Newsletter", re: /\b(subscribe|newsletter|sign up)\b|inscri(s|vez)/gi },
  { family: "pied-de-page", nom: "Pied de page", re: /©|copyright|privacy policy|terms (of|and)|mentions légales|confidentialité/gi },
];
export const FONCTION_BY_FAMILY = Object.fromEntries(FONCTIONS.map((f) => [f.family, f]));

const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// Familles présentes dans un texte (pour le Page Score).
export function familiesInText(text) {
  const t = plain(text);
  return FONCTIONS.filter((f) => new RegExp(f.re.source, "i").test(t)).map((f) => f.family);
}

// Nom de section : les deux fonctions les plus marquées (« Hero · Problème »).
// first / last : la section ouvre ou ferme la page.
export function fonctionOf(text, { first = false, last = false } = {}) {
  const t = plain(text);
  const scored = FONCTIONS.map((f) => ({ ...f, n: (t.match(f.re) ?? []).length })).filter((f) => f.n > 0);
  if (last) scored.forEach((f) => f.family === "pied-de-page" && (f.n += 5));
  scored.sort((a, b) => b.n - a.n);
  const noms = scored.slice(0, first ? 1 : 2).map((f) => f.nom);
  if (first) noms.unshift("Hero");
  if (!noms.length) noms.push("Contenu");
  return { nom: noms.join(" · "), families: [...(first ? ["entete", "hero"] : []), ...scored.map((f) => f.family)] };
}
