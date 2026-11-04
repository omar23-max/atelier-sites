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

export async function reworkImage({ key, root, page, source, prompt, references = [], width, height }) {
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
  const dir = join(root, "medias", page);
  await mkdir(dir, { recursive: true });
  const file = `ia-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}.png`;
  await writeFile(join(dir, file), Buffer.from(body.data[0].b64_json, "base64"));
  return { url: `/medias/${page}/${file}` };
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

export async function auditPage({ key, page }) {
  const rules = await copyRules();
  const system = [
    "Tu es expert en conversion (CRO) et rédacteur direct response pour l'e-commerce, méthode Jeffrey Park (Daydreamers) + Arsh, avec Hormozi et Corey Haines.",
    "On te donne une page de l'atelier : son type, la fiche de la marque, le résultat du Score de vente calculé localement, et ses sections avec leurs principaux textes.",
    "Fais l'audit de la page, en français, concret et court, en nommant les sections par leur nom et en disant où agir.",
    AUDIT_GRID,
    rules ? `Règles d'écriture à appliquer dans tes propositions :\n\n${rules}` : "",
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
