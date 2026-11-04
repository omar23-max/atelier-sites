// Import des pages Replo (replo.app/templates et replo.app/examples/landing-pages)
// avec le copieur de l'atelier, depuis les vrais sites des marques.
//
//   node scripts/replo-lot.mjs [--paralleles 2] [--seulement slug1,slug2]
//
// Liste : imports/_replo-inventaire.json (une ligne par page : source, marque,
// type, industrie, url). Pour chaque page, nommée replo-<marque>-<type> :
// 1. capture (advertorial.mjs) — page disparue : passée ;
// 2. fiche.json (nom, marque, secteur, pageType) puis copie au design
//    identique, une section par section du site (advertorial-page.mjs
//    --par-sections) ;
// 3. réparation des défauts connus (reparer-miroir.mjs) ;
// 4. sections du catalogue (sections-page.mjs) et leurs miniatures ;
// 5. origine « Replo » (origines.json) ;
// 6. vérification complète : atelier + Copycat + PWC (verifier-import.mjs).
// Une page déjà vérifiée est sautée (relance possible après une coupure).
// Bilan : imports/_replo-bilan.json. L'atelier doit tourner.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const workers = Number(opt("--paralleles")) || 2;
const only = opt("--seulement")?.split(",");

const TYPES = { Homepage: "accueil", "Product page": "produit", "Landing page": "landing", Listicle: "listicle", "Collection page": "collection", offer: "offre", product: "produit", listicle: "listicle", quiz: "landing" };
const SECTEURS = { Skincare: "Soins de la peau", Beauty: "Beauté", Supplements: "Compléments", Apparel: "Vêtements", "Food and beverage": "Alimentation et boissons", Pet: "Animaux", Home: "Maison" };
const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Liste → travaux (nom unique par marque et type). Une page déjà importée
// d'une autre façon (même adresse) garde son nom.
const inventaire = JSON.parse(await readFile(join(root, "imports", "_replo-inventaire.json"), "utf8"));
const { readdir: ls } = await import("node:fs/promises");
const byUrl = new Map();
for (const d of (await ls(join(root, "imports"))).filter((d) => d.startsWith("replo-"))) {
  const f = join(root, "imports", d, "template.json");
  if (existsSync(f)) byUrl.set(JSON.parse(await readFile(f, "utf8")).url, d);
}
const used = new Map();
const all = inventaire
  .filter((x) => x.url)
  .map((x) => {
    // Exemples : « Spot & Tango Offer page · Pet Over 1,000 Meta ads… ».
    const marque = x.marque ?? x.nom.replace(/ (offer|product|listicle|quiz)( page)? on desktop$/i, "").trim();
    const pageType = TYPES[x.type] ?? "autre";
    const industrie = x.texte?.match(/ · ([A-Za-z ]+?) (Over|\d|Under|About|Fewer)/)?.[1] ?? null;
    let slug = `replo-${slugify(marque)}-${pageType}`;
    const n = (used.get(slug) ?? 0) + 1;
    used.set(slug, n);
    if (n > 1) slug += `-${n}`;
    if (byUrl.has(x.url)) slug = byUrl.get(x.url);
    return { slug, url: x.url, marque, pageType, secteur: SECTEURS[industrie] ?? industrie ?? "", source: x.source };
  });
await writeFile(join(root, "imports", "_replo-travaux.json"), JSON.stringify(all, null, 1), "utf8");
const jobs = all.filter((j) => !only || only.includes(j.slug));

const run = (script, argv, log, env = {}) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, "scripts", script), ...argv], { cwd: root, windowsHide: true, env: { ...process.env, ...env } });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    const timer = setTimeout(() => child.kill(), 3600000);
    child.on("close", (code) => (clearTimeout(timer), resolve(code)));
  });

// origines.json : écrit par un seul travail à la fois.
let originLock = Promise.resolve();
const setOrigin = (slug) =>
  (originLock = originLock.then(async () => {
    const file = join(root, "origines.json");
    const o = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : {};
    o[slug] = "replo";
    await writeFile(file, `${JSON.stringify(o, null, 2)}\n`, "utf8");
  }));

const results = [];
const queue = [...jobs];
let done = 0;
async function worker() {
  while (queue.length) {
    const j = queue.shift();
    const dir = join(root, "imports", j.slug);
    const tplFile = join(dir, "template.json");
    if (existsSync(tplFile) && JSON.parse(await readFile(tplFile, "utf8")).verification) {
      results.push({ ...j, etat: "déjà fait" });
      console.log(`[${++done}/${jobs.length}] ${j.slug} : déjà fait`);
      continue;
    }
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    const log = createWriteStream(join(dir, "import.log"));
    const t0 = Date.now();
    let etat = "ok";
    if ((await run("advertorial.mjs", [j.url, j.slug], log)) !== 0) etat = "capture impossible";
    else {
      const rep = JSON.parse(await readFile(join(dir, "advertorial.json"), "utf8"));
      if (rep.disparue) etat = "page disparue";
    }
    if (etat === "ok") {
      await writeFile(join(dir, "fiche.json"), JSON.stringify({ nom: `${j.marque} — ${j.pageType}`, produit: "", marque: j.marque, secteur: j.secteur, pageType: j.pageType }, null, 2), "utf8");
      if ((await run("advertorial-page.mjs", [j.slug, "--par-sections"], log, { ATL_SANS_VERIF: "1" })) !== 0) etat = "copie impossible";
    }
    if (etat === "ok") {
      await run("reparer-miroir.mjs", [j.slug], log);
      await run("sections-page.mjs", [j.slug, "--marque", j.marque, "--url", j.url], log);
      const { readdir } = await import("node:fs/promises");
      const secs = (await readdir(join(root, "sections"))).filter((s) => s.startsWith(`${j.slug}-sec-`) || s.startsWith(`${j.slug}-p`));
      if (secs.length) await run("thumbs.mjs", secs, log);
      await setOrigin(j.slug);
      await run("verifier-import.mjs", [j.slug], log);
    }
    log.end();
    const v = existsSync(tplFile) ? JSON.parse(await readFile(tplFile, "utf8")).verification ?? {} : {};
    results.push({ ...j, etat, minutes: Math.round((Date.now() - t0) / 60000), atelier: v.score ?? null, copycat: v.copycat?.note ?? null, pwc: v.pwc?.ssim ?? null });
    console.log(`[${++done}/${jobs.length}] ${j.slug} : ${etat}${v.score != null ? ` · atelier ${v.score} · PWC ${v.pwc?.ssim ?? "—"}` : ""}`);
    await writeFile(join(root, "imports", "_replo-bilan.json"), JSON.stringify(results, null, 1), "utf8");
  }
}
console.log(`${jobs.length} page(s) Replo, ${workers} à la fois.`);
await Promise.all(Array.from({ length: workers }, worker));
console.log(`\nBilan : imports/_replo-bilan.json`);
