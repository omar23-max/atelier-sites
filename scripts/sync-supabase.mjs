// Synchronise l'atelier vers la base Supabase (miroir en ligne).
//   npm run sync          tout envoyer (seulement ce qui a changé pour les images)
//   npm run sync -- --verifier   tester la connexion sans rien écrire
// Lancé aussi par la sauvegarde automatique (toutes les 15 minutes).
//
// Les fichiers du dossier restent la référence : la base reçoit projets, pages
// (et leur historique), sections, designs, templates, demandes, et les images
// créées dans l'atelier (bucket « medias »). Ce qui a disparu des fichiers est
// marqué « supprimé » (supprime_le), jamais effacé. Les photos d'origine des
// sites importés ne partent jamais.
// Connexion : .env.local (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), jamais sur GitHub.
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const verifyOnly = process.argv.includes("--verifier");

// ---- Connexion ----
function readEnv() {
  const file = join(root, ".env.local");
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
  );
}
const env = { ...readEnv(), ...process.env };
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("Supabase n'est pas encore relié (.env.local absent ou incomplet) : rien à synchroniser.");
  process.exit(0);
}
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const list = async (dir) => (existsSync(dir) ? readdir(dir) : []);
const stampToIso = (s) => {
  const m = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(s ?? "");
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
};
const now = new Date().toISOString();

async function upsert(table, rows, key = "id") {
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 200), { onConflict: key });
    if (error) throw new Error(`${table} : ${error.message}`);
  }
  return rows.length;
}

// Ce qui n'existe plus dans les fichiers : marqué supprimé dans la base.
async function markMissing(table, keep) {
  const { data, error } = await db.from(table).select("id").is("supprime_le", null);
  if (error) throw new Error(`${table} : ${error.message}`);
  const gone = data.map((r) => r.id).filter((id) => !keep.has(id));
  if (gone.length) {
    const { error: e } = await db.from(table).update({ supprime_le: now }).in("id", gone);
    if (e) throw new Error(`${table} : ${e.message}`);
  }
  return gone.length;
}

// ---- Vérification ----
const { error: pingError } = await db.from("projets").select("id", { head: true, count: "exact" });
if (pingError) {
  console.error(`✗ Connexion à Supabase impossible : ${pingError.message}`);
  console.error("  As-tu exécuté supabase/schema.sql dans le SQL Editor de Supabase ?");
  process.exit(1);
}
if (verifyOnly) {
  console.log("✓ Connexion à Supabase réussie, tables présentes.");
  process.exit(0);
}

const report = [];
try {
  // Projets
  const projets = [];
  for (const f of (await list(join(root, "projets"))).filter((x) => x.endsWith(".json"))) {
    const p = await readJson(join(root, "projets", f));
    projets.push({
      id: p.id,
      nom: p.nom,
      produit: p.produit ?? null,
      description: p.description ?? null,
      marque: p.marque ?? {},
      offre: p.offre ?? {},
      creatives: p.creatives ?? [],
      publication: p.publication ?? {},
      cree_le: p.creeLe ?? null,
      ouvert_le: p.ouvertLe ?? null,
      supprime_le: null,
      maj_le: now,
    });
  }
  report.push(`${await upsert("projets", projets)} projet(s)`);
  await markMissing("projets", new Set(projets.map((p) => p.id)));
  const projectIds = new Set(projets.map((p) => p.id));

  // Pages et historique
  const pages = [];
  for (const f of (await list(join(root, "pages"))).filter((x) => x.endsWith(".json"))) {
    const page = await readJson(join(root, "pages", f));
    const r = page.root?.props ?? {};
    pages.push({
      id: f.slice(0, -5),
      projet_id: projectIds.has(r.projet) ? r.projet : null,
      titre: r.title ?? null,
      type_page: r.pageType ?? null,
      profil: r.profil ?? null,
      page_achat: r.pageAchat ?? null,
      design_id: r.design ?? null,
      import_source: r.importSource ?? null,
      contenu: page,
      supprime_le: null,
      maj_le: now,
    });
  }
  report.push(`${await upsert("pages", pages)} page(s)`);
  await markMissing("pages", new Set(pages.map((p) => p.id)));

  const history = [];
  for (const f of (await list(join(root, "pages", "_historique"))).filter((x) => x.endsWith(".json"))) {
    const id = f.slice(0, -5);
    history.push({ id, page_id: id.split("__")[0], le: stampToIso(id), contenu: await readJson(join(root, "pages", "_historique", f)) });
  }
  report.push(`${await upsert("pages_historique", history)} copie(s) de page`);

  // Sections
  const sections = [];
  for (const id of await list(join(root, "sections"))) {
    const dir = join(root, "sections", id);
    if (!existsSync(join(dir, "schema.json"))) continue;
    const meta = existsSync(join(dir, "meta.json")) ? await readJson(join(dir, "meta.json")) : {};
    sections.push({
      id,
      libelle: meta.label ?? null,
      famille: meta.family ?? null,
      statut: meta.status ?? "visible",
      source_url: meta.source?.url ?? null,
      schema: await readJson(join(dir, "schema.json")),
      meta,
      template: await readFile(join(dir, "template.liquid"), "utf8"),
      css: existsSync(join(dir, "style.css")) ? await readFile(join(dir, "style.css"), "utf8") : "",
      miniature: existsSync(join(dir, "thumbnail.png")) ? `catalogue/sections/${id}.png` : null,
      supprime_le: null,
      maj_le: now,
    });
  }
  report.push(`${await upsert("sections", sections)} section(s)`);
  await markMissing("sections", new Set(sections.map((s) => s.id)));

  // Designs
  const designs = [];
  for (const f of (await list(join(root, "designs"))).filter((x) => x.endsWith(".md"))) {
    const id = f.slice(0, -3);
    const markdown = await readFile(join(root, "designs", f), "utf8");
    const block = /```json\s*([\s\S]*?)```/.exec(markdown)?.[1];
    let jetons = {};
    try {
      jetons = block ? JSON.parse(block) : {};
    } catch {
      jetons = {};
    }
    designs.push({
      id,
      titre: /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? id,
      source_url: /^Source\s*:\s*(\S+)/im.exec(markdown)?.[1] ?? null,
      jetons,
      markdown,
      miniature: existsSync(join(root, "designs", `${id}.png`)) ? `catalogue/designs/${id}.png` : null,
      supprime_le: null,
      maj_le: now,
    });
  }
  report.push(`${await upsert("designs", designs)} design(s)`);
  await markMissing("designs", new Set(designs.map((d) => d.id)));

  // Templates (sans les captures ni les photos d'origine)
  const templates = [];
  for (const id of await list(join(root, "imports"))) {
    const dir = join(root, "imports", id);
    if (!existsSync(join(dir, "template.json"))) continue;
    const t = await readJson(join(dir, "template.json"));
    const cap = existsSync(join(dir, "capture.json")) ? await readJson(join(dir, "capture.json")) : {};
    templates.push({
      id,
      nom: t.nom ?? id,
      url: t.url ?? cap.url ?? null,
      type_page: t.pageType ?? null,
      niche: t.niche ?? null,
      page_id: t.page ?? null,
      design_id: t.design ?? null,
      sections: t.sections ?? [],
      vignette: null,
      capture_le: cap.capturedAt ?? null,
      supprime_le: null,
      maj_le: now,
    });
  }
  report.push(`${await upsert("templates", templates)} template(s)`);
  await markMissing("templates", new Set(templates.map((t) => t.id)));

  // Demandes
  const demandes = [];
  for (const id of await list(join(root, "demandes"))) {
    const file = join(root, "demandes", id, "demande.json");
    if (!existsSync(file)) continue;
    const d = await readJson(file);
    demandes.push({
      id,
      type: d.type,
      statut: d.statut,
      page_id: d.page ?? null,
      url: d.url ?? null,
      consignes: d.consignes ?? null,
      details: d.details ?? {},
      resultat: d.resultat ?? null,
      cree_le: d.creeLe ?? null,
      maj_le: now,
    });
  }
  report.push(`${await upsert("demandes", demandes)} demande(s)`);

  // Images : créées dans l'atelier (medias/) + miniatures du catalogue.
  // Seulement celles qui ont changé (comparées à la table « medias »).
  const { data: known } = await db.from("medias").select("chemin, taille");
  const sizes = new Map((known ?? []).map((m) => [m.chemin, Number(m.taille)]));
  const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
  const files = [];
  for (const folder of await list(join(root, "medias"))) {
    for (const f of await list(join(root, "medias", folder))) files.push({ local: join(root, "medias", folder, f), chemin: `medias/${folder}/${f}`, folder });
  }
  for (const s of sections.filter((x) => x.miniature)) files.push({ local: join(root, "sections", s.id, "thumbnail.png"), chemin: s.miniature });
  for (const d of designs.filter((x) => x.miniature)) files.push({ local: join(root, "designs", `${d.id}.png`), chemin: d.miniature });

  let sent = 0;
  const mediaRows = [];
  for (const f of files) {
    const type = MIME[extname(f.local).toLowerCase()];
    if (!type) continue;
    const size = (await stat(f.local)).size;
    if (sizes.get(f.chemin) === size) continue;
    const { error } = await db.storage.from("medias").upload(f.chemin, await readFile(f.local), { contentType: type, upsert: true });
    if (error) throw new Error(`image ${f.chemin} : ${error.message}`);
    sent++;
    const projet = f.folder?.startsWith("projet-") ? f.folder.slice(7) : null;
    mediaRows.push({
      chemin: f.chemin,
      page_id: f.folder && !projet ? f.folder : null,
      projet_id: projet && projectIds.has(projet) ? projet : null,
      taille: size,
      type_mime: type,
      maj_le: now,
    });
  }
  await upsert("medias", mediaRows, "chemin");
  report.push(`${sent} image(s) envoyée(s)`);

  console.log(`✓ Supabase synchronisé : ${report.join(", ")}.`);
} catch (e) {
  console.error(`✗ Synchronisation interrompue : ${e.message}`);
  console.error(`  Déjà fait : ${report.join(", ") || "rien"}.`);
  process.exit(1);
}
