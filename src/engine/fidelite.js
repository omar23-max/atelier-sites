// Fidélité d'une page aux Fondations de son projet (étape 4, 2026-11-10).
//
// Contrôle local et immédiat, sans IA, qui marche quelle que soit la langue de
// la page (les Fondations sont souvent en français, la page en anglais) :
//   - chiffres : tout nombre « qui engage » (prix, %, durée, nombre d'avis, dose)
//     écrit sur la page mais absent des Fondations → à vérifier (preuve inventée
//     par l'IA, reste du site d'origine, ou vrai chiffre à ajouter aux Fondations) ;
//   - notes oubliées : « [MANQUE …] » ou « [À VALIDER …] » restés dans la page ;
//   - contenu prêt sans section : une section du plan a du contenu dans les
//     Fondations, mais la page n'a aucune section de cette famille ;
//   - couverture : combien de sections de la page ont un contenu prévu.
// Le fond (promesse reprise, mécanisme, objections traitées) est jugé par
// l'audit IA (« Auditer la page »), qui reçoit les mêmes Fondations.
import { familiesOf } from "./page-score.js";
import { TYPES_CONTENU, blueprintOf, briefFor } from "./page-blueprints.js";

const plain = (html) =>
  String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// « 58.00 » → 58 ; « 1,28 » → 1.28 ; « 1,200 » ou « 250 000 » → 1200, 250000.
function numberOf(token) {
  let t = token.replace(/[\s  ]/g, "");
  t = t.replace(/[.,](?=\d{3}(\D|$))/g, ""); // séparateur de milliers
  t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : null;
}

const NUMBER = /\d+(?:[\s  .,]\d+)*/g;
// Ce qui fait d'un nombre un engagement : monnaie, pourcentage, durée, quantité
// d'avis ou de clients, dose, note sur 5.
const UNIT_AFTER = /^[\s-]?(%|\$|€|£|\+|k\b|x\b|mg\b|g\b|ml\b|\/ ?5|★|⭐|(excellent|out of|sur 5|rated|rating|great|trustpilot|jours?|days?|semaines?|weeks?|mois|months?|ans|years?|heures?|hours?|minutes?|avis|reviews?|ratings?|étoiles?|stars?|clients?|customers?|personnes|people|users?|utilisateurs?|gélules?|capsules?|flacons?|bottles?|commandes?|orders?|vendus?|sold|études?|studies|brevets?|patents?)\b)/i;
const UNIT_BEFORE = /(\$|€|£|-|save|économisez|only|seulement|just)\s?$/i;

// Nature d'un chiffre d'après ce qui l'entoure (audit T1, 2026-11-17) : un
// prix de 30 $ n'autorise pas une « garantie de 30 jours ». null = inconnue.
export function kindOf(after = "", before = "") {
  const a = String(after);
  const b = String(before);
  if (/^\s?%/.test(a)) return "pourcent";
  if (/^\s?(\$|€|£|k?\s?(usd|eur|cad)\b)/i.test(a) || /(\$|€|£)\s?$/.test(b)) return "argent";
  if (/^\s?(\/ ?5|★|⭐|(sur 5|out of 5|stars?|étoiles?|rated|rating)\b)/i.test(a)) return "note";
  if (/^[\s-]?(jours?|days?|semaines?|weeks?|mois|months?|ans|years?|heures?|hours?|h\b|minutes?|min\b|nuits?|nights?)/i.test(a)) return "duree";
  if (/^[\s-]?(mg|g|ml|kg|gélules?|capsules?|comprimés?|tablets?|flacons?|bottles?|servings?|portions?)\b/i.test(a)) return "dose";
  if (/^\s?(x|fois|times)\b/i.test(a)) return "fois";
  if (/^\s?(\+|k\b|avis|reviews?|ratings?|clients?|customers?|personnes|people|users?|utilisateurs?|commandes?|orders?|vendus?|sold|études?|studies|brevets?|patents?)/i.test(a)) return "nombre";
  if (/(save|économisez|only|seulement|just)\s?$/i.test(b)) return "argent";
  return null;
}

// Nature d'un champ des Fondations d'après son nom (prix, garantie…), quand
// le texte lui-même ne la dit pas (« garantie : 30 »).
const KEY_KINDS = [
  [/^(prix|price|montant|co[uû]t|tarif|packs?)$/i, "argent"],
  [/^(garantie|d[ée]lai|dur[ée]e|livraison|retours?|essai|cure)$/i, "duree"],
  [/^(avis|reviews?|ventes|vendus|clients)$/i, "nombre"],
  [/^(note|rating|[ée]toiles)$/i, "note"],
  [/^(pourcentage|taux|remise|r[ée]duction|rabais)$/i, "pourcent"],
];
const kindOfPath = (path) => {
  for (const seg of [...path].reverse()) for (const [re, k] of KEY_KINDS) if (re.test(seg)) return k;
  return null;
};

// Faits chiffrés connus : nombre → natures (« ? » = nature inconnue, accepte tout).
class Faits {
  constructor() {
    this.map = new Map();
  }
  add(n, kind) {
    if (!this.map.has(n)) this.map.set(n, new Set());
    this.map.get(n).add(kind || "?");
  }
  has(n) {
    return this.map.has(n);
  }
  knows(fig) {
    const k = this.map.get(fig.n);
    return Boolean(k && (k.has("?") || !fig.kind || k.has(fig.kind)));
  }
}

function addFacts(faits, v, path = []) {
  if (v == null) return;
  if (typeof v === "string" || typeof v === "number") {
    const text = String(v);
    for (const m of text.matchAll(NUMBER)) {
      const n = numberOf(m[0]);
      if (n == null) continue;
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
      const before = text.slice(Math.max(0, m.index - 12), m.index);
      faits.add(n, kindOf(after, before) ?? kindOfPath(path));
    }
    return;
  }
  if (Array.isArray(v)) return v.forEach((x) => addFacts(faits, x, path));
  if (typeof v === "object") for (const [k, x] of Object.entries(v)) addFacts(faits, x, [...path, k]);
}

// Tous les chiffres connus du projet, avec leur nature : Fondations
// (questionnaire, résultats, message central, cartes du type de page), offre,
// fiche de la page.
export function knownNumbers(project, root = {}) {
  const f = project?.fondations ?? {};
  const faits = new Faits();
  addFacts(faits, { reponses: f.reponses, resultats: f.resultats, message: f.message, contenus: f.contenus?.[root.pageType], offre: project?.offre, produit: project?.produit, description: project?.description, infos: root.infos, fiche: root.produit });
  return faits;
}
const knowsFig = (known, fig) => (known?.knows ? known.knows(fig) : known?.has?.(fig.n));

// Les nombres « qui engagent » d'un texte (suivis ou précédés d'une unité) :
// [{ n: forme normalisée, valeur: tel qu'écrit, index, after }].
export function figuresIn(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(NUMBER)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (!UNIT_AFTER.test(after) && !UNIT_BEFORE.test(before)) continue;
    const n = numberOf(m[0]);
    if (n == null) continue;
    // Années : pas des preuves. « 100 % » en est une à vérifier (audit T1).
    if (/^(19|20)\d\d$/.test(n) && !/^\s?(%|\$|€)/.test(after)) continue;
    out.push({ n, kind: kindOf(after, before), valeur: m[0], index: m.index, after });
  }
  return out;
}

// Garde-fou de « Remplir depuis les Fondations » : un texte écrit par l'IA
// contient-il un chiffre qui engage et qui n'est nulle part dans le projet ?
export function hasUnknownFigure(html, known) {
  return figuresIn(plain(html)).some((f) => !knowsFig(known, f));
}

// Nombres d'un texte libre (brief envoyé à l'IA), à ajouter aux nombres connus.
export function numbersOfText(text) {
  const out = new Set();
  for (const m of String(text ?? "").matchAll(NUMBER)) {
    const n = numberOf(m[0]);
    if (n != null) out.add(n);
  }
  return out;
}

const isNav = (name, fams) => /^(header|footer|nav|en-?t[êe]te|pied|menu)/i.test(name) || (fams.length > 0 && fams.every((x) => ["entete", "pied-de-page", "newsletter"].includes(x)));

// page : données Puck { root, content } ; project : projets/<id>.json.
export function localFidelity(page, sectionsById, project) {
  const root = page.root?.props ?? {};
  const type = root.pageType ?? "";
  const contenus = project?.fondations?.contenus ?? {};
  const known = knownNumbers(project, root);
  const chiffres = [];
  const notes = [];
  const seen = new Set();
  const famsOnPage = new Set();
  let avecContenu = 0;
  let sectionsUtiles = 0;

  for (const [index, item] of (page.content ?? []).entries()) {
    const section = sectionsById[item.type];
    const fams = familiesOf(item, index, sectionsById);
    const name = (section?.meta?.label ?? item.type).split(" — ")[0];
    const nav = isNav(name, fams);
    if (!nav) {
      fams.forEach((x) => famsOnPage.add(x));
      sectionsUtiles++;
      if (briefFor(type, fams, contenus).length) avecContenu++;
    }
    const texts = Object.values(item.props ?? {})
      .filter(Array.isArray)
      .flat()
      .filter((b) => b && typeof b === "object")
      .map((b) => plain(b.text))
      .filter(Boolean);
    for (const text of texts) {
      if (/\[\s*(MANQUE|À VALIDER|A VALIDER)/i.test(text)) notes.push({ sectionId: item.props.id, name, text: text.slice(0, 90) });
      if (nav) continue;
      for (const fig of figuresIn(text)) {
        if (knowsFig(known, fig) || seen.has(`${fig.n}|${fig.kind}`)) continue;
        seen.add(`${fig.n}|${fig.kind}`);
        const from = Math.max(0, fig.index - 28);
        const to = fig.index + fig.valeur.length + 30;
        chiffres.push({ sectionId: item.props.id, name, valeur: fig.valeur, extrait: `${from ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}` });
      }
    }
  }

  // Contenu prêt dans les Fondations, mais aucune section de cette famille.
  const sansSection = TYPES_CONTENU.includes(type)
    ? blueprintOf(type)
        .filter((s) => s.champs.length && !s.families.some((x) => famsOnPage.has(x)) && briefFor(type, s.families, contenus).length)
        .map((s) => s.label)
    : [];

  return {
    aCarte: TYPES_CONTENU.includes(type),
    carteRemplie: TYPES_CONTENU.includes(type) && Object.keys(contenus[type] ?? {}).length > 0,
    couverture: { avecContenu, total: sectionsUtiles },
    chiffres,
    notes,
    sansSection,
  };
}

// Ce que l'audit IA reçoit des Fondations (court : il lit la page à côté).
export function fondationsPourAudit(project, type) {
  const f = project?.fondations ?? {};
  const strip = (v) => String(v ?? "").replace(/\[(MANQUE|À VALIDER)[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  const preuves = Object.entries(f.reponses?.preuves ?? {})
    .filter(([, p]) => p?.oui)
    .map(([k, p]) => ({ preuve: k, detail: strip(p.detail), manque: /\[MANQUE/.test(p.detail ?? "") }));
  const m = f.message ?? {};
  const o = project?.offre ?? {};
  const prevu = TYPES_CONTENU.includes(type)
    ? blueprintOf(type)
        .map((s) => ({ section: s.label, contenu: s.champs.map((ch) => strip(f.contenus?.[type]?.[s.key]?.[ch.k])).filter(Boolean).join(" | ").slice(0, 500) }))
        .filter((s) => s.contenu)
    : [];
  return {
    messageCentral: { promesse: strip(m.promesse), mecanisme: strip(m.mecanisme), preuves: (m.preuves ?? []).map(strip).filter(Boolean), objections: (m.objections ?? []).filter((x) => x?.objection).map((x) => ({ objection: strip(x.objection), reponse: strip(x.reponse) })) },
    preuvesAutorisees: preuves,
    offre: { prix: strip(o.prix), packs: strip(o.packs), garantie: strip(o.garantie), bonus: strip(o.bonus), urgence: strip(o.urgence) },
    interdits: strip(f.resultats?.notes).slice(0, 1500),
    contenuPrevu: prevu,
  };
}
