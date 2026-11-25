// Grille des résultats de la Recherche produits (2026-11-25).
// Une cellule = une piste trouvée par un agent Omar_winninghunter (les 3
// derniers résultats de chaque agent, une même piste vue par deux agents
// n'apparaît qu'une fois) OU un produit proposé par l'utilisateur, ou retenu
// depuis le chat d'un agent. État (écartée, ajouts du chat, projet lancé) dans
// agents/omar-winninghunter/_candidats.json.
//   GET  /api/candidats                       → { candidats, enCours }
//   POST /api/candidats { action, … }         → ajouter | modifier | retirer |
//        statut | ajouts | ajouterProduits | extraire | lancer
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const RUBRIQUES = ["Concurrents", "Marché", "Prix du marché", "Mots des clients", "Angles et accroches", "Risques", "Autre"];
const court = (t, n = 200) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
export const norm = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const dossier = (root) => join(root, "agents", "omar-winninghunter");
const fichierEtat = (root) => join(dossier(root), "_candidats.json");
async function lireEtat(root) {
  try {
    const e = JSON.parse(await readFile(fichierEtat(root), "utf8"));
    return { mes: e.mes ?? [], etats: e.etats ?? {} };
  } catch {
    return { mes: [], etats: {} };
  }
}
// Écritures en série (un seul processus Node) + écriture atomique.
let file = Promise.resolve();
async function muter(root, fn) {
  const { writeAtomic } = await import("./commun.mjs");
  const run = file.then(async () => {
    const e = await lireEtat(root);
    const r = await fn(e);
    await writeAtomic(fichierEtat(root), JSON.stringify(e, null, 1) + "\n");
    return r;
  });
  file = run.catch(() => {});
  return run;
}

const fmt = (v) => (typeof v === "number" ? Math.round(v).toLocaleString("fr-FR") : v);
function mesuresDe(r, p, ligne) {
  if (ligne && r.colonnes) {
    return r.colonnes
      .filter((c) => !["images", "verdict", "nom", "lien"].includes(c.type) && ligne[c.cle] != null && ligne[c.cle] !== "" && ligne[c.cle] !== "—")
      .map((c) => [c.label || c.cle, `${fmt(ligne[c.cle])}${c.suffixe ?? ""}`]);
  }
  return [
    ["Recherches / mois", p.volume != null ? fmt(p.volume) : null],
    [`Croissance ${r.reglages?.periode ?? "?"} mois`, p.croissance != null ? `+${fmt(p.croissance)} %` : null],
    ["Courbe", p.courbe === "exponentielle" ? "accélère" : p.courbe],
    ["Annonceurs vus", p.concurrents?.nombre],
  ].filter(([, v]) => v != null && v !== "");
}

async function titresAgents(root) {
  const od = dossier(root);
  const esp = existsSync(join(od, "espace.json")) ? JSON.parse(await readFile(join(od, "espace.json"), "utf8")) : { omar: [] };
  const t = {};
  for (const s of esp.omar ?? []) {
    try {
      t[s] = JSON.parse(await readFile(join(od, s, "agent.json"), "utf8")).titre.replace(/^Omar_winninghunter_/, "");
    } catch {
      t[s] = s;
    }
  }
  return t;
}

export async function listerCandidats(root) {
  const titres = await titresAgents(root);
  const etat = await lireEtat(root);
  const par = new Map();
  for (const slug of Object.keys(titres)) {
    const dir = join(dossier(root), slug, "resultats");
    if (!existsSync(dir)) continue;
    const fichiers = (await readdir(dir)).filter((f) => /^[0-9TZ-]+\.json$/.test(f)).sort().reverse().slice(0, 3);
    for (const f of fichiers) {
      let r;
      try {
        r = JSON.parse(await readFile(join(dir, f), "utf8"));
      } catch {
        continue;
      }
      for (const p of r.pistes ?? []) {
        if (!p.sujet) continue;
        const id = `p-${norm(p.sujet)}`;
        const ligne = (r.lignes ?? []).find((l) => String(l.id) === String(p.id));
        const source = { agent: slug, titre: titres[slug], fichier: f, le: r.le, pid: p.id ?? null };
        const c = par.get(id);
        if (c) {
          // Même piste vue ailleurs : une source de plus (la plus récente reste en tête).
          if (!c.sources.some((s) => s.agent === slug && s.fichier === f)) c.sources.push(source);
          continue;
        }
        par.set(id, {
          id,
          nom: court(p.sujet, 90),
          image: ligne?.images?.[0] ?? p.images?.[0] ?? null,
          verdict: p.verdict ?? "à surveiller",
          sources: [source],
          mesures: mesuresDe(r, p, ligne),
          boutique: ligne?.boutique ?? null,
          lien: ligne?.lien ?? null,
          pourquoi: p.pourquoi ?? "",
          produitConcret: p.produitConcret ?? "",
          angle: p.angle ?? "",
          risques: p.risques ?? [],
          prochaineEtape: p.prochaineEtape ?? "",
          le: r.le,
        });
      }
    }
  }
  const agents = [...par.values()];
  const mes = etat.mes.map((m) => ({ ...m, moi: !m.agent, verdict: "à analyser", sources: m.agent ? [{ agent: m.agent, titre: m.agentTitre ?? m.agent, le: m.le }] : [], mesures: [m.prix && ["Prix visé", m.prix], m.cout && ["Coût d'achat", m.cout]].filter(Boolean) }));
  const tous = [...mes, ...agents].map((c) => {
    const e = etat.etats[c.id] ?? {};
    return { ...c, statut: e.statut ?? null, ajouts: [...(c.ajouts ?? []), ...(e.ajouts ?? [])], lance: c.lance ?? e.lance ?? null };
  });
  return tous;
}

// Texte de la fiche, pour le chat d'un agent (« Discuter de ce produit »).
export async function ficheCandidat(root, id) {
  const c = (await listerCandidats(root)).find((x) => x.id === id);
  if (!c) return "";
  const l = [
    `PRODUIT ÉTUDIÉ DANS CETTE CONVERSATION : ${c.nom}`,
    c.moi ? "Proposé par l'utilisateur (il ne connaît pas encore bien ce marché)." : `Piste trouvée par : ${c.sources.map((s) => `${s.titre} (${String(s.le ?? "").slice(0, 10)})`).join(", ")}. Verdict de l'agent : ${c.verdict}.`,
    c.lien ? `Lien : ${c.lien}` : "",
    c.boutique ? `Boutique repérée : ${c.boutique}` : "",
    c.notes ? `Ce que l'utilisateur sait : ${c.notes}` : "",
    c.mesures?.length ? (c.id.startsWith("m-") ? `Repères donnés par l'utilisateur (pas des relevés, à taguer [Moi]) : ${c.mesures.map(([k, v]) => `${k} ${v}`).join(" · ")}` : `Mesures relevées (WinningHunter, échantillon, à cette date) : ${c.mesures.map(([k, v]) => `${k} ${v}`).join(" · ")}`) : "",
    c.produitConcret ? `Produit (interprétation IA) : ${c.produitConcret}` : "",
    c.pourquoi ? `Pourquoi (IA) : ${c.pourquoi}` : "",
    c.angle ? `Angle (IA) : ${c.angle}` : "",
    c.risques?.length ? `Risques notés : ${c.risques.join(" · ")}` : "",
    c.ajouts?.length ? `Déjà retenu par l'utilisateur :\n${c.ajouts.map((a) => `- [${a.rubrique}] ${a.texte}`).join("\n")}` : "",
    "Concentre ton analyse sur CE produit. Les chiffres ci-dessus sont des relevés partiels : ne les présente pas comme exacts.",
  ];
  return `\n---\n${l.filter(Boolean).join("\n")}`;
}

function texteLancement(c) {
  return [
    `Produit lancé depuis la Recherche : ${c.nom}${c.moi ? " (proposé par toi)" : ` (verdict de l'agent : ${c.verdict})`}`,
    c.sources?.length ? `Origine : ${c.sources.map((s) => `${s.titre} (${String(s.le ?? "").slice(0, 10)})`).join(", ")}.` : "",
    c.lien ? `Lien : ${c.lien}` : "",
    c.boutique ? `Boutique repérée : ${c.boutique}` : "",
    c.notes ? `Ce que tu savais : ${c.notes}` : "",
    c.mesures?.length ? `Mesures : ${c.mesures.map(([k, v]) => `${k} ${v}`).join(" · ")}.` : "",
    c.produitConcret ? `Produit (interprétation IA) : ${c.produitConcret}` : "",
    c.pourquoi ? `Pourquoi (IA) : ${c.pourquoi}` : "",
    c.angle ? `Angle (IA) : ${c.angle}` : "",
    c.risques?.length ? `Risques : ${c.risques.join(" · ")}` : "",
    ...(c.ajouts ?? []).map((a) => `[${a.rubrique}] ${a.texte}${a.source ? ` (${a.source})` : ""}${a.agent ? ` · ${a.agent}` : ""}`),
    "Limites : relevés WinningHunter et réponses d'agents à leur date, sur des échantillons ; interprétations de l'IA à vérifier. Observation, pas preuve de ton produit.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function candidatsRoute(req, res, parts, { root, readBody, json }) {
  if (req.method === "GET") {
    const { agentsEnCours } = await import("./recherche.mjs");
    const titres = await titresAgents(root);
    return json(res, 200, { candidats: await listerCandidats(root), enCours: agentsEnCours().map(([agent, etape]) => ({ agent, titre: titres[agent] ?? agent, etape })), rubriques: RUBRIQUES });
  }
  if (req.method !== "POST") return json(res, 405, { error: "Méthode refusée." });
  const b = (await readBody(req).catch(() => ({}))) || {};
  const id = String(b.id ?? "");
  const champs = (x) => ({ nom: court(x.nom, 90), lien: court(x.lien, 400), prix: court(x.prix, 30), cout: court(x.cout, 30), notes: court(x.notes, 1500) });

  if (b.action === "ajouter") {
    const f = champs(b);
    if (!f.nom) return json(res, 400, { error: "Donne au moins un nom au produit." });
    const nid = `m-${Date.now().toString(36)}`;
    await muter(root, (e) => e.mes.unshift({ id: nid, ...f, le: new Date().toISOString(), ajouts: [] }));
    return json(res, 200, { ok: true, id: nid });
  }
  if (b.action === "ajouterProduits") {
    const items = (Array.isArray(b.items) ? b.items : []).map((x) => ({ nom: court(x.nom, 90), notes: court(x.notes, 600) })).filter((x) => x.nom).slice(0, 15);
    if (!items.length) return json(res, 400, { error: "Aucun produit coché." });
    const le = new Date().toISOString();
    await muter(root, (e) => e.mes.unshift(...items.map((x, i) => ({ id: `m-${Date.now().toString(36)}${i}`, ...x, agent: court(b.agent, 90) || "chat", agentTitre: court(b.agent, 90), le, ajouts: [] }))));
    return json(res, 200, { ok: true, n: items.length });
  }
  if (!/^[pm]-[a-z0-9-]{1,90}$/.test(id)) return json(res, 400, { error: "Produit invalide." });

  if (b.action === "modifier") {
    const f = champs(b);
    if (!f.nom) return json(res, 400, { error: "Le nom ne peut pas être vide." });
    const ok = await muter(root, (e) => {
      const m = e.mes.find((x) => x.id === id);
      return m ? (Object.assign(m, f), true) : false;
    });
    return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: "Produit introuvable." });
  }
  if (b.action === "retirer") {
    await muter(root, (e) => {
      e.mes = e.mes.filter((x) => x.id !== id);
      delete e.etats[id];
    });
    return json(res, 200, { ok: true });
  }
  if (b.action === "statut") {
    await muter(root, (e) => {
      e.etats[id] = { ...(e.etats[id] ?? {}), statut: b.statut === "écarté" ? "écarté" : null };
    });
    return json(res, 200, { ok: true });
  }
  if (b.action === "ajouts") {
    const le = new Date().toISOString();
    const items = (Array.isArray(b.items) ? b.items : [])
      .map((x) => ({ rubrique: RUBRIQUES.includes(x.rubrique) ? x.rubrique : "Autre", texte: court(x.texte, 500), source: ["WH", "Web", "Est"].includes(x.source) ? x.source : "Est", agent: court(b.agent, 90), le }))
      .filter((x) => x.texte)
      .slice(0, 30);
    if (!items.length) return json(res, 400, { error: "Rien de coché." });
    const lance = await muter(root, (e) => {
      const m = e.mes.find((x) => x.id === id);
      if (m) m.ajouts = [...(m.ajouts ?? []), ...items];
      else e.etats[id] = { ...(e.etats[id] ?? {}), ajouts: [...(e.etats[id]?.ajouts ?? []), ...items] };
      return m ? m.lance : e.etats[id].lance;
    });
    // Produit déjà lancé (2026-11-25) : les nouvelles infos vont aussi dans
    // les notes de recherche de son projet, avec leur origine.
    if (lance && /^[a-z0-9][a-z0-9-]{1,90}$/.test(lance) && existsSync(join(root, "projets", `${lance}.json`))) {
      const { muterProjet } = await import("./commun.mjs");
      const nom = (await listerCandidats(root)).find((x) => x.id === id)?.nom ?? id;
      const texte = [`Nouvelles infos sur ${nom}${items[0].agent ? ` (conversation avec ${items[0].agent})` : ""} :`, ...items.map((a) => `[${a.rubrique}] ${a.texte} (${a.source})`), "Observation d'un agent à cette date, pas une preuve de ton produit."].join("\n");
      await muterProjet(lance, (pj) => {
        pj.fondations = pj.fondations ?? {};
        pj.fondations.reponses = pj.fondations.reponses ?? {};
        pj.fondations.reponses.notesAgents = [...(pj.fondations.reponses.notesAgents ?? []), { texte, agent: items[0].agent || "recherche-grille", le: items[0].le, origine: { candidat: id, ajouts: items } }];
      });
      return json(res, 200, { ok: true, n: items.length, projet: lance });
    }
    return json(res, 200, { ok: true, n: items.length });
  }
  if (b.action === "extraire") {
    // Range une réponse d'agent : produits proposés (→ grille) ou
    // informations sur le produit étudié (→ sa cellule). Aperçu à cocher.
    const texte = String(b.texte ?? "").slice(0, 20000);
    if (!texte.trim()) return json(res, 400, { error: "Réponse vide." });
    const { loadEnv } = await import("vite");
    const env = loadEnv("development", root, "");
    if (!env.OPENAI_API_KEY) return json(res, 400, { error: "Clé OpenAI absente (OPENAI_API_KEY)." });
    const { ia } = await import("./recherche.mjs");
    const consigne =
      b.mode === "produits"
        ? `Dans la réponse d'agent ci-dessous, relève les PRODUITS précis qu'elle propose de vendre (pas les catégories vagues, pas les marques concurrentes citées en exemple, pas les packs, formats ou variantes du produit déjà étudié). Réponds en JSON : {"items":[{"nom":"nom court du produit (français)","notes":"une phrase : pourquoi l'agent le propose, chiffres compris s'il y en a"}]}. Au plus 15. Si aucun produit précis : {"items":[]}.`
        : `Dans la réponse d'agent ci-dessous, relève les informations utiles sur le produit étudié, rangées par rubrique parmi : ${RUBRIQUES.join(", ")}. Une information = une phrase courte et autonome, chiffres et noms compris. source = "WH" si le chiffre vient de WinningHunter (tag [WH]), "Web" s'il vient d'une source web, "Est" pour une estimation ou un avis de l'agent. « Mots des clients » = ce que disent les CLIENTS (avis, commentaires, plaintes) ; les arguments des pubs ou des pages concurrentes vont dans « Angles et accroches ». Un prix ou un coût donné par l'utilisateur n'est pas une information à relever. N'invente rien, ne reformule pas en plus fort. Réponds en JSON : {"items":[{"rubrique":"…","texte":"…","source":"WH|Web|Est"}]}. Au plus 30.`;
    try {
      const etudie = /^[pm]-[a-z0-9-]{1,90}$/.test(id) ? (await listerCandidats(root)).find((x) => x.id === id)?.nom : null;
      const r = await ia(env, `${consigne}${etudie ? `\nProduit étudié dans cette conversation (à ne PAS proposer comme nouveau produit, ni ses packs) : ${etudie}.` : ""}\n\n---\n${texte}`);
      return json(res, 200, { items: Array.isArray(r.items) ? r.items.slice(0, 30) : [] });
    } catch (e) {
      return json(res, 502, { error: e.message });
    }
  }
  if (b.action === "lancer") {
    // Crée le projet et y emporte tout ce qui a été trouvé (note de recherche
    // avec son origine), comme « Envoyer cette piste dans un projet ».
    const c = (await listerCandidats(root)).find((x) => x.id === id);
    if (!c) return json(res, 404, { error: "Produit introuvable." });
    const { muterProjet, writeAtomic } = await import("./commun.mjs");
    let projet = String(b.projet ?? "");
    if (!projet) {
      const nom = court(b.nouveau || c.nom, 80);
      projet = norm(nom).slice(0, 60);
      if (!nom || !/^[a-z0-9][a-z0-9-]{1,90}$/.test(projet)) return json(res, 400, { error: "Donne un nom au nouveau projet." });
      if (existsSync(join(root, "projets", `${projet}.json`))) return json(res, 409, { error: `Le projet « ${nom} » existe déjà : choisis-le dans la liste.` });
      await writeAtomic(join(root, "projets", `${projet}.json`), JSON.stringify({ id: projet, nom, produit: court(c.produitConcret || c.nom, 120), description: c.notes ?? "", creeLe: new Date().toISOString() }, null, 2) + "\n");
    }
    if (!/^[a-z0-9][a-z0-9-]{1,90}$/.test(projet) || !existsSync(join(root, "projets", `${projet}.json`))) return json(res, 404, { error: "Projet introuvable." });
    const le = new Date().toISOString();
    await muterProjet(projet, (pj) => {
      pj.fondations = pj.fondations ?? {};
      pj.fondations.reponses = pj.fondations.reponses ?? {};
      pj.fondations.reponses.notesAgents = [...(pj.fondations.reponses.notesAgents ?? []), { texte: texteLancement(c), agent: "recherche-grille", le, origine: { candidat: c.id, sources: c.sources, mesures: c.mesures, ajouts: c.ajouts } }];
    });
    await muter(root, (e) => {
      const m = e.mes.find((x) => x.id === id);
      if (m) m.lance = projet;
      else e.etats[id] = { ...(e.etats[id] ?? {}), lance: projet };
    });
    return json(res, 200, { ok: true, projet });
  }
  return json(res, 400, { error: "Action inconnue." });
}
