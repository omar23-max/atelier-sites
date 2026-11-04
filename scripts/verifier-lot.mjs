// Vérification complète (atelier + Copycat + PWC) de plusieurs pages, quelques
// unes en parallèle, puis un bilan : imports/_bilan-verification.json.
//
//   node scripts/verifier-lot.mjs <slug> [<slug> …] [--paralleles 3]
//   node scripts/verifier-lot.mjs --kimi          (toutes les pages importées de Kimi)
//
// Chaque page : node scripts/verifier-import.mjs <slug> (journal dans
// imports/<slug>/verification.log). L'atelier doit tourner.
import { spawn } from "node:child_process";
import { existsSync, createWriteStream } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const at = args.indexOf("--paralleles");
const workers = at >= 0 ? Number(args.splice(at, 2)[1]) || 2 : 2;
let slugs = args.filter((a) => !a.startsWith("--"));
if (args.includes("--kimi")) slugs = (await readdir(join(root, "imports"))).filter((s) => existsSync(join(root, "imports", s, "kimi.json")) && existsSync(join(root, "imports", s, "template.json")));
if (!slugs.length) {
  console.error("Usage : node scripts/verifier-lot.mjs <slug> [<slug> …] [--paralleles 3] | --kimi");
  process.exit(1);
}
console.log(`${slugs.length} page(s) à vérifier, ${workers} à la fois.`);

const queue = [...slugs];
let done = 0;
async function worker() {
  while (queue.length) {
    const slug = queue.shift();
    const log = createWriteStream(join(root, "imports", slug, "verification.log"));
    await new Promise((resolve) => {
      const child = spawn(process.execPath, [join(root, "scripts", "verifier-import.mjs"), slug], { cwd: root, windowsHide: true });
      child.stdout.pipe(log);
      child.stderr.pipe(log);
      const timer = setTimeout(() => child.kill(), 3600000);
      child.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    done++;
    const v = JSON.parse(await readFile(join(root, "imports", slug, "template.json"), "utf8")).verification ?? {};
    console.log(`[${done}/${slugs.length}] ${slug} · atelier ${v.score ?? "—"} · Copycat ${v.copycat?.note ?? v.copycat?.erreur ?? "—"} · PWC ${v.pwc?.ssim ?? v.pwc?.erreur ?? "—"}`);
  }
}
await Promise.all(Array.from({ length: workers }, worker));

// Bilan : une ligne par page, les plus éloignées de l'original d'abord.
const rows = [];
for (const slug of slugs) {
  const v = JSON.parse(await readFile(join(root, "imports", slug, "template.json"), "utf8")).verification ?? {};
  rows.push({
    slug,
    atelier: v.score ?? null,
    visuel: v.visuel ?? null,
    copycat: v.copycat?.note ?? null,
    copycatEcart: v.copycat?.ecarts?.desktop ?? null,
    pwc: v.pwc?.ssim ?? null,
    pwcCapture: v.pwc?.captureOriginal ?? null,
    erreurs: [v.copycat?.erreur, v.pwc?.erreur].filter(Boolean),
  });
}
rows.sort((a, b) => (a.pwc ?? 0) - (b.pwc ?? 0));
await writeFile(join(root, "imports", "_bilan-verification.json"), JSON.stringify({ date: new Date().toISOString(), pages: rows }, null, 2), "utf8");
console.log(`\nBilan : imports/_bilan-verification.json (${rows.length} pages)`);
