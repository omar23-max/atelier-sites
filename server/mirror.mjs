// Mirror (2026-11-20) : adapter une pub vidéo concurrente à ton produit.
// Chaîne en 4 étapes, d'après la méthode Ad Mirror de Whitelabeler :
//   1. analyse  : rea-video découpe la vidéo (plans, images, répliques,
//                 textes à l'écran) ; remplace leur « Scene Lab » ;
//   2. cast     : fiche de continuité + prompts des images de référence ;
//   3. story    : argumentaire (une validation), puis script, tableau plan
//                 par plan et blocs de 30 s ;
//   4. motion   : prompts Seedance (TopView) du bloc A, puis des suivants.
// Les consignes des étapes 2 à 4 sont les prompts Whitelabeler, dans
// server/mirror/*.md, relus à chaque appel. Tout tourne en tâche de fond :
// le navigateur interroge l'état (Cloudflare coupe au bout de 100 s).
import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, readdir, copyFile, rm } from "node:fs/promises";
import { dirname, join, normalize, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const HERE = dirname(fileURLToPath(import.meta.url));
const REA = process.env.REA_VIDEO_BIN || "/home/ubuntu/outils/rea-video-venv/bin/rea-video";
const MODEL = process.env.MIRROR_MODEL || "gpt-5.5";
const ID = /^m-[a-z0-9-]{6,40}$/;
const STEPS = ["cast", "argument", "story", "motion", "suite", "adapter"];
// Lot 4 de la refonte (2026-11-23) : un agent spécialiste par étape vidéo.
// « Affiner avec l'agent » refait l'étape en appliquant sa méthode à la
// réponse précédente, sans changer le format attendu par l'étape.
export const STEP_AGENTS = {
  cast: { slug: "shopfunnels-claude-ugc-video-producer-v-2", titre: "Claude UGC Video Producer V2" },
  argument: { slug: "shopfunnels-claude-video-ad-cloner-v-1", titre: "Claude Video Ad Cloner" },
  story: { slug: "shopfunnels-ai-scene-architect", titre: "AI Scene Architect" },
  motion: { slug: "shopfunnels-seedance-video-ad-cloner-v-1", titre: "Seedance Video Ad Cloner" },
  suite: { slug: "shopfunnels-seedance-video-ad-cloner-v-1", titre: "Seedance Video Ad Cloner" },
};
async function agentText(root, slug) {
  const d = join(root, "agents", "whitelabeler");
  for (const f of [join(d, "consignes-propres", `${slug}.txt`), join(d, "consignes", `${slug}.txt`)]) if (existsSync(f)) return (await readFile(f, "utf8")).slice(0, 14000);
  return "";
}

// Pub image : consigne écrite pour l'atelier (Whitelabeler n'en a pas pour
// les images). Même doctrine que la vidéo : même squelette, ton produit, tes
// vraies preuves.
const IMAGE_SYSTEM = `You are a senior direct-response ad creative director. The user found a competitor's static image ad that works and wants the same ad for their own product (the "Mirror method").

Doctrine
- Same skeleton, better muscles: keep what makes the ad work (the hook mechanism, layout, visual idea, hierarchy, emotional register, the job of each element) and rebuild it around the user's product, its real features and the user's audience.
- The product is SWAPPED, never redesigned: it must look exactly like the user's photos.
- Credible copy converts: use only facts given about the product. Never invent numbers, reviews, ratings, studies, awards, certifications, guarantees, prices or discounts. If the competitor relies on a proof the user does not have, replace it with a real feature or a concrete benefit, and say so.
- Short ad copy: headline 3 to 9 words, optional secondary line up to 12 words, CTA 1 to 4 words. Written in the ad language requested.

Work
1. Read the competitor's ad: what it sells, the hook and its mechanism (pattern break, callout, before/after, comparison, testimonial, offer, curiosity...), the layout and visual hierarchy, every piece of text verbatim, the proof elements, the CTA, the target audience and awareness level.
2. Transfer: map each element to the user's product (same job, user's truth).
3. Propose exactly 3 variants: variant 1 is the closest mirror (same hook mechanism and layout); variants 2 and 3 keep the layout but test a different angle taken from the product facts (e.g. a different pain, benefit or audience).

For each variant write "prompt": an English image-generation brief of 60 to 140 words describing the user's ad to create, as a scene and layout description: background, where the product sits and how big, props, people if any (ordinary, realistic), light, colours, typography style and where each text sits. Refer to the product as "the product from the product photos". Do NOT write the ad's words inside "prompt" (they are given separately), do not mention the competitor's brand.

Answer ONLY in JSON:
{"analyse": "Markdown in French (Québec, plain words, tutoiement): what the ad does and why it works, the text transcribed, then the transfer to the user's product in a short table (élément de la pub | job | chez toi), and what you could not transfer and why.",
 "variantes": [{"titre": "short French name", "angle": "French, one line", "pourquoi": "French, one or two lines", "accroche": "...", "sousTitre": "... or empty", "cta": "... or empty", "autres": "other small text or empty", "prompt": "English brief"}]}
No em dashes.`;

// Format le plus proche de l'image (pour la variante générée).
async function ratioOf(file) {
  const dims = await new Promise((ok) => execFile("vipsheader", ["-f", "width", file], (e, w) => execFile("vipsheader", ["-f", "height", file], (e2, h) => ok([Number(w), Number(h)]))));
  const [w, h] = dims;
  if (!w || !h) return "4:5";
  const r = w / h;
  const opts = [["1:1", 1], ["4:5", 0.8], ["9:16", 0.5625], ["16:9", 1.778], ["3:4", 0.75], ["2:3", 0.667]];
  return opts.reduce((best, o) => (Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best))[0];
}

// Une seule analyse rea-video à la fois (8 min de calcul pour 13 s de vidéo,
// le serveur a 6 cœurs) ; les étapes IA, elles, peuvent tourner en parallèle.
let queue = Promise.resolve();
const running = new Set();
const locks = new Map();
function withLock(key, fn) {
  const next = (locks.get(key) ?? Promise.resolve()).then(fn, fn);
  locks.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

const readJson = async (f, d = null) => {
  try {
    return JSON.parse(await readFile(f, "utf8"));
  } catch {
    return d;
  }
};
const now = () => new Date().toISOString();

export async function mirrorRoute(req, res, parts, { root, mediaPlace, readBody, json }) {
  const page = new URL(req.url, "http://x").searchParams.get("page") || "";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(page)) return json(res, 400, { error: "Page invalide." });
  const place = await mediaPlace(page, "mirror");
  const baseDir = place.dir;
  const baseUrl = place.url;
  const jobDir = (id) => join(baseDir, id);
  const stateFile = (id) => join(jobDir(id), "etat.json");
  const load = (id) => readJson(stateFile(id));
  // Écritures une par une, fusionnées avec le disque : plusieurs images ou
  // étapes lancées en même temps s'écrasaient (essai du 2026-11-20 : la 3e
  // pub perdue). Pour chaque image / étape, la version la plus récente gagne.
  const stampOf = (e) => Math.max(Date.parse(e?.fin ?? "") || 0, Date.parse(e?.debut ?? "") || 0);
  const mergeMap = (disk = {}, mine = {}) => {
    const o = { ...disk };
    for (const [k, v] of Object.entries(mine ?? {})) if (!o[k] || stampOf(v) >= stampOf(o[k])) o[k] = v;
    return o;
  };
  const save = (st) =>
    withLock(`${baseDir}/${st.id}`, async () => {
      const disk = await load(st.id);
      if (disk) {
        st.etapes = mergeMap(disk.etapes, st.etapes);
        if (disk.images || st.images) st.images = mergeMap(disk.images, st.images);
      }
      st.modifie = now();
      await mkdir(jobDir(st.id), { recursive: true });
      await writeFile(stateFile(st.id), JSON.stringify(st, null, 1) + "\n", "utf8");
    });
  const env = loadEnv("development", root, "");
  const projet = place.projet ? await readJson(join(root, "projets", `${place.projet}.json`), {}) : {};

  // POST /api/mirror?page=… { video, poster } → nouvelle analyse
  if (!parts[1] && req.method === "POST") {
    const b = await readBody(req);
    const ok = (x) => typeof x === "string" && /^\/medias\/[\w./-]+$/.test(x) && !x.includes("..");
    // Pub image (2026-11-20) : pas d'analyse rea-video, une seule étape IA
    // (« adapter ») puis les variantes générées.
    if (b.image !== undefined) {
      const img = String(b.image).split("?")[0];
      if (!ok(img) || !/\.(png|jpe?g|webp|avif)$/i.test(img) || !existsSync(join(root, normalize(img)))) return json(res, 400, { error: "Image invalide ou introuvable dans le projet." });
      const id = `m-${now().slice(0, 19).replace(/[-:T]/g, "").toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
      const st = { id, kind: "image", image: img, ratio: await ratioOf(join(root, normalize(img))), cree: now(), langue: "anglais", photos: [], notes: "", analyse: { statut: "faite" }, etapes: {} };
      await save(st);
      return json(res, 200, { id });
    }
    if (!ok(b.video) || !/\.(mp4|mov|webm)$/i.test(b.video)) return json(res, 400, { error: "Vidéo invalide." });
    const file = join(root, normalize(b.video));
    if (!existsSync(file)) return json(res, 404, { error: "Vidéo introuvable dans le projet." });
    const id = `m-${now().slice(0, 19).replace(/[-:T]/g, "").toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
    const st = { id, video: b.video, poster: ok(b.poster) ? b.poster : null, cree: now(), langue: "anglais", photos: [], notes: "", analyse: { statut: "en attente" }, etapes: {} };
    await save(st);
    queue = queue.then(() => analyse(st.id)).catch(() => {});
    return json(res, 200, { id });
  }

  // GET /api/mirror?page=… → liste
  if (!parts[1] && req.method === "GET") {
    const ids = existsSync(baseDir) ? (await readdir(baseDir)).filter((f) => ID.test(f)) : [];
    const out = [];
    for (const id of ids) {
      const st = await load(id);
      if (st) out.push({ id, kind: st.kind ?? "video", video: st.video ?? null, image: st.image ?? null, cree: st.cree, analyse: st.analyse?.statut });
    }
    return json(res, 200, { mirrors: out.sort((a, b) => (a.cree < b.cree ? 1 : -1)) });
  }

  if (!ID.test(parts[1] ?? "")) return json(res, 400, { error: "Mirror invalide." });
  const id = parts[1];
  const st = await load(id);
  if (!st) return json(res, 404, { error: "Mirror introuvable." });

  // GET /api/mirror/<id>?page=… → état complet
  if (!parts[2] && req.method === "GET") {
    const scenes = await readJson(join(jobDir(id), "scenes.json"), null);
    return json(res, 200, { ...st, base: `${baseUrl}/${id}`, scenes, enCours: [...running].filter((k) => k.startsWith(id)).map((k) => k.split(":")[1]) });
  }

  // POST /api/mirror/<id>/reglages { photos, langue, notes }
  if (parts[2] === "reglages" && req.method === "POST") {
    const b = await readBody(req);
    if (Array.isArray(b.photos)) st.photos = b.photos.filter((x) => typeof x === "string" && /^\/medias\/[\w./-]+$/.test(x) && !x.includes("..")).slice(0, 8);
    if (typeof b.langue === "string") st.langue = b.langue.slice(0, 40);
    if (typeof b.notes === "string") st.notes = b.notes.slice(0, 4000);
    await save(st);
    return json(res, 200, { ok: true });
  }

  // POST /api/mirror/<id>/relancer → refait l'analyse (en cas d'erreur)
  if (parts[2] === "relancer" && req.method === "POST") {
    const b = await readBody(req);
    // { plans: true } : refait seulement la fiche des plans (scenes.json,
    // storyboard, zip) à partir de l'analyse déjà faite.
    if (b.plans && existsSync(join(jobDir(id), "analyse", "breakdown.json"))) {
      await buildScenes(id, join(jobDir(id), "analyse"));
      return json(res, 200, { ok: true });
    }
    st.analyse = { statut: "en attente" };
    await save(st);
    queue = queue.then(() => analyse(id)).catch(() => {});
    return json(res, 200, { ok: true });
  }

  // POST /api/mirror/<id>/etape/<nom> { consigne, coupes }
  if (parts[2] === "etape" && STEPS.includes(parts[3]) && req.method === "POST") {
    const b = await readBody(req);
    const name = parts[3];
    if (st.analyse?.statut !== "faite") return json(res, 409, { error: "L'analyse de la vidéo n'est pas terminée." });
    if ((name === "adapter") !== (st.kind === "image")) return json(res, 400, { error: "Étape non prévue pour ce type de pub." });
    if (name === "adapter" && !st.photos.length) return json(res, 409, { error: "Ajoute d'abord au moins une photo de ton produit." });
    const need = { argument: ["cast"], story: ["cast", "argument"], motion: ["cast", "story"], suite: ["cast", "story", "motion"] }[name] ?? [];
    const missing = need.find((n) => !st.etapes[n]?.texte);
    if (missing) return json(res, 409, { error: `Il faut d'abord l'étape « ${missing} ».` });
    const key = `${id}:${name}`;
    if (running.has(key)) return json(res, 409, { error: "Cette étape tourne déjà." });
    const agent = b.agent && STEP_AGENTS[name] && st.etapes[name]?.texte ? STEP_AGENTS[name].slug : null;
    st.etapes[name] = { ...(st.etapes[name] ?? {}), statut: "en cours", debut: now(), erreur: null, consigne: String(b.consigne ?? "").slice(0, 4000), coupes: b.coupes ?? null, agent };
    await save(st);
    running.add(key);
    runStep(id, name).finally(() => running.delete(key));
    return json(res, 200, { ok: true });
  }

  // POST /api/mirror/<id>/image { nom, prompt, refs: [fichiers], ratio, modele }
  // Image de référence de l'étape 2, faite dans l'atelier (Nano Banana par
  // défaut). Les images sont envoyées dans l'ordre du prompt : image du plan,
  // photos produit, puis images déjà générées (la « seed »).
  if (parts[2] === "image" && req.method === "POST") {
    const b = await readBody(req);
    const nom = String(b.nom ?? "").trim();
    if (!/^[\w.-]{3,120}$/.test(nom)) return json(res, 400, { error: "Nom d'image invalide." });
    const prompt = String(b.prompt ?? "").trim();
    if (prompt.length < 20) return json(res, 400, { error: "Prompt vide." });
    const modele = ["nano-banana", "nano-banana-pro", "gpt-image-2"].includes(b.modele) ? b.modele : "nano-banana";
    const key = `${id}:image:${nom}`;
    if (running.has(key)) return json(res, 409, { error: "Cette image est déjà en cours." });
    // Fichiers demandés → chemins sur le disque.
    const files = [];
    const missing = [];
    for (const r of (b.refs ?? []).map((x) => basename(String(x))).slice(0, 8)) {
      const stem = r.replace(/\.[a-z0-9]+$/i, "");
      // Adresses /medias/… (lues par studioImage depuis la racine).
      let u = null;
      if (r === "__pub__") u = st.image ?? null;
      else if (/^scene_\d+_frame\.jpg$/.test(r)) u = `${baseUrl}/${id}/scenes/${r}`;
      else if (st.images?.[stem]?.url) u = st.images[stem].url;
      else u = st.photos.find((x) => basename(x) === r) ?? null;
      if (u && existsSync(join(root, normalize(u)))) files.push(u);
      else missing.push(r);
    }
    if (missing.length) return json(res, 409, { error: `Il manque : ${missing.join(", ")}. Génère d'abord les images dont celle-ci dépend (dans l'ordre), ou ajoute la photo produit.` });
    st.images = st.images ?? {};
    st.images[nom.replace(/\.[a-z0-9]+$/i, "")] = { ...(st.images[nom.replace(/\.[a-z0-9]+$/i, "")] ?? {}), statut: "en cours", modele, debut: now(), erreur: null };
    await save(st);
    running.add(key);
    // Pub image : consigne complète écrite ici, avec les textes exacts (que
    // l'utilisateur a pu corriger dans le panneau).
    let full = null;
    if (st.kind === "image") {
      const t = b.textes ?? {};
      const line = (k, label) => (String(t[k] ?? "").trim() ? `${label}: "${String(t[k]).trim().slice(0, 200)}"` : "");
      const texts = [line("accroche", "Headline"), line("sousTitre", "Secondary line"), line("cta", "Call-to-action button"), line("autres", "Other small text")].filter(Boolean);
      full = [
        "Image 1 is a COMPETITOR'S AD. Use it only as the reference for layout, composition, placement of elements, colour mood and typography style. Never keep its product, brand name, logo, packaging or any of its words.",
        `Images 2${files.length > 2 ? ` to ${files.length}` : ""} are photos of the user's own product: wherever the product appears it must look exactly like them (shape, colours, materials, printed logo).`,
        `Make the user's ad: ${prompt}`,
        texts.length ? `Text on the ad, exactly these words and nothing else, spelled exactly, clearly legible: ${texts.join("; ")}.` : "No text on the ad.",
        "Never add ratings, stars, review counts, prices, percentages, certifications, awards or claims that are not in the text above. No watermark.",
        "Output only the finished ad as one single image. No board, no labels, no split screen.",
      ].join("\n");
    }
    makeImage(id, nom, full ?? prompt, files, b.ratio, modele, !!full).finally(() => running.delete(key));
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Route Mirror inconnue." });

  async function makeImage(jid, nom, prompt, files, ratio, modele, isAd = false) {
    const stem = nom.replace(/\.[a-z0-9]+$/i, "");
    try {
      const { studioImage } = await import("../scripts/lib/ia.mjs");
      const SIZES = { "1:1": [1024, 1024], "4:5": [1024, 1280], "9:16": [1024, 1820], "16:9": [1820, 1024], "3:4": [1024, 1365], "2:3": [1024, 1536] };
      const [w, h] = SIZES[String(ratio ?? "").replace(/\s/g, "")] ?? [1024, 1280];
      const dir = join(jobDir(jid), "images");
      // Les images des plans portent les légendes de la pub d'origine : Nano
      // Banana les recopiait malgré le prompt (essai du 2026-11-20).
      const guard = isAd ? "" : "IMPORTANT: image 1 is a layout and camera reference only. Do not reproduce any caption, subtitle, sticker, emoji, text box, watermark or logo visible in image 1 or in any reference. The output contains no text at all, except the product's own printed wordmark exactly as on the product photos.\n\n";
      const out = await studioImage({ openaiKey: env.OPENAI_API_KEY, geminiKey: env.GEMINI_API_KEY, root, source: files[0] ?? null, references: files.slice(1), prompt: guard + prompt, width: w, height: h, format: null, model: modele, folder: { dir, url: `${baseUrl}/${jid}/images` } });
      // Rangée sous le nom prévu par le prompt (extension réelle : .png).
      const finalName = `${stem}.png`;
      const { rename } = await import("node:fs/promises");
      await rm(join(dir, finalName), { force: true });
      await rename(join(dir, basename(out.url)), join(dir, finalName));
      const s2 = await load(jid);
      s2.images = s2.images ?? {};
      s2.images[stem] = { statut: "faite", modele, fin: now(), url: `${baseUrl}/${jid}/images/${finalName}`, v: Date.now().toString(36), note: out.note || null };
      await save(s2);
    } catch (e) {
      const s2 = await load(jid);
      s2.images = s2.images ?? {};
      s2.images[stem] = { ...(s2.images[stem] ?? {}), statut: "erreur", erreur: e.message, fin: now() };
      await save(s2);
    }
  }

  // ---------------------------------------------------------------------
  // 1. Analyse rea-video, puis fiche « Scene Lab » (scenes.json + images
  //    renommées scene_NN_frame.jpg / scene_NN_strip.jpg comme Whitelabeler).
  async function analyse(jid) {
    const s = await load(jid);
    if (!s) return;
    s.analyse = { statut: "en cours", debut: now() };
    await save(s);
    const out = join(jobDir(jid), "analyse");
    const log = [];
    try {
      await rm(out, { recursive: true, force: true });
      const k = env.GEMINI_API_KEY;
      const extra = k ? { GEMINI_API_KEY: k, REA_VLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai/", REA_VLM_API_KEY: k, REA_VLM_MODEL: "gemini-3.5-flash", REA_GEMINI_MODEL: "gemini-3.5-flash" } : {};
      const args = ["-n", "10", REA, "decompose", join(root, normalize(s.video)), "-o", out, "--lang", "en", ...(k ? ["--vlm"] : [])];
      const code = await new Promise((done) => {
        const p = spawn("nice", args, { env: { ...process.env, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
        const keep = (d) => {
          log.push(String(d));
          if (log.length > 400) log.splice(0, 100);
        };
        p.stdout.on("data", keep);
        p.stderr.on("data", keep);
        p.on("close", done);
        p.on("error", (e) => (keep(e.message), done(-1)));
      });
      await writeFile(join(jobDir(jid), "analyse.log"), log.join(""), "utf8");
      if (code !== 0) throw new Error(`rea-video s'est arrêté (code ${code}) : ${log.join("").split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 400)}`);
      const scenes = await buildScenes(jid, out);
      const s2 = await load(jid);
      s2.analyse = { statut: "faite", debut: s.analyse.debut, fin: now(), plans: scenes.scenes.length };
      await save(s2);
    } catch (e) {
      const s2 = (await load(jid)) ?? s;
      s2.analyse = { statut: "erreur", erreur: e.message, fin: now() };
      await save(s2);
    }
  }

  async function buildScenes(jid, out) {
    const d = await readJson(join(out, "breakdown.json"), {});
    const dir = join(jobDir(jid), "scenes");
    await mkdir(dir, { recursive: true });
    const segs = speechSegments(d);
    const scenes = [];
    for (const [i, sh] of (d.shots ?? []).entries()) {
      const n = String(i + 1).padStart(2, "0");
      const src = String(sh.index ?? i + 1).padStart(3, "0");
      const frameSrc = join(out, "shots", `shot_${src}_first.jpg`);
      const stripSrc = join(out, "shots", `shot_${src}.jpg`);
      if (existsSync(frameSrc)) await copyFile(frameSrc, join(dir, `scene_${n}_frame.jpg`));
      if (existsSync(stripSrc)) await copyFile(stripSrc, join(dir, `scene_${n}_strip.jpg`));
      const said = segs
        .filter((g) => g.mid >= sh.start && g.mid < sh.end)
        .map((g) => g.text)
        .join(" ")
        .trim();
      const vlm = sh.vlm ?? {};
      scenes.push({
        n,
        debut: round(sh.start),
        fin: round(sh.end),
        duree: round(sh.duration ?? sh.end - sh.start),
        dit: said,
        mots: said ? said.split(/\s+/).length : 0,
        vu: [pick(vlm, ["description", "seen", "summary"]), vlm.shot_size, vlm.camera_move].filter(Boolean).join(" · "),
        texte: shotText(sh),
        frame: existsSync(join(dir, `scene_${n}_frame.jpg`)) ? `scene_${n}_frame.jpg` : null,
        strip: existsSync(join(dir, `scene_${n}_strip.jpg`)) ? `scene_${n}_strip.jpg` : null,
      });
    }
    const md = async (f) => {
      try {
        return (await readFile(join(out, f), "utf8")).replace(/^---[\s\S]*?\n---\n/, "").trim();
      } catch {
        return "";
      }
    };
    // Storyboard fait des seules images des plans : celui de rea-video porte
    // ses étiquettes « 3D render 47 % », souvent fausses.
    const frames = scenes.filter((x) => x.frame).map((x) => join(dir, x.frame));
    let board = null;
    if (frames.length) {
      const small = [];
      for (const [i, f] of frames.entries()) {
        const o = join(jobDir(jid), `sb-${i}.jpg`);
        await new Promise((ok) => execFile("vipsthumbnail", [f, "-s", "x360", "-o", o], () => ok()));
        if (existsSync(o)) small.push(o);
      }
      const across = Math.min(small.length, 8);
      await new Promise((ok) => execFile("vips", ["arrayjoin", small.join(" "), join(jobDir(jid), "storyboard.jpg[Q=85]"), "--across", String(across), "--shim", "6", "--background", "255"], () => ok()));
      for (const o of small) await rm(o, { force: true });
      if (existsSync(join(jobDir(jid), "storyboard.jpg"))) board = "storyboard.jpg";
    }
    const total = round(d.source?.duration ?? scenes.at(-1)?.fin ?? 0);
    const words = scenes.reduce((a, s) => a + s.mots, 0);
    const res = {
      source: basename(d.source?.file ?? "video.mp4"),
      duree: total,
      taille: d.source?.width && d.source?.height ? `${d.source.width}x${d.source.height}` : d.source?.size ?? "",
      rythme: total ? Math.round((words / total) * 10) / 10 : 0,
      transcription: segs.map((g) => `[${g.start.toFixed(1)}-${g.end.toFixed(1)}] ${g.text}`).join("\n"),
      storyboard: board ?? (existsSync(join(out, "storyboard.jpg")) ? "analyse/storyboard.jpg" : null),
      contenu: await md("video/content.md"),
      textes: await md("video/packaging.md"),
      son: await md("video/sound.md"),
      scenes,
    };
    await writeFile(join(jobDir(jid), "scenes.json"), JSON.stringify(res, null, 1) + "\n", "utf8");
    // Toutes les images de plans en un zip, à envoyer à TopView.
    await new Promise((done) => execFile("python3", ["-I", "-c", "import sys,zipfile,os\nz=zipfile.ZipFile(sys.argv[1],'w')\nfor f in sorted(os.listdir(sys.argv[2])):\n  z.write(os.path.join(sys.argv[2],f),f)\nz.close()", join(jobDir(jid), "scenes.zip"), dir], () => done()));
    return res;
  }

  // ---------------------------------------------------------------------
  // 2 à 4. Étapes IA : prompt Whitelabeler + contexte + images.
  async function runStep(jid, name) {
    const s = await load(jid);
    if (name === "adapter") return runAdapt(jid, s);
    try {
      const scenes = await readJson(join(jobDir(jid), "scenes.json"), {});
      const file = { cast: "cast.md", argument: "story.md", story: "story.md", motion: "motion.md", suite: "motion.md" }[name];
      const doc = await readFile(join(HERE, "mirror", file), "utf8");
      const system = `${doc}\n\n---\n\n${ADAPTER}`;
      if (s.etapes[name]?.agent) s._agent = { ...(Object.values(STEP_AGENTS).find((a) => a.slug === s.etapes[name].agent) ?? { titre: s.etapes[name].agent }), texte: await agentText(root, s.etapes[name].agent) };
      const content = [{ type: "text", text: await brief(s, scenes, name) }];
      if (name === "cast") {
        for (const p of s.photos) {
          const u = await dataUrl(join(root, normalize(p)), 1024);
          if (u) content.push({ type: "text", text: `Product photo, filename: ${basename(p)}` }, { type: "image_url", image_url: { url: u } });
        }
        for (const sc of (scenes.scenes ?? []).slice(0, 24)) {
          if (!sc.frame) continue;
          const u = await dataUrl(join(jobDir(jid), "scenes", sc.frame), 640);
          if (u) content.push({ type: "text", text: `Scene ${sc.n} reference frame: ${sc.frame}` }, { type: "image_url", image_url: { url: u } });
        }
      } else if (name === "argument" || name === "story") {
        for (const sc of (scenes.scenes ?? []).slice(0, 24)) {
          if (!sc.strip) continue;
          const u = await dataUrl(join(jobDir(jid), "scenes", sc.strip), 900);
          if (u) content.push({ type: "text", text: `Scene ${sc.n} strip (reading only): ${sc.strip}` }, { type: "image_url", image_url: { url: u } });
        }
      }
      const texte = await chat(env.OPENAI_API_KEY, system, content);
      const s2 = await load(jid);
      s2.etapes[name] = { ...s2.etapes[name], statut: "faite", fin: now(), texte, precedent: s.etapes[name]?.texte && s.etapes[name].texte !== texte ? s.etapes[name].texte : s2.etapes[name]?.precedent ?? null };
      // Refaire une étape rend les suivantes caduques : on les signale.
      const order = ["cast", "argument", "story", "motion", "suite"];
      for (const later of order.slice(order.indexOf(name) + 1)) if (s2.etapes[later]?.texte) s2.etapes[later].perime = true;
      s2.etapes[name].perime = false;
      await save(s2);
    } catch (e) {
      const s2 = (await load(jid)) ?? s;
      s2.etapes[name] = { ...s2.etapes[name], statut: "erreur", erreur: e.message, fin: now() };
      await save(s2);
    }
  }

  // Pub image : analyse de la pub concurrente + 3 variantes pour le produit,
  // en un seul appel (JSON). Les variantes restent modifiables dans le panneau.
  async function runAdapt(jid, s) {
    try {
      const facts = (await brief(s, {}, "adapter")).trim();
      const content = [{ type: "text", text: `${facts}\n\nThe competitor's ad is the first image below, then the user's product photos.${s.etapes.adapter?.consigne ? `\n\nUSER NOTE FOR THIS RUN: ${s.etapes.adapter.consigne}` : ""}` }];
      const ad = await dataUrl(join(root, normalize(s.image)), 1280);
      if (!ad) throw new Error("Image de la pub illisible.");
      content.push({ type: "text", text: "Competitor's ad:" }, { type: "image_url", image_url: { url: ad } });
      for (const p of s.photos) {
        const u = await dataUrl(join(root, normalize(p)), 900);
        if (u) content.push({ type: "text", text: `User's product photo: ${basename(p)}` }, { type: "image_url", image_url: { url: u } });
      }
      const raw = await chat(env.OPENAI_API_KEY, IMAGE_SYSTEM, content, true);
      let d;
      try {
        d = JSON.parse(raw);
      } catch {
        throw new Error("Réponse illisible du modèle (JSON attendu).");
      }
      const variantes = (Array.isArray(d.variantes) ? d.variantes : []).slice(0, 4).map((v, i) => ({
        n: i + 1,
        titre: String(v.titre ?? `Variante ${i + 1}`).slice(0, 120),
        angle: String(v.angle ?? "").slice(0, 400),
        pourquoi: String(v.pourquoi ?? "").slice(0, 600),
        textes: { accroche: String(v.accroche ?? "").slice(0, 200), sousTitre: String(v.sousTitre ?? "").slice(0, 200), cta: String(v.cta ?? "").slice(0, 60), autres: String(v.autres ?? "").slice(0, 200) },
        prompt: String(v.prompt ?? "").slice(0, 3000),
      }));
      if (!variantes.length) throw new Error("Aucune variante proposée.");
      const s2 = await load(jid);
      s2.etapes.adapter = { ...s2.etapes.adapter, statut: "faite", fin: now(), texte: String(d.analyse ?? "").trim(), variantes };
      await save(s2);
    } catch (e) {
      const s2 = (await load(jid)) ?? s;
      s2.etapes.adapter = { ...s2.etapes.adapter, statut: "erreur", erreur: e.message, fin: now() };
      await save(s2);
    }
  }

  async function brief(s, scenes, name) {
    const prod = projet.produit && typeof projet.produit === "object" ? projet.produit.nom : projet.produit;
    const f = projet.fondations?.reponses ?? {};
    const product = [
      `Product name: ${prod || projet.nom || "(not set)"}`,
      projet.description ? `Description: ${String(projet.description).slice(0, 800)}` : "",
      f.role ? `What it does: ${f.role}` : "",
      f.usage ? `How it is used: ${f.usage}` : "",
      f.qui ? `Who it is for: ${f.qui}` : "",
      f.douleur ? `Customer pain: ${f.douleur}` : "",
      f.echec ? `Why other solutions fail: ${f.echec}` : "",
      projet.offre ? `Offer: ${typeof projet.offre === "string" ? projet.offre : JSON.stringify(projet.offre).slice(0, 1500)}` : "",
      f.preuves ? `Proofs actually available (use only these, never invent others): ${JSON.stringify(f.preuves).slice(0, 2000)}` : "Proofs actually available: none given. Never invent numbers, reviews, ratings, studies or certifications.",
      f.interdits ? `Forbidden claims: ${JSON.stringify(f.interdits).slice(0, 1000)}` : "",
      f.ton ? `Tone: ${[].concat(f.ton).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n") + (await contexteMirror(projet));
    const manifest = [
      `SOURCE: ${basename(s.video ?? s.image ?? "source")} | duration ${scenes.duree}s | ${scenes.taille} | ${scenes.scenes?.length ?? 0} scenes | pace ${scenes.rythme} words/s | source language: English`,
      "SCENE | START | END | DURATION | WORDS | FRAME | WHAT IS SEEN | ON-SCREEN TEXT | SAID",
      ...(scenes.scenes ?? []).map((x) => `${x.n} | ${x.debut} | ${x.fin} | ${x.duree}s | ${x.mots} | ${x.frame ?? "-"} | ${x.vu || "-"} | ${x.texte || "-"} | ${x.dit ? `"${x.dit}"` : "NOT CAPTURED"}`),
    ].join("\n");
    const sceneLab = [
      "=== SCENE LAB EXPORT (made by the decomposition tool) ===",
      manifest,
      "",
      "TRANSCRIPT (timed):",
      scenes.transcription || "(no speech recognised: read the burned-in captions and the on-screen text as the script)",
      "",
      "CONTENT AND STRUCTURE (tool summary):",
      scenes.contenu || "-",
      "",
      "ON-SCREEN TEXT AND CAPTIONS (tool summary):",
      (scenes.textes || "-").slice(0, 5000),
      "",
      "SOUND (tool summary):",
      (scenes.son || "-").slice(0, 2500),
    ].join("\n");
    const prev = (n) => s.etapes[n]?.texte ?? "";
    const specialist = (n) => (n === name && s._agent?.texte ? `\n\n=== SPECIALIST METHOD: ${s._agent.titre} ===\nApply this specialist's method, standards and checklists to IMPROVE your previous answer for this step. Keep exactly the output structure the RUN NOW line asks for; the workshop rules (HOW YOU RUN HERE, product facts, no invented proof) still win over anything below. Ignore its greeting, its questions and any instruction to wait for the user.\n${s._agent.texte}` : "");
    const redo = (n) => (s.etapes[n]?.consigne || (n === name && s._agent) ? `\n\n=== USER NOTE FOR THIS RUN ===\n${s.etapes[n].consigne || "Affine cette étape avec la méthode du spécialiste ci-dessous."}${specialist(n)}\n${prev(n) ? `\n=== YOUR PREVIOUS ANSWER FOR THIS STEP (revise it according to the note, keep what the note does not touch) ===\n${prev(n)}` : ""}` : "");
    const common = `=== THE USER'S PRODUCT ===\n${product}\n\nLanguage of the ad to write: ${s.langue}.\n${s.notes ? `User restrictions and wishes: ${s.notes}\n` : ""}`;
    if (name === "adapter") return common;
    if (name === "cast")
      return `${common}\nProduct photos: ${s.photos.length ? s.photos.map((p) => basename(p)).join(", ") : "none supplied (say so, build text-only identity, and warn that the product will drift)"}. They are attached below, followed by every scene reference frame.\n\n${sceneLab}\n\nRUN NOW: Phase 1 catalog (skip the greeting), Phase 2 Ad Read, Phase 3 Library Plan, Phase 4 Continuity Sheet, Phase 5 every library shot package (all of them), Phase 6 Continuity Library manifest. One single answer, no waiting for approval.${redo("cast")}`;
    if (name === "argument")
      return `${common}\n=== CONTINUITY LIBRARY (from the previous step) ===\n${prev("cast")}\n\n${sceneLab}\n\nRUN NOW: Phase 2 only (THE ARGUMENT and CLAIM TRANSFER). Skip the Phase 1 greeting, you already have the intake above. Stop after it: the user approves it in the app.${redo("argument")}`;
    if (name === "story")
      return `${common}\n=== CONTINUITY LIBRARY ===\n${prev("cast")}\n\n=== THE ARGUMENT, APPROVED BY THE USER ===\n${prev("argument")}\n\n${sceneLab}\n\nRUN NOW: Phases 3, 4, 5 and 6 in one answer (voiceover, the full scene map, the chunk table, the handoff pack). Do not offer the xlsx workbook.${redo("story")}`;
    if (name === "motion")
      return `=== CHARACTER / CONTINUITY SHEET AND LIBRARY ===\n${prev("cast")}\n\n=== AD PLAN (handoff pack) ===\n${prev("story")}\n\nVoice: external voiceover uploaded per chunk unless the user note says "internal voice". The user has every file named above.\n\nRUN NOW: the one-screen PLAN LOADED confirmation, then Phase 2: build chunk A alone as a full package, and end by asking for the cut count. Skip the Phase 1 greeting.${redo("motion")}`;
    return `=== CHARACTER / CONTINUITY SHEET AND LIBRARY ===\n${prev("cast")}\n\n=== AD PLAN (handoff pack) ===\n${prev("story")}\n\n=== CHUNK A PACKAGE YOU WROTE ===\n${prev("motion")}\n\nThe user generated chunk A and counted ${s.etapes.suite?.coupes ?? "?"} distinct cuts. Apply the Phase 2 table to pick the mode, say which in one line, then write EVERY remaining chunk as a full package (Phase 3), one after the other, in this single answer. If per-scene generation is the only honest route, say so and write per-scene packages instead.${redo("suite")}`;
  }
}

const ADAPTER = `HOW YOU RUN HERE (overrides the session flow above where they conflict)
- You run inside the user's ad workshop app, one step at a time. The user cannot answer you mid-run: never stop to wait, never ask a question in the middle; do the work the RUN NOW line asks for, then stop. The user reviews in the app and can rerun the step with a note.
- The "Scene Lab export" is produced by a decomposition tool. Its scene frames are named scene_NN_frame.jpg and strips scene_NN_strip.jpg, exactly as in the method. The user downloads them as a zip from the app.
- Talk to the user in French (Québec, plain words, tutoiement) for explanations, headings and notes. Keep every image prompt, video prompt and the ad script itself in the language they must be in (prompts in English; the script in the ad language given).
- Never invent proof: no numbers, reviews, ratings, studies, awards, certifications or guarantees that are not in the product facts given. If a beat of the source ad needs a proof the user does not have, use a real feature instead and say so.
- Format in Markdown. Put every paste-ready prompt in its own fenced code block so the app can show a copy button.
- No em dashes.`;

async function chat(key, system, content, asJson = false) {
  if (!key) throw new Error("Clé OpenAI absente (OPENAI_API_KEY dans .env.local).");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...(asJson ? { response_format: { type: "json_object" } } : {}), messages: [{ role: "system", content: system }, { role: "user", content }] }),
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI (${res.status}) : ${body.error?.message ?? "erreur inconnue"}`);
  const t = body.choices?.[0]?.message?.content ?? "";
  if (!t.trim()) throw new Error("Réponse vide du modèle.");
  return t.trim();
}

// Image réduite (côté long ≤ max) en data URL, pour le modèle.
async function dataUrl(file, max) {
  if (!existsSync(file)) return null;
  const tmp = join(tmpdir(), `mirror-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  try {
    await new Promise((ok, ko) => execFile("vipsthumbnail", [file, "-s", `${max}x${max}`, "-o", `${tmp}[Q=82]`], (e) => (e ? ko(e) : ok())));
    return `data:image/jpeg;base64,${(await readFile(tmp)).toString("base64")}`;
  } catch {
    const buf = await readFile(file);
    const ext = extname(file).toLowerCase();
    return `data:${ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg"};base64,${buf.toString("base64")}`;
  } finally {
    rm(tmp, { force: true }).catch(() => {});
  }
}

const round = (x) => Math.round((Number(x) || 0) * 100) / 100;
function pick(o, keys) {
  for (const k of keys) if (typeof o?.[k] === "string" && o[k].trim()) return o[k].trim();
  return "";
}
// Textes à l'écran : ceux lus par le modèle de vision (propres), sinon ceux
// de l'OCR (plus bruités : « PASSPO », « SSPORT »…).
function shotText(sh) {
  const v = sh.vlm?.overlay_text;
  if (Array.isArray(v) && v.length) return [...new Set(v.map(String))].join(" / ").slice(0, 400);
  const words = (sh.text?.tracks ?? []).flatMap((t) => t.texts ?? []).filter((x) => typeof x === "string" && x.length > 2);
  return [...new Set(words)].join(" / ").slice(0, 300);
}
function speechSegments(d) {
  const sp = d.speech ?? {};
  const list = sp.segments ?? sp.lines ?? sp.utterances ?? sp.sentences ?? [];
  return (Array.isArray(list) ? list : [])
    .map((g) => {
      const start = Number(g.start ?? g.t0 ?? g.begin ?? 0);
      const end = Number(g.end ?? g.t1 ?? start);
      return { start, end, mid: (start + end) / 2, text: String(g.text ?? g.line ?? "").trim() };
    })
    .filter((g) => g.text);
}

// Lot 2 (2026-11-23) : contexte unique du projet ajouté aux étapes Mirror
// (offre approuvée, message central, mécanisme, faits autorisés, à vérifier).
async function contexteMirror(projet) {
  try {
    const { contexteProjet } = await import("../src/engine/contexte-projet.js");
    const t = contexteProjet(projet, { limite: 9000 }).texte;
    return t ? `\n\nFULL PROJECT CONTEXT (French; use it, never contradict it; "aVerifier" items are unknown, not facts; "recherche" is competitor research and proves nothing for this product):\n${t}` : "";
  } catch {
    return "";
  }
}
