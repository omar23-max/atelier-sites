// Validation produit (refonte guidée, lot 3, 2026-11-23).
// GET  /api/validation/<projet>  → état { statut, resultat, sources, le, erreur }
// POST /api/validation/<projet>  → lance l'analyse (une seule à la fois par projet)
// L'agent Product Validator (consigne nettoyée) + le contexte unique du projet
// + la recherche web → un verdict structuré : GO / GO avec conditions / NON,
// demande, tendance, concurrence, marge, risques, à vérifier.
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MODEL = "gpt-5.5";
const enCours = new Set();

const ADAPTER = `

---
CONSIGNES DE L'ATELIER (prioritaires sur ce qui précède)
- Tu travailles en UNE seule réponse, sans poser de question : le produit est décrit dans le contexte du projet ci-dessous.
- Winning Hunter EST connecté ici : ses données (pubs actives, durées de diffusion, annonceurs, dépenses) sont fournies plus bas, déjà relevées. Utilise-les en priorité pour l'activité publicitaire, la concentration des gagnants, les boutiques et la saturation, et marque-les [WH]. Le web reste obligatoire pour la demande, Amazon, TikTok, Reddit et les tendances, marqué [WEB].
- Les avis et mots des clients collés par l'utilisateur (Amazon, Reddit, avis…) sont dans la « recherche » du projet : sers-t'en pour la demande, le ressenti et les objections.
- Cherche sur le web : demande réelle (recherches, ventes, boutiques, pubs actives), tendance (Google Trends, TikTok, saisonnalité), concurrents directs (prix, angles), coût d'achat probable (AliExpress, Alibaba).
- Distingue toujours ce que tu as OBSERVÉ (avec source) de ce que tu ESTIMES. Ne présente jamais une estimation comme un fait.
- Les « preuves » du projet sont les seules affirmations autorisées pour ce produit ; la « recherche » concurrente ne prouve rien pour lui.
- Le produit validé est celui de l'utilisateur (sa marque peut être nouvelle) : le scan « Boutiques » regarde les boutiques concurrentes qui vendent ce type de produit (sérieux, avis, revenus), pas la sienne.
- Réponds en français, UNIQUEMENT avec un objet JSON valide (pas de texte autour, pas de Markdown), de la forme :
{"verdict":"GO|GO_CONDITIONS|ALTERNATIVES|NO_GO","score":0-10 (pondéré comme ta consigne : 8+ GO, 6,5 à 7,9 GO_CONDITIONS, 4 à 6,4 ALTERNATIVES, moins de 4 NO_GO),"resume":"2 phrases",
 "demande":{"niveau":"forte|moyenne|faible|inconnue","constats":["… (source)"]},
 "tendance":{"direction":"hausse|stable|baisse|inconnue","saison":"…","constats":["…"]},
 "concurrence":{"niveau":"saturée|forte|moyenne|faible|inconnue","acteurs":[{"nom":"…","prix":"…","angle":"…"}],"constats":["…"]},
 "marge":{"prixMarche":"…","coutEstime":"…","commentaire":"…"},
 "signaux":[{"nom":"Demande|Activité pub|Concentration des gagnants|Boutiques|Saturation|Adéquation Meta","note":0-10,"source":"WEB|WH|WEB+WH","constat":"…"}],
 "risques":["…"],"conditions":["…"],"aVerifier":["…"],"prochainesActions":["…"]}`;

// ---- WinningHunter (2026-11-23) : données publicitaires réelles pour les
// scans 2 à 5 de l'agent (activité pub, gagnants, boutiques, saturation).
// 1 crédit par mot-clé (30 pubs actives max par recherche).
// Annonceurs hors sujet (2026-11-23) : la recherche par mot-clé ramène aussi
// des pubs qui citent juste l'expression (école, avocat, garage…). L'IA garde
// seulement ceux qui vendent ce type de produit.
async function annonceursPertinents(env, produit, ads) {
  const marques = {};
  for (const a of ads) {
    const m = a.pageName || "?";
    if (!marques[m]) marques[m] = `${m} — ${String(a.landingurl || a.landing_url || a.link_url || "").slice(0, 60)} — « ${String(a.adtext ?? a.text ?? a.body ?? "").replace(/\s+/g, " ").slice(0, 140)} »`;
  }
  const liste = Object.values(marques);
  if (!liste.length || !env.OPENAI_API_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: [{ role: "user", content: [{ type: "input_text", text: `Product type being validated: ${produit}\nAdvertisers found by keyword (name — landing page — ad text):\n${liste.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n\nKeep ONLY advertisers that sell this type of product themselves (direct competitors). Exclude those that only mention it (schools, services, events, unrelated shops). Answer only JSON: {"garder":["exact advertiser names"]}` }] }] }),
      signal: AbortSignal.timeout(90000),
    });
    const body = await res.json().catch(() => ({}));
    const t = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((x) => x.text ?? "").join("");
    const g = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)).garder ?? [];
    return new Set(g.map(String));
  } catch {
    return null;
  }
}

async function donneesWH(env, motsCles, produit = "") {
  const key = env.WINNINGHUNTER_API_KEY;
  if (!key) return { texte: "WINNINGHUNTER : non connecté (pas de clé).", resume: null };
  const out = [];
  const resume = [];
  for (const mot of motsCles.slice(0, 3)) {
    try {
      const un = async (tri) => {
        const params = new URLSearchParams({ keyword: mot, sorting: tri, sortdirection: "desc", limit: "20", activestatus: "active" });
        const r = await fetch(`https://app.winninghunter.com/api/v1/adlibrary?${params}`, { headers: { "X-API-Key": key, Accept: "application/json" }, signal: AbortSignal.timeout(60000) });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b?.error ?? b?.message ?? `erreur ${r.status}`);
        return b;
      };
      const [parDepense, parDuree] = [await un("adspend"), await un("longestrunning")];
      const vus = new Set();
      const toutes = [...(parDepense.data ?? []), ...(parDuree.data ?? [])].filter((a) => {
        const k = `${a.pageName}|${a.started}|${String(a.adtext ?? "").slice(0, 40)}`;
        return vus.has(k) ? false : vus.add(k);
      });
      const body = parDepense;
      // Filtre des annonceurs hors sujet (si l'IA ne répond pas : tout est gardé, et dit).
      const garder = await annonceursPertinents(env, produit || mot, toutes);
      const exclus = garder ? [...new Set(toutes.filter((a) => !garder.has(a.pageName || "?")).map((a) => a.pageName || "?"))] : [];
      const ads = garder ? toutes.filter((a) => garder.has(a.pageName || "?")) : toutes;
      const jours = (a) => a.daysrunning ?? (a.started ? Math.max(1, Math.round(((a.lastSeen ? new Date(a.lastSeen) : new Date()) - new Date(a.started)) / 86400000)) : null);
      const parMarque = {};
      for (const a of ads) {
        const m = a.pageName || "?";
        const d = parMarque[m] ?? (parMarque[m] = { marque: m, pubs: 0, joursMax: 0, depense: 0, site: null, pays: new Set() });
        d.pubs++;
        d.joursMax = Math.max(d.joursMax, jours(a) ?? 0);
        const dep = Number(a.total_adspend ?? a.total_eu_adspend);
        if (Number.isFinite(dep)) d.depense += dep;
        d.site = d.site ?? (a.landingurl || a.landing_url || a.link_url || null);
        for (const c of [].concat(a.countries ?? a.country ?? [])) if (c) d.pays.add(String(c));
      }
      const marques = Object.values(parMarque).sort((x, y) => y.joursMax - x.joursMax).slice(0, 8);
      const js = ads.map(jours).filter((x) => x != null).sort((x, y) => x - y);
      const median = js.length ? js[Math.floor(js.length / 2)] : null;
      const longues = js.filter((x) => x >= 30).length;
      const total = body.total ?? body.count ?? body.totalCount ?? null;
      const exemples = ads.slice(0, 6).map((a) => `« ${String(a.adtext ?? a.text ?? a.body ?? "").replace(/\s+/g, " ").slice(0, 160)} » (${a.pageName ?? "?"}, ${jours(a) ?? "?"} j)`);
      out.push([
        `Mot-clé « ${mot} » : ${ads.length} pubs actives de vrais concurrents (sur ${toutes.length} relevées : les 20 qui dépensent le plus + les 20 qui tournent depuis le plus longtemps${exclus.length ? ` ; ${exclus.length} annonceur(s) hors sujet écartés : ${exclus.slice(0, 8).join(", ")}` : garder ? "" : " ; tri des hors-sujet indisponible"})${total ? ` (total annoncé par WinningHunter : ${total})` : ""}, ${Object.keys(parMarque).length} annonceurs distincts.`,
        `Durée de diffusion : médiane ${median ?? "?"} jours ; ${longues} pub(s) actives depuis 30 jours ou plus (signe de pubs rentables).`,
        `Annonceurs qui tiennent le plus longtemps : ${marques.map((d) => `${d.marque} (${d.pubs} pub(s), jusqu'à ${d.joursMax} j${d.depense ? `, dépense estimée ${Math.round(d.depense)} $` : ""}${d.site ? `, ${String(d.site).slice(0, 60)}` : ""})`).join(" ; ") || "aucun"}.`,
        exemples.length ? `Exemples de textes de pub : ${exemples.join(" | ")}` : "",
      ].filter(Boolean).join("\n"));
      resume.push({ mot, releves: toutes.length, exclus, pubs: ads.length, annonceurs: Object.keys(parMarque).length, median, longues, total, marques: marques.map((d) => ({ marque: d.marque, pubs: d.pubs, joursMax: d.joursMax, site: d.site })) });
    } catch (e) {
      out.push(`Mot-clé « ${mot} » : WinningHunter indisponible (${String(e.message).slice(0, 120)}).`);
    }
  }
  return { texte: `DONNÉES WINNINGHUNTER (OBSERVÉES le ${new Date().toISOString().slice(0, 10)}, pubs Meta actives ; à citer [WH]) :\n${out.join("\n\n")}`, resume };
}

// Mots-clés produit génériques (en anglais, pour WinningHunter), si
// l'utilisateur n'en a pas donné : une petite demande à l'IA.
async function motsClesAuto(env, p) {
  const f = p.fondations?.reponses ?? {};
  const desc = [p.produit && typeof p.produit === "object" ? p.produit.nom : p.produit, p.description, f.role, f.usage].filter(Boolean).join(" · ").slice(0, 1200);
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: [{ role: "user", content: [{ type: "input_text", text: `Product: ${desc}\nGive 2 short generic English search keywords for this TYPE of product as advertised on Facebook (not the brand name), e.g. "nfc business card". Answer only JSON: {"motsCles":["…","…"]}` }] }] }),
    signal: AbortSignal.timeout(90000),
  });
  const body = await res.json().catch(() => ({}));
  const t = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((x) => x.text ?? "").join("");
  try {
    return (JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)).motsCles ?? []).filter(Boolean).slice(0, 2);
  } catch {
    return [];
  }
}

function extraireJson(t) {
  const s = String(t ?? "");
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i < 0 || j <= i) throw new Error("Réponse de l'IA sans résultat lisible.");
  return JSON.parse(s.slice(i, j + 1));
}

async function ecrire(file, data) {
  const tmp = `${file}.${Date.now().toString(36)}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 1) + "\n", "utf8");
  await rename(tmp, file);
}

async function lancer(root, projet, etatFile) {
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", root, "");
  try {
    if (!env.OPENAI_API_KEY) throw new Error("Clé OpenAI absente (OPENAI_API_KEY).");
    const p = JSON.parse(await readFile(join(root, "projets", `${projet}.json`), "utf8"));
    const { contexteProjet } = await import("../src/engine/contexte-projet.js");
    const dir = join(root, "agents", "whitelabeler");
    const propre = join(dir, "consignes-propres", "whitelabeler-product-validator-v-1.txt");
    const orig = join(dir, "consignes", "whitelabeler-product-validator-v-1.txt");
    const consigne = existsSync(propre) ? await readFile(propre, "utf8") : existsSync(orig) ? await readFile(orig, "utf8") : "Tu es un analyste e-commerce qui valide un produit avant de lancer des pubs.";
    const motsCles = (Array.isArray(p.validationMotsCles) && p.validationMotsCles.filter(Boolean).length ? p.validationMotsCles : await motsClesAuto(env, p)).slice(0, 3);
    const produitType = [p.produit && typeof p.produit === "object" ? p.produit.nom : p.produit, p.description, p.fondations?.reponses?.role].filter(Boolean).join(" · ").slice(0, 400);
    const wh = motsCles.length ? await donneesWH(env, motsCles, produitType) : { texte: "WINNINGHUNTER : aucun mot-clé produit.", resume: null };
    const instructions = consigne + ADAPTER + "\n\n---\n" + contexteProjet(p, { limite: 22000 }).texte + "\n\n---\n" + wh.texte;
    const pays = p.fondations?.reponses?.pays;
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, instructions, input: [{ role: "user", content: [{ type: "input_text", text: `Valide ce produit${pays ? ` pour le marché : ${[].concat(pays).join(", ")}` : ""}. Réponds avec le JSON demandé.` }] }], tools: [{ type: "web_search" }] }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`OpenAI (${res.status}) : ${String(body.error?.message ?? "erreur inconnue").slice(0, 300)}`);
    const out = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
    const text = out.filter((x) => x.type === "output_text").map((x) => x.text).join("\n").trim();
    const sources = [...new Map(out.flatMap((x) => x.annotations ?? []).filter((a) => a.type === "url_citation" && a.url).map((a) => [a.url, { url: a.url, titre: a.title ?? "" }])).values()].slice(0, 15);
    let resultat;
    try {
      resultat = extraireJson(text);
    } catch (e1) {
      // JSON mal formé (guillemets dans un constat…) : une demande courte le répare, sans refaire la recherche.
      const rep = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, text: { format: { type: "json_object" } }, input: [{ role: "user", content: [{ type: "input_text", text: `Repair this into ONE valid JSON object, same keys and content, nothing else:
${text.slice(0, 60000)}` }] }] }),
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
      const rb = await rep.json().catch(() => ({}));
      const t2 = (rb.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).filter((x) => x.type === "output_text").map((x) => x.text).join("");
      resultat = extraireJson(t2);
    }
    await ecrire(etatFile, { statut: "pret", resultat, sources, le: new Date().toISOString(), winninghunter: { motsCles, resume: wh.resume } });
  } catch (e) {
    const avant = existsSync(etatFile) ? JSON.parse(await readFile(etatFile, "utf8").catch(() => "{}")) : {};
    await ecrire(etatFile, { ...avant, statut: "erreur", erreur: e.message, le: avant.le });
  } finally {
    enCours.delete(projet);
  }
}

export async function validationRoute(req, res, parts, { root, json }) {
  const projet = parts[1];
  if (!/^[a-z0-9][a-z0-9-]{1,90}$/.test(projet ?? "")) return json(res, 400, { error: "Projet invalide." });
  if (!existsSync(join(root, "projets", `${projet}.json`))) return json(res, 404, { error: "Projet introuvable." });
  const dir = join(root, "projets", "_validation");
  await mkdir(dir, { recursive: true });
  const etatFile = join(dir, `${projet}.json`);
  const lire = async () => (existsSync(etatFile) ? JSON.parse(await readFile(etatFile, "utf8")) : { statut: "vide" });
  if (req.method === "GET") {
    const e = await lire();
    return json(res, 200, enCours.has(projet) ? { ...e, statut: "en cours" } : e.statut === "en cours" ? { ...e, statut: "erreur", erreur: "Analyse interrompue (serveur redémarré) : relance-la." } : e);
  }
  if (req.method !== "POST") return json(res, 405, { error: "Méthode refusée." });
  if (enCours.has(projet)) return json(res, 409, { error: "La validation est déjà en cours." });
  enCours.add(projet);
  const avant = await lire();
  await ecrire(etatFile, { ...avant, statut: "en cours", lanceLe: new Date().toISOString() });
  lancer(root, projet, etatFile);
  return json(res, 202, { statut: "en cours" });
}
