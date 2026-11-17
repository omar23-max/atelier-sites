// Polices restées sur le site d'origine (2026-11-17).
// Une copie garde parfois l'adresse d'une police sur le site copié
// (url(https://site.com/…/police.woff2)). Si ce site refuse qu'une autre
// adresse la charge (pas d'en-tête Access-Control-Allow-Origin), l'éditeur
// affiche une police de secours. Ici : chaque adresse est testée ; seules les
// polices bloquées sont téléchargées dans imports/_polices/ (usage interne de
// l'atelier, comme les autres polices des copies ; jamais dans l'export ZIP)
// et le style.css de la section pointe vers la copie locale.
//
//   node scripts/apres-import/polices-locales.mjs --dry      bilan sans rien changer
//   node scripts/apres-import/polices-locales.mjs            téléchargement + réécriture
//   node scripts/apres-import/polices-locales.mjs --ids a,b  quelques sections seulement
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const sectionsDir = join(root, "sections");
const outDir = join(root, "imports", "_polices");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const idsArg = args.includes("--ids") ? args[args.indexOf("--ids") + 1].split(",") : null;
const FONT = /url\(\s*(["']?)(https?:\/\/[^)"'\s]+?\.(?:woff2?|ttf|otf|eot)(?:[?#][^)"'\s]*)?)\1\s*\)/gi;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const ids = idsArg ?? (await readdir(sectionsDir));
const uses = new Map(); // url → [id]
for (const id of ids) {
  const f = join(sectionsDir, id, "style.css");
  if (!existsSync(f)) continue;
  const css = await readFile(f, "utf8");
  for (const m of css.matchAll(FONT)) {
    if (!uses.has(m[2])) uses.set(m[2], new Set());
    uses.get(m[2]).add(id);
  }
}
console.log(`${uses.size} adresses de police externes dans ${new Set([...uses.values()].flatMap((s) => [...s])).size} sections`);

const localName = (url) => `${createHash("sha1").update(url).digest("hex").slice(0, 12)}-${basename(new URL(url).pathname).replace(/[^\w.-]/g, "_").slice(0, 80)}`;
const verdict = new Map(); // url → "ok" | "local" | "absente" | "erreur"
async function check(url) {
  const name = localName(url);
  if (existsSync(join(outDir, name))) return verdict.set(url, "local");
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Origin: "https://atelier.nive.ca", Referer: new URL(url).origin + "/" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return verdict.set(url, res.status === 404 || res.status === 410 ? "absente" : "erreur");
    const acao = res.headers.get("access-control-allow-origin");
    if (acao === "*" || acao === "https://atelier.nive.ca") {
      await res.body?.cancel();
      return verdict.set(url, "ok");
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200 || /^\s*</.test(buf.subarray(0, 20).toString())) return verdict.set(url, "erreur");
    if (!dry) {
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, name), buf);
    }
    verdict.set(url, "local");
  } catch {
    verdict.set(url, "erreur");
  }
}
// Police disparue ou injoignable : l'import l'a peut-être déjà rangée
// (imports/<site>/assets/<empreinte>-<nom>) ; on reprend cette copie.
const known = new Map(); // nom de fichier → /imports/<site>/assets/<fichier>
for (const site of existsSync(join(root, "imports")) ? await readdir(join(root, "imports")) : []) {
  const dir = join(root, "imports", site, "assets");
  if (!existsSync(dir)) continue;
  for (const f of await readdir(dir)) if (/\.(woff2?|ttf|otf|eot)$/i.test(f)) known.set(f.replace(/^[0-9a-f]{12}-/, "").toLowerCase(), `/imports/${site}/assets/${f}`);
}
const found = new Map(); // url → chemin local existant
const queue = [...uses.keys()];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) await check(queue.shift());
  }),
);
for (const [url, v] of verdict) {
  if (v !== "absente" && v !== "erreur") continue;
  const hit = known.get(basename(new URL(url).pathname).toLowerCase());
  if (hit) {
    found.set(url, hit);
    verdict.set(url, "retrouvee");
  }
}
const count = (v) => [...verdict.values()].filter((x) => x === v).length;
console.log(`déjà chargeables : ${count("ok")} · bloquées → copie locale : ${count("local")} · disparues du site (404) : ${count("absente")} · injoignables : ${count("erreur")} · retrouvées dans imports/ : ${count("retrouvee")}`);

if (!dry) {
  const touched = new Set();
  for (const [url, v] of verdict) if (v === "local" || v === "retrouvee") for (const id of uses.get(url)) touched.add(id);
  for (const id of touched) {
    const f = join(sectionsDir, id, "style.css");
    const css = await readFile(f, "utf8");
    const next = css.replace(FONT, (all, q, url) => (verdict.get(url) === "local" ? `url(${q}/imports/_polices/${localName(url)}${q})` : found.has(url) ? `url(${q}${found.get(url)}${q})` : all));
    if (next !== css) await writeFile(f, next, "utf8");
  }
  console.log(`${touched.size} sections réécrites (style.css)`);
}
