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
import { MARQUEUR, realText, withoutResearch } from "./fondations-etat.js";
import { faitsDeFiche } from "./offre-fiche.js";

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

// Unité d'un chiffre (audit ChatGPT F02, 2026-11-17) : « 30 jours » ne
// couvre pas « 30 mois », « 30 USD » pas « 30 € », « 1000 mg » pas « 1000 g ».
// Ramenée à une unité de base quand la conversion est sûre (1000 mg = 1 g,
// 2 semaines = 14 jours). null = pas d'unité lisible.
// Fin de mot qui tient compte des accents : « gélules » n'est pas « g ».
const U = (body) => new RegExp(`^[\\s-]?(?:${body})(?![\\p{L}\\d])`, "iu");
const UNITS = [
  [U("jours?|days?"), { u: "jour", f: 1 }],
  [U("semaines?|weeks?"), { u: "jour", f: 7 }],
  [U("mois|months?"), { u: "mois" }],
  [U("ans?|années?|years?"), { u: "an" }],
  [U("heures?|hours?|h"), { u: "minute", f: 60 }],
  [U("minutes?|min"), { u: "minute", f: 1 }],
  [U("nuits?|nights?"), { u: "nuit" }],
  [U("gélules?|capsules?|comprimés?|tablets?|pills?"), { u: "gelule" }],
  [U("flacons?|bottles?|pots?|jars?"), { u: "flacon" }],
  [U("servings?|portions?|doses?"), { u: "portion" }],
  [U("mg|milligrammes?"), { u: "mg", f: 1 }],
  [U("g|grammes?|grams?"), { u: "mg", f: 1000 }],
  [U("kg|kilos?"), { u: "mg", f: 1e6 }],
  [U("ml|millilitres?"), { u: "ml", f: 1 }],
  [U("l|litres?|liters?"), { u: "ml", f: 1000 }],
];
export function unitOf(after = "", before = "") {
  const a = String(after).toLowerCase();
  const b = String(before).toLowerCase();
  if (/^\s?(us\s?\$|\$\s?us(?![\p{L}])|usd(?![\p{L}]))/u.test(a) || /us\s?\$\s?$/.test(b)) return { u: "usd" };
  if (/^\s?(ca\s?\$|\$\s?ca(?![\p{L}])|cad(?![\p{L}]))/u.test(a) || /ca\s?\$\s?$/.test(b)) return { u: "cad" };
  if (/^\s?(€|eur(?:os?)?(?![\p{L}]))/u.test(a) || /€\s?$/.test(b)) return { u: "eur" };
  if (/^\s?(£|gbp(?![\p{L}]))/u.test(a) || /£\s?$/.test(b)) return { u: "gbp" };
  if (/^\s?\$/.test(a) || /\$\s?$/.test(b)) return { u: "$" };
  for (const [re, unit] of UNITS) if (re.test(a)) return unit;
  return null;
}
const moneyOk = (a, b) => a === b || (a === "$" && (b === "usd" || b === "cad")) || (b === "$" && (a === "usd" || a === "cad"));
const base = (n, unit) => (unit?.f ? String(Number(n) * unit.f) : n);

// Faits chiffrés connus. Chaque entrée : nombre (ramené à l'unité de base),
// nature, unité, origine (« fait » typé validé ou « texte » des Fondations).
// Un fait « à confirmer » ou « retiré » bloque le même chiffre écrit dans un
// texte (audit F02 : le texte brut n'autorise pas un fait non validé).
class Faits {
  constructor() {
    this.map = new Map();
    this.blocked = [];
  }
  add(n, kind, unit = null, origin = "texte") {
    const key = base(n, unit);
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push({ kind: kind || null, u: unit?.u ?? null, origin });
  }
  block(n, kind, unit = null) {
    this.blocked.push({ n: base(n, unit), kind, u: unit?.u ?? null });
  }
  has(n) {
    return this.map.has(n);
  }
  static match(e, fig, fu) {
    // Nature : un texte sans nature lisible n'autorise que des chiffres sans
    // nature (audit F02, plus de joker « ? »).
    if (e.kind ? fig.kind && e.kind !== fig.kind : fig.kind) return false;
    if (e.u && fu && !(e.u === fu || moneyOk(e.u, fu))) return false;
    return true;
  }
  knows(fig) {
    const fu = fig.unit?.u ?? null;
    const key = base(fig.n, fig.unit);
    const list = this.map.get(key) ?? [];
    if (list.some((e) => e.origin === "fait" && Faits.match(e, fig, fu))) return true;
    if (this.blocked.some((b) => b.n === key && Faits.match(b, fig, fu))) return false;
    return list.some((e) => Faits.match(e, fig, fu));
  }
}

function addFacts(faits, v, path = []) {
  if (v == null) return;
  if (typeof v === "string" || typeof v === "number") {
    const text = String(v).replace(MARQUEUR, " ");
    for (const m of text.matchAll(NUMBER)) {
      const n = numberOf(m[0]);
      if (n == null) continue;
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
      const before = text.slice(Math.max(0, m.index - 12), m.index);
      faits.add(n, kindOf(after, before) ?? kindOfPath(path), unitOf(after, before));
    }
    return;
  }
  if (Array.isArray(v)) return v.forEach((x) => addFacts(faits, x, path));
  if (typeof v === "object") for (const [k, x] of Object.entries(v)) addFacts(faits, x, [...path, k]);
}

// Chiffres que le projet autorise, avec nature et unité : faits typés
// validés, puis les textes que l'utilisateur maîtrise (questionnaire hors
// recherche brute, message central, cartes du type de page, offre, fiche).
// La recherche (collages clients et concurrents, résultats de Claude) n'en
// fait plus partie : une citation de concurrent ne prouve rien pour notre
// produit (audit F02).
export function knownNumbers(project, root = {}) {
  const f = project?.fondations ?? {};
  const faits = new Faits();
  addFacts(faits, { reponses: withoutResearch(f.reponses), message: f.message, contenus: f.contenus?.[root.pageType], offre: project?.offre, produit: project?.produit, description: project?.description, infos: root.infos, fiche: root.produit });
  // Fiche d'offre (F09) : prix, prix par unité, remises, quantités, garantie
  // calculés ou saisis dans la fiche = chiffres autorisés.
  for (const fait of faitsDeFiche(project?.offreFiche)) {
    const n = numberOf(String(fait.valeur));
    if (n != null) faits.add(n, fait.nature, unitOf(` ${fait.unite ?? ""}`, ""), "fait");
  }
  for (const fait of f.faits ?? []) {
    const n = numberOf(String(fait.valeur ?? ""));
    if (n == null || !fait.nature) continue;
    const unit = unitOf(` ${fait.unite ?? ""}`, "");
    if (fait.etat === "valide") faits.add(n, fait.nature, unit, "fait");
    else faits.block(n, fait.nature, unit);
  }
  return faits;
}
const knowsFig = (known, fig) => (known?.knows ? known.knows(fig) : known?.has?.(fig.n));
// ---- Affirmations sans chiffre (audit T1, suite, 2026-11-17) ----
// « Bio », « cliniquement prouvé », « recommandé par les médecins », « vu
// dans… », « fabriqué au… », « n° 1 », « satisfait ou remboursé »… engagent
// autant qu'un chiffre. Chacune doit s'appuyer sur une preuve cochée dans les
// Fondations (partie 4) ou être écrite dans les Fondations / l'offre.
// fort : bloquée quand l'IA remplit la page depuis les Fondations.
const W = (body) => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, "iu");
export const CLAIMS = [
  { id: "certification", label: "Certification, label", preuve: "certification", fort: true, re: W("bio|organic|biologique|certifiée?s?|certified|vegan|végan|végétalien|gluten[- ]free|sans gluten|non[- ]gmo|sans ogm|kosher|casher|halal|cruelty[- ]free|gmp|fda[- ]approved|approuvée? par la fda|usda|ecocert|leaping bunny") },
  { id: "clinique", label: "Étude, preuve scientifique", preuve: "etude", fort: true, re: W("clinically (?:proven|tested|studied)|cliniquement (?:prouvée?|testée?)|clinical (?:study|studies|trial)|études? cliniques?|scientifically proven|scientifiquement prouvée?|prouvée? scientifiquement|backed by science|science[- ]backed|research[- ]backed") },
  { id: "expert", label: "Expert, médecin", preuve: "expert", fort: true, re: W("doctors? (?:recommended|approved|formulated)|doctor[- ](?:recommended|approved|formulated)|recommandée? par (?:les |des )?(?:médecins|dermatologues|experts|pharmaciens)|recommended by (?:doctors|physicians|dermatologists|experts|pharmacists)|dermatologist[- ](?:tested|approved|recommended)|dermatologiquement testée?|testée? dermatologiquement|pharmacist[- ](?:recommended|approved)|nutritionist[- ]approved") },
  { id: "presse", label: "Presse, médias", preuve: "presse", fort: true, re: W("as seen (?:on|in)|vu (?:à|dans|sur)|featured (?:in|on)|as featured") },
  { id: "recompense", label: "Prix, classement", preuve: null, fort: true, re: /(?<!\p{L})(?:award[- ]winning|primée?|best[- ]sellers?|meilleures? ventes?|top[- ]rated|number one|numéro un)(?!\p{L})|#\s?1(?!\d)|n°\s?1(?!\d)/iu },
  { id: "origine", label: "Origine, fabrication", preuve: null, fort: false, re: W("made in (?:the )?[a-z]+|fabriquée? (?:au|en|aux) [\\p{L}]+|produite? (?:au|en|aux) [\\p{L}]+|sourced from [a-z]+") },
  { id: "garantie", label: "Garantie", preuve: "garantie", fort: false, re: W("money[- ]back|satisfait ou remboursé|satisfaction guaranteed|guarantee|garantie") },
  { id: "naturel", label: "Composition", preuve: null, fort: false, re: W("all[- ]natural|100 ?% natur(?:al|el|elle)|natural ingredients|ingrédients naturels|no (?:fillers|additives|preservatives)|sans (?:additifs|conservateurs|produits chimiques)|chemical[- ]free|toxin[- ]free") },
  { id: "stock", label: "Disponibilité, urgence", preuve: null, fort: false, re: W("only \\d+ left|selling fast|limited stock|stock limité|presque épuisée?|almost (?:gone|sold out)|while supplies last|jusqu'à épuisement") },
];

// Toutes les affirmations d'un texte (une par sorte).
export function claimsIn(text) {
  const t = String(text ?? "");
  const out = [];
  for (const c of CLAIMS) {
    const m = c.re.exec(t);
    if (m) out.push({ id: c.id, label: c.label, fort: c.fort, valeur: m[0], index: m.index });
  }
  return out;
}

// Labels précis (audit ChatGPT F03) : une preuve « Vegan » autorise
// « vegan », pas « FDA-approved ». « Certifié » seul demande au moins un
// label documenté.
const LABELS = [
  ["bio", W("bio|organic|biologique")],
  ["vegan", W("vegan|végan|végétalien")],
  ["gluten", W("gluten[- ]free|sans gluten")],
  ["ogm", W("non[- ]gmo|sans ogm")],
  ["kosher", W("kosher|casher")],
  ["halal", W("halal")],
  ["cruelty", W("cruelty[- ]free|leaping bunny")],
  ["gmp", W("gmp")],
  ["fda", W("fda")],
  ["usda", W("usda")],
  ["ecocert", W("ecocert")],
];
export const labelsIn = (text) => new Set(LABELS.filter(([, re]) => re.test(String(text ?? ""))).map(([id]) => id));

// Audit F14 (2026-11-25) : force d'une affirmation scientifique. 1 = testé,
// étudié ; 2 = prouvé, démontré, appuyé par la science. Une preuve « testé »
// n'autorise pas « prouvé » ; une négation (« sans effet prouvé ») ne compte pas.
const FORT_SCIENCE = W("proven|prouvée?s?|prouvé|démontrée?s?|demonstrated|backed by science|science[- ]backed|research[- ]backed|efficacité établie|effet établi");
function forceScience(text) {
  const t = String(text ?? "");
  const re = new RegExp(FORT_SCIENCE.source, "giu");
  // « sans effet prouvé », « without proven results », « aucun effet démontré » : pas une preuve forte.
  const sans = /(?:\bsans|\bwithout|\bno|\baucun\p{L}*|\bpas)\b[^.!?\n]{0,25}$/iu;
  for (const m of t.matchAll(re)) if (!negated(t, m.index) && !sans.test(t.slice(Math.max(0, m.index - 40), m.index))) return 2;
  return 1;
}

// Toutes les occurrences (pas une par sorte), pour juger chaque phrase.
function claimsAll(text) {
  const t = String(text ?? "");
  const out = [];
  for (const c of CLAIMS) {
    const re = new RegExp(c.re.source, c.re.flags.includes("g") ? c.re.flags : `${c.re.flags}g`);
    for (const m of t.matchAll(re)) out.push({ id: c.id, label: c.label, fort: c.fort, valeur: m[0], index: m.index });
  }
  return out;
}
// « Ne pas écrire cliniquement prouvé », « never say FDA-approved » : une
// consigne d'interdiction n'est pas une preuve (audit F03).
const NEGATION = /(?:\bne\s+(?:pas|jamais)|\bn['’]\p{L}+\s+(?:pas|jamais)|\bpas\s+(?:de|d['’]|un|une)|\bjamais|\binterdit\p{L}*|\b[ée]viter|\bproscri\p{L}*|\bdon['’]?t|\bdo\s+not|\bnever|\bavoid|\bnot)\b[^.!?\n]{0,40}$/iu;
const negated = (text, index) => NEGATION.test(String(text).slice(Math.max(0, index - 60), index));

// Textes que l'utilisateur maîtrise (pas la recherche brute ni les preuves,
// jugées à part), un par un.
function ownTexts(project, root) {
  const f = project?.fondations ?? {};
  const { preuves: _p, ...reponses } = withoutResearch(f.reponses);
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === "string") return out.push(v.replace(MARQUEUR, " "));
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") return Object.values(v).forEach(walk);
  };
  walk([reponses, f.message, project?.offre, project?.produit, project?.description, root.infos, root.produit]);
  return out;
}

// Sortes d'affirmations que le projet autorise :
//   - preuve cochée AVEC un détail réel (ni vide, ni [MANQUE], ni [À VALIDER]) ;
//   - affirmation écrite (non niée) dans les textes de l'utilisateur.
// La recherche brute (citations clients, concurrents) n'autorise rien.
export function knownClaims(project, root = {}) {
  const f = project?.fondations ?? {};
  const preuves = f.reponses?.preuves ?? {};
  const ok = new Set();
  ok.labels = new Set();
  for (const c of CLAIMS) {
    const p = c.preuve && preuves[c.preuve];
    if (!p?.oui || !realText(p.detail)) continue;
    if (c.id === "certification") {
      const l = labelsIn(String(p.detail).replace(MARQUEUR, " "));
      if (!l.size) continue;
      l.forEach((x) => ok.labels.add(x));
    }
    if (c.id === "clinique") ok.forceClinique = Math.max(ok.forceClinique ?? 0, forceScience(String(p.detail).replace(MARQUEUR, " ")));
    ok.add(c.id);
  }
  if (realText(project?.offre?.garantie)) ok.add("garantie");
  const texts = ownTexts(project, root);
  for (const text of texts) {
    for (const c of claimsAll(text)) {
      if (negated(text, c.index)) continue;
      ok.add(c.id);
      if (c.id === "certification") labelsIn(c.valeur).forEach((x) => ok.labels.add(x));
      if (c.id === "clinique") ok.forceClinique = Math.max(ok.forceClinique ?? 0, forceScience(c.valeur));
    }
  }
  // Pour l'origine, le pays compte : « fabriqué au Canada » n'autorise pas
  // « fabriqué en France ».
  ok.blob = texts.join(" \n ").toLowerCase();
  return ok;
}

// Une affirmation est-elle couverte par le projet ?
export function claimKnown(c, known) {
  if (!known?.has(c.id)) return false;
  if (c.id === "clinique" && known.forceClinique != null && forceScience(c.valeur) > known.forceClinique) return false;
  if (c.id === "origine" && known.blob) return known.blob.includes(String(c.valeur).trim().split(/\s+/).pop().toLowerCase());
  if (c.id === "certification" && known.labels) {
    const wanted = labelsIn(c.valeur);
    // « Certifié » sans label : au moins un label documenté suffit.
    if (!wanted.size) return known.labels.size > 0;
    return [...wanted].every((x) => known.labels.has(x));
  }
  return true;
}

export const unknownClaims = (html, known, { fortesSeulement = false } = {}) =>
  claimsAll(plain(html)).filter((c, i, all) => all.findIndex((x) => x.id === c.id && x.valeur.toLowerCase() === c.valeur.toLowerCase()) === i && !claimKnown(c, known) && (!fortesSeulement || c.fort));
export const hasUnknownClaim = (html, known) => unknownClaims(html, known, { fortesSeulement: true }).length > 0;

// Les nombres « qui engagent » d'un texte (suivis ou précédés d'une unité) :
// [{ n: forme normalisée, valeur: tel qu'écrit, index, after }].
export function figuresIn(text) {
  const out = [];
  // Emplacements entre crochets ([2 years ago], [3x Pack], [MANQUE : …]) : des
  // consignes à remplir, pas des chiffres qui engagent (positions gardées).
  text = String(text ?? "").replace(/\[[^\]\n]{0,160}\]/g, (m) => " ".repeat(m.length));
  for (const m of String(text ?? "").matchAll(NUMBER)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (!UNIT_AFTER.test(after) && !UNIT_BEFORE.test(before)) continue;
    const n = numberOf(m[0]);
    if (n == null) continue;
    // Années : pas des preuves. « 100 % » en est une à vérifier (audit T1).
    if (/^(19|20)\d\d$/.test(n) && !/^\s?(%|\$|€)/.test(after)) continue;
    out.push({ n, kind: kindOf(after, before), unit: unitOf(after, before), valeur: m[0], index: m.index, after });
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
  const knownC = knownClaims(project, root);
  const chiffres = [];
  const affirmations = [];
  const seenClaims = new Set();
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
      for (const c of claimsIn(text)) {
        const key = `${c.id}|${c.valeur.toLowerCase()}`;
        if (claimKnown(c, knownC) || seenClaims.has(key)) continue;
        seenClaims.add(key);
        const from = Math.max(0, c.index - 28);
        const to = c.index + c.valeur.length + 30;
        affirmations.push({ sectionId: item.props.id, name, sorte: c.label, fort: c.fort, valeur: c.valeur, extrait: `${from ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}` });
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
    affirmations,
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
