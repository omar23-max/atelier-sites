// État des Fondations d'un projet (audit ChatGPT du 2026-11-17, lot 1).
// Module sans dépendance : utilisé par l'atelier (navigateur), le serveur
// (server/api.mjs) et les scripts de Claude.
//
//   - marqueurs : « [MANQUE …] », « [À VALIDER …] » ne sont pas du contenu ;
//   - empreinte de validation (v2) : faits, offre, message central et
//     questionnaire sans la recherche brute → « validée » / « modifiée » ;
//   - fusion à trois versions (version chargée, brouillon local, serveur) :
//     plus d'écrasement silencieux d'un travail fait ailleurs.

// ---- Marqueurs ----
// 2026-11-23 (audit FD02) : aussi « [À VÉRIFIER] » écrit par les agents, et
// les variantes sans accent ou anglaises (TO VERIFY, TBD, MISSING…).
export const MARQUEUR = /\[\s*(?:MANQUE|[ÀA]\s*VALIDER|[ÀA]\s*CONFIRMER|[ÀA]\s*V[ÉE]RIFIER|TODO|TBD|MISSING|TO\s*VERIFY|TO\s*CONFIRM|NEEDS?\s*VERIFICATION)[^\]]*\]/gi;
// Texte réellement disponible (ni vide, ni seulement des marqueurs).
export function realText(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.some(realText);
  if (typeof v === "object") return Object.values(v).some(realText);
  return String(v).replace(MARQUEUR, " ").replace(/[\s.,;:·—–-]+/g, "").length > 0;
}
export const hasMarker = (v) => new RegExp(MARQUEUR.source, "i").test(String(v ?? ""));

// ---- Recherche brute : ne prouve rien et n'entre pas dans la validation ----
// Collages des clients et des concurrents, liens à fouiller, sites concurrents.
// 2026-11-23 (audit FD01) : les analyses de vidéos concurrentes aussi —
// elles inspirent des angles, elles ne prouvent rien pour notre produit.
// 2026-11-25 : brouillonsAgents (propositions des agents pas encore acceptées) aussi.
export const RESEARCH_KEY = /^(collecte|liensRecherche$|sites$|videosConcurrents$|notesAgents$|brouillonsAgents$|rapportsAgents$)/;
export function withoutResearch(reponses = {}) {
  const out = {};
  for (const [k, v] of Object.entries(reponses ?? {})) if (!RESEARCH_KEY.test(k)) out[k] = v;
  return out;
}

// ---- Empreinte de validation ----
export const OFFER_KEYS = ["promesse", "cible", "prix", "packs", "garantie", "bonus", "urgence", "angles", "objections"];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => String(o?.[k] ?? "").trim()).map((k) => [k, String(o[k]).trim()]));
// Clés triées : l'ordre des champs ne change pas l'empreinte.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}
function hash(s) {
  let a = 5381;
  let b = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = (a * 33) ^ c;
    b = (b * 31) ^ c;
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}
// v1 (avant le 2026-11-17) : questionnaire, message, contenus, faits.
export const empreinteV1 = (fd) => JSON.stringify([fd?.reponses ?? {}, fd?.message ?? null, fd?.contenus ?? {}, fd?.faits ?? []]);
// v2 : ce qui fait la décision de campagne. Les contenus des pages et la
// recherche brute ont leur propre vie et ne remettent pas la validation en cause.
export function empreinteV2(project) {
  const fd = project?.fondations ?? {};
  const faits = (fd.faits ?? []).map(({ id: _id, ...f }) => f);
  const parts = [withoutResearch(fd.reponses), fd.message ?? null, faits, pick(project?.offre, OFFER_KEYS)];
  // Fiche d'offre et mécanisme choisi (lot 3, 2026-11-18) : ajoutés seulement
  // s'ils existent, pour ne pas changer l'empreinte des projets sans eux.
  const extra = {};
  if (project?.offreFiche) extra.fiche = project.offreFiche;
  if (fd.mecanismeChoisi?.id) extra.mecanisme = fd.mecanismeChoisi.id;
  if (Object.keys(extra).length) parts.push(extra);
  return `v2:${hash(stable(parts))}`;
}

// v3 (audit F13, 2026-11-25) : empreinte par PARTIE, avec le CONTENU du
// mécanisme choisi (plus seulement son identifiant). Une validation sait dire
// quelle partie a changé et ce qu'il faut relire, sans tout invalider.
export function partiesEmpreinte(project) {
  const fd = project?.fondations ?? {};
  const faits = (fd.faits ?? []).map(({ id: _id, ...f }) => f);
  const { preuves = null, ...autres } = withoutResearch(fd.reponses) ?? {};
  const choix = fd.mecanismeChoisi?.id ?? (typeof fd.mecanismeChoisi === "string" ? fd.mecanismeChoisi : null);
  const m = choix ? (fd.mecanismes ?? []).find((x) => x?.id === choix) : null;
  return {
    questionnaire: hash(stable(autres)),
    preuves: hash(stable([preuves, faits])),
    message: hash(stable(fd.message ?? null)),
    offre: hash(stable(pick(project?.offre, OFFER_KEYS))),
    commercial: hash(stable(project?.offreFiche ?? null)),
    mecanisme: hash(stable(m ? { id: m.id, nom: m.nom, ump: m.ump, ums: m.ums, croyance: m.croyance, statut: m.statut, limites: m.limites, interdits: m.interdits } : choix)),
  };
}
export const empreinte = (project) => `v3:${hash(stable(partiesEmpreinte(project)))}`;
// Ce qu'il faut relire quand une partie change.
export const PARTIES_A_RELIRE = {
  questionnaire: ["Questionnaire", "le message, les angles et les textes qui s'en servent"],
  preuves: ["Preuves et faits", "les affirmations des pages, des images et des voix off"],
  message: ["Message central", "les titres et accroches des pages et des pubs"],
  offre: ["Texte de l'offre", "les sections offre des pages"],
  commercial: ["Offre commerciale (prix, packs, garantie)", "la marge (Validation produit) et les sections prix des pages"],
  mecanisme: ["Mécanisme choisi", "les textes des pages et les pubs qui l'expliquent"],
};
export function partiesModifiees(project) {
  const avant = project?.fondations?.valideParties;
  if (!avant) return null;
  const now = partiesEmpreinte(project);
  return Object.keys(now).filter((k) => avant[k] !== now[k]);
}

// Statut après une modification : une validation dont le contenu a changé
// devient « modifiée » (et redevient « validée » si on revient en arrière).
// Les anciennes empreintes (v1) sont migrées sans perte : si le contenu n'a
// pas changé depuis, la validation est gardée avec une empreinte v2.
export function statutFondations(project) {
  const fd = project?.fondations;
  if (!fd || !["validée", "modifiée"].includes(fd.statut) || !fd.valideEmpreinte) return fd;
  let ref = fd.valideEmpreinte;
  let parties = fd.valideParties;
  if (!String(ref).startsWith("v3:")) {
    // Migration sans perte : v1 → v2 → v3 si rien n'a changé depuis.
    const intact = String(ref).startsWith("v2:") ? ref === empreinteV2(project) : ref === empreinteV1(fd);
    if (!intact) return { ...fd, statut: "modifiée" };
    ref = empreinte(project);
    parties = partiesEmpreinte(project);
  }
  return { ...fd, valideEmpreinte: ref, ...(parties ? { valideParties: parties } : {}), statut: empreinte(project) === ref ? "validée" : "modifiée" };
}

// ---- Fusion à trois versions ----
export const same = (a, b) => stable(a) === stable(b);
const plainObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const byId = (list) => list.every((x) => plainObject(x) && x.id);

// base : la version chargée par cet onglet ; local : le brouillon ; server :
// la version enregistrée maintenant. Retourne { value, conflicts: [chemins] }.
// Un conflit (même champ changé des deux côtés, différemment) garde la
// version locale dans value : à l'appelant de demander avant d'enregistrer.
export function merge3(base, local, server, path = "") {
  const conflicts = [];
  const value = mergeInto(base, local, server, path, conflicts);
  return { value, conflicts };
}
function mergeInto(base, local, server, path, conflicts) {
  if (same(local, base)) return server;
  if (same(server, base)) return local;
  if (same(local, server)) return local;
  if (plainObject(local) && plainObject(server)) {
    const b = plainObject(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(local), ...Object.keys(server)])) {
      const v = mergeInto(b[k], local[k], server[k], path ? `${path}.${k}` : k, conflicts);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(local) && Array.isArray(server) && Array.isArray(base ?? []) && byId(local) && byId(server) && byId(base ?? [])) {
    // Listes d'objets avec id (faits) : ligne par ligne.
    const bm = new Map((base ?? []).map((x) => [x.id, x]));
    const lm = new Map(local.map((x) => [x.id, x]));
    const sm = new Map(server.map((x) => [x.id, x]));
    const order = [...server.map((x) => x.id), ...local.map((x) => x.id).filter((id) => !sm.has(id))];
    const out = [];
    for (const id of order) {
      const v = mergeInto(bm.get(id), lm.get(id), sm.get(id), `${path}[${id}]`, conflicts);
      if (v !== undefined) out.push(v);
    }
    return out;
  }
  conflicts.push(path || "(tout)");
  return local;
}

// Faits anciens sans identifiant : un id stable d'après leur position.
export const withIds = (faits = []) => (faits ?? []).map((f, i) => (f?.id ? f : { ...f, id: `fl${i}` }));
