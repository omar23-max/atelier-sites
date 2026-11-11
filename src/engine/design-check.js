// Contrôle du design d'une page finie (2026-11-11), sans IA.
//
// La page ENREGISTRÉE est rendue comme à la publication (/partage/<page>
// ?reperes=1) dans deux cadres cachés : ordinateur (1440 × 900) et mobile
// (390 × 844). On y mesure ce qu'un client verrait :
//   - deborde    : la page dépasse à droite (défilement horizontal) ;
//   - coupe      : un texte coupé par son cadre ;
//   - image      : une image qui ne s'affiche pas ;
//   - contraste  : un texte trop pâle sur son fond (WCAG : 4,5 ; 3 pour un grand texte) ;
//   - petit      : un texte de moins de 12 px ;
//   - bouton     : (mobile) un bouton de moins de 40 px de haut ;
//   - cta        : le premier bouton n'est pas visible sans faire défiler ;
//   - titre      : (mobile) un grand titre sur plus de 4 lignes ;
//   - polices    : plus de 3 polices différentes dans la page.
// Chaque constat porte le rang de sa section (repères <template data-atl-sec>).
// Limites : les fonds en image ne permettent pas de calculer un contraste (ces
// textes sont sautés) ; les états au survol et les menus ouverts ne sont pas vus.

const VIEWPORTS = [
  { id: "ordi", label: "Ordinateur", width: 1440, height: 900 },
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseColor(v) {
  const m = /rgba?\(([^)]+)\)/.exec(v ?? "");
  if (!m) return null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
function luminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Mesures dans un document rendu (appelée pour chaque largeur).
function measure(win, vp) {
  const doc = win.document;
  const W = win.innerWidth;
  const issues = [];
  const add = (kind, el, text, detail) => issues.push({ kind, vue: vp.id, section: sectionOf(el), text: String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 90), detail });

  // Rang de la section : le dernier repère placé avant l'élément.
  const marks = [...doc.querySelectorAll("template[data-atl-sec]")];
  function sectionOf(el) {
    if (!el) return null;
    let n = null;
    for (const m of marks) {
      if (m.compareDocumentPosition(el) & 4) n = Number(m.getAttribute("data-atl-sec"));
      else break;
    }
    return n;
  }
  const css = (el) => win.getComputedStyle(el);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = css(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) < 0.05) return false;
    // Diapo ou panneau hors champ (carrousel, tiroir) : pas un défaut.
    return r.right > 0 && r.left < W;
  };
  const hiddenAncestor = (el) => {
    for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
      const s = css(p);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return true;
    }
    return false;
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
  const all = [...doc.body.querySelectorAll("*")].filter((el) => !["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "SVG", "PATH"].includes(el.tagName.toUpperCase()));

  // 1. La page dépasse à droite.
  const pageW = Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth);
  if (pageW > W + 2) {
    const culprits = all.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right <= W + 2 || r.left >= W) return false;
      // Dans une zone qui défile ou qui coupe (carrousel) : voulu.
      for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
        if (/auto|scroll|hidden|clip/.test(css(p).overflowX)) return false;
      }
      return true;
    });
    const outer = culprits.filter((el) => !culprits.includes(el.parentElement)).slice(0, 4);
    for (const el of outer) add("deborde", el, ownText(el) || el.innerText || el.tagName, `dépasse de ${Math.round(el.getBoundingClientRect().right - W)} px à droite`);
    if (!outer.length) issues.push({ kind: "deborde", vue: vp.id, section: null, text: "", detail: `la page fait ${pageW} px de large pour un écran de ${W} px` });
  }

  // Photos et vidéos de la page (position dans la page) : un texte posé dessus
  // (légende blanche sur une photo) n'a pas de fond calculable.
  const medias = [...doc.querySelectorAll("img, video, picture, canvas")]
    .map((m) => m.getBoundingClientRect())
    .filter((r) => r.width >= 60 && r.height >= 40)
    .map((r) => ({ l: r.left, t: r.top + win.scrollY, r: r.right, b: r.bottom + win.scrollY }));
  const onMedia = (r) => {
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2 + win.scrollY;
    return medias.some((m) => cx >= m.l && cx <= m.r && cy >= m.t && cy <= m.b);
  };
  // Onglets, accordéons, questions de FAQ : des boutons, mais pas l'appel à l'action.
  const isToggle = (el) => el.hasAttribute("aria-expanded") || el.hasAttribute("aria-controls") || el.getAttribute("role") === "tab" || el.hasAttribute("data-atl-q") || Boolean(el.closest("[data-atl-q], [role=tablist], summary, details"));
  const fonts = new Map();
  let firstCta = null;
  for (const el of all) {
    const tag = el.tagName.toUpperCase();
    if (tag === "IMG") {
      // 3. Image qui ne s'affiche pas.
      if (visible(el) && !hiddenAncestor(el) && el.complete && el.naturalWidth === 0 && el.getBoundingClientRect().width >= 40) add("image", el, el.alt || "image", "l'image ne s'affiche pas (vide ou lien cassé)");
      continue;
    }
    const text = ownText(el);
    const s = css(el);
    const r = el.getBoundingClientRect();
    const isButton = tag === "BUTTON" || el.getAttribute("role") === "button" || (tag === "A" && ((parseColor(s.backgroundColor)?.a ?? 0) > 0.5 || parseFloat(s.borderTopWidth) >= 1) && parseFloat(s.paddingLeft) >= 8);
    if (isButton && visible(el) && !hiddenAncestor(el)) {
      const label = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (label.length >= 2 && label.length <= 45) {
        // 6. Bouton trop petit pour le pouce (mobile).
        if (vp.id === "mobile" && r.height < 40 && r.width >= 40) add("bouton", el, label, `${Math.round(r.height)} px de haut (40 px au moins pour le pouce)`);
        const colored = (parseColor(s.backgroundColor)?.a ?? 0) > 0.5;
        const sec = sectionOf(el);
        // Premier vrai bouton de la page : coloré, le plus haut dans la page,
        // hors en-tête, et ni onglet ni question de FAQ.
        const top = r.top + win.scrollY;
        if (colored && !isToggle(el) && (sec == null || sec > 0 || top > 120) && (!firstCta || top < firstCta.top)) firstCta = { el, label, top, h: r.height };
      }
    }
    if (text.length < 2 || !visible(el) || hiddenAncestor(el)) continue;
    const size = parseFloat(s.fontSize);
    const family = s.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    if (family && !/icon|awesome|symbol|material/i.test(family)) fonts.set(family, (fonts.get(family) ?? 0) + text.length);

    // 2. Texte coupé par son cadre.
    if (/hidden|clip/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 3 && s.textOverflow !== "ellipsis") add("coupe", el, text, "le texte est coupé à droite");
    else if (/hidden|clip/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 6 && !s.webkitLineClamp?.match(/\d/) && el.clientHeight > 0 && el.clientHeight < 400) add("coupe", el, text, "le texte est coupé en bas");

    // 5. Texte trop petit.
    if (size < 12 && text.length >= 20) add("petit", el, text, `${Math.round(size * 10) / 10} px (12 px au moins)`);

    // 8. Grand titre sur trop de lignes (mobile).
    if (vp.id === "mobile" && /^H[12]$/.test(tag)) {
      const lh = parseFloat(s.lineHeight) || size * 1.2;
      const lines = Math.round(r.height / lh);
      if (lines > 4) add("titre", el, text, `sur ${lines} lignes au téléphone : raccourcis-le ou réduis sa taille`);
    }

    // 4. Contraste du texte sur son fond.
    const fg = parseColor(s.color);
    if (!fg || fg.a < 0.1 || onMedia(r)) continue;
    let bg = null;
    let unknown = false;
    for (let p = el; p; p = p.parentElement) {
      const ps = css(p);
      if (ps.backgroundImage && ps.backgroundImage !== "none") {
        unknown = true;
        break;
      }
      const c = parseColor(ps.backgroundColor);
      if (c && c.a > 0) {
        bg = bg ? over(bg, c) : c;
        if (c.a >= 0.99) break;
      }
      if (p === doc.documentElement) break;
    }
    if (unknown) continue;
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const back = bg ? (bg.a >= 0.99 ? bg : over(bg, white)) : white;
    const c = ratio(over(fg, back), back);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    // Sous 1,25 : texte presque de la couleur de son fond, c'est-à-dire en
    // pratique une légende posée sur une photo ou une vidéo que le calcul ne
    // voit pas (photo pas encore chargée, fond posé par un voisin) : sauté.
    if (c >= 1.25 && c < (large ? 3 : 4.5) - 0.05) add("contraste", el, text, `contraste ${c.toFixed(1)} : 1 (il faut ${large ? "3" : "4,5"} : 1)`);
  }

  // 7. Le premier bouton est-il visible sans défiler ?
  if (firstCta && firstCta.top + firstCta.h > vp.height) add("cta", firstCta.el, firstCta.label, `le premier bouton est à ${Math.round(firstCta.top)} px du haut : il faut faire défiler pour le voir (écran de ${vp.height} px)`);

  // 9. Trop de polices.
  const families = [...fonts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  if (families.length > 3) issues.push({ kind: "polices", vue: vp.id, section: null, text: families.join(", "), detail: `${families.length} polices différentes (2 ou 3 au plus)` });

  return { issues, hauteur: Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight), polices: families };
}

// Poids de chaque défaut dans la note, et plafond par type (une page avec 40
// petits textes ne tombe pas à zéro pour autant).
const WEIGHT = { deborde: [14, 28], image: [6, 24], coupe: [5, 15], contraste: [2, 20], cta: [10, 20], bouton: [2, 10], titre: [4, 8], petit: [1, 8], polices: [5, 5] };

export const KIND_LABEL = {
  deborde: "La page dépasse à droite",
  image: "Image qui ne s'affiche pas",
  coupe: "Texte coupé",
  contraste: "Texte trop pâle sur son fond",
  cta: "Premier bouton sous la ligne de flottaison",
  bouton: "Bouton trop petit pour le pouce",
  titre: "Titre trop long au téléphone",
  petit: "Texte trop petit",
  polices: "Trop de polices",
};

export async function runDesignCheck(pageName, onStep = () => {}) {
  const out = { vues: {}, issues: [], note: 100, le: new Date().toISOString() };
  for (const vp of VIEWPORTS) {
    onStep(`${vp.label} (${vp.width} px)…`);
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${vp.width}px;height:${vp.height}px;border:0;visibility:hidden;pointer-events:none`;
    document.body.appendChild(frame);
    try {
      await new Promise((resolve, reject) => {
        frame.onload = resolve;
        frame.onerror = () => reject(new Error("la page n'a pas pu être rendue"));
        frame.src = `/partage/${encodeURIComponent(pageName)}?reperes=1&t=${Date.now()}`;
        setTimeout(() => reject(new Error("la page met trop de temps à se charger")), 45000);
      });
      const win = frame.contentWindow;
      if (!win.document.querySelector("template[data-atl-sec]")) throw new Error(win.document.body?.innerText?.slice(0, 120) || "page vide");
      // Images chargées « à la demande » : on les demande toutes tout de suite
      // (pas de défilement pas à pas : dans un onglet en arrière-plan, le
      // navigateur ralentit les minuteries et le contrôle n'en finissait pas).
      for (const img of win.document.images) {
        if (img.loading === "lazy") img.loading = "eager";
      }
      await Promise.race([Promise.all([...win.document.images].filter((i) => !i.complete).map((i) => new Promise((r) => (i.onload = i.onerror = r)))), sleep(8000)]);
      await sleep(300);
      const m = measure(win, vp);
      out.vues[vp.id] = { hauteur: m.hauteur, polices: m.polices, constats: m.issues.length };
      out.issues.push(...m.issues);
    } finally {
      frame.remove();
    }
  }
  // Le même constat répété (5 fois « Verified Buyer » trop pâle) : une ligne, × 5.
  const grouped = new Map();
  for (const i of out.issues) {
    const key = [i.kind, i.vue, i.section, i.text, i.detail].join("|");
    if (grouped.has(key)) grouped.get(key).n++;
    else grouped.set(key, { ...i, n: 1 });
  }
  out.issues = [...grouped.values()];
  // Note : chaque défaut retire des points, avec un plafond par type.
  const byKind = {};
  for (const i of out.issues) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  let lost = 0;
  for (const [kind, n] of Object.entries(byKind)) {
    const [each, cap] = WEIGHT[kind] ?? [1, 5];
    lost += Math.min(cap, each * n);
  }
  out.note = Math.max(0, 100 - lost);
  out.parType = byKind;
  return out;
}
