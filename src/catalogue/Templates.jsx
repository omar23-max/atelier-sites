import { useEffect, useState } from "react";
import { sections } from "../engine/sections.js";
import { PAGE_TYPES, pageTypeById } from "../engine/page-types.js";
import { NAME, confirmDelete, createPage, listPages, listProjects, listTemplates, pageNameFor, saveProject, slug, trashItem } from "../projects.js";
import { SourceLink, useHoverPreview } from "./hover.jsx";

const sameSource = (a, b) => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname.replace(/^www\./, "") === y.hostname.replace(/^www\./, "") && x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
};

// Sections du catalogue tirées de ce template : listées dans template.json, ou
// de même URL d'origine.
export const sectionsFromTemplate = (t) =>
  sections.filter((s) => (t.sections ?? []).includes?.(s.id) || sameSource(s.meta.source?.url, t.url));

function TemplateCard({ template, onUse, onDelete }) {
  const hover = useHoverPreview("design", { thumbnail: template.vignette });
  const type = pageTypeById[template.pageType];
  const extracted = sectionsFromTemplate(template).length;
  return (
    <article className="cat-card">
      <a className="cat-card__thumb cat-card__thumb--template" href={template.page ? `/?page=${template.page}` : undefined} {...(template.vignette ? hover : {})}>
        {template.vignette ? <img src={template.vignette} alt="" loading="lazy" /> : <span>Pas de vignette</span>}
      </a>
      <div className="cat-card__body">
        <strong>{template.nom}</strong>
        <span className="cat-muted cat-card__meta">
          <SourceLink url={template.url} prefix="Importé de" />
        </span>
        {(template.produit || template.marque) && (
          <span className="cat-card__meta">
            Produit : <b>{template.produit || "?"}</b>
            {template.marque && ` · ${template.marque}`}
          </span>
        )}
        <span className="cat-muted cat-card__meta">
          {template.copieEntiere
            ? `Page copiée en entier · ${template.elements} éléments · `
            : template.sectionsSite != null
              ? `${template.sectionsSite} sections sur le site · ${extracted} dans le catalogue · `
              : `Import par captures · ${extracted} dans le catalogue · `}
          {template.photos} photos découpées
        </span>
        <div className="cat-card__badges">
          {type && <span className={`cat-badge ${type.achat ? "cat-badge--green" : "cat-badge--blue"}`}>{type.label}</span>}
          {template.niche && <span className="cat-badge cat-badge--grey">{template.niche}</span>}
          {template.design && <span className="cat-badge cat-badge--grey">{template.design}.md</span>}
        </div>
      </div>
      <div className="cat-card__actions">
        <a className="cat-btn cat-btn--ghost" href={`/api/original/${template.id}`} target="_blank" rel="noreferrer" title="La page d'origine : textes, design et images">
          Original
        </a>
        {template.page && (
          <a className="cat-btn cat-btn--ghost" href={`/?page=${template.page}`}>
            Version modifiable
          </a>
        )}
        <button type="button" className="cat-btn" disabled={!template.page} onClick={() => onUse(template)}>
          Utiliser dans un projet
        </button>
        <button type="button" className="cat-btn cat-btn--danger" onClick={() => onDelete(template)}>
          Supprimer
        </button>
      </div>
    </article>
  );
}

// « Utiliser dans un projet » : la première question est « dans quel projet ? ».
// Projet existant, ou nouveau projet créé sur place (une page appartient
// toujours à un projet). La page est une copie de la page mirror du template.
const NEW = "__nouveau__";

function UseTemplate({ template, onClose, onMessage }) {
  const [projects, setProjects] = useState(null);
  const [pages, setPages] = useState([]);
  const [projet, setProjet] = useState("");
  const [nom, setNom] = useState("");
  const [produit, setProduit] = useState(template.produit ?? "");
  const [pageType, setPageType] = useState(template.pageType ?? "produit");
  const [profil, setProfil] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listProjects()
      .then((p) => (setProjects(p), setProjet(p.length ? "" : NEW)))
      .catch(() => (setProjects([]), setProjet(NEW)));
    listPages().then(setPages).catch(() => {});
  }, []);
  const isNew = projet === NEW;
  const newId = slug(nom);

  async function create() {
    setError(null);
    if (!projet) return setError("Choisis le projet, ou crée-en un nouveau.");
    let id = projet;
    let project = projects.find((p) => p.id === projet);
    setBusy(true);
    try {
      if (isNew) {
        if (!nom.trim() || !NAME.test(newId)) throw new Error("Donne un nom au nouveau projet.");
        if (projects.some((p) => p.id === newId)) throw new Error(`Le projet « ${nom} » existe déjà : choisis-le dans la liste.`);
        project = { id: newId, nom: nom.trim(), produit: produit.trim(), description: "", creeLe: new Date().toISOString() };
        await saveProject(project);
        id = newId;
      }
      let name = pageNameFor(id, pageType, profil);
      for (let n = 2; pages.some((p) => p.name === name); n++) name = pageNameFor(id, pageType, `${profil} ${n}`);
      await createPage({ name, projet: id, produit: project?.produit || project?.nom || "", pageType, profil, source: template.page }, pages);
      location.href = `/?page=${name}`;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="cat-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cat-modal__panel cat-use">
        <header className="cat-modal__head">
          <h2>Utiliser « {template.nom} »</h2>
          <button type="button" className="cat-close" onClick={onClose} style={{ marginLeft: "auto" }}>
            ×
          </button>
        </header>
        {!projects ? (
          <p className="cat-muted">Chargement des projets…</p>
        ) : (
          <div className="cat-use__form">
            <label className="cat-field">
              <span>Dans quel projet ?</span>
              <select value={projet} onChange={(e) => setProjet(e.target.value)} autoFocus>
                {projects.length > 0 && <option value="">— Choisir le projet —</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                    {p.produit ? ` · ${p.produit}` : ""}
                  </option>
                ))}
                <option value={NEW}>+ Créer un nouveau projet</option>
              </select>
            </label>
            {projects.length === 0 && <p className="cat-muted">Aucun projet pour l'instant : crée le premier ici.</p>}
            {isNew && (
              <>
                <label className="cat-field">
                  <span>Nom du nouveau projet</span>
                  <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Coussin cervical" />
                </label>
                <label className="cat-field">
                  <span>Produit</span>
                  <input value={produit} onChange={(e) => setProduit(e.target.value)} placeholder="Nom du produit vendu" />
                </label>
              </>
            )}
            <label className="cat-field">
              <span>Type de page</span>
              <select value={pageType} onChange={(e) => setPageType(e.target.value)}>
                {PAGE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.achat ? "Achat" : "Pas d'achat"} · {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cat-field">
              <span>Profil client visé (facultatif)</span>
              <input value={profil} onChange={(e) => setProfil(e.target.value)} placeholder="ex. femmes 45+" />
            </label>
            <p className="cat-muted">
              La page reprend la mise en page et le design du template ; les photos et textes d'origine restent des repères à remplacer. La
              version « Original » reste consultable depuis l'atelier.
            </p>
            {error && <p className="cat-error">{error}</p>}
            <button type="button" className="cat-btn" disabled={busy || !projet} onClick={create}>
              {busy ? "Création…" : isNew ? "Créer le projet et la page" : "Créer la page et l'ouvrir"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TemplatesView({ onMessage, initialType = "tous" }) {
  const [templates, setTemplates] = useState(null);
  const [type, setType] = useState(initialType);
  const [using, setUsing] = useState(null);
  const load = () => listTemplates().then(setTemplates).catch(() => setTemplates([]));
  useEffect(() => {
    load();
  }, []);

  // Supprimer un template : son dossier d'import et sa page mirror partent dans
  // la corbeille ; ses sections et son design restent dans le catalogue.
  async function remove(t) {
    const kept = sectionsFromTemplate(t).length;
    const details = [`Template « ${t.nom} »`, "Partent avec lui : sa capture, ses photos d'origine découpées et sa page mirror."];
    details.push(`Restent dans le catalogue : ses ${kept} section(s)${t.design ? ` et ${t.design}.md` : ""}.`);
    details.push("Les pages de projet créées à partir de ce template ne sont pas touchées, mais leurs photos d'origine ne s'afficheront plus.");
    if (!confirmDelete("ce template", details)) return;
    try {
      await trashItem("templates", t.id);
      onMessage({ text: `Template « ${t.nom} » déplacé dans la corbeille.` });
      load();
    } catch (e) {
      onMessage({ error: true, text: e.message });
    }
  }

  return (
    <>
      <h1>Templates</h1>
      <p className="cat-lead">
        Chaque site ou page importé devient un template : la page reconstruite (« mirror »), ses sections ajoutées au catalogue, son
        design.md et ses photos d'origine découpées. Utilise-le comme point de départ d'une page de projet.
      </p>
      {!templates ? (
        <p className="cat-muted">Chargement…</p>
      ) : templates.length === 0 ? (
        <div className="cat-empty">Aucun template. Importe un site depuis « Enrichir le catalogue ».</div>
      ) : (
        <>
          <div className="cat-seg cat-tabs">
            {[{ id: "tous", label: "Tous" }, ...PAGE_TYPES].map((t) => {
              const n = t.id === "tous" ? templates.length : templates.filter((x) => x.pageType === t.id).length;
              if (!n) return null;
              return (
                <button key={t.id} type="button" className={type === t.id ? "is-on" : ""} onClick={() => setType(t.id)}>
                  {t.id === "tous" ? "Tous" : t.label} ({n})
                </button>
              );
            })}
          </div>
        {templates.some((t) => type === "tous" || t.pageType === type) ? (
          <div className="cat-grid">
            {templates.filter((t) => type === "tous" || t.pageType === type).map((t) => (
              <TemplateCard key={t.id} template={t} onUse={setUsing} onDelete={remove} />
            ))}
          </div>
        ) : (
          <div className="cat-empty">
            Aucun template « {pageTypeById[type]?.label ?? type} » pour l'instant. Importe une page de ce type depuis « Enrichir le
            catalogue ».
          </div>
        )}
        </>
      )}
      {using && <UseTemplate template={using} onClose={() => setUsing(null)} onMessage={onMessage} />}
    </>
  );
}
