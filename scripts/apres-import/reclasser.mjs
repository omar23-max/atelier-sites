// Reclassement des sections du catalogue (décisions lues dans classes-*.txt :
// « index:famille », index = position dans digest-ids.json). Ancienne famille
// gardée dans meta.familyAvant + journal /home/ubuntu/apres-import/reclassement.tsv (annulable).
//   node reclasser.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, appendFileSync } from "node:fs";
const A = "/home/ubuntu/atelier-sites";
const { FAMILIES } = await import(`${A}/src/engine/families.js`);
const valid = new Set(FAMILIES.map((f) => f.id).concat("autres"));
const ids = JSON.parse(readFileSync("/home/ubuntu/apres-import/digest-ids.json", "utf8"));
const dry = process.argv.includes("--dry");
const decisions = {};
for (const f of readdirSync("/home/ubuntu/apres-import").filter((x) => /^classes-\d+\.txt$/.test(x)))
  for (const tok of readFileSync(`/home/ubuntu/apres-import/${f}`, "utf8").split(/\s+/).filter(Boolean)) {
    const [i, fam] = tok.split(":");
    if (!valid.has(fam)) throw new Error(`famille inconnue ${fam} (${tok})`);
    decisions[ids[+i]] = fam;
  }
let n = 0;
const moves = {};
for (const [id, fam] of Object.entries(decisions)) {
  const file = `${A}/sections/${id}/meta.json`;
  try { readFileSync(file); } catch { continue; }
  const meta = JSON.parse(readFileSync(file, "utf8"));
  if (meta.family === fam) continue;
  const k = `${meta.family} → ${fam}`;
  moves[k] = (moves[k] ?? 0) + 1;
  if (!dry) {
    appendFileSync("/home/ubuntu/apres-import/reclassement.tsv", `${id}\t${meta.family}\t${fam}\n`);
    meta.familyAvant ??= meta.family;
    meta.labelAvant ??= meta.label;
    meta.family = fam;
    // Nom affiché : la fonction suit la nouvelle famille (la marque et « (1/2) » restent).
    const NOM = { bandeaux: "Bandeau d'annonce", temoignages: "Avis clients", garantie: "Garantie", offre: "Offre", faq: "FAQ", expert: "Avis d'expert", comparatif: "Tableau comparatif", resultats: "Résultats", probleme: "Problème", solution: "Solution", ingredients: "Ingrédients", listicle: "Raisons d'acheter", avantages: "Avantages", "mode-emploi": "Mode d'emploi", newsletter: "Newsletter", presse: "Vu dans la presse", packs: "Packs", "fiche-produit": "Bloc d'achat", "details-produit": "Détails du produit", marque: "Notre histoire", confiance: "Badges de confiance", video: "Vidéo", chiffres: "Chiffres clés", "pied-de-page": "Pied de page", hero: "Hero", entete: "En-tête", collection: "Grille de produits", article: "Advertorial", cta: "Appel à l'action", slogan: "Slogan", histoire: "Histoire", galerie: "Galerie photos", bonus: "Bonus offerts", livraison: "Livraison", "sticky-atc": "Barre d'achat", espace: "Espace", autres: "Contenu" };
    if (meta.label && NOM[fam]) {
      const [head, ...rest] = meta.label.split(" — ");
      const suffix = /\((début|\d+\/\d+)\)/.exec(head)?.[0];
      meta.fonction = NOM[fam];
      meta.label = `${NOM[fam]}${suffix ? ` ${suffix}` : ""}${rest.length ? ` — ${rest.join(" — ")}` : ""}`;
    }
    meta.familyRevue = "2026-11-07";
    writeFileSync(file, JSON.stringify(meta, null, 2) + "\n");
  }
  n++;
}
console.log({ decisions: Object.keys(decisions).length, changees: n, dry });
console.log(Object.entries(moves).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v}\t${k}`).join("\n"));
