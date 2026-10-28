// Sauvegarde automatique sur GitHub (dépôt privé omar23-max/atelier-sites).
// Lancé toutes les heures par une tâche Windows (« Atelier — sauvegarde
// GitHub ») ; à la main : npm run sauvegarde
//
// S'il y a des changements, crée une version (« Sauvegarde automatique — date »)
// et l'envoie. Sans changement, ne fait rien. Hors ligne, la version reste sur
// le PC et partira au prochain passage. Ce que .gitignore exclut (imports,
// vidéos, medias, demandes, corbeille…) n'est jamais envoyé.
// Journal : .git/sauvegarde.log (jamais envoyé).
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const log = (msg) => appendFileSync(join(root, ".git", "sauvegarde.log"), `${new Date().toISOString()}  ${msg}\n`);
// Délai maximal par commande : hors ligne, un envoi ne bloque plus 5 minutes.
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: args[0] === "push" ? 90000 : 120000 }).trim();

// Un seul passage à la fois, synchro Supabase comprise (un verrou de plus de
// 45 minutes est considéré mort).
const lock = join(root, ".git", "sauvegarde.lock");
if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs < 45 * 60 * 1000) process.exit(0);
writeFileSync(lock, String(process.pid));

try {
  git("add", "-A");
  const staged = git("diff", "--cached", "--name-only");
  if (staged) {
    const files = staged.split("\n");
    const when = new Date().toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" });
    git("commit", "-q", "-m", `Sauvegarde automatique — ${when}`, "-m", `${files.length} fichier(s) : ${files.slice(0, 8).join(", ")}${files.length > 8 ? "…" : ""}`);
    log(`version créée (${files.length} fichier(s))`);
  }
  // Envoie aussi les versions restées sur le PC lors d'un passage hors ligne.
  const ahead = Number(git("rev-list", "--count", "@{u}..HEAD") || 0);
  if (ahead > 0) {
    git("push", "-q");
    log(`envoyé sur GitHub (${ahead} version(s))`);
    console.log(`✓ ${ahead} version(s) envoyée(s) sur GitHub.`);
  } else if (!staged) {
    console.log("Rien de nouveau à sauvegarder.");
  }
} catch (e) {
  log(`ÉCHEC : ${String(e.stderr || e.message).trim().split("\n")[0]}`);
  console.error(`✗ Sauvegarde impossible : ${String(e.stderr || e.message).trim()}`);
  process.exitCode = 1;
}

// Puis la base Supabase (sans effet tant qu'elle n'est pas reliée).
try {
  const out = execFileSync(process.execPath, [join(root, "scripts", "sync-supabase.mjs")], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20 * 60 * 1000 }).trim();
  if (!out.startsWith("Supabase n'est pas encore relié")) log(out);
} catch (e) {
  log(`ÉCHEC Supabase : ${String(e.stdout || e.stderr || e.message).trim().split("\n")[0]}`);
} finally {
  // Verrou retiré à la toute fin : la synchro Supabase en fait partie.
  rmSync(lock, { force: true });
}
