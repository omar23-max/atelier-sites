// « Adopter dans les Fondations » (2026-11-25). Les trouvailles des agents
// deviennent des PROPOSITIONS champ par champ, rangées dans
// fondations.reponses.brouillonsAgents (clé de recherche : n'entre pas dans
// la validation des Fondations). L'utilisateur accepte (le texte est AJOUTÉ au
// champ, jamais à la place), modifie, rejette ou annule, dans l'onglet
// Fondations. Accepter veut dire « je veux m'en servir », pas « c'est prouvé ».
//   POST /api/brouillons/<projet> { action: "proposer", texte, agent }   → appel IA
//   (les infos déjà rangées d'une cellule passent sans IA : ajouterBrouillons)

// Champs que les agents peuvent proposer (clés de fondations.reponses).
export const CHAMPS_BROUILLON = {
  role: "Ce que fait le produit, en une phrase",
  usage: "Comment on l'utilise",
  qui: "Qui sont les clients",
  douleur: "Le problème principal qu'il règle",
  echec: "Pourquoi ce qu'ils ont essayé n'a pas marché",
  curiosite: "Curiosité : solution inhabituelle, ancienne, d'ailleurs",
  aggravation: "Ce qui a aggravé le problème",
  sites: "Concurrents (un lien par ligne)",
  collecteAutres: "Recherche : pubs, boutiques concurrentes, marché, prix",
  // Lot 2 (2026-11-25) : résultats de la recherche client, offre, message central.
  "resultats.avatars": "Résultats : avatars",
  "resultats.douleurs": "Résultats : douleurs",
  "resultats.mots": "Résultats : mots des clients",
  "resultats.objections": "Résultats : objections",
  "resultats.promesse": "Résultats : promesse",
  "offre.promesse": "Offre : promesse",
  "offre.cible": "Offre : client visé",
  "offre.prix": "Offre : prix",
  "offre.packs": "Offre : packs",
  "offre.garantie": "Offre : garantie",
  "offre.bonus": "Offre : bonus",
  "offre.urgence": "Offre : urgence",
  "offre.objections": "Offre : objections",
  "message.promesse": "Message central : promesse",
  "message.mecanisme": "Message central : mécanisme",
  "message.objection": "Message central : une objection",
  "offre.angles": "Offre : angles de vente",
  "brief.avatar": "Brief : avatar prioritaire",
  "brief.situation": "Brief : situation d'achat",
  "brief.conscience": "Brief : niveau de conscience",
  "brief.trafic": "Brief : provenance du trafic",
  "brief.promessePub": "Brief : promesse de la pub",
  "brief.typePage": "Brief : type de page",
  "brief.langue": "Brief : langue",
  "brief.action": "Brief : action attendue",
  offreFiche: "Fiche d'offre chiffrée",
};
// Rubriques des cellules de la grille → champ par défaut (modifiable ensuite).
const PAR_RUBRIQUE = { "Mots des clients": "collecteAutres", Concurrents: "collecteAutres", Marché: "collecteAutres", "Prix du marché": "collecteAutres", "Angles et accroches": "collecteAutres", Risques: "collecteAutres", "Conditions et inconnues": "collecteAutres", Autre: "collecteAutres" };

const court = (t, n = 2000) => String(t ?? "").replace(/[ \t]+/g, " ").trim().slice(0, n);
// Doublon = même texte, aux espaces et à la casse près (les chiffres et la ponctuation comptent).
const cle = (t) => String(t ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// Ajoute des propositions au projet (sans doublon : même champ + même texte).
export async function ajouterBrouillons(projet, items, origine = {}) {
  const { muterProjet } = await import("./commun.mjs");
  const le = new Date().toISOString();
  let n = 0;
  await muterProjet(projet, (pj) => {
    pj.fondations = pj.fondations ?? {};
    pj.fondations.reponses = pj.fondations.reponses ?? {};
    const l = pj.fondations.reponses.brouillonsAgents ?? [];
    const vus = new Set(l.map((b) => `${b.champ}|${cle(b.texte)}`));
    for (const x of items) {
      const champ = CHAMPS_BROUILLON[x.champ] ? x.champ : "collecteAutres";
      const texte = court(x.texte);
      if (!texte || vus.has(`${champ}|${cle(texte)}`)) continue;
      vus.add(`${champ}|${cle(texte)}`);
      l.push({ id: `b${Date.now().toString(36)}${n}${Math.random().toString(36).slice(2, 5)}`, champ, texte, ...(champ === "offreFiche" && x.valeur && typeof x.valeur === "object" ? { valeur: x.valeur } : {}), source: ["WH", "Web", "Est", "Moi", "Amazon", "Reddit"].includes(x.source) ? x.source : "Est", agent: court(x.agent ?? origine.agent, 90), le: x.le ?? le, statut: "proposé", origine });
      n++;
    }
    pj.fondations.reponses.brouillonsAgents = l;
  });
  return n;
}

// Infos déjà rangées d'une cellule (rubrique + source) : passage direct, sans IA.
export const depuisAjouts = (ajouts) =>
  (ajouts ?? []).map((a) => ({ champ: PAR_RUBRIQUE[a.rubrique] ?? "collecteAutres", texte: a.rubrique && PAR_RUBRIQUE[a.rubrique] === "collecteAutres" ? `${a.rubrique} : ${a.texte}` : a.texte, source: a.source, agent: a.agent, le: a.le }));

export async function brouillonsRoute(req, res, parts, { root, readBody, json }) {
  const projet = parts[1];
  if (!/^[a-z0-9][a-z0-9-]{1,90}$/.test(projet ?? "")) return json(res, 400, { error: "Projet invalide." });
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  if (!existsSync(join(root, "projets", `${projet}.json`))) return json(res, 404, { error: "Projet introuvable." });
  if (req.method !== "POST") return json(res, 405, { error: "Méthode refusée." });
  const b = (await readBody(req).catch(() => ({}))) || {};
  // Accepter / annuler une proposition visant les RÉSULTATS de la recherche
  // client (pas dans le brouillon de l'onglet : écrit ici, côté serveur).
  if (b.action === "resultat") {
    const k = String(b.champ ?? "").replace(/^resultats\./, "");
    if (!["avatars", "douleurs", "mots", "objections", "promesse"].includes(k)) return json(res, 400, { error: "Champ inconnu." });
    const texte = court(b.texte, 1200);
    if (!texte) return json(res, 400, { error: "Texte vide." });
    const { muterProjet } = await import("./commun.mjs");
    await muterProjet(projet, (pj) => {
      pj.fondations = pj.fondations ?? {};
      const r = (pj.fondations.resultats = pj.fondations.resultats ?? {});
      if (k === "promesse") {
        const cur = String(r.promesse ?? "");
        if (b.annuler) r.promesse = cur.replace(texte, "").replace(/\n{2,}/g, "\n").trim();
        else if (!cur.includes(texte)) r.promesse = cur.trim() ? `${cur.trim()}\n${texte}` : texte;
      } else {
        const l = Array.isArray(r[k]) ? r[k] : [];
        if (b.annuler) r[k] = l.filter((x) => x !== texte);
        else if (!l.includes(texte)) r[k] = [...l, texte];
      }
    });
    return json(res, 200, { ok: true });
  }
  // Avis Amazon / Reddit collés depuis le chat d'un agent (2026-11-25).
  if (b.action === "coller") {
    const texte = String(b.texte ?? "").replace(/\r/g, "").trim().slice(0, 15000);
    if (!texte) return json(res, 400, { error: "Colle d'abord le texte des avis." });
    const { collerDansProjet } = await import("./candidats.mjs");
    const champ = await collerDansProjet(projet, { source: b.source === "Reddit" ? "Reddit" : "Amazon", type: b.type === "descriptif" ? "descriptif" : "avis", texte });
    return json(res, 200, { ok: true, champ });
  }
  if (b.action !== "proposer") return json(res, 400, { error: "Action inconnue." });
  const texte = String(b.texte ?? "").slice(0, 20000);
  if (!texte.trim()) return json(res, 400, { error: "Réponse vide." });
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", root, "");
  if (!env.OPENAI_API_KEY) return json(res, 400, { error: "Clé OpenAI absente (OPENAI_API_KEY)." });
  const { ia } = await import("./recherche.mjs");
  const consigne = `Tu ranges la réponse d'un agent de recherche dans le questionnaire « Fondations » d'un projet e-commerce. Propose des valeurs champ par champ ; l'utilisateur acceptera ou rejettera chacune.
Champs possibles (clé : sens) :
${Object.entries(CHAMPS_BROUILLON).map(([k, v]) => `- ${k} : ${v}`).join("\n")}
Règles :
- role et usage : seulement ce que la réponse dit du produit DE L'UTILISATEUR (pas d'un concurrent). Une accroche ou une promesse de concurrent n'est JAMAIS une propriété du produit : elle va dans collecteAutres.
- qui, douleur, echec : ce que la réponse dit des clients (avis, plaintes, profils), avec sa source.
- sites : uniquement des adresses de boutiques concurrentes (une par proposition).
- collecteAutres : observations sur les concurrents, le marché, les prix, les pubs, les risques ; garde le périmètre et les réserves (estimation ou mesure, boutique entière ou produit, période, pays, devise, date).
- Une phrase courte et autonome par proposition, chiffres compris. N'invente rien, ne rends rien plus fort que la réponse. Rien n'est une preuve.
- source : "WH" (chiffre WinningHunter, tag [WH]), "Web" (source web), "Est" (estimation ou avis de l'agent).
Réponds en JSON : {"items":[{"champ":"…","texte":"…","source":"WH|Web|Est"}]}. Au plus 20.`;
  let items;
  try {
    const r = await ia(env, `${consigne}\n\n---\n${texte}`);
    items = Array.isArray(r.items) ? r.items.slice(0, 20) : [];
  } catch (e) {
    return json(res, 502, { error: e.message });
  }
  const n = await ajouterBrouillons(projet, items.map((x) => ({ ...x, agent: b.agent })), { agent: court(b.agent, 90), type: "chat" });
  return json(res, 200, { ok: true, n, proposes: items.length });
}
