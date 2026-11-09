import { useState } from "react";
import { PAGE_TYPES, pageTypeById } from "../engine/page-types.js";
import { slug } from "../projects.js";
import { MessageRecap } from "./Fondations.jsx";

// Étape ② Angles d'un projet : les pistes d'angles des Fondations deviennent
// des cartes (avatar, douleur, promesse, type de page). On y CHOISIT seulement
// les angles (2026-11-08) : cocher ceux à tester, et une ★ par type de page =
// l'angle de la page mère de ce type. Aucune création de page ici : tout se
// fait dans l'onglet Pages (page mère d'abord, puis copies pour les angles).
//
// projets/<id>.json : angles: [{ id, titre, lentille, avatar, douleur,
//   promesse, pageType, choisi, mere, page }]

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
  return { chosen: chosen.length, mere: chosen.some((a) => a.mere), withPage: withPage.length };
}

export function AnglesTab({ project, pages, onSave, onMessage, onGo }) {
  const [angles, setAngles] = useState(() => anglesOf(project));
  const pageNames = pages.map((p) => p.info.name);
  const set = (id, patch) => setAngles((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  // Une ★ PAR TYPE de page (landing, listicle, page produit…) : marquer un
  // angle retire l'étoile des autres angles du même type seulement ; recliquer
  // sur l'étoile la retire. L'angle ★ d'un type sera celui de sa page mère,
  // créée dans l'onglet Pages (2026-11-08).
  const setMere = (id) =>
    setAngles((list) => {
      const target = list.find((a) => a.id === id);
      return list.map((a) =>
        a.id === id ? { ...a, mere: !a.mere, choisi: true } : a.pageType === target.pageType ? { ...a, mere: false } : a,
      );
    });
  const meres = angles.filter((a) => a.mere);
  const chosen = angles.filter((a) => a.choisi);
  const isLinked = (a) => a.page && pageNames.includes(a.page);
  const titleOf = (name) => pages.find((p) => p.info.name === name)?.info.title ?? name;

  async function save(list = angles) {
    await onSave({ angles: list }, true);
    onMessage({ text: `Angles enregistrés : ${list.filter((a) => a.choisi).length} à tester, ${list.filter((a) => a.mere).length} page(s) mère(s) ★.` });
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
        Ici, on choisit seulement les angles : coche ceux à tester (3 ou 4 suffisent) et marque une <b>★ par type de page</b> (landing,
        listicle, page produit…) : c'est l'angle de la <b>page mère</b> de ce type. Les pages se créent ensuite dans l'onglet{" "}
        {onGo ? (
          <button type="button" className="cat-linkbtn" onClick={() => onGo("pages")}>
            Pages
          </button>
        ) : (
          "Pages"
        )}{" "}
        : d'abord la page mère de chaque type, puis les pages des autres angles, qui en sont des copies.
      </p>
      <MessageRecap project={project} onEdit={onGo ? () => onGo("fondations") : null} />
      <div className="cat-angles__bar">
        <b>{chosen.length}</b> angle(s) choisi(s) · pages mères :{" "}
        {meres.length ? (
          meres.map((m, i) => (
            <span key={m.id}>
              {i ? " · " : ""}
              <b>{pageTypeById[m.pageType]?.label ?? m.pageType}</b> ★ {m.titre}
            </span>
          ))
        ) : (
          <b>à choisir (une ★ par type de page)</b>
        )}
      </div>
      <div className="cat-angles__grid">
        {angles.map((a) => (
          <article key={a.id} className={`cat-angle${a.choisi ? " is-on" : ""}${a.mere ? " is-mere" : ""}`}>
            <header>
              <label className="cat-angle__pick">
                <input type="checkbox" checked={a.choisi} onChange={(e) => set(a.id, { choisi: e.target.checked, mere: e.target.checked ? a.mere : false })} />
                À tester
              </label>
              <button type="button" className="cat-angle__star" onClick={() => setMere(a.id)} title="Angle de la page mère de ce type de page">
                {a.mere ? "★ Page mère" : "☆ Page mère"}
              </button>
            </header>
            <input className="cat-angle__title" value={a.titre} onChange={(e) => set(a.id, { titre: e.target.value })} aria-label="Titre de l'angle" />
            {a.lentille && <small className="cat-muted">{a.lentille}</small>}
            {[
              ["avatar", "Avatar"],
              ["douleur", "Douleur"],
              ["promesse", "Promesse"],
            ].map(([k, l]) => (
              <label key={k} className="cat-angle__field">
                <span>{l}</span>
                <textarea rows={1} value={a[k]} onChange={(e) => set(a.id, { [k]: e.target.value })} />
              </label>
            ))}
            <label className="cat-angle__field">
              <span>Type de page</span>
              <select
                value={a.pageType}
                onChange={(e) => {
                  // changer de type : l'étoile ne suit que s'il n'y a pas déjà une mère de ce type
                  const taken = angles.some((x) => x.id !== a.id && x.mere && x.pageType === e.target.value);
                  set(a.id, { pageType: e.target.value, ...(taken ? { mere: false } : {}) });
                }}
              >
                {PAGE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {isLinked(a) && (
              <footer className="cat-angle__page">
                <span>Page : {titleOf(a.page)}</span>
                <a href={`/?page=${a.page}`}>Ouvrir</a>
              </footer>
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
