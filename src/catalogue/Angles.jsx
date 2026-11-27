import { useState } from "react";
import { PAGE_TYPES, pageTypeById } from "../engine/page-types.js";
import { slug } from "../projects.js";
import { MessageRecap, normalizeMessage } from "./Fondations.jsx";

// Étape ② Angles d'un projet : les pistes d'angles des Fondations deviennent
// des cartes (avatar, douleur, promesse). On y CHOISIT seulement les angles à
// tester (2026-11-08) : ni type de page, ni page mère, ni création de page.
// Tout cela se fait dans l'onglet Pages : on y choisit le type, la page mère
// de chaque type (et son angle), puis les pages des autres angles (copies).
//
// projets/<id>.json : angles: [{ id, titre, lentille, avatar, douleur,
//   promesse, pageType, choisi, mere, page,
//   situation, objection, preuve, statut: "hypothese" | "retenu" }]
//
// Comparaison (2026-11-17, audit « Ensuite ») : chaque angle se décrit avec
// les mêmes critères (public, situation, douleur, promesse, objection
// principale, preuve disponible, page) ; vue Cartes ou Tableau comparatif ;
// statut « Hypothèse à tester » / « Angle retenu ». Le socle (produit, offre,
// mécanisme) est commun à tous les angles et rappelé en haut.

const CRITERES = [
  ["avatar", "Public"],
  ["situation", "Situation"],
  ["douleur", "Douleur"],
  ["promesse", "Promesse"],
  ["objection", "Objection principale"],
  ["preuve", "Preuve disponible"],
];

// « Pas un shake (anti-angle) — avatar : … · douleur : … · promesse : … · page : listicle (déjà là) »
const TYPE_WORDS = [
  [/listicle/i, "listicle"],
  [/advertorial/i, "advertorial"],
  [/landing/i, "landing"],
  [/page produit|produit/i, "produit"],
  [/offre/i, "offre"],
  [/accueil/i, "accueil"],
];
export function parseAngle(text, i) {
  const [head, ...rest] = String(text).split(/\s+[—-]\s+/);
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(head.trim());
  const fields = Object.fromEntries(
    rest
      .join(" — ")
      .split(/\s+·\s+/)
      .map((p) => /^\s*([^:]+?)\s*:\s*(.+)$/.exec(p))
      .filter(Boolean)
      .map((x) => [slug(x[1]), x[2].trim()]),
  );
  const pageText = fields.page ?? "";
  return {
    id: `angle-${i + 1}`,
    titre: (m ? m[1] : head).trim(),
    lentille: m ? m[2] : "",
    avatar: fields.avatar ?? "",
    douleur: fields.douleur ?? "",
    promesse: fields.promesse ?? "",
    pageType: TYPE_WORDS.find(([re]) => re.test(pageText))?.[1] ?? "landing",
    choisi: false,
    mere: false,
    page: null,
  };
}

// Les angles du projet : ceux enregistrés, sinon tirés des Fondations.
export const anglesOf = (project) =>
  project.angles?.length ? project.angles : (project.fondations?.resultats?.angles ?? []).map(parseAngle);

export function anglesProgress(project, pageNames) {
  const chosen = (project.angles ?? []).filter((a) => a.choisi);
  const withPage = chosen.filter((a) => a.page && pageNames.includes(a.page));
  return { chosen: chosen.length, withPage: withPage.length };
}

export function AnglesTab({ project, pages, onSave, onMessage, onGo }) {
  const [angles, setAngles] = useState(() => anglesOf(project));
  const [vue, setVue] = useState("cartes");
  // Choix proposés pour l'objection et la preuve : ceux du message central
  // et les preuves cochées dans les Fondations (saisie libre possible).
  const msg = project.fondations?.message ? normalizeMessage(project.fondations.message) : null;
  const objections = (msg?.objections ?? []).map((o) => o.objection).filter(Boolean);
  const preuvesFd = Object.entries(project.fondations?.reponses?.preuves ?? {})
    .filter(([, p]) => p?.oui && p.detail && !/\[\s*MANQUE/i.test(p.detail))
    .map(([, p]) => p.detail);
  const preuves = [...new Set([...(msg?.preuves ?? []).filter(Boolean), ...preuvesFd])];
  // Sources uniques (2026-11-27) : public et douleur se choisissent dans la recherche client.
  const listOf = (k) => (k === "objection" ? "cat-angles-objections" : k === "preuve" ? "cat-angles-preuves" : k === "avatar" ? "cat-angles-avatars" : k === "douleur" ? "cat-angles-douleurs" : undefined);
  const texteDe = (x) => (typeof x === "string" ? x : x?.nom ?? x?.titre ?? x?.texte ?? "");
  const avatarsRech = [...new Set((project.fondations?.resultats?.avatars ?? []).map(texteDe).map((x) => x.trim()).filter(Boolean))];
  const douleursRech = [...new Set((project.fondations?.resultats?.douleurs ?? []).map(texteDe).map((x) => x.trim()).filter(Boolean))];
  const statutOf = (a) => (a.statut === "retenu" ? "retenu" : "hypothese");
  const pageNames = pages.map((p) => p.info.name);
  const set = (id, patch) => setAngles((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const chosen = angles.filter((a) => a.choisi);
  const isLinked = (a) => a.page && pageNames.includes(a.page);

  async function save(list = angles) {
    await onSave({ angles: list }, true);
    onMessage({ text: `Angles enregistrés : ${list.filter((a) => a.choisi).length} à tester.` });
  }

  function addAngle() {
    const n = angles.length + 1;
    setAngles([...angles, { id: `angle-${Date.now()}`, titre: `Nouvel angle ${n}`, lentille: "", avatar: "", douleur: "", promesse: "", pageType: "landing", choisi: true, mere: false, page: null }]);
  }

  if (!angles.length)
    return (
      <div className="cat-empty">
        Pas encore d'angles : valide d'abord les Fondations (Claude y propose 8 à 10 pistes), ou ajoute un angle à la main.
        <div className="cat-actions">
          <button type="button" className="cat-btn" onClick={addAngle}>
            + Ajouter un angle
          </button>
        </div>
      </div>
    );

  return (
    <div className="cat-angles">
      <p className="cat-muted">
        Ici, on choisit seulement les angles à tester (3 ou 4 suffisent) : coche-les, corrige leurs mots si besoin, puis enregistre. Le type de
        page et la page mère de chaque type se choisissent à l'étape suivante,{" "}
        {onGo ? (
          <button type="button" className="cat-linkbtn" onClick={() => onGo("pages")}>
            Pages
          </button>
        ) : (
          "Pages"
        )}
        .
      </p>
      <MessageRecap project={project} onEdit={onGo ? () => onGo("fondations") : null} open={false} />
      <div className="cat-angles__socle">
        <b>Socle commun à tous les angles</b> : {(typeof project.produit === "string" ? project.produit : project.produit?.nom) || project.nom}
        {project.offreFiche?.packs?.length ? ` · ${project.offreFiche.packs.map((x) => `${x.nom} ${x.prix} $`).join(" · ")}` : project.offre?.prix ? ` · ${String(project.offre.prix).slice(0, 80)}` : ""}
        {msg?.mecanisme ? ` · mécanisme : ${String(msg.mecanisme).slice(0, 120)}${String(msg.mecanisme).length > 120 ? "…" : ""}` : ""}
        <small> Ce qui change d'un angle à l'autre : les critères ci-dessous.</small>
      </div>
      <datalist id="cat-angles-objections">
        {objections.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <datalist id="cat-angles-avatars">
        {avatarsRech.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="cat-angles-douleurs">
        {douleursRech.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="cat-angles-preuves">
        {preuves.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="cat-angles__bar">
        <span>
          <b>{chosen.length}</b> angle(s) choisi(s) · {chosen.filter((a) => statutOf(a) === "retenu").length} retenu(s), {chosen.filter((a) => statutOf(a) === "hypothese").length} hypothèse(s) à tester
        </span>
        <span className="cat-angles__vue" role="radiogroup" aria-label="Affichage">
          {[
            ["cartes", "Cartes"],
            ["tableau", "Tableau comparatif"],
          ].map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={vue === id} className={vue === id ? "is-on" : ""} onClick={() => setVue(id)}>
              {label}
            </button>
          ))}
        </span>
      </div>
      {vue === "tableau" && (
        <div className="cat-angles__tablewrap">
          <table className="cat-angles__table">
            <thead>
              <tr>
                <th>À tester</th>
                <th>Angle</th>
                <th>Statut</th>
                {CRITERES.map(([, l]) => (
                  <th key={l}>{l}</th>
                ))}
                <th>Page</th>
              </tr>
            </thead>
            <tbody>
              {angles.map((a) => (
                <tr key={a.id} className={a.choisi ? "is-on" : ""}>
                  <td>
                    <input type="checkbox" checked={a.choisi} onChange={(e) => set(a.id, { choisi: e.target.checked })} aria-label={`Tester « ${a.titre} »`} />
                  </td>
                  <td>
                    <input value={a.titre} onChange={(e) => set(a.id, { titre: e.target.value })} aria-label="Titre de l'angle" />
                  </td>
                  <td>
                    <select value={statutOf(a)} disabled={!a.choisi} onChange={(e) => set(a.id, { statut: e.target.value })}>
                      <option value="hypothese">Hypothèse à tester</option>
                      <option value="retenu">Angle retenu</option>
                    </select>
                  </td>
                  {CRITERES.map(([k, l]) => (
                    <td key={k}>
                      <textarea rows={2} value={a[k] ?? ""} list={listOf(k)} onChange={(e) => set(a.id, { [k]: e.target.value })} aria-label={l} className={!String(a[k] ?? "").trim() ? "is-empty" : ""} />
                    </td>
                  ))}
                  <td>{isLinked(a) ? <a href={`/?page=${encodeURIComponent(a.page)}`}>Ouvrir</a> : <small className="cat-muted">—</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="cat-angles__grid" hidden={vue !== "cartes"}>
        {angles.map((a) => (
          <article key={a.id} className={`cat-angle${a.choisi ? " is-on" : ""}`}>
            <header>
              <label className="cat-angle__pick">
                <input type="checkbox" checked={a.choisi} onChange={(e) => set(a.id, { choisi: e.target.checked })} />
                À tester
              </label>
              {a.choisi && (
                <select className="cat-angle__statut" value={statutOf(a)} onChange={(e) => set(a.id, { statut: e.target.value })} aria-label="Statut">
                  <option value="hypothese">Hypothèse à tester</option>
                  <option value="retenu">Angle retenu</option>
                </select>
              )}
              {isLinked(a) && <span className="cat-angle__has">a sa page</span>}
            </header>
            <input className="cat-angle__title" value={a.titre} onChange={(e) => set(a.id, { titre: e.target.value })} aria-label="Titre de l'angle" />
            {a.lentille && <small className="cat-muted">{a.lentille}</small>}
            {CRITERES.map(([k, l]) =>
              k === "objection" || k === "preuve" ? (
                <label key={k} className="cat-angle__field">
                  <span>{l}</span>
                  <input value={a[k] ?? ""} list={listOf(k)} onChange={(e) => set(a.id, { [k]: e.target.value })} placeholder={k === "objection" ? "Choisir ou écrire" : "Laquelle, parmi tes preuves"} />
                </label>
              ) : (
                <label key={k} className="cat-angle__field">
                  <span>{l}</span>
                  {listOf(k) ? (
                    <input value={a[k] ?? ""} list={listOf(k)} onChange={(e) => set(a.id, { [k]: e.target.value })} placeholder="Choisir dans ta recherche client, ou écrire" />
                  ) : (
                    <textarea rows={1} value={a[k] ?? ""} onChange={(e) => set(a.id, { [k]: e.target.value })} placeholder={k === "situation" ? "Quand le problème se présente" : ""} />
                  )}
                </label>
              ),
            )}
          </article>
        ))}
      </div>
      <div className="cat-actions">
        <button type="button" className="cat-btn cat-btn--ghost" onClick={addAngle}>
          + Ajouter un angle
        </button>
        <button type="button" className="cat-btn" onClick={() => save()}>
          Enregistrer les angles
        </button>
      </div>
    </div>
  );
}
