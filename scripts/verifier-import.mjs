// Contrôle automatique d'un import, lancé une seule fois à la fin de
// advertorial-page.mjs (pas de re-vérification des pages déjà copiées).
//
//   node scripts/verifier-import.mjs <slug> [--copycat]
//
// 1. Vérificateur maison (scripts/verifier-miroir.mjs) : score / 100 contre la
//    capture enregistrée, site changé ou non, diff visuel.
// 2. Si le score est sous 95 ou si plus de 25 % des pixels diffèrent (ou avec
//    --copycat) : Copycat capture le site sur 3 largeurs et compare la copie
//    → imports/<slug>/copycat/compare/REPORT.md.
// Le résumé est enregistré dans imports/<slug>/template.json (« verification »).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [slug] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const force = process.argv.includes("--copycat");
const ORIGIN = process.env.ATL_SERVEUR ?? "http://localhost:5180";
const dir = join(root, "imports", slug ?? "");
if (!slug || !existsSync(join(dir, "template.json"))) {
  console.error("Usage : node scripts/verifier-import.mjs <slug> [--copycat]");
  process.exit(1);
}
const tplFile = join(dir, "template.json");
const tpl = JSON.parse(await readFile(tplFile, "utf8"));
const page = tpl.page ?? slug;

// L'atelier doit tourner : la copie est mesurée sur /partage/<page>.
const up = await fetch(`${ORIGIN}/`).then(() => true, () => false);
if (!up) {
  console.log(`  ⚠ Vérification sautée : l'atelier ne répond pas (${ORIGIN}). Plus tard : node scripts/verifier-import.mjs ${slug}`);
  process.exit(0);
}

const node = (args, timeout) => execFileSync(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], timeout }).toString();

console.log(`\nVérification de l'import « ${slug} »…`);
try {
  node([join(root, "scripts", "verifier-miroir.mjs"), slug, page], 600000);
} catch (e) {
  console.log(`  ✗ vérificateur : ${String(e.message).split("\n")[0]}`);
}
const report = existsSync(join(dir, "verification.json")) ? JSON.parse(await readFile(join(dir, "verification.json"), "utf8")) : {};
const summary = {
  date: new Date().toISOString(),
  score: report.score ?? null,
  visuel: report.visuel?.ecart ?? null,
  siteChange: report.siteChange?.score ?? null,
};
console.log(`  Score ${summary.score ?? "—"} / 100 · visuel ${summary.visuel ?? "—"} % de pixels différents`);

// Copycat seulement quand il y a quelque chose à diagnostiquer.
const needed = force || summary.score == null || summary.score < 95 || (summary.visuel ?? 0) > 25;
const copycat = join(root, ".claude", "skills", "copycat", "scripts");
if (needed && existsSync(join(copycat, "node_modules"))) {
  const url = tpl.urlComplete ?? tpl.url;
  const out = join(dir, "copycat");
  try {
    console.log("  Copycat : capture du site (3 largeurs, ~4 min)…");
    node([join(copycat, "capture.mjs"), url, "--out", out, "--channel", "msedge", "--no-hover"], 900000);
    console.log("  Copycat : comparaison avec la copie (~2 min)…");
    node([join(copycat, "compare.mjs"), "--original", out, "--clone", `${ORIGIN}/partage/${encodeURIComponent(page)}`, "--channel", "msedge"], 900000);
    const r = JSON.parse(await readFile(join(out, "compare", "result.json"), "utf8"));
    summary.copycat = { note: r.verdict?.grade ?? null, ecarts: Object.fromEntries(Object.entries(r.viewports ?? {}).map(([k, v]) => [k, v.diff?.mismatchPercent ?? null])), rapport: `imports/${slug}/copycat/compare/REPORT.md` };
    console.log(`  Copycat : ${summary.copycat.note} · ${summary.copycat.rapport}`);
  } catch (e) {
    summary.copycat = { erreur: String(e.message).split("\n")[0] };
    console.log(`  ✗ Copycat : ${summary.copycat.erreur}`);
  }
} else if (needed) {
  console.log("  Copycat non installé (.claude/skills/copycat) : diagnostic détaillé sauté.");
}

tpl.verification = summary;
await writeFile(tplFile, JSON.stringify(tpl, null, 2), "utf8");
