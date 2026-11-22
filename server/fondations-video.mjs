// Fondations (2026-11-22) : analyse d'une pub vidéo de concurrent par Gemini.
// POST /api/fondations-video { projet, url } → { analyse } (Markdown, français).
// Vidéo ≤ 18 Mo : envoyée dans la requête ; au-delà, par l'API Fichiers de
// Google (envoi, puis attente que le fichier soit prêt).
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, basename } from "node:path";
import { loadEnv } from "vite";

const MODEL = process.env.FONDATIONS_VIDEO_MODEL || "gemini-3.5-flash";
const API = "https://generativelanguage.googleapis.com";

export async function fondationsVideo(req, res, { root, readBody, json }) {
  const b = await readBody(req);
  const url = String(b.url ?? "").split("?")[0];
  if (!/^\/medias\/[\w./-]+\.(mp4|webm|mov)$/i.test(url) || url.includes("..")) return json(res, 400, { error: "Vidéo invalide." });
  const file = join(root, normalize(url));
  if (!existsSync(file)) return json(res, 404, { error: "Vidéo introuvable." });
  const env = loadEnv("development", root, "");
  const key = env.GEMINI_API_KEY;
  if (!key) return json(res, 400, { error: "Clé Google absente (GEMINI_API_KEY dans .env.local)." });
  let projet = {};
  if (/^[a-z0-9][a-z0-9-]*$/.test(b.projet ?? "")) {
    try {
      projet = JSON.parse(await readFile(join(root, "projets", `${b.projet}.json`), "utf8"));
    } catch {}
  }
  const r = projet.fondations?.reponses ?? {};
  const produit = (projet.produit && typeof projet.produit === "object" ? projet.produit.nom : projet.produit) || projet.nom || "ton produit";
  const mime = /\.webm$/i.test(file) ? "video/webm" : /\.mov$/i.test(file) ? "video/quicktime" : "video/mp4";
  try {
    const size = (await stat(file)).size;
    let part;
    if (size <= 18 * 1024 * 1024) {
      part = { inline_data: { mime_type: mime, data: (await readFile(file)).toString("base64") } };
    } else {
      part = { file_data: { mime_type: mime, file_uri: await uploadFile(key, file, size, mime) } };
    }
    const prompt = [
      "Tu analyses une publicité vidéo d'un concurrent pour en tirer les angles marketing.",
      `Le produit de l'utilisateur : ${produit}${r.role ? ` (${r.role})` : ""}.${r.qui ? ` Ses clients : ${r.qui}.` : ""}`,
      "Réponds en français (Québec), en texte simple avec ces rubriques, chacune sur une ligne qui commence par son nom suivi de deux-points :",
      "Accroche (les 3 premières secondes : ce qu'on voit, ce qu'on entend, le texte à l'écran mot pour mot)",
      "Angle (la porte d'entrée : douleur, désir, peur, identité, curiosité, comparaison, autorité…)",
      "Promesse",
      "Pour qui",
      "Douleurs évoquées",
      "Preuves montrées (démonstration, avis, chiffres, avant/après…)",
      "Objections traitées",
      "Offre et appel à l'action",
      "Format et rythme (UGC, démonstration, mème, témoignage, avant/après ; nombre de plans, durée)",
      "Script (voix off et textes à l'écran, minutés)",
      "Pourquoi ça marche",
      `À reprendre pour ${produit} (2 ou 3 angles transposés, concrets, sans inventer de preuve, de chiffre ni d'avis)`,
      "Ne devine pas ce qui n'est ni visible ni audible : écris [pas visible]. Pas de tiret long.",
    ].join("\n");
    const resp = await fetch(`${API}/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [part, { text: prompt }] }] }),
      signal: AbortSignal.timeout(170000),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`Google (${resp.status}) : ${String(body.error?.message ?? "erreur inconnue").slice(0, 200)}`);
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) throw new Error("réponse vide de Gemini");
    console.log(`[fondations-video] ${basename(file)} analysée (${Math.round(size / 1024)} Ko)`);
    return json(res, 200, { analyse: text });
  } catch (e) {
    console.log(`[fondations-video] erreur : ${e.message}`);
    return json(res, 500, { error: e.message });
  }
}

async function uploadFile(key, file, size, mime) {
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(size), "X-Goog-Upload-Header-Content-Type": mime, "Content-Type": "application/json" },
    body: JSON.stringify({ file: { display_name: basename(file) } }),
  });
  const up = start.headers.get("x-goog-upload-url");
  if (!start.ok || !up) throw new Error(`envoi de la vidéo à Google refusé (${start.status})`);
  const done = await fetch(up, { method: "POST", headers: { "Content-Length": String(size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" }, body: await readFile(file) });
  const info = await done.json().catch(() => ({}));
  if (!done.ok || !info.file?.uri) throw new Error(`envoi de la vidéo à Google échoué (${done.status})`);
  let f = info.file;
  for (let i = 0; i < 40 && f.state && f.state !== "ACTIVE"; i++) {
    if (f.state === "FAILED") throw new Error("Google n'a pas pu lire la vidéo");
    await new Promise((ok) => setTimeout(ok, 2000));
    f = await fetch(`${API}/v1beta/${f.name}`, { headers: { "x-goog-api-key": key } }).then((r) => r.json());
  }
  return f.uri;
}
