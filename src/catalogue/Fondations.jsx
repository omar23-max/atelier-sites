import { cloneElement, useEffect, useRef, useState } from "react";
import { anglesProgress } from "./Angles.jsx";
import { TYPES_CONTENU, FICHES, blueprintOf, contenuProgress } from "../engine/page-blueprints.js";
import { pageTypeById } from "../engine/page-types.js";
import { figuresIn, unitOf } from "../engine/fidelite.js";
import { empreinte, merge3, partiesEmpreinte, partiesModifiees, PARTIES_A_RELIRE, realText, same, statutFondations, withIds } from "../engine/fondations-etat.js";
import { OffreFiche } from "./OffreFiche.jsx";
import { controlesFiche } from "../engine/offre-fiche.js";
import { BriefCampagne, Mecanismes } from "./DecisionsMessage.jsx";
import { CoutsPanneau } from "./Couts.jsx";
import { RegistreFaits } from "./Registre.jsx";

// Fondations d'un projet (phase 0, une seule fois par produit) : un
// questionnaire de faits que seul l'utilisateur connaît (surtout des cases),
// puis « Compléter avec Claude » crée une demande : Claude fait la recherche
// client, l'offre et les objections avec les skills (docs/TRAITER-DEMANDES.md,
// type « fondations ») et range ses résultats dans fondations.resultats.
// L'utilisateur relit et valide. Les prix, packs, garantie et bonus sont ceux
// du formulaire Offre (project.offre), affiché en partie 5 : une seule source.
//
// projets/<id>.json :
//   fondations: { reponses: {…}, statut: "brouillon" | "demandée" | "validée",
//                 demandeLe, valideLe, resultats: { avatars, douleurs, mots,
//                 objections, promesse, angles, notes },
//                 message: { promesse, mecanisme, preuves: [3], objections:
//                   [{ objection, reponse } ×3] },
//                 contenus: { <type de page>: { <section>: { <champ>: "…" } } } }
//
// « Contenu par type de page » (2026-11-10) : pour chaque type (advertorial,
// listicle, comparatif, landing, offre, produit, accueil), ce que chaque section
// doit dire pour CE projet. La liste des sections et des champs vient de
// src/engine/page-blueprints.js (la même liste que le Page Score).
//
// « Message central » (2026-11-07) : le discours unique du projet, que toutes
// les pages reprennent (promesse, mécanisme, 3 preuves fortes, 3 objections
// principales avec leur réponse). Claude le prépare avec les résultats ;
// l'utilisateur le corrige ici. Rappelé en haut de l'onglet Angles.

const CHOIX = {
  genre: ["Femmes", "Hommes", "Les deux"],
  ages: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
  pays: ["Québec", "Canada", "États-Unis", "France", "Europe", "Autre"],
  essaye: ["Produits de marque", "Produits de pharmacie", "Remèdes maison", "Soins chez un pro", "Médicaments", "Rien encore"],
  ton: ["Chaleureux", "Scientifique", "Luxe", "Direct", "Drôle", "Rassurant"],
};

// Preuves : on ne peut écrire que ce qui existe (règle de l'atelier). Chaque
// case cochée a un champ pour le détail (combien, où, laquelle).
const PREUVES = [
  ["avis", "Avis clients", "combien, où (Shopify, Amazon, Trustpilot…)"],
  ["etude", "Étude ou test clinique", "laquelle, résultat"],
  ["garantie", "Garantie satisfait ou remboursé", "durée"],
  ["certification", "Certification / label", "lesquels (bio, vegan, made in…)"],
  ["avantApres", "Photos avant / après", "combien, autorisées ?"],
  ["video", "Témoignages vidéo", "combien"],
  ["presse", "Presse, médias", "lesquels"],
  ["expert", "Avis d'un expert, médecin", "qui"],
  ["ventes", "Chiffres de ventes", "ex. 50 000 pots vendus"],
];

const TEXTES = {
  produit: [
    ["role", "Ce que fait le produit, en une phrase", "ex. Une crème qui raffermit la peau du visage et du cou en 4 semaines", 2],
    ["usage", "Comment on l'utilise", "ex. Matin et soir, sur peau propre", 1],
    ["lien", "Lien du produit (Shopify, site, fournisseur)", "https://…", 1],
  ],
  clients: [["qui", "Qui sont-ils, en quelques mots", "ex. Femmes actives 50+, qui voient leur visage s'affaisser", 2]],
  probleme: [
    ["douleur", "Le problème principal qu'il règle", "ex. Peau qui se relâche, rides du cou", 2],
    ["echec", "Pourquoi ce qu'ils ont essayé n'a pas marché", "ex. Les crèmes chères ne changent rien, le botox fait peur", 2],
  ],
  // Deux blocs de la recherche psychographique de Jeffrey (2026-11-10) : la
  // matière des mécanismes uniques et des accroches « découverte ». Facultatif.
  recherche: [
    ["curiosite", "Curiosité : quelqu'un a-t-il déjà réglé ce problème d'une façon inhabituelle ? Une solution ancienne, oubliée ?", "ex. Avant 1960, les esthéticiennes utilisaient… ; au Japon, on fait…", 3],
    ["aggravation", "Ce qui a aggravé le problème : était-il moins fréquent avant ? Quelles causes extérieures les clients accusent-ils ?", "ex. Les écrans (tête penchée), le soleil, l'industrie qui vend des crèmes trop diluées", 3],
  ],
  concurrents: [["sites", "Concurrents (un lien par ligne)", "https://…", 3]],
  // Ce que l'utilisateur a trouvé lui-même : la matière la plus précieuse
  // (vrais mots des clients). Claude la lit en premier.
  // Un champ par source (Amazon et Reddit refusent les agents IA : ces avis
  // viennent de l'utilisateur). Claude les lit en premier.
  collecte: [
    ["collecteAmazon", "Avis Amazon (le produit et ses concurrents, surtout 1 à 3 étoiles)", "Concurrent X — 2 étoiles :\n« … »\n\nConcurrent Y — 5 étoiles :\n« … »", 8],
    ["collecteReddit", "Reddit (fils, commentaires)", "r/… — titre du fil :\n« … »", 6],
    ["collecteSocial", "Instagram, TikTok, Facebook (commentaires sous les posts et les pubs)", "TikTok @marque — commentaire :\n« … »", 6],
    ["collecteAutres", "Autres : pubs gagnantes, boutiques concurrentes, WinningHunter, forums…", "Pub Facebook de X : accroche « … », 1 200 commentaires\nBoutique Y : 39 $, 3 packs", 5],
    ["liensRecherche", "Liens à fouiller (un par ligne)", "https://www.amazon.com/…\nhttps://www.reddit.com/r/…", 3],
  ],
};

// Nom lisible d'un champ en conflit (« reponses.usage » → « Comment on l'utilise »).
const OFFRE_NOMS = { promesse: "Offre : promesse", cible: "Offre : client visé", prix: "Offre : prix", packs: "Offre : packs", garantie: "Offre : garantie", bonus: "Offre : bonus", urgence: "Offre : urgence", angles: "Offre : angles", objections: "Offre : objections" };
function nomDuChamp(path) {
  const [zone, key, ...rest] = String(path).split(".");
  if (zone === "reponses") {
    for (const list of Object.values(TEXTES)) for (const [k, l] of list) if (k === key) return l;
    if (key === "preuves") return `Preuve : ${rest[0] ?? ""}`.trim();
    return `Questionnaire : ${key}`;
  }
  if (zone === "offre") return OFFRE_NOMS[key] ?? `Offre : ${key}`;
  if (zone === "message") return `Message central : ${key ?? ""}`.trim();
  if (zone === "contenus") return `Carte ${key ?? ""}${rest[0] ? ` · ${rest[0]}` : ""}`;
  if (zone.startsWith("faits")) return "Un fait chiffré";
  if (zone.startsWith("offreFiche")) return "Fiche d'offre";
  if (zone.startsWith("mecanismes")) return "Une piste de mécanisme";
  if (zone.startsWith("mecanismeChoisi")) return "Le mécanisme choisi";
  if (zone.startsWith("brief")) return "Brief de campagne";
  return path;
}

function Cases({ options, value = [], onChange }) {
  return (
    <div className="cat-fd__cases">
      {options.map((o) => (
        <label key={o} className={value.includes(o) ? "is-on" : ""}>
          <input type="checkbox" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />
          {o}
        </label>
      ))}
    </div>
  );
}

function Champ({ label, placeholder, rows, value, onChange }) {
  return (
    <label className="cat-field">
      <span>{label}</span>
      {rows > 1 ? (
        <textarea rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}

// Contenu par type de page : une carte par type, repliée sauf pour les types
// que le projet utilise déjà. Chaque section de la carte : pourquoi elle est là
// (la raison du Page Score), puis les champs à remplir pour ce projet.
function ContenusEditor({ value, onChange, pages = [] }) {
  const used = {};
  for (const p of pages) {
    const t = p.info?.pageType;
    if (t) used[t] = (used[t] ?? 0) + 1;
  }
  const set = (type, key, k, v) => onChange({ ...value, [type]: { ...value[type], [key]: { ...value[type]?.[key], [k]: v } } });
  return (
    <div className="cat-fd__types">
      {TYPES_CONTENU.map((type) => {
        const fiche = FICHES[type];
        const sections = blueprintOf(type);
        const { done, total, manques } = contenuProgress(value, type);
        const info = pageTypeById[type];
        return (
          <details key={type} className="cat-fd__type" open={used[type] ? true : undefined}>
            <summary>
              <b>{info?.label ?? type}</b>
              <span className="cat-muted">{fiche.famille}</span>
              {used[type] ? <span className="cat-badge cat-badge--blue">{used[type]} page(s) dans ce projet</span> : null}
              <span className={`cat-fd__count${done === total && total ? " is-done" : ""}`} title="Prêts = vrai texte ; les champs [MANQUE] ne comptent pas">
                {done} / {total} prêts{manques ? ` · ${manques} [MANQUE]` : ""}
              </span>
            </summary>
            <div className="cat-fd__fiche">
              <p>
                <b>Pour qui :</b> {fiche.trafic}
              </p>
              <p>
                <b>Sa mission :</b> {fiche.mission}
              </p>
              <ul>
                {fiche.regles.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {info?.parAngle ? (
                <p className="cat-muted">
                  Une page par angle : remplis ici la version de base. Les sections marquées « Angle » seront réécrites pour chaque angle (onglet
                  Angles) ; celles marquées « Socle » restent les mêmes sur toutes les pages.
                </p>
              ) : null}
            </div>
            <ol className="cat-fd__sections">
              {sections.map((s) => (
                <li key={s.key}>
                  <div className="cat-fd__sechead">
                    <strong>{s.label}</strong>
                    {info?.parAngle ? <span className={`cat-badge ${s.zone === "angle" ? "cat-badge--amber" : "cat-badge--grey"}`}>{s.zone === "angle" ? "Angle" : "Socle"}</span> : null}
                  </div>
                  <p className="cat-muted">{s.why}</p>
                  {s.champs.map((ch) => (
                    <label key={ch.k} className="cat-field">
                      <span>{ch.label}</span>
                      {ch.rows > 1 ? (
                        <textarea rows={ch.rows} value={value[type]?.[s.key]?.[ch.k] ?? ""} onChange={(e) => set(type, s.key, ch.k, e.target.value)} />
                      ) : (
                        <input value={value[type]?.[s.key]?.[ch.k] ?? ""} onChange={(e) => set(type, s.key, ch.k, e.target.value)} />
                      )}
                      {ch.hint ? <small className="cat-fd__hint">{ch.hint}</small> : null}
                    </label>
                  ))}
                  {!s.champs.length ? <p className="cat-fd__hint">Pas de texte à préparer : la section vient du catalogue.</p> : null}
                </li>
              ))}
            </ol>
          </details>
        );
      })}
    </div>
  );
}

// Message central : toujours 3 preuves et 3 objections (cases vides au besoin).
export function normalizeMessage(m) {
  // Projet neuf : pas encore de message central (null ou absent).
  m = m ?? {};
  const preuves = [...(m.preuves ?? [])];
  const objections = [...(m.objections ?? [])].map((o) => (typeof o === "string" ? { objection: o, reponse: "" } : { objection: o?.objection ?? "", reponse: o?.reponse ?? "" }));
  while (preuves.length < 3) preuves.push("");
  while (objections.length < 3) objections.push({ objection: "", reponse: "" });
  return { promesse: m.promesse ?? "", mecanisme: m.mecanisme ?? "", preuves: preuves.slice(0, 3), objections: objections.slice(0, 3) };
}

// Prêt seulement avec une vraie promesse et un vrai mécanisme : des
// marqueurs [MANQUE] / [À VALIDER] ne suffisent pas (audit F06, 2026-11-17).
export function messageFilled(project) {
  const m = project.fondations?.message;
  return Boolean(realText(m?.promesse) && realText(m?.mecanisme));
}

function MessageEditor({ value, onChange }) {
  const m = normalizeMessage(value);
  const up = (patch) => onChange({ ...m, ...patch });
  const setPreuve = (i, v) => up({ preuves: m.preuves.map((p, j) => (j === i ? v : p)) });
  const setObj = (i, k, v) => up({ objections: m.objections.map((o, j) => (j === i ? { ...o, [k]: v } : o)) });
  return (
    <>
      <Champ label="La promesse (le résultat, en une phrase)" rows={2} value={m.promesse} onChange={(v) => up({ promesse: v })} placeholder="ex. Une peau du cou plus ferme en 4 semaines, sans aiguille" />
      <Champ label="Le mécanisme (pourquoi ça marche là où le reste a échoué)" rows={2} value={m.mecanisme} onChange={(v) => up({ mecanisme: v })} placeholder="ex. Un peptide qui agit sur…, là où les crèmes classiques restent en surface" />
      <span className="cat-fd__label">Les 3 preuves fortes (seulement celles cochées en 4)</span>
      <div className="cat-fd__mc-list">
        {m.preuves.map((p, i) => (
          <input key={i} value={p} onChange={(e) => setPreuve(i, e.target.value)} placeholder={`Preuve ${i + 1}`} aria-label={`Preuve ${i + 1}`} />
        ))}
      </div>
      <span className="cat-fd__label">Les 3 objections principales et leur réponse</span>
      <div className="cat-fd__mc-obj">
        {m.objections.map((o, i) => (
          <div key={i}>
            <input value={o.objection} onChange={(e) => setObj(i, "objection", e.target.value)} placeholder={`Objection ${i + 1} (ce que pense le client)`} aria-label={`Objection ${i + 1}`} />
            <textarea rows={2} value={o.reponse} onChange={(e) => setObj(i, "reponse", e.target.value)} placeholder="La réponse (avec les faits du questionnaire)" aria-label={`Réponse ${i + 1}`} />
          </div>
        ))}
      </div>
    </>
  );
}

// Rappel en lecture seule (onglet Angles) : le même discours sur chaque page.
export function MessageRecap({ project, onEdit, open = true }) {
  const raw = project.fondations?.message;
  if (!raw?.promesse && !raw?.mecanisme)
    return (
      <div className="cat-mc-recap is-empty">
        <b>Message central</b> pas encore rempli.{" "}
        {onEdit && (
          <button type="button" className="cat-link" onClick={onEdit}>
            Le remplir dans Fondations →
          </button>
        )}
      </div>
    );
  const m = normalizeMessage(raw);
  return (
    <details className="cat-mc-recap" open={open}>
      <summary>
        <b>Message central</b> — repris sur toutes les pages du projet
        {!open && m.promesse && <span className="cat-mc-recap__short"> · {String(m.promesse).slice(0, 140)}{String(m.promesse).length > 140 ? "…" : ""}</span>}
      </summary>
      <dl>
        <dt>Promesse</dt>
        <dd>{m.promesse}</dd>
        <dt>Mécanisme</dt>
        <dd>{m.mecanisme}</dd>
        <dt>Preuves</dt>
        <dd>
          <ol>{m.preuves.filter(Boolean).map((p, i) => <li key={i}>{p}</li>)}</ol>
        </dd>
        <dt>Objections</dt>
        <dd>
          <ol>
            {m.objections
              .filter((o) => o.objection)
              .map((o, i) => (
                <li key={i}>
                  <b>{o.objection}</b> {o.reponse && <>→ {o.reponse}</>}
                </li>
              ))}
          </ol>
        </dd>
      </dl>
      {onEdit && (
        <button type="button" className="cat-link" onClick={onEdit}>
          Modifier dans Fondations
        </button>
      )}
    </details>
  );
}

// Fondations remplies ? (pour la barre d'avancement et le bouton Claude)
export function foundationsFilled(project) {
  const r = project.fondations?.reponses ?? {};
  return Boolean(r.role && r.douleur && (r.genre?.length || r.qui));
}

// Empreinte du contenu des Fondations : sert à savoir si elles ont changé
// depuis leur validation (audit T3, 2026-11-17 : avant, « validées » restait
// affiché après n'importe quelle modification).
// Depuis le 2026-11-17 : src/engine/fondations-etat.js (empreinte v2 : faits,
// offre, message central, questionnaire sans la recherche brute).

// Faits chiffrés typés (audit T1, 2026-11-17) : chaque chiffre de l'offre et
// des preuves a sa nature, sa valeur, son unité, sa source et son état. Un
// fait « validé » autorise ce chiffre sur les pages, un fait « retiré »
// l'interdit même s'il traîne dans un texte des Fondations.
export const NATURES = [
  ["argent", "Prix, montant"],
  ["pourcent", "Pourcentage"],
  ["duree", "Durée"],
  ["note", "Note (sur 5)"],
  ["nombre", "Nombre (avis, clients, ventes…)"],
  ["dose", "Dose, quantité"],
  ["fois", "Multiplicateur (×)"],
];
const ETATS = [
  ["a-confirmer", "À confirmer"],
  ["valide", "Validé"],
  ["retire", "Retiré"],
];

function FaitsEditor({ value = [], onChange, sources }) {
  const set = (i, patch) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  // Retrait d'un fait : annulable (audit F10, 2026-11-17).
  const [retire, setRetire] = useState(null);
  const remove = (i) => {
    setRetire({ fait: value[i], i });
    onChange(value.filter((_, j) => j !== i));
  };
  const undo = () => {
    if (!retire) return;
    const next = [...value];
    next.splice(Math.min(retire.i, next.length), 0, retire.fait);
    onChange(next);
    setRetire(null);
  };
  const add = () => onChange([...value, { id: `f${Date.now().toString(36)}`, nature: "argent", valeur: "", unite: "", source: "", etat: "a-confirmer" }]);
  // Propose les chiffres déjà écrits dans le questionnaire et l'offre (à confirmer).
  function fromTexts() {
    // Identité d'un fait : valeur + nature + unité (« 30 jours » ≠ « 30 mois »).
    const keyOf = (v, nature, unite) => `${v}|${nature}|${unitOf(` ${unite ?? ""}`)?.u ?? ""}`;
    const seen = new Set(value.map((f) => keyOf(f.valeur, f.nature, f.unite)));
    const next = [...value];
    for (const [label, text] of sources) {
      for (const fig of figuresIn(String(text ?? ""))) {
        const nature = fig.kind ?? "nombre";
        const unite = (fig.after.trim().split(/\s+/)[0] ?? "").replace(/[^\p{L}$€£%/×-]/gu, "").replace(/^-/, "");
        const key = keyOf(fig.n, nature, unite);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ id: `f${Date.now().toString(36)}${next.length}`, nature, valeur: fig.n, unite, source: label, etat: "a-confirmer" });
      }
    }
    onChange(next);
  }
  return (
    <div className="cat-faits">
      <table>
        <thead>
          <tr>
            <th>Nature</th>
            <th>Valeur</th>
            <th>Unité</th>
            <th>Source</th>
            <th>État</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {value.map((f, i) => (
            <tr key={f.id ?? i} className={`is-${f.etat}`}>
              <td>
                <select value={f.nature} onChange={(e) => set(i, { nature: e.target.value })} aria-label={`Nature du fait ${i + 1}`}>
                  {NATURES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input value={f.valeur} onChange={(e) => set(i, { valeur: e.target.value })} placeholder="58" aria-label={`Valeur du fait ${i + 1}`} />
              </td>
              <td>
                <input value={f.unite} onChange={(e) => set(i, { unite: e.target.value })} placeholder="$ US, jours, avis…" aria-label={`Unité du fait ${i + 1}`} />
              </td>
              <td>
                <input value={f.source} onChange={(e) => set(i, { source: e.target.value })} placeholder="Page produit, Trustpilot…" aria-label={`Source du fait ${i + 1}`} />
              </td>
              <td>
                <select value={f.etat} onChange={(e) => set(i, { etat: e.target.value })} aria-label={`État du fait ${i + 1}`}>
                  {ETATS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button type="button" className="cat-link" onClick={() => remove(i)} aria-label={`Supprimer le fait ${i + 1}`} title="Supprimer ce fait (annulable)">
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {retire && (
        <p className="cat-faits__undo" role="status">
          Fait supprimé : {retire.fait?.valeur} {retire.fait?.unite}.{" "}
          <button type="button" className="cat-link" onClick={undo}>
            Annuler la suppression
          </button>
        </p>
      )}
      <div className="cat-faits__actions">
        <button type="button" className="cat-btn cat-btn--ghost" onClick={add}>
          + Ajouter un fait
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" onClick={fromTexts}>
          Reprendre les chiffres déjà écrits (à confirmer)
        </button>
      </div>
    </div>
  );
}
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : String(v ?? "").trim() !== "");

// « Adopter dans les Fondations » (2026-11-25) : les propositions des agents,
// champ par champ. Accepter AJOUTE le texte à la fin du champ (rien n'est
// remplacé) et veut dire « je veux m'en servir », pas « c'est prouvé ».
const CHAMPS_BROUILLON = {
  role: "Ce que fait le produit",
  usage: "Comment on l'utilise",
  qui: "Qui sont les clients",
  douleur: "Le problème principal",
  echec: "Pourquoi le reste a échoué",
  curiosite: "Curiosité",
  aggravation: "Ce qui a aggravé le problème",
  sites: "Concurrents (liens)",
  collecteAutres: "Recherche : pubs, boutiques, marché, prix",
  "resultats.avatars": "Résultats : avatars",
  "resultats.douleurs": "Résultats : douleurs",
  "resultats.mots": "Résultats : mots des clients",
  "resultats.objections": "Résultats : objections",
  "resultats.promesse": "Résultats : promesse",
  "offre.promesse": "Offre : promesse",
  "offre.cible": "Offre : client visé",
  "offre.prix": "Offre : prix",
  "offre.packs": "Offre : packs",
  "offre.garantie": "Offre : garantie",
  "offre.bonus": "Offre : bonus",
  "offre.urgence": "Offre : urgence",
  "offre.objections": "Offre : objections",
  "message.promesse": "Message central : promesse",
  "message.mecanisme": "Message central : mécanisme",
  "message.objection": "Message central : une objection",
};
// « Préparer » une étape avec son agent (lot 2, 2026-11-25).
function BoutonPreparer({ projet, etape, onFini }) {
  const [d, setD] = useState(null);
  const [web, setWeb] = useState(false);
  const [err, setErr] = useState(null);
  const charger = () =>
    fetch(`/api/preparer/${projet}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
  useEffect(() => {
    charger();
  }, [projet]);
  const tourne = d?.enCours;
  const moi = tourne?.etape === etape;
  const vu = useRef(null);
  useEffect(() => {
    if (!tourne) return;
    const t = setInterval(charger, 4000);
    return () => clearInterval(t);
  }, [Boolean(tourne)]);
  const dernier = (d?.derniers ?? []).find((x) => x.etape === etape);
  useEffect(() => {
    // Fin d'une préparation lancée ici : les Fondations se rechargent (propositions, pistes, angles).
    if (vu.current && !tourne && dernier && dernier.le !== vu.current) onFini?.();
    vu.current = tourne ? vu.current ?? "en-cours" : dernier?.le ?? null;
  }, [tourne, dernier?.le]);
  if (!d) return null;
  const E = d.etapes?.[etape];
  async function go() {
    setErr(null);
    const r = await fetch(`/api/preparer/${projet}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etape, web }) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    if (!r?.ok) return setErr(b?.error ?? "Échec");
    vu.current = "en-cours";
    charger();
  }
  return (
    <div className="cat-prep">
      <button type="button" className="cat-btn" disabled={Boolean(tourne)} onClick={go} title={`L'agent ${E?.agent} déroule sa méthode avec tout le projet, puis range ses propositions (à trier en haut des Fondations). Environ 0,10 à 0,40 $ ; plus avec la recherche web.`}>
        {moi ? "⏳ Préparation en cours…" : `✨ Préparer : ${E?.titre}`}
      </button>
      <span className="cat-muted">avec {E?.agent}</span>
      <label className="cat-prep__web" title="L'agent peut chercher sur le web (plus complet, plus cher)">
        <input type="checkbox" checked={web} disabled={Boolean(tourne)} onChange={(e) => setWeb(e.target.checked)} /> recherche web
      </label>
      {tourne && !moi && <span className="cat-muted">Une autre préparation tourne ({d.etapes?.[tourne.etape]?.titre}).</span>}
      {moi && <span className="cat-muted">1 à 3 minutes ; tu peux continuer à écrire.</span>}
      {!tourne && dernier && (
        <span className={dernier.erreur ? "rg__err" : "cat-muted"}>
          {dernier.erreur
            ? `⚠ ${dernier.erreur}`
            : `Dernière fois le ${new Date(dernier.le).toLocaleDateString("fr-CA")} : ${dernier.n} proposition(s)${dernier.dollars != null ? ` · ≈ ${dernier.dollars} $` : ""}${dernier.sansJson ? " · réponse sans propositions rangées (voir le rapport)" : ""} · `}
          {!dernier.erreur && (
            <a className="cat-link" href={`/api/preparer/${projet}/rapport/${dernier.fichier}`} target="_blank" rel="noopener noreferrer">
              rapport complet
            </a>
          )}
        </span>
      )}
      {err && <span className="rg__err">⚠ {err}</span>}
    </div>
  );
}
function PropositionsAgents({ rep, set, offre = {}, setOffre = null, msg = null, setMsg = null, projet = null, rafraichir = null }) {
  const l = rep.brouillonsAgents ?? [];
  const [edits, setEdits] = useState({});
  const [voirHisto, setVoirHisto] = useState(false);
  if (!l.length) return null;
  const maj = (id, patch) => set("brouillonsAgents", l.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const champDe = (b) => edits[b.id]?.champ ?? b.champ;
  const texteDe = (b) => edits[b.id]?.texte ?? b.texte;
  const edite = (b, patch) => setEdits((e) => ({ ...e, [b.id]: { champ: champDe(b), texte: texteDe(b), ...patch } }));
  const ajouterTexte = (cur, texte) => (String(cur ?? "").trim() ? `${String(cur).replace(/\s+$/, "")}\n${texte}` : texte);
  const retirerTexte = (cur, texte) => {
    cur = String(cur ?? "");
    const i = texte ? cur.lastIndexOf(texte) : -1;
    return i < 0 ? cur : (cur.slice(0, i).replace(/\n$/, "") + cur.slice(i + texte.length)).replace(/^\n/, "");
  };
  const [err, setErr] = useState(null);
  // Lot 2 : une proposition peut viser le questionnaire, l'offre, le message central ou les résultats.
  async function ecrire(champ, texte, annule = false) {
    const [zone, k] = champ.includes(".") ? champ.split(".") : ["reponses", champ];
    if (zone === "reponses") return set(k, annule ? retirerTexte(rep[k], texte) : ajouterTexte(rep[k], texte)), true;
    if (zone === "offre" && setOffre) return setOffre({ ...offre, [k]: annule ? retirerTexte(offre?.[k], texte) : ajouterTexte(offre?.[k], texte) }), true;
    if (zone === "message" && setMsg) {
      const m = normalizeMessage(msg);
      if (k === "objection") {
        // « objection → réponse » ou « Objection : … Réponse : … ».
        const [o, r] = texte.replace(/^\s*objection\s*:\s*/i, "").split(/\s*(?:→|->|\bR[ée]ponse\s*:)\s*/i);
        if (annule) return setMsg({ ...m, objections: m.objections.map((x) => (x.objection === o ? { objection: "", reponse: "" } : x)) }), true;
        const i = m.objections.findIndex((x) => !x.objection.trim());
        if (i < 0) return setErr("Les 3 objections du message central sont déjà remplies : vide une case d'abord."), false;
        return setMsg({ ...m, objections: m.objections.map((x, j) => (j === i ? { objection: o ?? texte, reponse: r ?? "" } : x)) }), true;
      }
      return setMsg({ ...m, [k]: annule ? retirerTexte(m[k], texte) : ajouterTexte(m[k], texte) }), true;
    }
    if (zone === "resultats" && projet) {
      const r = await fetch(`/api/brouillons/${projet}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resultat", champ, texte, annuler: annule }) }).catch(() => null);
      if (!r?.ok) return setErr("Les résultats n'ont pas pu être mis à jour."), false;
      return true;
    }
    return false;
  }
  async function accepter(b) {
    setErr(null);
    const champ = champDe(b);
    const texte = texteDe(b).trim();
    if (!texte || !(await ecrire(champ, texte))) return;
    maj(b.id, { statut: "accepté", champ, ajoute: texte, decideLe: new Date().toISOString() });
    // Résultats écrits côté serveur : on recharge APRÈS avoir noté la décision.
    if (champ.startsWith("resultats.")) rafraichir?.();
  }
  async function annuler(b) {
    setErr(null);
    if (b.ajoute && !(await ecrire(b.champ, b.ajoute, true))) return;
    maj(b.id, { statut: "proposé", ajoute: undefined, decideLe: undefined });
    if (String(b.champ).startsWith("resultats.")) rafraichir?.();
  }
  const ordre = Object.keys(CHAMPS_BROUILLON);
  const attente = l.filter((b) => b.statut === "proposé").sort((a, b) => ordre.indexOf(a.champ) - ordre.indexOf(b.champ));
  const nbDe = (champ) => attente.filter((b) => b.champ === champ).length;
  function rejeterGroupe(champ) {
    if (!window.confirm(`Rejeter les ${nbDe(champ)} proposition(s) « ${CHAMPS_BROUILLON[champ] ?? champ} » ? (tu pourras les remettre depuis l'historique)`)) return;
    const le = new Date().toISOString();
    set("brouillonsAgents", l.map((b) => (b.statut === "proposé" && b.champ === champ ? { ...b, statut: "rejeté", decideLe: le } : b)));
  }
  const faits = l.filter((b) => b.statut !== "proposé");
  const date = (s) => (s ? new Date(s).toLocaleDateString("fr-CA") : "");
  return (
    <section className="cat-panel cat-fd__props">
      <h3>Propositions des agents {attente.length > 0 && <span className="cat-fd__propsnb">{attente.length} à trier</span>}</h3>
      <p className="cat-muted">
        Trouvées par les agents de recherche (chat ou grille de la Recherche). « Ajouter au champ » met le texte à la fin du champ choisi, sans rien remplacer, et veut dire « je veux m'en servir » : ce n'est pas une preuve. Une accroche de concurrent ne décrit pas ton produit. Pense à enregistrer.
      </p>
      {attente.map((b, i) => (
        <div key={b.id}>
        {(i === 0 || attente[i - 1].champ !== b.champ) && (
          <div className="cat-fd__propgrp">
            <b>{CHAMPS_BROUILLON[b.champ] ?? b.champ}</b> <span className="cat-muted">({nbDe(b.champ)})</span>
            <button type="button" className="cat-link" onClick={() => rejeterGroupe(b.champ)}>
              Rejeter les {nbDe(b.champ)}
            </button>
          </div>
        )}
        <div className="cat-fd__prop">
          <div className="cat-fd__propbar">
            <select value={champDe(b)} onChange={(e) => edite(b, { champ: e.target.value })} aria-label="Champ des Fondations">
              {Object.entries(CHAMPS_BROUILLON).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <small className="cat-muted">
              [{b.source}]{b.agent ? ` · ${String(b.agent).replace(/^(Whitelabeler|ShopFunnels|Shopfunnels)\s+/, "")}` : ""} · {date(b.le)}
            </small>
          </div>
          <textarea rows={2} value={texteDe(b)} onChange={(e) => edite(b, { texte: e.target.value })} aria-label="Texte proposé" />
          <span className="cat-fd__propbtns">
            <button type="button" className="cat-btn" disabled={!texteDe(b).trim()} onClick={() => accepter(b)}>
              Ajouter au champ
            </button>
            <button type="button" className="cat-link" onClick={() => maj(b.id, { statut: "rejeté", decideLe: new Date().toISOString() })}>
              Rejeter
            </button>
          </span>
        </div>
        </div>
      ))}
      {!attente.length && <p className="cat-muted">Tout est trié.</p>}
      {err && <p className="cat-flash is-error">⚠ {err}</p>}
      {faits.length > 0 && (
        <details open={voirHisto} onToggle={(e) => setVoirHisto(e.currentTarget.open)}>
          <summary>Historique ({faits.filter((b) => b.statut === "accepté").length} ajoutée(s), {faits.filter((b) => b.statut === "rejeté").length} rejetée(s))</summary>
          <ul className="cat-fd__histo">
            {faits.map((b) => (
              <li key={b.id}>
                <b>{b.statut === "accepté" ? `✓ ${CHAMPS_BROUILLON[b.champ] ?? b.champ}` : "✗ rejetée"}</b> · {b.ajoute ?? b.texte}{" "}
                <span className="cat-muted">[{b.source}] · {date(b.decideLe)}</span>{" "}
                <button type="button" className="cat-link" onClick={() => (b.statut === "accepté" ? annuler(b) : maj(b.id, { statut: "proposé", decideLe: undefined }))} title={b.statut === "accepté" ? "Retire ce texte du champ (s'il y est encore tel quel) et remet la proposition à trier" : "Remet la proposition à trier"}>
                  {b.statut === "accepté" ? "Annuler" : "Remettre"}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function FoundationsTab({ project, onSave, onMessage, request, offer, pages, step: stepProp = null, onStep = null, nav = null }) {
  const f = project.fondations ?? {};
  const [rep, setRep] = useState(f.reponses ?? {});
  const [msg, setMsg] = useState(f.message ?? null);
  const [cont, setCont] = useState(f.contenus ?? {});
  const [faits, setFaits] = useState(() => withIds(f.faits));
  // L'offre est gérée ici (audit F04) : une seule sauvegarde pour tout.
  const [offre, setOffre] = useState(project.offre ?? {});
  // Lot 3 de l'audit (2026-11-18) : fiche d'offre, pistes de mécanisme, choix, brief.
  const [fiche, setFiche] = useState(project.offreFiche ?? null);
  const [mecas, setMecas] = useState(f.mecanismes ?? []);
  const [choix, setChoix] = useState(f.mecanismeChoisi ?? null);
  const [brief, setBrief] = useState(f.brief ?? {});
  // Version de référence pour la fusion à trois versions (audit F01) : ce que
  // cet onglet a chargé, puis ce qu'il a enregistré en dernier.
  const baseRef = useRef({ fondations: { ...f, faits: withIds(f.faits) }, offre: project.offre ?? {}, offreFiche: project.offreFiche ?? null });
  const [conflit, setConflit] = useState(null);
  // Brouillon gardé (audit F05, 2026-11-17) : tant qu'il n'est pas
  // enregistré, le brouillon (et sa version de référence) est rangé dans ce
  // navigateur ; il survit au changement d'onglet (Angles…), à la fermeture
  // ou au rechargement, et revient à la prochaine ouverture des Fondations.
  const draftKey = `atl-fd-brouillon:${project.id}`;
  const localNow = () => ({ fondations: { reponses: rep, message: msg, contenus: cont, faits, mecanismes: mecas, mecanismeChoisi: choix, brief }, offre, offreFiche: fiche });
  const baseView = () => {
    const b = baseRef.current.fondations;
    return { fondations: { reponses: b.reponses ?? {}, message: b.message ?? null, contenus: b.contenus ?? {}, faits: b.faits ?? [], mecanismes: b.mecanismes ?? [], mecanismeChoisi: b.mecanismeChoisi ?? null, brief: b.brief ?? {} }, offre: baseRef.current.offre ?? {}, offreFiche: baseRef.current.offreFiche ?? null };
  };
  const [restaure, setRestaure] = useState(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (!d?.local) return;
      const l = d.local;
      if (same(l, baseView())) return localStorage.removeItem(draftKey);
      setRep(l.fondations.reponses ?? {});
      setMsg(l.fondations.message ?? null);
      setCont(l.fondations.contenus ?? {});
      setFaits(withIds(l.fondations.faits));
      setOffre(l.offre ?? {});
      setFiche(l.offreFiche ?? null);
      setMecas(l.fondations.mecanismes ?? []);
      setChoix(l.fondations.mecanismeChoisi ?? null);
      setBrief(l.fondations.brief ?? {});
      if (d.base) baseRef.current = d.base;
      setRestaure({ at: d.at });
    } catch {}
  }, []);
  const dirty = !same(localNow(), baseView());
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (dirty) localStorage.setItem(draftKey, JSON.stringify({ base: baseRef.current, local: localNow(), at: new Date().toISOString() }));
        else localStorage.removeItem(draftKey);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  });
  // Fermer l'onglet ou recharger avec un brouillon : le navigateur demande.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // Le sommaire des étapes se cale sous l'en-tête du catalogue (audit F10).
  useEffect(() => {
    const top = document.querySelector(".cat-top");
    if (!top) return;
    const put = () => document.documentElement.style.setProperty("--cat-top-h", `${top.offsetHeight}px`);
    put();
    const ro = new ResizeObserver(put);
    ro.observe(top);
    return () => ro.disconnect();
  }, []);
  // Types de page à faire remplir par Claude : ceux du projet, sinon tous.
  const typesUsed = [...new Set((pages ?? []).map((p) => p.info?.pageType).filter((t) => TYPES_CONTENU.includes(t)))];
  const [askTypes, setAskTypes] = useState(typesUsed.length ? typesUsed : TYPES_CONTENU);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setRep((r) => ({ ...r, [k]: v }));
  // Rechargement après une écriture côté serveur (Préparer, résultats) : avec
  // le brouillon LE PLUS RÉCENT (pas celui du moment où le bouton a été affiché).
  const saveRef = useRef(null);
  const recharger = () => setTimeout(() => saveRef.current?.(true).catch(() => {}), 400);
  const preuves = rep.preuves ?? {};
  const setPreuve = (k, patch) => set("preuves", { ...preuves, [k]: { ...preuves[k], ...patch } });
  const statut = f.statut ?? "brouillon";
  const res = f.resultats;
  // Sous-étapes avec sommaire (audit « Ensuite », 2026-11-17) : une partie du
  // questionnaire à la fois, les autres restent montées (rien n'est perdu en
  // changeant d'étape), boutons d'action toujours visibles en bas.
  // Menu unique du projet (2026-11-22) : l'étape vient du menu du projet
  // (stepProp) ; sans lui, sommaire interne comme avant.
  const [stepLocal, setStepLocal] = useState(0);
  const step = stepProp ?? stepLocal;
  const setStep = onStep ?? setStepLocal;
  const embedded = stepProp != null;
  const countOf = (keys) => [keys.filter((k) => filled(rep[k])).length, keys.length];
  const [p1, p1t] = countOf([...TEXTES.produit, ...TEXTES.clients, ...TEXTES.probleme].map((x) => x[0]).concat(["genre", "ages", "pays", "essaye"]));
  const nbPreuves = Object.values(rep.preuves ?? {}).filter((p) => p?.oui).length;
  const [p3, p3t] = countOf(TEXTES.collecte.map((x) => x[0]));
  const nbTypes = Object.values(cont ?? {}).filter((t) => Object.values(t ?? {}).some((s) => Object.values(s ?? {}).some((v) => realText(v)))).length;
  const STEPS = [
    { label: "Produit et clients", etat: `${p1} / ${p1t} rempli(s)`, ok: foundationsFilled({ fondations: { reponses: rep } }) },
    { label: "Preuves et offre", etat: nbPreuves ? `${nbPreuves} preuve(s) cochée(s)` : "aucune preuve cochée", ok: nbPreuves > 0 },
    { label: "Recherche clients", etat: `${p3} / ${p3t} source(s)${res ? " · résultats de Claude" : ""}`, ok: p3 > 0 || Boolean(res) },
    { label: "Message central", etat: `${messageFilled({ fondations: { message: msg } }) ? "rempli" : "à faire"}${choix?.id ? " · mécanisme choisi" : mecas.length ? ` · ${mecas.length} piste(s)` : ""}`, ok: messageFilled({ fondations: { message: msg } }) },
    { label: "Contenus des pages", etat: `${nbTypes} type(s) de page`, ok: nbTypes > 0 },
  ];
  const go = (i) => {
    setStep(i);
    const calme = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(embedded ? ".cat-menu" : ".cat-fd__steps")?.scrollIntoView({ block: "start", behavior: calme ? "auto" : "smooth" });
  };

  const patch = (extra = {}) => ({
    fondations: { ...f, reponses: rep, ...(msg ? { message: normalizeMessage(msg) } : {}), contenus: cont, faits, ...extra },
  });

  // Avant d'enregistrer : relire le projet sur le serveur et fusionner à
  // trois versions (audit ChatGPT F01, 2026-11-17) — version chargée par cet
  // onglet, brouillon local, version enregistrée maintenant. Un champ changé
  // ailleurs et pas ici est gardé ; un champ changé ici et pas ailleurs
  // l'emporte ; changé des deux côtés différemment → conflit, rien n'est
  // écrasé sans demander. Couvre questionnaire, faits, message, cartes, offre.
  async function patchFresh(extra = {}, { force = false } = {}) {
    const r = await fetch(`/api/projects/${project.id}`);
    if (!r.ok) {
      const e = new Error("Non enregistré : le projet n'a pas pu être relu. Réessaie dans un instant.");
      onMessage({ error: true, text: e.message });
      e.shown = true;
      throw e;
    }
    const rev = r.headers.get("ETag");
    const server = await r.json();
    const sf = { ...(server.fondations ?? {}), faits: withIds(server.fondations?.faits) };
    const base = baseRef.current;
    const conflicts = [];
    const m = (k, b, l, sv) => {
      const out = merge3(b, l, sv, k);
      conflicts.push(...out.conflicts);
      return out.value;
    };
    const reponses = m("reponses", base.fondations.reponses ?? {}, rep, sf.reponses ?? {});
    const message = msg ? m("message", base.fondations.message ? normalizeMessage(base.fondations.message) : null, normalizeMessage(msg), sf.message ? normalizeMessage(sf.message) : null) : sf.message ?? null;
    const contenus = m("contenus", base.fondations.contenus ?? {}, cont, sf.contenus ?? {});
    const faitsM = m("faits", base.fondations.faits ?? [], faits, sf.faits ?? []);
    const offreM = m("offre", base.offre ?? {}, offre, server.offre ?? {});
    const ficheM = m("offreFiche", base.offreFiche ?? null, fiche, server.offreFiche ?? null);
    const mecasM = m("mecanismes", base.fondations.mecanismes ?? [], mecas, sf.mecanismes ?? []);
    const choixM = m("mecanismeChoisi", base.fondations.mecanismeChoisi ?? null, choix, sf.mecanismeChoisi ?? null);
    const briefM = m("brief", base.fondations.brief ?? {}, brief, sf.brief ?? {});
    if (conflicts.length && !force) return { conflicts, server, rev };
    // Ce que les autres ont ajouté apparaît tout de suite ici.
    setRep(reponses);
    if (message) setMsg(message);
    setCont(contenus);
    setFaits(faitsM);
    setOffre(offreM);
    setFiche(ficheM);
    setMecas(mecasM ?? []);
    setChoix(choixM ?? null);
    setBrief(briefM ?? {});
    let fd = { ...sf, reponses, ...(message ? { message } : {}), contenus, faits: faitsM, mecanismes: mecasM ?? [], mecanismeChoisi: choixM ?? null, brief: briefM ?? {}, ...extra };
    // Validées autrefois sans empreinte : la version enregistrée sert de référence.
    if (["validée", "modifiée"].includes(sf.statut) && !sf.valideEmpreinte) fd.valideEmpreinte = empreinte({ ...server, fondations: sf });
    const next = { ...server, offre: offreM, offreFiche: ficheM ?? undefined, fondations: fd };
    if (!ficheM) delete next.offreFiche;
    if (extra.statut === "validée") fd = { ...fd, valideEmpreinte: empreinte(next), valideParties: partiesEmpreinte(next) };
    else if (!("statut" in extra)) fd = statutFondations({ ...next, fondations: fd });
    return { patch: { fondations: fd, offre: offreM, ...(ficheM ? { offreFiche: ficheM } : {}) }, rev, conflicts: [] };
  }

  // Enregistre tout (questionnaire, faits, message, cartes, offre) ; refait
  // la fusion si le projet a bougé entre la lecture et l'écriture (409).
  saveRef.current = (silent, extra, opts) => saveAll(silent, extra, opts);
  async function saveAll(silent, extra = {}, opts = {}) {
    for (let essai = 0; essai < 3; essai++) {
      const out = await patchFresh(extra, opts);
      if (out.conflicts.length) {
        setConflit({ champs: out.conflicts, extra, silent });
        const e = new Error("Conflit");
        onMessage({ error: true, text: `Non enregistré : ${out.conflicts.length} champ(s) ont aussi été modifiés ailleurs. Choisis quelle version garder (bandeau en haut des Fondations).` });
        e.shown = true;
        throw e;
      }
      try {
        const saved = await onSave(out.patch, silent, { rev: out.rev });
        baseRef.current = { fondations: { ...(saved?.fondations ?? out.patch.fondations), faits: withIds((saved?.fondations ?? out.patch.fondations).faits) }, offre: saved?.offre ?? out.patch.offre, offreFiche: saved?.offreFiche ?? out.patch.offreFiche ?? null };
        setConflit(null);
        setRestaure(null);
        try {
          localStorage.removeItem(draftKey);
        } catch {}
        setTick((n) => n + 1);
        return saved;
      } catch (e) {
        if (e.code === 409) continue;
        throw e;
      }
    }
    const e = new Error("Non enregistré : le projet change sans arrêt ailleurs. Réessaie dans un instant.");
    onMessage({ error: true, text: e.message });
    e.shown = true;
    throw e;
  }

  async function save(silent) {
    await saveAll(silent);
  }

  // Conflit : garder ma version pour les champs en conflit, ou reprendre la
  // version enregistrée (mon brouillon de ces champs est alors abandonné).
  async function keepMine() {
    const c = conflit;
    try {
      await saveAll(c?.silent ?? false, c?.extra ?? {}, { force: true });
    } catch {}
  }
  async function takeServer() {
    const r = await fetch(`/api/projects/${project.id}`);
    if (!r.ok) return onMessage({ error: true, text: "Le projet n'a pas pu être relu." });
    const server = await r.json();
    const sf = server.fondations ?? {};
    setRep(sf.reponses ?? {});
    setMsg(sf.message ?? null);
    setCont(sf.contenus ?? {});
    setFaits(withIds(sf.faits));
    setOffre(server.offre ?? {});
    setFiche(server.offreFiche ?? null);
    setMecas(sf.mecanismes ?? []);
    setChoix(sf.mecanismeChoisi ?? null);
    setBrief(sf.brief ?? {});
    baseRef.current = { fondations: { ...sf, faits: withIds(sf.faits) }, offre: server.offre ?? {}, offreFiche: server.offreFiche ?? null };
    setConflit(null);
    setRestaure(null);
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    onMessage({ text: "Version enregistrée reprise. Tes changements non enregistrés sont abandonnés." });
  }

  async function askClaude() {
    if (!foundationsFilled({ fondations: { reponses: rep } }))
      return onMessage({ error: true, text: "Remplis au moins : ce que fait le produit, le problème principal, et qui achète." });
    setBusy(true);
    try {
      await saveAll(true); // la demande lit le questionnaire enregistré
      const dossier = await request(
        "fondations",
        `Projet « ${project.nom} » : poser les fondations (recherche client, avatars, douleurs et mots des clients, promesse, objections, pistes d'angles) à partir du questionnaire Fondations, puis remplir fondations.resultats et l'onglet Offre.`,
        { projet: project.id },
      );
      await saveAll(true, { statut: "demandée", demandeLe: new Date().toISOString(), demande: dossier });
      onMessage({ text: `Demande enregistrée (${dossier}). Dis à Claude « traite les demandes ».` });
    } catch (e) {
      if (!e.shown) onMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  // « Remplir avec Claude » (partie 9) : une demande « fondations » avec
  // details.contenus = les types cochés. Claude écrit seulement les champs
  // vides (scripts/fondations-contenus.mjs) ; rien de ce qui est écrit ici
  // n'est remplacé.
  async function askContenus() {
    if (!askTypes.length) return onMessage({ error: true, text: "Coche au moins un type de page." });
    if (!messageFilled({ fondations: { message: msg } }))
      return onMessage({ error: true, text: "Remplis d'abord le message central (partie 8) : la promesse et le mécanisme. Les cartes en découlent." });
    setBusy(true);
    try {
      await saveAll(true);
      const labels = askTypes.map((t) => pageTypeById[t]?.label ?? t).join(", ");
      const dossier = await request(
        "fondations",
        `Projet « ${project.nom} » : remplir les cartes « Contenu par type de page » (Fondations, partie 9) pour : ${labels}. Seulement les champs vides, à partir du questionnaire, du message central, de l'offre et des angles.`,
        { projet: project.id, contenus: askTypes },
      );
      await saveAll(true, { contenusDemande: { le: new Date().toISOString(), dossier, types: askTypes } });
      onMessage({ text: `Demande enregistrée (${dossier}). Dis à Claude « traite les demandes ».` });
    } catch (e) {
      if (!e.shown) onMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  // Pistes de mécanisme demandées à Claude (lot 3) : une demande « fondations »
  // avec details.mecanismes ; Claude les écrit avec
  // scripts/fondations-decisions.mjs (ajoutées en « hypothèse », rien n'est remplacé).
  async function askMecanismes() {
    if (!foundationsFilled({ fondations: { reponses: rep } }))
      return onMessage({ error: true, text: "Remplis d'abord le produit, le problème et qui achète (étape 1)." });
    if (mecas.length >= 5) return onMessage({ error: true, text: "Déjà 5 pistes : supprime celles qui ne servent pas avant d'en demander d'autres." });
    setBusy(true);
    try {
      await saveAll(true);
      const dossier = await request(
        "fondations",
        `Projet « ${project.nom} » : proposer jusqu'à ${5 - mecas.length} piste(s) de mécanisme (mécanisme du problème / de la solution, croyance à faire évoluer, preuves nécessaires et disponibles, limites, formulations interdites) à partir de la recherche clients et des preuves, en hypothèses.`,
        { projet: project.id, mecanismes: true },
      );
      onMessage({ text: `Demande enregistrée (${dossier}). Dis à Claude « traite les demandes ».` });
    } catch (e) {
      if (!e.shown) onMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  // Le message de succès n'apparaît qu'après un enregistrement confirmé
  // (onSave lève une erreur sinon, déjà affichée) — audit T2.
  async function validate() {
    try {
      await saveAll(true, { statut: "validée", valideLe: new Date().toISOString(), version: (f.version ?? 0) + 1 });
    } catch {
      return;
    }
    onMessage({ text: "Fondations validées. Étape suivante : l'onglet Angles." });
  }

  return (
    <div className="cat-fd">
      <p className="cat-muted">
        Les faits que toi seul connais. Claude s'appuie sur ce qui est coché ici ; les chiffres sans preuve sont signalés, vérifie avant publication. Remplis
        ce que tu sais, puis « Envoyer une demande à Claude » : la demande est mise en file (dis à Claude « traite les demandes ») ; il fera la recherche client et l'offre, et tu valideras.
      </p>
      <div className={`cat-fd__statut is-${statut === "modifiée" ? "modifiee" : statut}`}>
        {statut === "validée"
          ? `Fondations validées le ${new Date(f.valideLe).toLocaleDateString("fr-CA", { dateStyle: "long" })}${f.version ? ` (version ${f.version})` : ""}.`
          : statut === "modifiée"
            ? `Modifiées depuis la validation du ${new Date(f.valideLe).toLocaleDateString("fr-CA", { dateStyle: "long" })}${(() => {
                const ch = partiesModifiees({ ...project, fondations: f }) ?? [];
                return ch.length ? ` : ${ch.map((k) => `${PARTIES_A_RELIRE[k][0]} a changé → à relire : ${PARTIES_A_RELIRE[k][1]}`).join(" ; ")}. Rien n'a été réécrit` : " : relis les changements";
              })()}, puis valide à nouveau.`
            : statut === "demandée"
            ? res
              ? "Claude a complété les fondations : relis ses résultats plus bas, corrige si besoin, puis valide."
              : "Demande envoyée à Claude : dis-lui « traite les demandes »."
            : "Brouillon : remplis le questionnaire."}
      </div>

      <CoutsPanneau cle={`projet-${project.id}`} titre="Dépense IA de ce projet" />
      <PropositionsAgents rep={rep} set={set} offre={offre} setOffre={setOffre} msg={msg} setMsg={setMsg} projet={project.id} rafraichir={recharger} />
      {restaure && !conflit && (
        <div className="cat-fd__brouillon" role="status">
          <b>Brouillon repris</b> : tu avais quitté les Fondations sans enregistrer{restaure.at ? ` (le ${new Date(restaure.at).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })})` : ""}.
          <span>
            <button type="button" className="cat-btn" onClick={() => save().catch(() => {})}>
              Enregistrer maintenant
            </button>
            <button type="button" className="cat-btn cat-btn--ghost" onClick={takeServer}>
              Abandonner ce brouillon
            </button>
          </span>
        </div>
      )}
      {conflit && (
        <div className="cat-fd__conflit" role="alert">
          <b>Modifié aussi ailleurs pendant que tu écrivais</b> (Claude, un autre onglet) : {[...new Set(conflit.champs.map(nomDuChamp))].slice(0, 6).join(" · ")}
          {conflit.champs.length > 6 ? ` et ${conflit.champs.length - 6} autre(s)` : ""}. Les autres changements sont déjà fusionnés.
          <span>
            <button type="button" className="cat-btn" onClick={keepMine}>
              Garder ma version de ces champs
            </button>
            <button type="button" className="cat-btn cat-btn--ghost" onClick={takeServer}>
              Reprendre la version enregistrée
            </button>
          </span>
        </div>
      )}
      <nav className="cat-fd__steps" aria-label="Étapes des Fondations" hidden={embedded}>
        {STEPS.map((s, i) => (
          <button key={s.label} type="button" className={`${i === step ? "is-on" : ""} ${s.ok ? "is-ok" : ""}`} onClick={() => go(i)} aria-current={i === step ? "step" : undefined}>
            <span className="cat-fd__stepnum">{s.ok ? "✓" : i + 1}</span>
            <b>{s.label}</b>
            <small>{s.etat}</small>
          </button>
        ))}
      </nav>
      {step === 0 && !STEPS[0].ok && <p className="cat-fd__min">Minimum pour demander à Claude : ce que fait le produit, le problème principal et qui achète.</p>}

      <div className="cat-fd__step" hidden={step !== 0}>
      <BoutonPreparer projet={project.id} etape="produit" onFini={recharger} />
      <section className="cat-panel">
        <h3>1. Le produit</h3>
        {TEXTES.produit.map(([k, l, p, r]) => (
          <Champ key={k} label={l} placeholder={p} rows={r} value={rep[k]} onChange={(v) => set(k, v)} />
        ))}
      </section>

      <section className="cat-panel">
        <h3>2. Qui achète</h3>
        <span className="cat-fd__label">Genre</span>
        <Cases options={CHOIX.genre} value={rep.genre} onChange={(v) => set("genre", v)} />
        <span className="cat-fd__label">Âge</span>
        <Cases options={CHOIX.ages} value={rep.ages} onChange={(v) => set("ages", v)} />
        <span className="cat-fd__label">Où ils vivent</span>
        <Cases options={CHOIX.pays} value={rep.pays} onChange={(v) => set("pays", v)} />
        {TEXTES.clients.map(([k, l, p, r]) => (
          <Champ key={k} label={l} placeholder={p} rows={r} value={rep[k]} onChange={(v) => set(k, v)} />
        ))}
      </section>

      <section className="cat-panel">
        <h3>3. Le problème</h3>
        {TEXTES.probleme.slice(0, 1).map(([k, l, p, r]) => (
          <Champ key={k} label={l} placeholder={p} rows={r} value={rep[k]} onChange={(v) => set(k, v)} />
        ))}
        <span className="cat-fd__label">Ce qu'ils ont déjà essayé</span>
        <Cases options={CHOIX.essaye} value={rep.essaye} onChange={(v) => set("essaye", v)} />
        {TEXTES.probleme.slice(1).map(([k, l, p, r]) => (
          <Champ key={k} label={l} placeholder={p} rows={r} value={rep[k]} onChange={(v) => set(k, v)} />
        ))}
        <span className="cat-fd__label">Pour aller plus loin (facultatif)</span>
        {TEXTES.recherche.map(([k, l, p, r]) => (
          <Champ key={k} label={l} placeholder={p} rows={r} value={rep[k]} onChange={(v) => set(k, v)} />
        ))}
      </section>

      <VideosConcurrents value={rep.videosConcurrents} onChange={(v) => set("videosConcurrents", v)} project={project} onMessage={onMessage} preuves={preuves} onAdopt={(k, detail) => setPreuve(k, { oui: true, detail })} />

      </div>
      <div className="cat-fd__step" hidden={step !== 1}>
      <BoutonPreparer projet={project.id} etape="offre" onFini={recharger} />
      {/* Lot 1 (2026-11-25) : registre calculé sur le brouillon en cours. */}
      <RegistreFaits project={{ ...project, offre, offreFiche: fiche, fondations: { ...f, reponses: rep, faits, message: msg } }} />
      <section className="cat-panel">
        <h3>4. Les preuves que tu as vraiment</h3>
        <div className="cat-fd__preuves">
          {PREUVES.map(([k, l, p]) => (
            <div key={k} className={preuves[k]?.oui ? "is-on" : ""}>
              <label>
                <input type="checkbox" checked={Boolean(preuves[k]?.oui)} onChange={(e) => setPreuve(k, { oui: e.target.checked })} />
                {l}
              </label>
              {preuves[k]?.oui && <input value={preuves[k]?.detail ?? ""} onChange={(e) => setPreuve(k, { detail: e.target.value })} placeholder={p} />}
            </div>
          ))}
        </div>
      </section>

      <section className="cat-panel">
        <h3>Faits chiffrés</h3>
        <p className="cat-muted">
          Chaque chiffre que les pages peuvent citer : sa nature (un prix de 30 $ n'autorise pas « 30 jours »), sa valeur, d'où il vient. « Validé » :
          utilisable ; « Retiré » : interdit, même s'il reste écrit ailleurs dans les Fondations ; « À confirmer » : à vérifier avant publication.
        </p>
        <FaitsEditor
          value={faits}
          onChange={setFaits}
          sources={[
            ["Questionnaire : produit", rep.role],
            ["Questionnaire : preuves", JSON.stringify(rep.preuves ?? {})],
            ["Offre", JSON.stringify(offre ?? {})],
          ]}
        />
      </section>

      {/* 5. L'offre : un seul formulaire (OfferTab), avec son propre bouton
          Enregistrer — plus de doublon avec un onglet Offre séparé (2026-11-08). */}
      <section className="cat-panel">
        <h3>5. L'offre</h3>
        <h4 className="cat-fd__sub">Fiche d'offre (packs, prix, conditions)</h4>
        <p className="cat-muted">
          Les données commerciales : les prix par unité et les remises se calculent seuls, et les pages reprennent ces chiffres. Les champs en dessous restent le
          texte de vente.
        </p>
        <OffreFiche value={fiche} onChange={setFiche} texteOffre={offre.packs} />
        <h4 className="cat-fd__sub">Texte de vente de l'offre</h4>
        {offer && cloneElement(offer, { form: offre, setForm: setOffre, onSaveAll: (silent) => saveAll(silent) })}
      </section>

      <section className="cat-panel">
        <h3>6. Concurrents et ton</h3>
        {TEXTES.concurrents.map(([k, l, p, r]) => (
          <Champ key={k} label={l} placeholder={p} rows={r} value={rep[k]} onChange={(v) => set(k, v)} />
        ))}
        <span className="cat-fd__label">Ton de la marque</span>
        <Cases options={CHOIX.ton} value={rep.ton} onChange={(v) => set("ton", v)} />
      </section>

      </div>
      <div className="cat-fd__step" hidden={step !== 2}>
      <BoutonPreparer projet={project.id} etape="recherche" onFini={recharger} />
      <section className="cat-panel">
        <h3>7. Ce que tu as trouvé toi-même</h3>
        <p className="cat-muted">
          Les vrais mots des clients, source par source. Amazon et Reddit refusent l'accès aux agents IA : ce que tu colles ici est la
          seule façon d'en profiter. Claude le lit en premier, puis complète avec ce qu'il peut consulter lui-même (sites, Trustpilot,
          revendeurs).
        </p>
        {TEXTES.collecte.map(([k, l, p, r]) => (
          <Champ key={k} label={l} placeholder={p} rows={r} value={rep[k]} onChange={(v) => set(k, v)} />
        ))}
      </section>
      {rep.rapportsAgents?.length > 0 && (
        <section className="cat-panel">
          <h3>Rapports complets des agents</h3>
          <p className="cat-muted">Les rapports des agents de la Recherche sur ce produit, gardés tels quels (fichiers agents/rapports/). Observations et estimations : elles inspirent la recherche client et l'offre, elles ne prouvent rien. Claude les lit quand tu lui envoies une demande.</p>
          {rep.rapportsAgents.map((r) => (
            <details key={r.id ?? r.fichier} className="cat-fdv__analyse" onToggle={(e) => {
              const d = e.currentTarget;
              if (!d.open || d.dataset.charge) return;
              d.dataset.charge = "1";
              fetch(r.projet ? `/api/preparer/${r.projet}/rapport/${r.fichier}` : `/api/candidats/rapport/${r.candidat}/${r.fichier}`).then((x) => (x.ok ? x.text() : "Rapport introuvable.")).then((t) => (d.querySelector("div").textContent = t)).catch(() => {});
            }}>
              <summary>
                📄 {r.agent} · {r.le ? new Date(r.le).toLocaleDateString("fr-CA") : ""}{" "}
                <a className="cat-link" href={r.projet ? `/api/preparer/${r.projet}/rapport/${r.fichier}?telecharger` : `/api/candidats/rapport/${r.candidat}/${r.fichier}?telecharger`} onClick={(e) => e.stopPropagation()}>
                  télécharger
                </a>
              </summary>
              <div style={{ whiteSpace: "pre-wrap", maxHeight: 420, overflow: "auto" }}>Chargement…</div>
            </details>
          ))}
        </section>
      )}
      {rep.notesAgents?.length > 0 && (
        <section className="cat-panel">
          <h3>Notes adoptées depuis Agents army</h3>
          <p className="cat-muted">Des résultats d'agents que tu as gardés. Ce sont des pistes de recherche : elles inspirent, elles ne prouvent rien tant que tu ne les as pas ajoutées à tes preuves avec leur source.</p>
          {rep.notesAgents.map((n, i) => (
            <details key={i} className="cat-fdv__analyse">
              <summary>
                {n.agent || "Agent"} · {new Date(n.le).toLocaleDateString("fr-CA")} — {String(n.texte).replace(/[#*_>`]/g, "").slice(0, 90)}…
              </summary>
              <div style={{ whiteSpace: "pre-wrap" }}>{n.texte}</div>
              <button type="button" className="cat-link" onClick={() => set("notesAgents", rep.notesAgents.filter((_, j) => j !== i))}>
                Retirer cette note
              </button>
            </details>
          ))}
        </section>
      )}

      {res && (
        <section className="cat-panel cat-fd__res">
          <details className="cat-fd__resfold">
          <summary>
            <b>Résultats de Claude</b> · {["promesse", "avatars", "douleurs", "mots", "objections", "angles", "notes"].filter((k) => filled(res[k])).length} partie(s) — cliquer pour relire
          </summary>
          {[
            ["promesse", "Promesse"],
            ["avatars", "Avatars"],
            ["douleurs", "Douleurs"],
            ["mots", "Les mots des clients"],
            ["objections", "Objections et réponses"],
            ["angles", "Pistes d'angles"],
            ["notes", "Notes"],
          ].map(([k, l]) =>
            res[k] ? (
              <div key={k}>
                <span className="cat-fd__label">{l}</span>
                {Array.isArray(res[k]) ? (
                  <ul>
                    {res[k].map((x, i) => (
                      <li key={i}>{typeof x === "string" ? x : Object.values(x).filter(Boolean).join(" — ")}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{res[k]}</p>
                )}
              </div>
            ) : null,
          )}
          </details>
        </section>
      )}
      </div>

      <div className="cat-fd__step" hidden={step !== 3}>
      <BoutonPreparer projet={project.id} etape="mecanisme" onFini={recharger} />
      <BoutonPreparer projet={project.id} etape="message" onFini={recharger} />
      <BoutonPreparer projet={project.id} etape="angles" onFini={recharger} />
      <section className="cat-panel">
        <h3>Pistes de mécanisme (méthode Jeffrey)</h3>
        <p className="cat-muted">
          Jusqu'à 5 pistes, chacune avec le mécanisme du problème (pourquoi rien n'a marché) et celui de la solution (pourquoi ce produit marche). Tu en choisis une
          et tu notes pourquoi ; les autres restent gardées. Une piste sans preuve reste une hypothèse.
        </p>
        <Mecanismes
          value={mecas}
          choix={choix}
          onChange={setMecas}
          onChoix={setChoix}
          busy={busy}
          onAsk={askMecanismes}
          onToMessage={(p) => setMsg({ ...normalizeMessage(msg), mecanisme: `${p.ums}${realText(p.ump) ? ` — là où le reste échoue : ${p.ump}` : ""}` })}
        />
      </section>
      <section className="cat-panel cat-fd__mc">
        <h3>8. Message central</h3>
        <p className="cat-muted">
          Le discours unique du projet : toutes les pages (listicle, advertorial, landing, page produit, homepage) le reprennent, avec les
          mots de leur angle autour. Claude le prépare avec « Envoyer une demande à Claude » ; tu le corriges ici. Aucune preuve qui ne soit cochée
          en 4.
        </p>
        <MessageEditor value={msg} onChange={setMsg} />
      </section>
      <section className="cat-panel">
        <h3>Brief de campagne</h3>
        <p className="cat-muted">
          Le contexte de la page à écrire : pour qui, d'où vient le visiteur, quelle promesse la pub a faite, quel mécanisme, quelle offre, quelles preuves. La
          rédaction des pages le suit ; tu peux le copier ou le télécharger.
        </p>
        <BriefCampagne
          project={project}
          value={brief}
          onChange={setBrief}
          fondations={{ ...f, reponses: rep, faits, message: msg ? normalizeMessage(msg) : f.message, version: f.version }}
          piste={mecas.find((m) => m.id === choix?.id) ?? null}
          fiche={fiche}
          typesPage={TYPES_CONTENU.map((t) => [t, pageTypeById[t]?.label ?? t])}
          avatars={(res?.avatars ?? []).map((a) => (typeof a === "string" ? a : a?.nom ?? a?.titre ?? "")).filter(Boolean)}
        />
      </section>

      </div>
      <div className="cat-fd__step" hidden={step !== 4}>
      <section className="cat-panel">
        <h3>9. Contenu par type de page</h3>
        <p className="cat-muted">
          Ce que chaque page doit dire, section par section, pour ce produit. Les sections sont celles que la couverture de structure attend sur ce type de
          page, dans l'ordre. Écris seulement ce qui est vrai : une preuve ou un chiffre que tu n'as pas se note [MANQUE]. Les cartes des
          types de page déjà présents dans le projet sont ouvertes.
        </p>
        <div className="cat-fd__ask">
          <span className="cat-fd__label">Faire remplir par Claude les cartes de :</span>
          <div className="cat-fd__cases">
            {TYPES_CONTENU.map((t) => (
              <label key={t} className={askTypes.includes(t) ? "is-on" : ""}>
                <input type="checkbox" checked={askTypes.includes(t)} onChange={(e) => setAskTypes(e.target.checked ? [...askTypes, t] : askTypes.filter((x) => x !== t))} />
                {pageTypeById[t]?.label ?? t}
              </label>
            ))}
          </div>
          <button type="button" className="cat-btn" disabled={busy} onClick={askContenus}>
            {busy ? "Envoi…" : `Envoyer une demande à Claude (${askTypes.length})`}
          </button>
          <p className="cat-fd__hint">
            Claude écrit seulement les champs vides, à partir du questionnaire, du message central, de l'offre et des angles. Ce que tu as
            déjà écrit n'est jamais remplacé.
            {f.contenusRemplisLe && (!f.contenusDemande || f.contenusRemplisLe >= f.contenusDemande.le)
              ? ` Cartes remplies par Claude le ${new Date(f.contenusRemplisLe).toLocaleDateString("fr-CA", { dateStyle: "long" })} : relis et corrige.`
              : f.contenusDemande
                ? ` Demande envoyée le ${new Date(f.contenusDemande.le).toLocaleDateString("fr-CA", { dateStyle: "long" })} : dis à Claude « traite les demandes », puis recharge cette page.`
                : ""}
          </p>
        </div>
        {(() => {
          const ref = f.contenusEmpreinte;
          const now = empreinte({ offre, fondations: { reponses: rep, message: msg, faits } });
          const manques = TYPES_CONTENU.reduce((n, t) => n + contenuProgress(cont, t).manques, 0);
          return (
            <>
              {ref && ref !== now && (
                <div className="cat-fd__relire" role="status">
                  <b>Cartes à relire</b> : les faits, l'offre ou le message central ont changé depuis leur rédaction par Claude. Rien n'a été réécrit ; relis les
                  passages concernés (prix, garantie, preuves…).
                  <button type="button" className="cat-btn cat-btn--ghost" onClick={() => saveAll(false, { contenusEmpreinte: now }).catch(() => {})}>
                    J'ai relu les cartes
                  </button>
                </div>
              )}
              {manques > 0 && (
                <p className="cat-fd__hint">
                  {manques} champ(s) marqués [MANQUE] : ajoute d'abord le fait ou la preuve qui manque (étape « Preuves et offre »), puis « Envoyer une demande à Claude » les
                  complète — ces champs ne sont jamais comptés comme prêts.
                </p>
              )}
            </>
          );
        })()}
        <ContenusEditor value={cont} onChange={setCont} pages={pages} />
      </section>

      </div>

      <div className="cat-actions cat-fd__bar">
        {embedded && nav ? (
          <>
            <button type="button" className="cat-btn cat-btn--ghost" disabled={!nav.prev} onClick={() => nav.prev?.go()}>
              ← {nav.prev?.label ?? "Précédent"}
            </button>
            <button type="button" className="cat-btn cat-btn--ghost" disabled={!nav.next} onClick={() => nav.next?.go()}>
              {nav.next?.label ?? "Suivant"} →
            </button>
          </>
        ) : (
          <>
            <button type="button" className="cat-btn cat-btn--ghost" disabled={step === 0} onClick={() => go(step - 1)}>
              ← {step > 0 ? STEPS[step - 1].label : "Précédent"}
            </button>
            <button type="button" className="cat-btn cat-btn--ghost" disabled={step === STEPS.length - 1} onClick={() => go(step + 1)}>
              {step < STEPS.length - 1 ? STEPS[step + 1].label : "Suivant"} →
            </button>
          </>
        )}
        <span className="cat-fd__barsep" />
        <span className={`cat-fd__etat${dirty ? " is-dirty" : ""}`} role="status" aria-live="polite">
          {dirty ? "● Modifications non enregistrées" : "✓ Tout est enregistré"}
        </span>
        <button type="button" className="cat-btn cat-btn--ghost" onClick={() => save()}>
          Enregistrer
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" disabled={busy} onClick={askClaude}>
          {busy ? "Envoi…" : "Envoyer une demande à Claude"}
        </button>
        <button type="button" className="cat-btn" disabled={!res && statut !== "validée" && statut !== "modifiée"} onClick={validate} title={res ? "" : "Après les résultats de Claude"}>
          {statut === "modifiée" ? "Valider à nouveau" : "Valider les fondations"}
        </button>
      </div>
    </div>
  );
}

// Barre d'avancement du projet : ① Fondations → ② Angles → ③ Pages → ④ Pubs →
// ⑤ Audit → ⑥ Résultats. Chaque étape dit où elle en est.
export function ProjectProgress({ project, pages, onGo, current }) {
  const fd = project.fondations?.statut;
  // Angles : faits quand des angles sont choisis ET la page mère désignée.
  // Pages : chaque angle choisi a sa page, et chaque page passe l'audit (≥ 80).
  const ang = anglesProgress(project, pages.map((p) => p.info?.name));
  const creatives = project.creatives ?? [];
  const audites = pages.filter((p) => p.score?.type && p.score.score >= 80).length;
  const exported = Object.values(project.publication ?? {}).filter((p) => p.html).length;
  const pagesDone = pages.length && (!ang.chosen || ang.withPage === ang.chosen) && audites === pages.length;
  const steps = [
    ["fondations", "Fondations", fd === "validée" ? "done" : fd === "demandée" || fd === "modifiée" ? "doing" : foundationsFilled(project) ? "doing" : "todo", fd === "validée" ? "validées" : fd === "modifiée" ? "à revalider" : fd === "demandée" ? "chez Claude" : "à faire"],
    ["angles", "Angles", ang.chosen ? "done" : "todo", ang.chosen ? `${ang.chosen} choisi(s)` : "à choisir"],
    ["pages", "Pages", pagesDone ? "done" : pages.length ? "doing" : "todo", pages.length ? `${pages.length} page(s) · ${audites} ≥ 80` : "aucune"],
    // ["creatives", "Pubs", creatives.length ? "done" : "todo", creatives.length ? `${creatives.length} créative(s)` : "à faire"], // retiré pour l'instant (2026-11-12, demande de l'utilisateur)
    ["publication", "Exports", pages.length && exported >= pages.length ? "done" : exported ? "doing" : "todo", `${exported} / ${pages.length} exportée(s)`],
    // ["resultats", "Résultats", "todo", "après la mise en ligne"], // retiré pour l'instant (2026-11-12, demande de l'utilisateur)
  ];
  return (
    <ol className="cat-progress" role="tablist">
      {steps.map(([tab, label, state, detail], i) => (
        <li key={label} className={`is-${state}${current === tab ? " is-current" : ""}`}>
          <button type="button" role="tab" aria-selected={current === tab} onClick={() => onGo(tab)}>
            <i>{state === "done" ? "✓" : i + 1}</i>
            <b>{label}</b>
            <small>{detail}</small>
          </button>
        </li>
      ))}
    </ol>
  );
}


// ---- Menu unique du projet (2026-11-22, fichier « menu fondations.xlsx ») ----
// 1 Produits et clients · 2 Preuves et offres · 3 Recherche client ·
// 4 Marque et design · 5 Médias / 6 Message central · 7 Angles · 8 Textes ·
// 9 Contenu des pages · 10 Pages · Exports. Les étapes 1, 2, 3, 6 et 9 sont
// les parties des Fondations (fd = numéro de sous-étape).
// Refonte guidée, lot 3 (2026-11-23) : 4 phases, dans l'ordre où l'on décide.
export const PROJECT_PHASES = [
  ["valider", "Valider", "avant de dépenser"],
  ["decider", "Décider", "offre, message, marque"],
  ["produire", "Produire", "textes, médias, pubs"],
  ["publier", "Publier", "pages et exports"],
];
export const PROJECT_MENU = [
  { id: "produit", label: "Produits et clients", fd: 0, phase: "valider" },
  { id: "validation", label: "Validation produit", phase: "valider" },
  { id: "recherche", label: "Recherche client", fd: 2, phase: "valider" },
  { id: "preuves", label: "Preuves et offres", fd: 1, phase: "decider" },
  { id: "message", label: "Message central", fd: 3, phase: "decider" },
  { id: "angles", label: "Angles", phase: "decider" },
  { id: "marque", label: "Marque et design", phase: "decider" },
  { id: "contenus", label: "Contenu des pages", fd: 4, phase: "produire" },
  { id: "textes", label: "Textes", phase: "produire" },
  { id: "images", label: "Médias", phase: "produire" },
  { id: "publicites", label: "Publicités", phase: "produire" },
  { id: "pages", label: "Pages", phase: "publier" },
  { id: "publication", label: "Exports", final: true, phase: "publier" },
];

export function ProjectMenu({ project, pages, onGo, current }) {
  const f = project.fondations ?? {};
  const rep = f.reponses ?? {};
  const fd = f.statut;
  const nbPreuves = Object.values(rep.preuves ?? {}).filter((p) => p?.oui).length;
  const nbSources = TEXTES.collecte.filter(([k]) => filled(rep[k])).length;
  const nbVideos = (rep.videosConcurrents ?? []).length;
  const marque = project.marque ?? {};
  const marqueOk = Boolean(marque.logos?.length || marque.brandBoard || marque.palette || marque.couleurs);
  const nbTypes = Object.values(f.contenus ?? {}).filter((t) => Object.values(t ?? {}).some((sct) => Object.values(sct ?? {}).some((v) => realText(v)))).length;
  const ang = anglesProgress(project, pages.map((p) => p.info?.name));
  const audites = pages.filter((p) => p.score?.type && p.score.score >= 80).length;
  const exported = Object.values(project.publication ?? {}).filter((p) => p.html).length;
  const pagesDone = pages.length && (!ang.chosen || ang.withPage === ang.chosen) && audites === pages.length;
  const st = {
    produit: [foundationsFilled(project) ? "done" : filled(rep.role) || filled(rep.qui) ? "doing" : "todo", foundationsFilled(project) ? `rempli${nbVideos ? ` · ${nbVideos} vidéo(s)` : ""}` : "à remplir"],
    validation: project.validation?.verdict ? ["done", `${{ GO: "GO", GO_CONDITIONS: "GO avec conditions", ALTERNATIVES: "Chercher mieux", NO_GO: "NON" }[project.validation.verdict] ?? project.validation.verdict}${project.validation.score != null ? ` · ${project.validation.score}/10` : ""}`] : ["todo", "verdict, tendance, marge"],
    publicites: ["none", "images et vidéos"],
    // Audit F20 (2026-11-25) : vert = preuves cochées ET offre commerciale sans erreur (pas la seule présence de preuves).
    preuves: (() => {
      const fiche = project.offreFiche;
      const erreurs = fiche ? controlesFiche(fiche).filter((c) => c.niveau === "erreur").length : null;
      const etat = nbPreuves && fiche && !erreurs ? "done" : nbPreuves || fiche ? "doing" : "todo";
      return [etat, `${nbPreuves} preuve(s) · ${!fiche ? "offre à remplir" : erreurs ? `${erreurs} erreur(s) dans l'offre` : "offre complète"}`];
    })(),
    recherche: [nbSources || f.resultats ? "done" : "todo", `${nbSources} source(s)${f.resultats ? " · Claude" : ""}`],
    marque: [marqueOk ? "done" : "todo", marqueOk ? "commencée" : "logo, couleurs, planche"],
    images: ["none", "photos et vidéos"],
    message: [messageFilled(project) ? "done" : "todo", messageFilled(project) ? "rempli" : "à faire"],
    angles: [ang.chosen ? "done" : "todo", ang.chosen ? `${ang.chosen} choisi(s)` : "à choisir"],
    textes: ["none", "d'origine et corrigés"],
    contenus: [nbTypes ? "done" : "todo", `${nbTypes} type(s) de page`],
    pages: [pagesDone ? "done" : pages.length ? "doing" : "todo", pages.length ? `${pages.length} page(s) · ${audites} ≥ 80` : "aucune"],
    publication: [pages.length && exported >= pages.length ? "done" : exported ? "doing" : "todo", `${exported} / ${pages.length} exportée(s)`],
  };
  // Prochaine étape : la première, dans l'ordre des phases, qui reste à faire.
  const prochaine = PROJECT_MENU.find((m) => ["todo", "doing"].includes((st[m.id] ?? ["none"])[0]));
  return (
    <div className="cat-menu">
      {prochaine && prochaine.id !== current && (
        <button type="button" className="cat-menu__next" onClick={() => onGo(prochaine.id)}>
          Prochaine étape : <b>{prochaine.label}</b> →
        </button>
      )}
      <nav className="cat-menu__phases" aria-label="Étapes du projet">
        {PROJECT_PHASES.map(([ph, nom, sous], pi) => (
          <div key={ph} className="cat-menu__phase">
            <p className="cat-menu__phaseTitle">
              <span>{String(pi + 1).padStart(2, "0")}</span> {nom} <em>{sous}</em>
            </p>
            <div className="cat-menu__phaseItems">
              {PROJECT_MENU.filter((m) => m.phase === ph).map((m) => {
                const i = PROJECT_MENU.indexOf(m);
                const [state, detail] = st[m.id] ?? ["none", ""];
                return (
                  <button key={m.id} type="button" className={`cat-menu__item is-${state}${current === m.id ? " is-current" : ""}${m.final ? " is-final" : ""}${prochaine?.id === m.id ? " is-next" : ""}`} aria-current={current === m.id ? "step" : undefined} onClick={() => onGo(m.id)}>
                    <i>{m.final ? "⤓" : state === "done" ? "✓" : i + 1}</i>
                    <b>{m.label}</b>
                    <small>{detail}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <p className="cat-menu__fd">
        Fondations : {fd === "validée" ? "validées" : fd === "modifiée" ? "à revalider" : fd === "demandée" ? "chez Claude" : "brouillon"} (étapes {PROJECT_MENU.map((m, i) => (m.fd != null ? i + 1 : null)).filter(Boolean).join(", ").replace(/, (\d+)$/, " et $1")})
      </p>
    </div>
  );
}

// ---- Vidéos des concurrents (2026-11-22) ----
// Dans « Produits et clients » : des pubs vidéo de concurrents (du PC, ou
// déjà dans le projet : imports WinningHunter, Canvas). « Analyser les
// angles » : Gemini regarde la vidéo et en tire accroche, angle, promesse,
// preuves, script. Claude lit ces analyses avec le reste des Fondations.
function VideosConcurrents({ value, onChange, project, onMessage, preuves = {}, onAdopt }) {
  const [adopte, setAdopte] = useState(null); // index de la vidéo dont le formulaire est ouvert
  const list = Array.isArray(value) ? value : [];
  const [busy, setBusy] = useState(null);
  const [picker, setPicker] = useState(null);
  const fileRef = useRef(null);
  const page = `projet-${project.id}`;
  const add = (items) => onChange([...list, ...items.filter((it) => !list.some((x) => x.url === it.url))]);
  async function upload(files) {
    setBusy("upload");
    const added = [];
    try {
      for (const file of files) {
        if (file.size > 70 * 1024 * 1024) {
          onMessage?.({ error: true, text: `« ${file.name} » est trop lourde (70 Mo au plus).` });
          continue;
        }
        const dataUrl = await new Promise((ok, ko) => {
          const r = new FileReader();
          r.onload = () => ok(r.result);
          r.onerror = ko;
          r.readAsDataURL(file);
        });
        const res = await fetch(`/api/medias/${page}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, dataUrl }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.url) throw new Error(body.error ?? "Envoi refusé");
        added.push({ url: body.url, nom: file.name, source: "PC" });
      }
      if (added.length) add(added);
    } catch (e) {
      onMessage?.({ error: true, text: `Vidéo non envoyée : ${e.message}` });
    } finally {
      setBusy(null);
    }
  }
  async function openPicker() {
    try {
      const all = await fetch(`/api/medias/${page}?detail=1`).then((r) => r.json());
      setPicker((Array.isArray(all) ? all : []).filter((m) => m.kind === "video"));
    } catch {
      setPicker([]);
    }
  }
  async function analyse(i) {
    const v = list[i];
    setBusy(i);
    try {
      const res = await fetch("/api/fondations-video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projet: project.id, url: v.url }) });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(res.status >= 500 ? `le serveur n'a pas répondu (erreur ${res.status})` : "réponse inattendue");
      }
      if (!res.ok) throw new Error(body.error ?? `erreur ${res.status}`);
      onChange(list.map((x, j) => (j === i ? { ...x, analyse: body.analyse, analyseLe: new Date().toISOString() } : x)));
      onMessage?.({ text: "Analyse ajoutée. Pense à enregistrer." });
    } catch (e) {
      onMessage?.({ error: true, text: `Analyse impossible : ${e.message}` });
    } finally {
      setBusy(null);
    }
  }
  const nameOf = (u) => decodeURIComponent(String(u).split("/").pop());
  return (
    <section className="cat-panel cat-fdv">
      <h3>4. Vidéos des concurrents (facultatif)</h3>
      <p className="cat-muted">Des pubs vidéo qui marchent chez tes concurrents (téléchargées de WinningHunter, par exemple). « Analyser les angles » en tire l'accroche, l'angle, la promesse, les preuves et le script ; Claude s'en sert pour la recherche client et les angles.</p>
      <div className="cat-actions">
        <button type="button" className="cat-btn cat-btn--ghost" disabled={busy === "upload"} onClick={() => fileRef.current?.click()}>
          {busy === "upload" ? "Envoi…" : "+ Depuis le PC"}
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" onClick={openPicker}>
          Choisir dans les vidéos du projet
        </button>
        <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" multiple hidden onChange={(e) => (upload([...e.target.files]), (e.target.value = ""))} />
      </div>
      {picker && (
        <div className="cat-fdv__picker">
          {picker.length ? (
            picker.map((m) => {
              const on = list.some((x) => x.url === m.url);
              return (
                <label key={m.url} className={on ? "is-on" : ""}>
                  <input type="checkbox" checked={on} onChange={() => (on ? onChange(list.filter((x) => x.url !== m.url)) : add([{ url: m.url, nom: nameOf(m.url), source: /\/wh-/.test(m.url) ? "WinningHunter" : "projet" }]))} />
                  <video src={`${m.url}#t=0.5`} preload="metadata" muted playsInline />
                  <span>{nameOf(m.url)}</span>
                </label>
              );
            })
          ) : (
            <p className="cat-muted">Aucune vidéo dans le projet pour l'instant (importe-en avec WinningHunter dans le Canvas, ou envoie-les depuis le PC).</p>
          )}
          <button type="button" className="cat-link" onClick={() => setPicker(null)}>
            Fermer la liste
          </button>
        </div>
      )}
      {list.length > 0 && (
        <div className="cat-fdv__list">
          {list.map((v, i) => (
            <div key={v.url} className="cat-fdv__item">
              <video src={v.url} controls preload="metadata" playsInline />
              <div className="cat-fdv__info">
                <b>{v.nom || nameOf(v.url)}</b>
                <small className="cat-muted">{v.source ?? ""}{v.analyseLe ? ` · analysée le ${new Date(v.analyseLe).toLocaleDateString("fr-CA")}` : ""}</small>
                <div className="cat-actions">
                  <button type="button" className="cat-btn" disabled={busy != null} onClick={() => analyse(i)}>
                    {busy === i ? "Gemini regarde la vidéo…" : v.analyse ? "Refaire l'analyse" : "Analyser les angles"}
                  </button>
                  {v.analyse && onAdopt && (
                    <button type="button" className="cat-btn cat-btn--ghost" onClick={() => setAdopte(adopte === i ? null : i)} title="Une promesse de cette vidéo est aussi vraie pour ton produit : l'ajouter à tes preuves, avec sa source">
                      ＋ Adopter comme preuve
                    </button>
                  )}
                  <button type="button" className="cat-link" onClick={() => onChange(list.filter((_, j) => j !== i))}>
                    Retirer
                  </button>
                </div>
                {adopte === i && (
                  <AdopterPreuve
                    video={v}
                    preuves={preuves}
                    onCancel={() => setAdopte(null)}
                    onAdopt={(k, texte, source) => {
                      const avant = String(preuves[k]?.detail ?? "").trim();
                      const ajout = `${texte} (source : ${source} ; repérée dans la vidéo « ${v.nom || nameOf(v.url)} »)`;
                      onAdopt(k, avant ? `${avant} ; ${ajout}` : ajout);
                      onChange(list.map((x, j) => (j === i ? { ...x, adoptions: [...(x.adoptions ?? []), { texte, type: k, source, le: new Date().toISOString() }] } : x)));
                      setAdopte(null);
                      onMessage?.({ text: `Ajouté à tes preuves (« ${PREUVES.find((p) => p[0] === k)?.[1] ?? k} »). Utilisable dans les pages, les pubs et par les agents.` });
                    }}
                  />
                )}
                {v.adoptions?.length > 0 && (
                  <ul className="cat-fdv__adoptions">
                    {v.adoptions.map((a, j) => (
                      <li key={j}>
                        ✓ Adoptée comme preuve ({PREUVES.find((p) => p[0] === a.type)?.[1] ?? a.type}) : {a.texte} <span className="cat-muted">— source : {a.source}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {v.analyse && (
                  <details className="cat-fdv__analyse" open>
                    <summary>Analyse</summary>
                    <div>{v.analyse}</div>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// « Adopter comme preuve » (2026-11-23) : une promesse vue chez un concurrent
// devient TA preuve seulement si tu dis pourquoi elle est vraie pour ton
// produit (source obligatoire). Le texte sélectionné dans l'analyse est
// proposé d'office.
function AdopterPreuve({ video, preuves, onCancel, onAdopt }) {
  const [texte, setTexte] = useState(() => {
    const sel = String(window.getSelection?.() ?? "").trim();
    return sel && String(video.analyse ?? "").includes(sel.slice(0, 40)) ? sel.slice(0, 400) : "";
  });
  const [type, setType] = useState("etude");
  const [source, setSource] = useState("");
  const ok = texte.trim() && source.trim();
  return (
    <div className="cat-fdv__adopt">
      <p className="cat-muted">
        La promesse d'un concurrent n'est vraie que pour son produit. Ajoute-la à tes preuves seulement si elle l'est aussi pour le tien (même ingrédient et même dosage avec une étude publiée, ton propre sondage, tes avis…). Astuce : sélectionne la phrase dans l'analyse avant de cliquer, elle sera reprise ici.
      </p>
      <label>
        <span>La promesse, telle que tu peux l'affirmer</span>
        <textarea rows={2} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="ex. L'amla est étudié pour soutenir l'énergie (étude 2019)" />
      </label>
      <label>
        <span>Type de preuve</span>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {PREUVES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
              {preuves[k]?.oui ? " (déjà cochée : ajoutée à la suite)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Pourquoi c'est vrai pour ton produit (source)</span>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="ex. Étude Journal of Ethnopharmacology 2019, même extrait d'amla 500 mg" />
      </label>
      <div className="cat-actions">
        <button type="button" className="cat-btn" disabled={!ok} onClick={() => onAdopt(type, texte.trim(), source.trim())}>
          Ajouter à mes preuves
        </button>
        <button type="button" className="cat-link" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}
