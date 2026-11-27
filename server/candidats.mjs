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
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// ---- Miniatures des cellules sans image (2026-11-26) ----
// Cache : agents/omar-winninghunter/_miniatures.json { adresse: "/medias/…" | "" }.
// "" = déjà cherché, rien trouvé (on ne réessaie pas).
const miniEnCours = new Set();
async function lireMiniatures(root) {
  try {
    return JSON.parse(await readFile(join(root, "agents", "omar-winninghunter", "_miniatures.json"), "utf8"));
  } catch {
    return {};
  }
}
let fileMini = Promise.resolve();
function noterMiniature(root, cle, url) {
  // Une écriture à la fois (plusieurs recherches tournent ensemble).
  fileMini = fileMini
    .then(async () => {
      const f = join(root, "agents", "omar-winninghunter", "_miniatures.json");
      const c = await lireMiniatures(root);
      c[cle] = url;
      await writeFile(f, JSON.stringify(c, null, 1) + "\n", "utf8");
    })
    .catch(() => {});
  return fileMini;
}
function chercherMiniature(root, cle) {
  if (miniEnCours.has(cle) || miniEnCours.size > 6) return;
  miniEnCours.add(cle);
  let adresse = cle;
  (async () => {
    let url = "";
    try {
      const ua = { "User-Agent": "Mozilla/5.0 (atelier)", Accept: "text/html,*/*" };
      // La page produit d'abord ; si elle a disparu, l'accueil de la boutique.
      let html = "";
      let base = adresse;
      for (const u of [adresse, new URL(adresse).origin]) {
        html = await fetch(u, { headers: ua, redirect: "follow", signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
        base = u;
        if (html) break;
      }
      const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*>/i);
      let img = m ? (m[0].match(/content=["']([^"']+)["']/i) ?? [])[1] : null;
      // Repli : première image produit Shopify de la page (pas le logo ni l'icône).
      if (!img) img = (html.match(/\/\/[a-z0-9.-]+\/cdn\/shop\/(?:files|products)\/[^"' )?]+\.(?:jpe?g|png|webp)/gi) ?? []).find((u) => !/favicon|logo|icon|badge|payment|flag/i.test(u)) ?? null;
      if (img && img.startsWith("//")) img = "https:" + img;
      if (img) {
        adresse = base;
        img = new URL(img.replace(/&amp;/g, "&"), base).href;
        const r = await fetch(img, { headers: ua, signal: AbortSignal.timeout(10000) });
        const type = r.headers.get("content-type") ?? "";
        const buf = Buffer.from(await r.arrayBuffer());
        if (r.ok && /^image\//.test(type) && buf.length > 2000 && buf.length < 4_000_000) {
          const ext = /png/.test(type) ? "png" : /webp/.test(type) ? "webp" : /gif/.test(type) ? "gif" : "jpg";
          const nom = `${createHash("sha1").update(cle).digest("hex").slice(0, 16)}.${ext}`;
          const dir = join(root, "medias", "recherche", "miniatures");
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, nom), buf);
          url = `/medias/recherche/miniatures/${nom}`;
        }
      }
    } catch {}
    await noterMiniature(root, cle, url).catch(() => {});
    miniEnCours.delete(cle);
  })();
}

const RUBRIQUES = ["Concurrents", "Marché", "Prix du marché", "Mots des clients", "Angles et accroches", "Risques", "Conditions et inconnues", "Autre"];
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
// Avis ChatGPT (2026-11-25) : « fichier absent » = grille vide, mais un
// fichier illisible ou abîmé bloque tout (jamais d'écriture par-dessus).
async function lireBrut(root) {
  try {
    return await readFile(fichierEtat(root), "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw new Error(`Fichier de la grille illisible (${e.code ?? e.message}) : rien n'a été enregistré.`);
  }
}
function analyser(brut) {
  if (brut == null) return { mes: [], etats: {} };
  try {
    const e = JSON.parse(brut);
    return { mes: e.mes ?? [], etats: e.etats ?? {} };
  } catch {
    throw new Error("Fichier de la grille abîmé (agents/omar-winninghunter/_candidats.json) : rien n'a été enregistré. Une copie de la version précédente est dans _candidats.json.bak.");
  }
}
const lireEtat = async (root) => analyser(await lireBrut(root));
// Écritures en série (un seul processus Node) + écriture atomique + copie
// de la version précédente (_candidats.json.bak).
let file = Promise.resolve();
async function muter(root, fn) {
  const { writeAtomic } = await import("./commun.mjs");
  const run = file.then(async () => {
    const brut = await lireBrut(root);
    const e = analyser(brut);
    const r = await fn(e);
    if (brut != null) await writeAtomic(`${fichierEtat(root)}.bak`, brut);
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
  // Tous les résultats (3 derniers par agent), du plus récent au plus ancien :
  // une piste vue plusieurs fois garde le relevé le plus récent (avis ChatGPT).
  const resultats = [];
  for (const slug of Object.keys(titres)) {
    const dir = join(dossier(root), slug, "resultats");
    if (!existsSync(dir)) continue;
    const fichiers = (await readdir(dir)).filter((f) => /^[0-9TZ-]+\.json$/.test(f)).sort().reverse().slice(0, 3);
    for (const f of fichiers) {
      try {
        resultats.push({ slug, f, r: JSON.parse(await readFile(join(dir, f), "utf8")) });
      } catch {}
    }
  }
  resultats.sort((a, b) => String(b.r.le ?? "").localeCompare(String(a.r.le ?? "")));
  {
    for (const { slug, f, r } of resultats) {
      for (const p of r.pistes ?? []) {
        if (!p.sujet || !norm(p.sujet)) continue;
        const id = `p-${norm(p.sujet)}`;
        const ligne = (r.lignes ?? []).find((l) => String(l.id) === String(p.id)) ?? (r.lignes ?? []).find((l) => l.boutique && String(p.id ?? "").includes(l.boutique));
        const source = { agent: slug, titre: titres[slug], fichier: f, le: r.le, pid: p.id ?? null, verdict: p.verdict ?? null };
        const c = par.get(id);
        if (c) {
          // Même piste vue ailleurs ou plus tôt : une source de plus.
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
          boutique: ligne?.boutique ?? (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(p.id ?? "")) ? String(p.id) : null),
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
  // Désaccord : les agents (ou deux passages du même) ont rendu des verdicts différents.
  for (const c of par.values()) {
    const v = [...new Set(c.sources.map((s) => s.verdict).filter(Boolean))];
    if (v.length > 1) c.desaccord = c.sources.filter((s) => s.verdict).map((s) => ({ titre: s.titre, le: s.le, verdict: s.verdict }));
  }
  // Pistes travaillées (écartées, enrichies, lancées) sorties des 3 derniers
  // résultats : reprises de leur copie, pour ne jamais disparaître.
  for (const [id, e] of Object.entries(etat.etats)) if (id.startsWith("p-") && !par.has(id) && e.copie) par.set(id, { ...e.copie, id, ancien: true });
  // Miniatures manquantes (2026-11-26) : WinningHunter n'en donne pas toujours.
  // a) une autre ligne de la même boutique (n'importe quel résultat) ;
  // b) l'image d'aperçu (og:image) de la page produit ou du site, téléchargée
  //    une fois en tâche de fond, sans crédit WinningHunter.
  const imgBoutique = new Map();
  for (const { r } of resultats) for (const l of r.lignes ?? []) if (l.boutique && l.images?.[0] && !imgBoutique.has(l.boutique)) imgBoutique.set(l.boutique, l.images[0]);
  const cacheMin = await lireMiniatures(root);
  for (const c of par.values()) {
    // Adresses http:// bloquées sur le site en https : on demande la version sécurisée.
    if (typeof c.image === "string" && c.image.startsWith("http://")) c.image = "https://" + c.image.slice(7);
    if (c.image) continue;
    if (c.boutique && imgBoutique.has(c.boutique)) {
      c.image = imgBoutique.get(c.boutique);
      continue;
    }
    const cle = c.lien || (c.boutique ? `https://${c.boutique}` : null);
    if (!cle) continue;
    if (cacheMin[cle]) c.image = cacheMin[cle];
    else if (!(cle in cacheMin)) chercherMiniature(root, cle);
  }
  const agents = [...par.values()];
  const mes = etat.mes.map((m) => ({ ...m, moi: !m.agent, verdict: "à analyser", sources: m.agent ? [{ agent: m.agent, titre: m.agentTitre ?? m.agent, le: m.le }] : [], mesures: [m.prix && ["Prix visé", m.prix], m.cout && ["Coût d'achat", m.cout]].filter(Boolean) }));
  const nbRapports = {};
  const dr = join(root, "agents", "rapports");
  if (existsSync(dr)) for (const d of await readdir(dr)) nbRapports[d] = (await readdir(join(dr, d)).catch(() => [])).filter((x) => FICHIER_RAPPORT.test(x)).length;
  const tous = [...mes, ...agents].map((c) => {
    const e = etat.etats[c.id] ?? {};
    const out = { ...c, statut: e.statut ?? null, ajouts: [...(c.ajouts ?? []), ...(e.ajouts ?? [])], lance: c.lance ?? e.lance ?? null, variantes: [...(c.variantes ?? []), ...(e.variantes ?? [])], collages: [...(c.collages ?? []), ...(e.collages ?? [])], imagesAmazon: [...(c.imagesAmazon ?? []), ...(e.imagesAmazon ?? [])] };
    // Pas d'image (tes produits) : la première image Amazon sert de vignette.
    if (!out.image && out.imagesAmazon.length) out.image = out.imagesAmazon[0].url;
    out.nbRapports = nbRapports[c.id] ?? 0;
    // Avis des agents en conversation (2026-11-25) : le plus récent donne le verdict affiché.
    const analyses = [...(c.analyses ?? []), ...(e.analyses ?? [])];
    if (analyses.length) {
      out.analyses = analyses;
      const der = [...analyses].reverse().find((a) => a.verdict);
      if (der) {
        out.verdictTrouve = c.verdict;
        out.verdict = der.verdict;
        out.dernierAvis = { agent: der.agent, le: der.le };
      }
      const tous = [...(c.id.startsWith("p-") ? c.sources.filter((s) => s.verdict).map((s) => ({ titre: s.titre, le: s.le, verdict: s.verdict })) : []), ...analyses.filter((a) => a.verdict).map((a) => ({ titre: a.agent, le: a.le, verdict: a.verdict }))];
      out.desaccord = new Set(tous.map((x) => x.verdict)).size > 1 ? tous : undefined;
    }
    return out;
  });
  return tous;
}

// Après chaque réponse d'un agent sur un produit (2026-11-25) : un petit appel
// IA relève son avis (verdict, note, résumé) et les autres produits ou
// déclinaisons qu'il suggère. L'avis s'ajoute à la cellule (le plus récent
// devient le verdict affiché) ; les idées deviennent des cellules « Mes produits ».
const TITRES_CHAT = { "whitelabeler-niche-analyser-v-1": "Niche Analyser", "whitelabeler-product-validator-v-1": "Product Validator", "shopfunnels-ai-product-research-analyst": "AI Product Research Analyst", "shopfunnels-winning-hunter-assistant-v-1": "Winning Hunter Assistant", "whitelabeler-ai-supplier-scout-v-2": "Supplier Scout" };
export async function suivreAnalyse(root, id, texte, slug, marche, extra = {}) {
  const c = (await listerCandidats(root)).find((x) => x.id === id);
  if (!c || !String(texte ?? "").trim()) return undefined;
  // Le rapport complet (les « rushes ») est gardé d'abord, même si le rangement échoue.
  await enregistrerRapport(root, c, { texte, slug, marche, sources: extra.sources, moteur: extra.moteur }).catch(() => {});
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", root, "");
  if (!env.OPENAI_API_KEY) return undefined;
  const { ia } = await import("./recherche.mjs");
  const r = await ia(
    env,
    `Voici la réponse d'un agent d'analyse sur le produit « ${c.nom} ». Réponds en JSON :
{"verdict": "feu vert" | "à surveiller" | "écarté" | null, "score": nombre sur 10 ou null, "resume": "une phrase : l'avis de l'agent et sa raison principale", "produits": [{"nom": "nom court", "notes": "une phrase : pourquoi l'agent le suggère"}]}
- verdict : "feu vert" = l'agent conseille d'y aller (GO, même avec conditions) ; "à surveiller" = attendre, tester prudemment, avis mitigé ; "écarté" = ne pas y aller (NO GO) ; null si la réponse ne donne pas d'avis (simple question, demande de précision).
- produits : les AUTRES produits, déclinaisons ou variantes que l'agent suggère comme produits à part (pack, version pour un autre public, alternative), pas « ${c.nom} » lui-même ni ses simples options de couleur/taille. Au plus 6. [] s'il n'y en a pas.
N'invente rien.

---
${String(texte).slice(0, 20000)}`,
  );
  const verdict = ["feu vert", "à surveiller", "écarté"].includes(r.verdict) ? r.verdict : null;
  const agent = TITRES_CHAT[slug] ?? slug;
  const le = new Date().toISOString();
  const analyse = verdict || r.resume ? { agent, slug, le, verdict, score: typeof r.score === "number" ? Math.round(r.score * 10) / 10 : null, resume: court(r.resume, 300), marche: marche ?? null } : null;
  // Variantes (2026-11-25) : rangées DANS la fiche du produit (pas de nouvelle
  // cellule, la grille ne se surcharge pas), sans doublon.
  const existants = new Set([norm(c.nom), ...(c.variantes ?? []).map((v) => norm(v.nom))]);
  // Supplier Scout : ses annonces fournisseurs ne sont pas des variantes du produit.
  const idees = (Array.isArray(r.produits) && !/supplier-scout/.test(slug) ? r.produits : []).map((x) => ({ nom: court(x.nom, 90), notes: court(x.notes, 600) })).filter((x) => x.nom && !existants.has(norm(x.nom))).slice(0, 6);
  const copieP = id.startsWith("p-") ? (({ statut, ajouts, lance, ancien, analyses, verdictTrouve, dernierAvis, desaccord, variantes, collages, imagesAmazon, ...reste }) => ({ ...reste, verdict: verdictTrouve ?? reste.verdict }))(c) : null;
  await muter(root, (e) => {
    if (analyse) {
      const m = e.mes.find((x) => x.id === id);
      if (m) m.analyses = [...(m.analyses ?? []), analyse];
      else e.etats[id] = { ...(e.etats[id] ?? {}), ...(copieP ? { copie: copieP } : {}), analyses: [...(e.etats[id]?.analyses ?? []), analyse] };
    }
    if (idees.length) {
      const v = idees.map((x) => ({ ...x, agent, le, marche: marche ?? null }));
      const m = e.mes.find((x) => x.id === id);
      if (m) m.variantes = [...(m.variantes ?? []), ...v];
      else e.etats[id] = { ...(e.etats[id] ?? {}), ...(copieP ? { copie: copieP } : {}), variantes: [...(e.etats[id]?.variantes ?? []), ...v] };
    }
  });
  return { verdict, score: analyse?.score ?? null, idees: idees.map((x) => x.nom) };
}

// Collages (Amazon, Reddit) en texte, les plus récents d'abord, coupé à `max` caractères.
const SOURCES_COLLAGE = ["Amazon", "Reddit"];
export function texteCollages(l, max = 12000) {
  let out = "";
  for (const x of [...(l ?? [])].reverse()) {
    const bloc = `— ${x.type === "descriptif" ? `Descriptif produit copié de ${x.source} (texte du vendeur : caractéristiques et promesses, pas des preuves)` : `${x.source} (avis / commentaires de clients)`}, collé le ${String(x.le ?? "").slice(0, 10)} :\n${x.texte}\n`;
    if (out.length + bloc.length > max) {
      out += `${bloc.slice(0, Math.max(0, max - out.length))}…\n`;
      break;
    }
    out += bloc;
  }
  return out;
}
// Images Amazon d'un produit lancé : copiées dans les médias du projet (Médiathèque, chat).
async function copierImagesProjet(root, projet, urls) {
  const { copyFile, mkdir: mk } = await import("node:fs/promises");
  const dir = join(root, "medias", "projets", projet, "televersees");
  await mk(dir, { recursive: true });
  for (const u of urls) {
    const src = join(root, u.replace(/^\//, ""));
    const nom = `amazon-${u.split("/").pop()}`;
    if (existsSync(src) && !existsSync(join(dir, nom))) await copyFile(src, join(dir, nom)).catch(() => {});
  }
}
// Copie aussi un collage dans le projet (cases « Avis Amazon » / « Reddit » des Fondations).
export async function collerDansProjet(projet, x) {
  const { muterProjet } = await import("./commun.mjs");
  const champ = x.type === "descriptif" ? "collecteAutres" : x.source === "Reddit" ? "collecteReddit" : "collecteAmazon";
  await muterProjet(projet, (pj) => {
    pj.fondations = pj.fondations ?? {};
    pj.fondations.reponses = pj.fondations.reponses ?? {};
    const cur = String(pj.fondations.reponses[champ] ?? "").replace(/\s+$/, "");
    const bloc = x.type === "descriptif" ? `Descriptif produit (${x.source}) :\n${x.texte}` : x.texte;
    if (!cur.includes(x.texte.slice(0, 200))) pj.fondations.reponses[champ] = cur ? `${cur}\n\n${bloc}` : bloc;
  });
  return champ;
}

// ---- Rapports complets des agents (2026-11-25) ----
// Chaque réponse d'un agent sur un produit est gardée en fichier
// agents/rapports/<produit>/<date>-<agent>.md : elle survit à « Nouvelle
// conversation » et suit le produit dans son projet (Fondations).
const dossierRapports = (root, id) => join(root, "agents", "rapports", id);
const FICHIER_RAPPORT = /^[0-9T-]+-[a-z0-9-]+\.md$/;
export async function enregistrerRapport(root, c, { texte, slug, marche, sources = [], moteur = "chatgpt", le = new Date().toISOString() }) {
  if (String(texte ?? "").trim().length < 1500) return null; // simple question ou réponse courte : pas un rapport
  const { mkdir: mk, writeFile: wf } = await import("node:fs/promises");
  const dir = dossierRapports(root, c.id);
  await mk(dir, { recursive: true });
  const fichier = `${le.slice(0, 19).replace(/:/g, "-")}-${slug}.md`;
  if (existsSync(join(dir, fichier))) return fichier;
  const agent = TITRES_CHAT[slug] ?? slug;
  const corps = [
    `# ${agent} — ${c.nom}`,
    "",
    `Rapport complet de l'agent, ${le.slice(0, 10)}${marche ? ` · marché ${marche}` : ""} · ${moteur === "claude" ? "Claude" : "ChatGPT"}`,
    "Observations et estimations d'un agent : à vérifier, pas des preuves pour le produit.",
    "",
    "---",
    "",
    String(texte).trim(),
    ...(sources?.length ? ["", "## Sources", ...sources.map((s) => `- ${s.titre || s.url} : ${s.url}`)] : []),
    "",
  ].join("\n");
  await wf(join(dir, fichier), corps, "utf8");
  // Produit déjà lancé : le rapport rejoint aussi les Fondations de son projet.
  if (c.lance && existsSync(join(root, "projets", `${c.lance}.json`))) await lierRapportsProjet(c.lance, c.id, [{ fichier, agent, le }]);
  return fichier;
}
export async function listerRapports(root, id) {
  const dir = dossierRapports(root, id);
  if (!existsSync(dir)) return [];
  const { stat } = await import("node:fs/promises");
  const out = [];
  for (const f of (await readdir(dir)).filter((x) => FICHIER_RAPPORT.test(x)).sort().reverse()) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(.+)\.md$/.exec(f);
    const st = await stat(join(dir, f)).catch(() => null);
    out.push({ fichier: f, agent: m ? TITRES_CHAT[m[5]] ?? m[5] : f, le: m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}Z` : null, taille: st?.size ?? 0 });
  }
  return out;
}
async function lierRapportsProjet(projet, candidat, liste) {
  const { muterProjet } = await import("./commun.mjs");
  await muterProjet(projet, (pj) => {
    pj.fondations = pj.fondations ?? {};
    pj.fondations.reponses = pj.fondations.reponses ?? {};
    const l = pj.fondations.reponses.rapportsAgents ?? [];
    for (const r of liste) if (!l.some((x) => x.candidat === candidat && x.fichier === r.fichier)) l.push({ id: `r-${candidat}-${r.fichier}`.slice(0, 150), candidat, fichier: r.fichier, agent: r.agent, le: r.le });
    pj.fondations.reponses.rapportsAgents = l;
  });
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
    // Avis ChatGPT : les infos retenues gardent leur source et leur date ; ce sont des observations d'agents, pas des faits confirmés.
    c.ajouts?.length ? `Informations gardées dans la fiche (observations d'agents triées par l'utilisateur, PAS des faits confirmés : garde leur source et leurs réserves) :\n${c.ajouts.map((a) => `- [${a.rubrique}] ${a.texte} [${a.source}]${a.agent ? ` · ${a.agent}` : ""} · ${String(a.le ?? "").slice(0, 10)}`).join("\n")}` : "",
    // Avis et contenus collés par l'utilisateur (Amazon, Reddit) : les agents n'y ont pas accès eux-mêmes.
    c.collages?.length ? `AVIS ET CONTENUS COLLÉS PAR L'UTILISATEUR (copiés de ${[...new Set(c.collages.map((x) => x.source))].join(" et ")} : vrais mots de clients, à utiliser pour les douleurs, désirs et objections ; tague-les [${[...new Set(c.collages.map((x) => x.source))].join("] / [")}] ; ce sont des observations, pas des preuves pour le produit) :\n${texteCollages(c.collages, 12000)}` : "",
    c.imagesAmazon?.length ? `${c.imagesAmazon.length} image(s) copiée(s) d'Amazon par l'utilisateur ; il peut les joindre à un message pour que tu les voies.` : "",
    c.variantes?.length ? `Variantes déjà suggérées (inutile de les reproposer) : ${c.variantes.map((v) => v.nom).join(", ")}` : "",
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

export async function candidatsRoute(req, res, parts, ctx) {
  try {
    return await routeInterne(req, res, parts, ctx);
  } catch (e) {
    return ctx.json(res, 500, { error: e.message });
  }
}

async function routeInterne(req, res, parts, { root, readBody, json }) {
  // GET /api/candidats/rapports/<id> → liste ; /api/candidats/rapport/<id>/<fichier> → texte.
  if (req.method === "GET" && parts[1] === "rapports" && /^[pm]-[a-z0-9-]{1,90}$/.test(parts[2] ?? "")) return json(res, 200, { rapports: await listerRapports(root, parts[2]) });
  if (req.method === "GET" && parts[1] === "rapport" && /^[pm]-[a-z0-9-]{1,90}$/.test(parts[2] ?? "") && FICHIER_RAPPORT.test(parts[3] ?? "")) {
    const f = join(dossierRapports(root, parts[2]), parts[3]);
    if (!existsSync(f)) return json(res, 404, { error: "Rapport introuvable." });
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", ...(new URL(req.url, "http://x").searchParams.has("telecharger") ? { "Content-Disposition": `attachment; filename="${parts[3]}"` } : {}) });
    return res.end(await readFile(f, "utf8"));
  }
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
  if (b.action === "extraire") {
    // Avis ChatGPT : possible sans produit (chat du menu de gauche, mode « produits »).
    if (b.mode !== "produits" && !/^[pm]-[a-z0-9-]{1,90}$/.test(id)) return json(res, 400, { error: "Produit invalide." });
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
        ? `Dans la réponse d'agent ci-dessous, relève les PRODUITS précis qu'elle propose de vendre (pas les catégories vagues, pas les marques concurrentes citées en exemple ; les déclinaisons proposées comme produits à part — pack, version pour un autre public — comptent). Réponds en JSON : {"items":[{"nom":"nom court du produit (français)","notes":"une phrase : pourquoi l'agent le propose, chiffres compris s'il y en a"}]}. Au plus 15. Si aucun produit précis : {"items":[]}.`
        : `Dans la réponse d'agent ci-dessous, relève les informations utiles sur le produit étudié, rangées par rubrique parmi : ${RUBRIQUES.join(", ")}. Une information = une phrase courte et autonome, chiffres et noms compris. source = "WH" si le chiffre vient de WinningHunter (tag [WH]), "Web" s'il vient d'une source web, "Est" pour une estimation ou un avis de l'agent. « Mots des clients » = ce que disent les CLIENTS (avis, commentaires, plaintes) ; les arguments des pubs ou des pages concurrentes vont dans « Angles et accroches ». Un prix ou un coût donné par l'utilisateur n'est pas une information à relever. Garde les réserves et le périmètre de chaque information : boutique entière ou produit, estimation ou mesure, période, pays, devise, promotion, date (ex. « revenu ESTIMÉ de toute la boutique Hismile », pas « Hismile fait »). Une pub n'est jamais un témoignage client, une recommandation n'est jamais une propriété du produit. Mets dans « Conditions et inconnues » les conditions du verdict et ce qui reste inconnu sur le produit. Écris « inconnu » plutôt que de compléter. N'invente rien, ne reformule pas en plus fort. Réponds en JSON : {"items":[{"rubrique":"…","texte":"…","source":"WH|Web|Est"}]}. Au plus 30.`;
    try {
      const etudie = /^[pm]-[a-z0-9-]{1,90}$/.test(id) ? (await listerCandidats(root)).find((x) => x.id === id)?.nom : null;
      const r = await ia(env, `${consigne}${etudie ? `\nProduit étudié dans cette conversation (ne le propose pas lui-même ; ses déclinaisons à part, oui) : ${etudie}.` : ""}\n\n---\n${texte}`);
      return json(res, 200, { items: Array.isArray(r.items) ? r.items.slice(0, 30) : [] });
    } catch (e) {
      return json(res, 502, { error: e.message });
    }
  }
  if (!/^[pm]-[a-z0-9-]{1,90}$/.test(id)) return json(res, 400, { error: "Produit invalide." });

  // Copie d'une piste d'agent au moment où on la travaille (écarter, enrichir,
  // lancer) : elle reste dans la grille même sortie des 3 derniers résultats.
  const copie = async () => {
    if (!id.startsWith("p-")) return null;
    const c = (await listerCandidats(root)).find((x) => x.id === id);
    if (!c) return null;
    const { statut, ajouts, lance, ancien, analyses, verdictTrouve, dernierAvis, desaccord, variantes, collages, imagesAmazon, ...reste } = c;
    return { ...reste, verdict: verdictTrouve ?? reste.verdict };
  };
  const garder = (e, cp) => {
    if (cp) e.etats[id] = { ...(e.etats[id] ?? {}), copie: cp };
  };

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
    const cp = await copie();
    await muter(root, (e) => {
      garder(e, cp);
      e.etats[id] = { ...(e.etats[id] ?? {}), statut: b.statut === "écarté" ? "écarté" : null };
    });
    return json(res, 200, { ok: true });
  }
  if (b.action === "coller") {
    const x = { source: SOURCES_COLLAGE.includes(b.source) ? b.source : "Amazon", type: b.type === "descriptif" ? "descriptif" : "avis", texte: String(b.texte ?? "").replace(/\r/g, "").trim().slice(0, 15000), le: new Date().toISOString() };
    if (!x.texte) return json(res, 400, { error: "Colle d'abord le texte des avis." });
    const cp = await copie();
    const lance = await muter(root, (e) => {
      const m = e.mes.find((y) => y.id === id);
      if (m) m.collages = [...(m.collages ?? []), x];
      else e.etats[id] = { ...(e.etats[id] ?? {}), ...(cp ? { copie: cp } : {}), collages: [...(e.etats[id]?.collages ?? []), x] };
      return m ? m.lance : e.etats[id].lance;
    });
    // Produit déjà lancé : copié aussi dans les Fondations de son projet.
    const champ = lance && /^[a-z0-9][a-z0-9-]{1,90}$/.test(lance) && existsSync(join(root, "projets", `${lance}.json`)) ? await collerDansProjet(lance, x) : null;
    return json(res, 200, { ok: true, projet: champ ? lance : null });
  }
  // Images copiées d'Amazon (2026-11-25), déjà téléversées dans /medias/recherche-… .
  if (b.action === "images") {
    const urls = (Array.isArray(b.urls) ? b.urls : []).filter((u) => typeof u === "string" && /^\/medias\/[\w./-]+\.(png|jpe?g|webp|gif)$/i.test(u) && !u.includes("..")).slice(0, 20);
    if (!urls.length) return json(res, 400, { error: "Aucune image." });
    const le = new Date().toISOString();
    const cp = await copie();
    const lance = await muter(root, (e) => {
      const add = urls.map((url) => ({ url, le }));
      const m = e.mes.find((y) => y.id === id);
      if (m) m.imagesAmazon = [...(m.imagesAmazon ?? []), ...add];
      else e.etats[id] = { ...(e.etats[id] ?? {}), ...(cp ? { copie: cp } : {}), imagesAmazon: [...(e.etats[id]?.imagesAmazon ?? []), ...add] };
      return m ? m.lance : e.etats[id].lance;
    });
    if (lance) await copierImagesProjet(root, lance, urls);
    return json(res, 200, { ok: true, n: urls.length });
  }
  if (b.action === "retirerImage") {
    const ok = await muter(root, (e) => {
      const m = e.mes.find((y) => y.id === id);
      const l = m ? m.imagesAmazon ?? [] : e.etats[id]?.imagesAmazon ?? [];
      const i = l.findIndex((x) => x.url === b.url);
      if (i < 0) return false;
      l.splice(i, 1);
      return true;
    });
    return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: "Image introuvable." });
  }
  if (b.action === "retirerCollage") {
    const n = Number(b.index);
    const ok = await muter(root, (e) => {
      const m = e.mes.find((y) => y.id === id);
      const l = m ? m.collages ?? [] : e.etats[id]?.collages ?? [];
      if (!Number.isInteger(n) || n < 0 || n >= l.length || (b.debut && !l[n].texte.startsWith(b.debut))) return false;
      l.splice(n, 1);
      return true;
    });
    return ok ? json(res, 200, { ok: true }) : json(res, 409, { error: "Ce collage a changé entre-temps : recharge la page." });
  }
  if (b.action === "variante") {
    const n = Number(b.index);
    let cree = null;
    const ok = await muter(root, (e) => {
      const m = e.mes.find((x) => x.id === id);
      const l = m ? m.variantes ?? [] : e.etats[id]?.variantes ?? [];
      if (!Number.isInteger(n) || n < 0 || n >= l.length || (b.nom && l[n].nom !== b.nom)) return false;
      const [v] = l.splice(n, 1);
      if (b.faire === "produit") {
        cree = `m-${Date.now().toString(36)}`;
        e.mes.unshift({ id: cree, nom: v.nom, notes: v.notes, agent: v.agent, agentTitre: v.agent, parent: { id, nom: b.parentNom || id }, le: new Date().toISOString(), ajouts: [] });
      }
      return true;
    });
    return ok ? json(res, 200, { ok: true, id: cree }) : json(res, 409, { error: "Cette variante a changé entre-temps : recharge la page." });
  }
  if (b.action === "retirerAjout") {
    const n = Number(b.index);
    const ok = await muter(root, (e) => {
      const m = e.mes.find((x) => x.id === id);
      const l = m ? m.ajouts ?? [] : e.etats[id]?.ajouts ?? [];
      if (!Number.isInteger(n) || n < 0 || n >= l.length || (b.texte && l[n].texte !== b.texte)) return false;
      l.splice(n, 1);
      return true;
    });
    return ok ? json(res, 200, { ok: true }) : json(res, 409, { error: "Cette information a changé entre-temps : recharge la page." });
  }
  if (b.action === "ajouts") {
    const le = new Date().toISOString();
    const items = (Array.isArray(b.items) ? b.items : [])
      .map((x) => ({ rubrique: RUBRIQUES.includes(x.rubrique) ? x.rubrique : "Autre", texte: court(x.texte, 500), source: ["WH", "Web", "Est"].includes(x.source) ? x.source : "Est", agent: court(b.agent, 90), le }))
      .filter((x) => x.texte)
      .slice(0, 30);
    if (!items.length) return json(res, 400, { error: "Rien de coché." });
    const cp = await copie();
    const lance = await muter(root, (e) => {
      garder(e, cp);
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
      const { ajouterBrouillons, depuisAjouts } = await import("./brouillons.mjs");
      const nb = await ajouterBrouillons(lance, depuisAjouts(items), { type: "cellule", candidat: id });
      return json(res, 200, { ok: true, n: items.length, projet: lance, brouillons: nb });
    }
    return json(res, 200, { ok: true, n: items.length });
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
    // « Adopter dans les Fondations » : les infos déjà rangées deviennent des propositions (sans IA).
    const { ajouterBrouillons, depuisAjouts } = await import("./brouillons.mjs");
    const nb = c.ajouts?.length ? await ajouterBrouillons(projet, depuisAjouts(c.ajouts), { type: "cellule", candidat: c.id }) : 0;
    for (const x of c.collages ?? []) await collerDansProjet(projet, x);
    if (c.imagesAmazon?.length) await copierImagesProjet(root, projet, c.imagesAmazon.map((x) => x.url));
    const rapports = await listerRapports(root, c.id);
    if (rapports.length) await lierRapportsProjet(projet, c.id, rapports);
    const cp = await copie();
    await muter(root, (e) => {
      garder(e, cp);
      const m = e.mes.find((x) => x.id === id);
      if (m) m.lance = projet;
      else e.etats[id] = { ...(e.etats[id] ?? {}), lance: projet };
    });
    return json(res, 200, { ok: true, projet, brouillons: nb });
  }
  return json(res, 400, { error: "Action inconnue." });
}
