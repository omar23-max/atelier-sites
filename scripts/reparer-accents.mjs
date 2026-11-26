// Répare les « �� » laissés par l'ancien bug d'enregistrement (2026-11-25).
// Chaque ligne abîmée est comparée aux textes intacts du projet (propositions
// des agents gardées par le serveur) : si UN seul texte correspond (les « � »
// remplacés par une lettre), la ligne reprend ce texte. Sinon, petit
// dictionnaire de mots courants. Dry-run par défaut ; « --ecrire » pour écrire.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
const projet = process.argv[2];
const ecrire = process.argv.includes("--ecrire");
const f = `/home/ubuntu/atelier-sites/projets/${projet}.json`;
const p = JSON.parse(readFileSync(f, "utf8"));
const sources = new Set();
for (const b of p.fondations?.reponses?.brouillonsAgents ?? []) {
  if (b.texte && !b.texte.includes("�")) sources.add(b.texte.trim());
  if (b.ajoute && !b.ajoute.includes("�")) sources.add(b.ajoute.trim());
}
const MOTS = { "pr�nom": "prénom", "pr�paration": "préparation", "recommand�": "recommandé", "r�sultat": "résultat", "d�lai": "délai", "probl�me": "problème", "cr�ation": "création", "�toiles": "étoiles", "s�curit�": "sécurité", "qualit�": "qualité", "personnalis�": "personnalisé" };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let nb = 0;
const journal = [];
function reparerLigne(l) {
  if (!l.includes("�")) return l;
  const re = new RegExp("^" + esc(l.trim()).replace(/�+/g, "[^\\s]") + "$");
  const ok = [...sources].filter((s) => re.test(s));
  if (ok.length === 1) return (nb++, journal.push(["source", l.slice(0, 70)]), l.replace(l.trim(), ok[0]));
  // Dictionnaire : chaque suite de « � » vaut une seule lettre.
  let t = l.replace(/�+/g, "�");
  for (const [a, b] of Object.entries(MOTS)) t = t.split(a).join(b);
  t = t.replace(/ � /g, " à ");
  if (t !== l.replace(/�+/g, "�")) nb++, journal.push([t.includes("�") ? "partiel" : "dico", l.slice(0, 70)]);
  else journal.push(["NON RÉPARÉ", l.slice(0, 70)]);
  return t.includes("�") ? t : t;
}
function parcourir(v) {
  if (typeof v === "string") return v.includes("�") ? v.split("\n").map(reparerLigne).join("\n") : v;
  if (Array.isArray(v)) return v.map(parcourir);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "brouillonsAgents" ? x : parcourir(x)]));
  return v;
}
for (const b of p.fondations?.reponses?.brouillonsAgents ?? []) if (b.ajoute?.includes("�") && b.texte && !b.texte.includes("�")) b.ajoute = reparerLigne(b.ajoute);
const neuf = { ...p, fondations: parcourir(p.fondations), offre: parcourir(p.offre), offreFiche: parcourir(p.offreFiche), angles: parcourir(p.angles) };
if (!p.angles) delete neuf.angles;
if (!p.offreFiche) delete neuf.offreFiche;
const reste = JSON.stringify(neuf).split("�").length - 1;
for (const [k, l] of journal) console.log(k.padEnd(11), "|", l);
console.log(`\n${nb} ligne(s) réparée(s) ; caractères « � » restants : ${reste}`);
if (ecrire) {
  copyFileSync(f, `/tmp/${projet}-avant-accents.json`);
  writeFileSync(f, JSON.stringify(neuf, null, 2) + "\n");
  console.log("écrit (copie : /tmp/" + projet + "-avant-accents.json)");
}
