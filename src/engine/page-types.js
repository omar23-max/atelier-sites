// Type de page : la première question d'un import ou d'une nouvelle page est
// « Les gens achètent-ils sur cette page ? ». Une page d'achat porte le bloc
// d'achat (prix, packs, panier) ; une page sans achat (accueil, advertorial,
// listicle…) raconte puis renvoie vers la page où l'on achète.
//
// Un même produit peut avoir plusieurs pages, chacune taillée pour un profil
// client (« femmes 45+ au cholestérol élevé », « sportifs »…) : réglages de page
// `produit` et `profil`.

export const PAGE_TYPES = [
  { id: "produit", label: "Page produit", achat: true, hint: "Galerie, prix, packs et bouton panier : l'achat se fait ici." },
  { id: "landing", label: "Landing page de vente", achat: true, hint: "Longue page de vente avec bloc d'achat, pour une pub précise." },
  { id: "accueil", label: "Page d'accueil", achat: false, hint: "Présente la marque et mène vers les produits." },
  { id: "advertorial", label: "Advertorial (article)", achat: false, hint: "Article qui raconte un problème et renvoie vers la page d'achat." },
  { id: "listicle", label: "Listicle", achat: false, hint: "« 7 raisons de… » : une liste qui renvoie vers la page d'achat." },
  { id: "autre", label: "À propos ou autre", achat: false, hint: "Histoire de la marque, contact, page informative." },
];

export const pageTypeById = Object.fromEntries(PAGE_TYPES.map((t) => [t.id, t]));

export const pageTypeOf = (root = {}) => pageTypeById[root.pageType] ?? null;
