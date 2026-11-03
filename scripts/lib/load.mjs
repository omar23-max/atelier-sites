// Lecture des sections et des pages depuis le disque (scripts Node).
import { readdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const sectionsDir = join(root, "sections");
export const pagesDir = join(root, "pages");

async function readOptional(path) {
  return existsSync(path) ? readFile(path, "utf8") : "";
}

export async function loadSection(id) {
  const dir = join(sectionsDir, id);
  return {
    id,
    schema: JSON.parse(await readFile(join(dir, "schema.json"), "utf8")),
    meta: JSON.parse((await readOptional(join(dir, "meta.json"))) || "{}"),
    template: await readFile(join(dir, "template.liquid"), "utf8"),
    css: await readOptional(join(dir, "style.css")),
  };
}

export async function listSectionIds() {
  return (await readdir(sectionsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export async function loadPage(name) {
  return JSON.parse(await readFile(join(pagesDir, `${name}.json`), "utf8"));
}

// Photo d'origine (/imports/…) → data URL, pour les rendus faits hors serveur.
export function photoDataUrl(path) {
  const file = join(root, path);
  // Type selon l'extension : une image SVG ou AVIF déclarée « png » ne s'affiche pas.
  const ext = (path.split("?")[0].match(/\.(\w+)$/)?.[1] ?? "png").toLowerCase();
  const type = { svg: "image/svg+xml", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif", gif: "image/gif" }[ext] ?? "image/png";
  return existsSync(file) ? `data:${type};base64,${readFileSync(file).toString("base64")}` : "";
}
