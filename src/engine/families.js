// Familles de sections, dans l'ordre où elles apparaissent en général sur une page.
// Chaque section déclare sa famille dans meta.json ("family": "<id>").
// Une famille vide reste visible : elle montre ce qu'on peut encore importer.
export const FAMILIES = [
  { id: "bandeaux", label: "Bandeaux et annonces", hint: "Barre d'annonce, bandeau défilant" },
  { id: "entete", label: "En-tête", hint: "Logo, menu, panier" },
  { id: "hero", label: "Hero", hint: "Première section d'une page d'accueil ou landing" },
  { id: "fiche-produit", label: "Fiche produit", hint: "Galerie, prix, packs, bouton d'achat" },
  { id: "collection", label: "Collection de produits", hint: "Grilles et carrousels de produits" },
  { id: "temoignages", label: "Témoignages et avis", hint: "Avis clients, UGC, notes" },
  { id: "expert", label: "Avis d'expert", hint: "Un médecin, un spécialiste recommande le produit" },
  { id: "probleme", label: "Problème", hint: "La douleur du client" },
  { id: "solution", label: "Solution et mécanisme", hint: "Comment le produit fonctionne" },
  { id: "avantages", label: "Avantages", hint: "Bénéfices, icônes, listes" },
  { id: "ingredients", label: "Ingrédients et composition", hint: "Ce qu'il y a dedans" },
  { id: "mode-emploi", label: "Mode d'emploi", hint: "Étapes, how it works" },
  { id: "resultats", label: "Résultats et calendrier", hint: "Avant/après, à quoi s'attendre" },
  { id: "chiffres", label: "Chiffres clés", hint: "Statistiques, preuves chiffrées" },
  { id: "comparatif", label: "Comparatif", hint: "Nous vs eux, tableaux" },
  { id: "garantie", label: "Garantie", hint: "Satisfait ou remboursé" },
  { id: "confiance", label: "Badges de confiance", hint: "Paiement sécurisé, labels, médias" },
  { id: "livraison", label: "Livraison et retours", hint: "Délais, expédition rapide" },
  { id: "offre", label: "Offre et appel à l'action", hint: "Bloc d'achat final, promo" },
  { id: "bonus", label: "Bonus offerts", hint: "Cadeaux inclus, ce que contient la commande" },
  { id: "faq", label: "FAQ", hint: "Questions fréquentes" },
  { id: "newsletter", label: "Newsletter", hint: "Inscription e-mail" },
  { id: "pied-de-page", label: "Pied de page", hint: "Liens, mentions, paiements" },
];

export const familyById = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));

export function familyOf(section) {
  return familyById[section.meta?.family] ?? { id: "autres", label: "Autres", hint: "" };
}
