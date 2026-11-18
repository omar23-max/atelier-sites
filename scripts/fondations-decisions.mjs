// Décisions des Fondations écrites par Claude (audit ChatGPT F08 / F09,
// 2026-11-18), sans jamais écraser ce que l'utilisateur a écrit.
//
//   node scripts/fondations-decisions.mjs mecanismes <projet> <fichier.json> [--dry]
//     fichier = [{ nom, ump, ums, croyance, preuvesNecessaires, preuvesDispo,
//                  limites, interdits, origine }]
//     → ajoutées comme pistes « hypothèse » (5 pistes au plus en tout ; la
//       piste choisie et les pistes existantes ne sont jamais touchées).
//   node scripts/fondations-decisions.mjs fiche <projet> <fichier.json> [--dry]
//     fichier = fiche d'offre (voir src/engine/offre-fiche.js)
//     → seuls les champs vides de la fiche du projet sont remplis ; les packs
//       et bonus seulement s'il n'y en a aucun.
// Copie du projet dans projets/_historique/ avant d'écrire.
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { realText } = await import(pathToFileURL(join(root, "src", "engine", "fondations-etat.js")).href);
const { controlesFiche } = await import(pathToFileURL(join(root, "src", "engine", "offre-fiche.js")).href);
const [cmd, projet, fichier] = process.argv.slice(2);
const dry = process.argv.includes("--dry");
if (!["mecanismes", "fiche"].includes(cmd) || !projet || !fichier) {
  console.error("Usage : node scripts/fondations-decisions.mjs mecanismes|fiche <projet> <fichier.json> [--dry]");
  process.exit(1);
}
const file = join(root, "projets", `${projet}.json`);
if (!existsSync(file)) {
  console.error(`Projet introuvable : projets/${projet}.json`);
  process.exit(1);
}
const project = JSON.parse(await readFile(file, "utf8"));
const input = JSON.parse(await readFile(fichier, "utf8"));
const MAX = 5;

if (cmd === "mecanismes") {
  const list = Array.isArray(input) ? input : input.mecanismes ?? [];
  const fd = (project.fondations ??= {});
  const exist = fd.mecanismes ?? [];
  if (exist.length + list.length > MAX) {
    console.error(`Refusé : ${exist.length} piste(s) existent déjà, ${list.length} proposée(s) ; ${MAX} au plus. Propose-en moins, ou demande à l'utilisateur lesquelles retirer.`);
    process.exit(1);
  }
  const champs = ["nom", "ump", "ums", "croyance", "preuvesNecessaires", "preuvesDispo", "limites", "interdits"];
  const nouvelles = list.map((m, i) => ({ id: `m${Date.now().toString(36)}${i}`, ...Object.fromEntries(champs.map((k) => [k, String(m[k] ?? "")])), statut: "hypothese", origine: m.origine ?? "Claude" }));
  for (const m of nouvelles) if (!realText(m.ums)) console.warn(`Attention : piste « ${m.nom} » sans mécanisme de la solution.`);
  fd.mecanismes = [...exist, ...nouvelles];
  fd.mecanismesProposesLe = new Date().toISOString();
  console.log(`${nouvelles.length} piste(s) ajoutée(s) (${fd.mecanismes.length} en tout), toutes « hypothèse ».`);
} else {
  const cur = project.offreFiche ?? {};
  const vide = (v) => v == null || (typeof v === "string" && !v.trim());
  const out = { ...cur };
  for (const k of ["devise", "unite"]) if (vide(out[k]) && !vide(input[k])) out[k] = input[k];
  for (const k of ["garantie", "retours", "livraison", "rarete"]) {
    if (!input[k]) continue;
    out[k] = { ...(cur[k] ?? {}) };
    for (const [kk, v] of Object.entries(input[k])) if (vide(out[k][kk])) out[k][kk] = v;
  }
  if (!(cur.packs ?? []).length && Array.isArray(input.packs)) out.packs = input.packs.map((p, i) => ({ id: `p${Date.now().toString(36)}${i}`, ...p }));
  if (!(cur.bonus ?? []).length && Array.isArray(input.bonus)) out.bonus = input.bonus.map((b, i) => ({ id: `b${Date.now().toString(36)}${i}`, livre: false, ...b }));
  if (input.leviers) {
    out.leviers = { ...(cur.leviers ?? {}) };
    for (const [k, v] of Object.entries(input.leviers)) {
      out.leviers[k] = { ...(out.leviers[k] ?? {}) };
      for (const [kk, vv] of Object.entries(v ?? {})) if (vide(out.leviers[k][kk])) out.leviers[k][kk] = vv;
    }
  }
  project.offreFiche = out;
  const ctrl = controlesFiche(out);
  console.log(`Fiche d'offre complétée (champs vides seulement). Contrôles : ${ctrl.length ? `\n  ${ctrl.map((c) => `${c.niveau} : ${c.texte}`).join("\n  ")}` : "aucun problème"}`);
}

if (dry) {
  console.log("(--dry : rien n'est écrit)");
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await mkdir(join(root, "projets", "_historique"), { recursive: true });
await copyFile(file, join(root, "projets", "_historique", `${projet}--${stamp}.json`));
await writeFile(file, JSON.stringify(project, null, 2) + "\n", "utf8");
console.log(`Écrit : projets/${projet}.json (copie : projets/_historique/${projet}--${stamp}.json)`);
