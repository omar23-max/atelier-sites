// Publicités images guidées (refonte guidée, lot 4, 2026-11-23).
// GET  /api/publicites/<projet>          → { pubs: [...] } (les plus récentes d'abord)
// POST /api/publicites/<projet>          → { mode, source?, refs?, format?, consigne? } : lance une pub
// DELETE /api/publicites/<projet>/<id>   → retire une pub de la liste (l'image reste dans les médias)
// Étape 1 : l'agent du mode (consigne nettoyée) + le contexte unique du projet
//   (+ l'image source) → idée, accroche, textes visibles, promesses remplacées,
//   prompt d'image. Contrôle des promesses (audit ST01) : seules les preuves du
//   projet peuvent apparaître ; celles du concurrent sont remplacées ou retirées.
// Étape 2 : Nano Banana génère l'image avec les références produit et marque.
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MODEL = "gpt-5.5";
export const MODES = {
  rebuild: { label: "Refaire une pub concurrente", agent: "shopfunnels-ai-ad-rebuilder-v-3", source: true },
  replicator: { label: "Reprendre une pub gagnante", agent: "shopfunnels-ai-winning-ad-replicator", source: true },
  ugc: { label: "Photo UGC réaliste", agent: "whitelabeler-hyper-realistic-ugc-image-studio-v-1" },
  mockup: { label: "Mise en scène du produit", agent: "whitelabeler-product-mockup-generator-v-1" },
  marque: { label: "Image aux couleurs de la marque", agent: "whitelabeler-branded-image-creator-v-1" },
  scroll: { label: "Pub qui arrête le défilement", agent: "shopfunnels-ai-scroll-stopping-image-ad-specialists" },
  transformation: { label: "Avant / après", agent: "shopfunnels-ai-transformation-image-ad-generator" },
};

const ADAPTER = `

---
CONSIGNES DE L'ATELIER (prioritaires sur ce qui précède)
- Une seule réponse, sans question : le produit, l'offre, la marque et les preuves sont dans le contexte du projet ci-dessous.
- Tu ne génères pas l'image toi-même : tu écris le prompt (en anglais) pour Nano Banana, qui recevra l'image source éventuelle (#1) puis les images de référence du produit et de la marque.
- CONTRÔLE DES PROMESSES : sur l'image finale, aucun chiffre, note, nombre d'avis, étude, certification, promesse médicale ou « cliniquement prouvé » qui ne figure pas dans les « preuves » du projet. Une promesse de la pub d'origine est REMPLACÉE par la preuve équivalente du projet si elle existe, sinon reformulée en bénéfice sans chiffre, sinon retirée. Liste chaque remplacement.
- Avant / après et UGC : ce sont des visuels de démonstration, jamais présentés comme de vrais clients ou de vrais résultats.
- Garde la force de l'idée (composition, accroche, contraste) : on remplace les promesses, on ne vide pas la pub.
- Réponds UNIQUEMENT avec un objet JSON valide :
{"idee":"en 1 phrase, ce qui fait marcher cette pub","accroche":"titre sur l'image (langue du marché du projet)","cta":"bouton ou null","textesVisibles":["tous les textes lisibles prévus sur l'image"],"remplacements":[{"origine":"promesse de la pub d'origine","remplacement":"ce qui la remplace (ou « retirée »)","raison":"preuve du projet utilisée ou pourquoi"}],"prompt":"prompt anglais complet pour Nano Banana","format":"4:5|1:1|9:16"}`;

const lireJson = async (f, d) => (existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : d);
async function ecrire(file, data) {
  const tmp = `${file}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 1) + "\n", "utf8");
  await rename(tmp, file);
}
// Une écriture à la fois par projet (plusieurs pubs peuvent tourner ensemble).
const verrous = new Map();
function sousVerrou(cle, fn) {
  const next = (verrous.get(cle) ?? Promise.resolve()).then(fn, fn);
  verrous.set(cle, next.catch(() => {}));
  return next;
}
const majPub = (file, id, patch) =>
  sousVerrou(file, async () => {
    const d = await lireJson(file, { pubs: [] });
    d.pubs = d.pubs.map((p) => (p.id === id ? { ...p, ...patch } : p));
    await ecrire(file, d);
  });

async function imageData(root, url) {
  const { execFile } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { rm } = await import("node:fs/promises");
  const file = join(root, decodeURIComponent(String(url).split("?")[0]));
  if (!existsSync(file)) return null;
  const tmp = join(tmpdir(), `pub-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  try {
    await new Promise((ok, ko) => execFile("vipsthumbnail", [file, "-s", "1024x1024", "-o", `${tmp}[Q=82]`], (e) => (e ? ko(e) : ok())));
    return `data:image/jpeg;base64,${(await readFile(tmp)).toString("base64")}`;
  } catch {
    return null;
  } finally {
    rm(tmp, { force: true }).catch(() => {});
  }
}

async function produire(root, projet, file, pub) {
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", root, "");
  try {
    if (!env.OPENAI_API_KEY) throw new Error("Clé OpenAI absente (OPENAI_API_KEY).");
    const mode = MODES[pub.mode];
    const p = JSON.parse(await readFile(join(root, "projets", `${projet}.json`), "utf8"));
    const { contexteProjet } = await import("../src/engine/contexte-projet.js");
    const dir = join(root, "agents", "whitelabeler");
    const propre = join(dir, "consignes-propres", `${mode.agent}.txt`);
    const orig = join(dir, "consignes", `${mode.agent}.txt`);
    const consigne = existsSync(propre) ? await readFile(propre, "utf8") : existsSync(orig) ? await readFile(orig, "utf8") : "";
    const instructions = consigne + ADAPTER + "\n\n---\n" + contexteProjet(p, { limite: 12000 }).texte;
    const content = [{ type: "input_text", text: [`Mode : ${mode.label}.`, pub.source ? "Image jointe = la pub d'origine (#1) à adapter à notre produit." : "Pas d'image d'origine : crée la pub à partir du projet.", pub.refs?.length ? `${pub.refs.length} image(s) de référence du produit / de la marque seront jointes à Nano Banana.` : "", pub.format ? `Format voulu : ${pub.format}.` : "", pub.consigne ? `Demande de l'utilisateur : ${pub.consigne}` : "", pub.depuisTexte ? `\nCONVERSATION : l'utilisateur a discuté avec toi (même méthode d'agent). Voici ta réponse qu'il veut transformer en image. Reprends fidèlement CETTE proposition (si plusieurs options sont décrites : celle que l'utilisateur désigne dans sa demande, sinon la première) et rends-la dans le format JSON demandé, sans changer l'idée ni ajouter de promesse :\n"""\n${pub.depuisTexte}\n"""` : "", pub.note && pub.planPrecedent ? `\nCORRECTION DEMANDÉE : voici ta proposition précédente :\n${JSON.stringify(pub.planPrecedent)}\nL'utilisateur demande : « ${pub.note} ». Refais la proposition en appliquant cette demande ; garde ce qu'elle ne touche pas. Mêmes règles de promesses.` : ""].filter(Boolean).join("\n") }];
    if (pub.source) {
      const d = await imageData(root, pub.source);
      if (d) content.push({ type: "input_image", image_url: d });
    }
    await majPub(file, pub.id, { etape: "L'agent prépare la pub…" });
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, instructions, input: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(6 * 60 * 1000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`OpenAI (${res.status}) : ${String(body.error?.message ?? "erreur").slice(0, 300)}`);
    const text = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).filter((x) => x.type === "output_text").map((x) => x.text).join("\n");
    const i = text.indexOf("{");
    const j = text.lastIndexOf("}");
    if (i < 0 || j <= i) throw new Error("L'agent n'a pas rendu de plan lisible.");
    const plan = JSON.parse(text.slice(i, j + 1));
    // Lot B (2026-11-24) : « Proposer » s'arrête ici ; l'utilisateur relit et
    // corrige l'accroche, les textes et le prompt, puis lance « Générer ».
    if (pub.arret === "plan") {
      await majPub(file, pub.id, { plan, statut: "plan", etape: null, planLe: new Date().toISOString() });
      return;
    }
    await majPub(file, pub.id, { plan });
    await generer(root, projet, file, { ...pub, plan }, env);
  } catch (e) {
    await majPub(file, pub.id, { statut: "erreur", erreur: e.message, etape: null });
  }
}

const AGENT_NOMS = { rebuild: "AI Ad Rebuilder V3", replicator: "AI Winning Ad Replicator", ugc: "Hyper Realistic UGC Image Studio", mockup: "Product Mockup Generator", marque: "Branded Image Creator", scroll: "Scroll-Stopping Image Ad Specialists", transformation: "AI Transformation Image Ad Generator" };
const MODELES_IMG = { "nano-banana": "Nano Banana", "nano-banana-pro": "Nano Banana Pro", "gpt-image-2": "GPT Image 2" };
const DEST_MODE = { mockup: ["produit", "pub"], ugc: ["pub"], marque: ["marque", "pub"] };
async function generer(root, projet, file, pub, env) {
  const plan = pub.plan ?? {};
  const modele = MODELES_IMG[pub.modele] ? pub.modele : "nano-banana";
  try {
    if (!env) {
      const { loadEnv } = await import("vite");
      env = loadEnv("development", root, "");
    }
    await majPub(file, pub.id, { statut: "en cours", erreur: null, etape: `${MODELES_IMG[modele]} génère l'image… (20 à 60 s)`, le: new Date().toISOString() });
    const { studioImage } = await import("../scripts/lib/ia.mjs");
    const { mediaPlace } = await import("./commun.mjs");
    const folder = await mediaPlace(`projet-${projet}`, "images-creees");
    await mkdir(folder.dir, { recursive: true });
    const regles = ` Visible text on the image must be exactly: ${JSON.stringify(plan.textesVisibles ?? [])}. No other number, rating, review count, certification, price or medical claim. Never keep the original brand name or logo. Output only the finished ad, one single image.`;
    const out = await studioImage({ openaiKey: env.OPENAI_API_KEY, geminiKey: env.GEMINI_API_KEY, root, source: pub.source || null, references: (pub.refs ?? []).slice(0, 6), prompt: String(plan.prompt ?? "") + regles, format: pub.format || plan.format || "4:5", model: modele, folder });
    await majPub(file, pub.id, { statut: "pret", image: out.url, etape: null, finiLe: new Date().toISOString() });
    try {
      const { noterFiche } = await import("./mediatheque.mjs");
      await noterFiche(root, `projet-${projet}`, out.url, { type: "image", provenance: "creee", sous: "agent", choix: "brouillon", destination: DEST_MODE[pub.mode] ?? ["pub"], origine: { source: pub.origine === "canvas" ? "Canvas · Créer avec un agent" : "Publicités", agent: AGENT_NOMS[pub.mode] ?? MODES[pub.mode]?.label ?? pub.mode, besoin: MODES[pub.mode]?.label, consigne: plan.accroche ? `${plan.idee ?? ""} · « ${plan.accroche} »` : pub.consigne || "", depuis: pub.source || null, modele: MODELES_IMG[modele], references: pub.refs ?? [] } });
    } catch {}
  } catch (e) {
    await majPub(file, pub.id, { statut: "erreur", erreur: e.message, etape: null });
  }
}

// ---- Studio : un agent écrit le prompt de chaque image (lot E, 2026-11-24) ----
// Mode Miroir : agents de recréation fidèle ; mode Pub : agents de pub. L'agent
// reçoit le prompt de l'atelier (règles produit, marque, preuves), la photo
// d'origine et le contexte du projet, et rend le prompt final pour le modèle.
export const STUDIO_AGENTS = {
  "whitelabeler-image-mirror-studio-v-1": "Image Mirror Studio V.1",
  "whitelabeler-style-mirror-image-creator-v-1": "Style Mirror Image Creator V.1",
  "shopfunnels-ai-image-recreator": "AI Image Recreator",
  "whitelabeler-product-mockup-generator-v-1": "Product Mockup Generator",
  "whitelabeler-hyper-realistic-ugc-image-studio-v-1": "Hyper Realistic UGC Image Studio",
  "shopfunnels-ai-scroll-stopping-image-ad-specialists": "Scroll-Stopping Image Ad Specialists",
  "shopfunnels-ai-ad-rebuilder-v-3": "AI Ad Rebuilder V3",
  "whitelabeler-branded-image-creator-v-1": "Branded Image Creator",
};
export async function promptParAgent({ root, env, slug, base, source, projet }) {
  if (!STUDIO_AGENTS[slug] || !env.OPENAI_API_KEY) return null;
  const dir = join(root, "agents", "whitelabeler");
  const f = [join(dir, "consignes-propres", `${slug}.txt`), join(dir, "consignes", `${slug}.txt`)].find((x) => existsSync(x));
  if (!f) return null;
  let contexte = "";
  try {
    if (projet) {
      const { contexteProjet } = await import("../src/engine/contexte-projet.js");
      contexte = contexteProjet(JSON.parse(await readFile(join(root, "projets", `${projet}.json`), "utf8")), { limite: 8000 }).texte;
    }
  } catch {}
  const instructions = (await readFile(f, "utf8")).slice(0, 14000) + `

---
CONSIGNES DE L'ATELIER (prioritaires sur ce qui précède)
- Une seule réponse, sans question ni salutation. Tu ne génères pas l'image : tu écris le prompt final (en anglais) pour le modèle d'image, qui recevra la photo d'origine (#1) puis les références produit et marque.
- Pars du PROMPT DE L'ATELIER ci-dessous : garde toutes ses règles (produit identique aux références, marque, aucun nom ou logo d'origine, textes réécrits, aucune promesse hors des preuves du projet) et améliore-le avec ta méthode.
- Réponds UNIQUEMENT avec un objet JSON : {"prompt":"prompt anglais complet","note":"en français, ce que ta méthode a changé, 1 phrase"}
${contexte ? `\n---\n${contexte}` : ""}`;
  const content = [{ type: "input_text", text: `PROMPT DE L'ATELIER :\n${base}` }];
  if (source) {
    const d = await imageData(root, source);
    if (d) content.push({ type: "input_image", image_url: d });
  }
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, instructions, input: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(4 * 60 * 1000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Agent (${res.status}) : ${String(body.error?.message ?? "erreur").slice(0, 200)}`);
  const text = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).filter((x) => x.type === "output_text").map((x) => x.text).join("\n");
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  const out = JSON.parse(text.slice(i, j + 1));
  return out.prompt ? { prompt: String(out.prompt), note: String(out.note ?? ""), agent: STUDIO_AGENTS[slug] } : null;
}

export const SUIVIS = ["idee", "brouillon", "prete", "en-test", "gagnante", "arretee"];

export async function publicitesRoute(req, res, parts, { root, readBody, json }) {
  const projet = parts[1];
  if (!/^[a-z0-9][a-z0-9-]{1,90}$/.test(projet ?? "")) return json(res, 400, { error: "Projet invalide." });
  if (!existsSync(join(root, "projets", `${projet}.json`))) return json(res, 404, { error: "Projet introuvable." });
  const dir = join(root, "projets", "_publicites");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${projet}.json`);
  if (req.method === "GET") {
    const d = await lireJson(file, { pubs: [] });
    // Pub restée « en cours » depuis plus de 15 min (serveur redémarré) : signalée.
    const vieux = Date.now() - 15 * 60 * 1000;
    const pubs = d.pubs
      .map((p) => (p.statut === "en cours" && Date.parse(p.le) < vieux ? { ...p, statut: "erreur", erreur: "Interrompue (serveur redémarré) : relance-la.", etape: null } : p))
      // Lot D (2026-11-24) : suivi de la pub dans le registre, distinct de l'état technique.
      .map((p) => ({ ...p, type: p.type ?? (p.video ? "video" : "image"), suivi: SUIVIS.includes(p.suivi) ? p.suivi : p.statut === "plan" ? "idee" : "brouillon" }));
    return json(res, 200, { modes: Object.fromEntries(Object.entries(MODES).map(([k, m]) => [k, { label: m.label, source: Boolean(m.source), agent: m.agent }])), pubs });
  }
  if (req.method === "DELETE" && parts[2]) {
    await sousVerrou(file, async () => {
      const d = await lireJson(file, { pubs: [] });
      d.pubs = d.pubs.filter((p) => p.id !== parts[2]);
      await ecrire(file, d);
    });
    return json(res, 200, { ok: true });
  }
  // PATCH /api/publicites/<projet>/<id> { suivi, angle, notes, titre } : registre des pubs.
  if (req.method === "PATCH" && parts[2]) {
    const b = await readBody(req);
    const set = {};
    if (SUIVIS.includes(b.suivi)) set.suivi = b.suivi;
    if (typeof b.angle === "string") set.angle = b.angle.slice(0, 200);
    if (typeof b.notes === "string") set.notes = b.notes.slice(0, 2000);
    if (typeof b.titre === "string") set.titre = b.titre.slice(0, 200);
    if (set.suivi) set.suiviLe = new Date().toISOString();
    await majPub(file, parts[2], set);
    return json(res, 200, { ok: true, ...set });
  }
  if (req.method !== "POST") return json(res, 405, { error: "Méthode refusée." });
  const b = await readBody(req);
  // POST /api/publicites/<projet>/<id>/generer { plan, modele } : après « Proposer ».
  // POST /api/publicites/<projet>/<id>/relancer : refait ce qui a échoué.
  // POST /api/publicites/<projet>/ajouter { url, type, poster, titre, angle, origine } :
  // une image ou une vidéo de la médiathèque entre dans le registre des pubs.
  if (parts[2] === "ajouter") {
    const okU = (u) => typeof u === "string" && /^\/medias\//.test(u) && !u.includes("..");
    if (!okU(b.url)) return json(res, 400, { error: "Média invalide." });
    const d0 = await lireJson(file, { pubs: [] });
    const deja = d0.pubs.find((x) => x.image === b.url || x.video === b.url);
    if (deja) return json(res, 200, deja);
    const video = b.type === "video";
    const pub = { id: `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, mode: "ajoutee", type: video ? "video" : "image", [video ? "video" : "image"]: b.url, poster: okU(b.poster) ? b.poster : null, titre: String(b.titre ?? "").slice(0, 200), angle: String(b.angle ?? "").slice(0, 200), origineMedia: b.origine && typeof b.origine === "object" ? { source: String(b.origine.source ?? "").slice(0, 120), agent: String(b.origine.agent ?? "").slice(0, 120), modele: String(b.origine.modele ?? "").slice(0, 80) } : null, format: String(b.format ?? "").slice(0, 20), statut: "pret", suivi: "brouillon", le: new Date().toISOString(), origine: "mediatheque" };
    await sousVerrou(file, async () => {
      const d = await lireJson(file, { pubs: [] });
      d.pubs = [pub, ...d.pubs].slice(0, 300);
      await ecrire(file, d);
    });
    return json(res, 200, pub);
  }
  // POST /api/publicites/<projet>/<id>/variante { note } : même idée, autre version (pubs faites par un agent).
  if (parts[2] && parts[3] === "variante") {
    const d0 = await lireJson(file, { pubs: [] });
    const pub = d0.pubs.find((x) => x.id === parts[2]);
    if (!pub) return json(res, 404, { error: "Pub introuvable." });
    if (!MODES[pub.mode]) return json(res, 400, { error: "Variante possible seulement pour une pub faite par un agent." });
    const note = String(b.note ?? "").trim().slice(0, 600);
    const v = { id: `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, mode: pub.mode, source: pub.source ?? null, refs: pub.refs ?? [], format: pub.format, modele: pub.modele, consigne: `VARIANTE de la pub « ${pub.plan?.accroche ?? ""} » (idée : ${pub.plan?.idee ?? ""}). Garde l'idée et l'angle, change ${note || "l'accroche et la mise en scène"}.`, statut: "en cours", etape: "En file…", le: new Date().toISOString(), origine: pub.origine, parent: pub.id, angle: pub.angle ?? "", suivi: "brouillon" };
    await sousVerrou(file, async () => {
      const d = await lireJson(file, { pubs: [] });
      d.pubs = [v, ...d.pubs].slice(0, 300);
      await ecrire(file, d);
    });
    produire(root, projet, file, v);
    return json(res, 202, v);
  }
  // POST /api/publicites/<projet>/<id>/corriger { note } : l'agent refait sa proposition.
  if (parts[2] && parts[3] === "corriger") {
    const d = await lireJson(file, { pubs: [] });
    const pub = d.pubs.find((x) => x.id === parts[2]);
    if (!pub) return json(res, 404, { error: "Pub introuvable." });
    const note = String(b.note ?? "").trim().slice(0, 800);
    if (!note) return json(res, 400, { error: "Écris ce que tu veux changer." });
    if (!pub.plan) return json(res, 400, { error: "Pas encore de proposition à corriger." });
    const okU = (u) => typeof u === "string" && /^\/medias\//.test(u) && !u.includes("..");
    const next = { ...pub, note, planPrecedent: pub.plan, arret: "plan", statut: "en cours", erreur: null, etape: "L'agent corrige sa proposition…", le: new Date().toISOString(), corrections: [...(pub.corrections ?? []), { note, le: new Date().toISOString() }] };
    if (Array.isArray(b.refs)) next.refs = b.refs.filter(okU).slice(0, 6);
    await majPub(file, pub.id, { note, planPrecedent: pub.plan, arret: "plan", statut: "en cours", erreur: null, etape: next.etape, le: next.le, corrections: next.corrections, refs: next.refs });
    produire(root, projet, file, next);
    return json(res, 202, next);
  }
  if (parts[2] && ["generer", "relancer"].includes(parts[3])) {
    const d = await lireJson(file, { pubs: [] });
    const pub = d.pubs.find((x) => x.id === parts[2]);
    if (!pub) return json(res, 404, { error: "Pub introuvable." });
    if (pub.statut === "en cours" && Date.parse(pub.le) > Date.now() - 15 * 60 * 1000) return json(res, 409, { error: "Déjà en cours." });
    let next = { ...pub };
    if (parts[3] === "generer") {
      const pl = b.plan ?? {};
      const cur = pub.plan ?? {};
      if (!cur.prompt && !pl.prompt) return json(res, 400, { error: "Pas de proposition à générer." });
      next.plan = { ...cur, accroche: typeof pl.accroche === "string" ? pl.accroche.slice(0, 300) : cur.accroche, textesVisibles: Array.isArray(pl.textesVisibles) ? pl.textesVisibles.map((t) => String(t).slice(0, 300)).slice(0, 12) : cur.textesVisibles, prompt: typeof pl.prompt === "string" && pl.prompt.trim() ? pl.prompt.slice(0, 6000) : cur.prompt };
      if (MODELES_IMG[b.modele]) next.modele = b.modele;
      const okU = (u) => typeof u === "string" && /^\/medias\//.test(u) && !u.includes("..");
      if (Array.isArray(b.refs)) next.refs = b.refs.filter(okU).slice(0, 6);
      if (b.source !== undefined && MODES[pub.mode]?.source && okU(b.source)) next.source = b.source;
      if (["4:5", "1:1", "9:16"].includes(b.format)) next.format = b.format;
      next.arret = null;
    }
    await majPub(file, pub.id, { plan: next.plan, modele: next.modele, format: next.format, refs: next.refs, source: next.source, arret: next.arret ?? null, statut: "en cours", erreur: null, etape: "En file…", le: new Date().toISOString() });
    if (next.plan?.prompt && (parts[3] === "generer" || next.arret !== "plan")) generer(root, projet, file, next);
    else produire(root, projet, file, next);
    return json(res, 202, { ...next, statut: "en cours" });
  }
  if (!MODES[b.mode]) return json(res, 400, { error: "Mode inconnu." });
  if (MODES[b.mode].source && !b.source) return json(res, 400, { error: "Ce mode a besoin de la pub d'origine (image)." });
  const okUrl = (u) => typeof u === "string" && /^\/medias\//.test(u) && !u.includes("..");
  const pub = { id: `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, mode: b.mode, source: okUrl(b.source) ? b.source : null, refs: (b.refs ?? []).filter(okUrl).slice(0, 6), format: ["4:5", "1:1", "9:16"].includes(b.format) ? b.format : "4:5", consigne: String(b.consigne ?? "").slice(0, 800), statut: "en cours", etape: "En file…", le: new Date().toISOString(), arret: b.arret === "plan" ? "plan" : null, origine: b.origine === "canvas" ? "canvas" : "publicites", depuisTexte: typeof b.depuisTexte === "string" ? b.depuisTexte.slice(0, 12000) : null, modele: MODELES_IMG[b.modele] ? b.modele : "nano-banana" };
  await sousVerrou(file, async () => {
    const d = await lireJson(file, { pubs: [] });
    d.pubs = [pub, ...d.pubs].slice(0, 200);
    await ecrire(file, d);
  });
  produire(root, projet, file, pub);
  return json(res, 202, pub);
}
