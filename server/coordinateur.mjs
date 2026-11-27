// Chef de projet IA (coordinateur), premier lot (2026-11-27, avis ChatGPT).
// Il enchaîne les agents « Préparer » des Fondations par PHASES et s'arrête à
// chaque décision : rien n'est validé à ta place, tout arrive en propositions à
// trier. Le plafond du projet (couts.mjs) bloque toute dépense au-delà.
//   GET  /api/coordinateur/<projet>  → { phases: [{ id, titre, etat, … }], run }
//   POST /api/coordinateur/<projet> { phase }  → lance la phase (202)
// Journal : projets-rapports/<projet>/_coordinateur.json (reprise après coupure).
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PHASES = [
  { id: "client", titre: "Produit et recherche client", etapes: ["produit", "recherche"], prefixes: ["role", "usage", "qui", "douleur", "echec", "resultats.", "curiosite", "aggravation"], arret: "Trie les propositions (produit, douleurs, mots des clients, objections) : ajoute ce qui est juste, rejette le reste." },
  { id: "offre", titre: "Offre et mécanisme", etapes: ["offre", "mecanisme"], prefixes: ["offre", "offreFiche"], arret: "Vérifie la fiche d'offre (prix, packs, garantie), trie les propositions, puis choisis une piste de mécanisme ou « Pas de mécanisme pour ce produit »." },
  { id: "discours", titre: "Message, angles et brief", etapes: ["message", "angles", "brief"], prefixes: ["message.", "brief."], arret: "Trie les propositions du message et du brief, puis coche les angles à tester." },
];
const COUT_ETAPE = 0.35; // estimation prudente par préparation (sans recherche web)
const actifs = new Set(); // projets dont une phase tourne dans CE serveur

const lireJson = async (f, d) => {
  try {
    return JSON.parse(await readFile(f, "utf8"));
  } catch {
    return d;
  }
};
const fichierJournal = (root, projet) => join(root, "projets-rapports", projet, "_coordinateur.json");

// Où en est le projet pour chaque phase (sans IA).
async function etat(root, projet) {
  const p = JSON.parse(await readFile(join(root, "projets", `${projet}.json`), "utf8"));
  const f = p.fondations ?? {};
  const brouillons = f.reponses?.brouillonsAgents ?? [];
  const journal = await lireJson(fichierJournal(root, projet), { runs: [] });
  const prep = await lireJson(join(root, "projets-rapports", projet, "_preparations.json"), []);
  const aTrier = (ph) => brouillons.filter((b) => b.statut === "proposé" && ph.prefixes.some((x) => String(b.champ ?? "").startsWith(x))).length;
  const faite = (ph) => ph.etapes.every((e) => prep.some((x) => x.etape === e && !x.erreur && !x.enCours));
  const decisions = {
    client: true,
    offre: true,
    discours: Boolean(f.mecanismeChoisi) && Boolean(p.offreFiche?.packs?.length),
  };
  const run = journal.runs[0] ?? null;
  if (run && run.statut === "en cours" && !actifs.has(projet)) run.statut = "interrompu";
  const phases = [];
  for (const [i, ph] of PHASES.entries()) {
    const avant = phases[i - 1];
    const enCours = run?.statut === "en cours" && run.phase === ph.id;
    let bloque = null;
    if (avant && !avant.faite) bloque = `Termine d'abord « ${avant.titre} ».`;
    else if (avant && avant.aTrier) bloque = `Trie d'abord les ${avant.aTrier} proposition(s) de « ${avant.titre} ».`;
    else if (!decisions[ph.id]) bloque = !f.mecanismeChoisi ? "Choisis d'abord une piste de mécanisme, ou « Pas de mécanisme pour ce produit » (étape Message central)." : "Remplis d'abord la fiche d'offre (packs et prix).";
    phases.push({ id: ph.id, titre: ph.titre, etapes: ph.etapes, arret: ph.arret, faite: faite(ph), aTrier: aTrier(ph), enCours, bloque, cout: Math.round(ph.etapes.length * COUT_ETAPE * 100) / 100 });
  }
  return { phases, run };
}

async function noter(root, projet, maj) {
  const f = fichierJournal(root, projet);
  await mkdir(join(root, "projets-rapports", projet), { recursive: true });
  const j = await lireJson(f, { runs: [] });
  maj(j);
  j.runs = j.runs.slice(0, 30);
  await writeFile(f, JSON.stringify(j, null, 1));
}

async function derouler(root, projet, ph, reprise) {
  const { preparerEtape } = await import("./preparer.mjs");
  const id = reprise?.id ?? `c-${Date.now().toString(36)}`;
  const deja = new Set((reprise?.etapes ?? []).filter((e) => e.statut === "fait").map((e) => e.etape));
  try {
    await noter(root, projet, (j) => {
      j.runs = j.runs.filter((r) => r.id !== id);
      j.runs.unshift({ id, phase: ph.id, titre: ph.titre, statut: "en cours", debut: reprise?.debut ?? new Date().toISOString(), etapes: ph.etapes.map((e) => (deja.has(e) ? reprise.etapes.find((x) => x.etape === e) : { etape: e, statut: "à faire" })) });
    });
    for (const e of ph.etapes) {
      if (deja.has(e)) continue;
      await noter(root, projet, (j) => {
        const r = j.runs.find((x) => x.id === id);
        r.etapes = r.etapes.map((x) => (x.etape === e ? { etape: e, statut: "en cours", debut: new Date().toISOString() } : x));
      });
      const res = await preparerEtape(root, projet, e);
      await noter(root, projet, (j) => {
        const r = j.runs.find((x) => x.id === id);
        r.etapes = r.etapes.map((x) => (x.etape === e ? { etape: e, statut: res.erreur ? "erreur" : "fait", fin: new Date().toISOString(), n: res.n ?? 0, erreur: res.erreur ?? undefined, fichier: res.fichier ?? undefined } : x));
      });
      if (res.erreur) throw new Error(res.erreur);
    }
    await noter(root, projet, (j) => {
      const r = j.runs.find((x) => x.id === id);
      Object.assign(r, { statut: "a-trier", fin: new Date().toISOString(), arret: ph.arret });
    });
  } catch (e) {
    await noter(root, projet, (j) => {
      const r = j.runs.find((x) => x.id === id);
      if (r) Object.assign(r, { statut: "erreur", fin: new Date().toISOString(), erreur: String(e.message).slice(0, 400) });
    }).catch(() => {});
  } finally {
    actifs.delete(projet);
  }
}

export async function coordinateurRoute(req, res, parts, { root, readBody, json }) {
  const projet = parts[1];
  if (!/^[a-z0-9][a-z0-9-]{1,90}$/.test(projet ?? "") || !existsSync(join(root, "projets", `${projet}.json`))) return json(res, 404, { error: "Projet introuvable." });
  if (req.method === "GET") return json(res, 200, await etat(root, projet));
  if (req.method !== "POST") return json(res, 405, { error: "Méthode refusée." });
  const b = (await readBody(req).catch(() => ({}))) || {};
  const ph = PHASES.find((x) => x.id === b.phase);
  if (!ph) return json(res, 400, { error: "Phase inconnue." });
  if (actifs.has(projet)) return json(res, 409, { error: "Le chef de projet travaille déjà sur ce projet." });
  const { phases, run } = await etat(root, projet);
  const cur = phases.find((x) => x.id === ph.id);
  if (cur.bloque) return json(res, 409, { error: cur.bloque });
  const { preparationEnCours } = await import("./preparer.mjs");
  if (preparationEnCours(projet)) return json(res, 409, { error: "Une préparation tourne déjà sur ce projet : attends qu'elle finisse." });
  // Budget : il doit rester de quoi faire les étapes restantes (estimation prudente).
  const reprise = run && run.phase === ph.id && ["interrompu", "erreur"].includes(run.statut) ? run : null;
  const restantes = ph.etapes.filter((e) => !(reprise?.etapes ?? []).some((x) => x.etape === e && x.statut === "fait")).length;
  const { resumeCouts } = await import("./couts.mjs");
  const r = await resumeCouts(root, `projet-${projet}`);
  if (r.budget != null && r.total.dollars + restantes * COUT_ETAPE > r.budget) return json(res, 409, { error: `Plafond trop proche : ≈ ${r.total.dollars.toFixed(2)} $ dépensés sur ${r.budget} $, et cette phase peut coûter ≈ ${(restantes * COUT_ETAPE).toFixed(2)} $. Augmente le plafond (panneau « Dépense IA ») pour continuer.` });
  actifs.add(projet);
  derouler(root, projet, ph, reprise).catch(() => {});
  return json(res, 202, { ok: true, reprise: Boolean(reprise) });
}
