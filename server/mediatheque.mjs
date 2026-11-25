// Médiathèque (lot A du plan images et vidéos, 2026-11-24).
// Chaque image ou vidéo du projet reçoit une fiche, sans déplacer les fichiers :
//   type        image | video
//   provenance  projet | reference | creee        (onglets Projet / Références / Créées)
//   sous        produit, marque, ajoutee, origine, wh, site, ia, agent, studio, mirror
//   destination [produit, landing, homepage, advertorial, pub, marque]
//   style       mockup, ugc, avant-apres, lifestyle, fond-blanc, infographie, autre
//   choix       brouillon | selectionnee | ecartee
//   utiliseeDans [pages et pubs où l'adresse apparaît] (calculé à chaque lecture)
//   origine     { source, consigne, agent, modele, depuis, references, cout }
// Le classement automatique part des dossiers, des noms de fichiers, des
// tableaux du Canvas (customData.origine) et de la liste des pubs ; ce que
// l'utilisateur change est gardé dans _fiches.json (prioritaire).
//   GET   /api/mediatheque/<page>                         → { projet, items }
//   PATCH /api/mediatheque/<page> { urls, set }           → { ok, n }
import { existsSync } from "node:fs";
import { readFile, readdir, rename, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const IMG = /\.(png|jpe?g|webp|gif|avif)$/i;
const VID = /\.(mp4|webm|mov)$/i;
const CHOIX = ["brouillon", "selectionnee", "ecartee"];
const DESTS = ["produit", "landing", "homepage", "advertorial", "pub", "marque"];
const STYLES = ["mockup", "ugc", "avant-apres", "lifestyle", "fond-blanc", "infographie", "autre"];
const PROVS = ["projet", "reference", "creee"];
const STYLE_MODE = { mockup: "mockup", ugc: "ugc", transformation: "avant-apres", marque: "autre", scroll: "autre", rebuild: "autre", replicator: "autre" };
const AGENT_MODE = { rebuild: "AI Ad Rebuilder V3", replicator: "AI Winning Ad Replicator", ugc: "Hyper Realistic UGC Image Studio", mockup: "Product Mockup Generator", marque: "Branded Image Creator", scroll: "Scroll-Stopping Image Ad Specialists", transformation: "AI Transformation Image Ad Generator" };

const lire = async (f, d) => {
  try {
    return existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : d;
  } catch {
    return d;
  }
};
const verrous = new Map();
function sousVerrou(cle, fn) {
  const next = (verrous.get(cle) ?? Promise.resolve()).then(fn, fn);
  verrous.set(cle, next.catch(() => {}));
  return next;
}

async function lieux(root, page) {
  const { mediaPlace } = await import("./commun.mjs");
  const place = await mediaPlace(page, "images-creees");
  const base = place.projet ? join(root, "medias", "projets", place.projet) : join(root, "medias", page);
  const baseUrl = place.projet ? `/medias/projets/${place.projet}` : `/medias/${page}`;
  return { projet: place.projet, base, baseUrl, fiches: join(base, "_fiches.json") };
}

// Une fiche ajoutée par une création (Canvas, pub, import WH…) : n'écrase pas ce que l'utilisateur a choisi.
export async function noterFiche(root, page, url, data) {
  try {
    const { base, fiches } = await lieux(root, page);
    await mkdir(base, { recursive: true });
    await sousVerrou(fiches, async () => {
      const all = await lire(fiches, {});
      all[url] = { ...data, ...(all[url] ?? {}), origine: { ...(data.origine ?? {}), ...(all[url]?.origine ?? {}) }, quand: all[url]?.quand ?? new Date().toISOString() };
      const tmp = `${fiches}.${Date.now().toString(36)}.tmp`;
      await writeFile(tmp, JSON.stringify(all, null, 1));
      await rename(tmp, fiches);
    });
  } catch {}
}

// Change une fiche en imposant les valeurs (ex. ancienne version d'une pub → écartée).
export async function forcerFiche(root, page, url, set) {
  try {
    const { base, fiches } = await lieux(root, page);
    await mkdir(base, { recursive: true });
    await sousVerrou(fiches, async () => {
      const all = await lire(fiches, {});
      all[url] = { ...(all[url] ?? {}), ...set, modifie: new Date().toISOString() };
      const tmp = `${fiches}.${Date.now().toString(36)}.tmp`;
      await writeFile(tmp, JSON.stringify(all, null, 1));
      await rename(tmp, fiches);
    });
  } catch {}
}

async function fichiers(dir, url) {
  if (!existsSync(dir)) return [];
  const out = [];
  const { stat } = await import("node:fs/promises");
  for (const f of await readdir(dir)) if (IMG.test(f) || VID.test(f)) out.push({ f, url: `${url}/${f}`, quand: (await stat(join(dir, f)).catch(() => null))?.mtime?.toISOString() ?? null });
  return out;
}

export async function mediathequeRoute(req, res, parts, { root, readBody, json }) {
  const page = parts[1];
  if (!/^[a-z0-9][a-z0-9_-]{0,90}$/i.test(page ?? "")) return json(res, 400, { error: "Page invalide." });
  const L = await lieux(root, page);

  if (req.method === "PATCH") {
    const b = await readBody(req);
    const urls = (Array.isArray(b.urls) ? b.urls : []).filter((u) => typeof u === "string" && u.startsWith("/")).slice(0, 500);
    const s = b.set ?? {};
    const set = {};
    if (CHOIX.includes(s.choix)) set.choix = s.choix;
    if (PROVS.includes(s.provenance)) set.provenance = s.provenance;
    if (typeof s.sous === "string") set.sous = s.sous.slice(0, 30);
    if (Array.isArray(s.destination)) set.destination = s.destination.filter((d) => DESTS.includes(d));
    if (STYLES.includes(s.style) || s.style === "") set.style = s.style;
    await mkdir(L.base, { recursive: true });
    await sousVerrou(L.fiches, async () => {
      const all = await lire(L.fiches, {});
      for (const u of urls) all[u] = { ...(all[u] ?? {}), ...set, modifie: new Date().toISOString() };
      const tmp = `${L.fiches}.${Date.now().toString(36)}.tmp`;
      await writeFile(tmp, JSON.stringify(all, null, 1));
      await rename(tmp, L.fiches);
    });
    return json(res, 200, { ok: true, n: urls.length });
  }
  if (req.method !== "GET") return json(res, 405, { error: "Méthode non prise en charge." });

  const items = new Map();
  const put = (url, it) => {
    const cur = items.get(url);
    items.set(url, cur ? { ...it, ...cur, origine: { ...(it.origine ?? {}), ...(cur.origine ?? {}) } } : { url, ...it });
  };

  // 1. Fichiers des dossiers du projet (ou de la page hors projet).
  const dossiers = L.projet
    ? [["images-creees", "creee"], ["videos-creees", "creee"], ["televersees", null]]
    : [[".", null]];
  for (const [d, prov] of dossiers) {
    const list = await fichiers(d === "." ? L.base : join(L.base, d), d === "." ? L.baseUrl : `${L.baseUrl}/${d}`);
    const noms = new Set(list.map((x) => x.f));
    for (const { f, url, quand } of list) {
      const type = VID.test(f) ? "video" : "image";
      // Image d'aperçu d'une vidéo (même nom en .jpg) : pas une image à part.
      if (type === "image" && [".mp4", ".webm", ".mov"].some((e) => noms.has(f.replace(/\.[a-z]+$/i, e)))) continue;
      const poster = type === "video" ? [".jpg", ".png"].map((e) => f.replace(/\.[a-z0-9]+$/i, e)).find((p) => noms.has(p)) : null;
      let provenance = prov;
      let sous = "ia";
      if (!provenance) {
        if (/^wh-/.test(f)) (provenance = "reference"), (sous = "wh");
        else if (/^(studio|ia|omni)-/.test(f)) (provenance = "creee"), (sous = /^studio-/.test(f) ? "studio" : "ia");
        else (provenance = "projet"), (sous = "a-classer");
      } else if (/^studio-/.test(f)) sous = "studio";
      put(url, { type, provenance, sous, poster: poster ? url.replace(/[^/]+$/, poster) : null, choix: provenance === "creee" ? "brouillon" : "selectionnee", destination: [], style: "", origine: {}, quand });
    }
  }

  // 1 bis. Mirror : la pub vidéo concurrente analysée → Références ; les images
  // de référence qu'il a fabriquées (mirror/<id>/images/) → Créées.
  const mdir = join(L.base, "mirror");
  for (const id of existsSync(mdir) ? await readdir(mdir) : []) {
    const st = await lire(join(mdir, id, "etat.json"), null);
    if (!st) continue;
    if (typeof st.video === "string") {
      const it = items.get(st.video);
      put(st.video, { type: "video", provenance: "reference", sous: "concurrent", poster: st.poster || it?.poster || null, choix: "selectionnee", destination: [], style: "", origine: { source: "Mirror · pub concurrente" } });
      if (it) items.set(st.video, { ...items.get(st.video), provenance: "reference", sous: "concurrent" });
    }
    for (const { f, url, quand } of await fichiers(join(mdir, id, "images"), `${L.baseUrl}/mirror/${id}/images`)) {
      if (!IMG.test(f)) continue;
      const k = f.replace(/\.[a-z0-9]+$/i, "");
      put(url, { type: "image", provenance: "creee", sous: "mirror", choix: "brouillon", destination: ["pub"], style: "", quand, origine: { source: "Mirror · images de référence", modele: st.images?.[k]?.modele ?? null, depuis: st.video ?? null } });
    }
  }

  // 2. Photos du produit et logo des pages du projet, kit de marque du projet.
  const pagesDir = join(root, "pages");
  const pagesProjet = [];
  for (const f of existsSync(pagesDir) ? await readdir(pagesDir) : []) {
    if (!f.endsWith(".json")) continue;
    const nom = f.slice(0, -5);
    if (!L.projet && nom !== page) continue;
    const raw = await readFile(join(pagesDir, f), "utf8").catch(() => "");
    if (L.projet && !raw.includes(`"projet": "${L.projet}"`) && !raw.includes(`"projet":"${L.projet}"`)) continue;
    let pg;
    try {
      pg = JSON.parse(raw);
    } catch {
      continue;
    }
    if (L.projet && pg.root?.props?.projet !== L.projet) continue;
    pagesProjet.push({ nom, raw, titre: pg.root?.props?.title || nom });
    const r = pg.root?.props ?? {};
    for (const u of Array.isArray(r.photos_produit) ? r.photos_produit : []) if (typeof u === "string" && u.startsWith("/")) put(u, { type: "image", provenance: "projet", sous: "produit", choix: "selectionnee", destination: [], style: "", origine: {} });
    if (typeof r.logo === "string" && r.logo.startsWith("/")) put(r.logo, { type: "image", provenance: "projet", sous: "marque", choix: "selectionnee", destination: ["marque"], style: "", origine: {} });
  }
  if (L.projet) {
    const pj = await lire(join(root, "projets", `${L.projet}.json`), {});
    const m = pj.marque ?? {};
    for (const u of [...(m.logos ?? []), ...(m.brandBoard ? [m.brandBoard] : [])]) if (typeof u === "string" && u.startsWith("/")) put(u, { type: "image", provenance: "projet", sous: "marque", choix: "selectionnee", destination: ["marque"], style: "", origine: {} });
  }

  // 3. Pubs (étape Publicités) : destination pub, style et agent d'après le mode.
  const pubs = L.projet ? (await lire(join(root, "projets", "_publicites", `${L.projet}.json`), { pubs: [] })).pubs ?? [] : [];
  for (const p of pubs) {
    const pu = p.image || p.video;
    if (!pu) continue;
    const it = items.get(pu);
    if (!it) continue;
    // Média ajouté au registre depuis la médiathèque : seulement la destination « pub ».
    if (p.mode === "ajoutee") {
      items.set(pu, { ...it, destination: [...new Set([...(it.destination ?? []), "pub"])] });
      continue;
    }
    items.set(pu, { ...it, destination: [...new Set([...(it.destination ?? []), "pub"])], style: it.style || STYLE_MODE[p.mode] || "", sous: "agent", origine: { source: "Publicités", agent: AGENT_MODE[p.mode] ?? p.mode, consigne: p.plan?.accroche ? `${p.plan.idee ?? ""} · « ${p.plan.accroche} »` : p.consigne || "", depuis: p.source || null, modele: "Nano Banana", ...it.origine } });
  }

  // 4. Tableaux du Canvas : la fiche « origine » posée sur chaque image ou vidéo.
  const cdir = join(L.base, "canvas");
  for (const f of existsSync(cdir) ? await readdir(cdir) : []) {
    if (!f.endsWith(".json")) continue;
    const b = await lire(join(cdir, f), null);
    const files = b?.files ?? {};
    for (const e of b?.elements ?? []) {
      if (e.isDeleted) continue;
      const url = e.customData?.url ?? (e.fileId && files[e.fileId]?.dataURL?.startsWith?.("/") ? files[e.fileId].dataURL : null);
      const o = e.customData?.origine;
      if (!url || !o || !items.has(url)) continue;
      const it = items.get(url);
      const sous = o.source === "WinningHunter" ? "wh" : it.sous;
      items.set(url, { ...it, sous, provenance: o.source === "WinningHunter" ? "reference" : it.provenance, origine: { source: o.source, consigne: o.consigne, modele: o.modele, references: o.references, ...it.origine } });
    }
  }

  // 5. Fiches enregistrées (choix de l'utilisateur, créations notées) : prioritaires.
  const fiches = await lire(L.fiches, {});
  for (const [url, fi] of Object.entries(fiches)) {
    const it = items.get(url);
    if (!it) continue;
    items.set(url, { ...it, ...fi, origine: { ...(it.origine ?? {}), ...(fi.origine ?? {}) } });
  }

  // 6. Où chaque média est utilisé (pages du projet, pubs).
  for (const it of items.values()) {
    const ou = pagesProjet.filter((p) => p.raw.includes(it.url)).map((p) => ({ type: "page", nom: p.nom, titre: p.titre }));
    for (const p of pubs) if (p.image === it.url || p.video === it.url) ou.push({ type: "pub", id: p.id, titre: p.plan?.accroche || p.titre || "Pub" });
    it.utiliseeDans = ou;
  }

  const list = [...items.values()].sort((a, b) => String(b.quand ?? b.url).localeCompare(String(a.quand ?? a.url)));
  return json(res, 200, { projet: L.projet, items: list });
}
