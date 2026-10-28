// Ajoute aux captures déjà faites les vidéos et les carrousels (sliders), sans
// retourner sur le site : la page enregistrée à l'import (page.html) est
// relue hors ligne, scripts coupés, et chaque élément de snapshot.json y est
// retrouvé par sa place (path). Les nouvelles captures le font d'elles-mêmes.
// Usage : node scripts/medias-carrousels.mjs <dossier> [<dossier>…] | --tous
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { mediaOf } from "./lib/snapshot.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const slugs = args.includes("--tous")
  ? (await readdir(join(root, "imports"))).filter((s) => existsSync(join(root, "imports", s, "snapshot.json")) && existsSync(join(root, "imports", s, "page.html")))
  : args;
if (!slugs.length) {
  console.error("Usage : node scripts/medias-carrousels.mjs <dossier> | --tous");
  process.exit(1);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ javaScriptEnabled: false });
// Rien n'est téléchargé : seule la structure de la page compte.
await context.route("**/*", (r) => r.abort());
for (const slug of slugs) {
  const dir = join(root, "imports", slug);
  const snap = JSON.parse(await readFile(join(dir, "snapshot.json"), "utf8"));
  const report = existsSync(join(dir, "advertorial.json")) ? JSON.parse(await readFile(join(dir, "advertorial.json"), "utf8")) : {};
  let html = await readFile(join(dir, "page.html"), "utf8");
  const base = report.finalUrl || report.url;
  if (base) html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`);
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(`window.__atlMediaOf = ${mediaOf}`);
  // [id, parent, rang parmi les enfants, balise] ; les parents viennent avant leurs enfants.
  const targets = snap.nodes.map((n) => [n.id, n.parent, n.path ? Number(n.path.split("/").pop()) : -1, n.tag]);
  const { found, mismatch } = await page.evaluate((targets) => {
    const found = {};
    let mismatch = 0;
    const elOf = new Map();
    const kidsOf = new Map();
    for (const t of targets) if (t[1] != null) (kidsOf.get(t[1]) ?? kidsOf.set(t[1], []).get(t[1])).push(t);
    // La page relue n'a pas toujours les mêmes rangs que la page vivante (balises
    // <meta>, <script> déplacées par l'analyseur) : décalage des rangs choisi
    // par parent, celui qui fait correspondre le plus de balises.
    const shiftOf = new Map();
    const shift = (pid, parentEl) => {
      if (shiftOf.has(pid)) return shiftOf.get(pid);
      const kids = kidsOf.get(pid) ?? [];
      let best = 0;
      let bestScore = -1;
      for (let d = -40; d <= parentEl.children.length; d++) {
        let score = 0;
        for (const [, , i, tag] of kids) if (parentEl.children[i + d]?.tagName.toLowerCase() === tag) score += 1;
        if (score > bestScore || (score === bestScore && Math.abs(d) < Math.abs(best))) [best, bestScore] = [d, score];
      }
      shiftOf.set(pid, best);
      return best;
    };
    for (const [id, pid, i, tag] of targets) {
      let el;
      if (pid == null) el = document.body;
      else {
        const parentEl = elOf.get(pid);
        if (!parentEl) continue;
        el = parentEl.children[i + shift(pid, parentEl)];
      }
      if (!el || (el !== document.body && el.tagName.toLowerCase() !== tag)) {
        mismatch += 1;
        continue;
      }
      elOf.set(id, el);
      const m = window.__atlMediaOf(el);
      if (m) found[id] = m;
    }
    return { found, mismatch };
  }, targets);
  await page.close();
  for (const n of snap.nodes) {
    delete n.video;
    delete n.car;
    Object.assign(n, found[n.id] ?? {});
  }
  await writeFile(join(dir, "snapshot.json"), JSON.stringify(snap), "utf8");
  const vals = Object.values(found);
  const count = (f) => vals.filter(f).length;
  console.log(
    `${slug.padEnd(32)} vidéos ${count((m) => m.video)} · carrousels ${count((m) => m.car === "track")} · copies de diapos ${count((m) => m.car === "clone")} · flèches ${count((m) => m.car === "prev" || m.car === "next")}${mismatch ? ` · ${mismatch} élément(s) non retrouvé(s)` : ""}`,
  );
}
await browser.close();
