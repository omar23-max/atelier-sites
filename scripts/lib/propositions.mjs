// Sections manquantes proposées juste après un import (comme le « brain » de
// Whitelabeler) : le Page Score de la page importée (src/engine/page-score.js)
// dit quelles familles de sections manquent pour son type de page, pourquoi,
// et où les placer ; on y joint des modèles du catalogue de chaque famille.
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ruleLabel, scorePage } from "../../src/engine/page-score.js";

async function loadSections(root) {
  const dir = join(root, "sections");
  const out = {};
  for (const id of await readdir(dir)) {
    const metaFile = join(dir, id, "meta.json");
    if (!existsSync(metaFile)) continue;
    try {
      out[id] = { id, meta: JSON.parse(await readFile(metaFile, "utf8")), thumbnail: existsSync(join(dir, id, "thumbnail.png")) };
    } catch {
      // section illisible : ignorée
    }
  }
  return out;
}

// page : données de la page ({ root, content }). Résultat enregistré dans
// template.json (« propositions ») et affiché à l'ouverture de la page.
export async function proposeSections(root, page, { modeles = 3 } = {}) {
  const sectionsById = await loadSections(root);
  const result = scorePage(page, sectionsById);
  if (!result.type) return null;
  const catalogue = Object.values(sectionsById).filter((s) => !s.meta.pageSpecific && (s.meta.status ?? "visible") === "visible");
  const manquantes = result.missing
    .filter((m) => m.rule.families)
    .map((m) => ({
      section: ruleLabel(m.rule),
      familles: m.rule.families,
      pourquoi: m.rule.why,
      gain: m.gain,
      ou: m.where,
      // Modèles du catalogue de cette famille, ceux avec miniature d'abord.
      modeles: catalogue
        .filter((s) => m.rule.families.includes(s.meta.family))
        .sort((a, b) => Number(b.thumbnail) - Number(a.thumbnail))
        .slice(0, modeles)
        .map((s) => s.id),
    }));
  return { date: new Date().toISOString(), type: result.type.id, score: result.score, verdict: result.verdict, manquantes };
}
