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
    const content = [{ type: "input_text", text: [`Mode : ${mode.label}.`, pub.source ? "Image jointe = la pub d'origine (#1) à adapter à notre produit." : "Pas d'image d'origine : crée la pub à partir du projet.", pub.refs?.length ? `${pub.refs.length} image(s) de référence du produit / de la marque seront jointes à Nano Banana.` : "", pub.format ? `Format voulu : ${pub.format}.` : "", pub.consigne ? `Demande de l'utilisateur : ${pub.consigne}` : ""].filter(Boolean).join("\n") }];
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
    await majPub(file, pub.id, { plan, etape: "Nano Banana génère l'image… (20 à 60 s)" });
    const { studioImage } = await import("../scripts/lib/ia.mjs");
    const { mediaPlace } = await import("./commun.mjs");
    const folder = await mediaPlace(`projet-${projet}`, "images-creees");
    await mkdir(folder.dir, { recursive: true });
    const regles = ` Visible text on the image must be exactly: ${JSON.stringify(plan.textesVisibles ?? [])}. No other number, rating, review count, certification, price or medical claim. Never keep the original brand name or logo. Output only the finished ad, one single image.`;
    const out = await studioImage({ openaiKey: env.OPENAI_API_KEY, geminiKey: env.GEMINI_API_KEY, root, source: pub.source || null, references: (pub.refs ?? []).slice(0, 6), prompt: String(plan.prompt ?? "") + regles, format: pub.format || plan.format || "4:5", model: "nano-banana", folder });
    await majPub(file, pub.id, { statut: "pret", image: out.url, etape: null, finiLe: new Date().toISOString() });
  } catch (e) {
    await majPub(file, pub.id, { statut: "erreur", erreur: e.message, etape: null });
  }
}

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
    const pubs = d.pubs.map((p) => (p.statut === "en cours" && Date.parse(p.le) < vieux ? { ...p, statut: "erreur", erreur: "Interrompue (serveur redémarré) : relance-la.", etape: null } : p));
    return json(res, 200, { modes: Object.fromEntries(Object.entries(MODES).map(([k, m]) => [k, { label: m.label, source: Boolean(m.source) }])), pubs });
  }
  if (req.method === "DELETE" && parts[2]) {
    await sousVerrou(file, async () => {
      const d = await lireJson(file, { pubs: [] });
      d.pubs = d.pubs.filter((p) => p.id !== parts[2]);
      await ecrire(file, d);
    });
    return json(res, 200, { ok: true });
  }
  if (req.method !== "POST") return json(res, 405, { error: "Méthode refusée." });
  const b = await readBody(req);
  if (!MODES[b.mode]) return json(res, 400, { error: "Mode inconnu." });
  if (MODES[b.mode].source && !b.source) return json(res, 400, { error: "Ce mode a besoin de la pub d'origine (image)." });
  const okUrl = (u) => typeof u === "string" && /^\/medias\//.test(u) && !u.includes("..");
  const pub = { id: `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, mode: b.mode, source: okUrl(b.source) ? b.source : null, refs: (b.refs ?? []).filter(okUrl).slice(0, 6), format: ["4:5", "1:1", "9:16"].includes(b.format) ? b.format : "4:5", consigne: String(b.consigne ?? "").slice(0, 800), statut: "en cours", etape: "En file…", le: new Date().toISOString() };
  await sousVerrou(file, async () => {
    const d = await lireJson(file, { pubs: [] });
    d.pubs = [pub, ...d.pubs].slice(0, 200);
    await ecrire(file, d);
  });
  produire(root, projet, file, pub);
  return json(res, 202, pub);
}
