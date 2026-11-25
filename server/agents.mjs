// Agents army (2026-11-22) : les agents de l'abonnement Whitelabeler de
// l'utilisateur (Ai Vault 3.0), pour son usage personnel. Chaque agent :
// agents/whitelabeler/<slug>.html (sa page de présentation, telle quelle)
// et une ligne dans agents/whitelabeler/index.json.
//   GET  /api/agents            → { agents: [{ slug, titre, url, ordre, accroche }] }
//   GET  /api/agents/<slug>     → la page de présentation (HTML)
//   POST /api/agents/import     → reçu depuis l'onglet Whitelabeler de
//        l'utilisateur (clé à usage unique dans agents/.import-key) ;
//        OPTIONS : autorisations du navigateur (CORS, réseau local).
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ORIGIN = "https://app.whitelabeler.ai";

export async function agentsRoute(req, res, parts, { root, readBody, json }) {
  const dir = join(root, "agents", "whitelabeler");
  const indexFile = join(dir, "index.json");
  const readIndex = async () => {
    try {
      return JSON.parse(await readFile(indexFile, "utf8"));
    } catch {
      return { agents: [] };
    }
  };
  const cors = () => {
    res.setHeader("Access-Control-Allow-Origin", ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Vary", "Origin");
  };

  if (parts[1] === "import") {
    cors();
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    if (req.method !== "POST") return json(res, 405, { error: "POST seulement." });
    const keyFile = join(root, "agents", ".import-key");
    const key = existsSync(keyFile) ? (await readFile(keyFile, "utf8")).trim() : "";
    const b = await readBody(req);
    if (!key || b.key !== key) return json(res, 403, { error: "Clé d'import invalide." });
    const slug = String(b.slug ?? "");
    if (!/^[a-z0-9][a-z0-9-]{2,90}$/.test(slug)) return json(res, 400, { error: "Nom invalide." });
    const html = String(b.html ?? "");
    if (!/<html|<!doctype/i.test(html) || html.length > 2_000_000) return json(res, 400, { error: "Page invalide." });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${slug}.html`), html, "utf8");
    const idx = await readIndex();
    const entry = { slug, titre: String(b.titre ?? slug).slice(0, 200), url: String(b.url ?? "").slice(0, 300), ordre: Number(b.ordre) || 0, accroche: String(b.accroche ?? "").slice(0, 300) };
    idx.agents = [...idx.agents.filter((a) => a.slug !== slug), entry].sort((a, c) => a.ordre - c.ordre);
    idx.source = "Whitelabeler · Ai Vault 3.0";
    idx.modifie = new Date().toISOString();
    await writeFile(indexFile, JSON.stringify(idx, null, 1) + "\n", "utf8");
    return json(res, 200, { ok: true, total: idx.agents.length });
  }

  if (!parts[1] && req.method === "GET") return json(res, 200, await readIndex());

  // ---- Lancer l'agent (2026-11-22) : conversation où l'IA de l'atelier suit
  // la consigne de l'agent, avec les infos du projet et la recherche web.
  //   GET  /api/agents/<slug>/chat?projet=<id>  → { messages, statut, erreur }
  //   POST /api/agents/<slug>/chat { projet, message, images: [/medias/…], web, nouvelle }
  // Conversation : agents/conversations/<projet|_aucun>/<slug>.json. Réponse
  // en tâche de fond (la recherche web peut dépasser les 100 s de Cloudflare).
  if (parts[1] && parts[2] === "chat") {
    const slug = parts[1];
    if (!/^[a-z0-9][a-z0-9-]{2,90}$/.test(slug)) return json(res, 400, { error: "Nom invalide." });
    const u = new URL(req.url, "http://x");
    const b = req.method === "POST" ? await readBody(req) : {};
    const projet = String((req.method === "POST" ? b.projet : u.searchParams.get("projet")) ?? "");
    if (projet && !/^[a-z0-9][a-z0-9-]*$/.test(projet)) return json(res, 400, { error: "Projet invalide." });
    // « Discuter de ce produit » (grille de la Recherche, 2026-11-25) : une
    // conversation par produit, avec sa fiche dans les consignes.
    const candidat = projet ? "" : String((req.method === "POST" ? b.candidat : u.searchParams.get("candidat")) ?? "");
    if (candidat && !/^[pm]-[a-z0-9-]{1,90}$/.test(candidat)) return json(res, 400, { error: "Produit invalide." });
    const convDir = candidat ? join(root, "agents", "conversations", "_candidats", candidat) : join(root, "agents", "conversations", projet || "_aucun");
    const convFile = join(convDir, `${slug}.json`);
    const load = async () => {
      try {
        return JSON.parse(await readFile(convFile, "utf8"));
      } catch {
        return { slug, projet: projet || null, messages: [], statut: "pret" };
      }
    };
    const save = async (c) => {
      await mkdir(convDir, { recursive: true });
      c.modifie = new Date().toISOString();
      await writeFile(convFile, JSON.stringify(c, null, 1) + "\n", "utf8");
    };
    // Audit F09 (2026-11-25) : « en cours » sans travail réellement actif dans
    // ce serveur (redémarrage) = réponse interrompue, et non plus bloqué pour toujours.
    if (req.method === "GET") {
      const c = await load();
      if (c.statut === "en cours" && !chatsEnCours.has(convFile)) Object.assign(c, { statut: "erreur", erreur: "Réponse interrompue (serveur redémarré) : renvoie ton message." });
      return json(res, 200, c);
    }
    if (req.method !== "POST") return json(res, 405, { error: "Méthode refusée." });
    // Lot 2 (2026-11-23) : consigne nettoyée (sans la page de présentation) si elle existe.
    const propre = join(dir, "consignes-propres", `${slug}.txt`);
    const consFile = existsSync(propre) ? propre : join(dir, "consignes", `${slug}.txt`);
    if (!existsSync(consFile)) return json(res, 404, { error: "Pas de consigne pour cet agent." });
    // Audit F03 (2026-11-25) : contrôle et réservation d'un seul bloc (sans
    // attente entre les deux) ; « Nouvelle conversation » refusée pendant une réponse.
    if (chatsEnCours.has(convFile)) return json(res, 409, { error: "L'agent répond déjà, attends sa réponse." });
    chatsEnCours.set(convFile, "réservé");
    let c;
    try {
      c = await load();
    } catch (e) {
      chatsEnCours.delete(convFile);
      throw e;
    }
    if (b.nouvelle) c = { slug, projet: projet || null, messages: [], statut: "pret" };
    const text = String(b.message ?? "").trim();
    const images = (Array.isArray(b.images) ? b.images : []).filter((x) => typeof x === "string" && /^\/medias\/[\w./-]+\.(png|jpe?g|webp)$/i.test(x) && !x.includes("..")).slice(0, 6);
    if (!text && !images.length) {
      chatsEnCours.delete(convFile);
      if (c.statut === "en cours") Object.assign(c, { statut: "pret" });
      await save(c);
      return json(res, 200, c);
    }
    c.messages.push({ role: "user", text: text || "(images jointes)", images, le: new Date().toISOString() });
    c.statut = "en cours";
    c.erreur = null;
    c.web = b.web !== false;
    // WinningHunter dans le chat ChatGPT (2026-11-25) : coché par défaut si la clé existe.
    c.wh = b.wh !== false;
    c.moteur = b.moteur === "claude" ? "claude" : "chatgpt";
    // Identifiant de cette exécution : une réponse tardive d'une autre exécution est ignorée.
    const runId = `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    c.runId = runId;
    chatsEnCours.set(convFile, runId);
    try {
      await save(c);
    } catch (e) {
      chatsEnCours.delete(convFile);
      throw e;
    }
    runAgent(root, slug, consFile, convFile, save, projet, c.web, c.moteur, runId, c.wh, candidat)
      .catch(() => {})
      .finally(() => chatsEnCours.get(convFile) === runId && chatsEnCours.delete(convFile));
    return json(res, 200, c);
  }

  // GET /api/agents/recherche → espace « Recherche produits » (2026-11-23).
  if (parts[1] === "recherche" && req.method === "GET") {
    const od = join(root, "agents", "omar-winninghunter");
    const esp = existsSync(join(od, "espace.json")) ? JSON.parse(await readFile(join(od, "espace.json"), "utf8")) : { omar: [], whitelabeler: [] };
    const omar = [];
    for (const s of esp.omar ?? []) {
      const f = join(od, s, "agent.json");
      if (!existsSync(f)) continue;
      const a = JSON.parse(await readFile(f, "utf8"));
      const c = join(od, s, "consigne.md");
      omar.push({ ...a, consigneMd: existsSync(c) ? await readFile(c, "utf8") : "" });
    }
    return json(res, 200, { titre: esp.titre ?? "Recherche produits", omar, whitelabeler: esp.whitelabeler ?? [] });
  }
  // GET /api/agents/taches → agents rangés par tâche (lot 5, 2026-11-23).
  if (parts[1] === "taches" && req.method === "GET") {
    const f = join(dir, "taches.json");
    return json(res, 200, existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : { taches: [] });
  }
  // POST /api/agents/adopter { projet, cible: "recherche" | "angle", texte, agent }
  // Le résultat d'un agent entre dans le projet comme PROPOSITION : note de
  // recherche (ne prouve rien) ou angle proposé (non choisi). Jamais comme fait.
  if (parts[1] === "adopter" && req.method === "POST") {
    const b = await readBody(req);
    const projet = String(b.projet ?? "");
    const texte = String(b.texte ?? "").trim().slice(0, 20000);
    if (!/^[a-z0-9][a-z0-9-]{1,90}$/.test(projet) || !texte || !["recherche", "angle"].includes(b.cible)) return json(res, 400, { error: "Demande incomplète." });
    const pf = join(root, "projets", `${projet}.json`);
    if (!existsSync(pf)) return json(res, 404, { error: "Projet introuvable." });
    const le = new Date().toISOString();
    const agent = String(b.agent ?? "").slice(0, 120);
    // Sous le verrou commun des projets (audit F02, 2026-11-25) : deux adoptions
    // ou une adoption pendant une modification ne s'écrasent plus.
    const { muterProjet } = await import("./commun.mjs");
    await muterProjet(projet, (p) => {
      if (b.cible === "recherche") {
        p.fondations = p.fondations ?? {};
        p.fondations.reponses = p.fondations.reponses ?? {};
        p.fondations.reponses.notesAgents = [...(p.fondations.reponses.notesAgents ?? []), { texte, agent, le }];
      } else {
        const lignes = texte.replace(/[#*_>`]/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
        // Audit F12 : titre et promesse relus par l'utilisateur avant l'ajout (sinon les 2 premières lignes).
        const titre = String(b.titre ?? "").trim() || lignes[0] || "Angle proposé";
        const promesse = String(b.promesse ?? "").trim() || lignes[1] || "";
        p.angles = [...(p.angles ?? []), { id: `angle-agent-${Date.now().toString(36)}`, titre: titre.slice(0, 90), promesse: promesse.slice(0, 300), notes: texte, choisi: false, source: "agent", agent, le }];
      }
    });
    return json(res, 200, { ok: true, cible: b.cible });
  }
  // GET /api/agents/moteurs → moteurs disponibles (clé présente ou non).
  if (parts[1] === "moteurs" && req.method === "GET") {
    const { loadEnv } = await import("vite");
    const env = loadEnv("development", root, "");
    return json(res, 200, { chatgpt: Boolean(env.OPENAI_API_KEY), claude: Boolean(env.ANTHROPIC_API_KEY), winninghunter: Boolean(env.WINNINGHUNTER_API_KEY) });
  }
  // POST /api/agents/cle-claude { cle } → clé Anthropic de l'utilisateur,
  // rangée dans .env.local (comme la clé WinningHunter).
  if (parts[1] === "cle-claude" && req.method === "POST") {
    const b = await readBody(req);
    const key = String(b.cle ?? "").trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return json(res, 400, { error: "Clé invalide : elle commence par sk-ant-." });
    const envFile = join(root, ".env.local");
    let env = existsSync(envFile) ? await readFile(envFile, "utf8") : "";
    env = /^ANTHROPIC_API_KEY=.*$/m.test(env) ? env.replace(/^ANTHROPIC_API_KEY=.*$/m, `ANTHROPIC_API_KEY=${key}`) : `${env.replace(/\n*$/, "\n")}ANTHROPIC_API_KEY=${key}\n`;
    await writeFile(envFile, env, { encoding: "utf8", mode: 0o600 });
    return json(res, 200, { ok: true });
  }

  // GET /api/agents/<slug>/consigne → la consigne (prompt) de l'agent, texte.
  if (parts[1] && parts[2] === "consigne" && req.method === "GET") {
    if (!/^[a-z0-9][a-z0-9-]{2,90}$/.test(parts[1])) return json(res, 400, { error: "Nom invalide." });
    const orig = join(dir, "consignes", `${parts[1]}.txt`);
    const propre = join(dir, "consignes-propres", `${parts[1]}.txt`);
    const veutOriginal = new URL(req.url, "http://x").searchParams.get("original") === "1";
    const f = !veutOriginal && existsSync(propre) ? propre : orig;
    if (!existsSync(f)) return json(res, 404, { error: "Pas de consigne pour cet agent." });
    res.statusCode = 200;
    res.setHeader("X-Consigne", f === propre ? "propre" : existsSync(propre) ? "original-nettoyable" : "original");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    return res.end(await readFile(f, "utf8"));
  }

  if (parts[1] && req.method === "GET") {
    const slug = parts[1];
    if (!/^[a-z0-9][a-z0-9-]{2,90}$/.test(slug)) return json(res, 400, { error: "Nom invalide." });
    const f = join(dir, `${slug}.html`);
    if (!existsSync(f)) return json(res, 404, { error: "Agent introuvable." });
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    // Liens de la présentation : dans un nouvel onglet.
    let html = await readFile(f, "utf8");
    // Vidéo YouTube (2026-11-22) : dans le cadre isolé de l'atelier, YouTube
    // refuse de lire (écran noir, pas d'origine). On met sa vignette avec un
    // bouton ▶ qui ouvre la vidéo sur YouTube, dans un nouvel onglet.
    html = html.replace(/<iframe\b[^>]*?\bsrc=["']https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})[^"']*["'][^>]*>\s*<\/iframe>/gi, (m, id) =>
      `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer" title="Voir la vidéo sur YouTube" style="display:block;position:relative;width:100%;height:100%;background:#000 url(https://i.ytimg.com/vi/${id}/hqdefault.jpg) center/cover no-repeat;cursor:pointer"><span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:76px;height:54px;border-radius:14px;background:#f00;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.35)"><span style="width:0;height:0;border-left:22px solid #fff;border-top:13px solid transparent;border-bottom:13px solid transparent;margin-left:5px"></span></span><span style="position:absolute;left:0;right:0;bottom:0;padding:10px 14px;font:600 13px system-ui,sans-serif;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.6))">▶ Voir la vidéo sur YouTube</span></a>`);
    return res.end(/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}<base target="_blank">`) : `<base target="_blank">${html}`);
  }
  return json(res, 404, { error: "Route agents inconnue." });
}

// ---- Moteur des agents : API Responses d'OpenAI (gpt-5.5) ----
const MODEL = process.env.AGENTS_MODEL || "gpt-5.5";
const ADAPTER = `
---
COMMENT TU TOURNES ICI (prime sur la consigne ci-dessus en cas de conflit)
- Tu tournes dans l'atelier de l'utilisateur, une conversation : il te répond directement. Tu peux poser tes questions et attendre ses réponses, comme le prévoit ta consigne.
- L'utilisateur parle français (Québec) : explique, questionne et rédige en français, en tutoyant. Garde en anglais les prompts destinés aux outils d'image ou de vidéo (Nano Banana, GPT Image, Midjourney, Seedance…), sauf demande contraire.
- Tu ne génères pas d'images ni de vidéos toi-même : tu écris les prompts, l'atelier s'occupe de la génération.
- Ignore les liens d'inscription ou d'affiliation (TopView ou autres) mentionnés dans ta consigne.
- N'invente jamais de preuve, de chiffre, d'avis, de certification ou de résultat : écris [À VÉRIFIER] ou demande-le.
- Si une recherche web est possible, sers-t'en quand ta consigne le demande, et cite tes sources (lien).
- Mets en forme en Markdown ; chaque prompt prêt à copier dans un bloc de code.
- Pas de tiret long.`;

async function projectContext(root, projet) {
  if (!projet) return "";
  let p;
  try {
    p = JSON.parse(await readFile(join(root, "projets", `${projet}.json`), "utf8"));
  } catch {
    return "";
  }
  // Lot 2 (2026-11-23) : contexte unique (src/engine/contexte-projet.js).
  const { contexteProjet } = await import("../src/engine/contexte-projet.js");
  return `\n---\n${contexteProjet(p, { limite: 18000 }).texte}`;
}

async function imageInput(root, url) {
  const { execFile } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { rm } = await import("node:fs/promises");
  const file = join(root, url);
  if (!existsSync(file)) return null;
  const tmp = join(tmpdir(), `agent-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  try {
    await new Promise((ok, ko) => execFile("vipsthumbnail", [file, "-s", "1024x1024", "-o", `${tmp}[Q=82]`], (e) => (e ? ko(e) : ok())));
    return `data:image/jpeg;base64,${(await readFile(tmp)).toString("base64")}`;
  } catch {
    return null;
  } finally {
    rm(tmp, { force: true }).catch(() => {});
  }
}

// Chats en cours dans CE serveur : fichier de conversation → identifiant d'exécution (audit F03 / F09).
const chatsEnCours = new Map();

async function runAgent(root, slug, consFile, convFile, save, projet, web, moteur = "chatgpt", runId = null, wh = false, candidat = "") {
  // La conversation a-t-elle changé d'exécution (nouvelle conversation, autre envoi) ?
  const perimee = (c2) => runId && c2?.runId && c2.runId !== runId;
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", root, "");
  const read = async () => JSON.parse(await readFile(convFile, "utf8"));
  try {
    const c = await read();
    const fiche = candidat ? await (await import("./candidats.mjs")).ficheCandidat(root, candidat) : "";
    const instructions = (await readFile(consFile, "utf8")) + ADAPTER + (await projectContext(root, projet)) + fiche;
    if (moteur === "claude") {
      const r = await runClaude(root, env, instructions, c.messages, web);
      const c2 = await read();
      if (perimee(c2)) return;
      c2.messages.push({ role: "assistant", text: r.text, sources: r.sources, recherche: r.searched, moteur: "claude", le: new Date().toISOString() });
      c2.statut = "pret";
      await save(c2);
      return;
    }
    if (!env.OPENAI_API_KEY) throw new Error("Clé OpenAI absente (OPENAI_API_KEY).");
    const input = [];
    for (const m of c.messages.slice(-40)) {
      if (m.role === "assistant") input.push({ role: "assistant", content: [{ type: "output_text", text: m.text }] });
      else {
        const content = [{ type: "input_text", text: m.text }];
        for (const u of m.images ?? []) {
          const d = await imageInput(root, u);
          if (d) content.push({ type: "input_image", image_url: d });
        }
        input.push({ role: "user", content });
      }
    }
    // WinningHunter (2026-11-25) : serveur MCP distant appelé directement par
    // OpenAI, avec la MÊME liste d'outils en lecture seule que les agents de
    // Recherche (aucun outil de lancement de pubs ni de campagne).
    const tools = web ? [{ type: "web_search" }] : [];
    let consigneWh = "";
    if (wh && env.WINNINGHUNTER_API_KEY) {
      const { OUTILS_PERMIS, MCP } = await import("./recherche.mjs");
      tools.push({ type: "mcp", server_label: "winninghunter", server_description: "WinningHunter : pubs Facebook/TikTok, boutiques Shopify (revenus, trafic), produits gagnants, tendances (Exploding Topics). Lecture seule.", server_url: MCP, headers: { Authorization: `Bearer ${env.WINNINGHUNTER_API_KEY}`, "X-API-Key": env.WINNINGHUNTER_API_KEY }, allowed_tools: [...OUTILS_PERMIS], require_approval: "never" });
      consigneWh = `\n- WINNINGHUNTER EST CONNECTÉ (outils MCP « winninghunter », lecture seule) : c'est ton « data path » principal. Utilise-le pour les boutiques (revenus et trafic estimés), les pubs actives Facebook et TikTok, les produits gagnants et les tendances ; tague ces chiffres [WH] (et [Web] ou [Est] pour le reste). Chaque appel coûte des crédits : pas d'appels en double, 10 au plus par réponse sauf si l'utilisateur demande plus.`;
    }
    // Limite de débit OpenAI (429, 2026-11-25) : on attend le délai indiqué
    // puis on réessaie (2 fois au plus) au lieu d'abandonner la réponse.
    let res, body;
    for (let essai = 0; essai < 3; essai++) {
      res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, instructions: instructions + consigneWh, input, ...(tools.length ? { tools } : {}) }),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      body = await res.json().catch(() => ({}));
      if (res.status !== 429 || essai === 2) break;
      const m = /try again in ([\d.]+)(ms|s)/i.exec(String(body.error?.message ?? ""));
      const attente = m ? Number(m[1]) * (m[2] === "ms" ? 1 : 1000) : 20000;
      await new Promise((r) => setTimeout(r, Math.min(60000, attente + 3000 + essai * 10000)));
    }
    if (!res.ok) throw new Error(`OpenAI (${res.status}) : ${String(body.error?.message ?? "erreur inconnue").slice(0, 300)}`);
    const out = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
    const text = out.filter((x) => x.type === "output_text").map((x) => x.text).join("\n\n").trim();
    const sources = [...new Map(out.flatMap((x) => x.annotations ?? []).filter((a) => a.type === "url_citation" && a.url).map((a) => [a.url, { url: a.url, titre: a.title ?? "" }])).values()].slice(0, 12);
    const searched = (body.output ?? []).some((o) => o.type === "web_search_call");
    const appelsWh = (body.output ?? []).filter((o) => o.type === "mcp_call").map((o) => ({ outil: o.name, erreur: o.error ? String(o.error).slice(0, 200) : undefined }));
    if (!text) throw new Error("Réponse vide de l'IA.");
    const c2 = await read();
    if (perimee(c2)) return;
    c2.messages.push({ role: "assistant", text, sources, recherche: searched, moteur: "chatgpt", ...(appelsWh.length ? { winninghunter: appelsWh } : {}), ...(body.usage ? { tokens: { entree: body.usage.input_tokens, sortie: body.usage.output_tokens } } : {}), le: new Date().toISOString() });
    c2.statut = "pret";
    await save(c2);
  } catch (e) {
    const c2 = await read().catch(() => null);
    if (c2 && !perimee(c2)) {
      c2.statut = "erreur";
      c2.erreur = e.message;
      await save(c2);
    }
  }
}

// ---- Moteur Claude (SDK officiel d'Anthropic) : Claude Opus 5.5, réflexion
// adaptative, recherche web côté serveur, réponse en flux (longues réponses).
async function runClaude(root, env, system, messages, web) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("Clé Claude absente : colle ta clé Anthropic dans la fenêtre de l'agent.");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const history = [];
  for (const m of messages.slice(-40)) {
    if (m.role === "assistant") {
      history.push({ role: "assistant", content: m.text });
      continue;
    }
    const content = [];
    for (const u of m.images ?? []) {
      const d = await imageInput(root, u);
      if (d) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: d.replace(/^data:image\/jpeg;base64,/, "") } });
    }
    content.push({ type: "text", text: m.text });
    history.push({ role: "user", content });
  }
  const params = {
    model: "claude-opus-5-5",
    max_tokens: 64000,
    system,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...(web ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }] } : {}),
  };
  let convo = history;
  let msg;
  // Recherche web : la réponse peut s'arrêter en « pause_turn » ; on la relance
  // avec ce qui a déjà été produit.
  for (let i = 0; i < 4; i++) {
    msg = await client.beta.messages.stream({ ...params, messages: convo }).finalMessage();
    if (msg.stop_reason !== "pause_turn") break;
    convo = [...convo, { role: "assistant", content: msg.content }];
  }
  if (msg.stop_reason === "refusal") throw new Error("Claude a refusé cette demande.");
  const blocks = msg.content ?? [];
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const sources = [
    ...new Map(
      blocks
        .flatMap((b) => (b.type === "text" ? b.citations ?? [] : []))
        .filter((ct) => ct.url)
        .map((ct) => [ct.url, { url: ct.url, titre: ct.title ?? "" }]),
    ).values(),
  ].slice(0, 12);
  const searched = blocks.some((b) => b.type === "server_tool_use" || b.type === "web_search_tool_result");
  if (!text) throw new Error(msg.stop_reason === "max_tokens" ? "Réponse trop longue, coupée : redemande en plus court." : "Réponse vide de Claude.");
  return { text, sources, searched };
}
