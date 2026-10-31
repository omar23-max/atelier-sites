// Fige les sections de templates qu'utilise une page : chaque section
// « <template>-pN » ou « <template>-sec-N » est copiée en « <page>--<section> »
// (réservée à la page, masquée du catalogue) et la page pointe sur la copie.
// Réimporter le template (zip de Kimi) ne change alors plus la page.
//
//   node scripts/figer-sections.mjs <page> [--depuis-git <template>,…] [--version <sauvegarde git>]
//
// --depuis-git : ces templates viennent d'être réimportés ; leurs anciennes
// sections sont reprises de la dernière sauvegarde (git HEAD), pas du disque.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [page] = process.argv.slice(2);
const opt = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const fromGit = new Set((opt("--depuis-git") ?? "").split(",").filter(Boolean));
const ref = opt("--version") ?? "HEAD"; // une sauvegarde précise (git) au lieu de la dernière
if (!page) {
  console.error("Usage : node scripts/figer-sections.mjs <page> [--depuis-git tpl1,tpl2]");
  process.exit(1);
}
const pageFile = join(root, "pages", `${page}.json`);
const data = JSON.parse(await readFile(pageFile, "utf8"));
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const done = new Map();
for (const item of data.content ?? []) {
  const m = /^(.*?)-(p|sec-)\d+$/.exec(item.type);
  if (!m || m[1] === page || item.type.includes("--")) continue;
  const id = `${page}--${item.type}`;
  if (!done.has(item.type)) {
    const files = {};
    if (fromGit.has(m[1])) {
      for (const f of git("ls-tree", "--name-only", ref, `sections/${item.type}/`).split("\n").filter(Boolean)) files[f.split("/").pop()] = git("show", `${ref}:${f}`);
    } else {
      const dir = join(root, "sections", item.type);
      if (!existsSync(dir)) {
        console.log(`  ✗ ${item.type} introuvable, laissée telle quelle`);
        continue;
      }
      for (const f of await readdir(dir)) files[f] = await readFile(join(dir, f), "utf8");
    }
    if (!files["template.liquid"]) {
      console.log(`  ✗ ${item.type} : pas de template, laissée telle quelle`);
      continue;
    }
    const out = join(root, "sections", id);
    await mkdir(out, { recursive: true });
    for (const [f, text] of Object.entries(files)) {
      // « atl-x-p1 » mais pas « atl-x-p10 ».
      let t = text.replace(new RegExp(`atl-${item.type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9])`, "g"), `atl-${id}`);
      if (f === "meta.json") {
        const meta = JSON.parse(t);
        meta.pageSpecific = true;
        meta.figeeDepuis = item.type;
        t = JSON.stringify(meta, null, 2) + "\n";
      }
      await writeFile(join(out, f), t);
    }
    done.set(item.type, id);
    console.log(`  ✓ ${item.type} → ${id}${fromGit.has(m[1]) ? " (ancienne version)" : ""}`);
  }
  item.type = done.get(item.type) ?? item.type;
}
await writeFile(pageFile, JSON.stringify(data, null, 2) + "\n");
console.log(`${page} : ${done.size} section(s) figée(s).`);
