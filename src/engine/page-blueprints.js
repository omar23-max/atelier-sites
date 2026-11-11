// Contenu attendu par type de page (2026-11-10).
//
// Une seule liste par type de page : celle du Page Score (RULES, page-score.js).
// Ce fichier y ajoute, section par section, CE QU'IL FAUT ÉCRIRE : les champs
// que les Fondations d'un projet remplissent (fondations.contenus[type][section]
// [champ]). Les mêmes lignes servent donc à quatre choses :
//   - le Score et les cadres « section manquante » (page-score.js, inchangé) ;
//   - les cartes « Contenu par type de page » des Fondations (Fondations.jsx) ;
//   - plus tard : « Remplir depuis les Fondations » dans l'éditeur ;
//   - plus tard : l'audit de fidélité aux Fondations.
//
// Sources : formation de Jeffrey Park (masterclass landing pages : système à deux
// pages, 5 croyances, mécanisme unique ; page produit : bloc d'achat en 7
// éléments, 6 images, 7 sections d'appui), skill landing-page-jeffrey-arsh.
// Règle de l'atelier : aucune preuve, aucun chiffre, aucun avis inventé. Ce qui
// manque s'écrit [MANQUE].
import { RULES, ruleLabel } from "./page-score.js";
import { zoneOfFamilies } from "./zones.js";

// Un champ : clé, libellé, aide (ce qu'on attend + un exemple), lignes.
const C = (k, label, hint, rows = 2) => ({ k, label, hint, rows });

// Types qui ont une carte dans les Fondations, dans l'ordre du parcours client.
export const TYPES_CONTENU = ["advertorial", "listicle", "comparatif", "landing", "offre", "produit", "accueil"];

// Fiche de chaque type : pour quel trafic, sa mission, ses règles d'or.
export const FICHES = {
  advertorial: {
    famille: "Pré-vente (trafic froid)",
    trafic: "Trafic froid : des gens qui ne connaissent pas la marque, venus d'une pub (Facebook, Instagram, native).",
    mission: "Faire 80 % de la persuasion avant la page d'achat : raconter le problème, faire découvrir le mécanisme, puis recommander le produit.",
    regles: [
      "Un article, pas une pub : titre de presse, signature, date, ton de témoignage ou d'enquête.",
      "Le produit n'apparaît qu'après le problème et la découverte du mécanisme.",
      "Un appel à l'action doux, façon recommandation, vers la page d'achat.",
      "Une page par angle : elle reprend l'accroche de la pub qui y mène.",
    ],
  },
  listicle: {
    famille: "Pré-vente (trafic froid à tiède)",
    trafic: "Trafic froid à tiède, surtout sur mobile (Facebook, TikTok, YouTube).",
    mission: "Réchauffer par une liste facile à parcourir : chaque raison lève un doute ou donne un bénéfice, puis renvoie vers la page d'achat.",
    regles: [
      "Un titre chiffré : « 7 raisons pour lesquelles… ».",
      "Chaque raison = un angle du projet : un titre-bénéfice, 2-3 phrases, une image.",
      "Un bouton vers la page d'achat toutes les 2-3 raisons, et une barre collante.",
      "Une seule page pour tous les angles.",
    ],
  },
  comparatif: {
    famille: "Pré-vente (visiteur qui compare)",
    trafic: "Trafic tiède : des gens qui connaissent le problème et hésitent entre plusieurs solutions.",
    mission: "Montrer, ligne par ligne, pourquoi ce produit gagne face aux autres solutions, puis renvoyer vers la page d'achat.",
    regles: [
      "Comparer à des types de solutions (crème de pharmacie, institut…), pas dénigrer une marque nommée sans preuve.",
      "5 à 8 lignes de comparaison, sur ce qui compte pour le client (résultat, délai, prix par usage, risque).",
      "Chaque avantage annoncé repose sur un fait du questionnaire.",
    ],
  },
  landing: {
    famille: "Vente (trafic froid à tiède)",
    trafic: "Trafic d'une pub précise, froid à tiède.",
    mission: "Longue page de vente : reprendre la promesse de la pub, installer les 5 croyances dans l'ordre, puis vendre sur la page même.",
    regles: [
      "Le titre répète la promesse de la pub (même mots, même angle).",
      "Ordre : problème → mécanisme → preuves → offre → garantie → FAQ.",
      "Pas de menu : une seule sortie, le bouton d'achat.",
      "Une page par angle.",
    ],
  },
  offre: {
    famille: "Vente (trafic tiède à chaud)",
    trafic: "Trafic tiède à chaud : après un advertorial ou un listicle, ou une pub de promotion.",
    mission: "Présenter UNE offre irrésistible (pack, réduction, cadeau) et faire acheter tout de suite.",
    regles: [
      "Une seule offre sur la page : pas de menu, pas d'autre produit.",
      "L'offre et son urgence dès le haut ; l'urgence doit être vraie (vraie date, vrai stock).",
      "La pile de valeur : tout ce qu'on reçoit, chiffré, face au prix payé.",
      "Urgence, garantie et avis juste avant le bouton.",
    ],
  },
  produit: {
    famille: "Vente (tout le trafic de la boutique)",
    trafic: "Trafic tiède à chaud : visiteurs de la boutique, e-mails, clients qui reviennent.",
    mission: "Faire passer un acheteur hésitant à « Ajouter au panier ». 80 % se joue dans le haut de page : images à gauche, bloc d'achat à droite.",
    regles: [
      "Ne pas réinventer la mise en page : images à gauche, bloc d'achat à droite.",
      "Les images racontent toute l'offre sans lire un mot (6 images).",
      "Un titre qui dit le résultat, pas le nom technique du produit.",
      "3 ou 4 choix au maximum (packs, variantes) ; le meilleur est coché d'avance.",
      "Des puces et des déroulants, jamais de longs paragraphes.",
    ],
  },
  accueil: {
    famille: "Marque (tout le trafic)",
    trafic: "Tout le monde : curieux, clients qui reviennent, gens qui ont tapé le nom de la marque.",
    mission: "Dire en 5 secondes ce que vend la marque, pour qui et pourquoi elle est différente, puis mener aux produits.",
    regles: [
      "Une page d'accueil ne convertit pas le trafic froid des pubs : elle oriente.",
      "Les best-sellers à un clic, en grille.",
      "Elle sert tous les angles : une seule page.",
    ],
  },
};

// ---- Champs par famille de section (valables pour tous les types) ----
const BASE = {
  bandeaux: [C("texte", "Le message de la barre", "Une phrase courte : livraison, garantie ou offre en cours. Ex. « Livraison offerte dès 60 $ · Garantie 30 jours ».", 1)],
  hero: [
    C("titre", "Titre", "Le résultat + le délai + la douleur levée. Ex. « Un cou plus ferme en 4 semaines, sans aiguille ».", 2),
    C("sousTitre", "Sous-titre", "Pour qui, et comment (le mécanisme en quelques mots).", 2),
    C("bouton", "Texte du bouton", "Un verbe + le bénéfice. Ex. « Essayer 30 jours sans risque ».", 1),
    C("reassurance", "Ligne de réassurance sous le bouton", "Note et nombre d'avis, garantie, livraison (seulement ce qui est coché en 4).", 1),
  ],
  probleme: [
    C("titre", "Titre", "La douleur dite avec les mots du client. Ex. « Vous évitez les cols ouverts ? ».", 1),
    C("douleurs", "Les 3 douleurs principales", "Une par ligne, avec les mots des clients (physique, émotionnelle, sociale, argent, temps).", 3),
    C("echecs", "Ce qu'ils ont essayé, et pourquoi ça n'a pas marché", "Ce n'est pas leur faute : il leur manquait une information.", 2),
  ],
  histoire: [
    C("accroche", "Ouverture", "Une scène ou une anecdote où le lecteur se reconnaît (2-3 phrases).", 3),
    C("recit", "Le récit", "Avant → le déclic → après. À la première personne ou façon enquête.", 4),
  ],
  solution: [
    C("titre", "Titre", "La découverte. Ex. « Le vrai problème n'est pas la peau, c'est… ».", 1),
    C("mecanismeProbleme", "Pourquoi les autres solutions échouent (mécanisme du problème)", "La vraie cause, que le client ne connaît pas encore.", 3),
    C("mecanismeSolution", "Pourquoi ce produit marche (mécanisme de la solution)", "L'élément unique qui règle cette cause. Reprend le mécanisme du message central.", 3),
  ],
  avantages: [C("benefices", "3 à 6 bénéfices", "Un par ligne : le bénéfice d'abord, la caractéristique ensuite. Ex. « Peau plus ferme en 4 semaines (peptide X à 5 %) ».", 5)],
  listicle: [C("raisons", "Les raisons", "Une par ligne : un titre-bénéfice + 2 phrases. Chaque raison reprend un angle du projet.", 8)],
  temoignages: [
    C("avis", "Les avis à mettre en avant", "De vrais avis, titrés par leur résultat, de clients qui ressemblent à la cible. Colle-les ici (prénom, texte). Aucun avis inventé.", 5),
    C("chiffre", "La note et le nombre d'avis", "Ex. « 4,7 / 5 sur 283 avis ». Seulement si c'est vrai.", 1),
  ],
  resultats: [
    C("calendrier", "À quoi s'attendre, et quand", "Ex. « Jour 1 : … · Semaine 2 : … · Semaine 4 : … ». Sans promesse non prouvée.", 3),
    C("avantApres", "Avant / après", "Lesquels, autorisés par les clients ? Sinon [MANQUE].", 1),
  ],
  comparatif: [
    C("autres", "Les autres solutions comparées", "2 ou 3 types de solutions (pas de marque dénigrée sans preuve). Ex. « crèmes de pharmacie, institut, injections ».", 2),
    C("lignes", "Les lignes du tableau", "Une par ligne : le critère, nous, les autres. Ex. « Prix par mois : 39 $ · 120 $ · 400 $ ».", 6),
  ],
  "mode-emploi": [C("etapes", "Les 3 étapes", "Une par ligne, très simples. Ex. « 1. Appliquer · 2. Masser 30 s · 3. Laisser agir ».", 3)],
  ingredients: [C("liste", "Ingrédients ou composants clés", "Un par ligne : le nom, ce qu'il fait, la dose si elle est prouvée.", 4)],
  expert: [C("autorite", "L'autorité", "Un expert (qui, titre, citation autorisée), la presse (média, citation) ou un chiffre vérifiable. Sinon [MANQUE].", 3)],
  garantie: [
    C("titre", "Titre", "La garantie précise. Ex. « 30 jours pour essayer, remboursé sinon ». Jamais « satisfaction garantie » tout court.", 1),
    C("texte", "Le texte", "Durée, conditions, comment demander le remboursement. Celle de l'offre (partie 5).", 2),
  ],
  bonus: [C("liste", "Les cadeaux inclus", "Un par ligne, avec sa valeur. Ceux de l'offre (partie 5).", 3)],
  offre: [
    C("titre", "Titre de l'appel à l'action", "Ex. « Prête à essayer ? ».", 1),
    C("texte", "Le rappel de l'offre", "Ce qu'on reçoit, le prix, la garantie, en 2 phrases.", 2),
    C("bouton", "Texte du bouton", "Ex. « Voir l'offre du jour ».", 1),
  ],
  packs: [
    C("titre", "Titre", "Ex. « Choisissez votre pack ».", 1),
    C("packs", "Les packs", "Ceux de l'offre (partie 5) : nom, prix, prix barré, économie, lequel est « le plus populaire ». 3 au maximum.", 4),
    C("urgence", "L'urgence (vraie)", "Date de fin réelle, stock réel, offre de bienvenue. Jamais de faux compte à rebours.", 1),
  ],
  "fiche-produit": [
    C("titre", "Titre du bloc d'achat", "Le résultat, pas le nom technique du produit.", 1),
    C("packs", "Les packs et le prix", "Ceux de l'offre (partie 5) : 3 choix au maximum, le meilleur coché d'avance.", 3),
    C("reassurances", "3 ou 4 réassurances sous le prix", "Une par ligne : garantie, livraison, sans engagement… (seulement ce qui est vrai).", 3),
  ],
  faq: [
    C("logistique", "Questions de livraison et de retour", "Délai, retours, pays livrés.", 3),
    C("produit", "Questions sur le produit", "Durée d'un pot, compatibilité, sécurité, différence avec les autres.", 3),
    C("objections", "Objections", "« Et si ça ne marche pas pour moi ? », « Pourquoi plus cher que… ? » : les 3 objections du message central, avec leur réponse.", 3),
  ],
  cta: [
    C("titre", "Titre de la conclusion", "Le résumé de la promesse.", 1),
    C("texte", "Le résumé de l'offre", "Ce qu'on reçoit + la garantie, en 2 phrases.", 2),
    C("bouton", "Texte du bouton", "", 1),
  ],
  collection: [
    C("titre", "Titre de la grille", "Ex. « Nos best-sellers ».", 1),
    C("produits", "Les produits à montrer", "3 à 5, un par ligne : nom + bénéfice en quelques mots.", 4),
  ],
  marque: [C("histoire", "L'histoire de la marque ou du fondateur", "Pourquoi cette marque existe : le problème vécu, le déclic, la mission. 3-5 phrases, vraies.", 4)],
  newsletter: [C("offre", "Ce qu'on offre contre l'e-mail", "Ex. « -10 % sur la première commande ».", 1)],
  confiance: [C("badges", "Les badges", "Seulement les vrais : paiement sécurisé, livraison, labels cochés en 4.", 1)],
  // Sans texte à préparer : entete, pied-de-page, sticky-atc.
};

// ---- Champs propres à un type de page (remplacent ceux de BASE) ----
const PAR_TYPE = {
  produit: {
    // Le bloc d'achat de Jeffrey : 7 éléments, plus les 6 images de la galerie.
    "fiche-produit": [
      C("badge", "1. Badge au-dessus du titre", "La différence en quelques mots. Ex. « Formulé par un chirurgien », « N° 1 au Québec », « Vu à la télé ». Seulement si c'est vrai.", 1),
      C("avis", "2. Étoiles et avis", "La note, le nombre d'avis, une citation courte. 4,6 sur 283 avis rassure plus que 5 sur 11.", 1),
      C("titre", "3. Titre", "Le résultat ou une citation de client, pas le nom technique. Ex. « Un cou plus ferme en 4 semaines » (le nom du produit en petit dessous).", 2),
      C("packs", "4. Abonnement ou packs", "Ceux de l'offre (partie 5). 3 choix au maximum ; le meilleur est coché d'avance.", 3),
      C("reassurances", "5. 3 ou 4 réassurances sous le prix", "Une par ligne. Ex. « 30 jours d'utilisation · Sans engagement · Remboursé si pas satisfaite · Livraison offerte dès 60 $ ».", 4),
      C("upsell", "6. Produit complémentaire (facultatif)", "Un seul, vraiment complémentaire, avec 15 à 25 % de réduction en lot.", 1),
      C("deroulants", "7. Les déroulants", "Titres des déroulants : bénéfices clés, composition, mode d'emploi, livraison et retours, questions fréquentes.", 3),
      C("images", "Les 6 images de la galerie", "Une par ligne : 1. Ce que c'est · 2. Ce que ça fait (problème → solution) · 3. Comment ça marche (étapes) · 4. Les résultats · 5. La différence avec les autres · 6. La garantie et les preuves.", 6),
    ],
    avantages: [
      C("titre", "Titre (4 mots au plus)", "La promesse principale. Ex. « Plus ferme en 4 semaines ».", 1),
      C("sousTitre", "Sous-titre (8 mots au plus)", "L'approche unique. Ex. « Formulé avec un peptide breveté ».", 1),
      C("benefices", "3 à 6 bénéfices", "Un par ligne, avec une coche. Le bénéfice, pas la caractéristique.", 5),
    ],
    solution: [
      C("titre", "Titre", "« Comment ça marche ».", 1),
      C("mecanismeSolution", "Pourquoi ce produit marche", "Le mécanisme du message central, en mots simples. Composition, formule ou technologie selon le produit.", 3),
    ],
  },
  advertorial: {
    hero: [
      C("titre", "Titre de l'article", "Curiosité ou problème, façon presse. Ex. « Pourquoi les femmes de plus de 50 ans abandonnent les crèmes de luxe ».", 2),
      C("chapeau", "Chapeau", "2 phrases qui donnent envie de lire, sans nommer le produit.", 2),
      C("signature", "Signature", "Auteur (vrai ou la rédaction), date. Mention « Publi-reportage ».", 1),
    ],
    histoire: [
      C("accroche", "Ouverture", "Un déclencheur émotionnel ou une anecdote où le lecteur se reconnaît.", 3),
      C("recit", "Le récit du problème", "Ce que la personne a vécu et essayé, du point de vue du lecteur.", 4),
    ],
    solution: [
      C("titre", "Intertitre", "La découverte.", 1),
      C("mecanismeProbleme", "La vraie cause (mécanisme du problème)", "Pourquoi ce qu'elle a essayé ne pouvait pas marcher.", 3),
      C("mecanismeSolution", "La découverte (mécanisme de la solution)", "Ce qui règle cette cause. Le produit n'est nommé qu'ici.", 3),
    ],
    offre: [
      C("titre", "Intertitre de la recommandation", "Ex. « Où le trouver ».", 1),
      C("texte", "La recommandation", "Ton de conseil, pas de vente : ce que c'est, pour qui, l'offre en cours (vraie).", 3),
      C("bouton", "Texte du lien ou du bouton", "Ex. « Vérifier la disponibilité ».", 1),
    ],
  },
  listicle: {
    hero: [
      C("titre", "Titre de la liste", "Chiffré. Ex. « 7 raisons pour lesquelles les femmes de 50 ans passent à… ».", 2),
      C("chapeau", "Chapeau", "1-2 phrases : à qui s'adresse la liste et ce qu'elle va apprendre.", 2),
    ],
    listicle: [C("raisons", "Les raisons (une par angle du projet)", "Une par ligne : numéro, titre-bénéfice, 2-3 phrases. 5 à 7 raisons pour un produit sous 60 $, jusqu'à 10 au-delà.", 10)],
  },
  comparatif: {
    hero: [
      C("titre", "Titre", "Le choix posé clairement. Ex. « Pourquoi [produit] plutôt qu'une crème de pharmacie ? ».", 2),
      C("sousTitre", "Sous-titre", "Ce que le visiteur va comparer, et la conclusion en une phrase.", 2),
    ],
    probleme: [
      C("titre", "Titre", "Ex. « Ce qu'on ne vous dit pas sur… ».", 1),
      C("echecs", "Ce qui ne va pas avec les autres solutions", "Une par ligne, avec les mots des clients (avis 1 à 3 étoiles des concurrents).", 4),
    ],
  },
  offre: {
    bandeaux: [C("texte", "L'offre et son urgence", "Ex. « -40 % jusqu'à dimanche minuit · Livraison offerte ». Urgence vraie seulement.", 1)],
    hero: [
      C("titre", "Titre", "La grande promesse + la transformation.", 2),
      C("offre", "L'offre en une ligne", "Ex. « 2 achetés = 1 offert » ou « -40 % aujourd'hui ».", 1),
      C("bouton", "Texte du bouton", "Ex. « Profiter de l'offre ».", 1),
      C("reassurance", "Sous le bouton", "Garantie, livraison, note des avis.", 1),
    ],
    probleme: [C("rappel", "Rappel court du problème", "2-3 phrases : problème, ce qu'il coûte, la solution arrive. Le visiteur est déjà réchauffé.", 3)],
  },
  accueil: {
    hero: [
      C("titre", "Titre", "Ce que vend la marque et sa différence. Ex. « Les soins du cou que les dermatologues recommandent ».", 2),
      C("sousTitre", "Sous-titre", "Pour qui.", 1),
      C("bouton", "Texte du bouton", "Vers les produits. Ex. « Voir les best-sellers ».", 1),
    ],
    avantages: [C("atouts", "Pourquoi cette marque (3 ou 4 atouts)", "Un par ligne : ce que la marque fait que les autres ne font pas.", 4)],
    histoire: [C("histoire", "L'histoire de la marque ou du fondateur", "Pourquoi cette marque existe : le problème vécu, le déclic, la mission. 3-5 phrases, vraies.", 4)],
    faq: [C("questions", "Questions fréquentes", "Sur la marque, la livraison, les retours.", 4)],
  },
};

// Les sections attendues d'un type, dans l'ordre, avec leurs champs.
// key : la première famille de la règle (unique dans chaque type).
export function blueprintOf(type) {
  return (RULES[type] ?? [])
    .filter((rule) => rule.families)
    .map((rule) => {
      const key = rule.families[0];
      return {
        key,
        label: ruleLabel(rule),
        why: rule.why,
        families: rule.families,
        points: rule.points,
        zone: zoneOfFamilies(rule.families),
        champs: PAR_TYPE[type]?.[key] ?? BASE[key] ?? [],
      };
    });
}

// Brief d'une section de page, tiré des Fondations (étape 3, 2026-11-10) :
// les sections du plan de ce type de page qui correspondent aux familles de la
// section (une copie de page peut en couvrir plusieurs), avec leurs champs
// remplis. Vide si le type n'a pas de carte, si aucune famille ne correspond ou
// si rien n'est rempli. contenus = fondations.contenus du projet.
export function briefFor(type, families = [], contenus = {}) {
  const c = contenus?.[type] ?? {};
  const out = [];
  for (const s of blueprintOf(type)) {
    if (!s.families.some((f) => families.includes(f))) continue;
    const champs = s.champs.map((ch) => ({ label: ch.label, valeur: String(c[s.key]?.[ch.k] ?? "").trim() })).filter((ch) => ch.valeur);
    if (champs.length) out.push({ key: s.key, label: s.label, why: s.why, zone: s.zone, champs });
  }
  return out;
}

// Avancement d'une carte : champs remplis / champs à remplir.
export function contenuProgress(contenus, type) {
  const c = contenus?.[type] ?? {};
  let done = 0;
  let total = 0;
  for (const s of blueprintOf(type)) {
    for (const ch of s.champs) {
      total++;
      if (String(c[s.key]?.[ch.k] ?? "").trim()) done++;
    }
  }
  return { done, total };
}
