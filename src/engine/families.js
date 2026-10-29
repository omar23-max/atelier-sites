// Familles de sections. Les types de la bibliothèque Whitelabeler (« Section
// library ») gardent leur nom anglais, dans le même ordre que son menu
// déroulant ; viennent ensuite les sections de structure d'une page (en-tête,
// hero, bloc d'achat…), que cette bibliothèque ne propose pas.
// Chaque section déclare sa famille dans meta.json ("family": "<id>").
// Une famille vide reste visible : elle montre ce qu'on peut encore importer.
export const FAMILIES = [
  // En tête de toutes les listes : l'outil qu'on ajoute le plus souvent.
  { id: "espace", label: "Spacer", hint: "Espace vide entre deux sections, hauteur réglable" },
  // ---- Section library (Whitelabeler) ----
  { id: "listicle", wl: true, label: "Reasons to buy", hint: "« 5 raisons… », « Pourquoi les gens… » : une liste numérotée de raisons, chacune avec image" },
  { id: "temoignages", wl: true, label: "Customer reviews", hint: "Avis clients, UGC, notes" },
  { id: "garantie", wl: true, label: "Guarantee", hint: "Satisfait ou remboursé" },
  { id: "mode-emploi", wl: true, label: "How it works", hint: "Étapes, mode d'emploi" },
  { id: "cta", wl: true, label: "Big call to action", hint: "Grand bandeau avec une promesse et un bouton" },
  { id: "sticky-atc", wl: true, label: "Sticky Add to cart", hint: "Barre d'achat qui reste visible pendant le défilement" },
  { id: "resultats", wl: true, label: "Results", hint: "Avant/après, à quoi s'attendre et quand" },
  { id: "comparatif", wl: true, label: "Us vs. the rest", hint: "Nous contre les autres, tableaux comparatifs" },
  { id: "avantages", wl: true, label: "Benefits", hint: "Bénéfices, icônes, listes" },
  { id: "video", wl: true, label: "Video", hint: "Vidéo, grille de vidéos clients (UGC)" },
  { id: "faq", wl: true, label: "Questions and answers", hint: "Questions fréquentes" },
  { id: "confiance", wl: true, label: "Trust badges", hint: "Paiement sécurisé, labels, certifications" },
  { id: "presse", wl: true, label: "As seen in", hint: "Logos des médias qui en ont parlé, preuve sociale" },
  { id: "marque", wl: true, label: "Our story", hint: "Histoire et valeurs de la marque" },
  { id: "probleme", wl: true, label: "The problem it solves", hint: "La douleur du client" },
  { id: "ingredients", wl: true, label: "What's inside", hint: "Ingrédients, composition" },
  { id: "offre", wl: true, label: "Special offer", hint: "Promotion, réduction, offre limitée" },
  { id: "galerie", wl: true, label: "Photo gallery", hint: "Galerie de photos du produit ou des clients" },
  { id: "expert", wl: true, label: "Expert pick", hint: "Un médecin, un spécialiste recommande le produit" },
  { id: "newsletter", wl: true, label: "Email sign-up", hint: "Inscription e-mail" },
  { id: "slogan", wl: true, label: "Tagline band", hint: "Bandeau avec une phrase forte de la marque" },
  { id: "histoire", wl: true, label: "Story", hint: "Récit : un client, un fondateur, une découverte" },
  { id: "details-produit", wl: true, label: "Product details", hint: "Caractéristiques, dimensions, ce qui est inclus" },
  { id: "packs", wl: true, label: "Bundle offer", hint: "Packs et lots à prix dégressif" },
  // ---- Sections de structure de page (absentes de la bibliothèque Whitelabeler) ----
  { id: "bandeaux", label: "Announcement bar", hint: "Barre d'annonce, bandeau défilant" },
  { id: "entete", label: "Header", hint: "Logo, menu, panier" },
  { id: "hero", label: "Hero", hint: "Première section d'une page d'accueil ou landing" },
  { id: "fiche-produit", label: "Buy box", hint: "Galerie, prix, packs, bouton d'achat" },
  { id: "collection", label: "Product grid", hint: "Grilles et carrousels de produits" },
  { id: "article", label: "Article (advertorial)", hint: "Advertorial, listicle ou presell copié en entier" },
  { id: "solution", label: "Mechanism", hint: "Comment le produit fonctionne" },
  { id: "chiffres", label: "Key stats", hint: "Statistiques, preuves chiffrées" },
  { id: "livraison", label: "Shipping & returns", hint: "Délais, expédition rapide" },
  { id: "bonus", label: "Free bonuses", hint: "Cadeaux inclus, ce que contient la commande" },
  { id: "pied-de-page", label: "Footer", hint: "Liens, mentions, paiements" },
];

export const familyById = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));

export function familyOf(section) {
  return familyById[section.meta?.family] ?? { id: "autres", label: "Autres", hint: "" };
}
