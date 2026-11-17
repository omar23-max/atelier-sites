// Charte complète (lot 2 « Design et palette », 2026-11-17).
//
// Appliquer un design.md ne recopiait que les couleurs des rôles et deux
// polices. La charte ajoute, sur les parties copiées des sites (meta.arbre),
// la typographie par rôle visuel (grand titre, titre de section, petit titre,
// sous-titre, texte), les boutons (principal, secondaire) et l'arrondi des
// cartes, tirés du bloc « styles » du design.md.
//
// Le résultat est rangé dans props.atl_charte de chaque section, au même
// format que atl_styles ({ cible: { écran: { partie: { propriété: valeur } } } }).
// frame.js le dessine AVANT atl_styles : les retouches faites à la main dans
// le panneau de style gardent toujours le dernier mot.
//
// Rôle visuel d'un élément : deviné d'après son nom dans la copie (« Titre H2 »,
// « Paragraphe », « Bouton (CTA) »…) et sa taille à l'écran (un grand texte
// posé dans un <p> est un titre) ; corrigeable dans l'inspecteur
// (props.atl_roles = { emplacement: rôle }).

export const ROLES_VISUELS = [
  { id: "h1", label: "Grand titre" },
  { id: "h2", label: "Titre de section" },
  { id: "h3", label: "Petit titre" },
  { id: "sousTitre", label: "Sous-titre / introduction" },
  { id: "texte", label: "Texte" },
  { id: "bouton", label: "Bouton principal" },
  { id: "bouton2", label: "Bouton secondaire" },
  { id: "aucun", label: "Aucun (garder tel quel)" },
];
export const roleLabel = (id) => ROLES_VISUELS.find((r) => r.id === id)?.label ?? "—";

// Taille sur téléphone = taille ordinateur × facteur (au moins 14 px).
const MOBILE = { h1: 0.62, h2: 0.7, h3: 0.83, sousTitre: 0.85, texte: 0.92 };
const STYLE_OF = { h1: "h1", h2: "h2", h3: "h3", sousTitre: "sousTitre", texte: "texte" };

const px = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const clean = (s) => String(s ?? "").replace(/['"\\;{}<>]/g, "").trim();
const family = (name) => (clean(name) ? `'${clean(name)}', sans-serif` : null);
const safe = (v) => (v == null || v === "" ? null : String(v).replace(/[;{}<>]/g, "").trim() || null);

// Bouton d'achat ou d'action : la copie nomme « Bouton (CTA) » tout ce qui
// est un <button> (croix de fermeture, onglets de filtre, logo…). On ne garde
// automatiquement que ce qui en a l'air : assez grand, avec un fond ou un
// contour, un verbe d'action, hors en-tête et pied de page. Le reste se règle
// à la main dans l'inspecteur.
const CTA_WORDS = /(^|[^a-zà-ÿ])(shop|buy|add|get|order|try|claim|start|join|subscribe|learn more|view|see|discover|grab|save|unlock|book|reserve|commander|acheter|ajouter|essayer|d[ée]couvr\w*|profite\w*|obtenir|je veux|r[ée]server|voir)([^a-zà-ÿ]|$)/i;
const NO_BUTTON_FAMILIES = new Set(["entete", "pied-de-page", "bandeaux"]);
const looksLikeCta = (m) => m && m.w >= 80 && m.h >= 28 && m.text.length >= 3 && m.text.length <= 40 && m.boxed && CTA_WORDS.test(m.text);

export function autoRole(leaf, measured = null, family = null) {
  const name = String(leaf?.name ?? "");
  const h = /^Titre H(\d)/.exec(name);
  if (h) return h[1] === "1" ? "h1" : h[1] === "2" ? "h2" : "h3";
  if (leaf?.type === "titre" || name === "Titre") return "h2";
  if (name === "Question") return "h3";
  if (leaf?.type === "bouton" || leaf?.type === "lien") return !NO_BUTTON_FAMILIES.has(family) && looksLikeCta(measured) ? "bouton" : null;
  if (leaf?.type === "texte" && /^(Paragraphe|Texte|Point de liste|Réponse)$/.test(name)) {
    const size = measured?.fontSize ?? 0;
    if (size >= 30) return "h2"; // grand texte posé dans un <p> ou un <div>
    if (size >= 19) return "sousTitre";
    return "texte";
  }
  return null;
}

// Mesure d'un élément de l'aperçu (taille du texte, display).
export const measureIn = (doc, sectionId) => (slot) => {
  const el = doc?.querySelector(`[data-atl-id="${CSS.escape(sectionId)}"] [data-atl-slot="${CSS.escape(slot)}"]`);
  if (!el) return null;
  const cs = el.ownerDocument.defaultView.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const filled = !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor) || cs.backgroundImage !== "none";
  const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none";
  return { fontSize: parseFloat(cs.fontSize) || 0, display: cs.display, w: r.width, h: r.height, text: (el.textContent ?? "").replace(/\s+/g, " ").trim(), boxed: filled || bordered };
};

function leavesAndCards(arbre) {
  const leaves = [];
  const cards = [];
  (function walk(n) {
    if (!n) return;
    if (n.group) {
      if (n.kind === "carte" && n.gid) cards.push(n.gid);
      (n.children ?? []).forEach(walk);
    } else if (n.slot) leaves.push(n);
  })(arbre);
  return { leaves, cards };
}

// opts : { couleurs, familles, typo, boutons, formes, proportions }
function declsFor(role, design, opts, measured) {
  const styles = design?.tokens?.styles ?? {};
  const couleurs = design?.tokens?.couleurs ?? {};
  const polices = design?.tokens?.polices ?? {};
  const out = { all: {}, d: {}, m: {} };
  const isButton = role === "bouton" || role === "bouton2";
  if (!isButton) {
    const st = styles[STYLE_OF[role]];
    if (opts.familles) {
      const f = family(role === "texte" ? polices.texte : polices.titres || polices.texte);
      if (f) out.all["font-family"] = f;
    }
    if (opts.typo && st) {
      if (safe(st.graisse)) out.all["font-weight"] = safe(st.graisse);
      if (safe(st.interligne)) out.all["line-height"] = safe(st.interligne);
      if (safe(st.espacement)) out.all["letter-spacing"] = safe(st.espacement);
      if (safe(st.casse)) out.all["text-transform"] = safe(st.casse);
      const size = px(st.taille);
      if (!opts.proportions && size) {
        out.d["font-size"] = `${size}px`;
        out.m["font-size"] = `${Math.max(14, Math.round(size * (MOBILE[role] ?? 0.9)))}px`;
      }
    }
    return out;
  }
  if (!opts.boutons && !opts.familles) return out;
  const st = styles.bouton ?? {};
  if (opts.familles) {
    const p = clean(st.police) && [polices.titres, polices.texte].map(clean).includes(clean(st.police)) ? st.police : polices.texte || polices.titres;
    const f = family(p);
    if (f) out.all["font-family"] = f;
  }
  if (!opts.boutons) return out;
  const fond = couleurs.bouton || st.fond;
  const texte = couleurs["bouton-texte"] || st.couleur;
  if (opts.couleurs && role === "bouton") {
    if (safe(fond)) out.all["background-color"] = safe(fond);
    if (safe(texte)) out.all.color = safe(texte);
    if (safe(fond)) out.all["border-color"] = safe(fond);
  }
  if (opts.couleurs && role === "bouton2") {
    out.all["background-color"] = "transparent";
    if (safe(fond)) out.all.color = safe(fond);
    if (safe(fond)) out.all.border = `1.5px solid ${safe(fond)}`;
  }
  if (px(st.rayon) != null) out.all["border-radius"] = `${px(st.rayon)}px`;
  if (safe(st.marges) && /^[\d.\spx]+$/.test(st.marges)) out.all.padding = safe(st.marges);
  if (px(st.hauteur)) {
    out.all["min-height"] = `${px(st.hauteur)}px`;
    out.all["box-sizing"] = "border-box";
    if (measured?.display === "inline") {
      out.all.display = "inline-flex";
      out.all["align-items"] = "center";
      out.all["justify-content"] = "center";
    }
  }
  if (safe(st.graisse)) out.all["font-weight"] = safe(st.graisse);
  if (px(st.taille)) out.all["font-size"] = `${px(st.taille)}px`;
  if (safe(st.casse)) out.all["text-transform"] = safe(st.casse);
  if (safe(st.espacement)) out.all["letter-spacing"] = safe(st.espacement);
  return out;
}

const pack = (o) => {
  const res = {};
  for (const dev of ["all", "d", "m"]) if (Object.keys(o[dev]).length) res[dev] = { base: o[dev] };
  return Object.keys(res).length ? res : null;
};

// Charte d'une section copiée : { cible: { écran: { base: {…} } } } et le
// décompte par rôle (pour le bilan).
export function charteForItem(item, section, design, opts, measure = () => null) {
  if (!section?.meta?.arbre) return { charte: null, count: {} };
  const { leaves, cards } = leavesAndCards(section.meta.arbre);
  const fixed = item.props?.atl_roles ?? {};
  const charte = {};
  const count = {};
  for (const leaf of leaves) {
    const measured = measure(leaf.slot);
    const role = fixed[leaf.slot] || autoRole(leaf, measured, section.meta.family);
    if (!role || role === "aucun") continue;
    const key = (role === "bouton" || role === "bouton2") && leaf.lien ? leaf.lien : leaf.slot;
    const body = pack(declsFor(role, design, opts, measured));
    if (!body) continue;
    charte[key] = body;
    count[role] = (count[role] ?? 0) + 1;
  }
  const r = px(design?.tokens?.styles?.bouton?.rayon);
  if (opts.formes && r != null) {
    const radius = `${Math.min(24, Math.round(r * 1.5))}px`;
    for (const gid of cards) {
      charte[gid] = { all: { base: { "border-radius": radius } } };
      count.carte = (count.carte ?? 0) + 1;
    }
  }
  return { charte: Object.keys(charte).length ? charte : null, count };
}

// Options selon la portée choisie dans Palette.
export function optionsFor(portee, cases = {}) {
  if (portee === "palette") return { couleurs: true, familles: false, typo: false, boutons: false, formes: false, proportions: true };
  if (portee === "polices") return { couleurs: true, familles: true, typo: false, boutons: false, formes: false, proportions: true };
  return {
    couleurs: cases.couleurs !== false,
    familles: Boolean(cases.typo),
    typo: Boolean(cases.typo),
    boutons: cases.boutons !== false,
    formes: cases.formes !== false,
    proportions: cases.proportions !== false,
  };
}

// Toute la page : sections avec leur charte, décompte total.
export function applyCharte(page, design, opts, sectionsById, measureFor = () => () => null, { effacer = false } = {}) {
  const total = {};
  const content = (page.content ?? []).map((item) => {
    const section = sectionsById[item.type];
    const { charte, count } = charteForItem(item, section, design, opts, measureFor(item.props.id));
    for (const [k, n] of Object.entries(count)) total[k] = (total[k] ?? 0) + n;
    const props = { ...item.props };
    if (charte) props.atl_charte = charte;
    else delete props.atl_charte;
    if (effacer && charte && props.atl_styles) {
      const styles = { ...props.atl_styles };
      for (const k of Object.keys(charte)) delete styles[k];
      props.atl_styles = styles;
    }
    return { ...item, props };
  });
  return { page: { ...page, content }, total };
}
