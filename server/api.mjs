// API de l'atelier (/api/…, /partage, /imports) : pages, projets, designs,
// templates, médias, Canvas, corbeille, demandes, IA… Sortie de
// vite.config.js le 2026-11-17 (audit T6), code inchangé.
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
import { root, pagesDir, sectionsDir, trashDir, requestsDir, projectsDir, importsDir, mediasDir, NAME, TRASH_NAME, stamp, readBody, thumbTimers, refreshPageThumb, json, supabaseClient, mediaPlace, pageRev, pageWriters } from "./commun.mjs";
const jsonOut = json;
import { empreinte, statutFondations } from "../src/engine/fondations-etat.js";

export function atelierApi() {
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
          const html = await renderPage(name, { withPhotos: true, reperes: /[?&]reperes=1/.test(req.url ?? "") });
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html.replace("<head>", '<head><meta name="robots" content="noindex">'));
        } catch (e) {
          res.statusCode = 500;
          res.end(`Rendu impossible : ${e.message}`);
        }
      });
      // Aperçu léger des templates (/imports/<slug>/carte.jpg) : la capture
      // pleine page réduite (scripts/carte.sh), faite à la première demande puis
      // gardée. Les captures d'origine (1,5 Mo en moyenne) gelaient le catalogue
      // une fois l'atelier en ligne. Sans vipsthumbnail, on renvoie la capture.
      server.middlewares.use("/imports", async (req, res, next) => {
        const m = /^\/([a-z0-9][a-z0-9._-]*)\/carte\.jpg$/i.exec((req.url ?? "").split("?")[0]);
        if (!m) return next();
        const dir = join(root, "imports", m[1]);
        const src = join(dir, "desktop.png");
        const out = join(dir, "carte.jpg");
        if (!existsSync(src)) {
          res.statusCode = 404;
          return res.end();
        }
        try {
          const { stat } = await import("node:fs/promises");
          const fresh = existsSync(out) && (await stat(out)).mtimeMs >= (await stat(src)).mtimeMs;
          if (!fresh) {
            const code = await new Promise((done) =>
              spawn("sh", [join(root, "scripts", "carte.sh"), src, out], { stdio: "ignore", windowsHide: true })
                .on("close", done)
                .on("error", () => done(1)),
            );
            if (code !== 0 || !existsSync(out)) throw new Error("réduction impossible");
          }
          res.setHeader("Content-Type", "image/jpeg");
          res.setHeader("Cache-Control", "private, max-age=3600");
          res.end(await readFile(out));
        } catch {
          res.setHeader("Content-Type", "image/png");
          res.end(await readFile(src));
        }
      });
      server.middlewares.use("/api", async (req, res, next) => {
        const [path] = (req.url ?? "/").split("?");
        const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
        try {
          // ---- Page d'origine d'un import (vue « Original ») ----
          // Le HTML capturé, tel quel : textes, design et images d'origine.
          // Scripts retirés et bloqués ; <base> pointe vers le site pour ses CSS et images.
          // ---- Vérifier un miroir en 3 passes (Edge, Chrome, HTML brut) ----
          // GET : dernier rapport ; POST { page } : lance scripts/verifier-miroir.mjs.
          if (parts[0] === "verifier" && /^[a-z0-9-]+$/.test(parts[1] ?? "")) {
            const file = join(importsDir, parts[1], "verification.json");
            if (req.method === "GET") return existsSync(file) ? json(res, 200, JSON.parse(await readFile(file, "utf8"))) : json(res, 404, { error: "Pas encore vérifié." });
            if (req.method === "POST") {
              const { page, site } = await readBody(req);
              // { site: true } : seulement « la page originale a-t-elle changé ? » (~40 s).
              if (site) {
                const out = join(importsDir, parts[1], "controle-site.json");
                await new Promise((done) => spawn(process.execPath, [join(root, "scripts", "verifier-miroir.mjs"), parts[1], "--site"], { cwd: root, stdio: "ignore", windowsHide: true }).on("close", done).on("error", done));
                if (!existsSync(out)) return json(res, 500, { error: "Contrôle impossible." });
                const r = JSON.parse(await readFile(out, "utf8"));
                // Le dernier contrôle est noté dans le template (affiché sur sa carte).
                const tplFile = join(importsDir, parts[1], "template.json");
                if (existsSync(tplFile)) {
                  const tpl = JSON.parse(await readFile(tplFile, "utf8"));
                  tpl.controleSite = { date: r.date, score: r.score ?? null, change: r.change ?? null, verdict: r.verdict ?? r.erreur };
                  await writeFile(tplFile, JSON.stringify(tpl, null, 2), "utf8");
                }
                return json(res, 200, r);
              }
              const args = [join(root, "scripts", "verifier-miroir.mjs"), parts[1], ...(page && /^[a-z0-9-]+$/.test(page) ? [page] : [])];
              const code = await new Promise((done) => spawn(process.execPath, args, { cwd: root, stdio: "ignore", windowsHide: true }).on("close", done).on("error", () => done(1)));
              if (!existsSync(file)) return json(res, 500, { error: `Vérification impossible (code ${code}).` });
              return json(res, 200, JSON.parse(await readFile(file, "utf8")));
            }
          }
          if (parts[0] === "original" && parts[1] && req.method === "GET") {
            const base = join(importsDir, parts[1]);
            const file = join(base, "page.html");
            if (!/^[a-z0-9-]+$/.test(parts[1]) || !existsSync(file)) return json(res, 404, { error: "Pas de page d'origine pour cet import." });
            const liveFile = join(base, "live.html");
            const liveInfoFile = join(base, "live.json");
            const liveInfo = existsSync(liveInfoFile) ? JSON.parse(await readFile(liveInfoFile, "utf8")) : null;
            if (parts[2] === "info") {
              const report = ["advertorial.json", "capture.json"].map((f) => join(base, f)).find((f) => existsSync(f));
              const r = report ? JSON.parse(await readFile(report, "utf8")) : {};
              return json(res, 200, { url: r.url ?? null, capturedAt: r.capturedAt ?? null, liveAt: liveInfo?.le ?? null, desktop: existsSync(join(base, "desktop.png")), mobile: existsSync(join(base, "mobile.png")) });
            }
            const report = ["advertorial.json", "capture.json"].map((f) => join(base, f)).find((f) => existsSync(f));
            let url = report ? JSON.parse(await readFile(report, "utf8")).url : null;
            let source = file;
            // « /live » (2026-11-08) : la page EN LIGNE, rendue par Edge sur le
            // serveur (scripts/original-live.mjs), refaite au plus toutes les
            // 6 h ou sur « ?refresh=1 ». Échec (site injoignable) : la capture.
            if (parts[2] === "live" && url) {
              const stale = !liveInfo || Date.now() - Date.parse(liveInfo.le) > 6 * 3600e3;
              if (stale || /[?&]refresh=1/.test(req.url ?? "")) {
                await new Promise((done) => {
                  const child = spawn(process.execPath, [join(root, "scripts", "original-live.mjs"), parts[1], url], { cwd: root, stdio: "ignore", windowsHide: true });
                  const timer = setTimeout(() => child.kill(), 90000);
                  child.on("close", () => (clearTimeout(timer), done())).on("error", () => (clearTimeout(timer), done()));
                });
              }
              if (existsSync(liveFile) && existsSync(liveInfoFile)) {
                source = liveFile;
                url = JSON.parse(await readFile(liveInfoFile, "utf8")).url ?? url;
                res.setHeader("X-Atl-Live", JSON.parse(await readFile(liveInfoFile, "utf8")).le);
              }
            }
            let html = await readFile(source, "utf8");
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
              const text = await readFile(file, "utf8");
              res.setHeader("ETag", pageRev(text));
              return json(res, 200, JSON.parse(text));
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
              const restored = await readFile(source, "utf8");
              await writeFile(file, restored, "utf8");
              pageWriters.set(name, { tab: String(req.headers["x-atl-tab"] ?? ""), rev: pageRev(restored) });
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
              // Deux auteurs partis de la même version (audit T3, 2026-11-17) :
              // l'éditeur envoie la version qu'il a chargée (If-Match). Si la
              // page a changé depuis, et pas par ce même onglet, conflit 409
              // au lieu d'écraser l'autre version.
              const tab = String(req.headers["x-atl-tab"] ?? "");
              const expected = req.headers["if-match"];
              if (expected && existsSync(file)) {
                const current = pageRev(await readFile(file, "utf8"));
                const last = pageWriters.get(name);
                if (current !== expected && !(last && last.tab && last.tab === tab && last.rev === current)) return json(res, 409, { error: "Cette page a été modifiée ailleurs.", conflit: true });
              }
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
              const rev = pageRev(JSON.stringify(data, null, 2) + "\n");
              pageWriters.set(name, { tab, rev });
              res.setHeader("ETag", rev);
              return json(res, 200, { ok: true, file: `pages/${name}.json`, rev });
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

            // Suppression définitive (bouton de la corbeille, éléments cochés) :
            // seulement ce qui est déjà dans la corbeille. items : [{ kind, entry }],
            // kind = un type ci-dessus ou « sections » (corbeille des sections).
            if (parts[1] === "purge" && req.method === "POST") {
              const { items } = await readBody(req);
              const ENTRY = /^[a-z0-9_-]+__[0-9-]+$/i;
              let done = 0;
              for (const { kind: k, entry } of Array.isArray(items) ? items : []) {
                if (!ENTRY.test(entry ?? "")) continue;
                if (k === "sections") {
                  const p = join(trashDir, entry);
                  if (existsSync(p)) await rm(p, { recursive: true, force: true }), done++;
                  continue;
                }
                const def = KINDS[k];
                if (!def) continue;
                const p = join(BIN, k, entry + def.ext);
                if (!existsSync(p)) continue;
                await rm(p, { recursive: true, force: true });
                for (const ext of def.extra ?? []) await rm(join(BIN, k, entry + ext), { force: true });
                done++;
              }
              return json(res, 200, { ok: true, supprimes: done });
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
            // Publication d'une page du projet : { page, canal: "html", ... }.
            if (parts[2] === "publication" && req.method === "POST") {
              if (!existsSync(file)) return json(res, 404, { error: "Projet introuvable." });
              const { page, canal, ...rest } = await readBody(req);
              if (!NAME.test(page ?? "") || canal !== "html") return json(res, 400, { error: "Publication invalide." });
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
              // Révision (audit ChatGPT F01, 2026-11-17) : If-Match = l'empreinte
              // (ETag) de la version lue avant d'écrire. Si le projet a changé
              // depuis (autre onglet, script de Claude), refus 409 : le client
              // refait sa fusion au lieu d'écraser. Sans If-Match : comme avant.
              const ifMatch = req.headers["if-match"];
              if (ifMatch && existsSync(file)) {
                const cur = JSON.stringify(JSON.parse(await readFile(file, "utf8")));
                const rev = `"${createHash("sha1").update(cur).digest("hex").slice(0, 20)}"`;
                if (ifMatch !== rev) return json(res, 409, { error: "Le projet a été modifié ailleurs entre-temps.", rev });
              }
              // Fondations validées dont les faits, l'offre ou le message ont
              // changé → « modifiée » (audit F04), quel que soit l'écrivain.
              const next = { ...data, id: parts[1] };
              if (next.fondations && ["validée", "modifiée"].includes(next.fondations.statut) && !next.fondations.valideEmpreinte && existsSync(file)) {
                // Validées autrefois sans empreinte : la version enregistrée sert de référence.
                const before = JSON.parse(await readFile(file, "utf8"));
                next.fondations = { ...next.fondations, valideEmpreinte: empreinte(before) };
              }
              if (next.fondations) next.fondations = statutFondations(next);
              await mkdir(projectsDir, { recursive: true });
              await writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
              const rev = `"${createHash("sha1").update(JSON.stringify(next)).digest("hex").slice(0, 20)}"`;
              return json(res, 200, { ok: true, file: `projets/${parts[1]}.json`, rev, fondations: next.fondations ?? null });
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

          // ---- Favoris et modèles récents de la galerie « Ajouter une section » (galerie.json, 2026-11-17) ----
          if (parts[0] === "galerie" && !parts[1]) {
            const file = join(root, "galerie.json");
            if (req.method === "GET") return json(res, 200, existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : { favoris: [], recents: [] });
            if (req.method === "PUT") {
              const b = await readBody(req);
              const ids = (v, max) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^[a-z0-9][a-z0-9_-]*$/i.test(x)).slice(0, max) : []);
              const next = { favoris: ids(b.favoris, 300), recents: ids(b.recents, 12) };
              await writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
              return json(res, 200, next);
            }
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
          // ---- Origine des templates, sections et designs (filtre du catalogue) ----
          // Par défaut : les 44 de docs/templates-pour-kimi.md → Daydreamer Excel,
          // wl-… / wll-… → Whitelabeler, le reste → Autres. Choix à la main
          // (Daydreamer Vault, Replo…) rangés dans origines.json, par template.
          if (parts[0] === "origines") {
            const file = join(root, "origines.json");
            const read = async () => (existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : {});
            if (req.method === "GET") {
              const list = existsSync(join(root, "docs", "templates-pour-kimi.md")) ? await readFile(join(root, "docs", "templates-pour-kimi.md"), "utf8") : "";
              const excel = [...list.matchAll(/^\|\s*\d+\s*\|\s*`([a-z0-9-]+)`/gm)].map((m) => m[1]);
              return json(res, 200, { excel, choix: await read() });
            }
            if (req.method === "PUT") {
              const { id, origine } = await readBody(req);
              if (!/^[a-z0-9][a-z0-9-]*$/.test(id ?? "")) return json(res, 400, { error: "Identifiant invalide." });
              const choix = await read();
              if (origine) choix[id] = origine;
              else delete choix[id];
              await writeFile(file, JSON.stringify(choix, null, 2) + "\n", "utf8");
              return json(res, 200, { ok: true, choix });
            }
          }

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

          // ---- Section modifiée dans une page → catalogue ----
          // { from, mode: "nouvelle" | "ecraser", props, label }. « nouvelle » :
          // copie de la section (classe atl-<id> renommée) dont les valeurs par
          // défaut sont celles de la page ; « ecraser » : la section d'origine
          // prend ces valeurs (les pages qui l'utilisent déjà ne bougent pas).
          if (parts[0] === "sections-save" && req.method === "POST") {
            const { from, target, mode, props, label } = await readBody(req);
            if (!NAME.test(from ?? "") || !existsSync(join(sectionsDir, from, "schema.json"))) return json(res, 400, { error: "Section introuvable." });
            const clean = { ...(props ?? {}) };
            delete clean.id;
            const srcDir = join(sectionsDir, from);
            const srcMeta = existsSync(join(srcDir, "meta.json")) ? JSON.parse(await readFile(join(srcDir, "meta.json"), "utf8")) : {};
            let id = from;
            if (mode === "ecraser") {
              // Cible : la section elle-même, ou l'originale du catalogue d'une
              // copie figée / d'une section perso (target, 2026-11-16).
              const tgt = target ?? from;
              const allowed = tgt === from || tgt === srcMeta.figeeDepuis || tgt === srcMeta.copieDe;
              const tgtDir = join(sectionsDir, tgt);
              if (!allowed || !NAME.test(tgt) || !existsSync(join(tgtDir, "schema.json"))) return json(res, 400, { error: "Section d'origine introuvable dans le catalogue." });
              const tgtMeta = existsSync(join(tgtDir, "meta.json")) ? JSON.parse(await readFile(join(tgtDir, "meta.json"), "utf8")) : {};
              if (tgtMeta.pageSpecific) return json(res, 400, { error: "Cette section appartient à une page : enregistre-la plutôt comme nouvelle section." });
              await writeFile(join(tgtDir, "meta.json"), JSON.stringify({ ...tgtMeta, presetProps: clean, modifieeLe: new Date().toISOString().slice(0, 10) }, null, 2) + "\n", "utf8");
              id = tgt;
            } else {
              const base = from.replace(/-(sec-|p)\d+$/, "").replace(/-perso-\d+$/, "");
              let n = 1;
              while (existsSync(join(sectionsDir, `${base}-perso-${n}`))) n++;
              id = `${base}-perso-${n}`;
              const dir = join(sectionsDir, id);
              await mkdir(dir, { recursive: true });
              const renameClass = (t) => t.replace(new RegExp(`atl-${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9])`, "g"), `atl-${id}`);
              for (const f of ["schema.json", "template.liquid", "style.css"]) {
                if (existsSync(join(srcDir, f))) await writeFile(join(dir, f), renameClass(await readFile(join(srcDir, f), "utf8")), "utf8");
              }
              const meta = { ...srcMeta, label: label || `${srcMeta.label ?? from} (modifiée)`, presetProps: clean, pageSpecific: false, status: "visible", copieDe: from, creeLe: new Date().toISOString().slice(0, 10) };
              delete meta.figeeDepuis;
              await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
            }
            // Miniature refaite en tâche de fond.
            spawn(process.execPath, [join(root, "scripts", "thumbs.mjs"), id], { cwd: root, stdio: "ignore", windowsHide: true }).on("error", () => {});
            return json(res, 200, { ok: true, id });
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
            // Demandes longues (2026-11-18) : Cloudflare coupe à 100 s sans
            // réponse (page HTML « 524 », lue comme du JSON invalide). Après
            // 20 s, la réponse commence (200) et un espace part toutes les
            // 15 s ; JSON accepte les espaces au début. Une erreur arrive
            // alors en 200 avec { error } (l'éditeur la lit aussi).
            let beat = setTimeout(function tick() {
              if (!res.headersSent) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
              }
              res.write(" ");
              beat = setTimeout(tick, 15000);
            }, 20000);
            res.on("close", () => clearTimeout(beat));
            // Journal (journalctl -u atelier) : chaque demande IA, sa durée, son issue.
            const t0 = Date.now();
            console.log(`[ia] ${parts[1]} reçue (${req.headers["content-length"] ?? "?"} octets)`);
            res.on("close", () => console.log(`[ia] ${parts[1]} terminée en ${Math.round((Date.now() - t0) / 1000)} s, statut ${res.statusCode}${res.writableFinished ? "" : " (connexion coupée avant la fin)"}`));
            const json = (r, status, body) => {
              clearTimeout(beat);
              if (status >= 400) console.log(`[ia] ${parts[1]} erreur : ${body?.error ?? status}`);
              if (r.headersSent) return r.end(JSON.stringify(status >= 400 ? { ...body, error: body?.error ?? `Erreur ${status}` } : body));
              return jsonOut(r, status, body);
            };
            const env = loadEnv("development", root, "");
            const { rewriteTexts, reworkImage, auditPage } = await import("../scripts/lib/ia.mjs");
            const b = await readBody(req);
            try {
              // Auditer la page (menu ✨ IA) : grille du skill, gains rapides.
              if (parts[1] === "audit") return json(res, 200, await auditPage({ key: env.OPENAI_API_KEY, page: b.page }));
              if (parts[1] === "textes") {
                const items = await rewriteTexts({ key: env.OPENAI_API_KEY, items: b.items, prompt: b.prompt, contexte: b.contexte, references: b.references ?? [], regles: b.regles !== false });
                return json(res, 200, { items });
              }
              if (parts[1] === "image" && NAME.test(b.page ?? "")) {
                // Image refaite : dossier « images-creees » du projet (2026-11-09).
                const folder = await mediaPlace(b.page, "images-creees");
                return json(res, 200, await reworkImage({ key: env.OPENAI_API_KEY, root, ...b, folder }));
              }
              // Studio d'images en direct (2026-11-11) : une image à la fois, la
              // consigne est construite ici (studioPrompt), rangée dans
              // « images-creees » du projet. Modèle : gpt-image-2 ou Nano Banana.
              if (parts[1] === "studio" && NAME.test(b.page ?? "")) {
                const { studioImage, studioPrompt } = await import("../scripts/lib/ia.mjs");
                const folder = await mediaPlace(b.page, "images-creees");
                const prompt = studioPrompt(b);
                return json(res, 200, await studioImage({ openaiKey: env.OPENAI_API_KEY, geminiKey: env.GEMINI_API_KEY, root, source: b.source, references: b.references ?? [], prompt, width: b.width, height: b.height, format: b.mode === "pub" ? b.format : null, model: b.modele, folder }));
              }
              // Canvas (2026-11-11) : créer une image (consigne + images de
              // référence prises sur le tableau), ou retirer le fond d'une image.
              if (parts[1] === "canvas-image" && NAME.test(b.page ?? "")) {
                const { studioImage, canvasPrompt } = await import("../scripts/lib/ia.mjs");
                const folder = await mediaPlace(b.page, "images-creees");
                const references = (b.references ?? []).slice(0, 8);
                const prompt = canvasPrompt({ prompt: b.prompt, produit: b.produit, description: b.description, nbRefs: references.length, type: b.type });
                const out = await studioImage({ openaiKey: env.OPENAI_API_KEY, geminiKey: env.GEMINI_API_KEY, root, source: null, references, prompt, width: b.width, height: b.height, format: null, model: b.modele, folder, quality: b.qualite });
                return json(res, 200, { ...out, consigne: prompt });
              }
              if (parts[1] === "section-prompts") {
                const { sectionImagePrompts } = await import("../scripts/lib/ia.mjs");
                return json(res, 200, { prompts: await sectionImagePrompts({ key: env.OPENAI_API_KEY, ...b, sections: (b.sections ?? []).slice(0, 30) }) });
              }
              if (parts[1] === "detourer" && NAME.test(b.page ?? "")) {
                const { detourerImage } = await import("../scripts/lib/ia.mjs");
                const folder = await mediaPlace(b.page, "images-creees");
                return json(res, 200, await detourerImage({ openaiKey: env.OPENAI_API_KEY, root, source: b.source, folder }));
              }
              if (parts[1] === "section") {
                const { rebuildSection } = await import("../scripts/lib/ia.mjs");
                return json(res, 200, await rebuildSection({ key: env.OPENAI_API_KEY, ...b }));
              }
            } catch (e) {
              // 500, pas 502 : Cloudflare remplace les 502 par sa propre page (2026-11-18).
              return json(res, 500, { error: e.message });
            }
            return json(res, 400, { error: "Demande IA invalide." });
          }

          // ---- Tes images (studio ou ajoutées à la main) ----
          // Page d'un projet (2026-11-09) : medias/projets/<projet>/ avec
          // images-creees/ (IA), televersees/ (ajoutées à la main) et
          // videos-creees/. Page hors projet : medias/<page>/ comme avant. Les
          // images du site d'origine restent à part (imports/<slug>/images/).
          // Téléverser une image depuis le panneau de droite.
          // ---- Croquis du stylet (2026-11-18) : medias/croquis/<page>/ ----
          //   POST /api/croquis/<page>   { image: dataURL jpeg/png, sections: [ids] }
          //   GET  /api/croquis/<page>   [{ url, le, sections }] du plus récent
          //   DELETE /api/croquis/<page>/<fichier>  (vers corbeille/croquis)
          if (parts[0] === "croquis" && NAME.test(parts[1] ?? "")) {
            const dir = join(root, "medias", "croquis", parts[1]);
            const url = `/medias/croquis/${parts[1]}`;
            if (req.method === "POST" && !parts[2]) {
              const { image, sections = [] } = await readBody(req);
              const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(image ?? "");
              if (!m) return json(res, 400, { error: "Image invalide." });
              await mkdir(dir, { recursive: true });
              const name = `croquis-${stamp()}`;
              const ext = m[1] === "png" ? "png" : "jpg";
              await writeFile(join(dir, `${name}.${ext}`), Buffer.from(m[2], "base64"));
              const ids = (Array.isArray(sections) ? sections : []).filter((x) => typeof x === "string").slice(0, 40);
              await writeFile(join(dir, `${name}.json`), JSON.stringify({ le: new Date().toISOString(), sections: ids }) + "\n");
              return json(res, 200, { ok: true, url: `${url}/${name}.${ext}` });
            }
            if (req.method === "GET" && !parts[2]) {
              if (!existsSync(dir)) return json(res, 200, []);
              const files = (await readdir(dir)).filter((f) => /\.(jpg|png)$/.test(f)).sort().reverse().slice(0, 30);
              const list = [];
              for (const f of files) {
                let meta = {};
                try {
                  meta = JSON.parse(await readFile(join(dir, f.replace(/\.(jpg|png)$/, ".json")), "utf8"));
                } catch {}
                list.push({ url: `${url}/${f}`, fichier: f, le: meta.le ?? null, sections: meta.sections ?? [] });
              }
              return json(res, 200, list);
            }
            if (req.method === "DELETE" && /^croquis-[\w-]+\.(jpg|png)$/.test(parts[2] ?? "")) {
              await mkdir(join(root, "corbeille", "croquis"), { recursive: true });
              if (existsSync(join(dir, parts[2]))) await rename(join(dir, parts[2]), join(root, "corbeille", "croquis", `${parts[1]}__${parts[2]}`));
              return json(res, 200, { ok: true });
            }
          }
          if (parts[0] === "medias" && NAME.test(parts[1] ?? "") && req.method === "POST") {
            const { name: fileName, dataUrl } = await readBody(req);
            // Images, et vidéos depuis le 2026-11-12 (« Ajouter une vidéo » du Canvas).
            const m = /^data:(?:image|video)\/(png|jpe?g|webp|gif|mp4|webm|quicktime);base64,(.+)$/.exec(dataUrl ?? "");
            if (!m) return json(res, 400, { error: "Fichier invalide (image png, jpg, webp, gif ou vidéo mp4, webm, mov)." });
            const ext = m[1] === "jpeg" ? "jpg" : m[1] === "quicktime" ? "mov" : m[1];
            const base = String(fileName ?? "image").replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
            const { dir, url } = await mediaPlace(parts[1], "televersees");
            await mkdir(dir, { recursive: true });
            const file = `${base}-${stamp()}.${ext}`;
            await writeFile(join(dir, file), Buffer.from(m[2], "base64"));
            return json(res, 200, { ok: true, url: `${url}/${file}` });
          }
          // Liste : les images de la page et, pour une page de projet, celles de
          // tout le projet. ?detail=1 : [{ url, kind }] (kind « ia »,
          // « televersee » ou « video ») ; sinon une liste d'adresses d'images.
          if (parts[0] === "medias" && NAME.test(parts[1] ?? "") && req.method === "GET") {
            const isImg = (f) => /\.(png|jpe?g|webp|gif)$/i.test(f);
            const isVid = (f) => /\.(mp4|webm|mov)$/i.test(f);
            const out = [];
            const add = async (dir, url, kindOf) => {
              const files = existsSync(dir) ? await readdir(dir) : [];
              for (const f of files) if (isImg(f) || isVid(f)) out.push({ url: `${url}/${f}`, kind: kindOf(f) });
            };
            await add(join(mediasDir, parts[1]), `/medias/${parts[1]}`, (f) => (isVid(f) ? "video" : /^ia-/.test(f) ? "ia" : "televersee"));
            const place = await mediaPlace(parts[1], "images-creees");
            if (place.projet) {
              const base = join(mediasDir, "projets", place.projet);
              const baseUrl = `/medias/projets/${place.projet}`;
              await add(join(base, "images-creees"), `${baseUrl}/images-creees`, () => "ia");
              await add(join(base, "televersees"), `${baseUrl}/televersees`, (f) => (isVid(f) ? "video" : "televersee"));
              await add(join(base, "videos-creees"), `${baseUrl}/videos-creees`, () => "video");
            }
            const detail = new URL(req.url ?? "/", "http://atelier").searchParams.get("detail") === "1";
            return json(res, 200, detail ? out : out.filter((x) => x.kind !== "video").map((x) => x.url));
          }

          // ---- Canvas (2026-11-11, refait sur Excalidraw le 2026-11-12) ----
          // Plusieurs tableaux par projet, comme la page « Canvas » de
          // Whitelabeler : medias/projets/<projet>/canvas/<id>.json (page hors
          // projet : medias/<page>/canvas/<id>.json). Un tableau : { id, nom,
          // modifie, elements (Excalidraw), files: { <fileId>: { id, mimeType,
          // dataURL: "/medias/…" } }, appState: { scrollX, scrollY, zoom },
          // aAjouter: [{ url, ratio, label, origine }] }. aAjouter : images
          // envoyées par le Studio, posées par le Canvas à l'ouverture.
          //   GET  /api/canvas/<page>               liste { projet, tableaux }
          //   POST /api/canvas/<page>               nouveau tableau { nom }
          //   GET  /api/canvas/<page>/<id>          un tableau
          //   PUT  /api/canvas/<page>/<id>          l'enregistrer
          //   POST /api/canvas/<page>/<id|dernier>/ajouter  { images }
          // L'ancien canvas.json (avant Excalidraw) devient « Tableau 1 ».
          if (parts[0] === "canvas" && NAME.test(parts[1] ?? "")) {
            const place = await mediaPlace(parts[1], "canvas");
            const base = place.projet ? join(mediasDir, "projets", place.projet) : join(mediasDir, parts[1]);
            const dir = join(base, "canvas");
            const BOARD = /^b-[a-z0-9-]{4,40}$/;
            const readJson = async (f) => {
              try {
                return JSON.parse(await readFile(f, "utf8"));
              } catch {
                return null;
              }
            };
            const writeBoard = async (b) => {
              await mkdir(dir, { recursive: true });
              await writeFile(join(dir, `${b.id}.json`), JSON.stringify(b) + "\n", "utf8");
            };
            const newId = () => `b-${stamp().toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
            // Ancien format : canvas.json → tableau « Tableau 1 » (items gardés,
            // convertis par le Canvas à l'ouverture). L'ancien fichier est renommé.
            const legacy = join(base, "canvas.json");
            if (existsSync(legacy) && !existsSync(dir)) {
              const old = (await readJson(legacy)) ?? {};
              const imgs = (old.items ?? []).filter((x) => x.type === "image" && x.url);
              await writeBoard({ id: newId(), nom: "Tableau 1", modifie: new Date().toISOString(), elements: [], files: {}, aAjouter: imgs.map((x) => ({ url: x.url, ratio: x.w && x.h ? x.w / x.h : 1, label: x.label ?? "", origine: x.origine ?? null, x: x.x, y: x.y, w: x.w })) });
              await rename(legacy, join(base, "canvas-avant-excalidraw.json"));
            }
            const list = async () => {
              const files = existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith(".json")) : [];
              const out = [];
              for (const f of files) {
                const b = await readJson(join(dir, f));
                if (b?.id) out.push({ id: b.id, nom: b.nom ?? "Tableau", modifie: b.modifie ?? null, nb: (b.elements ?? []).filter((e) => !e.isDeleted).length + (b.aAjouter ?? []).length });
              }
              return out.sort((a, b) => String(b.modifie).localeCompare(String(a.modifie)));
            };
            if (!parts[2]) {
              if (req.method === "GET") return json(res, 200, { projet: place.projet, tableaux: await list() });
              if (req.method === "POST") {
                const b = await readBody(req);
                const board = { id: newId(), nom: String(b.nom ?? "").trim().slice(0, 80) || "Nouveau tableau", modifie: new Date().toISOString(), elements: [], files: {} };
                await writeBoard(board);
                return json(res, 200, { ok: true, id: board.id });
              }
              return json(res, 405, { error: "Méthode non permise." });
            }
            let id = parts[2];
            if (id === "dernier") {
              const all = await list();
              if (all.length) id = all[0].id;
              else {
                id = newId();
                await writeBoard({ id, nom: "Tableau 1", modifie: new Date().toISOString(), elements: [], files: {} });
              }
            }
            if (!BOARD.test(id)) return json(res, 400, { error: "Tableau invalide." });
            const file = join(dir, `${id}.json`);
            if (!existsSync(file)) return json(res, 404, { error: "Tableau introuvable." });
            if (req.method === "GET" && !parts[3]) return json(res, 200, await readJson(file));
            if (req.method === "PUT" && !parts[3]) {
              const b = await readBody(req);
              const cur = (await readJson(file)) ?? {};
              const elements = (Array.isArray(b.elements) ? b.elements : []).slice(0, 5000);
              // Seules les images de l'atelier sont gardées (pas de data URL géante).
              const files = Object.fromEntries(Object.entries(b.files ?? {}).filter(([, f]) => f && /^\/(medias|imports)\//.test(f.dataURL ?? "")).map(([k, f]) => [k, { id: f.id ?? k, mimeType: f.mimeType ?? "image/png", dataURL: f.dataURL, created: f.created ?? Date.now() }]));
              const board = { ...cur, id, nom: String(b.nom ?? cur.nom ?? "Tableau").slice(0, 80), modifie: new Date().toISOString(), elements, files, appState: b.appState ?? cur.appState ?? null };
              if (b.aAjouterPris) board.aAjouter = (cur.aAjouter ?? []).slice(b.aAjouterPris);
              await writeBoard(board);
              return json(res, 200, { ok: true });
            }
            // « Supprimer ce tableau » : déplacé dans canvas/_corbeille/ (récupérable).
            if (req.method === "DELETE" && !parts[3]) {
              await mkdir(join(dir, "_corbeille"), { recursive: true });
              await rename(file, join(dir, "_corbeille", `${id}__${stamp()}.json`));
              return json(res, 200, { ok: true });
            }
            if (req.method === "POST" && parts[3] === "ajouter") {
              const b = await readBody(req);
              const cur = (await readJson(file)) ?? {};
              const imgs = (b.images ?? []).filter((x) => /^\/(medias|imports)\//.test(x?.url ?? "")).slice(0, 200);
              await writeBoard({ ...cur, modifie: new Date().toISOString(), aAjouter: [...(cur.aAjouter ?? []), ...imgs] });
              return json(res, 200, { ok: true, id, ajoutees: imgs.length });
            }
            return json(res, 405, { error: "Méthode non permise." });
          }

          // ---- Corbeille des images et vidéos du projet (2026-11-12) ----
          // POST /api/medias-corbeille { urls, force } : chaque fichier de
          // medias/ part dans corbeille/medias/ (rien n'est effacé). Sans force,
          // les fichiers encore utilisés (pages, tableaux du Canvas) ne sont pas
          // déplacés : la réponse les liste ({ utilisees }).
          // GET  /api/medias-corbeille?projet=<id>|page=<nom> : ce qui y est.
          // POST /api/medias-corbeille/restaurer { entrees } : remis à sa place.
          if (parts[0] === "medias-corbeille") {
            const BIN = join(root, "corbeille", "medias");
            const INDEX = join(BIN, "_index.json");
            const readIndex = async () => {
              try {
                return JSON.parse(await readFile(INDEX, "utf8"));
              } catch {
                return {};
              }
            };
            const fileOf = (url) => {
              if (!/^\/medias\/[a-z0-9/._-]+$/i.test(url ?? "") || url.includes("..")) return null;
              const f = normalize(join(root, url));
              return f.startsWith(normalize(mediasDir)) && existsSync(f) ? f : null;
            };
            if (req.method === "GET" && !parts[1]) {
              const q = new URL(req.url ?? "/", "http://atelier").searchParams;
              const prefix = q.get("projet") ? `/medias/projets/${q.get("projet")}/` : q.get("page") ? `/medias/${q.get("page")}/` : "/medias/";
              const idx = await readIndex();
              return json(res, 200, Object.entries(idx).filter(([, v]) => v.url.startsWith(prefix)).map(([entree, v]) => ({ entree, ...v, apercu: `/corbeille/medias/${entree}` })).sort((a, b) => String(b.quand).localeCompare(String(a.quand))));
            }
            if (req.method === "POST" && parts[1] === "restaurer") {
              const { entrees } = await readBody(req);
              const idx = await readIndex();
              let n = 0;
              for (const e of Array.isArray(entrees) ? entrees : []) {
                const v = idx[e];
                if (!v || !/^[a-z0-9._-]+$/i.test(e)) continue;
                const dest = normalize(join(root, v.url));
                if (!dest.startsWith(normalize(mediasDir)) || existsSync(dest)) continue;
                await mkdir(dirname(dest), { recursive: true });
                await rename(join(BIN, e), dest);
                delete idx[e];
                n++;
              }
              await writeFile(INDEX, JSON.stringify(idx, null, 1), "utf8");
              return json(res, 200, { ok: true, restaurees: n });
            }
            if (req.method === "POST" && !parts[1]) {
              const { urls, force } = await readBody(req);
              const list = (Array.isArray(urls) ? urls : []).slice(0, 500).filter((u) => fileOf(u));
              // Où sert chaque fichier : pages (pages/*.json) et tableaux du Canvas.
              const pageTexts = [];
              for (const f of existsSync(pagesDir) ? (await readdir(pagesDir)).filter((x) => x.endsWith(".json")) : []) pageTexts.push([f.slice(0, -5), await readFile(join(pagesDir, f), "utf8")]);
              const boardTexts = [];
              const scanBoards = async (dir) => {
                for (const f of existsSync(dir) ? (await readdir(dir)).filter((x) => x.endsWith(".json")) : []) {
                  const t = await readFile(join(dir, f), "utf8");
                  let nom = f;
                  try {
                    nom = JSON.parse(t).nom ?? f;
                  } catch {}
                  boardTexts.push([nom, t]);
                }
              };
              const projDirs = existsSync(join(mediasDir, "projets")) ? await readdir(join(mediasDir, "projets")) : [];
              for (const p of projDirs) await scanBoards(join(mediasDir, "projets", p, "canvas"));
              for (const p of await readdir(mediasDir)) if (p !== "projets") await scanBoards(join(mediasDir, p, "canvas"));
              const utilisees = [];
              const ok = [];
              for (const u of list) {
                const pages = pageTexts.filter(([, t]) => t.includes(u)).map(([n]) => n);
                const tableaux = boardTexts.filter(([, t]) => t.includes(u)).map(([n]) => n);
                if ((pages.length || tableaux.length) && !force) utilisees.push({ url: u, pages, tableaux });
                else ok.push(u);
              }
              if (utilisees.length && !force) return json(res, 200, { ok: false, utilisees });
              await mkdir(BIN, { recursive: true });
              const idx = await readIndex();
              const when = stamp();
              for (const u of ok) {
                const f = fileOf(u);
                const entree = `${when}-${Math.random().toString(36).slice(2, 6)}-${u.split("/").pop()}`.replace(/[^a-z0-9._-]/gi, "-");
                await rename(f, join(BIN, entree));
                idx[entree] = { url: u, quand: new Date().toISOString() };
              }
              await writeFile(INDEX, JSON.stringify(idx, null, 1), "utf8");
              return json(res, 200, { ok: true, deplacees: ok.length });
            }
            return json(res, 405, { error: "Méthode non permise." });
          }

          // ---- Images du site d'origine : imports/<slug>/images/ ----
          // Source d'inspiration du sélecteur de médias (onglet « Site d'origine »).
          if (parts[0] === "medias-origin" && NAME.test(parts[1] ?? "") && req.method === "GET") {
            const dir = join(importsDir, parts[1], "images");
            const files = existsSync(dir) ? await readdir(dir) : [];
            return json(res, 200, files.filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)).map((f) => `/imports/${parts[1]}/images/${f}`));
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
            // Pages qui utilisent cette section (avertissement avant suppression).
            if (parts[2] === "pages" && req.method === "GET") {
              const files = existsSync(pagesDir) ? (await readdir(pagesDir)).filter((f) => f.endsWith(".json")) : [];
              const used = [];
              for (const f of files) {
                let page;
                try {
                  page = JSON.parse(await readFile(join(pagesDir, f), "utf8"));
                } catch {
                  continue;
                }
                if (!(page.content ?? []).some((c) => c.type === parts[1])) continue;
                const props = page.root?.props ?? {};
                used.push({ name: f.slice(0, -5), title: props.title ?? "", projet: props.projet ?? "" });
              }
              return json(res, 200, used);
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
              const types = ["capture", "site", "bibliotheque", "design", "ia", "textes", "images", "creatives", "offre", "fondations", "auditdesign"];
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
