// Atelier compilé (2026-11-17) : sert dist/ (npm run build) et la même API
// que le serveur de développement (server/sections.mjs, server/api.mjs),
// sans Vite en mode développement : ouverture plus rapide, moins de mémoire.
//
//   node server/production.mjs            port 5180 (PORT=5182 pour un essai)
//   npm run build                         après un changement dans src/
//   sudo systemctl restart atelier        après un changement dans server/
//
// Le mode développement reste possible : npx vite --host 127.0.0.1.
import http from "node:http";
import { EventEmitter } from "node:events";
import { existsSync, watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { root } from "./commun.mjs";
import { sectionsBundle } from "./sections.mjs";
import { atelierApi } from "./api.mjs";

const PORT = Number(process.env.PORT ?? 5180);
const HOST = process.env.HOST ?? "127.0.0.1";
const dist = join(root, "dist");
// Dossiers de l'atelier lisibles tels quels (comme avec Vite) : miniatures,
// médias, captures d'import, design.md, exports.
const PUBLIC_DIRS = new Set(["designs", "medias", "sections", "imports", "export"]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".wasm": "application/wasm",
};
const COMPRESS = /^(text\/|application\/(json|wasm)|image\/svg)/;

// ---- Pile de « middlewares » façon connect (celle de Vite) ----
const stack = [];
const middlewares = {
  use(path, fn) {
    if (typeof path === "function") [fn, path] = [path, "/"];
    stack.push({ path: path.replace(/\/$/, "") || "/", fn });
    return middlewares;
  },
};
function handle(req, res, i, last) {
  if (i >= stack.length) return last();
  const { path, fn } = stack[i];
  const url = req.url;
  const next = (err) => {
    req.url = url;
    if (err) return fail(res, err);
    handle(req, res, i + 1, last);
  };
  let inner = url;
  if (path !== "/") {
    const p = url.split("?")[0];
    if (p !== path && !p.startsWith(`${path}/`)) return next();
    inner = url.slice(path.length) || "/";
    if (!inner.startsWith("/")) inner = `/${inner}`;
  }
  req.url = inner;
  try {
    const r = fn(req, res, next);
    if (r?.catch) r.catch((e) => fail(res, e));
  } catch (e) {
    fail(res, e);
  }
}
function fail(res, e) {
  console.error("[atelier]", e);
  if (res.headersSent) return res.end();
  res.statusCode = 500;
  res.end("Erreur du serveur.");
}

// ---- Messages en direct (remplace la connexion de Vite) ----
const clients = new Set();
function send(event, data) {
  const line = `data: ${JSON.stringify({ event, data })}\n\n`;
  for (const c of clients) c.write(line);
}
middlewares.use("/api/evenements", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write("retry: 3000\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});
// Le tunnel coupe une connexion muette : un signe de vie toutes les 25 s.
setInterval(() => {
  for (const c of clients) c.write(": garde\n\n");
}, 25000).unref();

// ---- Ce que les modules server/ attendent de Vite ----
const watcher = new EventEmitter();
for (const d of ["sections", "designs"]) {
  const dir = join(root, d);
  if (!existsSync(dir)) continue;
  watch(dir, { recursive: true }, (_type, file) => file && watcher.emit("change", join(dir, String(file))));
}
const httpServer = http.createServer((req, res) => {
  req.originalUrl = req.url;
  handle(req, res, 0, () => serveStatic(req, res));
});
const fakeServer = {
  middlewares,
  httpServer,
  watcher,
  ws: { send: ({ event, data }) => send(event, data) },
  ssrLoadModule: (p) => import(pathToFileURL(join(root, p)).href),
};
for (const plugin of [sectionsBundle(), atelierApi()]) plugin.configureServer(fakeServer);

// Nouvelle version compilée (npm run build) : les onglets ouverts proposent de recharger.
let versionTimer = null;
if (existsSync(dist))
  watch(dist, (_type, file) => {
    if (!/\.html$/.test(String(file))) return;
    clearTimeout(versionTimer);
    versionTimer = setTimeout(() => send("atl-version", {}), 1500);
  });

// ---- Fichiers ----
const gzCache = new Map();
function inside(base, rel) {
  const full = normalize(join(base, rel));
  return full === base || full.startsWith(base + sep) ? full : null;
}
async function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 404;
    return res.end();
  }
  let path;
  try {
    path = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.statusCode = 400;
    return res.end();
  }
  if (path.split("/").some((s) => s.startsWith("."))) {
    res.statusCode = 404;
    return res.end();
  }
  let file = null;
  let immutable = false;
  if (path === "/" || path === "/index.html") file = join(dist, "index.html");
  else if (path === "/catalogue.html") file = join(dist, "catalogue.html");
  else if (path === "/agents.html") file = join(dist, "agents.html");
  else if (path === "/recherche.html") file = join(dist, "recherche.html");
  else {
    const top = path.split("/")[1];
    const inDist = inside(dist, path);
    if (inDist && existsSync(inDist)) {
      file = inDist;
      immutable = top === "assets";
    } else if (PUBLIC_DIRS.has(top)) file = inside(root, path);
  }
  let info = file && existsSync(file) ? await stat(file) : null;
  if (!info?.isFile()) {
    // Comme Vite : une adresse inconnue demandée par le navigateur ouvre l'atelier.
    if ((req.headers.accept ?? "").includes("text/html")) {
      file = join(dist, "index.html");
      info = await stat(file);
    } else {
      res.statusCode = 404;
      return res.end();
    }
  }
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const etag = `"${info.size.toString(36)}-${Math.round(info.mtimeMs).toString(36)}"`;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.statusCode = 304;
    return res.end();
  }
  let body = await readFile(file);
  if (COMPRESS.test(type) && body.length > 1024 && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
    const key = `${file}|${etag}`;
    let gz = gzCache.get(key);
    if (!gz) {
      gz = gzipSync(body, { level: 6 });
      if (gzCache.size > 400) gzCache.clear();
      gzCache.set(key, gz);
    }
    body = gz;
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
  }
  res.setHeader("Content-Length", body.length);
  res.end(req.method === "HEAD" ? undefined : body);
}

httpServer.listen(PORT, HOST, () => console.log(`[atelier] version compilée sur http://${HOST}:${PORT}`));
