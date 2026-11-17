// Liste des sections servie par /api/sections-data (cache, ETag, mise à jour
// quand un dossier sections/<id>/ change). Sorti de vite.config.js le 2026-11-17.
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

export function sectionsBundle() {
  const dir = join(root, "sections");
  const slash = (p) => p.split(String.fromCharCode(92)).join("/");
  const prefix = `${slash(dir)}/`;
  const cache = new Map(); // id → { json, pageSpecific }
  const gz = new Map(); // réponses compressées, vidées à chaque changement
  let ready = null;
  let validate = null; // validateSection (src/engine/shopify.js), chargé par Vite

  async function readOne(id) {
    const d = join(dir, id);
    if (!existsSync(join(d, "schema.json"))) return void cache.delete(id);
    let section;
    try {
      const read = (f) => (existsSync(join(d, f)) ? readFile(join(d, f), "utf8") : Promise.resolve(""));
      const [schema, meta, template, css] = await Promise.all([read("schema.json"), read("meta.json"), read("template.liquid"), read("style.css")]);
      section = {
        id,
        schema: JSON.parse(schema),
        meta: meta ? JSON.parse(meta) : {},
        template,
        css,
        thumbnail: existsSync(join(d, "thumbnail.png")) ? `/sections/${id}/thumbnail.png` : null,
      };
    } catch (e) {
      // Fichier en cours d'écriture ou illisible : visible comme tel.
      section = { id, schema: { name: id, settings: [] }, meta: { label: `${id} (illisible : ${e.message})` }, template: "", css: "", thumbnail: null };
    }
    cache.set(id, {
      json: JSON.stringify(section),
      light: JSON.stringify({ ...section, template: "", css: "", leger: true, errors: validate ? validate(section) : [] }),
      pageSpecific: Boolean(section.meta?.pageSpecific),
    });
  }
  async function loadAll() {
    const ids = await readdir(dir);
    for (let i = 0; i < ids.length; i += 32) await Promise.all(ids.slice(i, i + 32).map(readOne));
  }
  const ensure = () => (ready ??= loadAll());

  return {
    name: "atelier-sections",
    configureServer(server) {
      ready = server
        .ssrLoadModule("/src/engine/shopify.js")
        .then((m) => (validate = m.validateSection))
        .catch(() => {})
        .then(loadAll);
      // design.md (2026-11-17) : { id: { md, png } }, png = date de la miniature.
      const designsDir = join(root, "designs");
      const dprefix = `${slash(designsDir)}/`;
      let designsGz = null;
      server.middlewares.use("/api/designs-data", async (req, res) => {
        if (!designsGz) {
          const { stat } = await import("node:fs/promises");
          const files = (await readdir(designsDir)).filter((f) => f.endsWith(".md"));
          const out = {};
          await Promise.all(
            files.map(async (f) => {
              const id = f.slice(0, -3);
              const png = join(designsDir, `${id}.png`);
              out[id] = { md: await readFile(join(designsDir, f), "utf8"), png: existsSync(png) ? Math.round((await stat(png)).mtimeMs) : 0 };
            }),
          );
          const body = gzipSync(Buffer.from(JSON.stringify(out)), { level: 6 });
          designsGz = { body, etag: `"${createHash("sha1").update(body).digest("hex").slice(0, 20)}"` };
        }
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("ETag", designsGz.etag);
        if (req.headers["if-none-match"] === designsGz.etag) {
          res.statusCode = 304;
          return res.end();
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Encoding", "gzip");
        res.end(designsGz.body);
      });
      let designsTimer = null;
      const designsChanged = () => {
        designsGz = null;
        clearTimeout(designsTimer);
        designsTimer = setTimeout(() => server.ws.send({ type: "custom", event: "atl-designs", data: {} }), 400);
      };

      server.middlewares.use("/api/sections-data", async (req, res) => {
        await ensure();
        const params = new URL(req.url ?? "/", "http://atelier").searchParams;
        const page = params.get("page");
        if (params.get("ids")) {
          const ids = params.get("ids").split(",");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          return res.end(`[${ids.filter((id) => cache.has(id)).map((id) => cache.get(id).json).join(",")}]`);
        }
        let used = null;
        if (page && /^[a-z0-9-]+$/.test(page) && existsSync(join(root, "pages", `${page}.json`))) {
          try {
            used = new Set((JSON.parse(await readFile(join(root, "pages", `${page}.json`), "utf8")).content ?? []).map((c) => c.type));
          } catch {
            used = new Set();
          }
        }
        // Page demandée mais introuvable (supprimée, à la corbeille) : version
        // légère, jamais toutes les sections en entier (2026-11-09 : un onglet
        // resté sur une page supprimée faisait planter le serveur en boucle).
        const leger = !used && (params.get("leger") === "1" || params.has("page"));
        const key = used ? `${page}:${[...used].sort().join(",")}` : leger ? "*leger" : "*";
        // Vitesse (2026-11-17) : réponse gardée compressée avec son empreinte
        // (ETag) ; le navigateur revalide et reçoit « 304 » si rien n'a changé
        // au lieu de retélécharger ~2,7 Mo à chaque ouverture de l'atelier.
        let entry = gz.get(key);
        if (!entry) {
          const parts = [...cache.entries()]
            .filter(([id, s]) => !used || !s.pageSpecific || used.has(id))
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([id, s]) => (leger || (used && !used.has(id)) ? s.light : s.json));
          // En octets, pas en une seule chaîne : toutes les sections en entier
          // dépassent la taille maximale d'une chaîne JavaScript.
          const bufs = [Buffer.from("[")];
          parts.forEach((p, i) => bufs.push(Buffer.from(i ? `,${p}` : p)));
          bufs.push(Buffer.from("]"));
          const body = gzipSync(Buffer.concat(bufs), { level: 6 });
          entry = { body, etag: `"${createHash("sha1").update(body).digest("hex").slice(0, 20)}"` };
          if (gz.size > 30) gz.clear();
          gz.set(key, entry);
        }
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("ETag", entry.etag);
        if (req.headers["if-none-match"] === entry.etag) {
          res.statusCode = 304;
          return res.end();
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Encoding", "gzip");
        res.end(entry.body);
      });

      // Changement dans sections/<id>/ : ce dossier seulement est relu, puis
      // les pages ouvertes sont prévenues (sans rechargement).
      const changed = new Set();
      let timer = null;
      const onChange = (file) => {
        const f = slash(file);
        if (f.startsWith(dprefix)) return designsChanged();
        if (!f.startsWith(prefix)) return;
        changed.add(f.slice(prefix.length).split("/")[0]);
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const ids = [...changed];
          changed.clear();
          await ensure();
          for (const id of ids) await readOne(id);
          gz.clear();
          // Plus de rechargement de toutes les pages ouvertes : un message
          // « ces sections ont changé » ; chaque page décide (src/engine/sections.js).
          server.ws.send({ type: "custom", event: "atl-sections", data: { ids, removed: ids.filter((id) => !cache.has(id)) } });
        }, 400);
      };
      for (const ev of ["add", "change", "unlink", "addDir", "unlinkDir"]) server.watcher.on(ev, onChange);
    },
  };
}
