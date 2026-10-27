// Couleurs « proches » d'un rôle du design.md.
//
// La copie ne relie à un rôle (fond, texte, bouton…) que les couleurs qui lui
// sont identiques ; les nuances voisines (gris de texte un peu plus clair, bleu
// des liens…) restaient figées et une nouvelle palette ne les changeait pas.
// Ici chaque couleur proche d'un rôle devient var(--atl-<rôle>-p, couleur
// d'origine). La section ne définit --atl-<rôle>-p que si la couleur du rôle a
// été changée : sans changement, la copie reste identique au pixel près.

const VAR = /var\(--atl-[a-z-]+,\s*(?:[^()]|\([^()]*\))*\)/g;
const COLOR = /rgba?\(\s*\d+,\s*\d+,\s*\d+(?:,\s*[\d.]+)?\s*\)|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;

function rgbOf(c) {
  let m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join("") : m[1];
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
}

const dist = (x, y) => Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
function saturation({ r, g, b }) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

// Le rôle d'une couleur : le plus proche (écart ≤ 48), sinon pour une couleur
// vive (liens, badges) l'accent, à défaut le bouton.
function roleFor(c, roles) {
  let best = null;
  for (const [role, hex] of Object.entries(roles)) {
    const d = dist(c, hex);
    if (d <= 48 && (!best || d < best.d)) best = { role, d };
  }
  if (best) return best.role;
  if (saturation(c) > 0.35) return roles.accent ? "accent" : roles.bouton ? "bouton" : null;
  return null;
}

const key = (r) => `role_${r.replace(/-/g, "_")}`;

// roles : { fond: "#ffffff", texte: "#262626", … } (valeurs d'origine).
export function withNearRoles({ css, template, roles }) {
  const parsed = Object.fromEntries(Object.entries(roles).map(([r, v]) => [r, rgbOf(v)]).filter(([, v]) => v));
  if (!Object.keys(parsed).length || /--atl-[a-z-]+-p:/.test(template)) return { css, template, count: 0 };
  const used = new Set();
  let count = 0;
  // Les couleurs déjà reliées à un rôle (dans var(…)) ne bougent pas.
  const kept = [];
  const masked = css.replace(VAR, (m) => `\u0000${kept.push(m) - 1}\u0000`);
  const out = masked.replace(COLOR, (m) => {
    const c = rgbOf(m);
    if (!c || c.a < 1) return m;
    const role = roleFor(c, parsed);
    if (!role) return m;
    used.add(role);
    count++;
    return `var(--atl-${role}-p, ${m})`;
  });
  const css2 = out.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[+i]);
  if (!used.size) return { css, template, count: 0 };
  // Variables définies seulement quand le rôle a changé de couleur.
  const defs = [...used]
    .map((r) => `--atl-${r}-p: {%- if section.settings.${key(r)} == blank or section.settings.${key(r)} == '${roles[r]}' -%}initial{%- else -%}{{ section.settings.${key(r)} }}{%- endif -%};`)
    .join(" ");
  const anchor = /(style="[^"]*?--atl-[a-z-]+: \{\{ section\.settings\.role_[a-z_]+ \}\};)/;
  if (!anchor.test(template)) return { css, template, count: 0 };
  return { css: css2, template: template.replace(anchor, `$1 ${defs}`), count };
}
