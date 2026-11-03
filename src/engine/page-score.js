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

// Règles alignées sur le skill landing-page-jeffrey-arsh (references/atelier-sites.md,
// « Ordre recommandé par type de page ») : dans l'ordre où les sections
// apparaissent, les plus importantes avec le plus de points.
export const RULES = {
  produit: [
    R("bandeaux", 3, "Une barre d'annonce (livraison offerte, garantie) rassure dès la première seconde."),
    R("entete", 4, "Logo et panier : le visiteur sait où il est."),
    R("fiche-produit", 16, "Le bloc d'achat : galerie, étoiles et nombre d'avis, prix, packs, bouton. Indispensable ici."),
    R("confiance", 4, "Badges de paiement, livraison et garantie juste sous le bouton d'achat."),
    R(["avantages", "listicle"], 6, "Les bénéfices (pas les caractéristiques) en un coup d'œil."),
    R("temoignages", 10, "Des avis titrés par leur résultat, de clients qui ressemblent à la cible (croyance 4)."),
    R("solution", 8, "Le mécanisme : pourquoi ce produit marche là où les autres ont échoué (croyance 3)."),
    R("probleme", 4, "Nommer la douleur du client : il se reconnaît (croyance 2)."),
    R("ingredients", 5, "Ce qu'il y a dedans : transparence et crédibilité."),
    R("mode-emploi", 4, "3 étapes simples : enlève la peur que ce soit compliqué."),
    R("resultats", 6, "À quoi s'attendre et quand : avant/après, calendrier des résultats."),
    R("comparatif", 6, "Nous contre les autres : pourquoi choisir ce produit."),
    R(["expert", "chiffres", "presse"], 4, "Autorité : un expert, des chiffres, la presse (avec une citation)."),
    R("garantie", 8, "Une garantie forte, près du prix : le visiteur ne risque rien (croyance 5)."),
    R("faq", 6, "Les dernières objections, écrites à partir des peurs du client."),
    R("sticky-atc", 3, "Une barre d'achat collante sur mobile : le bouton reste à portée de pouce."),
    R("pied-de-page", 3, "Liens, mentions légales, contact : sérieux et confiance."),
  ],
  landing: [
    R("entete", 3, "Logo seul, sans menu qui distrait."),
    R("hero", 12, "Un titre qui reprend la promesse de la pub : résultat + délai + douleur levée."),
    R("probleme", 10, "Nommer la douleur du profil visé et ses échecs passés (croyance 2)."),
    R("solution", 10, "Le mécanisme : pourquoi ça marche quand le reste a échoué (croyance 3)."),
    R(["avantages", "listicle"], 5, "Les bénéfices concrets pour ce profil."),
    R("temoignages", 10, "Des avis de gens qui ressemblent au visiteur (croyance 4)."),
    R("resultats", 6, "Le calendrier des résultats."),
    R("comparatif", 6, "Nous contre les autres solutions."),
    R("mode-emploi", 4, "3 étapes simples : l'effort paraît minime."),
    R(["expert", "presse", "chiffres"], 5, "Un expert, la presse ou des chiffres qui valident."),
    R(["fiche-produit", "offre", "packs"], 16, "Le bloc d'achat : prix, packs, bouton. Indispensable sur une page d'achat."),
    R("garantie", 8, "Une garantie forte retire le risque (croyance 5)."),
    R("faq", 6, "Les dernières objections."),
    R("cta", 5, "Une conclusion : le résumé de l'offre et un dernier bouton."),
    R("pied-de-page", 3, "Mentions légales et contact."),
  ],
  accueil: [
    R("bandeaux", 4, "Livraison offerte, garantie : le message clé en haut."),
    R("entete", 8, "Menu, logo, panier : la navigation du site."),
    R("hero", 15, "La différence de la marque, pour qui, avec un bouton vers les produits."),
    R("collection", 14, "3 à 5 best-sellers en grille (pas en carrousel), à un clic."),
    R("temoignages", 10, "Des avis clients : la preuve sociale tout de suite après les produits."),
    R(["avantages", "listicle"], 8, "Pourquoi cette marque : ses atouts (USP)."),
    R(["histoire", "marque"], 6, "L'histoire de la marque ou du fondateur : autorité et attachement."),
    R("confiance", 5, "Labels, presse, paiement sécurisé."),
    R("garantie", 4, "La garantie de la marque."),
    R("newsletter", 6, "Récupérer l'e-mail des visiteurs qui n'achètent pas tout de suite."),
    R("faq", 4, "Questions fréquentes sur la marque, la livraison."),
    R("pied-de-page", 8, "Liens, mentions, contact."),
  ],
  advertorial: [
    R("entete", 3, "Un en-tête discret, façon site d'information."),
    R("hero", 10, "Un titre d'article qui accroche le profil visé (curiosité ou problème)."),
    R(["histoire", "probleme"], 12, "L'histoire du problème, du point de vue du lecteur (croyances 1 et 2)."),
    R("solution", 12, "La découverte : le mécanisme qui change tout (croyance 3)."),
    R(["expert", "presse"], 6, "Un expert ou un média qui confirme."),
    R("temoignages", 10, "Des témoignages de lecteurs comme lui (croyance 4)."),
    R("resultats", 6, "Ce qui change, et quand."),
    R("listicle", 4, "Une liste de raisons (« 5 raisons… ») : facile à parcourir, elle relance l'envie."),
    R("comparatif", 4, "Pourquoi ce produit plutôt que les autres solutions."),
    R("offre", 15, "L'appel à l'action vers la page d'achat (offre limitée, bouton)."),
    R("garantie", 6, "Rappeler la garantie avant le clic (croyance 5)."),
    R("faq", 3, "Quelques réponses aux doutes."),
    R("pied-de-page", 3, "Mentions légales."),
    PAGE_LINK,
  ],
  listicle: [
    R("entete", 3, "Un en-tête discret."),
    R("hero", 10, "Le titre de la liste (« 7 raisons… ») adapté au profil visé."),
    R(["listicle", "avantages"], 15, "La liste elle-même : chaque raison avec une image et un bénéfice."),
    R("temoignages", 10, "Des avis de clients (croyance 4)."),
    R("comparatif", 6, "Le produit face aux autres solutions."),
    R(["expert", "presse"], 4, "Un avis d'expert ou un média."),
    R("offre", 15, "L'appel à l'action vers la page d'achat."),
    R("garantie", 6, "La garantie avant le clic (croyance 5)."),
    R("faq", 4, "Les doutes les plus fréquents."),
    R("pied-de-page", 3, "Mentions légales."),
    PAGE_LINK,
  ],
  offre: [
    R("bandeaux", 5, "L'offre et son urgence dès le haut : -50 %, cadeau, compte à rebours."),
    R("hero", 12, "La promesse et l'offre en un coup d'œil, avec le bouton."),
    R("probleme", 4, "Un rappel court du problème : on achète une solution, pas un produit."),
    R(["avantages", "solution", "listicle"], 6, "Pourquoi ce produit, et comment il agit."),
    R("temoignages", 12, "Des avis : la preuve que l'offre vaut le coup (croyance 4)."),
    R(["packs", "fiche-produit", "offre"], 18, "Le choix du pack et le prix barré : c'est le cœur de la page."),
    R("bonus", 5, "Les cadeaux inclus, chiffrés : la pile de valeur fait monter la valeur perçue."),
    R("comparatif", 5, "Le prix ici contre ailleurs, ou nous contre les autres."),
    R("garantie", 10, "Une garantie forte, près du prix, retire le dernier risque (croyance 5)."),
    R("confiance", 4, "Paiement sécurisé, livraison, labels."),
    R("faq", 6, "Livraison, abonnement, résiliation : les questions d'avant l'achat."),
    R("cta", 4, "Une conclusion qui résume l'offre, avec un dernier bouton."),
    R("sticky-atc", 3, "Une barre d'achat collante sur mobile."),
    R("pied-de-page", 3, "Mentions légales et contact."),
  ],
  collection: [
    R("bandeaux", 3, "Livraison offerte, promotion en cours."),
    R("entete", 8, "Menu, logo, panier."),
    R("hero", 10, "Le thème de la collection en une phrase."),
    R("collection", 25, "La grille de produits ou de packs, avec prix et ajout au panier."),
    R(["avantages", "listicle"], 6, "Ce qui rend la gamme différente."),
    R("temoignages", 10, "Des avis sur la gamme."),
    R("confiance", 6, "Labels, paiement sécurisé."),
    R("faq", 5, "Les questions sur les produits et la livraison."),
    R("pied-de-page", 6, "Liens, mentions, contact."),
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
    // Méthode du skill : les 5 croyances et les textes à reprendre.
    beliefs: beliefsOf(page, sectionsById),
    texts: textChecks(page, sectionsById),
  };
}

// ---- Les 5 croyances (skill landing-page-jeffrey-arsh, copy-toolkit.md §1) ----
// S'il en manque une seule, le visiteur hésite ou part. Chacune est installée
// par certaines familles de sections ; la première de la liste est celle à
// ajouter quand aucune n'est là.
export const BELIEFS = [
  { n: 1, label: "« C'est pour quelqu'un comme moi »", how: "Nommer le profil visé dans le titre et l'histoire, avec ses mots.", families: ["hero", "histoire", "probleme", "temoignages"] },
  { n: 2, label: "« J'ai ce problème »", how: "Nommer le symptôme et révéler la cause (problème, histoire).", families: ["probleme", "histoire", "article"] },
  { n: 3, label: "« Ce produit peut le résoudre »", how: "Le mécanisme, les ingrédients, l'avis d'un expert, un comparatif.", families: ["solution", "ingredients", "expert", "comparatif", "details-produit", "chiffres"] },
  { n: 4, label: "« Ça marchera pour moi »", how: "Des avis de clients qui ressemblent à la cible, des avant/après.", families: ["temoignages", "resultats", "video", "galerie"] },
  { n: 5, label: "« Je ne risque rien à essayer »", how: "Une garantie forte, près du prix ; livraison et retours faciles.", families: ["garantie", "confiance", "livraison"] },
];

// ---- Contrôles des textes (skill : copy-toolkit.md §2, §6, §7) ----
const plain = (t) => String(t ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
// Titres-étiquettes : le titre dit ce qu'est la section au lieu d'un bénéfice.
const LABEL_TITLES = /^(nos |our |les |the )?(avis( clients)?|t[ée]moignages?|testimonials?|reviews?|customer reviews|ce que disent nos clients|what (our )?customers say|faq|questions? fr[ée]quentes?|frequently asked questions|ingr[ée]dients?|ingredients|caract[ée]ristiques|features|avantages|benefits|comment [çc]a marche|how it works|notre histoire|our story|[àa] propos|about( us)?|garantie|guarantee|r[ée]sultats|results|description|d[ée]tails|details|specifications|comparaison|comparison|produits?|products?|collection|nouveaut[ée]s)\s*[:.!]?$/i;
// Boutons qui ne disent pas ce qu'on obtient.
const GENERIC_BUTTONS = /^(en savoir plus|learn more|read more|lire la suite|voir plus|see more|d[ée]couvrir|discover|cliquez ici|click here|soumettre|submit|envoyer|send|acheter|buy|buy now|acheter maintenant|order now|commander|shop now|continuer|continue|ok)\s*[›>→»!.]*$/i;
// Ce qui rassure sous un bouton : garantie, livraison, essai, avis, sécurité.
const REASSURANCE = /garanti|guarantee|rembours|money.?back|livraison|shipping|offert|gratuit|free|sans engagement|cancel|annul|risque|risk|retour|return|essai|trial|s[ée]cur|secure|★|⭐|avis|reviews?|clients? satisfaits|satisfied/i;
// Bouton d'achat (et pas un bouton d'accordéon ou de menu).
const PURCHASE = /achet|panier|commander|essa(i|y)|profit|obten|r[ée]serv|buy|cart|order|shop|get |try|claim|add to|checkout|% ?off|-\s?\d+ ?%/i;
const NAV_FAMILIES = new Set(["entete", "pied-de-page", "newsletter"]);
const CTA_FAMILIES = new Set(["hero", "fiche-produit", "offre", "packs", "cta"]);

export function textChecks(page, sectionsById) {
  const out = [];
  let consignes = 0;
  let firstConsigne = null;
  for (const [index, item] of (page.content ?? []).entries()) {
    const section = sectionsById[item.type];
    // Partie copiée d'une page : ses familles sont devinées d'après ses textes.
    const fams = familiesOf(item, index, sectionsById);
    const buying = fams.some((x) => CTA_FAMILIES.has(x));
    // En-tête, pied de page, newsletter (famille, ou nom de la partie copiée).
    const name = (section?.meta?.label ?? item.type).split(" — ")[0];
    const nav = (fams.length > 0 && fams.every((x) => NAV_FAMILIES.has(x))) || /^(header|footer|nav|en-t[êe]te|pied)/i.test(name);
    const blocks = Object.values(item.props ?? {})
      .filter(Array.isArray)
      .flat()
      .filter((b) => b && typeof b === "object");
    blocks.forEach((b, i) => {
      const role = String(b.repere ?? "").split(" · ")[0];
      const text = plain(b.text);
      if (!text) return;
      if (/\[[^\]]{3,}\]/.test(text)) {
        consignes++;
        firstConsigne ??= { sectionId: item.props.id, name };
      }
      if (/^Titre H[1-3]/.test(role) && text.split(" ").length <= 5 && LABEL_TITLES.test(text))
        out.push({ kind: "titre", sectionId: item.props.id, name, text, fix: "Titre-étiquette : écris plutôt un bénéfice ou un résultat (« Ce que 2 000 mamans ont gagné en 30 jours »)." });
      if (!nav && /^Bouton|^Lien/.test(role) && GENERIC_BUTTONS.test(text) && (role.startsWith("Bouton") || buying))
        out.push({ kind: "bouton", sectionId: item.props.id, name, text, fix: "Le bouton doit dire ce qu'on obtient (« Essayer sans risque », « Profiter de -20 % »)." });
      // Réassurance : un des 3 textes qui suivent le bouton principal d'une section d'achat.
      if (role.startsWith("Bouton") && buying && PURCHASE.test(text) && !out.some((x) => x.kind === "reassurance" && x.sectionId === item.props.id)) {
        const after = blocks.slice(i + 1, i + 4).map((x) => plain(x.text)).join(" ");
        const before = blocks.slice(Math.max(0, i - 1), i).map((x) => plain(x.text)).join(" ");
        if (!REASSURANCE.test(after) && !REASSURANCE.test(before))
          out.push({ kind: "reassurance", sectionId: item.props.id, name, text, fix: "Ajoute une ligne de réassurance sous le bouton : garantie, livraison offerte, sans engagement, ou un chiffre (« 4,8/5 sur 2 000 avis »)." });
      }
    });
  }
  if (consignes) out.unshift({ kind: "consignes", ...firstConsigne, text: `${consignes} texte(s)`, fix: `${consignes} consigne(s) entre crochets à remplacer par de vrais textes (✨ IA → Réécrire pour mon produit).` });
  return out;
}

// Croyances installées par la page : par quelles sections, ou laquelle ajouter.
export function beliefsOf(page, sectionsById) {
  const content = page.content ?? [];
  const familiesAt = content.map((item, i) => familiesOf(item, i, sectionsById));
  return BELIEFS.map((b) => {
    const by = [];
    familiesAt.forEach((fams, i) => {
      const f = fams.find((x) => b.families.includes(x));
      if (f) by.push({ sectionId: content[i].props.id, family: f });
    });
    return { ...b, ok: by.length > 0, by };
  });
}
