// Fiche d'offre structurée (audit ChatGPT F09, 2026-11-18).
// Les 9 champs de texte de l'offre restent (texte de vente) ; la fiche porte
// les données commerciales : packs, prix, devise, abonnement, livraison,
// retours, garantie, bonus réellement livrés, 4 leviers de valeur (Hormozi :
// résultat rêvé, confiance, délai, effort), rareté documentée.
// Les prix par unité et les remises se calculent ici ; les pages reprennent
// ces chiffres au lieu d'inventer les leurs (fidelite.js les autorise).
//
// fiche = {
//   devise: "USD", unite: "flacon de 60 gélules",
//   packs: [{ id, nom, quantite, offertes, prix, prixBarre, abonnement, cadence, populaire }],
//   garantie: { duree, unite: "jours" | "mois", conditions },
//   retours: { duree, unite, conditions }, livraison: { texte, seuilGratuit },
//   bonus: [{ id, nom, valeur, livre }],
//   leviers: { resultat|confiance|delai|effort: { obstacle, reponse, preuve } },
//   rarete: { active, condition },
// }

export const DEVISES = [
  ["USD", "$ US"],
  ["CAD", "$ CA"],
  ["EUR", "€"],
  ["GBP", "£"],
];
export const LEVIERS = [
  ["resultat", "Résultat rêvé", "Ce que le client veut vraiment obtenir"],
  ["confiance", "Confiance dans la réussite", "Pourquoi il croit que ça marchera pour lui"],
  ["delai", "Délai perçu", "Combien de temps avant de voir un effet"],
  ["effort", "Effort nécessaire", "Ce que ça lui demande au quotidien"],
];

const num = (v) => {
  const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};
const round2 = (n) => Math.round(n * 100) / 100;
// Audit F14 (2026-11-25) : contraintes partagées. Une quantité doit être un
// entier positif ou nul ; un prix, une durée ou un seuil, positif ou nul. Une
// valeur impossible ne sert à AUCUN calcul (elle est signalée en erreur).
const pos = (v, entier = false) => {
  const n = num(v);
  return n == null || n < 0 || (entier && !Number.isInteger(n)) ? null : n;
};
const impossible = (v, entier = false) => num(v) != null && pos(v, entier) == null;

// Packs avec les calculs : unités totales, prix par unité, remise par rapport
// au pack de base (le plus petit nombre d'unités, à défaut le premier).
export function packsCalcules(fiche) {
  const packs = (fiche?.packs ?? []).map((p) => {
    const q = pos(p.quantite, true) ?? 0;
    const o = pos(p.offertes, true) ?? 0;
    const prix = pos(p.prix);
    const total = q + o;
    return { ...p, q, o, total, prixN: prix, prixBarreN: pos(p.prixBarre), prixUnite: prix != null && total > 0 ? round2(prix / total) : null };
  });
  const base = [...packs].filter((p) => p.prixUnite != null && !p.abonnement).sort((a, b) => a.total - b.total)[0] ?? packs.find((p) => p.prixUnite != null);
  for (const p of packs) {
    p.remise = base && p !== base && p.prixUnite != null && base.prixUnite > 0 ? Math.round((1 - p.prixUnite / base.prixUnite) * 100) : null;
    p.economie = base && p.prixN != null && p !== base ? round2(base.prixUnite * p.total - p.prixN) : null;
  }
  return packs;
}

// Contrôles de cohérence : { niveau: "erreur" | "attention", texte }.
export function controlesFiche(fiche) {
  const out = [];
  if (!fiche) return out;
  const packs = packsCalcules(fiche);
  if (packs.length && !fiche.devise) out.push({ niveau: "erreur", cible: "devise", texte: "Choisis la devise : sans elle, un prix peut être lu en $ ou en €." });
  for (const [i, p] of packs.entries()) {
    const nom = p.nom || `Pack ${i + 1}`;
    if (impossible(p.quantite, true)) out.push({ cible: `pack-${i}`, niveau: "erreur", texte: `${nom} : quantité impossible (${p.quantite}) : un nombre entier, 1 ou plus.` });
    else if (!p.q) out.push({ cible: `pack-${i}`, niveau: "erreur", texte: `${nom} : quantité manquante.` });
    if (impossible(p.offertes, true)) out.push({ cible: `pack-${i}`, niveau: "erreur", texte: `${nom} : unités offertes impossibles (${p.offertes}).` });
    if (impossible(p.prix)) out.push({ cible: `pack-${i}`, niveau: "erreur", texte: `${nom} : prix impossible (${p.prix}) : un prix ne peut pas être négatif.` });
    else if (p.prixN == null) out.push({ cible: `pack-${i}`, niveau: "erreur", texte: `${nom} : prix manquant.` });
    if (impossible(p.prixBarre)) out.push({ cible: `pack-${i}`, niveau: "erreur", texte: `${nom} : prix barré impossible (${p.prixBarre}).` });
    if (p.prixBarreN != null && p.prixN != null && p.prixBarreN <= p.prixN) out.push({ cible: `pack-${i}`, niveau: "erreur", texte: `${nom} : le prix barré (${p.prixBarreN}) doit être plus élevé que le prix (${p.prixN}).` });
    if (p.o > 0 && p.remise != null && p.remise <= 0) out.push({ cible: `pack-${i}`, niveau: "erreur", texte: `${nom} : « ${p.q} + ${p.o} offert(s) » mais le prix par unité n'est pas plus bas que le pack de base.` });
    if (p.abonnement && !String(p.cadence ?? "").trim()) out.push({ cible: `pack-${i}`, niveau: "attention", texte: `${nom} : abonnement sans cadence (ex. tous les 30 jours).` });
  }
  if (packs.filter((p) => p.populaire).length > 1) out.push({ niveau: "attention", cible: "packs", texte: "Un seul pack peut être « le plus populaire »." });
  for (const [lib, v] of [["Garantie", fiche.garantie?.duree], ["Retours", fiche.retours?.duree], ["Seuil de livraison gratuite", fiche.livraison?.seuilGratuit]]) if (impossible(v)) out.push({ niveau: "erreur", cible: { Garantie: "garantie", Retours: "retours" }[lib] ?? "livraison", texte: `${lib} : valeur impossible (${v}).` });
  const g = pos(fiche.garantie?.duree);
  const r = pos(fiche.retours?.duree);
  const jours = (d, u) => (d == null ? null : u === "mois" ? d * 30 : d);
  if (g != null && r != null && jours(r, fiche.retours?.unite) < jours(g, fiche.garantie?.unite))
    out.push({ niveau: "erreur", cible: "garantie", texte: `La garantie (${g} ${fiche.garantie?.unite ?? "jours"}) dépasse la fenêtre de retour (${r} ${fiche.retours?.unite ?? "jours"}) : l'une contredit l'autre.` });
  if (String(fiche.garantie?.conditions ?? "").trim() && g == null) out.push({ niveau: "attention", cible: "garantie", texte: "Garantie décrite sans durée." });
  for (const [bi, b] of (fiche.bonus ?? []).entries()) if (b.nom && !b.livre) out.push({ niveau: "attention", cible: `bonus-${bi}`, texte: `Bonus « ${b.nom} » pas encore livrable : il ne doit pas être annoncé sur les pages.` });
  if (fiche.rarete?.active && !String(fiche.rarete?.condition ?? "").trim()) out.push({ niveau: "erreur", cible: "rarete", texte: "Urgence / rareté activée sans vraie condition : à documenter, sinon à retirer." });
  return out;
}

// Faits chiffrés tirés de la fiche, pour le contrôle des pages (fidelite.js).
const UNITE_DEVISE = { USD: "USD", CAD: "CAD", EUR: "€", GBP: "£" };
export function faitsDeFiche(fiche) {
  if (!fiche) return [];
  const dev = UNITE_DEVISE[fiche.devise] ?? "";
  const out = [];
  for (const p of packsCalcules(fiche)) {
    if (p.prixN != null) out.push({ nature: "argent", valeur: String(p.prixN), unite: dev });
    if (p.prixBarreN != null) out.push({ nature: "argent", valeur: String(p.prixBarreN), unite: dev });
    if (p.prixUnite != null) out.push({ nature: "argent", valeur: String(p.prixUnite), unite: dev });
    if (p.economie != null && p.economie > 0) out.push({ nature: "argent", valeur: String(p.economie), unite: dev });
    if (p.remise != null && p.remise > 0) out.push({ nature: "pourcent", valeur: String(p.remise), unite: "%" });
    if (p.total) out.push({ nature: "nombre", valeur: String(p.total), unite: "" }, { nature: "dose", valeur: String(p.total), unite: fiche.unite ?? "" });
    if (p.q) out.push({ nature: "nombre", valeur: String(p.q), unite: "" });
    if (p.o) out.push({ nature: "nombre", valeur: String(p.o), unite: "" });
  }
  const g = pos(fiche.garantie?.duree);
  if (g != null) out.push({ nature: "duree", valeur: String(g), unite: fiche.garantie?.unite ?? "jours" });
  const r = pos(fiche.retours?.duree);
  if (r != null) out.push({ nature: "duree", valeur: String(r), unite: fiche.retours?.unite ?? "jours" });
  const s = pos(fiche.livraison?.seuilGratuit);
  if (s != null) out.push({ nature: "argent", valeur: String(s), unite: dev });
  return out;
}

// Résumé lisible (contexte de l'IA, brief de campagne).
export function resumeFiche(fiche) {
  if (!fiche) return "";
  const dev = DEVISES.find(([v]) => v === fiche.devise)?.[1] ?? "";
  const lignes = packsCalcules(fiche)
    .filter((p) => p.q && p.prixN != null)
    .map((p) => `${p.nom || `${p.q} ${fiche.unite ?? "unité(s)"}`}${p.o ? ` + ${p.o} offert(s)` : ""} : ${p.prixN} ${dev}${p.prixBarreN ? ` (au lieu de ${p.prixBarreN} ${dev})` : ""}${p.prixUnite != null ? `, soit ${p.prixUnite} ${dev} l'unité` : ""}${p.remise > 0 ? `, -${p.remise} %` : ""}${p.abonnement ? `, abonnement ${p.cadence ?? ""}` : ""}${p.populaire ? " — le plus populaire" : ""}`);
  const g = pos(fiche.garantie?.duree);
  if (g != null) lignes.push(`Garantie : ${g} ${fiche.garantie?.unite ?? "jours"}${fiche.garantie?.conditions ? ` (${fiche.garantie.conditions})` : ""}`);
  if (fiche.livraison?.texte) lignes.push(`Livraison : ${fiche.livraison.texte}`);
  const bonus = (fiche.bonus ?? []).filter((b) => b.nom && b.livre).map((b) => b.nom);
  if (bonus.length) lignes.push(`Bonus réellement livrés : ${bonus.join(", ")}`);
  if (fiche.rarete?.active && fiche.rarete?.condition) lignes.push(`Rareté (vraie condition) : ${fiche.rarete.condition}`);
  return lignes.join("\n");
}

// Packs proposés depuis le texte de l'offre (« 1 = 58 $ ; 3 flacons = 115 $ ;
// 2+1 = 90 $ »), à vérifier : rien n'est validé tout seul.
export function packsDepuisTexte(texte) {
  const out = [];
  for (const part of String(texte ?? "").split(/[;\n]|(?:\s[·•|]\s)/)) {
    // « 1 flacon (30 jours) = 58 $ » : quantité à gauche du « = », premier
    // prix accompagné d'une devise à droite.
    const at = part.search(/=|→/);
    if (at < 0) continue;
    const q = /(\d+)\s*(?:\+\s*(\d+))?/.exec(part.slice(0, at));
    if (!q) continue;
    const droite = part.slice(at + 1);
    let prix = null;
    for (const m of droite.matchAll(/(\$|€|£)?\s*(\d+(?:[.,]\d{1,2})?)\s*(\$|€|£|usd|cad|eur)?/gi)) {
      if (m[1] || m[3]) {
        prix = m[2].replace(",", ".");
        break;
      }
    }
    if (prix == null) continue;
    out.push({ id: `p${Date.now().toString(36)}${out.length}`, nom: "", quantite: q[1], offertes: q[2] ?? "", prix, prixBarre: "", abonnement: false, cadence: "", populaire: /populaire|popular|best/i.test(part) });
  }
  return out;
}
