// Ajoute aux design.md existants les styles réels de leur page d'origine
// (jetons « styles » : en-tête, titres, sous-titre, texte, bouton).
//
//   node scripts/designs-styles.mjs [id…]
//
// La page d'origine est imports/<id sans -design>/snapshot.json.
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { measureStyles } from "./lib/typo.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2);
let done = 0;
for (const file of (await readdir(join(root, "designs"))).filter((f) => f.endsWith(".md"))) {
  const id = file.replace(/\.md$/, "");
  if (only.length && !only.includes(id)) continue;
  const snapFile = join(root, "imports", id.replace(/-design$/, ""), "snapshot.json");
  if (!existsSync(snapFile)) {
    console.log(`– ${id} : pas de capture d'origine`);
    continue;
  }
  const md = await readFile(join(root, "designs", file), "utf8");
  const m = /```json\s*([\s\S]*?)```/.exec(md);
  if (!m) continue;
  const tokens = JSON.parse(m[1]);
  tokens.styles = measureStyles(JSON.parse(await readFile(snapFile, "utf8")));
  await writeFile(join(root, "designs", file), md.replace(m[1], `${JSON.stringify(tokens, null, 2)}\n`), "utf8");
  console.log(`✓ ${id} : ${Object.keys(tokens.styles).join(", ")}`);
  done++;
}
console.log(`${done} design(s) mis à jour.`);
