import { useState } from "react";
import { PAGE_TYPES, pageTypeById } from "../engine/page-types.js";
import { createPage, pageNameFor, setPageProfile, slug, uniquePageName } from "../projects.js";
import { SourcePicker } from "./SourcePicker.jsx";
import { MessageRecap } from "./Fondations.jsx";

// Étape ② Angles d'un projet : les pistes d'angles des Fondations deviennent
// des cartes (avatar, douleur, promesse, type de page). L'utilisateur coche
// celles à tester et marque la page mère (★). Chaque angle choisi a sa page :
// une page déjà là (liée), ou une page créée ici. Les pages vont par famille de
// type : la première page d'un type (la page mère si elle est de ce type) sert
// de base, et les autres angles du même type en sont des copies (déclinaisons).
// Sans base pour ce type, on choisit un template par miniature.
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

export function AnglesTab({ project, pages, allPages, templates = [], onSave, onChanged, onMessage, onGo }) {
  const [angles, setAngles] = useState(() => anglesOf(project));
  const [busy, setBusy] = useState(null);
  const [sources, setSources] = useState({});
  const pageNames = pages.map((p) => p.info.name);
  const set = (id, patch) => setAngles((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const setMere = (id) => setAngles((list) => list.map((a) => ({ ...a, mere: a.id === id, choisi: a.id === id ? true : a.choisi })));
  const mere = angles.find((a) => a.mere);
  const chosen = angles.filter((a) => a.choisi);
  const isLinked = (a) => a.page && pageNames.includes(a.page);
  const titleOf = (name) => pages.find((p) => p.info.name === name)?.info.title ?? name;
  const buyPage = pages.find((p) => pageTypeById[p.info.pageType]?.achat)?.info.name ?? "";
  // Base de chaque type : la page mère si elle est de ce type, sinon le premier
  // angle choisi de ce type qui a sa page.
  const baseOfType = {};
  // (le type compté est celui de la page reliée, pas celui écrit sur l'angle).
  const typeOfPage = (name) => pages.find((p) => p.info.name === name)?.info.pageType;
  for (const a of [mere, ...chosen].filter(Boolean)) {
    const t = isLinked(a) && typeOfPage(a.page);
    if (t && !baseOfType[t]) baseOfType[t] = a;
  }
  const baseFor = (a) => {
    const b = baseOfType[a.pageType];
    return b && b.id !== a.id ? b.page : "";
  };
  const sourceFor = (a) => sources[a.id] ?? baseFor(a);

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
      const source = sourceFor(a);
      const copy = pageNames.includes(source);
      const name = uniquePageName(pageNameFor(project.id, a.pageType, a.titre), allPages);
      await createPage(
        { name, projet: project.id, produit: project.produit || project.nom, pageType: a.pageType, profil: a.titre, source, pageAchat: buyPage },
        allPages,
      );
      const list = angles.map((x) => (x.id === a.id ? { ...x, page: name, choisi: true } : x));
      setAngles(list);
      await save(
        list,
        copy
          ? `Page « ${name} » créée : copie de « ${titleOf(source)} », à adapter à l'angle « ${a.titre} ».`
          : source
            ? `Page « ${name} » créée depuis le template, pour l'angle « ${a.titre} ».`
            : `Page vide « ${name} » créée pour l'angle « ${a.titre} ».`,
      );
      onChanged();
    } catch (e) {
      onMessage({ error: true, text: e.message });
    } finally {
      setBusy(null);
    }
  }

  // Relier une page existante : enregistré tout de suite, et la page prend le
  // nom de l'angle comme profil.
  async function link(a, name) {
    const list = angles.map((x) => (x.id === a.id ? { ...x, page: name || null, choisi: name ? true : x.choisi } : x));
    setAngles(list);
    try {
      const renamed = name ? await setPageProfile(name, a.titre) : false;
      await save(list, name ? `« ${titleOf(name)} » est la page de l'angle « ${a.titre} »${renamed ? " (profil de la page mis à jour)" : ""}.` : `Angle « ${a.titre} » sans page.`);
      onChanged();
    } catch (e) {
      onMessage({ error: true, text: e.message });
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
        premier. Les pages vont par type : la première page d'un type sert de <b>base</b>, et les autres angles du même type en sont des
        copies qui ne changent que ce qui dépend de l'angle. Pour un type sans base, choisis un template.
      </p>
      <MessageRecap project={project} onEdit={onGo ? () => onGo("fondations") : null} />
      <div className="cat-angles__bar">
        <b>{chosen.length}</b> angle(s) choisi(s) · page mère : <b>{mere ? mere.titre : "à choisir"}</b>
      </div>
      <div className="cat-angles__grid">
        {angles.map((a) => {
          const linked = isLinked(a);
          const src = sourceFor(a);
          const baseType = Object.keys(baseOfType).find((t) => baseOfType[t].id === a.id);
          const typeLabel = pageTypeById[a.pageType]?.label ?? a.pageType;
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
              {baseType && <span className="cat-angle__base">Base des pages « {pageTypeById[baseType]?.label ?? baseType} »</span>}
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
                <select value={linked ? a.page : ""} onChange={(e) => link(a, e.target.value)}>
                  <option value="">— Aucune —</option>
                  {pages.map((p) => (
                    <option key={p.info.name} value={p.info.name}>
                      {p.info.title}
                    </option>
                  ))}
                </select>
              </label>
              {!linked && a.choisi && (
                <div className="cat-angle__field">
                  <span>Partir de</span>
                  <SourcePicker value={src} onChange={(v) => setSources((m) => ({ ...m, [a.id]: v }))} templates={templates} pages={pages} pageType={a.pageType} />
                  {src && src === baseFor(a) && <small className="cat-muted">Copie de la base des pages « {typeLabel} ».</small>}
                </div>
              )}
              <footer>
                {linked ? (
                  <a className="cat-btn cat-btn--ghost" href={`/?page=${a.page}`}>
                    Ouvrir la page
                  </a>
                ) : (
                  <button type="button" className="cat-btn" disabled={busy === a.id || !a.choisi} onClick={() => createFor(a)} title={a.choisi ? "" : "Coche d'abord « À tester »"}>
                    {busy === a.id ? "Création…" : pageNames.includes(src) ? "Créer (copie de la base)" : src ? `Créer depuis le template` : `Créer une page vide (${typeLabel})`}
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
