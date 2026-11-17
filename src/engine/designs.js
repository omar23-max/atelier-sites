import { parseDesign } from "./design.js";
import { onLive } from "../live.js";

// designs/*-design.md et leur miniature designs/<nom>.png, lus par l'API
// (/api/designs-data, server/sections.mjs) depuis le 2026-11-17 : dans la
// version compilée, un design.md créé après coup (palette, import) apparaît
// sans reconstruire l'atelier.
async function load() {
  const all = await fetch("/api/designs-data").then((r) => r.json());
  return Object.entries(all)
    .map(([id, { md, png }]) => ({ ...parseDesign(id, md), thumbnail: png ? `/designs/${id}.png?v=${png}` : null }))
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));
}

export const designs = await load();
export const designById = Object.fromEntries(designs.map((d) => [d.id, d]));

// Un design.md ajouté ou modifié (import, palette) : la liste est mise à jour
// sur place ; les écrans la voient au prochain affichage.
onLive("atl-designs", async () => {
  const fresh = await load().catch(() => null);
  if (!fresh) return;
  designs.splice(0, designs.length, ...fresh);
  for (const k of Object.keys(designById)) delete designById[k];
  Object.assign(designById, Object.fromEntries(fresh.map((d) => [d.id, d])));
});
