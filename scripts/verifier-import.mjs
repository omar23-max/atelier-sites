// Contrôle de chaque import, quel que soit son chemin (adresse d'un site,
// zip de Kimi ou d'une autre IA) : lancé à la fin de advertorial-page.mjs et
// de kimi-zip.mjs. Les trois outils passent TOUJOURS (demande du 2026-11-03).
//
//   node scripts/verifier-import.mjs <slug> [--pwc-seul]
//
// 1. Vérificateur maison (scripts/verifier-miroir.mjs) : score / 100, site
//    changé ou non, diff visuel.
// 2. Copycat : capture du site sur 3 largeurs et comparaison avec la copie
//    → imports/<slug>/copycat/compare/REPORT.md.
// 3. PWC (Perfect Web Clone, C:/Users/HP/outils) : sa capture de l'original
//    (C:/Users/HP/outils/pwc-sources/<slug>) contre la copie à 1440 px, note
//    SSIM et bandes les moins ressemblantes (scripts/pwc-score.py)
//    → imports/<slug>/pwc/.
// Le résumé est enregistré dans imports/<slug>/template.json (« verification »).
import { execFileSync } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [slug] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ORIGIN = process.env.ATL_SERVEUR ?? "http://localhost:5180";
const dir = join(root, "imports", slug ?? "");
if (!slug || !existsSync(join(dir, "template.json"))) {
  console.error("Usage : node scripts/verifier-import.mjs <slug>");
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

// --pwc-seul : refait seulement PWC (rattrapage), le reste du résumé est gardé.
const pwcSeul = process.argv.includes("--pwc-seul") && tpl.verification;
const url = tpl.urlComplete ?? tpl.url;
let summary;
console.log(`\nVérification de l'import « ${slug} »…`);
if (pwcSeul) {
  summary = { ...tpl.verification, outils: (tpl.verification.outils ?? []).filter((o) => o !== "pwc") };
} else {
  try {
    node([join(root, "scripts", "verifier-miroir.mjs"), slug, page], 600000);
  } catch (e) {
    console.log(`  ✗ vérificateur : ${String(e.message).split("\n")[0]}`);
  }
  const report = existsSync(join(dir, "verification.json")) ? JSON.parse(await readFile(join(dir, "verification.json"), "utf8")) : {};
  summary = {
    date: new Date().toISOString(),
    score: report.score ?? null,
    visuel: report.visuel?.ecart ?? null,
    siteChange: report.siteChange?.score ?? null,
  };
  console.log(`  Fidélité ${summary.score ?? "—"} / 100 · visuel ${summary.visuel ?? "—"} % de pixels différents`);
  summary.outils = ["atelier"];
}

const copycat = join(root, ".claude", "skills", "copycat", "scripts");
if (pwcSeul) {
  // Copycat déjà passé.
} else if (!url) {
  console.log("  ⚠ Pas d'adresse d'origine : Copycat et PWC sautés.");
} else if (existsSync(join(copycat, "node_modules"))) {
  summary.outils.push("copycat");
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
} else {
  console.log("  ⚠ Copycat non installé (.claude/skills/copycat) : diagnostic détaillé sauté.");
}

// PWC : sa capture de l'original (gardée même si son contrôle d'intégrité la
// juge instable : carrousel en mouvement…), puis la copie dans Edge à la même
// largeur, et sa note de ressemblance.
const PWC = "C:/Users/HP/outils";
const pwcExe = join(PWC, "pwc-venv", "Scripts", "pwc.exe");
if (url && existsSync(pwcExe)) {
  summary.outils.push("pwc");
  const sources = join(PWC, "pwc-sources", slug);
  const out = join(dir, "pwc");
  await mkdir(out, { recursive: true });
  try {
    console.log("  PWC : capture de l'original (~2 min)…");
    // Le rapport de PWC peut peser plusieurs Mo (d'où maxBuffer) ; illisible,
    // on prend la capture la plus récente du dossier.
    const startedAt = Date.now();
    const parse = (text) => {
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    };
    let capture = {};
    try {
      capture = parse(execFileSync(pwcExe, ["extract", url], { env: { ...process.env, PWC_SOURCES_DIR: sources }, stdio: ["ignore", "pipe", "pipe"], timeout: 900000, maxBuffer: 512 * 1024 * 1024 }).toString());
    } catch (e) {
      // ok: false sort avec un code d'erreur, mais la capture est là.
      capture = parse(String(e.stdout ?? ""));
    }
    let sourceDir = capture.summary?.storage_dir ?? (capture.source_id ? join(sources, capture.source_id) : null);
    if (!sourceDir && existsSync(sources)) {
      const dirs = (await readdir(sources)).map((d) => join(sources, d)).filter((d) => statSync(d).mtimeMs >= startedAt - 5000);
      sourceDir = dirs.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs).pop() ?? "";
      if (sourceDir && existsSync(join(sourceDir, "capture_integrity.json"))) capture.summary = { capture_integrity: parse(await readFile(join(sourceDir, "capture_integrity.json"), "utf8")) };
    }
    sourceDir ??= "";
    const attempts = existsSync(join(sourceDir, "attempts")) ? (await readdir(join(sourceDir, "attempts"))).sort() : [];
    // Capture réussie du premier coup : evidence/ ; sinon la dernière tentative.
    const ref = [join(sourceDir, "evidence", "raw_full.png"), ...attempts.map((a) => join(sourceDir, "attempts", a, "raw_full.png"))].filter(existsSync).pop();
    if (!ref) throw new Error(capture.error ?? "pas de capture de l'original");

    const browser = await chromium.launch({ channel: "msedge", headless: true });
    const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await tab.goto(`${ORIGIN}/partage/${encodeURIComponent(page)}`, { waitUntil: "load", timeout: 120000 });
    // Défilement complet : images différées chargées.
    await tab.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      scrollTo(0, 0);
    });
    await tab.waitForTimeout(800);
    const cand = join(out, "copie.png");
    await tab.screenshot({ path: cand, fullPage: true, timeout: 180000, animations: "disabled" });
    await browser.close();

    const python = join(PWC, "pwc-venv", "Scripts", "python.exe");
    const r = JSON.parse(execFileSync(python, [join(root, "scripts", "pwc-score.py"), ref, cand], { stdio: ["ignore", "pipe", "pipe"], timeout: 600000 }).toString());
    summary.pwc = { ...r, captureOriginal: capture.summary?.capture_integrity?.status ?? (capture.ok ? "passed" : "instable"), original: ref };
    await writeFile(join(out, "result.json"), JSON.stringify(summary.pwc, null, 2), "utf8");
    console.log(`  PWC : ressemblance ${r.ssim} (seuil ${r.seuil}) · pire zone ${r.pires_bandes[0]?.de}–${r.pires_bandes[0]?.a} % de la page`);
  } catch (e) {
    summary.pwc = { erreur: String(e.message).split("\n")[0] };
    console.log(`  ✗ PWC : ${summary.pwc.erreur}`);
  }
} else if (url) {
  console.log("  ⚠ PWC non installé (C:/Users/HP/outils/pwc-venv) : sauté.");
}

tpl.verification = summary;
await writeFile(tplFile, JSON.stringify(tpl, null, 2), "utf8");
