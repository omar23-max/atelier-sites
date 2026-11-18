import { useState } from "react";
import { resumeFiche } from "../engine/offre-fiche.js";
import { realText } from "../engine/fondations-etat.js";

// Méthode Jeffrey (audit ChatGPT F08, 2026-11-18) : avant de rédiger, choisir
// un mécanisme parmi au plus 5 pistes (mécanisme du problème / de la
// solution), puis un brief de campagne court. Une piste non étayée reste une
// hypothèse, même si elle est bien formulée.
const nid = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const MAX_PISTES = 5;
const CHAMPS_PISTE = [
  ["ump", "Mécanisme du problème (pourquoi rien n'a marché jusqu'ici)", 2],
  ["ums", "Mécanisme de la solution (pourquoi ce produit marche)", 2],
  ["croyance", "Croyance du client à faire évoluer", 1],
  ["preuvesNecessaires", "Preuves nécessaires pour l'affirmer", 1],
  ["preuvesDispo", "Preuves disponibles (faits validés, preuves cochées)", 1],
  ["limites", "Limites, ce qu'on ne peut pas dire", 1],
  ["interdits", "Formulations interdites", 1],
];

export function Mecanismes({ value = [], choix, onChange, onChoix, onToMessage, onAsk, busy }) {
  const set = (i, patch) => onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const chosen = value.find((m) => m.id === choix?.id);
  return (
    <div className="cat-meca">
      {value.length === 0 && <p className="cat-muted">Aucune piste pour l'instant. Demande-les à Claude (après la recherche clients), ou écris-les toi-même.</p>}
      {value.map((m, i) => (
        <details key={m.id} className={`cat-meca__piste${m.id === choix?.id ? " is-choisie" : ""}`} open={m.id === choix?.id || !realText(m.ums) ? true : undefined}>
          <summary>
            <b>{m.nom || `Piste ${i + 1}`}</b>
            <span className={`cat-badge${m.statut === "etaye" ? " cat-badge--green" : ""}`}>{m.statut === "etaye" ? "étayée" : "hypothèse"}</span>
            {m.origine && <span className="cat-muted">{m.origine}</span>}
            {m.id === choix?.id && <span className="cat-badge cat-badge--blue">choisie</span>}
          </summary>
          <label className="cat-field">
            <span>Nom court</span>
            <input value={m.nom ?? ""} onChange={(e) => set(i, { nom: e.target.value })} placeholder="ex. La batterie des cellules" />
          </label>
          {CHAMPS_PISTE.map(([k, l, rows]) => (
            <label key={k} className="cat-field">
              <span>{l}</span>
              {rows > 1 ? <textarea rows={rows} value={m[k] ?? ""} onChange={(e) => set(i, { [k]: e.target.value })} /> : <input value={m[k] ?? ""} onChange={(e) => set(i, { [k]: e.target.value })} />}
            </label>
          ))}
          <div className="cat-meca__actions">
            <label className="cat-fiche__inline">
              <span>État</span>
              <select value={m.statut ?? "hypothese"} onChange={(e) => set(i, { statut: e.target.value })}>
                <option value="hypothese">Hypothèse (pas encore étayée)</option>
                <option value="etaye">Étayée par des preuves</option>
              </select>
            </label>
            {m.id !== choix?.id && (
              <button type="button" className="cat-btn cat-btn--ghost" onClick={() => onChoix({ id: m.id, raison: "", le: new Date().toISOString() })}>
                Choisir cette piste
              </button>
            )}
            <button type="button" className="cat-link" onClick={() => (onChange(value.filter((_, j) => j !== i)), m.id === choix?.id && onChoix(null))}>
              Supprimer
            </button>
          </div>
        </details>
      ))}
      {chosen && (
        <div className="cat-meca__choix">
          <b>Piste choisie : {chosen.nom || "sans nom"}</b>
          {chosen.statut !== "etaye" && <small className="is-warn">C'est encore une hypothèse : les pages ne doivent pas la présenter comme un fait prouvé.</small>}
          <label className="cat-field">
            <span>Pourquoi ce choix (gardé avec la décision)</span>
            <textarea rows={2} value={choix?.raison ?? ""} onChange={(e) => onChoix({ ...choix, raison: e.target.value })} placeholder="ex. La plus crédible avec nos preuves, la plus nouvelle pour l'avatar" />
          </label>
          <button type="button" className="cat-btn cat-btn--ghost" onClick={() => onToMessage(chosen)}>
            Reprendre dans le message central
          </button>
        </div>
      )}
      <div className="cat-meca__actions">
        {value.length < MAX_PISTES && (
          <button type="button" className="cat-btn cat-btn--ghost" onClick={() => onChange([...value, { id: nid(), nom: "", statut: "hypothese", origine: "toi" }])}>
            + Ajouter une piste
          </button>
        )}
        <button type="button" className="cat-btn" disabled={busy} onClick={onAsk}>
          {busy ? "Envoi…" : `Demander ${value.length ? "d'autres " : ""}pistes à Claude`}
        </button>
      </div>
    </div>
  );
}

export const CONSCIENCE = [
  ["inconscient", "Ne sait pas qu'il a un problème"],
  ["probleme", "Connaît le problème, pas les solutions"],
  ["solution", "Connaît les solutions, pas ce produit"],
  ["produit", "Connaît le produit, hésite"],
  ["pret", "Prêt à acheter (cherche l'offre)"],
];
export const TRAFIC = [
  ["pub-froide", "Pub froide (Meta, TikTok…)"],
  ["recherche", "Recherche Google"],
  ["retargeting", "Reciblage (déjà venu)"],
  ["email", "E-mail / SMS (clients, abonnés)"],
  ["boutique", "Visiteurs de la boutique"],
  ["influence", "Influenceur, affiliation"],
];

// Preuves qu'on peut citer : faits validés, preuves cochées avec un détail réel.
export function preuvesAutorisees(fondations) {
  const out = [];
  for (const f of fondations?.faits ?? []) if (f.etat === "valide" && realText(f.valeur)) out.push({ id: `fait:${f.id}`, texte: `${f.valeur} ${f.unite ?? ""}`.trim() + (f.source ? ` (${f.source})` : "") });
  for (const [k, p] of Object.entries(fondations?.reponses?.preuves ?? {})) if (p?.oui && realText(p.detail)) out.push({ id: `preuve:${k}`, texte: `${k} : ${p.detail}` });
  return out;
}

export function briefMarkdown({ projet, brief = {}, piste, fiche, fondations, labels }) {
  const preuves = preuvesAutorisees(fondations).filter((p) => (brief.preuves ?? []).includes(p.id));
  const objections = (fondations?.message?.objections ?? []).filter((o, i) => (brief.objections ?? []).includes(i) && o?.objection);
  const L = (k, v) => (realText(v) ? `- **${k}** : ${v}\n` : "");
  return (
    `# Brief de campagne — ${projet.nom}\n\nRévision des Fondations : ${fondations?.version ?? 0} · ${new Date().toISOString().slice(0, 10)}\n\n` +
    L("Avatar prioritaire", brief.avatar) +
    L("Situation d'achat", brief.situation) +
    L("Niveau de conscience", labels.conscience) +
    L("Provenance du trafic", labels.trafic) +
    L("Promesse de la pub", brief.promessePub) +
    L("Type de page", labels.typePage) +
    L("Langue", brief.langue) +
    L("Action attendue", brief.action) +
    (piste ? `\n## Mécanisme choisi : ${piste.nom || ""}${piste.statut === "etaye" ? "" : " (hypothèse)"}\n${L("Problème", piste.ump)}${L("Solution", piste.ums)}${L("Croyance à faire évoluer", piste.croyance)}${L("Formulations interdites", piste.interdits)}` : "\n## Mécanisme : aucun choisi\n") +
    (fiche ? `\n## Offre retenue\n${resumeFiche(fiche)}\n` : "") +
    `\n## Preuves autorisées\n${preuves.length ? preuves.map((p) => `- ${p.texte} [${p.id}]`).join("\n") : "- (aucune sélectionnée)"}\n` +
    `\n## Objections prioritaires\n${objections.length ? objections.map((o) => `- ${o.objection}${o.reponse ? ` → ${o.reponse}` : ""}`).join("\n") : "- (aucune sélectionnée)"}\n`
  );
}

// Le pack le plus populaire, sinon le premier.
function offreEnUneLigne(fiche) {
  const l = resumeFiche(fiche).split("\n").filter(Boolean);
  return l.find((x) => x.includes("le plus populaire")) ?? l[0] ?? "fiche incomplète";
}

export function BriefCampagne({ project, value = {}, onChange, fondations, piste, fiche, typesPage, avatars = [] }) {
  const up = (patch) => onChange({ ...value, ...patch });
  const [copie, setCopie] = useState(false);
  const preuves = preuvesAutorisees(fondations);
  const objections = (fondations?.message?.objections ?? []).map((o, i) => [i, o]).filter(([, o]) => o?.objection);
  const toggle = (k, v) => up({ [k]: (value[k] ?? []).includes(v) ? value[k].filter((x) => x !== v) : [...(value[k] ?? []), v] });
  const labels = {
    conscience: CONSCIENCE.find(([v]) => v === value.conscience)?.[1],
    trafic: TRAFIC.find(([v]) => v === value.trafic)?.[1],
    typePage: typesPage.find(([v]) => v === value.typePage)?.[1],
  };
  const md = () => briefMarkdown({ projet: project, brief: value, piste, fiche, fondations, labels });
  async function copy() {
    try {
      await navigator.clipboard.writeText(md());
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {}
  }
  function download() {
    const data = { projet: project.id, revisionFondations: fondations?.version ?? 0, date: new Date().toISOString(), brief: value, mecanisme: piste ?? null, offre: fiche ?? null, preuves: preuves.filter((p) => (value.preuves ?? []).includes(p.id)) };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `brief-${project.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return (
    <div className="cat-brief">
      <div className="cat-fiche__grid">
        <label className="cat-field">
          <span>Avatar prioritaire</span>
          <input list="atl-brief-avatars" value={value.avatar ?? ""} onChange={(e) => up({ avatar: e.target.value })} placeholder="ex. Femme 45-60 ans fatiguée dès le matin" />
          <datalist id="atl-brief-avatars">
            {avatars.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label className="cat-field">
          <span>Situation d'achat</span>
          <input value={value.situation ?? ""} onChange={(e) => up({ situation: e.target.value })} placeholder="ex. Voit la pub le soir, a déjà essayé le café et les vitamines" />
        </label>
        <label className="cat-field">
          <span>Niveau de conscience</span>
          <select value={value.conscience ?? ""} onChange={(e) => up({ conscience: e.target.value })}>
            <option value="">— choisir —</option>
            {CONSCIENCE.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="cat-field">
          <span>Provenance du trafic</span>
          <select value={value.trafic ?? ""} onChange={(e) => up({ trafic: e.target.value })}>
            <option value="">— choisir —</option>
            {TRAFIC.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="cat-field">
          <span>Promesse de la pub (ce que la page doit continuer)</span>
          <input value={value.promessePub ?? ""} onChange={(e) => up({ promessePub: e.target.value })} placeholder="ex. Retrouver de l'énergie le matin sans stimulant" />
        </label>
        <label className="cat-field">
          <span>Type de page</span>
          <select value={value.typePage ?? ""} onChange={(e) => up({ typePage: e.target.value })}>
            <option value="">— choisir —</option>
            {typesPage.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="cat-field">
          <span>Langue</span>
          <select value={value.langue ?? ""} onChange={(e) => up({ langue: e.target.value })}>
            <option value="">— choisir —</option>
            <option value="fr">Français</option>
            <option value="en">Anglais</option>
          </select>
        </label>
        <label className="cat-field">
          <span>Action attendue</span>
          <input value={value.action ?? ""} onChange={(e) => up({ action: e.target.value })} placeholder="ex. Acheter la cure de 90 jours" />
        </label>
      </div>
      <p className="cat-brief__auto">
        <b>Mécanisme :</b> {piste ? `${piste.nom || "piste choisie"}${piste.statut === "etaye" ? "" : " (hypothèse)"}` : "aucune piste choisie (au-dessus)"} · <b>Offre :</b>{" "}
        {fiche ? offreEnUneLigne(fiche) : "pas de fiche d'offre (étape « Preuves et offre »)"}
      </p>
      <span className="cat-fd__label">Preuves autorisées pour cette campagne</span>
      {preuves.length ? (
        <div className="cat-fd__cases">
          {preuves.map((p) => (
            <label key={p.id} className={(value.preuves ?? []).includes(p.id) ? "is-on" : ""}>
              <input type="checkbox" checked={(value.preuves ?? []).includes(p.id)} onChange={() => toggle("preuves", p.id)} /> {p.texte}
            </label>
          ))}
        </div>
      ) : (
        <p className="cat-muted">Aucun fait validé ni preuve documentée : rien ne peut être cité comme preuve.</p>
      )}
      <span className="cat-fd__label">Objections prioritaires (du message central)</span>
      {objections.length ? (
        <div className="cat-fd__cases">
          {objections.map(([i, o]) => (
            <label key={i} className={(value.objections ?? []).includes(i) ? "is-on" : ""}>
              <input type="checkbox" checked={(value.objections ?? []).includes(i)} onChange={() => toggle("objections", i)} /> {o.objection}
            </label>
          ))}
        </div>
      ) : (
        <p className="cat-muted">Pas encore d'objections dans le message central.</p>
      )}
      <div className="cat-meca__actions">
        <button type="button" className="cat-btn cat-btn--ghost" onClick={copy}>
          {copie ? "Copié ✓" : "Copier le brief (Markdown)"}
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" onClick={download}>
          Télécharger (JSON)
        </button>
      </div>
    </div>
  );
}
