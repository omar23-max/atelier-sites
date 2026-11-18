import { cloneElement, useRef, useState } from "react";
import { anglesProgress } from "./Angles.jsx";
import { TYPES_CONTENU, FICHES, blueprintOf, contenuProgress } from "../engine/page-blueprints.js";
import { pageTypeById } from "../engine/page-types.js";
import { figuresIn, unitOf } from "../engine/fidelite.js";
import { empreinte, merge3, realText, statutFondations, withIds } from "../engine/fondations-etat.js";

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
        const { done, total } = contenuProgress(value, type);
        const info = pageTypeById[type];
        return (
          <details key={type} className="cat-fd__type" open={used[type] ? true : undefined}>
            <summary>
              <b>{info?.label ?? type}</b>
              <span className="cat-muted">{fiche.famille}</span>
              {used[type] ? <span className="cat-badge cat-badge--blue">{used[type]} page(s) dans ce projet</span> : null}
              <span className={`cat-fd__count${done === total && total ? " is-done" : ""}`}>
                {done} / {total} remplis
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
                <button type="button" className="cat-link" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Retirer ce fait">
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

export function FoundationsTab({ project, onSave, onMessage, request, offer, pages }) {
  const f = project.fondations ?? {};
  const [rep, setRep] = useState(f.reponses ?? {});
  const [msg, setMsg] = useState(f.message ?? null);
  const [cont, setCont] = useState(f.contenus ?? {});
  const [faits, setFaits] = useState(() => withIds(f.faits));
  // L'offre est gérée ici (audit F04) : une seule sauvegarde pour tout.
  const [offre, setOffre] = useState(project.offre ?? {});
  // Version de référence pour la fusion à trois versions (audit F01) : ce que
  // cet onglet a chargé, puis ce qu'il a enregistré en dernier.
  const baseRef = useRef({ fondations: { ...f, faits: withIds(f.faits) }, offre: project.offre ?? {} });
  const [conflit, setConflit] = useState(null);
  // Types de page à faire remplir par Claude : ceux du projet, sinon tous.
  const typesUsed = [...new Set((pages ?? []).map((p) => p.info?.pageType).filter((t) => TYPES_CONTENU.includes(t)))];
  const [askTypes, setAskTypes] = useState(typesUsed.length ? typesUsed : TYPES_CONTENU);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setRep((r) => ({ ...r, [k]: v }));
  const preuves = rep.preuves ?? {};
  const setPreuve = (k, patch) => set("preuves", { ...preuves, [k]: { ...preuves[k], ...patch } });
  const statut = f.statut ?? "brouillon";
  const res = f.resultats;
  // Sous-étapes avec sommaire (audit « Ensuite », 2026-11-17) : une partie du
  // questionnaire à la fois, les autres restent montées (rien n'est perdu en
  // changeant d'étape), boutons d'action toujours visibles en bas.
  const [step, setStep] = useState(0);
  const countOf = (keys) => [keys.filter((k) => filled(rep[k])).length, keys.length];
  const [p1, p1t] = countOf([...TEXTES.produit, ...TEXTES.clients, ...TEXTES.probleme].map((x) => x[0]).concat(["genre", "ages", "pays", "essaye"]));
  const nbPreuves = Object.values(rep.preuves ?? {}).filter((p) => p?.oui).length;
  const [p3, p3t] = countOf(TEXTES.collecte.map((x) => x[0]));
  const nbTypes = Object.values(cont ?? {}).filter((t) => Object.values(t ?? {}).some((s) => Object.values(s ?? {}).some((v) => String(v ?? "").trim()))).length;
  const STEPS = [
    { label: "Produit et clients", etat: `${p1} / ${p1t} rempli(s)`, ok: foundationsFilled({ fondations: { reponses: rep } }) },
    { label: "Preuves et offre", etat: nbPreuves ? `${nbPreuves} preuve(s) cochée(s)` : "aucune preuve cochée", ok: nbPreuves > 0 },
    { label: "Recherche clients", etat: `${p3} / ${p3t} source(s)${res ? " · résultats de Claude" : ""}`, ok: p3 > 0 || Boolean(res) },
    { label: "Message central", etat: messageFilled({ fondations: { message: msg } }) ? "rempli" : "à faire", ok: messageFilled({ fondations: { message: msg } }) },
    { label: "Contenus des pages", etat: `${nbTypes} type(s) de page`, ok: nbTypes > 0 },
  ];
  const go = (i) => {
    setStep(i);
    document.querySelector(".cat-fd__steps")?.scrollIntoView({ block: "start", behavior: "smooth" });
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
    if (conflicts.length && !force) return { conflicts, server, rev };
    // Ce que les autres ont ajouté apparaît tout de suite ici.
    setRep(reponses);
    if (message) setMsg(message);
    setCont(contenus);
    setFaits(faitsM);
    setOffre(offreM);
    let fd = { ...sf, reponses, ...(message ? { message } : {}), contenus, faits: faitsM, ...extra };
    // Validées autrefois sans empreinte : la version enregistrée sert de référence.
    if (["validée", "modifiée"].includes(sf.statut) && !sf.valideEmpreinte) fd.valideEmpreinte = empreinte({ ...server, fondations: sf });
    const next = { ...server, offre: offreM, fondations: fd };
    if (extra.statut === "validée") fd = { ...fd, valideEmpreinte: empreinte(next) };
    else if (!("statut" in extra)) fd = statutFondations({ ...next, fondations: fd });
    return { patch: { fondations: fd, offre: offreM }, rev, conflicts: [] };
  }

  // Enregistre tout (questionnaire, faits, message, cartes, offre) ; refait
  // la fusion si le projet a bougé entre la lecture et l'écriture (409).
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
        baseRef.current = { fondations: { ...(saved?.fondations ?? out.patch.fondations), faits: withIds((saved?.fondations ?? out.patch.fondations).faits) }, offre: saved?.offre ?? out.patch.offre };
        setConflit(null);
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
    baseRef.current = { fondations: { ...sf, faits: withIds(sf.faits) }, offre: server.offre ?? {} };
    setConflit(null);
    onMessage({ text: "Version enregistrée reprise. Tes changements sur les champs en conflit sont abandonnés." });
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
        ce que tu sais, puis « Compléter avec Claude » : il fera la recherche client et l'offre, et tu valideras.
      </p>
      <div className={`cat-fd__statut is-${statut === "modifiée" ? "modifiee" : statut}`}>
        {statut === "validée"
          ? `Fondations validées le ${new Date(f.valideLe).toLocaleDateString("fr-CA", { dateStyle: "long" })}${f.version ? ` (version ${f.version})` : ""}.`
          : statut === "modifiée"
            ? `Modifiées depuis la validation du ${new Date(f.valideLe).toLocaleDateString("fr-CA", { dateStyle: "long" })} : relis les changements, puis valide à nouveau.`
            : statut === "demandée"
            ? res
              ? "Claude a complété les fondations : relis ses résultats plus bas, corrige si besoin, puis valide."
              : "Demande envoyée à Claude : dis-lui « traite les demandes »."
            : "Brouillon : remplis le questionnaire."}
      </div>

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
      <nav className="cat-fd__steps" aria-label="Étapes des Fondations">
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

      </div>
      <div className="cat-fd__step" hidden={step !== 1}>
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
      <section className="cat-panel cat-fd__mc">
        <h3>8. Message central</h3>
        <p className="cat-muted">
          Le discours unique du projet : toutes les pages (listicle, advertorial, landing, page produit, homepage) le reprennent, avec les
          mots de leur angle autour. Claude le prépare avec « Compléter avec Claude » ; tu le corriges ici. Aucune preuve qui ne soit cochée
          en 4.
        </p>
        <MessageEditor value={msg} onChange={setMsg} />
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
            {busy ? "Envoi…" : `Remplir avec Claude (${askTypes.length})`}
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
        <ContenusEditor value={cont} onChange={setCont} pages={pages} />
      </section>

      </div>

      <div className="cat-actions cat-fd__bar">
        <button type="button" className="cat-btn cat-btn--ghost" disabled={step === 0} onClick={() => go(step - 1)}>
          ← {step > 0 ? STEPS[step - 1].label : "Précédent"}
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" disabled={step === STEPS.length - 1} onClick={() => go(step + 1)}>
          {step < STEPS.length - 1 ? STEPS[step + 1].label : "Suivant"} →
        </button>
        <span className="cat-fd__barsep" />
        <button type="button" className="cat-btn cat-btn--ghost" onClick={() => save()}>
          Enregistrer
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" disabled={busy} onClick={askClaude}>
          {busy ? "Envoi…" : "Compléter avec Claude"}
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
