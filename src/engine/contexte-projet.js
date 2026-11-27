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
import { packsCalcules } from "./offre-fiche.js";

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

// Audit F01 (2026-11-25) : le contexte porte aussi l'offre COMMERCIALE
// structurée (prix, devise, packs, garantie…), les faits approuvés avec leur
// source, le mécanisme choisi en entier (avec son statut d'hypothèse) et le
// brief de campagne. Priorité en cas de contradiction : offre commerciale et
// faits approuvés > texte de l'offre ; le conflit est signalé, jamais tranché.
function offreCommerciale(fiche) {
  if (!fiche || typeof fiche !== "object") return undefined;
  let packs = [];
  try {
    packs = packsCalcules(fiche);
  } catch {
    packs = fiche.packs ?? [];
  }
  const o = {
    devise: fiche.devise || undefined,
    unite: fiche.unite || undefined,
    packs: (packs ?? []).slice(0, 8).map((k) => ({ nom: k.nom, quantite: k.quantite, offertes: k.offertes || undefined, prix: k.prix, prixBarre: k.prixBarre || undefined, prixUnite: k.prixUnite ?? k.parUnite ?? undefined, remise: k.remise ?? undefined, abonnement: k.abonnement || undefined, cadence: k.cadence || undefined, populaire: k.populaire || undefined })),
    garantie: fiche.garantie?.duree ? fiche.garantie : undefined,
    retours: fiche.retours?.duree ? fiche.retours : undefined,
    livraison: fiche.livraison?.texte || fiche.livraison?.seuilGratuit ? fiche.livraison : undefined,
    bonusLivres: (fiche.bonus ?? []).filter((b) => b?.livre).map((b) => ({ nom: b.nom, valeur: b.valeur })),
    rarete: fiche.rarete?.active ? fiche.rarete.condition : undefined,
  };
  if (!o.bonusLivres.length) delete o.bonusLivres;
  return Object.values(o).some((v) => v !== undefined && !(Array.isArray(v) && !v.length)) ? o : undefined;
}
const montants = (t) => [...String(t ?? "").matchAll(/(\d+(?:[.,]\d{1,2})?)\s*(?:\$|€|usd|cad|eur)/gi)].map((m) => Number(m[1].replace(",", ".")));

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
  // Mots des clients collés par l'utilisateur (Amazon, Reddit, avis…) : précieux
  // pour la demande et les objections, mais ce sont des observations, pas des preuves.
  // 2026-11-25 : 6 000 caractères pour Amazon et Reddit (les avis collés s'ajoutent à la fin).
  const collectes = Object.fromEntries(Object.entries(rep).filter(([k, v]) => /^collecte/.test(k) && realText(v)).map(([k, v]) => [k, court(v, /^collecte(Amazon|Reddit)$/.test(k) ? 6000 : 2500)]));
  const notes = (rep.notesAgents ?? []).map((n) => court(n.texte, 700));
  const commerciale = offreCommerciale(p.offreFiche);
  const faitsApprouves = (f.faits ?? []).filter((x) => x && x.etat === "valide").slice(0, 30).map((x) => ({ nature: x.nature, valeur: x.valeur, unite: x.unite || undefined, source: court(x.source, 200) }));
  const choix = f.mecanismeChoisi;
  const idMeca = typeof choix === "object" ? choix?.id : choix;
  const meca = (f.mecanismes ?? []).find((m) => m?.id === idMeca);
  const mecanisme = meca
    ? { nom: meca.nom, probleme: court(meca.ump, 600), solution: court(meca.ums, 600), croyance: meca.croyance ? court(meca.croyance, 400) : undefined, statut: meca.statut === "etayee" ? "étayé par des preuves" : "hypothèse (ne pas présenter comme prouvé)", limites: meca.limites ? court(meca.limites, 400) : undefined, interdits: meca.interdits ? court(meca.interdits, 400) : undefined, raisonDuChoix: typeof choix === "object" && choix.raison ? court(choix.raison, 300) : undefined }
    : idMeca || undefined;
  const brief = f.brief && typeof f.brief === "object" ? Object.fromEntries(Object.entries(f.brief).filter(([, v]) => realText(typeof v === "string" ? v : JSON.stringify(v))).map(([k, v]) => [k, court(v, 500)])) : undefined;
  // Prix du texte d'offre absents de l'offre commerciale : conflit signalé.
  if (commerciale?.packs?.length && p.offre) {
    const prix = new Set(commerciale.packs.flatMap((k) => [k.prix, k.prixBarre]).filter((x) => x != null).map(Number));
    const etrangers = [...new Set(montants(typeof p.offre === "string" ? p.offre : JSON.stringify(p.offre)).filter((n) => !prix.has(n)))];
    if (etrangers.length) aVerifier.push(`conflit de prix : le texte de l'offre cite ${etrangers.join(", ")} absent(s) de l'offre commerciale (la fiche fait foi)`);
  }

  // Sources uniques (2026-11-26) : le texte de l'offre ne répète pas ce qui fait
  // foi ailleurs (prix et packs : offreCommerciale ; promesse : message central).
  let offreTexte = p.offre;
  if (offreTexte && typeof offreTexte === "object") {
    offreTexte = { ...offreTexte };
    if (commerciale?.packs?.length) delete offreTexte.prix, delete offreTexte.packs;
    if (realText(f.message?.promesse)) delete offreTexte.promesse;
  }
  // Rubriques par ordre d'importance (les dernières partent d'abord si c'est trop long).
  const rubriques = [
    // Audit F12 (2026-11-25) : décisions verrouillées (jamais retirées faute de place).
    ["identite", { projet: p.nom, produit: prod, marque: p.marque?.nom || undefined, description: court(p.description, 900), statutFondations: f.statut, verrouille: p.marque?.nom ? "Le nom de marque et le produit sont déjà décidés : ne les renomme pas et ne propose pas d'autre nom, sauf si on te le demande." : undefined }],
    ["campagne", campagne || undefined],
    ["offreCommerciale", commerciale ? { ...commerciale, regle: "Prix, devise, packs, garantie, retours et bonus de référence : à reprendre tels quels. En cas de contradiction avec le texte de l'offre, CETTE fiche fait foi ; signale le conflit." } : undefined],
    ["decide", { promesseRetenue: realText(f.message?.promesse) ? court(f.message.promesse, 400) : undefined, offre: offreTexte ? court(offreTexte, 3000) : undefined, messageCentral: f.message ? court(f.message, 1800) : undefined, mecanismeChoisi: mecanisme, anglesChoisis: anglesChoisis.length ? anglesChoisis.slice(0, 6) : undefined }],
    ["faitsAutorises", { preuves: pr.ok, faitsApprouves: faitsApprouves.length ? faitsApprouves : undefined, interdits: interdits ? court(interdits, 800) : undefined, regle: "N'utilise que ces preuves et ces faits approuvés (avec leur valeur exacte). Aucun chiffre, avis, étude, certification ou résultat inventé." }],
    ["brief", brief && Object.keys(brief).length ? { ...brief, note: "Brief de campagne enregistré : cadre par défaut, qu'une campagne précise peut spécialiser." } : undefined],
    ["marque", p.marque ? { nom: p.marque.nom, couleurs: p.marque.couleurs, polices: p.marque.polices, ton: p.marque.ton ?? rep.ton, logos: (p.marque.logos ?? []).length || undefined } : rep.ton ? { ton: rep.ton } : undefined],
    ["client", Object.keys(client).length ? client : undefined],
    ["aVerifier", aVerifier.length ? aVerifier.slice(0, 40) : undefined],
    ["recherche", recherche.length || Object.keys(collectes).length || notes.length ? { avertissement: "Recherche : vidéos concurrentes, mots des clients collés (Amazon, Reddit, avis), notes d'agents. Observations et inspiration ; ne prouvent RIEN pour notre produit.", videos: recherche.length ? recherche : undefined, motsDesClients: Object.keys(collectes).length ? collectes : undefined, notesAgents: notes.length ? notes : undefined } : undefined],
  ].filter(([, v]) => v !== undefined);

  const data = Object.fromEntries(rubriques);
  let json = JSON.stringify(data, null, 1);
  const retirees = [];
  for (const nom of ["recherche", "client", "marque", "brief", "aVerifier"]) {
    if (json.length <= limite) break;
    if (data[nom] === undefined) continue;
    delete data[nom];
    retirees.push(nom);
    json = JSON.stringify(data, null, 1);
  }
  const entete = "PROJET DE L'UTILISATEUR (contexte de l'atelier : sers-t'en au lieu de redemander ; « aVerifier » = encore inconnu, ne pas le présenter comme un fait ; « recherche » = concurrents, ne prouve rien pour ce produit)";
  return { data, texte: `${entete}${retirees.length ? `\n(rubriques omises faute de place : ${retirees.join(", ")})` : ""}\n${json}`, retirees };
}
