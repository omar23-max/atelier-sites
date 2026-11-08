// Zip de Kimi → pages de l'atelier + sections du catalogue, en une commande.
//
//   node scripts/kimi-zip.mjs "<chemin du zip>"            (lot : un dossier par page)
//   node scripts/kimi-zip.mjs "<chemin du zip>" <nom>      (une seule page)
//   options : [--label "Marque"] [--url https://…] [--coupe] [--seulement nom1,nom2]
//             [--origine daydreamer-vault] [--verifier-a-part]
//
// Lot (docs/templates-pour-kimi.md) : le zip contient un dossier par page, qui
// porte le nom de la page dans l'atelier (alpha-lion-offre/…). Chaque dossier
// remplace l'ancien template du même nom et ses sections du catalogue.
//
// Pour chaque page :
// 1. le lockfile de Kimi pointe vers son miroir npm privé, injoignable :
//    remplacé par registry.npmjs.org (les empreintes des paquets restent) ;
// 2. npm install --ignore-scripts (aucun script d'installation lancé), puis
//    compilation (vite build) ;
// 3. kimi-import.mjs : page, sections sans coupure (headless ; --coupe pour
//    un thème Shopify, 50 éléments au plus par section), puis catalogue.
// 4. réparation des défauts connus (reparer-miroir.mjs), fiche template,
//    puis vérification complète (atelier + Copycat + PWC).
// Une page en échec n'arrête pas le lot : le bilan final la signale.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const zipArg = args[0];
const single = args[1] && !args[1].startsWith("--") ? args[1] : null;
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
if (!zipArg || (single && !SLUG.test(single))) {
  console.error('Usage : node scripts/kimi-zip.mjs "<chemin du zip>" [<nom>] [--label "Marque"] [--url https://…] [--coupe] [--seulement nom1,nom2] [--origine daydreamer-vault] [--verifier-a-part]');
  process.exit(1);
}
const zip = resolve(zipArg);
if (!existsSync(zip)) {
  console.error(`✗ Zip introuvable : ${zip}`);
  process.exit(1);
}
const pagesDir = "C:/Users/HP/Desktop/kimi-pages";

// Décompression (hors de l'atelier). tar de Windows (bsdtar, sait lire les
// zip) ; celui de Git Bash ne le sait pas.
const lot = join(pagesDir, `_lot-${basename(zip).replace(/\.zip$/i, "").replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 40)}`);
console.log(`Décompression dans ${lot}`);
await rm(lot, { recursive: true, force: true });
await mkdir(lot, { recursive: true });
const tar = process.platform === "win32" ? "C:/Windows/System32/tar.exe" : "tar";
execFileSync(tar, ["-xf", zip, "-C", lot], { stdio: "inherit" });

// Dossier de l'application : celui qui contient package.json (lui-même, ou
// un sous-dossier comme « app »).
const findApp = (dir, depth = 0) => {
  if (existsSync(join(dir, "package.json"))) return dir;
  if (depth > 2) return null;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f !== "node_modules" && !f.startsWith(".") && statSync(p).isDirectory()) {
      const found = findApp(p, depth + 1);
      if (found) return found;
    }
  }
  return null;
};
const dirsOf = (d) => readdirSync(d).filter((f) => !f.startsWith(".") && !f.startsWith("__MACOSX") && statSync(join(d, f)).isDirectory());

// Pages à importer : { nom, app }.
let jobs;
if (single) {
  const app = findApp(lot);
  jobs = app ? [{ slug: single, app }] : [];
} else {
  // Un dossier par page ; si tout est dans un seul dossier englobant, on y descend.
  let base = lot;
  let dirs = dirsOf(base);
  if (dirs.length === 1 && !existsSync(join(base, dirs[0], "package.json")) && dirsOf(join(base, dirs[0])).length > 1) {
    base = join(base, dirs[0]);
    dirs = dirsOf(base);
  }
  jobs = dirs
    .map((d) => ({ slug: d.toLowerCase(), app: findApp(join(base, d)) }))
    .filter((j) => {
      if (!SLUG.test(j.slug)) return console.log(`  – ${j.slug} : nom de dossier invalide (minuscules, chiffres, tirets), ignoré`), false;
      if (!j.app) return console.log(`  – ${j.slug} : pas de package.json, ignoré`), false;
      return true;
    });
  const only = opt("--seulement")?.split(",").map((s) => s.trim());
  if (only) jobs = jobs.filter((j) => only.includes(j.slug));
}
if (!jobs.length) {
  console.error("✗ Aucune page dans le zip (il faut un projet React + Vite avec package.json).");
  process.exit(1);
}
console.log(`${jobs.length} page(s) : ${jobs.map((j) => j.slug).join(", ")}`);

const results = [];
for (const [n, { slug, app }] of jobs.entries()) {
  console.log(`\n=== ${n + 1}/${jobs.length} · ${slug}`);
  try {
    const lock = join(app, "package-lock.json");
    if (existsSync(lock)) {
      const text = await readFile(lock, "utf8");
      const fixed = text.replace(/https:\/\/npm\.mirrors\.msh\.team\//g, "https://registry.npmjs.org/");
      if (fixed !== text) await writeFile(lock, fixed, "utf8");
    }
    console.log("  Dépendances (sans scripts d'installation)…");
    execSync("npm install --ignore-scripts --no-audit --no-fund --loglevel=error --registry=https://registry.npmjs.org/", { cwd: app, stdio: "inherit" });
    console.log("  Compilation…");
    execSync("npx vite build --logLevel error", { cwd: app, stdio: "inherit" });
    console.log("  Import dans l'atelier…");
    const importArgs = [join(root, "scripts", "kimi-import.mjs"), app, slug];
    if (opt("--label")) importArgs.push("--label", opt("--label"));
    if (opt("--url")) importArgs.push("--url", opt("--url"));
    if (!args.includes("--coupe")) importArgs.push("--sans-coupe");
    execFileSync(process.execPath, importArgs, { cwd: root, stdio: "inherit" });
    results.push({ slug, ok: true });
  } catch (e) {
    console.log(`  ✗ ${slug} : ${e.message.split("\n")[0]}`);
    results.push({ slug, ok: false });
  }
}
// Fiche template (catalogue → Templates) puis vérification complète
// (atelier + Copycat + PWC, scripts/verifier-import.mjs) de chaque page
// importée. --verifier-a-part : seulement la fiche ; la vérification est
// alors lancée à part (plusieurs pages en parallèle), jamais sautée.
const ok = results.filter((r) => r.ok).map((r) => r.slug);
if (ok.length) {
  const origine = opt("--origine");
  // CSS manquant dans le zip (icônes géantes, carrousels empilés…) : réparé
  // avant la fiche et la vérification (scripts/reparer-miroir.mjs).
  console.log("\n=== Réparation des défauts connus");
  try {
    execFileSync(process.execPath, [join(root, "scripts", "reparer-miroir.mjs"), ...ok], { cwd: root, stdio: "inherit", timeout: 3600000 });
  } catch {
    console.log(`  ⚠ Réparation interrompue. Plus tard : node scripts/reparer-miroir.mjs ${ok.join(" ")}`);
  }
  console.log("\n=== Fiches template");
  execFileSync(process.execPath, [join(root, "scripts", "kimi-template.mjs"), ...ok, ...(origine ? ["--origine", origine] : [])], { cwd: root, stdio: "inherit" });
  if (args.includes("--verifier-a-part")) {
    console.log(`\n⚠ Vérification à lancer : node scripts/verifier-lot.mjs ${ok.join(" ")}`);
  } else {
    for (const slug of ok) {
      try {
        execFileSync(process.execPath, [join(root, "scripts", "verifier-import.mjs"), slug], { cwd: root, stdio: "inherit", timeout: 3600000 });
      } catch {
        console.log(`  ⚠ Vérification interrompue. Plus tard : node scripts/verifier-import.mjs ${slug}`);
      }
    }
  }
}

console.log("\n=== Bilan");
for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.slug}${r.ok ? `  http://localhost:5180/?page=${r.slug}` : "  (à reprendre : node scripts/kimi-zip.mjs \"<zip>\" --seulement " + r.slug + ")"}`);
