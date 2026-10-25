// Page Score : note sur 100 d'une page selon son type, et sections manquantes
// conseillées, avec l'endroit où les placer. Calcul local et instantané : on
// regarde quelles familles de sections la page contient.
//
// Chaque type de page a sa liste de règles, dans l'ordre où les sections
// apparaissent en général sur ce type de page. Cet ordre sert aussi à placer
// une section ajoutée : juste après la dernière section présente qui la
// précède dans la liste.
import { familyById } from "./families.js";
import { pageTypeOf } from "./page-types.js";
import { familiesInText } from "./fonctions.js";

// families : une seule de ces familles suffit. points : poids dans la note.
const R = (families, points, why) => ({ families: [].concat(families), points, why });

const PAGE_LINK = { check: "pageAchat", points: 8, label: "Lien vers la page d'achat", why: "Une page sans achat doit mener quelque part : indique la page où l'on achète (réglages de la page)." };

export const RULES = {
  produit: [
    R("bandeaux", 3, "Une barre d'annonce (livraison offerte, garantie) rassure dès la première seconde."),
    R("entete", 4, "Logo et panier : le visiteur sait où il est."),
    R("fiche-produit", 16, "Le bloc d'achat : galerie, prix, packs, bouton panier. Indispensable ici."),
    R("confiance", 4, "Badges de paiement sécurisé et labels près du bouton d'achat."),
    R("temoignages", 10, "Des avis clients détaillés : la preuve que ça marche pour des gens comme lui."),
    R("probleme", 6, "Nommer la douleur du client : il se reconnaît."),
    R("solution", 8, "Expliquer comment le produit agit (le mécanisme)."),
    R("avantages", 5, "Les bénéfices en un coup d'œil."),
    R("ingredients", 5, "Ce qu'il y a dedans : transparence et crédibilité."),
    R("mode-emploi", 4, "Comment l'utiliser : enlève la peur que ce soit compliqué."),
    R("resultats", 6, "À quoi s'attendre et quand : des attentes claires."),
    R("chiffres", 4, "Des chiffres frappants donnent du poids aux promesses."),
    R("comparatif", 6, "Nous contre les autres : pourquoi choisir ce produit."),
    R("expert", 5, "Un expert qui recommande le produit."),
    R("offre", 5, "Une offre spéciale en bas de page : une raison d'acheter aujourd'hui."),
    R("bonus", 3, "Des bonus inclus augmentent la valeur perçue."),
    R("garantie", 8, "Une garantie forte retire le risque."),
    R("faq", 6, "Répondre aux dernières objections."),
    R("pied-de-page", 4, "Liens, mentions légales, contact : sérieux et confiance."),
  ],
  landing: [
    R("bandeaux", 2, "Rappel de l'offre ou de la garantie en haut de page."),
    R("entete", 3, "Logo seul, sans menu qui distrait."),
    R("hero", 12, "Un titre qui reprend la promesse de la pub qui a amené le visiteur."),
    R("probleme", 10, "Nommer la douleur du client précis visé par cette page."),
    R("solution", 10, "Le mécanisme : pourquoi ça marche quand le reste a échoué."),
    R("avantages", 5, "Les bénéfices concrets pour ce profil."),
    R("temoignages", 10, "Des avis de gens qui ressemblent au visiteur."),
    R("expert", 5, "Un expert qui valide."),
    R("resultats", 6, "Le calendrier des résultats."),
    R("comparatif", 6, "Nous contre les autres solutions."),
    R(["fiche-produit", "offre"], 16, "Le bloc d'achat : prix, packs, bouton. Indispensable sur une page d'achat."),
    R("bonus", 3, "Des bonus inclus."),
    R("garantie", 8, "Une garantie forte retire le risque."),
    R("faq", 6, "Les dernières objections."),
    R("pied-de-page", 3, "Mentions légales et contact."),
  ],
  accueil: [
    R("bandeaux", 4, "Livraison offerte, garantie : le message clé en haut."),
    R("entete", 8, "Menu, logo, panier : la navigation du site."),
    R("hero", 15, "Ce que fait la marque et pour qui, avec un bouton vers les produits."),
    R("collection", 14, "Les produits phares, à un clic."),
    R("avantages", 8, "Pourquoi cette marque : ses atouts."),
    R("solution", 5, "Comment fonctionnent les produits."),
    R("temoignages", 10, "Des avis clients."),
    R("confiance", 6, "Labels, médias, paiement sécurisé."),
    R("garantie", 5, "La garantie de la marque."),
    R("newsletter", 6, "Récupérer l'e-mail des visiteurs qui n'achètent pas tout de suite."),
    R("faq", 5, "Questions fréquentes sur la marque, la livraison."),
    R("pied-de-page", 8, "Liens, mentions, contact."),
  ],
  advertorial: [
    R("entete", 3, "Un en-tête discret, façon site d'information."),
    R("hero", 10, "Un titre d'article qui accroche le profil visé."),
    R("probleme", 12, "L'histoire du problème, du point de vue du lecteur."),
    R("solution", 12, "La découverte : le mécanisme qui change tout."),
    R("expert", 6, "Un expert qui confirme."),
    R("temoignages", 10, "Des témoignages de lecteurs comme lui."),
    R("resultats", 6, "Ce qui change, et quand."),
    R("comparatif", 5, "Pourquoi ce produit plutôt que les autres solutions."),
    R("offre", 15, "L'appel à l'action vers la page d'achat (offre limitée, bouton)."),
    R("garantie", 6, "Rappeler la garantie avant le clic."),
    R("faq", 4, "Quelques réponses aux doutes."),
    R("pied-de-page", 3, "Mentions légales."),
    PAGE_LINK,
  ],
  listicle: [
    R("entete", 3, "Un en-tête discret."),
    R("hero", 10, "Le titre de la liste (« 7 raisons… ») adapté au profil visé."),
    R("avantages", 15, "La liste elle-même : chaque raison avec une image."),
    R("temoignages", 10, "Des avis de clients."),
    R("comparatif", 6, "Le produit face aux autres solutions."),
    R("expert", 4, "Un avis d'expert."),
    R("offre", 15, "L'appel à l'action vers la page d'achat."),
    R("garantie", 6, "La garantie avant le clic."),
    R("faq", 4, "Les doutes les plus fréquents."),
    R("pied-de-page", 3, "Mentions légales."),
    PAGE_LINK,
  ],
  autre: [
    R("entete", 10, "Menu, logo, panier."),
    R("hero", 15, "Le sujet de la page en une phrase."),
    R("solution", 10, "L'histoire ou le contenu principal."),
    R("temoignages", 8, "Des avis clients."),
    R("confiance", 6, "Labels et engagements."),
    R("pied-de-page", 8, "Liens, mentions, contact."),
  ],
};

export const ruleLabel = (rule) => rule.label ?? rule.families.map((f) => familyById[f]?.label ?? f).join(" ou ");

function verdictOf(score) {
  if (score >= 90) return "Excellente";
  if (score >= 75) return "Bonne";
  if (score >= 50) return "À renforcer";
  return "Faible";
}

// Une partie copiée d'une vraie page (famille « article ») mélange plusieurs
// sujets : on devine ce qu'elle contient d'après ses textes (fonctions.js).
// Une même partie peut compter pour plusieurs familles.
function familiesOf(item, index, sectionsById) {
  const section = sectionsById[item.type];
  const family = section?.meta?.family ?? null;
  if (!section?.meta?.pageSpecific) return family ? [family] : [];
  const text = Object.values(item.props ?? {})
    .filter(Array.isArray)
    .flat()
    .map((b) => `${b?.repere ?? ""} ${b?.text ?? ""}`)
    .join(" ")
    .replace(/<[^>]+>/g, " ");
  const found = familiesInText(text);
  if (index === 0) found.unshift("entete", "hero");
  return found;
}

// page : données Puck { root, content } ; sectionsById : sections du catalogue.
export function scorePage(page, sectionsById) {
  const root = page.root?.props ?? {};
  const type = pageTypeOf(root);
  if (!type) return { type: null };
  const content = page.content ?? [];
  const familiesAt = content.map((item, i) => familiesOf(item, i, sectionsById));
  const has = (fams) => (list) => list.some((f) => fams.includes(f));
  const rules = RULES[type.id] ?? [];
  const total = rules.reduce((n, r) => n + r.points, 0);

  const results = rules.map((rule, i) => {
    if (rule.check === "pageAchat") return { rule, ok: Boolean(String(root.pageAchat ?? "").trim()) };
    const ok = familiesAt.some(has(rule.families));
    if (ok) return { rule, ok };
    // Placement : après la dernière section présente qui la précède dans l'ordre
    // type ; sinon avant la première qui la suit ; sinon en fin de page.
    let index = null;
    let where = "à la fin de la page";
    for (let j = i - 1; j >= 0 && index === null; j--) {
      const fams = rules[j].families ?? [];
      const at = familiesAt.findLastIndex(has(fams));
      if (at >= 0) {
        const f = familiesAt[at].find((x) => fams.includes(x));
        index = at + 1;
        where = `après « ${familyById[f]?.label ?? f} »`;
      }
    }
    for (let j = i + 1; j < rules.length && index === null; j++) {
      const fams = rules[j].families ?? [];
      const at = familiesAt.findIndex(has(fams));
      if (at >= 0) {
        const f = familiesAt[at].find((x) => fams.includes(x));
        index = at;
        where = `avant « ${familyById[f]?.label ?? f} »`;
      }
    }
    return { rule, ok, index: index ?? content.length, where };
  });

  const points = results.filter((r) => r.ok).reduce((n, r) => n + r.rule.points, 0);
  const score = total ? Math.round((100 * points) / total) : 100;
  const missing = results.filter((r) => !r.ok).sort((a, b) => b.rule.points - a.rule.points);
  return {
    type,
    score,
    verdict: verdictOf(score),
    present: results.filter((r) => r.ok),
    missing: missing.map((r) => ({ ...r, gain: Math.round((100 * r.rule.points) / total) })),
  };
}
