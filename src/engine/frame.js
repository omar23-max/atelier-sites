// Réglages ajoutés par l'atelier à n'importe quelle section, sans toucher à son
// template : fond et marges de la section (fond_section, marge_haut, marge_bas,
// pour les sections dont le template ne les gère pas), fonds des colonnes et
// des cartes (fonds_groupes : « g12=#f5f0e8;g40=#ffffff »), et fond de la page.
// Mêmes règles dans l'aperçu (render.js, portée = classe du cadre) et sur
// Shopify (shopify.js, portée = #shopify-section-<id>).

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

// Règles CSS pour une section ; scope = sélecteur du cadre autour de la section.
export function frameCss(section, props, scope, { pageBackground = null } = {}) {
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
  const page = safeColor(pageBackground);
  if (page) rules.push(`body{background-color:${page}}`);
  return rules.join("\n");
}
