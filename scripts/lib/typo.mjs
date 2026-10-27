// Relevé des styles réels d'une page capturée (snapshot.json) pour son
// design.md : en-tête, grand titre, intertitres, sous-titre, texte, boutons.
// Pour chaque rôle, le style le plus fréquent parmi les éléments visibles.

const TRANSPARENT = /^(transparent|rgba\(0, 0, 0, 0\))$/;

function hex(rgb) {
  const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(rgb ?? "");
  if (!m) return rgb ?? null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
}

const family = (f) => (f ?? "").split(",")[0].replace(/["']/g, "").trim() || null;
const px = (v) => (v && v.endsWith("px") ? Math.round(parseFloat(v) * 10) / 10 : null);

function describe(n) {
  const s = n.style;
  const size = px(s["font-size"]);
  const lh = px(s["line-height"]);
  const out = {
    police: family(s["font-family"]),
    taille: size,
    graisse: Number(s["font-weight"]) || 400,
    interligne: lh && size ? Math.round((lh / size) * 100) / 100 : null,
    couleur: hex(s.color),
    casse: s["text-transform"] && s["text-transform"] !== "none" ? s["text-transform"] : null,
    espacement: s["letter-spacing"] && s["letter-spacing"] !== "normal" ? s["letter-spacing"] : null,
    exemple: (n.text ?? "").replace(/\s+/g, " ").trim().slice(0, 90),
  };
  const bg = TRANSPARENT.test(s["background-color"] ?? "") ? null : hex(s["background-color"]);
  if (bg) out.fond = bg;
  return out;
}

const visible = (n) => n.box && n.box.x > -1000 && n.box.w > 4 && n.box.h > 4 && n.style?.display !== "none" && (n.text ?? "").trim();
const key = (n) => [n.style["font-family"], n.style["font-size"], n.style["font-weight"], n.style.color].join("|");

// Le style le plus fréquent (à égalité : le premier rencontré).
function mode(list) {
  if (!list.length) return null;
  const counts = new Map();
  for (const n of list) counts.set(key(n), (counts.get(key(n)) ?? 0) + 1);
  let best = list[0];
  for (const n of list) if (counts.get(key(n)) > counts.get(key(best))) best = n;
  return best;
}

export function measureStyles(snap) {
  const nodes = (snap.nodes ?? []).filter(visible);
  const byTag = (...tags) => nodes.filter((n) => tags.includes(n.tag));
  const out = {};

  // En-tête : liens du haut de page (menu).
  const head = nodes.filter((n) => n.tag === "a" && n.box.y < 160 && (n.words ?? 9) <= 4);
  if (mode(head)) out.entete = describe(mode(head));

  // Grand titre : le h1, sinon le texte le plus grand du premier écran.
  const h1 = byTag("h1")[0] ?? [...nodes].filter((n) => n.box.y < 1000).sort((a, b) => px(b.style["font-size"]) - px(a.style["font-size"]))[0];
  if (h1) out.h1 = describe(h1);

  for (const t of ["h2", "h3"]) {
    const m = mode(byTag(t));
    if (m) out[t] = describe(m);
  }

  // Sous-titre : premier texte sous le grand titre, plus petit que lui.
  if (h1) {
    const sub = nodes.find(
      (n) => n.box.y > h1.box.y + h1.box.h - 4 && n.box.y < h1.box.y + h1.box.h + 220 && !/^h[1-3]$/.test(n.tag) && n.tag !== "a" && px(n.style["font-size"]) < px(h1.style["font-size"]) && (n.words ?? 0) >= 4,
    );
    if (sub) out.sousTitre = describe(sub);
  }

  const p = mode(byTag("p").filter((n) => (n.words ?? 0) >= 6));
  if (p) out.texte = describe(p);

  // Boutons : liens ou boutons à fond plein, de taille de bouton.
  const buttons = nodes.filter(
    (n) => ["a", "button"].includes(n.tag) && !TRANSPARENT.test(n.style["background-color"] ?? "") && n.box.h >= 28 && n.box.h <= 90 && n.box.w >= 80 && (n.words ?? 0) <= 8,
  );
  const b = mode(buttons);
  if (b) {
    out.bouton = describe(b);
    out.bouton.rayon = b.style["border-top-left-radius"] ?? null;
    out.bouton.hauteur = Math.round(b.box.h);
    out.bouton.marges = [b.style["padding-top"], b.style["padding-right"]].filter(Boolean).join(" ");
  }
  return out;
}
