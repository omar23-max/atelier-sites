import { defineConfig, loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const pagesDir = join(root, "pages");
const sectionsDir = join(root, "sections");
const trashDir = join(root, "corbeille", "sections");
const requestsDir = join(root, "demandes");
const projectsDir = join(root, "projets");
const importsDir = join(root, "imports");
const mediasDir = join(root, "medias");
const NAME = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TRASH_NAME = /^[a-z0-9][a-z0-9-]{0,80}__\d{8}-\d{6}$/;

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

// Vignette d'une page (medias/_vignettes/<page>.png) refaite en arrière-plan
// après un enregistrement ; plusieurs enregistrements rapprochés n'en lancent
// qu'une, quelques secondes après le dernier.
const thumbTimers = new Map();
function refreshPageThumb(name) {
  clearTimeout(thumbTimers.get(name));
  thumbTimers.set(
    name,
    setTimeout(() => {
      thumbTimers.delete(name);
      spawn(process.execPath, [join(root, "scripts", "thumbs.mjs"), `page:${name}`], { cwd: root, stdio: "ignore", windowsHide: true }).on("error", () => {});
    }, 4000),
  );
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

// API locale de l'atelier. Tout est écrit dans les dossiers du projet :
//   pages/      les pages (lues aussi par les exports HTML et Shopify)
//   sections/   le catalogue de sections
//   corbeille/  les sections supprimées (restaurables)
//   demandes/   les demandes d'enrichissement du catalogue, que Claude traite
// Base Supabase (clé secrète dans .env.local, utilisée seulement ici, côté serveur).
function supabaseClient() {
  const env = loadEnv("development", root, "");
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function atelierApi() {
  const db = supabaseClient();
  return {
    name: "atelier-api",
    configureServer(server) {
      // Lien de partage : la page en lecture seule, telle qu'elle sera publiée
      // (/partage/<page>). Servie par l'atelier : visible seulement là où
      // l'atelier tourne, tant qu'il n'est pas publié en ligne.
      server.middlewares.use("/partage", async (req, res) => {
        const name = decodeURIComponent((req.url ?? "/").split("?")[0].replace(/^\//, ""));
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || !existsSync(join(pagesDir, `${name}.json`))) {
          res.statusCode = 404;
          return res.end("Page introuvable.");
        }
        try {
          const { renderPage } = await server.ssrLoadModule("/scripts/render-page.mjs");
          const html = await renderPage(name, { withPhotos: true });
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html.replace("<head>", '<head><meta name="robots" content="noindex">'));
        } catch (e) {
          res.statusCode = 500;
          res.end(`Rendu impossible : ${e.message}`);
        }
      });
      server.middlewares.use("/api", async (req, res, next) => {
        const [path] = (req.url ?? "/").split("?");
        const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
        try {
          // ---- Page d'origine d'un import (vue « Original ») ----
          // Le HTML capturé, tel quel : textes, design et images d'origine.
          // Scripts retirés et bloqués ; <base> pointe vers le site pour ses CSS et images.
          if (parts[0] === "original" && parts[1] && req.method === "GET") {
            const base = join(importsDir, parts[1]);
            const file = join(base, "page.html");
            if (!/^[a-z0-9-]+$/.test(parts[1]) || !existsSync(file)) return json(res, 404, { error: "Pas de page d'origine pour cet import." });
            if (parts[2] === "info") {
              const report = ["advertorial.json", "capture.json"].map((f) => join(base, f)).find((f) => existsSync(f));
              const r = report ? JSON.parse(await readFile(report, "utf8")) : {};
              return json(res, 200, { url: r.url ?? null, capturedAt: r.capturedAt ?? null, desktop: existsSync(join(base, "desktop.png")), mobile: existsSync(join(base, "mobile.png")) });
            }
            const report = ["advertorial.json", "capture.json"].map((f) => join(base, f)).find((f) => existsSync(f));
            const url = report ? JSON.parse(await readFile(report, "utf8")).url : null;
            let html = await readFile(file, "utf8");
            html = html
              .replace(/<script\b[\s\S]*?<\/script>/gi, "")
              .replace(/<base\b[^>]*>/gi, "")
              .replace(/<meta[^>]+http-equiv=["']?refresh[^>]*>/gi, "")
              .replace(/\son[a-z]+=("[^"]*"|'[^']*')/gi, "");
            const head = `<base href="${String(url ?? "").replace(/"/g, "&quot;")}"><meta name="referrer" content="no-referrer"><style>html,body{overflow:auto!important}</style>`;
            html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Content-Security-Policy", "script-src 'none'; frame-ancestors 'self'");
            return res.end(html);
          }

          // ---- Pages ----
          if (parts[0] === "pages") {
            const name = parts[1];
            if (!name && req.method === "GET") {
              const files = existsSync(pagesDir) ? await readdir(pagesDir) : [];
              const names = files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
              // ?details=1 : type, produit et profil de chaque page (pour les regrouper).
              if (!/[?&]details=1/.test(req.url ?? "")) return json(res, 200, names);
              const details = [];
              for (const n of names) {
                const p = JSON.parse(await readFile(join(pagesDir, `${n}.json`), "utf8")).root?.props ?? {};
                details.push({
                  name: n,
                  title: p.title ?? n,
                  pageType: p.pageType ?? "",
                  produit: p.produit ?? "",
                  profil: p.profil ?? "",
                  projet: p.projet ?? "",
                  importSource: p.importSource ?? "",
                  pageAchat: p.pageAchat ?? "",
                });
              }
              return json(res, 200, details);
            }
            if (!NAME.test(name ?? "")) return json(res, 400, { error: "Nom de page invalide (a-z, 0-9, tirets)." });
            const file = join(pagesDir, `${name}.json`);
            if (req.method === "GET" && !parts[2]) {
              if (!existsSync(file)) return json(res, 404, { error: "Page introuvable." });
              return json(res, 200, JSON.parse(await readFile(file, "utf8")));
            }
            // Historique : copies de sécurité de la page, de la plus récente à la plus ancienne.
            const historyDir = join(pagesDir, "_historique");
            if (parts[2] === "history" && req.method === "GET") {
              const files = existsSync(historyDir) ? await readdir(historyDir) : [];
              const out = [];
              for (const f of files.filter((x) => x.startsWith(`${name}__`) && x.endsWith(".json")).sort().reverse()) {
                const p = JSON.parse(await readFile(join(historyDir, f), "utf8"));
                const m = /__(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(f);
                out.push({
                  file: f,
                  date: m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null,
                  sections: p.content?.length ?? 0,
                  design: p.root?.props?.design ?? null,
                });
              }
              return json(res, 200, out);
            }
            // Restaurer une copie : la version actuelle est d'abord mise de côté.
            if (parts[2] === "restore" && req.method === "POST") {
              const { file: copyName } = await readBody(req);
              if (!/^[a-z0-9-]+__\d{8}-\d{6}\.json$/.test(copyName ?? "") || !copyName.startsWith(`${name}__`))
                return json(res, 400, { error: "Copie invalide." });
              const source = join(historyDir, copyName);
              if (!existsSync(source)) return json(res, 404, { error: "Copie introuvable." });
              if (existsSync(file)) await writeFile(join(historyDir, `${name}__${stamp()}.json`), await readFile(file, "utf8"), "utf8");
              await writeFile(file, await readFile(source, "utf8"), "utf8");
              return json(res, 200, { ok: true });
            }
            // Copie de sécurité avant une opération globale (ex. changement de design).
            if (parts[2] === "snapshot" && req.method === "POST") {
              if (!existsSync(file)) return json(res, 404, { error: "Page introuvable." });
              const dir = join(pagesDir, "_historique");
              await mkdir(dir, { recursive: true });
              const copy = `${name}__${stamp()}.json`;
              await writeFile(join(dir, copy), await readFile(file, "utf8"), "utf8");
              return json(res, 200, { ok: true, file: `pages/_historique/${copy}` });
            }
            if (req.method === "PUT") {
              const data = await readBody(req);
              if (!Array.isArray(data?.content)) return json(res, 400, { error: "Contenu de page invalide." });
              await mkdir(pagesDir, { recursive: true });
              // Sous Windows, le fichier peut être lu au même moment (vignette) :
              // quelques essais avant d'abandonner.
              for (let attempt = 0; ; attempt++) {
                try {
                  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
                  break;
                } catch (e) {
                  if (attempt >= 5 || !/EBUSY|EPERM|UNKNOWN/.test(e.code ?? e.message)) throw e;
                  await new Promise((r) => setTimeout(r, 300));
                }
              }
              refreshPageThumb(name);
              return json(res, 200, { ok: true, file: `pages/${name}.json` });
            }
          }

          // ---- Suivi des ventes et des tests (table « suivi » de Supabase) ----
          //   GET    /api/suivi?projet=<id>   lignes + indicateurs par page
          //   POST   /api/suivi                ajoute ou remplace la ligne (page, jour, source)
          //   DELETE /api/suivi/<id>
          if (parts[0] === "suivi") {
            if (!db) return json(res, 503, { error: "Supabase n'est pas relié (.env.local)." });
            if (req.method === "GET") {
              const projet = new URL(req.url, "http://x").searchParams.get("projet");
              if (!NAME.test(projet ?? "")) return json(res, 400, { error: "Projet invalide." });
              const [lignes, resume] = await Promise.all([
                db.from("suivi").select("*").eq("projet_id", projet).order("jour", { ascending: false }).limit(500),
                db.from("suivi_par_page").select("*").eq("projet_id", projet),
              ]);
              if (lignes.error || resume.error) return json(res, 500, { error: (lignes.error ?? resume.error).message });
              return json(res, 200, { lignes: lignes.data, resume: resume.data });
            }
            if (req.method === "POST") {
              const b = await readBody(req);
              if (!NAME.test(b.projet ?? "") || !NAME.test(b.page ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(b.jour ?? ""))
                return json(res, 400, { error: "Projet, page et jour (AAAA-MM-JJ) sont obligatoires." });
              const num = (v) => (v === "" || v == null ? 0 : Number(v));
              const row = {
                projet_id: b.projet,
                page_id: b.page,
                jour: b.jour,
                source: String(b.source || "toutes").slice(0, 40),
                depense_pub: num(b.depense_pub),
                visites: Math.round(num(b.visites)),
                ajouts_panier: Math.round(num(b.ajouts_panier)),
                commandes: Math.round(num(b.commandes)),
                chiffre: num(b.chiffre),
                notes: b.notes ? String(b.notes).slice(0, 500) : null,
              };
              if (Object.values(row).some((v) => typeof v === "number" && !Number.isFinite(v))) return json(res, 400, { error: "Chiffres invalides." });
              // Un projet tout juste créé n'est peut-être pas encore synchronisé : on l'envoie d'abord.
              const projectFile = join(projectsDir, `${b.projet}.json`);
              if (existsSync(projectFile)) {
                const p = JSON.parse(await readFile(projectFile, "utf8"));
                const { error: pe } = await db
                  .from("projets")
                  .upsert({ id: p.id, nom: p.nom, produit: p.produit ?? null, description: p.description ?? null, cree_le: p.creeLe ?? null }, { onConflict: "id", ignoreDuplicates: true });
                if (pe) return json(res, 500, { error: pe.message });
              }
              const { error } = await db.from("suivi").upsert(row, { onConflict: "page_id,jour,source" });
              if (error) return json(res, 500, { error: error.message });
              return json(res, 200, { ok: true });
            }
            if (req.method === "DELETE" && /^\d+$/.test(parts[1] ?? "")) {
              const { error } = await db.from("suivi").delete().eq("id", Number(parts[1]));
              if (error) return json(res, 500, { error: error.message });
              return json(res, 200, { ok: true });
            }
          }

          // ---- Lire une Google Sheet partagée (« Tous les utilisateurs disposant du
          // lien ») : renvoie son contenu en CSV. Uniquement docs.google.com. ----
          if (parts[0] === "sheet" && req.method === "GET") {
            const link = new URL(req.url, "http://x").searchParams.get("url") ?? "";
            const m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(link);
            if (!m) return json(res, 400, { error: "Ce n'est pas un lien Google Sheets (https://docs.google.com/spreadsheets/d/…)." });
            const gid = /[#&?]gid=(\d+)/.exec(link)?.[1] ?? "0";
            const r = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`, { redirect: "follow" });
            const type = r.headers.get("content-type") ?? "";
            if (!r.ok || !type.includes("csv")) {
              return json(res, 403, {
                error: "Impossible de lire la feuille : partage-la en « Tous les utilisateurs disposant du lien » (lecteur), ou télécharge-la en .xlsx / .csv.",
              });
            }
            return json(res, 200, { csv: await r.text() });
          }

          // ---- Corbeille commune : pages, projets, designs, templates, demandes ----
          // Rien n'est effacé : l'élément est déplacé dans corbeille/<type>/<id>__<date>
          // et peut être restauré. Un projet part avec ses pages, un template avec
          // sa page mirror (même date, restaurés ensemble).
          if (parts[0] === "corbeille") {
            const BIN = join(root, "corbeille");
            const KINDS = {
              pages: { dir: pagesDir, ext: ".json" },
              projets: { dir: projectsDir, ext: ".json" },
              designs: { dir: join(root, "designs"), ext: ".md", extra: [".png"] },
              templates: { dir: importsDir, ext: "" },
              demandes: { dir: requestsDir, ext: "" },
            };
            const labelOf = async (kind, path) => {
              try {
                if (kind === "pages") return JSON.parse(await readFile(path, "utf8")).root?.props?.title;
                if (kind === "projets") return JSON.parse(await readFile(path, "utf8")).nom;
                if (kind === "templates") return JSON.parse(await readFile(join(path, "template.json"), "utf8")).nom;
                if (kind === "demandes") return JSON.parse(await readFile(join(path, "demande.json"), "utf8")).type;
              } catch {}
              return null;
            };
            const moveToBin = async (kind, id, when) => {
              const k = KINDS[kind];
              const src = join(k.dir, id + k.ext);
              if (!existsSync(src)) return false;
              await mkdir(join(BIN, kind), { recursive: true });
              await rename(src, join(BIN, kind, `${id}__${when}${k.ext}`));
              for (const ext of k.extra ?? []) {
                if (existsSync(join(k.dir, id + ext))) await rename(join(k.dir, id + ext), join(BIN, kind, `${id}__${when}${ext}`));
              }
              return true;
            };

            if (!parts[1] && req.method === "GET") {
              const out = [];
              for (const kind of Object.keys(KINDS)) {
                const dir = join(BIN, kind);
                if (!existsSync(dir)) continue;
                for (const entry of await readdir(dir)) {
                  const k = KINDS[kind];
                  if (k.ext && !entry.endsWith(k.ext)) continue;
                  const base = k.ext ? entry.slice(0, -k.ext.length) : entry;
                  const [id, when] = base.split("__");
                  out.push({ kind, entry: base, id, when, label: (await labelOf(kind, join(dir, entry))) ?? id });
                }
              }
              return json(res, 200, out.sort((a, b) => String(b.when).localeCompare(String(a.when))));
            }

            const kind = parts[1];
            if (!KINDS[kind]) return json(res, 400, { error: "Type inconnu." });

            // Supprimer (vers la corbeille)
            if (parts[2] && !parts[3] && req.method === "POST") {
              const id = parts[2];
              if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return json(res, 400, { error: "Identifiant invalide." });
              const when = stamp();
              if (!(await moveToBin(kind, id, when))) return json(res, 404, { error: "Élément introuvable." });
              const moved = [`${kind}/${id}`];
              if (kind === "projets" && existsSync(pagesDir)) {
                for (const f of (await readdir(pagesDir)).filter((x) => x.endsWith(".json"))) {
                  const p = JSON.parse(await readFile(join(pagesDir, f), "utf8"));
                  if (p.root?.props?.projet === id && (await moveToBin("pages", f.slice(0, -5), when))) moved.push(`pages/${f.slice(0, -5)}`);
                }
              }
              if (kind === "templates") {
                const tpl = join(BIN, "templates", `${id}__${when}`, "template.json");
                const page = existsSync(tpl) ? JSON.parse(await readFile(tpl, "utf8")).page : null;
                if (page && (await moveToBin("pages", page, when))) moved.push(`pages/${page}`);
              }
              return json(res, 200, { ok: true, moved });
            }

            // Restaurer (avec ce qui est parti en même temps)
            if (parts[2] && parts[3] === "restore" && req.method === "POST") {
              const [id, when] = parts[2].split("__");
              const back = async (k, entryId) => {
                const def = KINDS[k];
                const from = join(BIN, k, `${entryId}__${when}${def.ext}`);
                const to = join(def.dir, entryId + def.ext);
                if (!existsSync(from)) return;
                if (existsSync(to)) throw new Error(`« ${entryId} » existe déjà : renomme-le ou supprime-le d'abord.`);
                await mkdir(def.dir, { recursive: true });
                await rename(from, to);
                for (const ext of def.extra ?? []) {
                  if (existsSync(join(BIN, k, `${entryId}__${when}${ext}`))) await rename(join(BIN, k, `${entryId}__${when}${ext}`), join(def.dir, entryId + ext));
                }
              };
              await back(kind, id);
              if (kind === "projets" || kind === "templates") {
                const dir = join(BIN, "pages");
                for (const entry of existsSync(dir) ? await readdir(dir) : []) {
                  if (entry.endsWith(`__${when}.json`)) await back("pages", entry.split("__")[0]);
                }
              }
              return json(res, 200, { ok: true });
            }
          }

          // ---- Projets : un par produit ou gamme lancé (projets/<id>.json) ----
          if (parts[0] === "projects") {
            if (!parts[1] && req.method === "GET") {
              const files = existsSync(projectsDir) ? await readdir(projectsDir) : [];
              const out = [];
              for (const f of files.filter((x) => x.endsWith(".json")).sort())
                out.push(JSON.parse(await readFile(join(projectsDir, f), "utf8")));
              return json(res, 200, out);
            }
            if (!NAME.test(parts[1] ?? "")) return json(res, 400, { error: "Identifiant de projet invalide." });
            const file = join(projectsDir, `${parts[1]}.json`);
            // Publication d'une page du projet : { page, canal: "html" | "shopify", ... }.
            if (parts[2] === "publication" && req.method === "POST") {
              if (!existsSync(file)) return json(res, 404, { error: "Projet introuvable." });
              const { page, canal, ...rest } = await readBody(req);
              if (!NAME.test(page ?? "") || !["html", "shopify"].includes(canal)) return json(res, 400, { error: "Publication invalide." });
              const p = JSON.parse(await readFile(file, "utf8"));
              p.publication ??= {};
              p.publication[page] = { ...(p.publication[page] ?? {}), [canal]: { le: new Date().toISOString(), ...rest } };
              await writeFile(file, JSON.stringify(p, null, 2) + "\n", "utf8");
              return json(res, 200, { ok: true });
            }
            // Projet ouvert dans l'atelier : date utilisée pour « les 5 derniers ouverts ».
            if (parts[2] === "opened" && req.method === "POST") {
              if (!existsSync(file)) return json(res, 404, { error: "Projet introuvable." });
              const p = JSON.parse(await readFile(file, "utf8"));
              p.ouvertLe = new Date().toISOString();
              await writeFile(file, JSON.stringify(p, null, 2) + "\n", "utf8");
              return json(res, 200, { ok: true });
            }
            if (req.method === "GET") {
              if (!existsSync(file)) return json(res, 404, { error: "Projet introuvable." });
              return json(res, 200, JSON.parse(await readFile(file, "utf8")));
            }
            if (req.method === "PUT") {
              const data = await readBody(req);
              if (!data?.nom) return json(res, 400, { error: "Le projet doit avoir un nom." });
              await mkdir(projectsDir, { recursive: true });
              await writeFile(file, JSON.stringify({ ...data, id: parts[1] }, null, 2) + "\n", "utf8");
              return json(res, 200, { ok: true, file: `projets/${parts[1]}.json` });
            }
          }

          // ---- Produits de la boutique Shopify : copie locale (shopify/produits.json),
          // mise à jour par Claude via la connexion Shopify ----
          if (parts[0] === "shopify" && parts[1] === "products" && req.method === "GET") {
            const file = join(root, "shopify", "produits.json");
            if (!existsSync(file)) return json(res, 200, { produits: [], misAJourLe: null });
            return json(res, 200, JSON.parse(await readFile(file, "utf8")));
          }

          // ---- Créer un design.md (palette du logo ou nouvelle palette) ----
          if (parts[0] === "designs" && parts[1] && parts[1] !== "recents" && req.method === "PUT") {
            if (!NAME.test(parts[1])) return json(res, 400, { error: "Nom de design invalide." });
            const { markdown } = await readBody(req);
            if (!/```json[\s\S]*```/.test(markdown ?? "")) return json(res, 400, { error: "Bloc de jetons manquant." });
            await writeFile(join(root, "designs", `${parts[1]}.md`), markdown, "utf8");
            return json(res, 200, { ok: true, file: `designs/${parts[1]}.md` });
          }

          // ---- Derniers designs appliqués (designs/_recents.json), le plus récent d'abord ----
          if (parts[0] === "designs" && parts[1] === "recents") {
            const file = join(root, "designs", "_recents.json");
            const list = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : [];
            if (req.method === "GET") return json(res, 200, list);
            if (req.method === "POST") {
              const { id } = await readBody(req);
              if (!NAME.test(id ?? "")) return json(res, 400, { error: "Design invalide." });
              const next = [{ id, at: new Date().toISOString() }, ...list.filter((d) => d.id !== id)].slice(0, 20);
              await writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
              return json(res, 200, next);
            }
          }

          // ---- Templates : chaque site ou page importé (imports/<nom>/) ----
          if (parts[0] === "templates" && req.method === "GET") {
            const dirs = existsSync(importsDir) ? await readdir(importsDir, { withFileTypes: true }) : [];
            const out = [];
            for (const d of dirs.filter((x) => x.isDirectory())) {
              const base = join(importsDir, d.name);
              // Import d'un site : capture.json ; import de captures d'écran : template.json seul.
              const hasCapture = existsSync(join(base, "capture.json"));
              if (!hasCapture && !existsSync(join(base, "template.json"))) continue;
              const capture = hasCapture ? JSON.parse(await readFile(join(base, "capture.json"), "utf8")) : {};
              const meta = existsSync(join(base, "template.json")) ? JSON.parse(await readFile(join(base, "template.json"), "utf8")) : {};
              const photos = existsSync(join(base, "images", "photos.json"))
                ? JSON.parse(await readFile(join(base, "images", "photos.json"), "utf8")).length
                : 0;
              out.push({
                id: d.name,
                nom: meta.nom ?? capture.views?.desktop?.title ?? d.name,
                url: capture.url,
                capturedAt: capture.capturedAt,
                sectionsSite: capture.views?.desktop?.sections?.length ?? null,
                photos,
                vignette: existsSync(join(base, "vignette.png")) ? `/imports/${d.name}/vignette.png` : null,
                ...meta,
              });
            }
            return json(res, 200, out.sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt))));
          }

          // ---- Section refaite par l'IA : écrite dans sections/<id>/ ----
          if (parts[0] === "sections-ia" && req.method === "POST") {
            const { id, schema, template, css, meta } = await readBody(req);
            if (!NAME.test(id ?? "") || !meta?.pageSpecific) return json(res, 400, { error: "Section invalide." });
            const dir = join(sectionsDir, id);
            await mkdir(dir, { recursive: true });
            await writeFile(join(dir, "schema.json"), JSON.stringify(schema, null, 2) + "\n", "utf8");
            await writeFile(join(dir, "template.liquid"), template + "\n", "utf8");
            await writeFile(join(dir, "style.css"), css + "\n", "utf8");
            await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
            return json(res, 200, { ok: true, id });
          }

          // ---- Retravailler avec l'IA (OpenAI, clé de .env.local) ----
          if (parts[0] === "ia" && req.method === "POST") {
            const env = loadEnv("development", root, "");
            const { rewriteTexts, reworkImage } = await import("./scripts/lib/ia.mjs");
            const b = await readBody(req);
            try {
              if (parts[1] === "textes") {
                const items = await rewriteTexts({ key: env.OPENAI_API_KEY, items: b.items, prompt: b.prompt, contexte: b.contexte });
                return json(res, 200, { items });
              }
              if (parts[1] === "image" && NAME.test(b.page ?? "")) {
                return json(res, 200, await reworkImage({ key: env.OPENAI_API_KEY, root, ...b }));
              }
              if (parts[1] === "section") {
                const { rebuildSection } = await import("./scripts/lib/ia.mjs");
                return json(res, 200, await rebuildSection({ key: env.OPENAI_API_KEY, ...b }));
              }
            } catch (e) {
              return json(res, 502, { error: e.message });
            }
            return json(res, 400, { error: "Demande IA invalide." });
          }

          // ---- Tes images (studio ou ajoutées à la main) : medias/<page>/ ----
          // Téléverser une image depuis le panneau de droite.
          if (parts[0] === "medias" && NAME.test(parts[1] ?? "") && req.method === "POST") {
            const { name: fileName, dataUrl } = await readBody(req);
            const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(dataUrl ?? "");
            if (!m) return json(res, 400, { error: "Image invalide (png, jpg, webp ou gif)." });
            const ext = m[1] === "jpeg" ? "jpg" : m[1];
            const base = String(fileName ?? "image").replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
            const dir = join(mediasDir, parts[1]);
            await mkdir(dir, { recursive: true });
            const file = `${base}-${stamp()}.${ext}`;
            await writeFile(join(dir, file), Buffer.from(m[2], "base64"));
            return json(res, 200, { ok: true, url: `/medias/${parts[1]}/${file}` });
          }
          if (parts[0] === "medias" && NAME.test(parts[1] ?? "") && req.method === "GET") {
            const dir = join(mediasDir, parts[1]);
            const files = existsSync(dir) ? await readdir(dir) : [];
            return json(res, 200, files.filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)).map((f) => `/medias/${parts[1]}/${f}`));
          }

          // ---- Sections du catalogue ----
          if (parts[0] === "sections" && NAME.test(parts[1] ?? "")) {
            const dir = join(sectionsDir, parts[1]);
            if (!existsSync(dir)) return json(res, 404, { error: "Section introuvable." });
            // Statut : visible (proposée dans l'atelier) ou masquée.
            if (parts[2] === "status" && req.method === "PUT") {
              const { status } = await readBody(req);
              if (!["visible", "masquee"].includes(status)) return json(res, 400, { error: "Statut inconnu." });
              const metaFile = join(dir, "meta.json");
              const meta = JSON.parse(await readFile(metaFile, "utf8"));
              meta.status = status;
              await writeFile(metaFile, JSON.stringify(meta, null, 2) + "\n", "utf8");
              return json(res, 200, { ok: true });
            }
            // Suppression : déplacement vers la corbeille (restaurable).
            if (parts[2] === "trash" && req.method === "POST") {
              await mkdir(trashDir, { recursive: true });
              const target = `${parts[1]}__${stamp()}`;
              await rename(dir, join(trashDir, target));
              return json(res, 200, { ok: true, trash: target });
            }
          }

          // ---- Corbeille ----
          if (parts[0] === "trash") {
            if (!parts[1] && req.method === "GET") {
              const items = existsSync(trashDir) ? await readdir(trashDir) : [];
              const out = [];
              for (const item of items.filter((i) => TRASH_NAME.test(i))) {
                const metaFile = join(trashDir, item, "meta.json");
                const meta = existsSync(metaFile) ? JSON.parse(await readFile(metaFile, "utf8")) : {};
                out.push({ trash: item, id: item.split("__")[0], label: meta.label ?? item, family: meta.family ?? null });
              }
              return json(res, 200, out.sort((a, b) => b.trash.localeCompare(a.trash)));
            }
            if (TRASH_NAME.test(parts[1] ?? "") && parts[2] === "restore" && req.method === "POST") {
              const id = parts[1].split("__")[0];
              const dest = join(sectionsDir, id);
              if (existsSync(dest)) return json(res, 409, { error: `Une section « ${id} » existe déjà.` });
              await rename(join(trashDir, parts[1]), dest);
              return json(res, 200, { ok: true, id });
            }
          }

          // ---- Demandes d'enrichissement ----
          if (parts[0] === "requests") {
            if (req.method === "GET") {
              const items = existsSync(requestsDir) ? await readdir(requestsDir) : [];
              const out = [];
              for (const item of items) {
                const file = join(requestsDir, item, "demande.json");
                if (existsSync(file)) out.push({ dossier: item, ...JSON.parse(await readFile(file, "utf8")) });
              }
              return json(res, 200, out.sort((a, b) => b.dossier.localeCompare(a.dossier)));
            }
            if (req.method === "POST") {
              const body = await readBody(req);
              // textes : réécrire les textes d'une page ; images : refaire ses photos d'origine.
              const types = ["capture", "site", "bibliotheque", "design", "ia", "textes", "images", "creatives", "offre", "shopify"];
              if (!types.includes(body.type)) return json(res, 400, { error: "Type de demande inconnu." });
              // Plusieurs demandes dans la même seconde (envoi d'un lot) : -2, -3…
              let folder = `${stamp()}-${body.type}`;
              for (let n = 2; existsSync(join(requestsDir, folder)); n++) folder = `${stamp()}-${body.type}-${n}`;
              const dir = join(requestsDir, folder);
              await mkdir(dir, { recursive: true });
              const images = [];
              for (const [i, img] of (body.images ?? []).slice(0, 10).entries()) {
                const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(img);
                if (!m) continue;
                const name = `capture-${i + 1}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
                await writeFile(join(dir, name), Buffer.from(m[2], "base64"));
                images.push(name);
              }
              const demande = {
                type: body.type,
                statut: "en attente",
                creeLe: new Date().toISOString(),
                famille: body.family || null,
                url: body.url || null,
                sections: body.sections || null,
                consignes: body.notes || null,
                images,
                ...(body.page ? { page: body.page } : {}),
                ...(body.details ? { details: body.details } : {}),
              };
              await writeFile(join(dir, "demande.json"), JSON.stringify(demande, null, 2) + "\n", "utf8");
              return json(res, 200, { ok: true, dossier: `demandes/${folder}` });
            }
          }
          next();
        } catch (error) {
          json(res, 500, { error: String(error?.message ?? error) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), atelierApi()],
  build: {
    rollupOptions: {
      input: { atelier: join(root, "index.html"), catalogue: join(root, "catalogue.html") },
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    // Pages, imports, exports, corbeille et demandes sont lus par l'API :
    // pas de rechargement de l'interface quand ils changent.
    watch: { ignored: ["**/pages/**", "**/imports/**", "**/export/**", "**/corbeille/**", "**/demandes/**", "**/medias/**", "**/projets/**"] },
  },
});
