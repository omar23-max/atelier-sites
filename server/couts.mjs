// Compteur de coûts (lot 1 du plan, 2026-11-25).
// Chaque appel du serveur vers un service payant (OpenAI, Gemini, Anthropic,
// WinningHunter) est noté avec sa consommation (tokens, appels) et imputé au
// projet, au produit de la grille ou à la recherche qui l'a déclenché.
// Le contexte (projet, page, produit) suit la requête de l'atelier, y compris
// dans les tâches de fond qu'elle lance (AsyncLocalStorage).
//   couts/<clé>.jsonl  (une ligne par appel)
//   couts/prix.json    { "<modèle>": { entree, sortie } } en $ par million de tokens (saisis par l'utilisateur)
//   couts/budgets.json { "<clé>": dollars }
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const ctxCout = new AsyncLocalStorage();
const ID = /^[a-z0-9][a-z0-9-]{0,90}$/;
const CAND = /^[pm]-[a-z0-9-]{1,90}$/;

// Début d'une requête de l'atelier : ce que l'adresse dit déjà.
export function debutCout(req, parts) {
  const u = new URL(req.url ?? "/", "http://x");
  const st = { route: parts.slice(0, 2).join("/") };
  for (const k of ["projet", "page", "candidat"]) {
    const v = u.searchParams.get(k);
    if (v && (k === "candidat" ? CAND : ID).test(v)) st[k] = v;
  }
  if (["validation", "publicites", "brouillons", "fondations-video", "preparer", "coordinateur"].includes(parts[0]) && ID.test(parts[1] ?? "")) st.projet = st.projet ?? parts[1];
  if (parts[0] === "recherche" && ID.test(parts[1] ?? "")) st.recherche = parts[1];
  return st;
}
// Précise le contexte en cours (premier renseigné gardé).
export function attribuer(p = {}) {
  const s = ctxCout.getStore();
  if (!s) return;
  for (const [k, v] of Object.entries(p)) if (v && typeof v === "string" && !s[k] && (k === "candidat" ? CAND : ID).test(v)) s[k] = v;
}
// Corps d'une requête (readBody) : projet, page, produit suivi.
export function attribuerCorps(b) {
  if (!b || typeof b !== "object") return;
  attribuer({ projet: b.projet, page: b.page, candidat: b.candidat || b.suivi || (CAND.test(String(b.id ?? "")) ? b.id : undefined) });
}

const FOURNISSEURS = [
  [/(^|\.)api\.openai\.com$/, "openai"],
  [/(^|\.)generativelanguage\.googleapis\.com$/, "gemini"],
  [/(^|\.)api\.anthropic\.com$/, "anthropic"],
  [/(^|\.)app\.winninghunter\.com$/, "winninghunter"],
];
let racine = null;
let installe = false;
export function installerCompteur(root) {
  racine = root;
  if (installe) return;
  installe = true;
  const vrai = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {}
    const f = FOURNISSEURS.find(([re]) => re.test(host))?.[1];
    if (!f) return vrai(input, init);
    // Plafond (2026-11-26) : contrôle AVANT l'appel, côté serveur. Les appels en
    // cours de la même clé sont réservés (montant prudent par appel).
    const st = { ...(ctxCout.getStore() ?? {}) };
    const cleAppel = await cleDe(st).catch(() => "general");
    await garde(cleAppel, f);
    engages.set(cleAppel, (engages.get(cleAppel) ?? 0) + (RESERVE[f] ?? 0));
    let res;
    try {
      res = await vrai(input, init);
    } finally {
      engages.set(cleAppel, Math.max(0, (engages.get(cleAppel) ?? 0) - (RESERVE[f] ?? 0)));
    }
    {
      const corps = typeof init?.body === "string" ? init.body : "";
      if (f === "winninghunter") {
        noter(st, f, url, corps, res.status, "").catch(() => {});
        return res;
      }
      // Lecture de la réponse en arrière-plan, sur une copie (la vraie reste intacte).
      res
        .clone()
        .text()
        .then((t) => noter(st, f, url, corps, res.status, t))
        .catch(() => {});
    }
    return res;
  };
}

// ---- Plafond de dépense par projet / produit (couts/budgets.json) ----
// Montant réservé pendant un appel (on ne connaît son coût qu'après) : prudent
// pour GPT-5.5 avec recherche web, plus petit pour les images.
const RESERVE = { openai: 0.5, anthropic: 0.5, gemini: 0.15, winninghunter: 0 };
const engages = new Map(); // clé → dollars réservés par les appels en cours
const depenses = new Map(); // clé → { dollars, sansPrix, le } (cache court)
export class BudgetAtteint extends Error {}
async function depenseDe(cle) {
  const c = depenses.get(cle);
  if (c && Date.now() - c.le < 15000) return c;
  const r = await resumeCouts(racine, cle);
  const v = { dollars: r.total.dollars, sansPrix: r.total.sansPrix, le: Date.now() };
  depenses.set(cle, v);
  return v;
}
// Plafond par défaut des projets (2026-11-26, choix de l'utilisateur : 5 $),
// réglable dans couts/budgets.json (« _defautProjet »). Un plafond propre au projet passe avant.
const DEFAUT_PROJET = 5;
const plafondDe = (budgets, cle) => budgets[cle] ?? (cle.startsWith("projet-") ? budgets._defautProjet ?? DEFAUT_PROJET : null);
async function garde(cle, fournisseur) {
  if (!racine) return;
  const budgets = await lireJson(join(racine, "couts", "budgets.json"), {});
  const plafond = plafondDe(budgets, cle);
  if (plafond == null) return;
  const { dollars } = await depenseDe(cle);
  const engage = engages.get(cle) ?? 0;
  if (dollars + engage + (RESERVE[fournisseur] ?? 0) > plafond) {
    const qui = cle.startsWith("projet-") ? "ce projet" : cle.startsWith("produit-") ? "ce produit" : "cette partie de l'atelier";
    throw new BudgetAtteint(`Plafond de dépense atteint pour ${qui} : ≈ ${dollars.toFixed(2)} $ dépensés${engage ? ` + ${engage.toFixed(2)} $ en cours` : ""} sur ${plafond} $. Rien n'a été facturé pour cette demande. Pour continuer, augmente le plafond (panneau « Dépense IA »).`);
  }
}

function nombre(t, cle) {
  let n = 0;
  for (const m of String(t).matchAll(new RegExp(`"${cle}"\\s*:\\s*(\\d+)`, "g"))) n = Math.max(n, Number(m[1]));
  return n;
}
async function noter(st, fournisseur, url, corps, statut, texte) {
  if (!racine) return;
  let modele = "";
  try {
    modele = JSON.parse(corps).model ?? "";
  } catch {}
  if (!modele) modele = /models\/([^:/?]+)/.exec(url)?.[1] ?? fournisseur;
  const ligne = { le: new Date().toISOString(), fournisseur, modele, route: st.route ?? "", statut, entree: 0, sortie: 0, appelsWh: 0 };
  if (fournisseur === "openai") {
    let b = null;
    try {
      b = JSON.parse(texte);
    } catch {}
    if (b?.usage) {
      // Champs officiels : usage.input_tokens / output_tokens (responses) ou prompt / completion (chat).
      ligne.entree = b.usage.input_tokens ?? b.usage.prompt_tokens ?? 0;
      ligne.sortie = b.usage.output_tokens ?? b.usage.completion_tokens ?? 0;
      // Appels d'outils WinningHunter : un par identifiant.
      ligne.appelsWh = new Set((b.output ?? []).filter((o) => o.type === "mcp_call" && (!o.server_label || o.server_label === "winninghunter")).map((o, i) => o.id ?? i)).size;
    } else {
      ligne.entree = nombre(texte, "input_tokens") || nombre(texte, "prompt_tokens");
      ligne.sortie = nombre(texte, "output_tokens") || nombre(texte, "completion_tokens");
      ligne.inconnu = !ligne.entree && !ligne.sortie;
    }
  } else if (fournisseur === "gemini") {
    ligne.entree = nombre(texte, "promptTokenCount");
    ligne.sortie = nombre(texte, "candidatesTokenCount");
  } else if (fournisseur === "anthropic") {
    ligne.entree = nombre(texte, "input_tokens");
    ligne.sortie = nombre(texte, "output_tokens");
  } else if (fournisseur === "winninghunter") {
    // MCP : seuls les appels d'outils comptent ; API REST : chaque appel.
    if (/\/mcp/.test(url) && !/"tools\/call"/.test(corps)) return;
    ligne.appelsWh = 1;
  }
  if (statut >= 400 && !ligne.entree && !ligne.sortie && !ligne.appelsWh) return;
  const cle = await cleDe(st);
  if (cle !== "general") ligne.cle = cle;
  const dir = join(racine, "couts");
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, `${cle}.jsonl`), JSON.stringify(ligne) + "\n");
  depenses.delete(cle);
  // Un produit lancé compte aussi dans son projet : on vide tout le cache (petit).
  if (cle.startsWith("produit-")) depenses.clear();
}
// À qui imputer : projet (ou projet de la page), sinon produit de la grille, sinon recherche.
async function cleDe(st) {
  if (st.projet) return `projet-${st.projet}`;
  if (st.page) {
    try {
      const p = JSON.parse(await readFile(join(racine, "pages", `${st.page}.json`), "utf8")).root?.props?.projet;
      if (p && ID.test(p)) return `projet-${p}`;
    } catch {}
    if (/^projet-/.test(st.page)) return st.page;
  }
  if (st.candidat) return `produit-${st.candidat}`;
  if (st.recherche) return "recherche";
  return "general";
}

// ---- Lecture : totaux pour un projet (avec les produits lancés dedans), un produit, la recherche ----
async function lignes(root, cle) {
  const f = join(root, "couts", `${cle}.jsonl`);
  if (!existsSync(f)) return [];
  return (await readFile(f, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
const lireJson = async (f, d) => {
  try {
    return JSON.parse(await readFile(f, "utf8"));
  } catch {
    return d;
  }
};
export async function resumeCouts(root, cle) {
  const prix = await lireJson(join(root, "couts", "prix.json"), {});
  const budgets = await lireJson(join(root, "couts", "budgets.json"), {});
  const cles = [cle];
  // Projet : les coûts de la recherche du produit lancé dedans comptent aussi.
  if (cle.startsWith("projet-")) {
    const { listerCandidats } = await import("./candidats.mjs");
    for (const c of await listerCandidats(root)) if (c.lance === cle.slice(7)) cles.push(`produit-${c.id}`);
  }
  const toutes = (await Promise.all(cles.map((k) => lignes(root, k)))).flat().sort((a, b) => String(b.le).localeCompare(String(a.le)));
  const parModele = {};
  const total = { entree: 0, sortie: 0, appelsWh: 0, appels: 0, dollars: 0, sansPrix: 0 };
  for (const l of toutes) {
    const m = (parModele[l.modele] ??= { modele: l.modele, fournisseur: l.fournisseur, entree: 0, sortie: 0, appelsWh: 0, appels: 0 });
    for (const k of ["entree", "sortie", "appelsWh"]) (m[k] += l[k] ?? 0), (total[k] += l[k] ?? 0);
    m.appels++;
    total.appels++;
  }
  for (const m of Object.values(parModele)) {
    const p = prix[m.modele] ?? {};
    // Un tarif manquant pour une partie consommée = coût inconnu (jamais compté zéro).
    const complet = (!m.entree || p.entree != null) && (!m.sortie || p.sortie != null);
    if ((m.entree || m.sortie) && complet) {
      const brut = (m.entree * (p.entree ?? 0) + m.sortie * (p.sortie ?? 0)) / 1e6;
      total.dollars += brut;
      m.dollars = Math.round(brut * 100) / 100;
    } else if (m.entree || m.sortie) total.sansPrix += m.entree + m.sortie;
  }
  total.dollars = Math.round(total.dollars * 100) / 100;
  return { cle, total, parModele: Object.values(parModele).sort((a, b) => b.entree + b.sortie - (a.entree + a.sortie)), derniers: toutes.slice(0, 15), prix, budget: plafondDe(budgets, cle), budgetDefaut: budgets[cle] == null && cle.startsWith("projet-"), depuis: toutes.at(-1)?.le ?? null };
}

export async function coutsRoute(req, res, parts, { root, readBody, json }) {
  const { writeAtomic, lockFile } = await import("./commun.mjs");
  // POST /api/couts/prix { modele, entree, sortie } ($ par million de tokens)
  if (req.method === "POST" && parts[1] === "prix") {
    const b = (await readBody(req).catch(() => ({}))) || {};
    const modele = String(b.modele ?? "").slice(0, 80);
    if (!modele) return json(res, 400, { error: "Modèle manquant." });
    const f = join(root, "couts", "prix.json");
    const n = (v) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
    const e = n(b.entree);
    const s = n(b.sortie);
    if ((e != null && !(Number.isFinite(e) && e >= 0)) || (s != null && !(Number.isFinite(s) && s >= 0))) return json(res, 400, { error: "Prix invalide." });
    await lockFile(f, async () => {
      const p = await lireJson(f, {});
      p[modele] = { entree: e, sortie: s };
      await mkdir(join(root, "couts"), { recursive: true });
      await writeAtomic(f, JSON.stringify(p, null, 1) + "\n");
    });
    return json(res, 200, { ok: true });
  }
  const cle = parts[1] ?? "";
  if (!/^(projet|produit)-[a-z0-9-]{1,95}$|^recherche$|^general$/.test(cle)) return json(res, 400, { error: "Clé invalide." });
  // POST /api/couts/<clé>/budget { dollars }
  if (req.method === "POST" && parts[2] === "budget") {
    const b = (await readBody(req).catch(() => ({}))) || {};
    const v = b.dollars === "" || b.dollars == null ? null : Number(String(b.dollars).replace(",", "."));
    if (v != null && !(Number.isFinite(v) && v >= 0)) return json(res, 400, { error: "Budget invalide." });
    const f = join(root, "couts", "budgets.json");
    await lockFile(f, async () => {
      const bu = await lireJson(f, {});
      depenses.delete(cle);
      if (v == null) delete bu[cle];
      else bu[cle] = v;
      await mkdir(join(root, "couts"), { recursive: true });
      await writeAtomic(f, JSON.stringify(bu, null, 1) + "\n");
    });
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET") return json(res, 200, await resumeCouts(root, cle));
  return json(res, 405, { error: "Méthode refusée." });
}
