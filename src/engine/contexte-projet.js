// Contexte unique d'un projet (refonte guidée, lot 2, 2026-11-23 — audit AR01).
// Un seul module, sans dépendance du navigateur : agents (server/agents.mjs),
// Mirror (server/mirror.mjs), Studio (/api/ia/studio) et scripts.
//
// Règles :
//   - rien n'est coupé au milieu : on retire des rubriques entières, des moins
//     utiles aux plus utiles, et on raccourcit les textes trop longs ;
//   - les marqueurs [MANQUE], [À VÉRIFIER]… ne deviennent jamais des faits :
//     ils vont dans « aVerifier » ;
//   - la recherche (vidéos concurrentes, collages, sites) est rangée à part,
//     signalée comme ne prouvant rien pour notre produit.
import { MARQUEUR, realText, withoutResearch } from "./fondations-etat.js";

const court = (v, n = 1200) => {
  const s = typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const propre = (v) => String(v ?? "").replace(MARQUEUR, " ").replace(/\s{2,}/g, " ").trim();
const marqueurs = (v) => String(v ?? "").match(new RegExp(MARQUEUR.source, "gi")) ?? [];

// Preuves cochées : le détail réel d'un côté, ce qui reste à vérifier de l'autre.
function preuvesDe(preuves = {}) {
  const ok = [];
  const manque = [];
  for (const [k, v] of Object.entries(preuves ?? {})) {
    if (!v || (typeof v === "object" && !v.oui)) continue;
    const detail = typeof v === "object" ? v.detail : v;
    // Les marqueurs restent dans le texte : l IA voit ce qui est à valider.
    if (realText(detail)) ok.push(`${k} : ${court(String(detail), 700)}`);
    for (const m of marqueurs(detail)) manque.push(`${k} ${m}`);
    if (!realText(detail) && !marqueurs(detail).length) manque.push(`${k} : coché sans détail`);
  }
  return { ok, manque };
}

export function contexteProjet(p, { campagne = null, limite = 16000 } = {}) {
  if (!p) return { data: null, texte: "" };
  const f = p.fondations ?? {};
  const rep = f.reponses ?? {};
  const prod = p.produit && typeof p.produit === "object" ? p.produit.nom : p.produit;
  const { preuves, interdits, ...questions } = withoutResearch(rep);
  const pr = preuvesDe(preuves);
  const aVerifier = [...pr.manque];
  const client = {};
  for (const [k, v] of Object.entries(questions)) {
    if (realText(v)) client[k] = court(v, 700);
    for (const m of marqueurs(typeof v === "string" ? v : JSON.stringify(v))) aVerifier.push(`${k} ${m}`);
  }
  const anglesChoisis = (p.angles ?? []).filter((a) => a.choisi).map((a) => ({ titre: a.titre, avatar: a.avatar, douleur: a.douleur, promesse: a.promesse, page: a.pageType, mere: a.mere || undefined }));
  const recherche = (rep.videosConcurrents ?? []).map((v) => ({ nom: v.nom, analyse: court(v.analyse, 900) }));

  // Rubriques par ordre d'importance (les dernières partent d'abord si c'est trop long).
  const rubriques = [
    ["identite", { projet: p.nom, produit: prod, description: court(p.description, 900), statutFondations: f.statut }],
    ["campagne", campagne || undefined],
    ["decide", { offre: p.offre ? court(p.offre, 3000) : undefined, messageCentral: f.message ? court(f.message, 1800) : undefined, mecanismeChoisi: f.mecanismeChoisi || undefined, anglesChoisis: anglesChoisis.length ? anglesChoisis : undefined }],
    ["faitsAutorises", { preuves: pr.ok, interdits: interdits ? court(interdits, 800) : undefined, regle: "N'utilise que ces preuves. Aucun chiffre, avis, étude, certification ou résultat inventé." }],
    ["marque", p.marque ? { nom: p.marque.nom, couleurs: p.marque.couleurs, polices: p.marque.polices, ton: p.marque.ton ?? rep.ton, logos: (p.marque.logos ?? []).length || undefined } : rep.ton ? { ton: rep.ton } : undefined],
    ["client", Object.keys(client).length ? client : undefined],
    ["aVerifier", aVerifier.length ? aVerifier.slice(0, 40) : undefined],
    ["recherche", recherche.length ? { avertissement: "Analyses de concurrents : inspiration d'angles seulement, ne prouvent RIEN pour notre produit.", videos: recherche } : undefined],
  ].filter(([, v]) => v !== undefined);

  const data = Object.fromEntries(rubriques);
  let json = JSON.stringify(data, null, 1);
  const retirees = [];
  for (const nom of ["recherche", "client", "aVerifier", "marque"]) {
    if (json.length <= limite) break;
    if (data[nom] === undefined) continue;
    delete data[nom];
    retirees.push(nom);
    json = JSON.stringify(data, null, 1);
  }
  const entete = "PROJET DE L'UTILISATEUR (contexte de l'atelier : sers-t'en au lieu de redemander ; « aVerifier » = encore inconnu, ne pas le présenter comme un fait ; « recherche » = concurrents, ne prouve rien pour ce produit)";
  return { data, texte: `${entete}${retirees.length ? `\n(rubriques omises faute de place : ${retirees.join(", ")})` : ""}\n${json}`, retirees };
}
