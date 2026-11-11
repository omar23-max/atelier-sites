// Type de page : la première question d'un import ou d'une nouvelle page est
// « Les gens achètent-ils sur cette page ? ». Une page d'achat porte le bloc
// d'achat (prix, packs, panier) ; une page sans achat (accueil, advertorial,
// listicle…) raconte puis renvoie vers la page où l'on achète.
//
// Un même produit peut avoir plusieurs pages, chacune taillée pour un profil
// client (« femmes 45+ au cholestérol élevé », « sportifs »…) : réglages de page
// `produit` et `profil`.

// parAngle (2026-11-09) : true = une page mère puis une page par angle (landing,
// advertorial, page d'offre : la page reprend la pub qui y mène) ; false = une
// seule page qui sert tous les angles (listicle : chaque angle devient une
// raison ; page d'accueil, page produit, collection, à propos).
export const PAGE_TYPES = [
  { id: "produit", label: "Page produit", achat: true, parAngle: false, hint: "Galerie, prix, packs et bouton panier : l'achat se fait ici." },
  // Page d'offre : page de promotion taillée pour une pub (pack, -50 %, 1 acheté =
  // 1 offert, cadeau, compte à rebours), souvent sans menu. La page produit
  // est la fiche standard de la boutique, pour tout le trafic.
  { id: "offre", label: "Page d'offre", achat: true, parAngle: true, hint: "Une promotion précise (pack, réduction, cadeau) pour le trafic des pubs : l'offre d'abord, souvent sans menu." },
  { id: "landing", label: "Landing page de vente", achat: true, parAngle: true, hint: "Longue page de vente avec bloc d'achat, pour une pub précise." },
  { id: "collection", label: "Page collection", achat: true, parAngle: false, hint: "Grille de produits ou de packs : on choisit et on ajoute au panier." },
  { id: "accueil", label: "Page d'accueil", achat: false, parAngle: false, hint: "Présente la marque et mène vers les produits." },
  { id: "advertorial", label: "Advertorial (article)", achat: false, parAngle: true, hint: "Article qui raconte un problème et renvoie vers la page d'achat." },
  { id: "listicle", label: "Listicle", achat: false, parAngle: false, hint: "« 7 raisons de… » : une liste qui renvoie vers la page d'achat." },
  // Page comparatif (2026-11-10, « Compare landing page » et « Compare advertorial »
  // de la formation de Jeffrey) : pour le visiteur qui hésite entre plusieurs
  // solutions. Une seule page (tous les angles), qui renvoie vers la page d'achat.
  { id: "comparatif", label: "Page comparatif", achat: false, parAngle: false, hint: "« Pourquoi ce produit plutôt que les autres » : un tableau face aux autres solutions, puis renvoi vers la page d'achat." },
  { id: "autre", label: "À propos ou autre", achat: false, parAngle: false, hint: "Histoire de la marque, contact, page informative." },
];

export const pageTypeById = Object.fromEntries(PAGE_TYPES.map((t) => [t.id, t]));

export const pageTypeOf = (root = {}) => pageTypeById[root.pageType] ?? null;

// Le type se décline-t-il en pages d'angle ? (inconnu : oui, comme avant)
export const declineParAngle = (typeId) => pageTypeById[typeId]?.parAngle !== false;
