// Fichiers design.md : designs/<nom>-design.md
//
// Un design.md est lisible par un humain (ambiance, typographie, couleurs,
// formes) et contient un bloc ```json``` de jetons que l'atelier applique :
//   { "polices": { "titres": "...", "texte": "..." },
//     "couleurs": { "<rôle>": "#rrggbb", ... } }
//
// Chaque section déclare dans meta.json quels réglages suivent quel rôle
// ("designRoles": { "color_bg": "fond", ... }). Appliquer un design à une page
// recopie les couleurs des rôles dans les réglages de toutes ses sections, et
// les polices dans les réglages de la page.

export const ROLES = [
  { id: "fond", label: "Fond de page", hint: "Fond des sections claires" },
  { id: "surface", label: "Surface", hint: "Cartes et encadrés clairs" },
  { id: "surface-forte", label: "Surface marquée", hint: "Élément sélectionné, bulle" },
  { id: "texte", label: "Texte", hint: "Texte sur fond clair" },
  { id: "accent", label: "Accent", hint: "Icônes, coches, liens" },
  { id: "accent-clair", label: "Accent clair", hint: "Accent lisible sur fond sombre" },
  { id: "bouton", label: "Bouton", hint: "Boutons d'achat, onglet actif" },
  { id: "bouton-texte", label: "Texte des boutons", hint: "" },
  { id: "fond-sombre", label: "Fond sombre", hint: "Sections et bandeaux sombres" },
  { id: "fond-sombre-2", label: "Fond sombre (dégradé)", hint: "Bas des dégradés sombres" },
  { id: "surface-sombre", label: "Surface sombre", hint: "Cartes sur fond sombre" },
  { id: "texte-sur-sombre", label: "Texte sur fond sombre", hint: "" },
  { id: "etoiles", label: "Étoiles et badges", hint: "Notes, sceaux" },
];

export function parseDesign(id, markdown) {
  const title = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? id;
  const source = /^Source\s*:\s*(\S+)/im.exec(markdown)?.[1] ?? null;
  const block = /```json\s*([\s\S]*?)```/.exec(markdown)?.[1];
  let tokens = { polices: {}, couleurs: {} };
  let error = null;
  try {
    if (!block) throw new Error("bloc ```json``` de jetons introuvable");
    tokens = JSON.parse(block);
  } catch (e) {
    error = e.message;
  }
  return { id, file: `designs/${id}.md`, title, source, tokens, markdown, error };
}

const norm = (c) => String(c ?? "").trim().toLowerCase();

// Deux couleurs presque identiques (écart ≤ 6 par canal) comptent comme la
// même : les valeurs mesurées à la pipette varient d'un pixel à l'autre.
function same(a, b) {
  const x = /^#([0-9a-f]{6})$/.exec(norm(a));
  const y = /^#([0-9a-f]{6})$/.exec(norm(b));
  if (!x || !y) return norm(a) === norm(b);
  for (let i = 0; i < 6; i += 2) {
    if (Math.abs(parseInt(x[1].slice(i, i + 2), 16) - parseInt(y[1].slice(i, i + 2), 16)) > 6) return false;
  }
  return true;
}

// Renvoie une nouvelle page avec le design appliqué (la page d'origine n'est pas modifiée).
//
// Chaque couleur suit le rôle qu'elle occupe *réellement* dans la page : si sa
// valeur correspond à un rôle du design précédent (ex. le fond crème d'une
// 2e collection = « surface »), elle prend la couleur de ce rôle dans le
// nouveau design. Sinon (teinte hors palette, retouche à la main), elle suit
// le rôle déclaré par la section : le design s'applique à toute la page.
// Une copie de sécurité est faite avant chaque application.
export function applyDesign(page, design, sectionsById, previous = null) {
  const colors = design.tokens.couleurs ?? {};
  const fonts = design.tokens.polices ?? {};
  const oldColors = previous?.tokens?.couleurs ?? null;
  let changed = 0;
  let offPalette = 0;
  const content = (page.content ?? []).map((item) => {
    const roles = sectionsById[item.type]?.meta?.designRoles ?? {};
    const props = { ...item.props };
    for (const [setting, declared] of Object.entries(roles)) {
      let role = declared;
      if (oldColors) {
        const value = props[setting];
        if (!same(oldColors[declared], value)) {
          const match = Object.keys(oldColors).find((r) => same(oldColors[r], value));
          if (match) role = match;
          else offPalette++;
        }
      }
      if (colors[role] && norm(props[setting]) !== norm(colors[role])) {
        props[setting] = colors[role];
        changed++;
      }
    }
    return { ...item, props };
  });
  const root = {
    ...page.root,
    props: {
      ...page.root?.props,
      design: design.id,
      font_heading: fonts.titres ?? page.root?.props?.font_heading ?? "",
      font_body: fonts.texte ?? page.root?.props?.font_body ?? "",
    },
  };
  return { page: { ...page, root, content }, changed, offPalette };
}
