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
  { family: "temoignages", nom: "Avis clients", re: /\b(verified (buyer|purchase)|testimonials?|avis clients?)\b|[★⭐]+|\bi (love|felt|tried|bought|was skeptical)\b|\bj'ai (testé|essayé|acheté)|\breviews?\b(?! ?\))/gi },
  { family: "garantie", nom: "Garantie", re: /money[- ]back|guarantee|satisfaction garantie|garantie|rembours/gi },
  { family: "offre", nom: "Offre", re: /\b(order now|buy now|shop now|get (yours|it|my)|claim|limited|in stock|discount|sold out|check availability)\b|% off|commander|profitez|stock limité|\d+ ?% de réduction/gi },
  { family: "faq", nom: "FAQ", re: /\bfaq\b|frequently asked|questions fréquentes/gi },
  { family: "expert", nom: "Avis d'expert", re: /\b(dr\.|doctor|dermatologist|physician|nutritionist|expert|médecin|docteur)/gi },
  { family: "comparatif", nom: "Tableau comparatif", re: /\bvs\.?\s|compared to|comparison|other brands|\bis better\b|\bwhy (our|we)\b.*\bbetter\b|contrairement aux|par rapport aux/gi, w: 2 },
  { family: "resultats", nom: "Résultats", re: /\b(within|after) \d+ (days?|weeks?)\b|\bresults?\b|en \d+ (jours|semaines)|résultats?/gi },
  { family: "probleme", nom: "Problème", re: /\b(pain|suffer|struggl|tired of|problem|frustrat)|douleur|souffr|problème|marre de/gi },
  { family: "solution", nom: "Solution", re: /\b(how (it|does it) works?|secret|discover|breakthrough|technology|solution)|découv|fonctionne|technologie/gi },
  { family: "ingredients", nom: "Ingrédients", re: /\b(ingredients?|formula|extract|vitamin|mineral|collagen)\b|ingrédients?|formule|extrait/gi },
  { family: "listicle", nom: "Raisons d'acheter", re: /\b(\d+ reasons|reasons? (why|to)|why (people|customers|everyone))\b|\d+ raisons|raisons? de|pourquoi les gens/gi },
  { family: "avantages", nom: "Avantages", re: /\bbenefits?\b|avantages?|bienfaits?/gi },
  { family: "mode-emploi", nom: "Mode d'emploi", re: /\b(step \d|how to use|simply)\b|étape \d|mode d'emploi/gi },
  { family: "newsletter", nom: "Newsletter", re: /\b(subscribe|newsletter|sign up)\b|inscri(s|vez)/gi },
  { family: "presse", nom: "Vu dans la presse", re: /\bas seen (in|on)\b|\b(as )?featured (in|on)\b|vu (dans|à) la/gi },
  { family: "packs", nom: "Packs", w: 2, re: /\bbundle|starter (kit|pack)|\b\d+[- ](bottles?|jars?|packs?|months?)( supply)?\b|\bbuy \d+,? get\b|\b(most popular|best value)\b|meilleure offre/gi },
  { family: "fiche-produit", nom: "Bloc d'achat", w: 3, re: /\badd to (cart|bag)\b|ajouter au panier|\bquantity\b|quantité|subscribe (&|and) save|one[- ]time purchase|achat unique/gi },
  { family: "details-produit", nom: "Détails du produit", re: /\bspecifications?\b|\bdimensions\b|what'?s in the box|what'?s included|caractéristiques|contenu du coffret/gi },
  { family: "marque", nom: "Notre histoire", re: /\bour (story|mission|founder)\b|\bfounded (in|by)\b|notre (histoire|mission)/gi },
  { family: "confiance", nom: "Badges de confiance", re: /secure checkout|\bssl\b|\bgmp\b|third[- ]party tested|made in (the )?usa|cruelty[- ]free|paiement sécurisé/gi },
  { family: "video", nom: "Vidéo", re: /\bwatch (the|our|how)\b|\bvideos?\b|vidéos?/gi },
  { family: "chiffres", nom: "Chiffres clés", re: /\b\d{2,3}% (of|des|of users)\b|\b\d{2,3},\d{3}\+|\b\d+k\+|\b\d+(\.\d+)?\+? ?(million|millions|billion)\b/gi, w: 2 },
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
  // w : poids d'un signe (un bouton panier dit plus qu'une étoile).
  const scored = FONCTIONS.map((f) => ({ ...f, n: (t.match(f.re) ?? []).length * (f.w ?? 1) })).filter((f) => f.n > 0);
  if (last) scored.forEach((f) => f.family === "pied-de-page" && (f.n += 5));
  scored.sort((a, b) => b.n - a.n);
  const noms = scored.slice(0, first ? 1 : 2).map((f) => f.nom);
  // La première section n'est un « Hero » que si ce n'est pas déjà un bloc d'achat.
  const buyBox = scored[0]?.family === "fiche-produit" || scored[0]?.family === "packs";
  if (first && !buyBox) noms.unshift("Hero");
  if (!noms.length) noms.push("Contenu");
  return { nom: noms.join(" · "), families: [...(first && !buyBox ? ["entete", "hero"] : []), ...scored.map((f) => f.family)] };
}
