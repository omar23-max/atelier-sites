// Socle / zones d'angle (2026-11-08).
// Une page mère a un SOCLE commun à tous les angles (offre, mécanisme, preuves,
// garantie, FAQ, bloc d'achat, design) et des ZONES D'ANGLE qui changent d'un
// angle à l'autre (hero, ouverture et problème, ordre des bénéfices, avis mis en
// avant, texte des CTA). Chaque section porte props.atl_zone = "angle" quand
// elle est une zone d'angle ; sans ce réglage, elle fait partie du socle.
// Les pages d'angle sont des copies de la mère : elles héritent du réglage.
import { sections, sectionsIndex } from "./engine/sections.js";
import { listPages } from "./projects.js";
import { pageMenuGroups } from "./pages-ui.jsx";
import { ANGLE_FAMILIES } from "./engine/zones.js";

const byId = sectionsIndex;
export const familyIdOf = (item) => byId[item?.type]?.meta?.family ?? "autres";
export const isAngleZone = (item) => item?.props?.atl_zone === "angle";

// Proposition par défaut : hero, problème, histoire, bénéfices, grand CTA et
// le premier bloc d'avis de la page.
// (liste commune avec les emplacements de sections manquantes : engine/zones.js)
export function suggestAngleZones(content) {
  const ids = new Set();
  let reviews = false;
  for (const item of content) {
    const fam = familyIdOf(item);
    if (ANGLE_FAMILIES.has(fam)) ids.add(item.props.id);
    else if (fam === "temoignages" && !reviews) {
      ids.add(item.props.id);
      reviews = true;
    }
  }
  return ids;
}

// Rôle de la page dans son projet : mère de son type, page d'angle, ou autre.
// { project, role: "mere" | "angle" | "autre" | null, angle, motherName }
export async function pageRole(pageName, root) {
  if (!root?.projet) return { project: null, role: null, angle: null, motherName: null };
  const [project, pages] = await Promise.all([fetch(`/api/projects/${root.projet}`).then((r) => (r.ok ? r.json() : null)), listPages().catch(() => [])]);
  if (!project) return { project: null, role: null, angle: null, motherName: null };
  const own = (pages ?? []).filter((p) => p.projet === project.id);
  const group = pageMenuGroups(own, project).find((g) => g.items.some((i) => i.name === pageName));
  const item = group?.items.find((i) => i.name === pageName);
  const motherName = group?.items.find((i) => i.mere)?.name ?? null;
  const angle = (project.angles ?? []).find((a) => a.page === pageName) ?? null;
  return { project, role: item?.mere ? "mere" : item?.angle ? "angle" : item ? "autre" : null, angle, motherName };
}

// Zones d'angle d'une page d'angle copiée AVANT que la mère ait ses réglages :
// on reprend ceux de la mère, section par section (même type, même rang).
export function zonesFromMother(content, motherContent) {
  const rankOf = (list) => {
    const seen = {};
    return list.map((it) => `${it.type}#${(seen[it.type] = (seen[it.type] ?? 0) + 1)}`);
  };
  const motherAngle = new Set(rankOf(motherContent).filter((_, i) => isAngleZone(motherContent[i])));
  const keys = rankOf(content);
  return new Set(content.filter((_, i) => motherAngle.has(keys[i])).map((it) => it.props.id));
}
