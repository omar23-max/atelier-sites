// Outils communs du serveur de l'atelier : dossiers, lecture des requêtes,
// réponses JSON (avec ETag), Supabase, vignettes, empreintes des pages.
// (Sortis de vite.config.js le 2026-11-17, audit T6.)
import { defineConfig, loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// Racine de l'atelier (ce fichier est dans server/).
export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const pagesDir = join(root, "pages");
export const sectionsDir = join(root, "sections");
export const trashDir = join(root, "corbeille", "sections");
export const requestsDir = join(root, "demandes");
export const projectsDir = join(root, "projets");
export const importsDir = join(root, "imports");
export const mediasDir = join(root, "medias");
export const NAME = /^[a-z0-9][a-z0-9-]{0,80}$/;
export const TRASH_NAME = /^[a-z0-9][a-z0-9-]{0,80}__\d{8}-\d{6}$/;

export const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

export async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const b = raw ? JSON.parse(raw) : {};
  // Compteur de coûts : le projet, la page ou le produit de la demande.
  try {
    (await import("./couts.mjs")).attribuerCorps(b);
  } catch {}
  return b;
}

// Vignette d'une page (medias/_vignettes/<page>.png) refaite en arrière-plan
// après un enregistrement ; plusieurs enregistrements rapprochés n'en lancent
// qu'une, quelques secondes après le dernier.
export const thumbTimers = new Map();
export function refreshPageThumb(name) {
  clearTimeout(thumbTimers.get(name));
  thumbTimers.set(
    name,
    setTimeout(() => {
      thumbTimers.delete(name);
      spawn(process.execPath, [join(root, "scripts", "thumbs.mjs"), `page:${name}`], { cwd: root, stdio: "ignore", windowsHide: true }).on("error", () => {});
    }, 4000),
  );
}

export function json(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Vitesse (2026-11-17) : chaque lecture (GET) porte une empreinte ; si le
  // navigateur a déjà la même réponse, « 304 » sans la renvoyer (liste des
  // templates, pages, projets… à chaque ouverture de l'atelier).
  const req = res.req;
  if (status === 200 && req?.method === "GET") {
    if (!res.getHeader("ETag")) res.setHeader("ETag", `"${createHash("sha1").update(text).digest("hex").slice(0, 20)}"`);
    res.setHeader("Cache-Control", "no-cache");
    if (req.headers["if-none-match"] && req.headers["if-none-match"] === res.getHeader("ETag")) {
      res.statusCode = 304;
      return res.end();
    }
  }
  res.end(text);
}

// API locale de l'atelier. Tout est écrit dans les dossiers du projet :
//   pages/      les pages (lues aussi par les exports HTML et Shopify)
//   sections/   le catalogue de sections
//   corbeille/  les sections supprimées (restaurables)
//   demandes/   les demandes d'enrichissement du catalogue, que Claude traite
// Base Supabase (clé secrète dans .env.local, utilisée seulement ici, côté serveur).
export function supabaseClient() {
  const env = loadEnv("development", root, "");
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

// Toutes les sections, servies en JSON compressé par /api/sections-data (et
// non plus en module JavaScript : Vite mettait jusqu'à 2 min à traiter 50 Mo
// de code après chaque changement). Gardées en mémoire, section par section :
// un changement dans sections/<id>/ ne relit que ce dossier.
//   /api/sections-data             toutes (catalogue)
//   /api/sections-data?page=<nom>  atelier : en entier les sections de cette
//                                  page ; les autres du catalogue en version
//                                  légère (sans template ni CSS : « leger »),
//                                  complétées à l'ajout (src/engine/sections.js)
//   /api/sections-data?leger=1     catalogue : toutes, en version légère
//   /api/sections-data?ids=a,b     ces sections en entier
// La version légère garde les erreurs de validation (calculées ici).
// Dossier où ranger un média créé ou ajouté pour une page (2026-11-09).
// kind : "images-creees" | "televersees" | "videos-creees". Page d'un projet
// (root.props.projet), ou « projet-<id> » (fichiers de la fiche projet) :
// medias/projets/<projet>/<kind>/. Sinon : medias/<page>/ (comme avant).
export async function mediaPlace(page, kind) {
  let projet = null;
  const pageFile = join(root, "pages", `${page}.json`);
  if (existsSync(pageFile)) {
    try {
      projet = JSON.parse(await readFile(pageFile, "utf8")).root?.props?.projet || null;
    } catch {}
  } else if (/^projet-/.test(page) && existsSync(join(root, "projets", `${page.slice(7)}.json`))) {
    projet = page.slice(7);
  }
  if (projet && /^[a-z0-9][a-z0-9-]*$/.test(projet)) return { projet, dir: join(root, "medias", "projets", projet, kind), url: `/medias/projets/${projet}/${kind}` };
  return { projet: null, dir: join(root, "medias", page), url: `/medias/${page}` };
}


// Version d'une page (empreinte du fichier) et dernier onglet qui l'a écrite
// (en-tête X-Atl-Tab, posé par src/main.jsx), pour les conflits d'écriture.
export const pageRev = (text) => createHash("sha1").update(text).digest("hex").slice(0, 16);
export const pageWriters = new Map();


// ---- Écritures protégées partagées (audit F02, 2026-11-25) ----
// Un seul verrou par fichier pour TOUT le serveur (api, agents, publicités…) :
// lecture, modification et écriture d'un bloc ; écriture atomique (fichier
// temporaire puis renommage). muterProjet(id, fn) : fn reçoit le projet lu
// sous verrou et le modifie (ou retourne false pour ne rien écrire).
const verrous = new Map();
export function lockFile(key, fn) {
  const next = (verrous.get(key) ?? Promise.resolve()).then(fn, fn);
  const tail = next.catch(() => {});
  verrous.set(key, tail);
  tail.then(() => verrous.get(key) === tail && verrous.delete(key));
  return next;
}
export async function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.tmp`;
  await writeFile(tmp, text, "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (e) {
      if (attempt >= 5 || !/EBUSY|EPERM|UNKNOWN/.test(e.code ?? e.message)) throw e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}
export async function muterProjet(id, fn) {
  if (!NAME.test(id ?? "")) throw new Error("Identifiant de projet invalide.");
  const file = join(projectsDir, `${id}.json`);
  return lockFile(file, async () => {
    if (!existsSync(file)) throw new Error("Projet introuvable.");
    const p = JSON.parse(await readFile(file, "utf8"));
    const r = await fn(p);
    if (r === false) return p;
    await writeAtomic(file, JSON.stringify(p, null, 2) + "\n");
    return p;
  });
}
// Dates d'ouverture des projets, à part du projet (audit F02) : marquer un
// projet « ouvert » ne réécrit plus le projet (ni sa révision).
const ouvertsFile = join(projectsDir, "_ouverts.json");
export async function noterOuverture(id) {
  return lockFile(ouvertsFile, async () => {
    let d = {};
    try {
      d = JSON.parse(await readFile(ouvertsFile, "utf8"));
    } catch {}
    d[id] = new Date().toISOString();
    await writeAtomic(ouvertsFile, JSON.stringify(d, null, 1) + "\n");
  });
}
export async function datesOuverture() {
  try {
    return JSON.parse(await readFile(ouvertsFile, "utf8"));
  } catch {
    return {};
  }
}
