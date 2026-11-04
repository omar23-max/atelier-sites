// Transforme une page de l'atelier (pages/<nom>.json) en fichier HTML autonome.
// Usage : npm run render -- <nom>   →  export/html/<nom>.html
// Refusé tant que la page montre des photos d'origine (découpées dans la
// capture du site d'inspiration) : elles ne doivent jamais être publiées.
// npm run render -- <nom> --sans-photos   exporte avec ces images laissées vides.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isOriginalPhoto, renderSectionHtml, setPhotoResolver } from "../src/engine/render.js";
import { brandCss } from "../src/engine/brand.js";
import { loadPage, loadSection, photoDataUrl, root } from "./lib/load.mjs";

// Sections de la page qui affichent encore au moins une photo d'origine.
export function sectionsWithOriginalPhotos(page, sectionsById) {
  return (page.content ?? []).filter((item) => {
    const s = sectionsById[item.type];
    if (!s) return false;
    const hasValue = (values, defs, originals) =>
      (defs ?? []).some((d) => d.type === "image_picker" && (isOriginalPhoto(values?.[d.id]) || (!values?.[d.id] && originals?.[d.id])));
    const o = s.meta.photosOrigine ?? {};
    if (hasValue(item.props, s.schema.settings, o.settings)) return true;
    return (s.schema.blocks ?? []).some((b) => {
      const items = item.props?.[`blocks_${b.type}`] ?? [];
      return items.some((v, i) => hasValue(v, b.settings, o.blocks?.[b.type]?.[i]));
    });
  });
}

// withPhotos : true pour un rendu local (comparaison), false pour un export.
// reperes : un <template data-atl-sec="n"> avant chaque section (n = rang dans
// la page), pour l'aperçu du catalogue (« Prendre cette section ») ; jamais à l'export.
export async function renderPage(name, { withPhotos = true, reperes = false } = {}) {
  setPhotoResolver(withPhotos ? photoDataUrl : () => "");
  const page = await loadPage(name);
  const cache = new Map();
  const parts = [];
  const styles = [];

  for (const [n, item] of (page.content ?? []).entries()) {
    if (!cache.has(item.type)) {
      const section = await loadSection(item.type);
      cache.set(item.type, section);
      styles.push(section.css);
    }
    if (reperes) parts.push(`<template data-atl-sec="${n}"></template>`);
    parts.push(renderSectionHtml(cache.get(item.type), item.props ?? {}, item.props?.id));
  }

  // Les @import (polices) doivent précéder toute autre règle CSS.
  // L'URL d'une police Google contient des « ; », d'où le motif sur url(...).
  const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
  const css = [brandCss(page.root?.props), ...styles].join("\n");
  const imports = [...new Set(css.match(IMPORT) ?? [])].join("\n");
  const rest = css.replace(IMPORT, "");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.root?.props?.title ?? name}</title>
<style>
${imports}
html, body { margin: 0; }
${rest}
</style>
</head>
<body>
${parts.join("\n")}
</body>
</html>
`;
}

if (process.argv[1]?.endsWith("render-page.mjs")) {
  const name = process.argv[2];
  if (!name) {
    console.error("Usage : npm run render -- <nom-de-page>");
    process.exit(1);
  }
  const page = await loadPage(name);
  const sectionsById = {};
  for (const item of page.content ?? []) sectionsById[item.type] ??= await loadSection(item.type);
  const pending = sectionsWithOriginalPhotos(page, sectionsById);
  if (pending.length > 0 && !process.argv.includes("--sans-photos")) {
    console.error(`✗ Export refusé : ${pending.length} section(s) montrent encore des photos d'origine du site d'inspiration.`);
    for (const item of pending) console.error(`    ${sectionsById[item.type].meta.label ?? item.type}`);
    console.error("  Remplace-les par tes images dans l'atelier, ou relance avec --sans-photos pour les laisser vides.");
    process.exit(1);
  }
  const outDir = join(root, "export", "html");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, `${name}.html`), await renderPage(name, { withPhotos: false }), "utf8");
  console.log(`✓ export/html/${name}.html`);
}
