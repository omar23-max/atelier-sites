// « Retravailler avec l'IA » : appels OpenAI faits par le serveur local de
// l'atelier (la clé OPENAI_API_KEY de .env.local ne quitte jamais le PC).
//   - textes : gpt-5.4-mini réécrit un ou plusieurs textes selon la consigne ;
//   - image  : gpt-image-2 refait une image à partir de l'image d'origine et
//     des photos de référence (ton produit, ton logo…).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, normalize } from "node:path";

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
export async function rewriteTexts({ key, items, prompt, contexte = {} }) {
  if (!items?.length) return [];
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
    'Réponds uniquement en JSON : {"items":[{"id":"…","text":"…"}]} avec tous les identifiants reçus.',
  ].join("\n");
  const user = JSON.stringify({ consigne: prompt, contexte, textes: items.map(({ id, text }) => ({ id, text })) });
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
