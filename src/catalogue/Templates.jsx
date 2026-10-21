import { useEffect, useState } from "react";
import { sections } from "../engine/sections.js";
import { PAGE_TYPES, pageTypeById } from "../engine/page-types.js";
import { confirmDelete, createPage, listPages, listProjects, listTemplates, pageNameFor, trashItem } from "../projects.js";
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
        <span className="cat-muted cat-card__meta">
          {template.sectionsSite != null ? `${template.sectionsSite} sections sur le site · ` : "Import par captures · "}
          {extracted} dans le catalogue · {template.photos} photos découpées
        </span>
        <div className="cat-card__badges">
          {type && <span className={`cat-badge ${type.achat ? "cat-badge--green" : "cat-badge--blue"}`}>{type.label}</span>}
          {template.niche && <span className="cat-badge cat-badge--grey">{template.niche}</span>}
          {template.design && <span className="cat-badge cat-badge--grey">{template.design}.md</span>}
        </div>
      </div>
      <div className="cat-card__actions">
        {template.page && (
          <a className="cat-btn cat-btn--ghost" href={`/?page=${template.page}`}>
            Ouvrir le mirror
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

// « Utiliser dans un projet » : nouvelle page du projet, copie de la page mirror.
function UseTemplate({ template, onClose, onMessage }) {
  const [projects, setProjects] = useState([]);
  const [pages, setPages] = useState([]);
  const [projet, setProjet] = useState("");
  const [pageType, setPageType] = useState(template.pageType ?? "produit");
  const [profil, setProfil] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listProjects().then((p) => (setProjects(p), setProjet(p[0]?.id ?? ""))).catch(() => {});
    listPages().then(setPages).catch(() => {});
  }, []);

  async function create() {
    const project = projects.find((p) => p.id === projet);
    setBusy(true);
    try {
      const name = await createPage(
        { name: pageNameFor(projet, pageType, profil), projet, produit: project?.produit || project?.nom || "", pageType, profil, source: template.page },
        pages,
      );
      location.href = `/?page=${name}`;
    } catch (e) {
      onMessage({ error: true, text: e.message });
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
        {projects.length === 0 ? (
          <p>
            Crée d'abord un projet (Catalogue → <b>Projets</b> → « + Nouveau projet »).
          </p>
        ) : (
          <div className="cat-use__form">
            <label className="cat-field">
              <span>Projet</span>
              <select value={projet} onChange={(e) => setProjet(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </label>
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
              La page reprend les sections et le design du template ; les photos et textes d'origine restent des repères à remplacer.
            </p>
            <button type="button" className="cat-btn" disabled={busy} onClick={create}>
              {busy ? "Création…" : "Créer la page et l'ouvrir"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TemplatesView({ onMessage }) {
  const [templates, setTemplates] = useState(null);
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
        <div className="cat-grid">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} onUse={setUsing} onDelete={remove} />
          ))}
        </div>
      )}
      {using && <UseTemplate template={using} onClose={() => setUsing(null)} onMessage={onMessage} />}
    </>
  );
}
