// Réglages ajoutés par l'atelier à n'importe quelle section, sans toucher à son
// template. Mêmes règles dans l'aperçu (render.js, portée = classe du cadre) et
// sur Shopify (shopify.js, portée = #shopify-section-<id>, réglage atl_style).
//
// - fond_section, marge_haut, marge_bas : sections dont le template ne les gère pas ;
// - fonds_groupes (« g12=#f5f0e8;… ») : ancien réglage des fonds de colonne ;
// - atl_styles : styles par élément, par écran et par partie :
//     { <cible>: { <écran>: { <partie>: { propriété: valeur } } } }
//   cible  : « section », « g12 » (colonne, carte : data-atl-group), ou un
//            emplacement (« s40 », « i7 » : data-atl-slot) ;
//   écran  : « all » (tous), « d » (ordinateur, ≥ 750 px), « m » (mobile) ;
//   partie : « base », « hover » (survol), « before », « after » (puce, flèche,
//            séparateur), « kids » (enfants directs : colonnes d'un groupe) ;
// - atl_fond_image : image de fond de la section (url(@@IMG@@) dans atl_styles) ;
// - atl_animation : apparition au défilement (« fondu », « montee ») ;
// - atl_ancre : nom d'ancre (#offre) — posé par render.js / shopify.js.

export const parseGroupFills = (s) =>
  Object.fromEntries(
    String(s ?? "")
      .split(";")
      .map((p) => p.split("="))
      .filter(([g, c]) => /^g\d+$/.test(g ?? "") && c),
  );

export const writeGroupFills = (map) =>
  Object.entries(map)
    .filter(([, c]) => c)
    .map(([g, c]) => `${g}=${c}`)
    .join(";");

const safeColor = (c) => (/^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|transparent)$/i.test(String(c ?? "").trim()) ? String(c).trim() : null);
// Valeur CSS sans moyen de sortir de sa règle.
const safeValue = (v) => {
  const s = String(v ?? "").trim();
  return s && !/[{};<>]|\/\*/.test(s) ? s : null;
};
const safeProp = (p) => /^(--)?-?[a-z][a-z-]*$/.test(p);

export const DEVICES = ["all", "d", "m"];
export const PARTS = ["base", "hover", "before", "after", "kids"];
const MEDIA = { all: null, d: "@media (min-width: 750px)", m: "@media (max-width: 749px)" };
const SUFFIX = { base: "", hover: ":hover", before: "::before", after: "::after", kids: ">*" };

export function targetSelector(scope, target) {
  if (target === "section") return `${scope}>:not(style)`;
  if (/^g\d+$/.test(target)) return `${scope} [data-atl-group="${target}"]`;
  if (/^l\d+$/.test(target)) return `${scope} [data-atl-link="${target}"]`;
  // Bouton entier dont seul le texte est un emplacement (charte, 2026-11-17).
  if (/^btn\d+$/.test(target)) return `${scope} [data-atl-btn="${target.slice(3)}"]`;
  if (/^[a-z]\d+(_\d+)?$/.test(target)) return `${scope} [data-atl-slot="${target}"]`;
  return null;
}

const decls = (obj, imageUrl) =>
  Object.entries(obj ?? {})
    .map(([p, v]) => {
      if (!safeProp(p)) return null;
      // Chaîne de « content » (puce, flèche) : gardée telle quelle, entre guillemets.
      const value = p === "content" ? (/^"[^"\\{};<>]*"$/.test(String(v)) ? v : null) : safeValue(v);
      if (!value) return null;
      return `${p}:${value.replace(/@@IMG@@/g, imageUrl ?? "")}!important`;
    })
    .filter(Boolean)
    .join(";");

function stylesCss(styles, scope, imageUrl) {
  const plain = [];
  const media = { d: [], m: [] };
  for (const [target, byDevice] of Object.entries(styles ?? {})) {
    const sel = targetSelector(scope, target);
    if (!sel) continue;
    for (const device of DEVICES) {
      for (const part of PARTS) {
        const body = decls(byDevice?.[device]?.[part], imageUrl);
        if (!body) continue;
        (device === "all" ? plain : media[device]).push(`${sel}${SUFFIX[part]}{${body}}`);
      }
    }
  }
  return [...plain, ...["d", "m"].filter((d) => media[d].length).map((d) => `${MEDIA[d]}{${media[d].join("")}}`)];
}

const ANIMATIONS = {
  fondu: "from{opacity:0}to{opacity:1}",
  montee: "from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}",
};

// Règles CSS pour une section ; scope = sélecteur du cadre autour de la section.
// imageUrl : adresse de l'image de fond (aperçu) ou « @@IMG@@ » (Shopify).
export function frameCss(section, props, scope, { pageBackground = null, imageUrl = null } = {}) {
  const rules = [];
  const own = [];
  if (!section.template.includes("fond_section")) {
    const fill = safeColor(props.fond_section);
    if (fill) own.push(`background-color:${fill}!important`, "background-image:none!important");
    if (props.marge_haut !== undefined && props.marge_haut !== "") own.push(`padding-top:${Number(props.marge_haut)}px!important`);
    if (props.marge_bas !== undefined && props.marge_bas !== "") own.push(`padding-bottom:${Number(props.marge_bas)}px!important`);
  }
  if (own.length) rules.push(`${scope}>:not(style){${own.join(";")}}`);
  for (const [gid, c] of Object.entries(parseGroupFills(props.fonds_groupes))) {
    const fill = safeColor(c);
    if (fill) rules.push(`${scope} [data-atl-group="${gid}"]{background-color:${fill}!important}`);
  }
  // Charte du design (engine/charte.js) d'abord, retouches ensuite : à
  // sélecteur égal la dernière règle gagne, la retouche garde le dernier mot.
  rules.push(...stylesCss(props.atl_charte, scope, imageUrl ?? props.atl_fond_image));
  rules.push(...stylesCss(props.atl_styles, scope, imageUrl ?? props.atl_fond_image));
  const anim = ANIMATIONS[props.atl_animation];
  if (anim) {
    const name = `atl-anim-${props.atl_animation}`;
    rules.push(
      `@keyframes ${name}{${anim}}`,
      `@supports (animation-timeline: view()){${scope}>:not(style){animation:${name} linear both;animation-timeline:view();animation-range:entry 0% cover 25%}}`,
    );
  }
  const page = safeColor(pageBackground);
  if (page) rules.push(`body{background-color:${page}}`);
  return rules.join("\n");
}

export const safeAnchor = (a) => String(a ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
