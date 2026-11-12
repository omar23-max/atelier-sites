// « Retravailler avec l'IA » : appels OpenAI faits par le serveur local de
// l'atelier (la clé OPENAI_API_KEY de .env.local ne quitte jamais le PC).
//   - textes : gpt-5.4-mini réécrit un ou plusieurs textes selon la consigne ;
//   - image  : gpt-image-2 refait une image à partir de l'image d'origine et
//     des photos de référence (ton produit, ton logo…).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_MODEL = "gpt-5.4-mini";
const IMAGE_MODEL = "gpt-image-2";

function headers(key) {
  if (!key) throw new Error("Clé OpenAI absente : ajoute OPENAI_API_KEY dans .env.local.");
  return { Authorization: `Bearer ${key}` };
}

async function openaiError(res) {
  const body = await res.json().catch(() => ({}));
  return new Error(`OpenAI (${res.status}) : ${body.error?.message ?? "erreur inconnue"}`);
}

// items : [{ id, text }] — le texte peut contenir des <span style> et <br>.
// references : data URLs d'images (le produit, la cible…) que le modèle voit
// pour mieux coller aux textes (ton, vocabulaire, promesses réalistes).
// Règles d'écriture de la méthode (docs/regles-copy.md, tirées du skill
// landing-page-jeffrey-arsh) : relues à chaque appel, pour qu'une modification
// du fichier serve tout de suite. Pas pour une traduction (regles: false).
const RULES_FILE = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "docs", "regles-copy.md");
async function copyRules() {
  try {
    // Sans le titre ni la note du haut (destinés aux humains).
    return (await readFile(RULES_FILE, "utf8")).replace(/^#[^\n]*\n\n(>[^\n]*\n)+/, "").trim();
  } catch {
    return "";
  }
}

export async function rewriteTexts({ key, items, prompt, contexte = {}, references = [], regles = true }) {
  if (!items?.length) return [];
  const rules = regles ? await copyRules() : "";
  const system = [
    "Tu es rédacteur publicitaire (direct response) pour des pages de vente et des advertorials.",
    "On te donne des textes d'une page, chacun avec un identifiant, et une consigne de modification.",
    "Réécris chaque texte selon la consigne. Règles :",
    "- garde à peu près la même longueur que l'original (la mise en page en dépend), sauf si la consigne demande autre chose ;",
    "- garde la même langue que l'original, sauf si la consigne demande une autre langue ;",
    "- garde les balises <span style=\"…\"> et <br> : entoure les mots équivalents avec les mêmes balises, ne crée pas d'autres balises ;",
    "- n'invente pas de chiffres, d'études ni d'avis clients qui ne sont pas dans les textes ou le contexte ;",
    "- un texte très court (bouton, étiquette, date, nom) reste très court ;",
    "- les textes forment une même page : reste cohérent d'un texte à l'autre.",
    references.length
      ? "- des photos de référence accompagnent la consigne : le produit, la cible ou l'univers. Décris-les fidèlement (nom du produit, usage, bénéfices visibles) sans inventer de chiffres."
      : "",
    rules
      ? `- chaque texte peut avoir un « role » (Titre H1, Titre H2, Bouton, Texte…) : applique la règle de ce rôle ci-dessous ; la consigne de l'utilisateur prime sur ces règles.\n\n${rules}\n`
      : "",
    'Réponds uniquement en JSON : {"items":[{"id":"…","text":"…"}]} avec tous les identifiants reçus.',
  ].filter(Boolean).join("\n");
  const userText = JSON.stringify({ consigne: prompt, contexte, textes: items.map(({ id, text, role }) => (role ? { id, role, text } : { id, text })) });
  const user = references.length
    ? [
        { type: "text", text: userText },
        ...references.slice(0, 6).map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : userText;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { ...headers(key), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw await openaiError(res);
  const body = await res.json();
  const out = JSON.parse(body.choices?.[0]?.message?.content ?? "{}").items ?? [];
  const byId = new Map(out.map((x) => [String(x.id), x.text]));
  return items.map(({ id, text }) => ({ id, text: byId.get(String(id)) ?? text }));
}

// Image du projet ou de l'import (/imports/…, /medias/…) ou data URL → Blob.
async function blobOf(root, src) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(src ?? "");
  if (m) return new Blob([Buffer.from(m[2], "base64")], { type: m[1] });
  if (!/^\/(imports|medias)\//.test(src ?? "")) throw new Error(`Image introuvable : ${src}`);
  const file = normalize(join(root, src.split("?")[0]));
  if (!file.startsWith(normalize(root)) || !existsSync(file)) throw new Error(`Image introuvable : ${src}`);
  const type = /\.jpe?g$/i.test(file) ? "image/jpeg" : /\.webp$/i.test(file) ? "image/webp" : "image/png";
  return new Blob([await readFile(file)], { type });
}

// Format le plus proche de l'image d'origine parmi ceux du modèle.
function sizeFor(width, height) {
  if (!width || !height) return "1024x1024";
  const r = width / height;
  if (r > 1.25) return "1536x1024";
  if (r < 0.8) return "1024x1536";
  return "1024x1024";
}

// folder (2026-11-09) : { dir, url } du dossier où ranger l'image (dossier
// « images-creees » du projet) ; sans lui, medias/<page>/ comme avant.
export async function reworkImage({ key, root, page, source, prompt, references = [], width, height, folder = null }) {
  const fd = new FormData();
  fd.append("model", IMAGE_MODEL);
  fd.append(
    "prompt",
    [
      "Refais cette image (la première image) en suivant la consigne, en gardant son cadrage et son usage dans une page de vente.",
      references.length ? "Les images suivantes sont les références du produit : reproduis le produit fidèlement (forme, couleurs, étiquette, logo)." : "",
      `Consigne : ${prompt}`,
      "Photo réaliste, qualité publicitaire. N'ajoute pas de texte qui n'est pas demandé.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  fd.append("size", sizeFor(width, height));
  fd.append("quality", "medium");
  const images = [source, ...references].filter(Boolean).slice(0, 8);
  for (const [i, src] of images.entries()) fd.append("image[]", await blobOf(root, src), `image-${i}.png`);
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: headers(key), body: fd });
  if (!res.ok) throw await openaiError(res);
  const body = await res.json();
  const dir = folder?.dir ?? join(root, "medias", page);
  await mkdir(dir, { recursive: true });
  const file = `ia-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}.png`;
  await writeFile(join(dir, file), Buffer.from(body.data[0].b64_json, "base64"));
  return { url: `${folder?.url ?? `/medias/${page}`}/${file}` };
}

// « Reconstruire avec l'IA » : la section redessinée selon la consigne (et une
// image de référence facultative). Retourne { html, css } : une seule racine
// .ROOT, CSS préfixé par .ROOT, textes et images gardés sauf consigne contraire.
export async function rebuildSection({ key, html, css, prompt, reference, rootClass }) {
  // Si la consigne fait écrire des textes (section adaptée à un produit,
  // ajoutée par le Score de vente) : mêmes règles d'écriture que les réécritures.
  const writes = /r[ée]écri|textes? pour|produit «/i.test(prompt ?? "");
  const rules = writes ? await copyRules() : "";
  const system = [
    "Tu es intégrateur web pour des pages de vente Shopify.",
    "On te donne le HTML et le CSS actuels d'une section de page, et une consigne.",
    `Rends une nouvelle version de la section : une seule racine <div class="${rootClass}">…</div>.`,
    `Toutes les règles CSS commencent par .${rootClass} ; ajoute les règles mobiles dans @media (max-width: 749px).`,
    "Garde tous les textes et toutes les images (mêmes valeurs src) sauf si la consigne dit autre chose.",
    "N'utilise que des balises HTML simples (div, section, h1-h4, p, span, strong, em, a, ul, li, img, button) ; pas de script, pas de style en ligne, pas d'autre ressource externe.",
    "Polices : var(--atl-font-heading, inherit) pour les titres, var(--atl-font-body, inherit) pour le texte.",
    // Carrousel : réglable ensuite dans l'atelier (src/engine/carrousel.js).
    'Si la section contient un carrousel (slider) : la piste qui défile porte data-atl-car="track" (display:flex; overflow-x:auto; scroll-snap-type:x mandatory), chaque diapo en est un enfant direct ; ni flèches ni points (l\'atelier les ajoute).',
    rules ? `Pour les textes que tu écris, suis ces règles :\n\n${rules}\n` : "",
    'Réponds uniquement en JSON : {"html":"…","css":"…"}.',
  ].filter(Boolean).join("\n");
  const content = [{ type: "text", text: JSON.stringify({ consigne: prompt, html: html.slice(0, 60000), css: css.slice(0, 40000) }) }];
  if (reference) content.push({ type: "image_url", image_url: { url: reference } });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { ...headers(key), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.4",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw await openaiError(res);
  const body = await res.json();
  const out = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
  if (!out.html) throw new Error("L'IA n'a pas rendu de section.");
  return { html: out.html, css: out.css ?? "" };
}

// Édition d'image brute (Studio d'images) : images = chemins locaux absolus,
// la première est l'image à refaire, les suivantes des références.
export async function editImageFiles({ key, files, prompt, size = "1024x1024", quality = "medium" }) {
  const fd = new FormData();
  fd.append("model", IMAGE_MODEL);
  fd.append("prompt", prompt);
  fd.append("size", size);
  fd.append("quality", quality);
  for (const [i, file] of files.slice(0, 8).entries()) {
    const type = /\.jpe?g$/i.test(file) ? "image/jpeg" : /\.webp$/i.test(file) ? "image/webp" : "image/png";
    fd.append("image[]", new Blob([await readFile(file)], { type }), `image-${i}.png`);
  }
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: headers(key), body: fd });
  if (!res.ok) throw await openaiError(res);
  const body = await res.json();
  return Buffer.from(body.data[0].b64_json, "base64");
}

export { sizeFor };

// ---- Studio d'images en direct (2026-11-11, comme « Image Mirror » de
// Whitelabeler) : l'atelier appelle ce module image par image, sans passer par
// une demande traitée par Claude. Deux modèles : gpt-image-2 (OpenAI) et Nano
// Banana (Gemini « gemini-3.1-flash-image », clé GEMINI_API_KEY).
export const STUDIO_MODELS = {
  "gpt-image-2": { label: "GPT Image 2 (OpenAI)", prix: 0.05 },
  "nano-banana": { label: "Nano Banana (Google)", prix: 0.04, id: "gemini-3.1-flash-image" },
  "nano-banana-pro": { label: "Nano Banana Pro (Google)", prix: 0.13, id: "gemini-3-pro-image" },
};

// Consigne d'une image : la photo d'origine (image 1) refaite avec le produit
// et la marque de l'utilisateur (images suivantes), ou transformée en pub.
// refs : [{ groupe: "produit" | "marque", etiquette }] dans l'ordre d'envoi.
export function studioPrompt(o) {
  const product = o.produit || "the product";
  const refs = (o.refs ?? []).map((r, i) => `#${i + 2} = ${r.groupe === "marque" ? "Brand" : "Product"} · ${r.etiquette ?? ""}`).join(", ");
  const colors = o.marque?.couleurs ? Object.entries(o.marque.couleurs).map(([r, c]) => `${r} ${c}`).join(", ") : "";
  const fonts = o.marque?.polices ? Object.values(o.marque.polices).filter(Boolean).join(" / ") : "";
  const pub = o.mode === "pub";
  if (o.affiner) {
    return [
      "Edit image #1 (an image already made for this product) following the instruction below. Keep everything else exactly as it is: composition, people, setting, product, text.",
      refs ? `Images after #1 are the user's references (${refs}): the product must keep looking exactly like the Product references.` : "",
      `Instruction: ${o.affiner}.`,
      "Output ONLY the edited image, same aspect ratio. No board, no labels, no split screen.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    "Image #1 is the ORIGINAL photo from another brand's sales page.",
    refs ? `The next images are the user's own references: ${refs}.` : "",
    pub
      ? `Turn image #1 into a scroll-stopping social media AD (${o.format ?? "4:5"}), keeping its idea: bold, clean layout, product as the hero.`
      : "Recreate image #1 faithfully: same composition, framing, pose, setting, lighting and mood. People may look different but must play the same role.",
    `Replace the product shown in the original with the user's product "${product}" exactly as it looks in the Product references (shape, colours, label, packaging).`,
    // Essai du 2026-11-11 : sur une photo sans produit, le modèle en ajoutait
    // un à la place d'une vignette.
    pub ? "" : "If image #1 shows no product or packaging at all, do NOT add one: keep every element, only replace brand names and logos.",
    o.description ? `What the product is: ${o.description}.` : "",
    "Brand: use the logo and style of the Brand references; never keep the original brand name, logo or packaging.",
    colors ? `Brand colours: ${colors}.` : "",
    fonts ? `Brand fonts (for any text): ${fonts}.` : "",
    `Rewrite EVERY piece of visible text (labels, packaging, signs, captions) so it names "${product}" or is neutral; no other brand name may stay readable.`,
    o.textes ? `Exact text changes: ${o.textes}.` : "",
    pub && o.accroche ? `Headline written on the ad, large and legible: "${o.accroche}".` : "",
    pub && o.cta ? `Call-to-action button on the ad: "${o.cta}".` : "",
    o.brief ? `Purpose of this image on the page: ${o.brief}.` : "",
    o.consigne ? `Extra instruction: ${o.consigne}.` : "",
    "Never add a rating, a number of reviews, a price, a certification or a medical claim that is not already in image #1.",
    pub
      ? "Output ONLY the finished ad, as one single image. No board, no labels, no split screen."
      : "Output ONLY the recreated photo, as one single image with the same aspect ratio as image #1. No board, no labels, no split screen.",
  ]
    .filter(Boolean)
    .join(" ");
}

// Format Gemini le plus proche (rapports acceptés par le modèle).
function aspectFor(width, height) {
  const ratios = { "1:1": 1, "4:5": 0.8, "5:4": 1.25, "3:4": 0.75, "4:3": 4 / 3, "2:3": 2 / 3, "3:2": 1.5, "9:16": 9 / 16, "16:9": 16 / 9, "21:9": 21 / 9 };
  const r = width && height ? width / height : 1;
  return Object.entries(ratios).sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0][0];
}

// Une image du Studio. source : image à refaire (/imports/…, /medias/… ou data
// URL) ; references : idem, produit d'abord puis marque. Range le résultat dans
// folder ({ dir, url }) et rend { url, modele, note }.
export async function studioImage({ openaiKey, geminiKey, root, source, references = [], prompt, width, height, format, model = "gpt-image-2", folder, quality = "medium" }) {
  const all = [source, ...references].filter(Boolean).slice(0, 8);
  const blobs = await Promise.all(all.map((s) => blobOf(root, s)));
  let png;
  let note = "";
  const PUB = { "1:1": [1024, 1024], "4:5": [1024, 1280], "9:16": [1024, 1820] };
  const [w, h] = format && PUB[format] ? PUB[format] : [width, height];
  if (model.startsWith("nano-banana")) {
    if (!geminiKey) throw new Error("Clé Google absente : ajoute GEMINI_API_KEY dans .env.local.");
    const parts = [{ text: prompt }];
    for (const b of blobs) parts.push({ inline_data: { mime_type: b.type || "image/png", data: Buffer.from(await b.arrayBuffer()).toString("base64") } });
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${STUDIO_MODELS[model].id}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: aspectFor(w, h) } } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body.error?.message ?? "erreur inconnue";
      throw new Error(/quota|billing|limit: 0/i.test(msg) ? "Google refuse : la génération d'images demande la facturation activée sur ton projet Google (AI Studio → Billing)." : `Google (${res.status}) : ${msg.slice(0, 200)}`);
    }
    const out = body.candidates?.[0]?.content?.parts ?? [];
    const img = out.find((p) => p.inline_data || p.inlineData);
    note = out.map((p) => p.text ?? "").join(" ").trim().slice(0, 400);
    if (!img) throw new Error(`Google n'a pas rendu d'image${note ? ` : ${note.slice(0, 160)}` : " (refus du modèle ?)"}.`);
    png = Buffer.from((img.inline_data ?? img.inlineData).data, "base64");
  } else if (!blobs.length) {
    // Canvas sans image de référence : création pure (2026-11-11).
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { ...headers(openaiKey), "Content-Type": "application/json" },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: sizeFor(w, h), quality: ["low", "medium", "high"].includes(quality) ? quality : "medium" }),
    });
    if (!res.ok) throw await openaiError(res);
    const body = await res.json();
    png = Buffer.from(body.data[0].b64_json, "base64");
  } else {
    const fd = new FormData();
    fd.append("model", IMAGE_MODEL);
    fd.append("prompt", prompt);
    fd.append("size", sizeFor(w, h));
    fd.append("quality", ["low", "medium", "high"].includes(quality) ? quality : "medium");
    for (const [i, b] of blobs.entries()) fd.append("image[]", b, `image-${i}.png`);
    const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: headers(openaiKey), body: fd });
    if (!res.ok) throw await openaiError(res);
    const body = await res.json();
    png = Buffer.from(body.data[0].b64_json, "base64");
  }
  await mkdir(folder.dir, { recursive: true });
  const file = `studio-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}.png`;
  await writeFile(join(folder.dir, file), png);
  return { url: `${folder.url}/${file}`, modele: model, note };
}

// ---- Canvas (2026-11-11) ----
// « Créer une image » : la consigne de l'utilisateur, plus les garde-fous
// (produit fidèle aux références, aucune preuve inventée).
export function canvasPrompt({ prompt, produit = "", description = "", nbRefs = 0, type = "image" }) {
  const lines = [String(prompt ?? "").trim() || "A clean, realistic e-commerce photo of the product."];
  if (produit) lines.push(`The product is "${produit}"${description ? ` (${String(description).slice(0, 300)})` : ""}.`);
  if (nbRefs) lines.push(`The ${nbRefs} attached image(s) are references. Wherever the product appears, reproduce it exactly as shown in them: same shape, colours, materials, packaging and logo. Use them for style and mood too when relevant.`);
  if (type === "infographie") lines.push("Make it a clean infographic: clear layout, few short labels, generous spacing, legible type.");
  lines.push("Never invent text claims, certifications, awards, ratings, review counts, prices or numbers. Keep any text in the image short and only from the instruction. No watermark.");
  return lines.join("\n");
}

// « Section images » (phase 3) : une consigne d'image par section, écrite
// d'après le rôle de la section, ses textes, le produit et les Fondations.
// sections : [{ id, numero, role, textes: [..], format, aDejaUneImage }].
// Rend [{ id, prompt }] (consignes en anglais pour les modèles d'image).
export async function sectionImagePrompts({ key, produit = "", description = "", pageType = "", fondations = null, type = "image", nbRefs = 0, sections = [] }) {
  if (!sections.length) return [];
  const system = [
    "You are an art director for direct-response e-commerce pages (product pages, landing pages, advertorials, listicles).",
    "For each section of the page you receive its role, its copy and the image format. Write ONE image-generation prompt per section, in English, that makes an image doing that section's job.",
    "Rules:",
    "- The image must illustrate what THIS section says (its promise, problem, mechanism, result, ingredient, step, social context…), not a generic product shot. Pick a concrete scene: who, where, what they do, mood, light, camera angle, composition that fits the format.",
    nbRefs
      ? `- ${nbRefs} reference picture(s) of the product/brand will be attached at generation time. Refer to the product as "the product from the reference pictures" and never describe a different product.`
      : "- No product reference picture will be attached: avoid close-ups of the product's packaging; prefer people, context and benefits.",
    type === "infographie"
      ? "- Each image is an INFOGRAPHIC: clean layout, a few short labels written in the page's language and taken only from the section copy, icons or arrows, generous spacing."
      : "- Each image is a PHOTO (photorealistic, editorial or UGC style as fits). No text in the image unless the section is about packaging.",
    "- Never invent claims, numbers, percentages, ratings, review counts, certifications, awards, doctors or prices. No watermark, no logos other than the product's own.",
    "- Respect the Fondations (central message, allowed proofs, forbidden wording) when given; do not contradict them.",
    "- 40 to 90 words per prompt. Each prompt stands alone (it will be sent without the others).",
    'Answer only in JSON: {"prompts":[{"id":"…","prompt":"…"}]} with every id received.',
  ].join("\n");
  const user = JSON.stringify({ produit, description: String(description).slice(0, 600), typeDePage: pageType, fondations, sections });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { ...headers(key), "Content-Type": "application/json" },
    body: JSON.stringify({ model: TEXT_MODEL, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) throw await openaiError(res);
  const body = await res.json();
  const out = JSON.parse(body.choices?.[0]?.message?.content ?? "{}").prompts ?? [];
  const byId = new Map(out.map((x) => [String(x.id), String(x.prompt ?? "").trim()]));
  return sections.map((s) => ({ id: s.id, prompt: byId.get(String(s.id)) ?? "" }));
}

// « Retirer le fond » : sujet gardé, fond transparent (gpt-image-2). Si le
// modèle refuse la transparence, fond blanc uni.
export async function detourerImage({ openaiKey, root, source, folder }) {
  const blob = await blobOf(root, source);
  const once = async (transparent) => {
    const fd = new FormData();
    fd.append("model", IMAGE_MODEL);
    fd.append("prompt", transparent ? "Remove the background completely. Keep the main subject exactly as it is (shape, colours, details, text, logo), centered, nothing added. Transparent background." : "Remove the background completely. Keep the main subject exactly as it is (shape, colours, details, text, logo), nothing added. Replace the background with pure flat white #FFFFFF.");
    fd.append("quality", "medium");
    if (transparent) {
      fd.append("background", "transparent");
      fd.append("output_format", "png");
    }
    fd.append("image[]", blob, "image.png");
    return fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: headers(openaiKey), body: fd });
  };
  let res = await once(true);
  let transparent = true;
  if (!res.ok && res.status === 400) {
    const txt = await res.clone().text();
    if (/background|transparen|output_format/i.test(txt)) {
      transparent = false;
      res = await once(false);
    }
  }
  if (!res.ok) throw await openaiError(res);
  const body = await res.json();
  await mkdir(folder.dir, { recursive: true });
  const file = `detoure-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}.png`;
  await writeFile(join(folder.dir, file), Buffer.from(body.data[0].b64_json, "base64"));
  return { url: `${folder.url}/${file}`, transparent };
}

// ---- Auditer la page (menu ✨ IA) ----
// page : { type, achat, fiche (marque, produit, profil, infos), score (note,
// sections manquantes, croyances, textes à reprendre — calcul local du Score
// de vente), sections : [{ id, famille, nom, textes: [{ role, text }] }] }.
// La grille vient du skill landing-page-jeffrey-arsh (references/audit-cro.md).
const AUDIT_GRID = `Grille d'audit (dans l'ordre d'impact) :
A. Les 5 croyances : installée ? par quelle section ? Une croyance manquante = fuite.
B. Au-dessus de la ligne de flottaison (règle des 5 secondes) : qu'est-ce que c'est, pour qui, pourquoi m'en soucier, que faire ensuite ? Preuve sociale n°1 visible ; titre orienté résultat (pas une étiquette ni une formule poétique) ; sous-titre (méthode, différence, douleur levée) ; bouton visible et précis ; réassurance sous le bouton.
C. Confiance : avis vérifiables titrés par le résultat ; autorité (expert, fondateur, tests, presse avec citation) ; clarté (on comprend ce que c'est et comment ça marche) ; garantie près du prix.
D. Circulation : une idée par section ; le test des titres seuls (les titres racontent l'offre) ; boutons là où la croyance est la plus haute ; un seul objectif.
E. Bloc d'achat (produit, offre, landing) : étoiles et nombre d'avis, titre orienté résultat, description en puces, packs avec l'option recommandée mise en avant, réassurance sous le bouton.
Ne réclame pas une section inutile pour ce type de page. N'invente aucun chiffre ni avis : propose des emplacements à compléter.`;

// Fidélité aux Fondations (2026-11-10) : seulement si la page envoie
// « fondations » (page d'un projet dont le message central est rempli).
const AUDIT_FONDATIONS = `F. Fidélité aux Fondations du projet (champ « fondations » : messageCentral, preuvesAutorisees, offre, interdits, contenuPrevu). Les Fondations peuvent être dans une autre langue que la page : compare le sens, pas les mots.
- promesse : le haut de page porte-t-il la promesse du message central (ou celle de l'angle, sans la contredire) ?
- mecanisme : le mécanisme est-il expliqué, le même que dans les Fondations ?
- preuves : les 3 preuves du message central sont-elles utilisées ? Lesquelles manquent ?
- objections : les 3 objections sont-elles traitées (FAQ, garantie, texte) avec la réponse prévue ?
- offre : prix, packs, garantie et bonus de la page sont-ils ceux de l'offre ? Signale tout écart de chiffre.
- allegations : la page respecte-t-elle les « interdits » (formulations à ne jamais écrire, prudence des allégations) ?
nonAutorise : chaque chiffre, étude, avis, label, expert, garantie ou urgence écrit sur la page qui n'est ni dans preuvesAutorisees, ni dans offre, ni dans messageCentral (une preuve marquée manque: true n'est pas disponible). Cite le texte de la page tel quel, et dis pourquoi. Liste vide si tout est couvert.
chiffresHorsFondations : nombres relevés automatiquement sur la page et absents de toutes les Fondations (prix, %, durées, nombres d'avis ou de clients). Chacun est un écart à juger : un prix dans une autre monnaie, un nombre d'avis ou de clients d'une autre marque, une garantie d'une autre durée sont des restes du site d'origine. S'il y en a, le critère « offre » ne peut pas être « ok » si des prix ou une garantie en font partie, et les plus graves vont dans nonAutorise.
note : 100 = page entièrement fidèle ; retire des points pour chaque critère faible ou absent et pour chaque affirmation non autorisée.`;

export async function auditPage({ key, page }) {
  const rules = await copyRules();
  const fd = Boolean(page?.fondations);
  const system = [
    "Tu es expert en conversion (CRO) et rédacteur direct response pour l'e-commerce, méthode Jeffrey Park (Daydreamers) + Arsh, avec Hormozi et Corey Haines.",
    "On te donne une page de l'atelier : son type, la fiche de la marque, le résultat du Score de vente calculé localement, et ses sections avec leurs principaux textes.",
    "Fais l'audit de la page, en français, concret et court, en nommant les sections par leur nom et en disant où agir.",
    AUDIT_GRID,
    fd ? AUDIT_FONDATIONS : "",
    rules ? `Règles d'écriture à appliquer dans tes propositions :\n\n${rules}` : "",
    (fd
      ? 'Réponds uniquement en JSON, avec en plus de ce qui suit le champ "fondations":{"note":0,"points":[{"critere":"promesse|mecanisme|preuves|objections|offre|allegations","etat":"ok|faible|absente|ecart","comment":"…","ou":"nom de la section","sectionId":"… ou null"}],"nonAutorise":[{"texte":"…","pourquoi":"…","sectionId":"… ou null"}]}. '
      : "") +
    'Réponds uniquement en JSON : {"verdict":"2 phrases","croyances":[{"n":1,"etat":"ok|faible|absente","comment":"…"}],"gainsRapides":[{"quoi":"…","ou":"…","sectionId":"… ou null"}],"fortImpact":[{"quoi":"…","pourquoi":"…","ou":"…"}],"titres":["3 propositions de titre principal"],"boutons":["3 propositions de texte de bouton"],"tests":["3 idées de tests A/B, dans l\'ordre de priorité"]}',
  ]
    .filter(Boolean)
    .join("\n\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { ...headers(key), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(page).slice(0, 120000) },
      ],
    }),
  });
  if (!res.ok) throw await openaiError(res);
  const body = await res.json();
  return JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
}
