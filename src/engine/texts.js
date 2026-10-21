// Parcours des textes d'une page (réglages des sections et de leurs blocs).
// Ignore ce qui n'est pas du texte lu par le client : couleurs, liens,
// images, identifiants.
const NOT_TEXT = /^(#[0-9a-f]{3,8}|https?:|\/|data:|rgb|hsl)/i;
const SKIP_KEYS = new Set(["id", "design", "pageType", "pageAchat", "projet", "importSource"]);

export const isReaderText = (key, value) =>
  typeof value === "string" && value.trim() !== "" && !SKIP_KEYS.has(key) && !NOT_TEXT.test(value.trim());

// Applique fn(texte, chemin) à chaque texte et renvoie une copie de la page.
export function mapTexts(page, fn) {
  const walk = (value, key, path) => {
    if (Array.isArray(value)) return value.map((v, i) => walk(v, key, `${path}[${i}]`));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k, `${path}.${k}`)]));
    return isReaderText(key, value) ? fn(value, path) : value;
  };
  return {
    ...page,
    content: (page.content ?? []).map((item, i) => ({ ...item, props: walk(item.props, null, `${item.type}#${i}`) })),
  };
}

// Liste des textes de la page, section par section.
export function pageTexts(page) {
  const out = [];
  mapTexts(page, (text, path) => {
    out.push({ path, text });
    return text;
  });
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Garde la casse du mot trouvé : AURIVITA → CLEARFLOW, aurivita → clearflow.
function matchCase(found, replacement) {
  if (found === found.toUpperCase() && found !== found.toLowerCase()) return replacement.toUpperCase();
  if (found === found.toLowerCase()) return replacement.toLowerCase();
  if (found[0] === found[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

// pairs : [{ find, replace }]. Renvoie { page, count }.
export function rebrand(page, pairs, { keepCase = true } = {}) {
  const active = pairs.filter((p) => p.find.trim());
  let count = 0;
  const next = mapTexts(page, (text) => {
    let out = text;
    for (const { find, replace } of active) {
      const re = new RegExp(escapeRe(find.trim()), keepCase ? "gi" : "g");
      out = out.replace(re, (m) => {
        count++;
        return keepCase ? matchCase(m, replace) : replace;
      });
    }
    return out;
  });
  return { page: next, count };
}
