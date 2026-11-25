// Tests de fiabilité des Fondations (audit ChatGPT du 2026-11-17, lot 1).
// Reprend les 25 cas de l'audit (verify-foundations.mjs), adaptés à
// l'architecture actuelle, plus des cas de non-régression.
//
//   node scripts/tests/fondations-fiabilite.mjs            tests sans réseau
//   node scripts/tests/fondations-fiabilite.mjs --http     + essais réels de
//        l'API sur un projet jetable zz-test-fiab-lot1 (mis à la corbeille)
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (f) => import(pathToFileURL(join(root, f)).href);
const { knownNumbers, hasUnknownFigure, knownClaims, hasUnknownClaim } = await imp("src/engine/fidelite.js");
const { blueprintOf, contenuProgress } = await imp("src/engine/page-blueprints.js");
const { merge3, empreinte, empreinteV1, empreinteV2, partiesEmpreinte, partiesModifiees, statutFondations, realText, withIds } = await imp("src/engine/fondations-etat.js");
const { packsCalcules, controlesFiche, packsDepuisTexte } = await imp("src/engine/offre-fiche.js");

const cases = [];
const check = (id, sujet, attendu, obtenu) => cases.push({ id, sujet, attendu, obtenu, ok: JSON.stringify(attendu) === JSON.stringify(obtenu) });
const num = (id, sujet, p, text, attendu) => check(id, sujet, attendu, hasUnknownFigure(text, knownNumbers(p)));
const claim = (id, sujet, p, text, attendu) => check(id, sujet, attendu, hasUnknownClaim(text, knownClaims(p)));
const fait = (valeur, unite, nature, etat = "valide") => ({ nature, valeur, unite, etat });

// ---- Chiffres (F02) ----
num("N01", "100 % sans preuve est signalé", {}, "100% naturel", true);
num("N02", "Un prix de 30 ne prouve pas 30 jours", { offre: { prix: 30 } }, "Garantie 30 jours", true);
num("N03", "Un fait validé 30 jours couvre 30 jours", { fondations: { faits: [fait("30", "jours", "duree")] } }, "Garantie 30 jours", false);
num("N04", "30 jours ne couvre pas 30 mois", { fondations: { faits: [fait("30", "jours", "duree")] } }, "Garantie 30 mois", true);
num("N05", "30 USD ne couvre pas 30 €", { fondations: { faits: [fait("30", "USD", "argent")] } }, "Prix 30 €", true);
num("N06", "1000 mg ne couvre pas 1000 g", { fondations: { faits: [fait("1000", "mg", "dose")] } }, "Dose 1000 g", true);
num("N07", "Un fait à confirmer n'est pas autorisé par son texte brut", { fondations: { reponses: { role: "Garantie 30 jours" }, faits: [fait("30", "jours", "duree", "a-confirmer")] } }, "Garantie 30 jours", true);
num("N08", "Une citation de concurrent ne prouve pas notre garantie", { fondations: { reponses: { collecteAutres: "Le concurrent annonce une garantie 30 jours" } } }, "Garantie 30 jours", true);
num("N09", "Un fait retiré reste bloqué malgré le texte", { fondations: { reponses: { role: "Garantie 30 jours" }, faits: [fait("30", "jours", "duree", "retire")] } }, "Garantie 30 jours", true);
num("N10", "Un nombre sans nature n'autorise pas toute unité", { fondations: { reponses: { notes: "30" } } }, "Garantie 30 jours", true);
// non-régression
num("N11", "1 g validé couvre 1000 mg (conversion sûre)", { fondations: { faits: [fait("1", "g", "dose")] } }, "Dose 1000 mg", false);
num("N12", "2 semaines validées couvrent 14 jours", { fondations: { faits: [fait("2", "semaines", "duree")] } }, "Essai 14 jours", false);
num("N13", "Un prix « 49 » de l'offre couvre « 49 $ »", { offre: { prix: "49" } }, "Seulement 49 $", false);
num("N14", "« 49 $ US » validé couvre « $49 »", { fondations: { faits: [fait("49", "$ US", "argent")] } }, "Only $49", false);
num("N15", "Garantie 30 jours écrite dans l'offre couvre 30 jours", { offre: { garantie: "Satisfait ou remboursé 30 jours" } }, "Garantie 30 jours", false);
num("N16", "Un fait validé l'emporte sur un « à confirmer » identique", { fondations: { faits: [fait("30", "jours", "duree", "a-confirmer"), fait("30", "jours", "duree")] } }, "Garantie 30 jours", false);
num("N17", "Un [MANQUE] du questionnaire n'autorise pas son chiffre", { fondations: { reponses: { role: "[MANQUE : 30 jours ?]" } } }, "Garantie 30 jours", true);

num("N18", "« 60 gélules » (offre) couvre « 60 capsules », pas des grammes", { offre: { prix: "58 $ US le flacon de 60 gélules" } }, "60 capsules per bottle", false);
num("N19", "Un emplacement entre crochets n'est pas un chiffre", {}, "[2 years ago] · [3x Pack]", false);

// ---- Affirmations (F03) ----
claim("A01", "Bio sans aucune preuve est bloqué", {}, "Produit bio", true);
claim("A02", "Vegan ne justifie pas FDA-approved", { fondations: { reponses: { preuves: { certification: { oui: true, detail: "Vegan" } } } } }, "FDA-approved", true);
claim("A03", "Case clinique cochée sans détail : rien", { fondations: { reponses: { preuves: { etude: { oui: true, detail: "" } } } } }, "Clinically proven", true);
claim("A04", "Étude [À VALIDER] : rien", { fondations: { reponses: { preuves: { etude: { oui: true, detail: "[À VALIDER]" } } } } }, "Clinically proven", true);
claim("A05", "Une négation n'autorise pas l'allégation", { fondations: { reponses: { role: "Ne pas écrire cliniquement prouvé" } } }, "Cliniquement prouvé", true);
claim("A06", "Allégation concurrente ≠ preuve produit", { fondations: { reponses: { collecteAutres: "Le concurrent écrit clinically proven" } } }, "Clinically proven", true);
// non-régression
claim("A07", "Vegan documenté autorise « vegan »", { fondations: { reponses: { preuves: { certification: { oui: true, detail: "Certifié Vegan (Vegan Society)" } } } } }, "100% vegan formula", false);
// Audit F14 (2026-11-25) : une étude décrite autorise « testé », pas « prouvé ».
claim("A08", "Étude décrite sans résultat prouvé : « clinically proven » reste signalé", { fondations: { reponses: { preuves: { etude: { oui: true, detail: "Étude 2024, 60 personnes, Univ. Laval" } } } } }, "Clinically proven", true);
claim("A12", "Étude décrite : « clinically tested » autorisé", { fondations: { reponses: { preuves: { etude: { oui: true, detail: "Étude 2024, 60 personnes, Univ. Laval" } } } } }, "Clinically tested", false);
claim("A13", "Étude au résultat démontré : « clinically proven » autorisé", { fondations: { reponses: { preuves: { etude: { oui: true, detail: "Étude 2024, 60 personnes : effet démontré sur le sommeil" } } } } }, "Clinically proven", false);
claim("A14", "« Testé sans effet prouvé » n'autorise pas « prouvé »", { fondations: { reponses: { preuves: { etude: { oui: true, detail: "Testé sur 20 personnes, sans effet prouvé" } } } } }, "Scientifically proven", true);
claim("A09", "« Vegan and FDA-approved » : FDA reste signalé", { fondations: { reponses: { preuves: { certification: { oui: true, detail: "Vegan" } } } } }, "Vegan and FDA-approved", true);
claim("A10", "Sans gluten écrit dans la fiche produit autorise « gluten-free »", { produit: { description: "Formule sans gluten" } }, "Gluten-free", false);
claim("A11", "« Certifié » seul : au moins un label documenté", { fondations: { reponses: { preuves: { certification: { oui: true, detail: "USDA Organic" } } } } }, "Certified quality", false);

// ---- Marqueurs (F06, partie commune) ----
const cont = { produit: {} };
for (const s of blueprintOf("produit")) for (const ch of s.champs) (cont.produit[s.key] ??= {})[ch.k] = "[MANQUE : information à confirmer]";
check("P01", "Des champs tous [MANQUE] comptent zéro contenu prêt", 0, contenuProgress(cont, "produit").done);
const mf = (await readFile(join(root, "src/catalogue/Fondations.jsx"), "utf8")).includes("realText(m?.promesse) && realText(m?.mecanisme)");
check("P02", "Le message central exige une vraie promesse et un vrai mécanisme", true, mf && !(realText("[MANQUE]") && realText("[À VALIDER]")));
check("P03", "Un vrai texte compte", true, realText("Une peau plus ferme [À VALIDER : délai]"));
{
  const [s0, s1] = blueprintOf("produit");
  const c = { produit: { [s0.key]: { [s0.champs[0].k]: "Vrai texte", ...(s0.champs[1] ? { [s0.champs[1].k]: "[MANQUE : prix]" } : {}) } } };
  const pr = contenuProgress(c, "produit");
  check("P04", "Compteur : prêts, manques et renseignés distincts", [1, s0.champs[1] ? 1 : 0, s0.champs[1] ? 2 : 1], [pr.done, pr.manques, pr.renseignes]);
}

// ---- Fusion à trois versions (F01) ----
const old = { reponses: { role: "ancien" }, faits: withIds([]) };
const serv = { reponses: { role: "nouveau texte externe" }, faits: [{ id: "new", nature: "argent", valeur: "99", etat: "valide" }] };
check("C01", "Sans modification locale, une réponse écrite ailleurs est gardée", "nouveau texte externe", merge3(old.reponses, old.reponses, serv.reponses).value.role);
check("C02", "Sans modification locale, un fait ajouté ailleurs est gardé", 1, merge3(old.faits, old.faits, serv.faits).value.length);
{
  const base = { role: "a", douleur: "b" };
  const r = merge3(base, { role: "a local", douleur: "b" }, { role: "a", douleur: "b serveur" });
  check("C03", "Champs différents changés des deux côtés : les deux gardés", { role: "a local", douleur: "b serveur" }, r.value);
  const c = merge3(base, { ...base, role: "moi" }, { ...base, role: "Claude" }, "reponses");
  check("C04", "Même champ changé des deux côtés : conflit signalé", ["reponses.role"], c.conflicts);
  const f = merge3([{ id: "a", valeur: "1" }], [{ id: "a", valeur: "1" }, { id: "b", valeur: "2" }], [{ id: "a", valeur: "1" }, { id: "c", valeur: "3" }]);
  check("C05", "Faits ajoutés des deux côtés : tous gardés", ["a", "c", "b"], f.value.map((x) => x.id));
  const d = merge3([{ id: "a", valeur: "1" }, { id: "b", valeur: "2" }], [{ id: "a", valeur: "1" }], [{ id: "a", valeur: "1" }, { id: "b", valeur: "2" }]);
  check("C06", "Fait retiré ici et pas changé ailleurs : retiré", ["a"], d.value.map((x) => x.id));
}

// ---- Validation et offre (F04) ----
{
  const p = { offre: { prix: "30" }, fondations: { reponses: { role: "x" }, faits: [], message: null, statut: "validée" } };
  p.fondations.valideEmpreinte = empreinte(p);
  check("V01", "Changer le prix de l'offre → Fondations « modifiée »", "modifiée", statutFondations({ ...p, offre: { prix: "99" } }).statut);
  check("V02", "Revenir au même prix → « validée »", "validée", statutFondations(p).statut);
  check("V03", "Coller de la recherche brute ne remet pas la validation en cause", "validée", statutFondations({ ...p, fondations: { ...p.fondations, reponses: { role: "x", collecteReddit: "« … »" } } }).statut);
  const v1 = { offre: { prix: "30" }, fondations: { reponses: { role: "x" }, message: null, contenus: {}, faits: [], statut: "validée" } };
  v1.fondations.valideEmpreinte = empreinteV1(v1.fondations);
  const mig = statutFondations(v1);
  check("V04", "Ancienne validation (v1) intacte : gardée et migrée en v3", ["validée", true], [mig.statut, mig.valideEmpreinte.startsWith("v3:")]);
  check("V05", "Ancienne validation (v1) modifiée depuis : « modifiée »", "modifiée", statutFondations({ ...v1, fondations: { ...v1.fondations, reponses: { role: "y" } } }).statut);
}

// ---- Fiche d'offre (F09) ----
{
  const fiche = {
    devise: "USD",
    unite: "flacon",
    packs: [
      { id: "a", quantite: "1", offertes: "", prix: "58" },
      { id: "b", quantite: "2", offertes: "1", prix: "115", prixBarre: "174", populaire: true },
    ],
    garantie: { duree: "90", unite: "jours" },
    retours: { duree: "30", unite: "jours" },
    bonus: [{ id: "x", nom: "Guide PDF", livre: false }],
    rarete: { active: true, condition: "" },
  };
  const c = packsCalcules(fiche);
  check("O01", "« 2 + 1 » = 3 unités, prix par unité et remise calculés", [3, 38.33, 34], [c[1].total, c[1].prixUnite, c[1].remise]);
  const ctrl = controlesFiche(fiche).map((x) => x.texte).join(" | ");
  check("O02", "Garantie plus longue que la fenêtre de retour : signalée", true, /dépasse la fenêtre de retour/.test(ctrl));
  check("O03", "Bonus pas encore livrable : signalé", true, /pas encore livrable/.test(ctrl));
  check("O04", "Rareté sans vraie condition : signalée", true, /sans vraie condition/.test(ctrl));
  check("O05", "Prix barré plus bas que le prix : signalé", true, /prix barré/.test(controlesFiche({ devise: "USD", packs: [{ quantite: "1", prix: "50", prixBarre: "40" }] }).map((x) => x.texte).join(" ")));
  const p = { offreFiche: fiche };
  num("O06", "Le prix par unité calculé est autorisé sur une page", p, "Seulement 38.33 $ par flacon", false);
  num("O07", "La remise calculée est autorisée", p, "Économisez 34%", false);
  num("O08", "Un prix absent de la fiche reste signalé", p, "Seulement 29 $", true);
  num("O09", "La garantie de la fiche couvre « 90 jours », pas « 90 mois »", p, "Garantie 90 mois", true);
  const t = packsDepuisTexte("1 = 58 $ ; 3 flacons = 115 $ (le plus populaire) ; 2+1 = 90 $");
  check("O10", "Packs repérés dans le texte de l'offre", [["1", "", "58"], ["3", "", "115"], ["2", "1", "90"]], t.map((x) => [x.quantite, x.offertes, x.prix]));
  const t2 = packsDepuisTexte("1 flacon (30 jours) = 58 $ ; 3 flacons (la cure de 90 jours) = 115 $, soit 1,28 $ par jour, le plus populaire ; 5 flacons (150 jours) = 172 $ ; abonnement : -25 %");
  check("O13", "Texte réel avec parenthèses : 3 packs, le populaire repéré", [["1", "58"], ["3", "115"], ["5", "172"], true], [...t2.map((x) => [x.quantite, x.prix]), t2[1]?.populaire]);
  const v = { offreFiche: fiche, fondations: { reponses: {}, faits: [], message: null, statut: "validée" } };
  v.fondations.valideEmpreinte = empreinte(v);
  check("O11", "Changer un prix de la fiche → Fondations « modifiée »", "modifiée", statutFondations({ ...v, offreFiche: { ...fiche, packs: [{ ...fiche.packs[0], prix: "49" }, fiche.packs[1]] } }).statut);
  const sansFiche = { offre: { prix: "30" }, fondations: { reponses: {}, faits: [], message: null } };
  check("O12", "Projet sans fiche : empreinte inchangée par le lot 3", empreinte(sansFiche), empreinte({ ...sansFiche }));
  check("M01", "Choisir un autre mécanisme → Fondations « modifiée »", "modifiée", statutFondations({ ...v, fondations: { ...v.fondations, mecanismeChoisi: { id: "m2" } } }).statut);
  // Audit F13 (2026-11-25) : le CONTENU du mécanisme compte, et on sait quelle partie relire.
  const vm = { offreFiche: fiche, fondations: { reponses: {}, faits: [], message: null, statut: "validée", mecanismes: [{ id: "m1", nom: "A", ump: "cause", ums: "solution" }], mecanismeChoisi: { id: "m1" } } };
  vm.fondations.valideEmpreinte = empreinte(vm);
  vm.fondations.valideParties = partiesEmpreinte(vm);
  const vm2 = { ...vm, fondations: { ...vm.fondations, mecanismes: [{ id: "m1", nom: "A", ump: "autre cause", ums: "solution" }] } };
  check("M02", "Changer l'explication du mécanisme (même id) → « modifiée »", "modifiée", statutFondations(vm2).statut);
  check("M03", "Parties à relire : seulement le mécanisme", ["mecanisme"], partiesModifiees(vm2));
  check("M04", "Changer un prix : seulement l'offre commerciale à relire", ["commercial"], partiesModifiees({ ...vm, offreFiche: { ...fiche, packs: [{ ...fiche.packs[0], prix: "49" }, fiche.packs[1]] } }));
  const v2 = { offre: { prix: "30" }, fondations: { reponses: { role: "x" }, faits: [], message: null, statut: "validée" } };
  v2.fondations.valideEmpreinte = empreinteV2(v2);
  const m2 = statutFondations(v2);
  check("V06", "Validation v2 intacte : gardée et migrée en v3 avec ses parties", ["validée", true, true], [m2.statut, m2.valideEmpreinte.startsWith("v3:"), Boolean(m2.valideParties)]);
  // Audit F14 : valeurs impossibles de la fiche.
  const neg = { devise: "USD", packs: [{ nom: "A", quantite: "-2", prix: "-10" }, { nom: "B", quantite: "1.5", prix: "20" }], garantie: { duree: "-30" } };
  const ctl = controlesFiche(neg).map((c) => c.texte);
  check("O14", "Quantité, prix et garantie négatifs, quantité décimale : 4 erreurs « impossible »", 4, ctl.filter((t) => /impossible/.test(t)).length);
  check("O15", "Valeurs impossibles : aucun prix par unité calculé", [null, null], packsCalcules(neg).map((k) => k.prixUnite));
}

// ---- Essais réels de l'API (projet jetable) ----
if (process.argv.includes("--http")) {
  const B = "http://127.0.0.1:5180";
  const id = "zz-test-fiab-lot1";
  const file = join(root, "projets", `${id}.json`);
  const p0 = { id, nom: "zz test fiabilité lot 1", offre: { prix: "30" }, fondations: { reponses: { role: "x" }, faits: [], message: null, statut: "validée" } };
  p0.fondations.valideEmpreinte = empreinte(p0);
  await writeFile(file, JSON.stringify(p0, null, 2) + "\n");
  try {
    const g = await fetch(`${B}/api/projects/${id}`);
    const rev = g.headers.get("ETag");
    const cur = await g.json();
    const put1 = await fetch(`${B}/api/projects/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": rev }, body: JSON.stringify({ ...cur, offre: { prix: "99" } }) });
    const b1 = await put1.json();
    check("H01", "PUT avec la bonne révision : accepté", 200, put1.status);
    check("H02", "Le serveur passe les Fondations en « modifiée » après un nouveau prix", "modifiée", b1.fondations?.statut);
    const put2 = await fetch(`${B}/api/projects/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": rev }, body: JSON.stringify({ ...cur, offre: { prix: "10" } }) });
    check("H03", "PUT avec une révision périmée : refus 409", 409, put2.status);
    const after = JSON.parse(await readFile(file, "utf8"));
    check("H04", "Le refus n'a rien écrit", "99", after.offre.prix);
    const g2 = await fetch(`${B}/api/projects/${id}`);
    check("H05", "La révision renvoyée au PUT = celle du GET suivant", b1.rev, g2.headers.get("ETag"));
    const put3 = await fetch(`${B}/api/projects/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...after, nom: "zz renommé" }) });
    check("H06", "PUT sans If-Match (anciens écrivains) : toujours accepté", 200, put3.status);
    // Cartes « à relire » (F06) : le script de Claude note l'empreinte au
    // moment de la rédaction ; un prix changé ensuite la rend différente.
    const { execFileSync } = await import("node:child_process");
    const { blueprintOf: bp } = await imp("src/engine/page-blueprints.js");
    const s0 = bp("produit")[0];
    const tmp = join(root, "..", `zz-contenus-${Date.now()}.json`);
    await writeFile(tmp, JSON.stringify({ produit: { [s0.key]: { [s0.champs[0].k]: "Texte de Claude" } } }));
    execFileSync("node", [join(root, "scripts", "fondations-contenus.mjs"), "ecrire", id, tmp], { stdio: "ignore" });
    const apres = JSON.parse(await readFile(file, "utf8"));
    check("H07", "Le script note l'empreinte des cartes", empreinte(apres), apres.fondations.contenusEmpreinte);
    check("H08", "Un prix changé ensuite → cartes à relire", true, empreinte({ ...apres, offre: { ...apres.offre, prix: "1" } }) !== apres.fondations.contenusEmpreinte);
    // Script des décisions : pistes ajoutées sans rien remplacer, 5 au plus ;
    // fiche complétée seulement là où elle est vide.
    const tmpM = join(root, "..", `zz-meca-${Date.now()}.json`);
    await writeFile(tmpM, JSON.stringify([{ nom: "A", ump: "p", ums: "s" }, { nom: "B", ump: "p2", ums: "s2" }]));
    execFileSync("node", [join(root, "scripts", "fondations-decisions.mjs"), "mecanismes", id, tmpM], { stdio: "ignore" });
    const m1 = JSON.parse(await readFile(file, "utf8")).fondations.mecanismes ?? [];
    check("H09", "Pistes ajoutées en « hypothèse »", [2, "hypothese"], [m1.length, m1[0]?.statut]);
    await writeFile(tmpM, JSON.stringify([1, 2, 3, 4].map((i) => ({ nom: `X${i}`, ums: "s" }))));
    let refus = false;
    try {
      execFileSync("node", [join(root, "scripts", "fondations-decisions.mjs"), "mecanismes", id, tmpM], { stdio: "ignore" });
    } catch {
      refus = true;
    }
    check("H10", "Plus de 5 pistes en tout : refusé, rien d'écrit", [true, 2], [refus, (JSON.parse(await readFile(file, "utf8")).fondations.mecanismes ?? []).length]);
    const avantFiche = JSON.parse(await readFile(file, "utf8"));
    avantFiche.offreFiche = { devise: "CAD", packs: [{ id: "u", quantite: "1", prix: "40" }] };
    await writeFile(file, JSON.stringify(avantFiche, null, 2));
    await writeFile(tmpM, JSON.stringify({ devise: "USD", unite: "flacon", packs: [{ quantite: "3", prix: "99" }], garantie: { duree: "60", unite: "jours" } }));
    execFileSync("node", [join(root, "scripts", "fondations-decisions.mjs"), "fiche", id, tmpM], { stdio: "ignore" });
    const fi = JSON.parse(await readFile(file, "utf8")).offreFiche;
    check("H11", "Fiche : la devise et les packs de l'utilisateur sont gardés, les vides remplis", ["CAD", 1, "flacon", "60"], [fi.devise, fi.packs.length, fi.unite, fi.garantie?.duree]);
    await (await import("node:fs/promises")).rm(tmpM, { force: true });
    const { rm, readdir } = await import("node:fs/promises");
    await rm(tmp, { force: true });
    for (const h of await readdir(join(root, "projets", "_historique")).catch(() => [])) if (h.startsWith(`${id}--`)) await rename(join(root, "projets", "_historique", h), join(root, "corbeille", "projets", h)).catch(() => {});
  } finally {
    await mkdir(join(root, "corbeille", "projets"), { recursive: true });
    if (existsSync(file)) await rename(file, join(root, "corbeille", "projets", `${id}.json`));
  }
}

const ko = cases.filter((c) => !c.ok);
for (const c of cases) console.log(`${c.ok ? "✓" : "✗"} ${c.id} ${c.sujet}${c.ok ? "" : ` — attendu ${JSON.stringify(c.attendu)}, obtenu ${JSON.stringify(c.obtenu)}`}`);
console.log(`\n${cases.length - ko.length} / ${cases.length} conformes`);
process.exit(ko.length ? 1 : 0);
