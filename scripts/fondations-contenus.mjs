// Cartes « Contenu par type de page » des Fondations (partie 9) : l'outil de
// Claude pour les remplir sans jamais écraser ce que l'utilisateur a écrit.
//
//   node scripts/fondations-contenus.mjs lister <projet> [type,type…]
//     → imprime, pour chaque type demandé (tous par défaut), les sections dans
//       l'ordre, la raison de chaque section, ses champs (libellé + aide) et la
//       valeur déjà enregistrée. Sert de plan de rédaction.
//   node scripts/fondations-contenus.mjs modele <projet> [type,…] > fichier.json
//     → un fichier { type: { section: { champ: "" } } } avec seulement les
//       champs encore vides, à remplir.
//   node scripts/fondations-contenus.mjs ecrire <projet> <fichier.json> [--dry]
//     → fusionne le fichier dans fondations.contenus. Un champ déjà rempli
//       n'est JAMAIS remplacé ; un champ inconnu du plan est refusé. Copie de
//       sécurité du projet dans projets/_historique/ avant d'écrire.
//
// Le plan (sections, champs) vient de src/engine/page-blueprints.js, la même
// liste que le Page Score. Règle de l'atelier : aucune preuve, aucun chiffre,
// aucun avis inventé — ce qui manque s'écrit « [MANQUE : …] ».
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { TYPES_CONTENU, FICHES, blueprintOf } = await import(pathToFileURL(join(root, "src", "engine", "page-blueprints.js")).href);

const [cmd, projet, ...rest] = process.argv.slice(2);
const dry = rest.includes("--dry");
const args = rest.filter((a) => !a.startsWith("--"));
if (!["lister", "modele", "ecrire"].includes(cmd) || !/^[a-z0-9][a-z0-9-]*$/.test(projet ?? "")) {
  console.error("Usage : node scripts/fondations-contenus.mjs lister|modele|ecrire <projet> [types | fichier.json] [--dry]");
  process.exit(1);
}
const file = join(root, "projets", `${projet}.json`);
if (!existsSync(file)) {
  console.error(`Projet introuvable : projets/${projet}.json`);
  process.exit(1);
}
const project = JSON.parse(await readFile(file, "utf8"));
const contenus = project.fondations?.contenus ?? {};
const filled = (v) => Boolean(String(v ?? "").trim());

if (cmd === "lister" || cmd === "modele") {
  const types = args[0] ? args[0].split(",") : TYPES_CONTENU;
  const unknown = types.filter((t) => !TYPES_CONTENU.includes(t));
  if (unknown.length) {
    console.error(`Type(s) inconnu(s) : ${unknown.join(", ")}. Types : ${TYPES_CONTENU.join(", ")}`);
    process.exit(1);
  }
  if (cmd === "modele") {
    const out = {};
    for (const type of types) {
      for (const s of blueprintOf(type)) {
        for (const ch of s.champs) {
          if (filled(contenus[type]?.[s.key]?.[ch.k])) continue;
          ((out[type] ??= {})[s.key] ??= {})[ch.k] = "";
        }
      }
    }
    console.log(JSON.stringify(out, null, 2));
  } else {
    for (const type of types) {
      const f = FICHES[type];
      console.log(`\n=== ${type} — ${f.famille}\nTrafic : ${f.trafic}\nMission : ${f.mission}\nRègles : ${f.regles.join(" | ")}`);
      for (const s of blueprintOf(type)) {
        console.log(`\n[${s.key}] ${s.label} (${s.zone}) — ${s.why}`);
        for (const ch of s.champs) {
          const v = contenus[type]?.[s.key]?.[ch.k];
          console.log(`  · ${ch.k} — ${ch.label} (${ch.rows} ligne(s)) : ${ch.hint}${filled(v) ? `\n    DÉJÀ REMPLI : ${String(v).replace(/\n/g, " ⏎ ")}` : ""}`);
        }
      }
    }
  }
  process.exit(0);
}

// ---- ecrire ----
const src = args[0];
if (!src || !existsSync(src)) {
  console.error("Fichier à fusionner introuvable.");
  process.exit(1);
}
const incoming = JSON.parse(await readFile(src, "utf8"));
const next = JSON.parse(JSON.stringify(contenus));
let written = 0;
let kept = 0;
let empty = 0;
const refused = [];
for (const [type, sections] of Object.entries(incoming)) {
  const plan = TYPES_CONTENU.includes(type) ? Object.fromEntries(blueprintOf(type).map((s) => [s.key, new Set(s.champs.map((c) => c.k))])) : null;
  for (const [key, champs] of Object.entries(sections ?? {})) {
    for (const [k, v] of Object.entries(champs ?? {})) {
      if (!plan?.[key]?.has(k)) {
        refused.push(`${type}.${key}.${k}`);
        continue;
      }
      if (!filled(v)) {
        empty++;
        continue;
      }
      if (filled(next[type]?.[key]?.[k])) {
        kept++;
        continue;
      }
      ((next[type] ??= {})[key] ??= {})[k] = String(v).trim();
      written++;
    }
  }
}
if (refused.length) console.error(`Refusé (champ absent du plan) : ${refused.join(", ")}`);
console.log({ ecrits: written, dejaRemplisGardes: kept, laissesVides: empty, refuses: refused.length, dry });
if (!dry && written) {
  const histo = join(root, "projets", "_historique");
  await mkdir(histo, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(join(histo, `${projet}--${stamp}.json`), JSON.stringify(project, null, 2) + "\n", "utf8");
  // Relire le projet : il a pu être enregistré depuis (onglet ouvert).
  const fresh = JSON.parse(await readFile(file, "utf8"));
  const cur = fresh.fondations?.contenus ?? {};
  for (const [type, sections] of Object.entries(next)) {
    for (const [key, champs] of Object.entries(sections)) {
      for (const [k, v] of Object.entries(champs)) {
        if (!filled(cur[type]?.[key]?.[k])) ((cur[type] ??= {})[key] ??= {})[k] = v;
      }
    }
  }
  fresh.fondations = { ...(fresh.fondations ?? {}), contenus: cur, contenusRemplisLe: new Date().toISOString() };
  await writeFile(file, JSON.stringify(fresh, null, 2) + "\n", "utf8");
  console.log(`Écrit : projets/${projet}.json (copie : projets/_historique/${projet}--${stamp}.json)`);
}
