// Page Score et sections proposées pour des templates déjà importés, sans
// refaire leur copie (les nouveaux imports le font seuls : advertorial-page.mjs).
//
//   node scripts/proposer-sections.mjs [slug…]   (sans argument : ceux qui n'en ont pas)
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { proposeSections } from "./lib/propositions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const rows = [];
for (const slug of await readdir(join(root, "imports"))) {
  const tplFile = join(root, "imports", slug, "template.json");
  if (!existsSync(tplFile)) continue;
  const tpl = JSON.parse(await readFile(tplFile, "utf8"));
  if (only.length ? !only.includes(slug) : tpl.propositions && !process.argv.includes("--tous")) continue;
  const pageFile = join(root, "pages", `${tpl.page ?? slug}.json`);
  if (!existsSync(pageFile)) continue;
  const page = JSON.parse(await readFile(pageFile, "utf8"));
  const props = await proposeSections(root, page);
  if (!props) {
    console.log(`– ${slug} : type de page inconnu`);
    continue;
  }
  tpl.propositions = props;
  await writeFile(tplFile, JSON.stringify(tpl, null, 2), "utf8");
  page.root.props.propositionsImport = { date: props.date, score: props.score, sections: props.manquantes.map((m) => m.section) };
  await writeFile(pageFile, JSON.stringify(page, null, 2), "utf8");
  rows.push([props.score, slug, props.manquantes.map((m) => `${m.section} (${m.ou})`).join(" · ")]);
}
for (const [score, slug, list] of rows.sort((a, b) => a[0] - b[0])) console.log(`${String(score).padStart(3)}  ${slug.padEnd(30)} ${list || "rien à ajouter"}`);
console.log(`${rows.length} page(s) notée(s).`);
