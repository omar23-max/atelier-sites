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
