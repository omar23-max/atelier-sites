// Espace « Recherche produits » : moteurs des agents Omar_winninghunter (2026-11-23).
// GET  /api/recherche/<slug>            → { statut, etape, erreur, dernier, historique }
// GET  /api/recherche/<slug>/<fichier>  → un résultat passé
// POST /api/recherche/<slug> { categorie, periode, pays } → lance l'agent
// Les données viennent du MCP WinningHunter (outils de LECTURE seulement :
// les outils qui lancent des pubs ne sont jamais appelés). L'IA ne fait que
// trier et expliquer ; les chiffres affichés sont ceux de WinningHunter.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MODEL = "gpt-5.5";
export const MCP = "https://app.winninghunter.com/mcp";
export const OUTILS_PERMIS = new Set(["search_exploding_topics", "get_exploding_topic_detail", "find_winning_products", "search_facebook_ads", "get_store_details", "search_tiktok_ads", "get_tiktok_ad", "get_tiktok_trending_products", "find_similar_shops", "find_similar_stores_by_image", "search_shopify_stores", "get_store_top_ads", "daily_radar", "check_credits"]);
const enCours = new Map();

// Marchés et filtres voulus par l'utilisateur (2026-11-23) :
// 7 pays (ou tous ensemble), langues anglais/français/italien/espagnol,
// pas de boutiques chinoises ou indiennes, pas de finance/assurance/placements.
const PAYS_OK = ["US", "CA", "AU", "GB", "FR", "DE", "IT"];
const NOM_PAYS = { ALL: "les 7 pays", US: "États-Unis", CA: "Canada", AU: "Australie", GB: "Royaume-Uni", FR: "France", DE: "Allemagne", IT: "Italie" };
const LANGUES = "en,fr,it,es";
const LANGUES_OK = new Set(LANGUES.split(","));
const paysChoisi = (v) => (PAYS_OK.includes(v) ? v : "ALL");
const paysListe = (p) => (p === "ALL" ? PAYS_OK.join(",") : p);
const INTERDIT = /insurance|assurance|versicherung|assicura|seguro|verzekering|investi(ng|ment|r|sse)|placement financier|forex|crypto|bitcoin|\bloans?\b|lending|mortgage|hypoth[eè]que|courtier|\bbroker|wealth management|stock trading|trading platform|banking|banque|neobank|retirement plan|pension fund|credit card|carte de cr[ée]dit|pr[eê]t personnel/i;
const interdit = (...t) => INTERDIT.test(t.filter(Boolean).join(" "));
const origineExclue = (d, pays, langue) => /\.(in|cn)$|\.com\.cn$|\.co\.in$/.test(String(d ?? "")) || ["IN", "CN"].includes(String(pays ?? "").toUpperCase()) || ["zh", "hi", "ta", "te", "bn"].includes(String(langue ?? "").toLowerCase());
const imagesDe = (...objs) =>
  [...new Set(objs.flatMap((o) => (o && typeof o === "object" ? [o.image, o.poster, o.facebook_image_url, o.facebook_thumbnail_url, o.shopify_productImageURL, o.image_url, o.imageUrl, o.thumbnail, o.thumbnail_url, o.featured_image, o.src, ...(Array.isArray(o.cards) ? o.cards.map((c) => c?.image ?? c?.original_image_url) : [])] : [])).filter((u) => typeof u === "string" && /^https?:\/\//.test(u)))].slice(0, 2);
// Image d aperçu (og:image) de la page produit : sans crédit, pour les pubs sans image exploitable.
async function imagePage(url) {
  if (!/^https?:\/\//.test(url ?? "")) return null;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; atelier)" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    const h = (await r.text()).slice(0, 200000);
    const m = h.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)/i) || h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i);
    const u = m?.[1]?.replace(/^\/\//, "https://").replace(/^http:\/\//, "https://");
    return u && /^https?:\/\//.test(u) ? u : null;
  } catch {
    return null;
  }
}
async function completerImages(lignes) {
  await Promise.all(lignes.filter((l) => !l.images?.length && l.lien).map(async (l) => {
    const u = await imagePage(l.lien);
    l.images = u ? [u] : [];
  }));
}
const REGLE_MARCHES = "Exclus d'office : boutiques chinoises ou indiennes, langues autres qu'anglais, français, italien, espagnol, et toute boutique de produits financiers, assurances ou placements.";

// ---- Client MCP minimal (initialize → session → tools/call) ----
function lireReponse(texte, type) {
  if (String(type).includes("event-stream")) {
    const lignes = texte.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
    for (let i = lignes.length - 1; i >= 0; i--) {
      try {
        const o = JSON.parse(lignes[i]);
        if (o.result || o.error) return o;
      } catch {}
    }
    return {};
  }
  try {
    return JSON.parse(texte);
  } catch {
    return {};
  }
}

async function sessionMcp(key) {
  const h = { "X-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const r = await fetch(MCP, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "atelier", version: "1" } } }), signal: AbortSignal.timeout(60000) });
  const sid = r.headers.get("mcp-session-id");
  await r.text();
  if (!r.ok) throw new Error(`WinningHunter ne répond pas (erreur ${r.status}).`);
  if (sid) h["Mcp-Session-Id"] = sid;
  await fetch(MCP, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), signal: AbortSignal.timeout(30000) }).then((x) => x.text()).catch(() => {});
  let id = 2;
  return async function appeler(nom, args) {
    if (!OUTILS_PERMIS.has(nom)) throw new Error(`Outil WinningHunter refusé : ${nom}`);
    const res = await fetch(MCP, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method: "tools/call", params: { name: nom, arguments: args } }), signal: AbortSignal.timeout(120000) });
    const o = lireReponse(await res.text(), res.headers.get("content-type"));
    if (o.error) throw new Error(`WinningHunter (${nom}) : ${o.error.message ?? "erreur"}`);
    const t = (o.result?.content ?? []).map((c) => c.text ?? "").join("");
    if (o.result?.isError) throw new Error(`WinningHunter (${nom}) : ${t.slice(0, 200)}`);
    try {
      return JSON.parse(t);
    } catch {
      return { texte: t };
    }
  };
}

// ---- IA (tri et explication seulement) ----
async function ia(env, texte) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: [{ role: "user", content: [{ type: "input_text", text: texte }] }] }),
    signal: AbortSignal.timeout(240000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `IA : erreur ${res.status}`);
  const t = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((x) => x.text ?? "").join("");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) throw new Error("Réponse de l'IA sans résultat lisible.");
  return JSON.parse(t.slice(i, j + 1));
}

// Courbe : la recherche monte-t-elle de plus en plus vite ? (3 tiers de la période)
function courbe(points) {
  const v = (points ?? []).map((p) => Number(p.value) || 0);
  if (v.length < 6) return { forme: "inconnue", tiers: [] };
  const n = Math.floor(v.length / 3);
  const moy = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const [a, b, c] = [moy(v.slice(0, n)), moy(v.slice(n, 2 * n)), moy(v.slice(2 * n))];
  const forme = a < b && b < c && c - b > b - a ? "exponentielle" : c > a * 1.2 ? "en hausse" : c < a * 0.8 ? "en baisse" : "plate";
  return { forme, tiers: [Math.round(a), Math.round(b), Math.round(c)] };
}

async function ecrire(file, data) {
  const tmp = `${file}.${Date.now().toString(36)}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 1) + "\n", "utf8");
  await rename(tmp, file);
}

// ---- Agent : Omar_winninghunter_radar tendances (guide « Trends ») ----
async function radar(env, opts, etape) {
  const periode = ["6", "12"].includes(String(opts.periode)) ? String(opts.periode) : "12";
  const categorie = /^[a-z-]{2,30}$/.test(opts.categorie ?? "") ? opts.categorie : "default";
  const pays = paysChoisi(opts.pays);
  const VOL = 10000;
  const CROISS = 200;
  const appeler = await sessionMcp(env.WINNINGHUNTER_API_KEY);

  etape("Lecture des tendances WinningHunter (Exploding Topics)…");
  const vus = new Map();
  for (const offset of [0, 36, 72]) {
    const r = await appeler("search_exploding_topics", { sorting: "exponent", timeframe: periode, category: categorie, offset });
    for (const t of r.result ?? []) if (t.path && !vus.has(t.path)) vus.set(t.path, t);
    if ((r.result ?? []).length < 36 || vus.size >= (r.total ?? 9999)) break;
  }
  const tous = [...vus.values()].map((t) => {
    const g = t.search_history?.growth ?? {};
    const pts = periode === "6" ? t.search_history?.last_6_months : t.search_history?.last_12_months;
    return { sujet: t.keyword?.trim(), path: t.path, description: t.description ?? "", volume: Number(t.absolute_volume) || 0, croissance: Number(g[periode]) || 0, croissance3mois: Number(g["3"]) || 0, courbe: courbe(pts) };
  });
  let passent = tous.filter((t) => t.volume >= VOL && t.croissance >= CROISS && t.courbe.forme !== "en baisse");
  // Catégorie étroite : si moins de 4 tendances passent, on assouplit (5 000 recherches, +100 %), et on le dit.
  let assoupli = null;
  if (passent.length < 4) {
    assoupli = { volume: 5000, croissance: 100 };
    const plus = tous.filter((t) => !passent.includes(t) && t.volume >= assoupli.volume && t.croissance >= assoupli.croissance && t.courbe.forme !== "en baisse").map((t) => ({ ...t, assoupli: true }));
    passent = [...passent, ...plus];
  }
  const recales = tous.length - passent.length;

  etape(`${passent.length} tendance(s) passent les filtres du guide ; tri des vrais produits…`);
  let produits = passent;
  if (passent.length) {
    const tri = await ia(env, `Trend topics (keyword — description):\n${passent.map((t, i) => `${i + 1}. ${t.sujet} — ${t.description.slice(0, 160)}`).join("\n")}\n\nKeep ONLY topics that are a physical product (or product type) an e-commerce store could sell online (dropshipping / DTC). Exclude software, concepts, people, brands of services, apps, food served in restaurants, and anything financial (insurance, investments, loans, crypto). Answer only JSON: {"garder":["exact keywords"]}`);
    const g = new Set((tri.garder ?? []).map((x) => String(x).trim().toLowerCase()));
    produits = passent.filter((t) => g.has(t.sujet.toLowerCase()));
  }
  // Les plus prometteurs d'abord (courbe exponentielle, puis croissance), 6 max pour garder les crédits.
  produits.sort((a, b) => (a.assoupli === true) - (b.assoupli === true) || (b.courbe.forme === "exponentielle") - (a.courbe.forme === "exponentielle") || b.croissance - a.croissance);
  const choisis = produits.slice(0, 6);

  for (const [i, t] of choisis.entries()) {
    etape(`Vérification ${i + 1}/${choisis.length} : « ${t.sujet} » (sous-tendances et concurrents : ${NOM_PAYS[pays]})…`);
    try {
      const d = await appeler("get_exploding_topic_detail", { topic: t.path });
      t.detail = JSON.stringify(d).slice(0, 2500);
    } catch (e) {
      t.detail = `indisponible (${e.message})`;
    }
    try {
      const w = await appeler("find_winning_products", { keyword: t.sujet.toLowerCase(), countries: paysListe(pays), languages: LANGUES, sort_by: "adspend", sort_order: "desc", searchkeyword: "All" });
      const ads = (w.data ?? w.result ?? w.ads ?? []).filter((a) => !interdit(a.pageName, a.copy, a.caption) && !origineExclue(a.shopify_shopifydomain || domaine(a.urlStore)));
      t.images = imagesDe(...ads.slice(0, 4));
      const marques = [...new Set(ads.map((a) => a.pageName ?? a.page_name ?? a.pagename ?? a.brand).filter(Boolean))];
      // Audit F10 : un ÉCHANTILLON (une recherche), pas un recensement du marché.
      t.concurrents = { nombre: marques.length, noms: marques.slice(0, 10), pubs: ads.length, echantillon: { requete: t.sujet.toLowerCase(), pays: NOM_PAYS[pays], tri: "dépense publicitaire", le: new Date().toISOString().slice(0, 10) } };
    } catch (e) {
      t.concurrents = { nombre: null, erreur: e.message };
    }
  }

  // Audit F06 (2026-11-25) : chaque tendance reçoit un identifiant fixe AVANT
  // l'appel IA ; l'IA le renvoie et le serveur rattache les chiffres par lui.
  choisis.forEach((t, i) => (t.id = `R${i + 1}`));
  etape("Synthèse des pistes…");
  let synthese = { resume: "Aucune tendance ne passe les filtres du guide cette fois.", pistes: [], ecartes: [] };
  if (choisis.length) {
    synthese = await ia(env, `Tu es l'agent « Omar_winninghunter_radar tendances ». Tu suis le guide officiel WinningHunter « Trends » :
- période ${periode} mois, courbe exponentielle, croissance de plus de ${CROISS} %, plus de ${VOL} recherches par mois ;
- plusieurs sous-tendances liées = le marché se forme ;
- concurrents sérieux (pubs gagnantes actives) (${NOM_PAYS[pays]}) : 0 à 5 = feu vert, 6 à 10 = à surveiller, plus = marché déjà pris.
Les chiffres ci-dessous viennent de WinningHunter (OBSERVÉS). N'invente aucun chiffre ; si une donnée manque, dis-le.
Portée des indicateurs : « concurrents » = annonceurs distincts vus dans UN échantillon de pubs (une recherche par mot-clé) ; 0 ne veut pas dire aucun concurrent dans le pays. « Courbe exponentielle » = accélération observée sur trois périodes (calcul maison), pas une loi mathématique. Un feu vert est une hypothèse à tester, jamais une certitude.

${choisis.map((t) => `[${t.id}] ${t.sujet}${t.assoupli ? " [SEUIL ASSOUPLI : sous les seuils du guide, à juger plus sévèrement]" : ""} — volume ${t.volume}/mois, croissance ${t.croissance} % sur ${periode} mois (${t.croissance3mois} % sur 3 mois), courbe ${t.courbe.forme} (moyennes par tiers ${t.courbe.tiers.join(" → ")}), concurrents gagnants (${NOM_PAYS[pays]}) : ${t.concurrents?.nombre ?? "inconnu"}${t.concurrents?.noms?.length ? ` (${t.concurrents.noms.join(", ")})` : ""}
   Description : ${t.description.slice(0, 200)}
   Détail Exploding Topics (extrait brut) : ${t.detail}`).join("\n\n")}

Réponds en français, UNIQUEMENT en JSON :
{"resume":"2 phrases sur ce que le radar a trouvé",
 "pistes":[{"id":"R1 (l'identifiant entre crochets, obligatoire)","sujet":"mot-clé exact","verdict":"feu vert|à surveiller|écarté","pourquoi":"2 phrases avec les chiffres","sousTendances":["…"],"produitConcret":"le produit précis à vendre","angle":"l'angle de vente qui se dessine","risques":["…"],"prochaineEtape":"ex. : lancer la Validation produit, chercher le produit sur AliExpress…"}]}
Range les pistes de la plus prometteuse à la moins prometteuse.`);
  }
  // Rattachement par identifiant (le nom exact en secours). Une piste inconnue
  // est refusée ; un verdict hors liste devient « à surveiller » ; les chiffres
  // sont remis par le serveur : tableau et détail lisent le même objet.
  const parId = new Map(choisis.map((t) => [t.id, t]));
  const parSujet = new Map(choisis.map((t) => [t.sujet.toLowerCase(), t]));
  const rejetees = [];
  const prises = new Set();
  synthese.pistes = (synthese.pistes ?? []).flatMap((p) => {
    const t = parId.get(String(p.id ?? "").trim().replace(/[[\]]/g, "").toUpperCase()) ?? parSujet.get(String(p.sujet ?? "").trim().toLowerCase());
    if (!t || prises.has(t.id)) {
      if (!t) rejetees.push(court(p.id ?? p.sujet ?? "?", 60));
      return [];
    }
    prises.add(t.id);
    const libelleIA = p.sujet && String(p.sujet).trim().toLowerCase() !== t.sujet.toLowerCase() ? court(p.sujet, 90) : undefined;
    return [{ ...p, id: t.id, sujet: t.sujet, libelleIA, verdict: VERDICTS.has(p.verdict) ? p.verdict : "à surveiller", images: t.images ?? [], assoupli: Boolean(t.assoupli), volume: t.volume, croissance: t.croissance, croissance3mois: t.croissance3mois, courbe: t.courbe.forme, concurrents: t.concurrents, path: t.path }];
  });
  if (rejetees.length) synthese.rejetees = rejetees;
  return {
    reglages: { periode, categorie, pays, volumeMin: VOL, croissanceMin: CROISS },
    assoupli,
    chiffres: { lues: tous.length, recalees: recales, passent: passent.length, produits: produits.length, verifiees: choisis.length },
    autresProduits: produits.slice(6).map((t) => ({ sujet: t.sujet, volume: t.volume, croissance: t.croissance, courbe: t.courbe.forme })),
    ...synthese,
  };
}


// ==== Agents 2 à 5 (2026-11-23) : format de résultat commun ====
// { titre, sousTitre, colonnes:[{cle,label,type}], lignes:[{id,…}], resume, pistes:[…], autres, notes:[] }
// type de colonne : texte | nom | num | barre | chip | verdict | lien
const jour = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const domaine = (u) => {
  try {
    return new URL(String(u).startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const devise = (c) => (typeof c === "string" ? c : c?.code ?? c?.currency ?? "");
const dateCreation = (v) => {
  if (v == null || v === "") return "";
  const n = Number(v);
  const t = Number.isFinite(n) && n > 1e8 ? new Date(n > 1e12 ? n : n * 1000) : new Date(v);
  return Number.isNaN(t.getTime()) ? "" : t.toISOString().slice(0, 10);
};
const court = (t, n = 90) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const joursDepuis = (d) => {
  const t = typeof d === "number" ? (d > 1e12 ? d : d * 1000) : Date.parse(d);
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 86400000)) : null;
};

// Synthèse IA commune : verdicts par ligne (id) + pistes détaillées. Aucun chiffre inventé.
async function synthese(env, nomAgent, regles, donnees, consigneSortie = "") {
  return ia(env, `Tu es l'agent « ${nomAgent} ». Tu suis ces règles (guide officiel WinningHunter) :
${regles}

Données OBSERVÉES dans WinningHunter (chaque ligne a un id) :
${donnees}

N'invente aucun chiffre ; si une donnée manque, dis-le. ${REGLE_MARCHES} Une ligne qui tombe dans ces exclusions est « écarté ». ${consigneSortie}
Réponds en français, UNIQUEMENT en JSON :
{"resume":"2 phrases sur ce que l'agent a trouvé",
 "verdicts":{"<id>":"feu vert|à surveiller|écarté"},
 "pistes":[{"id":"<id>","sujet":"nom court du produit","verdict":"feu vert|à surveiller|écarté","pourquoi":"2 phrases avec les chiffres","produitConcret":"le produit précis à vendre","angle":"l'angle de vente qui se dessine","risques":["…"],"prochaineEtape":"…"}]}
"pistes" : seulement les 3 à 5 meilleures, de la plus prometteuse à la moins prometteuse.`);
}
// Audit F06 (2026-11-25) : verdicts limités à la liste ; une piste dont
// l'identifiant n'est pas une ligne observée est refusée (et signalée).
const VERDICTS = new Set(["feu vert", "à surveiller", "écarté"]);
function fusionner(lignes, s) {
  for (const l of lignes) {
    const v = s.verdicts?.[l.id];
    l.verdict = VERDICTS.has(v) ? v : "à surveiller";
  }
  const rang = { "feu vert": 0, "à surveiller": 1, "écarté": 2 };
  lignes.sort((a, b) => rang[a.verdict] - rang[b.verdict]);
  const parId = new Map(lignes.map((l) => [String(l.id), l]));
  const rejetees = [];
  const prises = new Set();
  const pistes = (s.pistes ?? []).flatMap((p) => {
    const l = parId.get(String(p.id ?? "").trim());
    if (!l || prises.has(l.id)) {
      if (!l) rejetees.push(court(p.id ?? p.sujet ?? "?", 60));
      return [];
    }
    prises.add(l.id);
    return [{ ...p, id: l.id, verdict: VERDICTS.has(p.verdict) ? p.verdict : l.verdict }];
  });
  return { resume: s.resume, pistes, ...(rejetees.length ? { rejetees } : {}) };
}

// ---- Omar_winninghunter_chasseur facebook (guide « Facebook Ad Library ») ----
async function chasseurFacebook(env, opts, etape) {
  const niche = /^[A-Z]{2}$/.test(opts.niche ?? "") ? opts.niche : "";
  const pays = paysChoisi(opts.pays);
  const media = niche === "CG" ? "" : "videos";
  const appeler = await sessionMcp(env.WINNINGHUNTER_API_KEY);
  const base = { technologies: "SH", page_type: "products", min_ad_spend: 1050, max_ad_spend: 7000, ad_spend_timeframe: "7", ad_created_from: jour(21), ad_created_to: jour(7), sort_by: "adspend", sort_order: "desc" };
  if (niche) base.niche = niche;
  base.countries = paysListe(pays);
  base.languages = LANGUES;
  if (media) base.media_type = media;
  etape("Bibliothèque Facebook : pubs Shopify créées il y a 1 à 3 semaines, 150 à 1 000 $/jour…");
  let ads = [];
  let scroll;
  for (let i = 0; i < 2; i++) {
    const r = await appeler("search_facebook_ads", scroll ? { ...base, scroll } : base);
    ads.push(...(r.data ?? []));
    scroll = r.mcp_pagination?.scroll_next ?? r.scroll;
    if (!scroll || (r.data ?? []).length < 20) break;
  }
  // Une ligne par boutique (sa meilleure pub)
  const parBoutique = new Map();
  for (const a of ads) {
    const d = a.shopify_shopifydomain || domaine(a.urlStore || a.link || a.product_url);
    if (!d || parBoutique.has(d)) continue;
    if (interdit(a.pageName, d, a.copy, a.caption, a.description) || origineExclue(d)) continue;
    parBoutique.set(d, a);
  }
  const lignes = [...parBoutique.entries()].slice(0, 15).map(([d, a], i) => ({
    id: `F${i + 1}`,
    images: imagesDe(a),
    nom: court(a.description || a.caption || a.copy, 70) || d,
    boutique: d,
    marque: a.pageName,
    depenseTotale: Number(a.total_eu_adspend) || null,
    jours: joursDepuis(a.started),
    depenseJour: Number(a.total_eu_adspend) ? Math.round(Number(a.total_eu_adspend) / Math.max(1, joursDepuis(a.started) ?? 1)) : null,
    prix: a.shopify_productprice ? `${a.shopify_productprice} ${devise(a.shopify_currency)}`.trim() : "—",
    pubsActives: a.total_active_ads_on_page ?? null,
    lien: a.product_url || a.link || a.urlStore,
    texte: court(a.copy || a.caption, 200),
  }));
  for (const [i, l] of lignes.slice(0, 8).entries()) {
    etape(`Trafic des boutiques ${i + 1}/${Math.min(8, lignes.length)} : ${l.boutique}…`);
    try {
      const s = await appeler("get_store_details", { domain: l.boutique });
      const st = s.data ?? s.store ?? s;
      l.visites = Number(st.monthly_visits ?? st.monthlyVisits ?? st.traffic?.monthly_visits) || null;
    } catch {
      l.visites = null;
    }
  }
  await completerImages(lignes);
  etape("Synthèse des pistes…");
  const s = lignes.length
    ? await synthese(env, "Omar_winninghunter_chasseur facebook", "- Boutiques Shopify, pages produit.\n- Dépense de 150 à 1 000 $ par jour (dépense UE estimée par jour fournie ; un peu au-dessus de 1 000 $ reste acceptable, c'est un gagnant qui accélère).\n- Pub créée il y a 1 à 3 semaines.\n- Trafic de la boutique : 30 000 à 50 000 visites le mois précédent = zone idéale.\n- Ne pas se fier au score de pub.\n- Résultat : 10 à 15 idées, ramenées à 3 à 5 à tester (feu vert).", lignes.map((l) => `${l.id}. ${l.nom} — boutique ${l.boutique} (${l.marque ?? "?"}), dépense UE estimée ${l.depenseJour ?? "?"} $/jour (${l.depenseTotale ?? "?"} $ au total), ${l.jours ?? "?"} jours de diffusion, prix ${l.prix}, ${l.pubsActives ?? "?"} pubs actives sur la page, visites/mois ${l.visites ?? "inconnu"}. Texte : « ${l.texte} »`).join("\n"))
    : { resume: "Aucune pub ne correspond aux filtres du guide cette fois.", pistes: [] };
  const f = fusionner(lignes, s);
  return {
    reglages: { niche: niche || "", pays },
    titre: "Chasse Facebook",
    sousTitre: `${ads.length} pubs lues · ${parBoutique.size} boutiques · créées entre le ${jour(21)} et le ${jour(7)} · 150 à 1 000 $/jour`,
    colonnes: [
      { cle: "images", label: "", type: "images" },
      { cle: "nom", label: "Produit / pub", type: "nom" },
      { cle: "boutique", label: "Boutique", type: "lien" },
      { cle: "depenseJour", label: "Dépense / jour", type: "barre", suffixe: " $" },
      { cle: "jours", label: "Jours", type: "num" },
      { cle: "visites", label: "Visites / mois", type: "barre" },
      { cle: "prix", label: "Prix", type: "chip" },
      { cle: "verdict", label: "Verdict", type: "verdict" },
    ],
    lignes,
    ...f,
    notes: [`Marché : ${NOM_PAYS[pays]} · langues : anglais, français, italien, espagnol · exclus : boutiques chinoises ou indiennes, finance, assurances, placements.`, "Dépense / jour = dépense UE totale estimée par WinningHunter ÷ jours de diffusion (Meta ne publie la dépense que pour l'Europe).", "Visites : 30 000 à 50 000 par mois = zone idéale du guide."],
  };
}

// ---- Omar_winninghunter_chasseur tiktok (guide « TikTok Ads ») ----
async function chasseurTiktok(env, opts, etape) {
  const pays = paysChoisi(opts.pays);
  const niche = /^[a-z]{2,20}$/.test(opts.niche ?? "") ? opts.niche : "";
  const signal = ["likes", "shares", "comments"].includes(opts.signal) ? opts.signal : "likes";
  const filtre = signal === "likes" ? { min_likes: 200 } : signal === "shares" ? { min_shares: 30, min_likes: null } : { min_comments: 50, min_likes: null };
  const appeler = await sessionMcp(env.WINNINGHUNTER_API_KEY);
  const base = { countries: paysListe(pays), languages: LANGUES, product_ads_only: true, last_seen_from: jour(21), last_seen_to: jour(0), limit: 20, ...filtre };
  if (niche) base.niches = niche;
  const ads = new Map();
  // Audit F07 (2026-11-25) : chaque appel est compté. Zéro appel réussi = la
  // recherche a ÉCHOUÉ (jamais « aucune pub ») ; certains en échec = résultat partiel.
  const appels = { ok: 0, erreurs: [] };
  for (const tri of ["adspend", "likes", "shares", "datefound", "daysrunning"]) {
    etape(`Pubs TikTok (${NOM_PAYS[pays]}, tri : ${tri})…`);
    try {
      const r = await appeler("search_tiktok_ads", { ...base, sort_by: tri, sort_order: "desc" });
      for (const a of r.ads ?? []) {
        const k = a.shopify_productid || `${a.shopify_shopifydomain || domaine(a.urlStore)}|${court(a.shopify_productname || a.description, 30).replace(/^\d+\s*/, "").toLowerCase()}`;
        if (interdit(a.pageName, a.description, a.shopify_productname, a.shopify_shopifydomain) || origineExclue(a.shopify_shopifydomain || domaine(a.urlStore), a.shopify_country, a.language)) continue;
        if (k && !ads.has(k)) ads.set(k, a);
      }
      appels.ok++;
    } catch (e) {
      appels.erreurs.push(`${tri} : ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }
  if (!appels.ok) throw new Error(`Recherche TikTok échouée : les ${appels.erreurs.length} appels à WinningHunter ont échoué (${appels.erreurs[0] ?? "erreur inconnue"}). Rien n'a été conclu sur le marché : relance plus tard.`);
  const partiel = appels.erreurs.length ? ` · résultat PARTIEL : ${appels.ok}/${appels.ok + appels.erreurs.length} recherches réussies` : "";
  const lignes = [...ads.values()].slice(0, 20).map((a, i) => ({
    id: `T${i + 1}`,
    images: imagesDe(a),
    nom: court(a.shopify_productname || a.description, 70).replace(/^\d+\s+/, ""),
    boutique: a.shopify_shopifydomain || domaine(a.urlStore),
    depense: Number(a.total_adspend) || null,
    likes: Number(a.likeCount) || 0,
    partages: Number(a.shareCount) || 0,
    commentaires: Number(a.commentCount) || 0,
    jours: Number(a.daysrunning) || null,
    prix: a.shopify_productprice ? `${a.shopify_productprice} ${devise(a.shopify_currency)}`.trim() : "—",
    alerte: [Number(a.total_adspend) > 5000 && Number(a.likeCount) < 100 ? "forte dépense, peu d'engagement" : "", Number(a.daysrunning) > 21 ? "plus de 3 semaines" : ""].filter(Boolean).join(" · ") || "—",
    lien: a.urlStore,
    texte: court(a.description, 200),
  }));
  etape("Images des produits…");
  await completerImages(lignes);
  etape("Synthèse des pistes…");
  const s = lignes.length
    ? await synthese(env, "Omar_winninghunter_chasseur tiktok", `- Marché : ${NOM_PAYS[pays]}, pages produit seulement.\n- UN seul filtre d'engagement (ici : ${signal === "likes" ? "200+ likes" : signal === "shares" ? "30+ partages" : "50+ commentaires"}).\n- Tri par dépense, puis régularité et likes.\n- Vue dans les 7 à 21 derniers jours.\n- Alertes : forte dépense mais très peu d'engagement ; pubs de plus de 3 semaines.`, lignes.map((l) => `${l.id}. ${l.nom} — boutique ${l.boutique || "?"}, dépense totale ${l.depense ?? "?"} $, ${l.likes} likes, ${l.partages} partages, ${l.commentaires} commentaires, ${l.jours ?? "?"} jours, prix ${l.prix}, alerte : ${l.alerte}. Texte : « ${l.texte} »`).join("\n"))
    : { resume: "Aucune pub TikTok ne correspond aux filtres du guide cette fois.", pistes: [] };
  const f = fusionner(lignes, s);
  return {
    reglages: { pays, niche: niche || "toutes", signal },
    titre: `Chasse TikTok : ${NOM_PAYS[pays]}`,
    sousTitre: `${ads.size} produits distincts · vus entre le ${jour(21)} et aujourd'hui · filtre ${signal === "likes" ? "200+ likes" : signal === "shares" ? "30+ partages" : "50+ commentaires"}${partiel}`,
    colonnes: [
      { cle: "images", label: "", type: "images" },
      { cle: "nom", label: "Produit", type: "nom" },
      { cle: "boutique", label: "Boutique", type: "lien" },
      { cle: "depense", label: "Dépense", type: "barre", suffixe: " $" },
      { cle: "likes", label: "Likes", type: "barre" },
      { cle: "jours", label: "Jours", type: "num" },
      { cle: "alerte", label: "Alerte", type: "chip" },
      { cle: "verdict", label: "Verdict", type: "verdict" },
    ],
    lignes,
    ...f,
    notes: [`Marché : ${NOM_PAYS[pays]} · langues : anglais, français, italien, espagnol · exclus : boutiques chinoises ou indiennes, finance, assurances, placements.`, "WinningHunter renvoie au plus 4 pubs par recherche TikTok : l'agent fait 5 recherches avec des tris différents."],
  };
}

// ---- Omar_winninghunter_boucle magic ai (guide « Magic AI ») ----
async function boucleMagic(env, opts, etape) {
  const pays = paysChoisi(opts.pays);
  const depart = court(opts.depart, 120);
  if (!depart) throw new Error("Donne un point de départ : le nom précis d'un produit ou le domaine d'une boutique.");
  const appeler = await sessionMcp(env.WINNINGHUNTER_API_KEY);
  let graines = [];
  let images = [];
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(depart.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))) graines = [domaine(depart)];
  else {
    etape(`Pubs Facebook pour « ${depart} » : boutiques de départ…`);
    const r = await appeler("search_facebook_ads", { keyword: depart.toLowerCase(), searchkeyword: "adtext", page_type: "products", technologies: "SH", countries: paysListe(pays), languages: LANGUES, sort_by: "adspend", sort_order: "desc", last_seen_from: jour(14), last_seen_to: jour(0) });
    const mots = depart.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const parle = (a) => {
      const t = `${a.copy ?? ""} ${a.caption ?? ""} ${a.description ?? ""} ${a.product_url ?? ""} ${a.link ?? ""}`.toLowerCase();
      return mots.every((w) => t.includes(w.replace(/s$/, "")));
    };
    const bonnes = (r.data ?? []).filter(parle);
    // Domaine public de la boutique (pas l'adresse myshopify, que la recherche de boutiques similaires ne connaît pas)
    graines = [...new Set(bonnes.map((a) => domaine(a.urlStore || a.link || a.product_url) || a.shopify_shopifydomain).filter(Boolean))].slice(0, 2);
    images = [...new Set(bonnes.map((a) => a.image || a.facebook_image_url || a.poster || a.facebook_thumbnail_url).filter((u) => /^https?:/.test(u ?? "")))].slice(0, 2);
    if (!graines.length) throw new Error(`Aucune boutique active trouvée pour « ${depart} ». Essaie un nom plus précis ou un domaine.`);
  }
  const boutiques = new Map();
  const vues = new Set();
  const explorer = async (d, tour) => {
    if (vues.has(d)) return;
    vues.add(d);
    etape(`Tour ${tour} : boutiques similaires à ${d}…`);
    const r = await appeler("find_similar_shops", { domain: d, size: 15 });
    for (const s of r.similar_shops ?? []) {
      const meme = graines.some((g) => s.domain.endsWith(g) || s.domain.split(".").includes(g.split(".")[0]));
      if (!s.domain || boutiques.has(s.domain) || graines.includes(s.domain) || meme) continue;
      if (interdit(s.domain, s.name, s.category, s.category_v2_l2) || origineExclue(s.domain, s.owner_country, s.language) || (s.language && !LANGUES_OK.has(String(s.language).slice(0, 2)))) continue;
      boutiques.set(s.domain, { ...s, tour, depuis: d });
    }
  };
  // Tour 1 : boutiques qui vendent un produit qui RESSEMBLE (image de la pub), puis boutiques similaires.
  for (const [i, img] of images.entries()) {
    etape(`Tour 1 : boutiques au produit visuellement proche (image ${i + 1}/${images.length})…`);
    try {
      const r = await appeler("find_similar_stores_by_image", { image_url: img, size: 15 });
      for (const s of r.data ?? r.shops ?? r.results ?? r.stores ?? r.similar_shops ?? []) {
        if (s.domain && !boutiques.has(s.domain) && !graines.includes(s.domain) && !interdit(s.domain, s.name, s.category) && !origineExclue(s.domain, s.owner_country ?? s.country, s.language)) boutiques.set(s.domain, { ...s, tour: 1, depuis: "image de la pub" });
      }
    } catch {}
  }
  for (const g of graines) await explorer(g, 1).catch(() => {});
  // La boucle : on relance sur la boutique similaire la plus dynamique.
  const prochaine = [...boutiques.values()].sort((a, b) => (Number(b.visits_growth_pct_m1) || 0) - (Number(a.visits_growth_pct_m1) || 0))[0];
  if (prochaine) await explorer(prochaine.domain, 2).catch(() => {});
  // Produits candidats : l'IA garde, parmi les meilleures ventes des boutiques trouvées,
  // celles de la MÊME niche que le point de départ (WinningHunter ramène aussi du hors sujet).
  etape(`Tri des meilleures ventes de ${boutiques.size} boutiques (même niche que « ${depart} »)…`);
  const titre = (b) => (typeof b === "string" ? b : b?.title ?? b?.name ?? "");
  const liste = [...boutiques.values()].map((s) => ({ ...s, best: (Array.isArray(s.bestsellers) ? s.bestsellers : []).map(titre).filter((t) => t && !/insurance|verzekering|gift ?card|shipping|protection|carte cadeau|abbonamento|subscription/i.test(t)).slice(0, 3) })).filter((s) => s.best.length);
  let cand = [];
  if (liste.length) {
    const t = await ia(env, `Starting product: "${depart}". Shops found by lookalike search (domain — category — best sellers):\n${liste.map((s) => `${s.domain} — ${s.category_v2_l2 || s.category || "?"} — ${s.best.join(" | ")}`).join("\n")}\n\nPick up to 8 best-seller products that belong to the SAME niche as the starting product or are close neighbours a buyer of it would also want (same problem, same customer). Ignore unrelated products. Answer only JSON: {"produits":[{"produit":"exact best-seller title","boutique":"domain"}]}`);
    const parDom = new Map(liste.map((s) => [s.domain, s]));
    cand = (t.produits ?? []).map((x) => ({ x, s: parDom.get(x.boutique) })).filter(({ s }) => s).slice(0, 8).map(({ x, s }) => ({ images: imagesDe((Array.isArray(s.bestsellers) ? s.bestsellers : []).find((b) => titre(b) === x.produit)), produit: court(x.produit, 70), boutique: s.domain, visites: Number(s.monthly_visits) || null, croissance: Number(s.visits_growth_pct_m1) || null, pubs: Number(s.active_ad_count) || 0, categorie: s.category_v2_l2 || s.category || "", tour: s.tour }));
  }
  const lignes = [];
  for (const [i, c] of cand.entries()) {
    etape(`Concurrents (${NOM_PAYS[pays]}) ${i + 1}/${cand.length} : « ${c.produit} »…`);
    let n = null;
    try {
      const mot = c.produit.toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 4).join(" ");
      const r = await appeler("search_facebook_ads", { keyword: mot, countries: paysListe(pays), languages: LANGUES, technologies: "SH", last_seen_from: jour(7), last_seen_to: jour(0), sort_by: "adspend", sort_order: "desc" });
      const vues2 = (r.data ?? []).filter((a) => !interdit(a.pageName, a.copy) && !origineExclue(a.shopify_shopifydomain || domaine(a.urlStore)));
      n = new Set(vues2.map((a) => a.pageName).filter(Boolean)).size;
      if (!c.images.length) c.images = imagesDe(...vues2.slice(0, 2));
    } catch {}
    lignes.push({ id: `M${i + 1}`, images: c.images, nom: c.produit, boutique: c.boutique, visites: c.visites, croissance: c.croissance, pubs: c.pubs, concurrents: n, tour: `tour ${c.tour}`, categorie: c.categorie });
  }
  etape("Synthèse des pistes…");
  const s = lignes.length
    ? await synthese(env, "Omar_winninghunter_boucle magic ai", "- Partir d'un produit trouvé ; ne pas s'arrêter aux concurrents : regarder les produits similaires de la même niche.\n- Garder les produits qui ont 0 à 1 (au plus 3) concurrents dans le pays.\n- Relancer la recherche sur chaque bon produit trouvé (la boucle).\n- Résultat : 10 à 15 idées, 3 à 5 à tester.", `Point de départ : ${depart} (boutiques : ${graines.join(", ")})\n` + lignes.map((l) => `${l.id}. ${l.nom} — meilleure vente de ${l.boutique} (${l.categorie}), visites/mois ${l.visites ?? "?"}, croissance du trafic 1 mois ${l.croissance ?? "?"} %, ${l.pubs} pubs actives, concurrents avec pubs actives dans le pays : ${l.concurrents ?? "inconnu"}, trouvé au ${l.tour}`).join("\n"), "La boutique qui vend déjà le produit ne compte pas comme concurrent nouveau ; juge la place restante.")
    : { resume: "Aucune boutique similaire exploitable cette fois.", pistes: [] };
  const f = fusionner(lignes, s);
  return {
    reglages: { depart, pays },
    titre: `Boucle Magic AI : ${depart}`,
    sousTitre: `Départ ${graines.join(", ")}${images.length ? ` + ${images.length} image(s) de pub` : ""} · ${boutiques.size} boutiques similaires (2 tours) · concurrents vérifiés : ${NOM_PAYS[pays]}`,
    colonnes: [
      { cle: "images", label: "", type: "images" },
      { cle: "nom", label: "Produit", type: "nom" },
      { cle: "boutique", label: "Boutique", type: "lien" },
      { cle: "visites", label: "Visites / mois", type: "barre" },
      { cle: "croissance", label: "Trafic 1 mois", type: "num", suffixe: " %" },
      { cle: "concurrents", label: "Concurrents", type: "num" },
      { cle: "tour", label: "Boucle", type: "chip" },
      { cle: "verdict", label: "Verdict", type: "verdict" },
    ],
    lignes,
    ...f,
    autres: [...boutiques.values()].slice(0, 25).map((b) => ({ sujet: b.domain, detail: `${b.category_v2_l2 || b.category || ""} · ${b.monthly_visits ?? "?"} visites/mois` })),
    notes: [`Marché : ${NOM_PAYS[pays]} · langues : anglais, français, italien, espagnol · exclus : boutiques chinoises ou indiennes, finance, assurances, placements.`, "Concurrents = annonceurs Shopify avec des pubs Facebook vues ces 7 derniers jours sur ce produit dans le pays."],
  };
}

// ---- Omar_winninghunter_veille boutiques (guide « Store Tracker ») ----
async function veilleBoutiques(env, opts, etape, ctx) {
  const listeFile = join(ctx.dossier, "..", "boutiques-suivies.json");
  let suivies = String(opts.boutiques ?? "").split(/[\s,;]+/).map(domaine).filter(Boolean);
  if (suivies.length) await ecrire(listeFile, { boutiques: [...new Set(suivies)].slice(0, 15) });
  else if (existsSync(listeFile)) suivies = JSON.parse(await readFile(listeFile, "utf8")).boutiques ?? [];
  suivies = [...new Set(suivies)].slice(0, 15);
  const categorie = ["Clothing", "Accessories", "Beauty", "Health", "Toys & Games", "Electronics", "Pet Supplies", "Arts & Crafts", "Other"].includes(opts.categorie) ? opts.categorie : "";
  const pays = paysChoisi(opts.pays);
  const appeler = await sessionMcp(env.WINNINGHUNTER_API_KEY);
  // Le relevé précédent, pour voir ce qui a changé
  const precedent = await (async () => {
    const fs = (await readdir(ctx.dossier)).filter((f) => /^[0-9TZ-]+\.json$/.test(f)).sort().reverse();
    return fs[0] ? JSON.parse(await readFile(join(ctx.dossier, fs[0]), "utf8")) : null;
  })();
  const avant = new Map((precedent?.lignes ?? []).map((l) => [l.boutique, l]));
  const lignes = [];
  for (const [i, d] of suivies.entries()) {
    etape(`Boutique suivie ${i + 1}/${suivies.length} : ${d}…`);
    const l = { id: `B${i + 1}`, boutique: d, nom: d };
    try {
      const s = await appeler("get_store_details", { domain: d });
      const st = s.data ?? s.store ?? s;
      l.trouvee = s.success !== false;
      l.revenu = Number(st["30d_rev_estimated_max"] ?? st.monthly_revenue ?? st.revenue_30d) || null;
      l.visites = Number(st.monthly_visits) || null;
      l.croissance = Number(st.visits_growth_pct_m1) || null;
      l.produits = Number(st.published_products_count) || null;
      l.creee = dateCreation(st.shop_created_at);
    } catch {}
    try {
      const t = await appeler("get_store_top_ads", { domain: d });
      const ads = t.data?.data ?? t.data ?? [];
      l.pubs = Array.isArray(ads) ? ads.length : 0;
      l.images = imagesDe(...(Array.isArray(ads) ? ads : []).slice(0, 3));
      l.meilleures = (Array.isArray(ads) ? ads : []).slice(0, 5).map((a) => court(a.description || a.caption || a.copy || a.title || a.link, 80)).filter(Boolean);
    } catch {
      l.meilleures = [];
    }
    const p = avant.get(d);
    l.nouveau = p ? l.meilleures.filter((m) => !(p.meilleures ?? []).includes(m)) : [];
    l.evolution = p && p.revenu && l.revenu ? Math.round(((l.revenu - p.revenu) / p.revenu) * 100) : null;
    lignes.push(l);
  }
  let decouvertes = [];
  if (categorie || !suivies.length) {
    etape("Nouvelles boutiques dont le trafic grimpe…");
    try {
      const r = await appeler("search_shopify_stores", { ...(categorie ? { category: categorie } : {}), sort_by: "visits_growth_pct_m1", sort_order: "desc", store_created_from: jour(240), store_created_to: jour(0), monthly_visits_min: 20000, size: 20, ...(pays === "ALL" ? { visitor_country_main: paysListe(pays) } : { visitor_country_main: pays }) });
      const liste = (r.data ?? r.shops ?? r.results ?? r.stores ?? []).filter((s) => !interdit(s.domain, s.name, s.category, s.category_v2_l2) && !origineExclue(s.domain, s.owner_country ?? s.country, s.language) && (!s.language || LANGUES_OK.has(String(s.language).slice(0, 2)))).slice(0, 10);
      decouvertes = liste.map((s) => ({ sujet: s.domain, detail: `${s.category_v2_l2 || s.category || ""} · ${s.monthly_visits ?? "?"} visites/mois · trafic +${s.visits_growth_pct_m1 ?? "?"} % sur 1 mois · créée ${dateCreation(s.shop_created_at)}` }));
    } catch {}
  }
  etape("Synthèse…");
  const s = lignes.length
    ? await synthese(env, "Omar_winninghunter_veille boutiques", "- Nouvelle boutique dont la dépense grimpe en flèche = mine d'or ; suivre aussi ses 5 principaux concurrents.\n- Boutique ancienne et stable : garder ses produits récents très financés.\n- Signal fort : plusieurs boutiques suivies ajoutent le même type de produit en même temps.\n- Alertes : dépense plate ou en baisse, peu de visiteurs malgré la dépense, produits sans lien entre eux.\n- Routine : chaque jour 3 à 5 idées.", lignes.map((l) => `${l.id}. ${l.boutique} — revenu 30 j ${l.revenu ?? "?"} $, ${l.visites ?? "?"} visites/mois (trafic ${l.croissance ?? "?"} % sur 1 mois), ${l.produits ?? "?"} produits, créée ${l.creee || "?"}, évolution du revenu depuis le dernier relevé ${l.evolution ?? "premier relevé"} %, meilleures pubs : ${l.meilleures.join(" | ") || "aucune"}${l.nouveau.length ? ` ; NOUVEAU depuis le dernier relevé : ${l.nouveau.join(" | ")}` : ""}`).join("\n") + (decouvertes.length ? `\n\nBoutiques à envisager de suivre : ${decouvertes.map((d) => `${d.sujet} (${d.detail})`).join(" ; ")}` : ""), "Pour chaque boutique (id), le verdict dit si elle mérite qu'on regarde ses produits maintenant (feu vert), plus tard (à surveiller) ou pas (écarté). Les pistes sont des PRODUITS repérés chez elles.")
    : { resume: "Aucune boutique suivie : ajoute des domaines, ou choisis une catégorie pour en découvrir.", pistes: [] };
  const f = fusionner(lignes, s);
  return {
    reglages: { boutiques: suivies.length, categorie, pays },
    titre: "Veille boutiques",
    sousTitre: `${suivies.length} boutique(s) suivie(s)${precedent ? ` · comparé au relevé du ${new Date(precedent.le).toLocaleDateString("fr-CA")}` : " · premier relevé"}${decouvertes.length ? ` · ${decouvertes.length} boutiques découvertes` : ""}`,
    colonnes: [
      { cle: "images", label: "", type: "images" },
      { cle: "boutique", label: "Boutique", type: "lien" },
      { cle: "revenu", label: "Revenu 30 j (est.)", type: "barre", suffixe: " $" },
      { cle: "evolution", label: "Évol.", type: "num", suffixe: " %" },
      { cle: "visites", label: "Visites / mois", type: "barre" },
      { cle: "pubs", label: "Pubs", type: "num" },
      { cle: "creee", label: "Créée", type: "chip" },
      { cle: "verdict", label: "Verdict", type: "verdict" },
    ],
    lignes,
    ...f,
    autres: decouvertes,
    notes: [`Marché : ${NOM_PAYS[pays]} · langues : anglais, français, italien, espagnol · exclus : boutiques chinoises ou indiennes, finance, assurances, placements.`, "La liste des boutiques suivies est gardée dans le dossier de l'agent ; chaque relevé est comparé au précédent."],
  };
}

const MOTEURS = {
  "omar-winninghunter-radar-tendances": radar,
  "omar-winninghunter-chasseur-facebook": chasseurFacebook,
  "omar-winninghunter-chasseur-tiktok": chasseurTiktok,
  "omar-winninghunter-boucle-magic-ai": boucleMagic,
  "omar-winninghunter-veille-boutiques": veilleBoutiques,
};

export async function rechercheRoute(req, res, parts, { root, readBody, json }) {
  const slug = parts[1];
  if (!MOTEURS[slug]) return json(res, 404, { error: "Cet agent n'est pas encore construit." });
  const dir = join(root, "agents", "omar-winninghunter", slug, "resultats");
  await mkdir(dir, { recursive: true });
  const etatFile = join(dir, "_etat.json");
  const lireEtat = async () => (existsSync(etatFile) ? JSON.parse(await readFile(etatFile, "utf8")) : { statut: "vide" });

  // POST /api/recherche/<slug>/adopter { fichier, id, projet | nouveau }
  // Audit F11 (2026-11-25) : une piste entre dans un projet (existant ou créé)
  // comme NOTE DE RECHERCHE avec son origine (agent, date, réglages, mesures,
  // sources, limites, interprétation). Jamais dans les preuves.
  if (req.method === "POST" && parts[2] === "adopter") {
    const b = (await readBody(req).catch(() => ({}))) || {};
    if (!/^[0-9TZ-]+\.json$/.test(String(b.fichier ?? "")) || !existsSync(join(dir, b.fichier))) return json(res, 404, { error: "Résultat introuvable." });
    const r = JSON.parse(await readFile(join(dir, b.fichier), "utf8"));
    const p = (r.pistes ?? []).find((x) => String(x.id ?? x.sujet) === String(b.id ?? ""));
    if (!p) return json(res, 404, { error: "Piste introuvable dans ce résultat." });
    const { muterProjet, writeAtomic } = await import("./commun.mjs");
    let projet = String(b.projet ?? "");
    if (b.nouveau) {
      const nom = String(b.nouveau).trim().slice(0, 80);
      projet = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
      if (!nom || !/^[a-z0-9][a-z0-9-]{1,90}$/.test(projet)) return json(res, 400, { error: "Donne un nom au nouveau projet." });
      if (existsSync(join(root, "projets", `${projet}.json`))) return json(res, 409, { error: `Le projet « ${nom} » existe déjà : choisis-le dans la liste.` });
      await writeAtomic(join(root, "projets", `${projet}.json`), JSON.stringify({ id: projet, nom, produit: court(p.produitConcret || p.sujet, 120), description: "", creeLe: new Date().toISOString() }, null, 2) + "\n");
    }
    if (!/^[a-z0-9][a-z0-9-]{1,90}$/.test(projet) || !existsSync(join(root, "projets", `${projet}.json`))) return json(res, 404, { error: "Projet introuvable." });
    const ligne = (r.lignes ?? []).find((l) => String(l.id) === String(p.id));
    const mesures = ligne
      ? Object.fromEntries((r.colonnes ?? []).filter((c) => !["images", "verdict", "nom"].includes(c.type)).map((c) => [c.label || c.cle, ligne[c.cle] == null || ligne[c.cle] === "" ? null : `${ligne[c.cle]}${c.suffixe ?? ""}`]).filter(([, v]) => v != null))
      : Object.fromEntries(
          [
            ["Recherches / mois (Exploding Topics)", p.volume],
            [`Croissance sur ${r.reglages?.periode ?? "?"} mois (Exploding Topics)`, p.croissance != null ? `+${p.croissance} %` : null],
            ["Croissance sur 3 mois (Exploding Topics)", p.croissance3mois != null ? `+${p.croissance3mois} %` : null],
            ["Courbe (calcul maison sur 3 périodes)", p.courbe === "exponentielle" ? "accélère" : p.courbe],
            ["Annonceurs distincts dans l'échantillon", p.concurrents?.nombre],
          ].filter(([, v]) => v != null && v !== ""),
        );
    const limites = [
      "Chiffres relevés par WinningHunter à la date du résultat ; ils peuvent avoir changé.",
      ligne ? "Lignes lues dans un échantillon de recherche limité, pas un recensement du marché." : `Concurrents : annonceurs vus dans une seule recherche (« ${p.concurrents?.echantillon?.requete ?? p.sujet} », ${p.concurrents?.echantillon?.pays ?? NOM_PAYS[r.reglages?.pays] ?? r.reglages?.pays ?? "?"}) ; 0 ne veut pas dire aucun concurrent.`,
      "Verdict, angle et produit : interprétation de l'IA, à valider (étape Validation produit).",
    ];
    const origine = { agent: slug, fichier: b.fichier, resultatDu: r.le, reglages: r.reglages ?? {}, id: p.id ?? null, sujet: p.sujet, mesures, source: "WinningHunter (lecture seule)", limites };
    const texte = [
      `Piste de recherche : ${p.sujet} (${p.verdict ?? "sans verdict"})`,
      `Origine : agent ${slug}, résultat du ${String(r.le ?? "").slice(0, 10)}${p.id ? `, piste ${p.id}` : ""}.`,
      Object.keys(mesures).length ? `Mesures : ${Object.entries(mesures).map(([k, v]) => `${k} ${v}`).join(" · ")}.` : "Mesures : aucune relevée.",
      p.produitConcret ? `Produit (interprétation IA) : ${p.produitConcret}` : "",
      p.angle ? `Angle (interprétation IA) : ${p.angle}` : "",
      p.pourquoi ? `Pourquoi (IA) : ${p.pourquoi}` : "",
      p.risques?.length ? `Risques : ${p.risques.join(" · ")}` : "",
      `Limites : ${limites.join(" ")}`,
      "Hypothèse à tester, ne prouve rien.",
    ].filter(Boolean).join("\n");
    const le = new Date().toISOString();
    await muterProjet(projet, (pj) => {
      pj.fondations = pj.fondations ?? {};
      pj.fondations.reponses = pj.fondations.reponses ?? {};
      pj.fondations.reponses.notesAgents = [...(pj.fondations.reponses.notesAgents ?? []), { texte, agent: slug, le, origine }];
    });
    return json(res, 200, { ok: true, projet });
  }

  if (req.method === "GET" && parts[2]) {
    if (!/^[0-9TZ-]+\.json$/.test(parts[2]) || !existsSync(join(dir, parts[2]))) return json(res, 404, { error: "Résultat introuvable." });
    return json(res, 200, JSON.parse(await readFile(join(dir, parts[2]), "utf8")));
  }
  if (req.method === "GET") {
    const e = await lireEtat();
    const fichiers = (await readdir(dir)).filter((f) => /^[0-9TZ-]+\.json$/.test(f)).sort().reverse();
    const historique = [];
    for (const f of fichiers.slice(0, 30)) {
      try {
        const r = JSON.parse(await readFile(join(dir, f), "utf8"));
        historique.push({ fichier: f, le: r.le, reglages: r.reglages, nb: (r.pistes ?? []).length });
      } catch {}
    }
    const dernier = fichiers[0] ? JSON.parse(await readFile(join(dir, fichiers[0]), "utf8")) : null;
    const statut = enCours.has(slug) ? "en cours" : e.statut === "en cours" ? "erreur" : e.statut;
    const lf = join(dir, "..", "boutiques-suivies.json");
    const suivies = existsSync(lf) ? JSON.parse(await readFile(lf, "utf8")).boutiques : null;
    return json(res, 200, { ...e, suivies, statut, etape: enCours.get(slug) ?? e.etape, erreur: statut === "erreur" && e.statut === "en cours" ? "Lancement interrompu (serveur redémarré) : relance-le." : e.erreur, dernier, historique });
  }
  if (req.method !== "POST") return json(res, 405, { error: "Méthode refusée." });
  if (enCours.has(slug)) return json(res, 409, { error: "Cet agent tourne déjà." });
  // Audit F03 (2026-11-25) : réservé tout de suite (avant toute attente), libéré si le lancement est refusé.
  enCours.set(slug, "Démarrage…");
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", root, "");
  if (!env.WINNINGHUNTER_API_KEY) return enCours.delete(slug), json(res, 400, { error: "WinningHunter n'est pas connecté (WINNINGHUNTER_API_KEY)." });
  if (!env.OPENAI_API_KEY) return enCours.delete(slug), json(res, 400, { error: "Clé OpenAI absente (OPENAI_API_KEY)." });
  const opts = (await readBody(req).catch(() => ({}))) || {};
  await ecrire(etatFile, { statut: "en cours", lanceLe: new Date().toISOString(), etape: "Démarrage…" });
  const etape = (t) => enCours.set(slug, t);
  (async () => {
    try {
      const r = await MOTEURS[slug](env, opts, etape, { dossier: dir });
      const le = new Date().toISOString();
      await ecrire(join(dir, `${le.replace(/[:.]/g, "-")}.json`), { agent: slug, le, ...r });
      await ecrire(etatFile, { statut: "fini", le });
    } catch (e) {
      await ecrire(etatFile, { statut: "erreur", erreur: e.message, le: new Date().toISOString() });
    } finally {
      enCours.delete(slug);
    }
  })();
  return json(res, 202, { statut: "en cours" });
}
