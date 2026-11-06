import { useState } from "react";
import { anglesProgress } from "./Angles.jsx";

// Fondations d'un projet (phase 0, une seule fois par produit) : un
// questionnaire de faits que seul l'utilisateur connaît (surtout des cases),
// puis « Compléter avec Claude » crée une demande : Claude fait la recherche
// client, l'offre et les objections avec les skills (docs/TRAITER-DEMANDES.md,
// type « fondations ») et range ses résultats dans fondations.resultats.
// L'utilisateur relit et valide. Les prix, packs, garantie et bonus sont ceux
// de l'onglet Offre (project.offre) : une seule source.
//
// projets/<id>.json :
//   fondations: { reponses: {…}, statut: "brouillon" | "demandée" | "validée",
//                 demandeLe, valideLe, resultats: { avatars, douleurs, mots,
//                 objections, promesse, angles, notes } }

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

const OFFRE = [
  ["prix", "Prix et prix barré", "ex. 39 $ (au lieu de 59 $)"],
  ["packs", "Lots", "ex. 1 pot = 39 $ ; 2 = 69 $ ; 3 = 89 $"],
  ["garantie", "Garantie", "ex. 60 jours satisfaite ou remboursée"],
  ["bonus", "Bonus, livraison", "ex. Livraison gratuite dès 2 pots"],
];

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

// Fondations remplies ? (pour la barre d'avancement et le bouton Claude)
export function foundationsFilled(project) {
  const r = project.fondations?.reponses ?? {};
  return Boolean(r.role && r.douleur && (r.genre?.length || r.qui));
}

export function FoundationsTab({ project, onSave, onMessage, request }) {
  const f = project.fondations ?? {};
  const [rep, setRep] = useState(f.reponses ?? {});
  const [offre, setOffre] = useState(project.offre ?? {});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setRep((r) => ({ ...r, [k]: v }));
  const preuves = rep.preuves ?? {};
  const setPreuve = (k, patch) => set("preuves", { ...preuves, [k]: { ...preuves[k], ...patch } });
  const statut = f.statut ?? "brouillon";
  const res = f.resultats;

  const patch = (extra = {}) => ({ fondations: { ...f, reponses: rep, ...extra }, offre: { ...(project.offre ?? {}), ...offre } });

  async function save(silent) {
    await onSave(patch(), silent);
  }

  async function askClaude() {
    if (!foundationsFilled({ fondations: { reponses: rep } }))
      return onMessage({ error: true, text: "Remplis au moins : ce que fait le produit, le problème principal, et qui achète." });
    setBusy(true);
    try {
      await onSave(patch(), true); // la demande lit le questionnaire enregistré
      const dossier = await request(
        "fondations",
        `Projet « ${project.nom} » : poser les fondations (recherche client, avatars, douleurs et mots des clients, promesse, objections, pistes d'angles) à partir du questionnaire Fondations, puis remplir fondations.resultats et l'onglet Offre.`,
        { projet: project.id },
      );
      await onSave(patch({ statut: "demandée", demandeLe: new Date().toISOString(), demande: dossier }), true);
      onMessage({ text: `Demande enregistrée (${dossier}). Dis à Claude « traite les demandes ».` });
    } catch (e) {
      onMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    await onSave(patch({ statut: "validée", valideLe: new Date().toISOString() }), true);
    onMessage({ text: "Fondations validées. Étape suivante : l'onglet Angles." });
  }

  return (
    <div className="cat-fd">
      <p className="cat-muted">
        Les faits que toi seul connais. Claude n'écrira jamais une preuve, un chiffre ou une garantie qui n'est pas cochée ici. Remplis
        ce que tu sais, puis « Compléter avec Claude » : il fera la recherche client et l'offre, et tu valideras.
      </p>
      <div className={`cat-fd__statut is-${statut}`}>
        {statut === "validée"
          ? `Fondations validées le ${new Date(f.valideLe).toLocaleDateString("fr-CA", { dateStyle: "long" })}.`
          : statut === "demandée"
            ? res
              ? "Claude a complété les fondations : relis ses résultats plus bas, corrige si besoin, puis valide."
              : "Demande envoyée à Claude : dis-lui « traite les demandes »."
            : "Brouillon : remplis le questionnaire."}
      </div>

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
      </section>

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
        <h3>5. L'offre</h3>
        <p className="cat-muted">Repris tel quel dans l'onglet Offre.</p>
        <div className="cat-fd__grid">
          {OFFRE.map(([k, l, p]) => (
            <Champ key={k} label={l} placeholder={p} value={offre[k]} onChange={(v) => setOffre((o) => ({ ...o, [k]: v }))} />
          ))}
        </div>
      </section>

      <section className="cat-panel">
        <h3>6. Concurrents et ton</h3>
        {TEXTES.concurrents.map(([k, l, p, r]) => (
          <Champ key={k} label={l} placeholder={p} rows={r} value={rep[k]} onChange={(v) => set(k, v)} />
        ))}
        <span className="cat-fd__label">Ton de la marque</span>
        <Cases options={CHOIX.ton} value={rep.ton} onChange={(v) => set("ton", v)} />
      </section>

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
          <h3>Résultats de Claude</h3>
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
        </section>
      )}

      <div className="cat-actions">
        <button type="button" className="cat-btn cat-btn--ghost" onClick={() => save()}>
          Enregistrer
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" disabled={busy} onClick={askClaude}>
          {busy ? "Envoi…" : "Compléter avec Claude"}
        </button>
        <button type="button" className="cat-btn" disabled={!res && statut !== "validée"} onClick={validate} title={res ? "" : "Après les résultats de Claude"}>
          Valider les fondations
        </button>
      </div>
    </div>
  );
}

// Barre d'avancement du projet : ① Fondations → ② Angles → ③ Pages → ④ Pubs →
// ⑤ Audit → ⑥ Résultats. Chaque étape dit où elle en est.
export function ProjectProgress({ project, pages, onGo }) {
  const fd = project.fondations?.statut;
  // Angles : faits quand des angles sont choisis ET la page mère désignée ;
  // Pages : quand chaque angle choisi a sa page.
  const ang = anglesProgress(project, pages.map((p) => p.info?.name));
  const creatives = project.creatives ?? [];
  const audites = pages.filter((p) => p.score?.type && p.score.score >= 80).length;
  const steps = [
    ["fondations", "Fondations", fd === "validée" ? "done" : fd === "demandée" ? "doing" : foundationsFilled(project) ? "doing" : "todo", fd === "validée" ? "validées" : fd === "demandée" ? "chez Claude" : "à faire"],
    ["angles", "Angles", ang.chosen && ang.mere ? "done" : ang.chosen ? "doing" : "todo", ang.chosen ? `${ang.chosen} choisi(s)${ang.mere ? "" : ", page mère à choisir"}` : "à choisir"],
    ["angles", "Pages", ang.chosen && ang.withPage === ang.chosen ? "done" : ang.withPage ? "doing" : "todo", ang.chosen ? `${ang.withPage}/${ang.chosen} angle(s) avec sa page` : `${pages.length} page(s)`],
    ["creatives", "Pubs", creatives.length ? "done" : "todo", creatives.length ? `${creatives.length} créative(s)` : "à faire"],
    ["pages", "Audit", pages.length && audites === pages.length ? "done" : audites ? "doing" : "todo", pages.length ? `${audites}/${pages.length} page(s) ≥ 80` : "—"],
    ["resultats", "Résultats", "todo", "après la mise en ligne"],
  ];
  return (
    <ol className="cat-progress">
      {steps.map(([tab, label, state, detail], i) => (
        <li key={label} className={`is-${state}`}>
          <button type="button" onClick={() => onGo(tab)}>
            <i>{state === "done" ? "✓" : i + 1}</i>
            <b>{label}</b>
            <small>{detail}</small>
          </button>
        </li>
      ))}
    </ol>
  );
}
