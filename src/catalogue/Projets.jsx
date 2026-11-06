import { useEffect, useState } from "react";
import { sections } from "../engine/sections.js";
import { normalizeProps } from "../engine/render.js";
import { PAGE_TYPES, pageTypeById } from "../engine/page-types.js";
import { scorePage } from "../engine/page-score.js";
import { originalPhotoTargets } from "../engine/photos.js";
import { pageTexts } from "../engine/texts.js";
import { confirmDelete, createPage, getPage, listMedias, listPages, listProjects, listTemplates, pageNameFor, renameProductInPages, saveProject, trashItem, uniquePageName } from "../projects.js";
import { NewProjectDialog } from "../pages-ui.jsx";
import { nicheLabel } from "./Templates.jsx";
import { BrandTab, CreativesTab, OfferTab, PublicationTab, projectDesignOf } from "./ProjectExtras.jsx";
import { ResultsTab } from "./ResultsTab.jsx";

const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
const isBrief = (t) => /^\s*\[[^\]]+\]\s*$/.test(t) || /\[[^\]]*\d+[^\]]*mots?[^\]]*\]/i.test(t);

const withDefaults = (page) => ({
  ...page,
  content: (page.content ?? []).map((item) => (byId[item.type] ? { ...item, props: normalizeProps(byId[item.type], item.props) } : item)),
});

// Supprimer un projet : il part dans la corbeille avec toutes ses pages (une
// page n'existe jamais hors projet). Restaurer le projet les ramène.
async function deleteProject(project, pages, onDone, onMessage) {
  const details = [`Projet « ${project.nom} »`];
  if (pages.length) details.push(`Ses ${pages.length} page(s) partent avec lui :`, ...pages.map((p) => `• ${p.title ?? p.name}`));
  details.push("Les templates, sections et designs du catalogue ne sont pas touchés.");
  if (!confirmDelete("ce projet", details)) return;
  try {
    await trashItem("projets", project.id);
    onDone();
  } catch (e) {
    onMessage({ error: true, text: e.message });
  }
}

// ---- Liste des projets ----
export function ProjectsView({ onOpen, onMessage }) {
  const [projects, setProjects] = useState(null);
  const [pages, setPages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [creating, setCreating] = useState(false);

  const load = () => {
    listProjects().then(setProjects).catch(() => setProjects([]));
    listPages().then(setPages).catch(() => {});
    listTemplates().then(setTemplates).catch(() => {});
  };
  useEffect(load, []);

  return (
    <>
      <div className="cat-title-row">
        <h1>Projets</h1>
        <button type="button" className="cat-btn" onClick={() => setCreating(true)}>
          + Nouveau projet
        </button>
      </div>
      <p className="cat-lead">
        Un projet par produit ou gamme lancé : ses pages (accueil, page produit, landings, à propos…), ses images d'origine et modifiées,
        ses textes d'origine et corrigés, sa marque, ses créatives, son offre et l'état de publication.
      </p>
      {!projects ? (
        <p className="cat-muted">Chargement…</p>
      ) : projects.length === 0 ? (
        <div className="cat-empty">Aucun projet pour l'instant. Crée le premier avec « + Nouveau projet ».</div>
      ) : (
        <div className="cat-grid">
          {projects.map((p) => {
            const own = pages.filter((x) => x.projet === p.id);
            return (
              <article key={p.id} className="cat-card cat-project" onClick={() => onOpen(p.id)}>
                <div className="cat-card__body">
                  {/* Le clic sur la carte ouvre le projet ; le stylo et son champ, non. */}
                  <span onClick={(e) => e.stopPropagation()}>
                    <ProjectName
                      name={p.nom}
                      small
                      onRename={async (nom) => {
                        try {
                          await saveProject({ ...p, nom });
                          onMessage({ text: `Projet renommé « ${nom} ».` });
                          load();
                        } catch (e) {
                          onMessage({ error: true, text: e.message });
                        }
                      }}
                    />
                  </span>
                  {p.produit && <span className="cat-muted cat-card__meta">{p.produit}</span>}
                  {p.description && <span className="cat-muted cat-card__meta">{p.description}</span>}
                  <div className="cat-card__badges">
                    <span className="cat-badge cat-badge--blue">{own.length} page(s)</span>
                    {own.map((x) => (
                      <span key={x.name} className="cat-badge cat-badge--grey">
                        {pageTypeById[x.pageType]?.label ?? x.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="cat-card__actions">
                  <button
                    type="button"
                    className="cat-btn cat-btn--danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject(p, own, () => (onMessage({ text: `Projet « ${p.nom} » déplacé dans la corbeille.` }), load()), onMessage);
                    }}
                  >
                    Supprimer
                  </button>
                  <button type="button" className="cat-btn">
                    Ouvrir le projet
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {creating && (
        <NewProjectDialog
          pages={pages}
          projects={projects ?? []}
          templates={templates}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onMessage({ text: "Projet créé." });
            onOpen(id);
          }}
        />
      )}
    </>
  );
}

// ---- Détail d'un projet ----
const TABS = [
  { id: "pages", label: "Pages" },
  { id: "images-origine", label: "Images d'origine" },
  { id: "images-modifiees", label: "Images modifiées" },
  { id: "textes-origine", label: "Textes d'origine" },
  { id: "textes-corriges", label: "Textes corrigés" },
  { id: "marque", label: "Marque" },
  { id: "creatives", label: "Créatives" },
  { id: "offre", label: "Offre" },
  { id: "publication", label: "Publication" },
  { id: "resultats", label: "Résultats" },
];

// Nom du projet avec un stylo ✎ pour le modifier sur place (Entrée = enregistrer,
// Échap = annuler). Seul le nom change : l'identifiant et les pages restent.
function ProjectName({ name, onRename, small }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const start = () => (setValue(name), setEditing(true));
  const save = async () => {
    const nom = value.trim();
    setEditing(false);
    if (nom && nom !== name) await onRename(nom);
  };
  if (!editing)
  {
    const Tag = small ? "strong" : "h1";
    return (
      <Tag className={`cat-project-name${small ? " is-small" : ""}`}>
        {name}
        <button type="button" className={`cat-rename${small ? " is-small" : ""}`} onClick={start} title="Modifier le nom du projet" aria-label="Modifier le nom du projet">
          ✎
        </button>
      </Tag>
    );
  }
  return (
    <form className={`cat-project-name is-editing${small ? " is-small" : ""}`} onSubmit={(e) => (e.preventDefault(), save())}>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} aria-label="Nom du projet" />
      <button type="submit" className="cat-btn">
        Enregistrer
      </button>
      <button type="button" className="cat-btn cat-btn--ghost" onClick={() => setEditing(false)}>
        Annuler
      </button>
    </form>
  );
}

// Produit du projet avec un stylo ✎ (Entrée = enregistrer, Échap = annuler).
// Le changer met aussi à jour le produit et le titre des pages du projet.
function ProjectProduct({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const save = async () => {
    setEditing(false);
    const produit = text.trim();
    if (produit !== value) await onSave(produit);
  };
  if (!editing)
    return (
      <span className="cat-project-product">
        {value || <i className="cat-muted">Produit à définir</i>}
        <button type="button" className="cat-rename is-small" onClick={() => (setText(value), setEditing(true))} title="Modifier le produit du projet" aria-label="Modifier le produit du projet">
          ✎
        </button>
      </span>
    );
  return (
    <form className="cat-project-product is-editing" onSubmit={(e) => (e.preventDefault(), save())}>
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} aria-label="Produit du projet" placeholder="Nom du produit" />
      <button type="submit" className="cat-btn">
        Enregistrer
      </button>
      <button type="button" className="cat-btn cat-btn--ghost" onClick={() => setEditing(false)}>
        Annuler
      </button>
    </form>
  );
}

export function ProjectDetail({ id, onBack, onMessage }) {
  const [project, setProject] = useState(null);
  const [pages, setPages] = useState(null); // [{ info, data, score, medias, origin }]
  const [allPages, setAllPages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [tab, setTab] = useState("pages");

  const load = async () => {
    try {
      const [projects, list, tpl] = await Promise.all([listProjects(), listPages(), listTemplates()]);
      setProject(projects.find((p) => p.id === id) ?? null);
      setAllPages(list);
      setTemplates(tpl);
      const own = list.filter((p) => p.projet === id);
      const full = await Promise.all(
        own.map(async (info) => {
          const data = withDefaults(await getPage(info.name));
          const medias = await listMedias(info.name).catch(() => []);
          // Textes d'origine : ce que la capture du site importé a relevé.
          let origin = null;
          if (info.importSource) {
            // Les copies au design identique n'ont pas de capture.json : le
            // serveur renvoie alors la page HTML de l'atelier, pas du JSON.
            const res = await fetch(`/imports/${info.importSource}/capture.json`);
            if (res.ok && /json/.test(res.headers.get("content-type") ?? "")) origin = (await res.json()).views?.desktop?.sections ?? null;
          }
          // Copies au design identique : les textes d'origine sont ceux de la
          // page du template (pages/<template>.json), jamais modifiée.
          let originData = null;
          if (!origin && info.importSource && info.importSource !== info.name) {
            const tplPage = await getPage(info.importSource).catch(() => null);
            if (tplPage?.content) originData = withDefaults(tplPage);
          }
          return { info, data, score: scorePage(data, byId), medias, origin, originData };
        }),
      );
      setPages(full);
    } catch (e) {
      onMessage({ error: true, text: e.message });
    }
  };
  useEffect(() => {
    load();
  }, [id]);

  // Enregistre une partie de la fiche (marque, créatives, offre, publication).
  async function saveProjectPatch(patch, silent) {
    const res = await fetch(`/api/projects/${id}`);
    const current = await res.json();
    const save = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, ...patch }),
    });
    if (!save.ok) return onMessage({ error: true, text: (await save.json()).error });
    setProject({ ...current, ...patch });
    if (!silent) onMessage({ text: "Fiche du projet enregistrée." });
  }

  if (!pages) return <p className="cat-muted">Chargement du projet…</p>;
  if (!project) return <div className="cat-empty">Projet introuvable.</div>;

  return (
    <>
      <button type="button" className="cat-link" onClick={onBack}>
        ← Tous les projets
      </button>
      <div className="cat-title-row">
        <ProjectName name={project.nom} onRename={(nom) => saveProjectPatch({ nom }, true).then(() => onMessage({ text: `Projet renommé « ${nom} ».` }))} />
        <button
          type="button"
          className="cat-btn cat-btn--danger"
          onClick={() =>
            deleteProject(project, pages.map((p) => p.info), () => (onMessage({ text: `Projet « ${project.nom} » déplacé dans la corbeille.` }), onBack()), onMessage)
          }
        >
          Supprimer le projet
        </button>
      </div>
      <p className="cat-lead cat-project-lead">
        <ProjectProduct
          value={project.produit ?? ""}
          onSave={async (produit) => {
            const old = project.produit ?? "";
            await saveProjectPatch({ produit }, true);
            try {
              // Les pages du projet prennent le nouveau nom (produit et titre).
              const n = await renameProductInPages(pages.map((p) => p.info.name), old, produit || project.nom);
              onMessage({ text: `Produit du projet : « ${produit || project.nom} »${n ? ` — ${n} page(s) mise(s) à jour` : ""}.` });
              load();
            } catch (e) {
              onMessage({ error: true, text: `Produit enregistré, mais pages non mises à jour : ${e.message}` });
            }
          }}
        />
        {project.description ? ` · ${project.description}` : ""} · créé le{" "}
        {new Date(project.creeLe).toLocaleDateString("fr-CA", { dateStyle: "long" })}
      </p>
      <ProjectSummary project={project} pages={pages} />

      <div className="cat-seg cat-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pages" && <PagesTab project={project} pages={pages} allPages={allPages} templates={templates} onChanged={load} onMessage={onMessage} />}
      {tab === "images-origine" && <OriginalImagesTab pages={pages} />}
      {tab === "images-modifiees" && <EditedImagesTab pages={pages} />}
      {tab === "textes-origine" && <OriginalTextsTab pages={pages} />}
      {tab === "textes-corriges" && <EditedTextsTab pages={pages} />}
      {tab === "marque" && <BrandTab key={project.id} project={project} pages={pages} onSave={saveProjectPatch} onMessage={onMessage} />}
      {tab === "creatives" && <CreativesTab key={project.id} project={project} onSave={saveProjectPatch} onMessage={onMessage} />}
      {tab === "offre" && <OfferTab key={project.id} project={project} onSave={saveProjectPatch} onMessage={onMessage} />}
      {tab === "publication" && <PublicationTab project={project} pages={pages} onSave={saveProjectPatch} />}
      {tab === "resultats" && <ResultsTab project={project} pages={pages} onMessage={onMessage} />}
    </>
  );
}

// « Partir de » : un bouton qui ouvre une fenêtre avec les miniatures —
// une page vide, une copie d'une page du projet, ou un template (filtré par le
// type de page choisi, avec recherche).
const thumbOf = (t) => t.vignette?.replace(/vignette\.png$/, "carte.jpg");
function SourcePicker({ value, onChange, templates, pages, pageType }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sameType, setSameType] = useState(true);
  const usable = templates.filter((t) => t.page);
  const chosenTpl = usable.find((t) => t.page === value);
  const chosenPage = pages.find((p) => p.info.name === value);
  const label = chosenTpl ? chosenTpl.nom : chosenPage ? `Copie de « ${chosenPage.info.title} »` : "Une page vide";
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = usable.filter(
    (t) => (!sameType || t.pageType === pageType) && words.every((w) => [t.nom, t.marque, t.niche, t.url].join(" ").toLowerCase().includes(w)),
  );
  const pick = (v) => (onChange(v), setOpen(false));
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <button type="button" className="cat-source-btn" onClick={() => setOpen(true)} title="Choisir le point de départ">
        {chosenTpl?.vignette && <img src={thumbOf(chosenTpl)} alt="" />}
        <span>{label}</span>
        <i>▾</i>
      </button>
      {open && (
        <div className="cat-modal" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="cat-modal__panel cat-modal__panel--wide cat-picker">
            <header className="cat-modal__head">
              <div>
                <h2>Partir de…</h2>
                <p className="cat-muted">Clique sur une miniature pour la choisir.</p>
              </div>
              <button type="button" className="cat-close" onClick={() => setOpen(false)} aria-label="Fermer">
                ×
              </button>
            </header>
            <div className="cat-picker__bar">
              <input className="cat-search" autoFocus placeholder="Rechercher un template : marque, produit, niche, site…" value={q} onChange={(e) => setQ(e.target.value)} />
              <label className="cat-picker__type">
                <input type="checkbox" checked={sameType} onChange={(e) => setSameType(e.target.checked)} />
                Seulement « {pageTypeById[pageType]?.label ?? pageType} »
              </label>
            </div>
            <div className="cat-picker__grid">
              <button type="button" className={`cat-picker__item is-blank${!value ? " is-on" : ""}`} onClick={() => pick("")}>
                <span className="cat-picker__thumb">＋</span>
                <b>Une page vide</b>
              </button>
              {pages.map((p) => (
                <button key={p.info.name} type="button" className={`cat-picker__item${value === p.info.name ? " is-on" : ""}`} onClick={() => pick(p.info.name)}>
                  <span className="cat-picker__thumb">
                    <img src={`/medias/_vignettes/${p.info.name}.png`} alt="" loading="lazy" />
                  </span>
                  <b>Copie de « {p.info.title} »</b>
                  <small>Page du projet</small>
                </button>
              ))}
              {shown.map((t) => (
                <button key={t.id} type="button" className={`cat-picker__item${value === t.page ? " is-on" : ""}`} onClick={() => pick(t.page)} title={t.nom}>
                  <span className="cat-picker__thumb">{t.vignette ? <img src={thumbOf(t)} alt="" loading="lazy" decoding="async" /> : null}</span>
                  <b>{t.nom}</b>
                  <small>
                    {pageTypeById[t.pageType]?.label ?? t.pageType}
                    {t.niche ? ` · ${nicheLabel(t.niche)}` : ""}
                  </small>
                </button>
              ))}
            </div>
            {shown.length === 0 && <p className="cat-empty">Aucun template ne correspond. Décoche « Seulement … » pour voir tous les types.</p>}
          </div>
        </div>
      )}
    </>
  );
}

function PagesTab({ project, pages, allPages, templates, onChanged, onMessage }) {
  const [form, setForm] = useState({ pageType: "produit", profil: "", source: "" });
  const [busy, setBusy] = useState(false);
  const buyPages = pages.filter((p) => pageTypeById[p.info.pageType]?.achat);

  async function add() {
    setBusy(true);
    try {
      await createPage(
        {
          name: uniquePageName(pageNameFor(project.id, form.pageType, form.profil), allPages),
          projet: project.id,
          produit: project.produit || project.nom,
          pageType: form.pageType,
          profil: form.profil,
          source: form.source,
          pageAchat: buyPages[0]?.info.name ?? "",
        },
        allPages,
      );
      setForm({ ...form, profil: "" });
      onMessage({ text: "Page ajoutée au projet." });
      onChanged();
    } catch (e) {
      onMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {pages.length === 0 ? (
        <div className="cat-empty">Ce projet n'a pas encore de page.</div>
      ) : (
        <table className="cat-table">
          <thead>
            <tr>
              <th>Page</th>
              <th>Angle / profil client</th>
              <th>Achat</th>
              <th>Score de vente</th>
              <th>Textes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pages.map(({ info, data, score }) => {
              const type = pageTypeById[info.pageType];
              const texts = pageTexts(data);
              const briefs = texts.filter((t) => isBrief(t.text)).length;
              return (
                <tr key={info.name}>
                  <td>
                    <b>{type?.label ?? info.title}</b>
                    <small className="cat-muted">{info.name}</small>
                  </td>
                  <td>{info.profil || <span className="cat-muted">—</span>}</td>
                  <td>{type ? (type.achat ? "Oui" : `Non → ${info.pageAchat || "à lier"}`) : "?"}</td>
                  <td>{score.type ? `${score.score} / 100` : "—"}</td>
                  <td>{briefs ? `${briefs} consigne(s) à remplir` : "Remplis"}</td>
                  <td className="cat-table__actions">
                    <a className="cat-btn cat-btn--ghost" href={`/?page=${info.name}`}>
                      Ouvrir
                    </a>
                    <button
                      type="button"
                      className="cat-btn cat-btn--danger"
                      onClick={async () => {
                        const linked = pages.filter((p) => p.info.pageAchat === info.name).map((p) => `• ${p.info.title}`);
                        const details = [`« ${info.title} » du projet « ${project.nom} »`];
                        if (linked.length) details.push("Ces pages du projet renvoient vers elle pour l'achat :", ...linked);
                        if (!confirmDelete("cette page", details)) return;
                        try {
                          await trashItem("pages", info.name);
                          onMessage({ text: `Page « ${info.title} » déplacée dans la corbeille.` });
                          onChanged();
                        } catch (e) {
                          onMessage({ error: true, text: e.message });
                        }
                      }}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>Ajouter une page au projet</strong>
        </div>
        <div className="cat-use__row">
          <label className="cat-field">
            <span>Type</span>
            <select value={form.pageType} onChange={(e) => setForm({ ...form, pageType: e.target.value })}>
              {PAGE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.achat ? "Achat" : "Pas d'achat"} · {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cat-field">
            <span>Angle / profil client</span>
            <input value={form.profil} onChange={(e) => setForm({ ...form, profil: e.target.value })} placeholder="ex. anti-rides, prix, cadeau" />
          </label>
          <div className="cat-field">
            <span>Partir de</span>
            <SourcePicker value={form.source} onChange={(source) => setForm({ ...form, source })} templates={templates} pages={pages} pageType={form.pageType} />
          </div>
          <button type="button" className="cat-btn" disabled={busy} onClick={add}>
            {busy ? "Création…" : "Ajouter"}
          </button>
        </div>
      </section>
    </>
  );
}

function OriginalImagesTab({ pages }) {
  const blocks = pages.map(({ info, data }) => ({ info, targets: originalPhotoTargets(data.content) }));
  const total = blocks.reduce((n, b) => n + b.targets.length, 0);
  return (
    <>
      <p className="cat-muted">
        {total} photo(s) d'origine encore affichée(s) dans les pages du projet. Elles servent de repère et ne sont jamais publiées : refais-les
        avec le Studio d'images de l'atelier.
      </p>
      {blocks.map(({ info, targets }) =>
        targets.length ? (
          <section key={info.name} className="cat-panel">
            <div className="cat-panel__head">
              <strong>{info.title}</strong>
              <a className="cat-link" href={`/?page=${info.name}`}>
                Ouvrir la page
              </a>
            </div>
            <div className="cat-gallery">
              {targets.map((t) => (
                <figure key={t.key}>
                  <img src={t.source} alt="" loading="lazy" />
                  <figcaption>
                    {t.sectionLabel} · {t.settingLabel}
                    {t.blockType ? ` ${t.blockIndex + 1}` : ""}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </>
  );
}

function EditedImagesTab({ pages }) {
  const total = pages.reduce((n, p) => n + p.medias.length, 0);
  return (
    <>
      <p className="cat-muted">{total} image(s) à toi (Studio d'images ou ajoutées), rangées dans medias/&lt;page&gt;/.</p>
      {total === 0 && <div className="cat-empty">Aucune image modifiée pour l'instant.</div>}
      {pages.map(({ info, medias }) =>
        medias.length ? (
          <section key={info.name} className="cat-panel">
            <div className="cat-panel__head">
              <strong>{info.title}</strong>
            </div>
            <div className="cat-gallery">
              {medias.map((m) => (
                <figure key={m}>
                  <a href={m} target="_blank" rel="noreferrer">
                    <img src={m} alt="" loading="lazy" />
                  </a>
                  <figcaption>{m.split("/").pop()}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </>
  );
}

// Textes d'une page rangés par section ({ clé: [textes] }).
function textsBySection(data) {
  const bySection = new Map();
  for (const t of pageTexts(data)) {
    const key = t.path.split(".")[0];
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(t);
  }
  return bySection;
}
const sectionName = (key) => {
  const [type] = key.split("#");
  return byId[type]?.meta.label?.split(" — ")[0] ?? type;
};

function OriginalTextsTab({ pages }) {
  const withOrigin = pages.filter((p) => p.origin);
  const withTemplate = pages.filter((p) => !p.origin && p.originData);
  return (
    <>
      <p className="cat-muted">
        Les textes du site d'inspiration, tels qu'ils ont été copiés à l'import, section par section. Référence seulement : à réécrire pour ton
        produit.
      </p>
      {withOrigin.length === 0 && withTemplate.length === 0 && <div className="cat-empty">Aucune page de ce projet ne vient d'un template importé.</div>}
      {withTemplate.map(({ info, originData }) => (
        <section key={info.name} className="cat-panel">
          <div className="cat-panel__head">
            <strong>{info.title}</strong>
            <span className="cat-muted">depuis le template {info.importSource}</span>
          </div>
          {[...textsBySection(originData).entries()].map(([key, texts]) => (
            <details key={key} className="cat-texts">
              <summary>
                {sectionName(key)}
                <span className="cat-muted"> · {texts.length} texte(s)</span>
              </summary>
              <ul>
                {texts.map((t) => (
                  <li key={t.path}>{t.text}</li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      ))}
      {withOrigin.map(({ info, origin }) => (
        <section key={info.name} className="cat-panel">
          <div className="cat-panel__head">
            <strong>{info.title}</strong>
            <span className="cat-muted">depuis imports/{info.importSource}</span>
          </div>
          {origin.map((s) => (
            <details key={s.index} className="cat-texts">
              <summary>
                Section {String(s.index).padStart(2, "0")} — {s.headings?.[0]?.text ?? s.text.slice(0, 60)}
              </summary>
              <ul>
                {(s.headings ?? []).map((h, i) => (
                  <li key={`h${i}`}>
                    <b>{h.text}</b>
                  </li>
                ))}
                {(s.texts ?? []).map((t, i) => (
                  <li key={`t${i}`}>{t.text}</li>
                ))}
                {(s.buttons ?? []).map((b, i) => (
                  <li key={`b${i}`} className="cat-muted">
                    Bouton : {b.text}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      ))}
    </>
  );
}

function EditedTextsTab({ pages }) {
  return (
    <>
      <p className="cat-muted">
        Les textes actuels de tes pages. En gris, ceux qui sont encore ceux du site d'origine ; en orange, les consignes entre crochets pas
        encore remplies. Pour les réécrire : bouton « Réécrire les textes » de l'atelier.
      </p>
      {pages.map(({ info, data, originData }) => {
        const bySection = textsBySection(data);
        // Textes encore identiques à ceux du template d'origine.
        const originSet = new Set(originData ? pageTexts(originData).map((t) => t.text.trim()) : []);
        const isOrigin = (t) => originSet.has(t.text.trim());
        const all = [...bySection.values()].flat();
        const left = all.filter(isOrigin).length;
        return (
          <section key={info.name} className="cat-panel">
            <div className="cat-panel__head">
              <strong>{info.title}</strong>
              <a className="cat-link" href={`/?page=${info.name}`}>
                Ouvrir la page
              </a>
            </div>
            {originData && (
              <p className={left ? "cat-texts__note is-todo" : "cat-texts__note is-done"}>
                {left === all.length
                  ? "Pas encore réécrite : tous les textes sont encore ceux du site d'origine."
                  : left
                    ? `${all.length - left} texte(s) réécrit(s), ${left} encore d'origine.`
                    : "Tous les textes ont été réécrits."}
              </p>
            )}
            {[...bySection.entries()].map(([key, texts]) => {
              const briefs = texts.filter((t) => isBrief(t.text)).length;
              const origin = texts.filter(isOrigin).length;
              return (
                <details key={key} className="cat-texts">
                  <summary>
                    {sectionName(key)}
                    <span className="cat-muted">
                      {" "}
                      · {briefs ? `${briefs} consigne(s) / ${texts.length}` : `${texts.length} texte(s)`}
                      {origin ? ` · ${origin} encore d'origine` : ""}
                    </span>
                  </summary>
                  <ul>
                    {texts.map((t) => (
                      <li key={t.path} className={isBrief(t.text) ? "is-brief" : isOrigin(t) ? "is-origin" : ""}>
                        {t.text}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

// Résumé en tête de fiche : design, produits Shopify, marque, créatives, offre, publication.
function ProjectSummary({ project, pages }) {
  const design = projectDesignOf(pages);
  const products = [...new Set(pages.flatMap((p) => (p.data?.content ?? []).map((c) => c.props?.product).filter(Boolean)))];
  const pub = Object.values(project.publication ?? {});
  const creatives = project.creatives ?? [];
  const offre = project.offre ?? {};
  const items = [
    ["Design", design ? `${design.id}.md` : "aucun"],
    ["Produit Shopify", products.length ? products.join(", ") : "aucun"],
    ["Marque", project.marque?.logos?.length ? `${project.marque.logos.length} logo(s), ${project.marque.palette?.length ?? 0} couleur(s)` : "à faire"],
    ["Créatives", creatives.length ? `${creatives.length} (${creatives.filter((c) => c.statut === "en ligne").length} en ligne)` : "aucune"],
    ["Offre", offre.promesse ? "rédigée" : "à faire"],
    ["Publication", `${pub.filter((p) => p.html).length} / ${pages.length} page(s) exportée(s)`],
  ];
  return (
    <div className="cat-summary">
      {items.map(([k, v]) => (
        <span key={k}>
          <small>{k}</small>
          <b>{v}</b>
        </span>
      ))}
    </div>
  );
}
