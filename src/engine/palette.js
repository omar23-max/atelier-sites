// Palettes : extraire les couleurs d'un logo, puis répartir une palette sur
// les 13 rôles d'un design.md (fond, texte, accent, bouton, fond sombre…).

const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const rgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminance = (h) => {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const saturation = (h) => {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};
const distance = (a, b) => {
  const x = rgb(a);
  const y = rgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
// Mélange a vers b (t = 0 → a, t = 1 → b).
export const mix = (a, b, t) => {
  const x = rgb(a);
  const y = rgb(b);
  return hex(...x.map((v, i) => v + (y[i] - v) * t));
};
const contrastText = (bg) => (luminance(bg) > 0.45 ? "#111111" : "#ffffff");

// Couleurs dominantes d'une image (logo) : regroupement par cases de couleur,
// sans les pixels transparents ; renvoie au plus `count` couleurs distinctes.
export async function extractPalette(src, count = 6) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image illisible"));
    el.src = src;
  });
  const size = 120;
  const scale = Math.min(1, size / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4);
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
    buckets.set(key, b);
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).map((b) => hex(b.r / b.n, b.g / b.n, b.b / b.n));
  const picked = [];
  for (const c of sorted) {
    if (picked.every((p) => distance(p, c) > 48)) picked.push(c);
    if (picked.length >= count) break;
  }
  return picked;
}

// Palette libre (2 à 8 couleurs) → les 13 rôles d'un design.md.
export function paletteToRoles(colors, base = {}) {
  const list = [...new Set(colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map((c) => c.toLowerCase()))];
  if (!list.length) return base;
  const byLum = [...list].sort((a, b) => luminance(b) - luminance(a));
  const lightest = byLum[0];
  const darkest = byLum[byLum.length - 1];
  // Accent : la couleur la plus vive parmi celles ni trop sombres ni trop claires.
  const vivid = (c) => saturation(c) * (1 - Math.min(1, Math.abs(Math.sqrt(luminance(c)) - 0.45) * 1.6));
  const middle = list.filter((c) => c !== lightest && c !== darkest);
  const accent = [...(middle.length ? middle : list)].sort((a, b) => vivid(b) - vivid(a))[0];
  const fond = luminance(lightest) > 0.75 ? lightest : "#ffffff";
  const texte = luminance(darkest) < 0.08 ? darkest : mix(darkest, "#000000", 0.6);
  const sombres = list.filter((c) => luminance(c) < 0.12 && c !== texte && c !== accent);
  // Fond sombre : une couleur de la palette plus sombre que l'accent, sinon l'accent assombri.
  const fondSombre = sombres.sort((a, b) => luminance(a) - luminance(b)).find((c) => luminance(c) < luminance(accent)) ?? mix(accent, "#000000", 0.55);
  return {
    ...base,
    fond,
    surface: mix(fond, accent, 0.06),
    "surface-forte": mix(fond, accent, 0.18),
    texte,
    accent,
    "accent-clair": mix(accent, "#ffffff", 0.45),
    bouton: accent,
    "bouton-texte": contrastText(accent),
    "fond-sombre": fondSombre,
    "fond-sombre-2": mix(fondSombre, accent, 0.35),
    "surface-sombre": mix(fondSombre, "#ffffff", 0.12),
    "texte-sur-sombre": "#ffffff",
    etoiles: base.etoiles ?? "#f5b301",
  };
}

// Texte d'un design.md créé depuis une palette (lisible + bloc de jetons).
export function designMarkdown({ title, origine, polices, couleurs }) {
  const lines = Object.entries(couleurs).map(([role, c]) => `- **${role}** : ${c}`);
  return `# ${title}

Créé dans l'atelier ${origine}.

## Typographie

- Titres : ${polices.titres ?? "—"}
- Texte : ${polices.texte ?? "—"}

## Couleurs

${lines.join("\n")}

## Jetons

\`\`\`json
${JSON.stringify({ polices, couleurs }, null, 2)}
\`\`\`
`;
}
