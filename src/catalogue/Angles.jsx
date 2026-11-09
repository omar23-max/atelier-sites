import { useState } from "react";
import { PAGE_TYPES, pageTypeById } from "../engine/page-types.js";
import { slug } from "../projects.js";
import { MessageRecap } from "./Fondations.jsx";

// Étape ② Angles d'un projet : les pistes d'angles des Fondations deviennent
// des cartes (avatar, douleur, promesse). On y CHOISIT seulement les angles à
// tester (2026-11-08) : ni type de page, ni page mère, ni création de page.
// Tout cela se fait dans l'onglet Pages : on y choisit le type, la page mère
// de chaque type (et son angle), puis les pages des autres angles (copies).
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
  return { chosen: chosen.length, withPage: withPage.length };
}

export function AnglesTab({ project, pages, onSave, onMessage, onGo }) {
  const [angles, setAngles] = useState(() => anglesOf(project));
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
      <MessageRecap project={project} onEdit={onGo ? () => onGo("fondations") : null} />
      <div className="cat-angles__bar">
        <b>{chosen.length}</b> angle(s) choisi(s) à tester
      </div>
      <div className="cat-angles__grid">
        {angles.map((a) => (
          <article key={a.id} className={`cat-angle${a.choisi ? " is-on" : ""}`}>
            <header>
              <label className="cat-angle__pick">
                <input type="checkbox" checked={a.choisi} onChange={(e) => set(a.id, { choisi: e.target.checked })} />
                À tester
              </label>
              {isLinked(a) && <span className="cat-angle__has">a sa page</span>}
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
