import { parseDesign } from "./design.js";

// Charge automatiquement designs/*-design.md et leur miniature designs/<nom>.png.
const files = import.meta.glob("/designs/*.md", { eager: true, query: "?raw", import: "default" });
const thumbnails = import.meta.glob("/designs/*.png", { eager: true, query: "?url", import: "default" });

export const designs = Object.entries(files)
  .map(([path, markdown]) => {
    const id = path.split("/").pop().replace(/\.md$/, "");
    return { ...parseDesign(id, markdown), thumbnail: thumbnails[`/designs/${id}.png`] ?? null };
  })
  .sort((a, b) => a.title.localeCompare(b.title, "fr"));

export const designById = Object.fromEntries(designs.map((d) => [d.id, d]));

// Chaque import écrit un nouveau designs/*.md : sans ceci, la mise à jour
// remontait à tous les écrans (catalogue, éditeur) et l'atelier demandait à
// être rechargé à chaque import (2026-11-10). La liste est mise à jour sur
// place ; les écrans la voient au prochain affichage.
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    if (!mod) return;
    designs.splice(0, designs.length, ...mod.designs);
    for (const k of Object.keys(designById)) delete designById[k];
    Object.assign(designById, mod.designById);
  });
}
