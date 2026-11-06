import { useState } from "react";
import { PAGE_TYPES, pageTypeById } from "../engine/page-types.js";
import { createPage, pageNameFor, slug, uniquePageName } from "../projects.js";

// Étape ② Angles d'un projet : les pistes d'angles des Fondations deviennent
// des cartes (avatar, douleur, promesse, type de page). L'utilisateur coche
// celles à tester et marque la page mère (★). Chaque angle choisi a sa page :
// une page déjà là (liée), ou une page créée ici — copie de la page mère si
// elle existe (déclinaison), sinon une page vide.
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

export function AnglesTab({ project, pages, allPages, onSave, onChanged, onMessage }) {
  const [angles, setAngles] = useState(() => anglesOf(project));
  const [busy, setBusy] = useState(null);
  const pageNames = pages.map((p) => p.info.name);
  const set = (id, patch) => setAngles((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const setMere = (id) => setAngles((list) => list.map((a) => ({ ...a, mere: a.id === id, choisi: a.id === id ? true : a.choisi })));
  const mere = angles.find((a) => a.mere);
  const chosen = angles.filter((a) => a.choisi);

  async function save(list = angles, text) {
    await onSave({ angles: list }, true);
    onMessage({ text: text ?? `Angles enregistrés : ${list.filter((a) => a.choisi).length} à tester.` });
  }

  function addAngle() {
    const n = angles.length + 1;
    setAngles([...angles, { id: `angle-${Date.now()}`, titre: `Nouvel angle ${n}`, lentille: "", avatar: "", douleur: "", promesse: "", pageType: "landing", choisi: true, mere: false, page: null }]);
  }

  // Page d'un angle : copie de la page mère (déclinaison) si elle a une page,
  // sinon une page vide du type choisi. Le profil de la page = le titre de l'angle.
  async function createFor(a) {
    setBusy(a.id);
    try {
      const source = !a.mere && mere?.page && pageNames.includes(mere.page) ? mere.page : "";
      const name = uniquePageName(pageNameFor(project.id, a.pageType, a.titre), allPages);
      await createPage(
        { name, projet: project.id, produit: project.produit || project.nom, pageType: a.pageType, profil: a.titre, source },
        allPages,
      );
      const list = angles.map((x) => (x.id === a.id ? { ...x, page: name, choisi: true } : x));
      setAngles(list);
      await save(list, source ? `Page « ${name} » créée : copie de la page mère, à adapter à l'angle « ${a.titre} ».` : `Page « ${name} » créée pour l'angle « ${a.titre} ».`);
      onChanged();
    } catch (e) {
      onMessage({ error: true, text: e.message });
    } finally {
      setBusy(null);
    }
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
        Coche les angles à tester (3 ou 4 suffisent), puis marque la <b>page mère</b> ★ : c'est la page qu'on travaille et qu'on audite en
        premier. Les autres pages partent d'une copie de la page mère et ne changent que ce qui dépend de l'angle.
      </p>
      <div className="cat-angles__bar">
        <b>{chosen.length}</b> angle(s) choisi(s) · page mère : <b>{mere ? mere.titre : "à choisir"}</b>
      </div>
      <div className="cat-angles__grid">
        {angles.map((a) => {
          const linked = a.page && pageNames.includes(a.page);
          return (
            <article key={a.id} className={`cat-angle${a.choisi ? " is-on" : ""}${a.mere ? " is-mere" : ""}`}>
              <header>
                <label className="cat-angle__pick">
                  <input type="checkbox" checked={a.choisi} onChange={(e) => set(a.id, { choisi: e.target.checked, mere: e.target.checked ? a.mere : false })} />
                  À tester
                </label>
                <button type="button" className="cat-angle__star" onClick={() => setMere(a.id)} title="Page mère : la première page travaillée et auditée">
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
                  <textarea rows={2} value={a[k]} onChange={(e) => set(a.id, { [k]: e.target.value })} />
                </label>
              ))}
              <label className="cat-angle__field">
                <span>Type de page</span>
                <select value={a.pageType} onChange={(e) => set(a.id, { pageType: e.target.value })}>
                  {PAGE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cat-angle__field">
                <span>Page de l'angle</span>
                <select value={linked ? a.page : ""} onChange={(e) => set(a.id, { page: e.target.value || null, choisi: e.target.value ? true : a.choisi })}>
                  <option value="">— Aucune —</option>
                  {pages.map((p) => (
                    <option key={p.info.name} value={p.info.name}>
                      {p.info.title}
                    </option>
                  ))}
                </select>
              </label>
              <footer>
                {linked ? (
                  <a className="cat-btn cat-btn--ghost" href={`/?page=${a.page}`}>
                    Ouvrir la page
                  </a>
                ) : (
                  <button type="button" className="cat-btn" disabled={busy === a.id || !a.choisi} onClick={() => createFor(a)} title={a.choisi ? "" : "Coche d'abord « À tester »"}>
                    {busy === a.id ? "Création…" : !a.mere && mere?.page && pageNames.includes(mere.page) ? "Créer (copie de la page mère)" : `Créer la page (${pageTypeById[a.pageType]?.label ?? a.pageType})`}
                  </button>
                )}
              </footer>
            </article>
          );
        })}
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
