// Zip de Kimi → page de l'atelier + sections du catalogue, en une commande.
//
//   node scripts/kimi-zip.mjs "<chemin du zip>" <nom> [--label "Marque"] [--url https://…] [--coupe]
//
// 1. Décompresse le zip dans C:\Users\HP\Desktop\kimi-pages\<nom>\ (hors de
//    l'atelier ; un ancien dossier du même nom est remplacé).
// 2. Le lockfile de Kimi pointe vers son miroir npm privé, injoignable :
//    remplacé par registry.npmjs.org (les empreintes des paquets restent).
// 3. npm install --ignore-scripts (aucun script d'installation lancé), puis
//    compilation (vite build).
// 4. kimi-import.mjs : page, sections sans coupure (headless ; --coupe pour
//    un thème Shopify, 50 éléments au plus par section), puis catalogue.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [zipArg, slug] = process.argv.slice(2);
if (!zipArg || !slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error('Usage : node scripts/kimi-zip.mjs "<chemin du zip>" <nom-en-minuscules> [--label "Marque"] [--url https://…] [--coupe]');
  process.exit(1);
}
const zip = resolve(zipArg);
if (!existsSync(zip)) {
  console.error(`✗ Zip introuvable : ${zip}`);
  process.exit(1);
}
const opt = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const dest = join("C:/Users/HP/Desktop/kimi-pages", slug);

console.log(`1/4 Décompression dans ${dest}`);
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
// tar de Windows (bsdtar, sait lire les zip) ; celui de Git Bash ne le sait pas.
const tar = process.platform === "win32" ? "C:/Windows/System32/tar.exe" : "tar";
execFileSync(tar, ["-xf", zip, "-C", dest], { stdio: "inherit" });

// Dossier de l'application : celui qui contient package.json (souvent « app »).
const findApp = (dir, depth = 0) => {
  if (existsSync(join(dir, "package.json"))) return dir;
  if (depth > 2) return null;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f !== "node_modules" && statSync(p).isDirectory()) {
      const found = findApp(p, depth + 1);
      if (found) return found;
    }
  }
  return null;
};
const app = findApp(dest);
if (!app) {
  console.error("✗ Pas de package.json dans le zip : ce n'est pas un projet Kimi (React + Vite).");
  process.exit(1);
}

console.log("2/4 Dépendances (sans scripts d'installation)");
const lock = join(app, "package-lock.json");
if (existsSync(lock)) {
  const text = await readFile(lock, "utf8");
  const fixed = text.replace(/https:\/\/npm\.mirrors\.msh\.team\//g, "https://registry.npmjs.org/");
  if (fixed !== text) await writeFile(lock, fixed, "utf8");
}
execSync("npm install --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/", { cwd: app, stdio: "inherit" });

console.log("3/4 Compilation");
execSync("npx vite build", { cwd: app, stdio: "inherit" });

console.log("4/4 Import dans l'atelier");
const args = [join(root, "scripts", "kimi-import.mjs"), app, slug];
if (opt("--label")) args.push("--label", opt("--label"));
if (opt("--url")) args.push("--url", opt("--url"));
if (!process.argv.includes("--coupe")) args.push("--sans-coupe");
execFileSync(process.execPath, args, { cwd: root, stdio: "inherit" });
console.log(`✓ Page « ${slug} » dans l'atelier : http://localhost:5180/?page=${slug}`);
