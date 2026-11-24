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
- Cherche sur le web : demande réelle (recherches, ventes, boutiques, pubs actives), tendance (Google Trends, TikTok, saisonnalité), concurrents directs (prix, angles), coût d'achat probable (AliExpress, Alibaba).
- Distingue toujours ce que tu as OBSERVÉ (avec source) de ce que tu ESTIMES. Ne présente jamais une estimation comme un fait.
- Les « preuves » du projet sont les seules affirmations autorisées pour ce produit ; la « recherche » concurrente ne prouve rien pour lui.
- Réponds en français, UNIQUEMENT avec un objet JSON valide (pas de texte autour, pas de Markdown), de la forme :
{"verdict":"GO|GO_CONDITIONS|NO_GO","score":0-10,"resume":"2 phrases",
 "demande":{"niveau":"forte|moyenne|faible|inconnue","constats":["… (source)"]},
 "tendance":{"direction":"hausse|stable|baisse|inconnue","saison":"…","constats":["…"]},
 "concurrence":{"niveau":"saturée|forte|moyenne|faible|inconnue","acteurs":[{"nom":"…","prix":"…","angle":"…"}],"constats":["…"]},
 "marge":{"prixMarche":"…","coutEstime":"…","commentaire":"…"},
 "risques":["…"],"conditions":["…"],"aVerifier":["…"],"prochainesActions":["…"]}`;

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
    const instructions = consigne + ADAPTER + "\n\n---\n" + contexteProjet(p, { limite: 14000 }).texte;
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
    const resultat = extraireJson(text);
    await ecrire(etatFile, { statut: "pret", resultat, sources, le: new Date().toISOString() });
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
