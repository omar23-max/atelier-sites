import { useEffect, useState } from "react";
import { sections } from "../engine/sections.js";
import { normalizeProps } from "../engine/render.js";
import { PAGE_TYPES, declineParAngle, pageTypeById } from "../engine/page-types.js";
import { scorePage } from "../engine/page-score.js";
import { originalPhotoTargets } from "../engine/photos.js";
import { pageTexts } from "../engine/texts.js";
import { changePageOrigin, confirmDelete, createPage, empreinte, getPage, listMedias, listPages, listProjects, listTemplates, pageNameFor, renameProductInPages, saveProject, trashItem, uniquePageName } from "../projects.js";
import { NewProjectDialog, isUrl, pageMenuGroups, requestImport } from "../pages-ui.jsx";
import { BrandTab, CreativesTab, OfferTab, PublicationTab, projectDesignOf, request } from "./ProjectExtras.jsx";
import { FoundationsTab, ProjectProgress } from "./Fondations.jsx";
import { AnglesTab } from "./Angles.jsx";
import { SourcePicker } from "./SourcePicker.jsx";
import { ResultsTab } from "./ResultsTab.jsx";

const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
// Audit T2 (2026-11-16) : un enregistrement refusé lève une erreur marquée
// « shown » (le message est déjà affiché) ; elle arrête l'appelant (pas de
// « succès », pas de demande lancée après) sans polluer la console.
if (typeof window !== "undefined" && !window.__atlShownErrors) {
  window.__atlShownErrors = true;
  window.addEventListener("unhandledrejection", (e) => e.reason?.shown && e.preventDefault());
}
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
// Menu du projet (2026-11-08) : les étapes ① → ⑥ (ProjectProgress) sont le menu
// principal ; en dessous, une petite ligne de ressources du projet. Plus de
// doublons : l'offre est dans Fondations, la publication est une étape, les
// images et les textes ont chacun un seul onglet (d'origine / modifiés).
const RESSOURCES = [
  { id: "marque", label: "Marque & design" },
  { id: "images", label: "Médias" },
  { id: "textes", label: "Textes" },
];
const OLD_TABS = { offre: "fondations", "images-origine": "images", "images-modifiees": "images", "textes-origine": "textes", "textes-corriges": "textes" };

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
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M11.2 2.6l2.2 2.2-7.6 7.6-2.9.7.7-2.9z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
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
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M11.2 2.6l2.2 2.2-7.6 7.6-2.9.7.7-2.9z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
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
  const [tab, setTab] = useState(null); // ouvert sur Fondations tant qu'elles ne sont pas validées

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
    // Retour sur l'onglet du catalogue (après une modification dans
    // l'atelier) : couverture et pages relues (2026-11-17).
    const onBack = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onBack);
    return () => document.removeEventListener("visibilitychange", onBack);
  }, [id]);

  // Enregistre une partie de la fiche (marque, créatives, offre, publication).
  // Enregistre une partie du projet. En cas d'échec (lecture, refus du
  // serveur, connexion coupée) : message d'erreur, puis l'erreur est relancée
  // pour que l'appelant n'affiche pas de succès ni ne continue (audit T2).
  // Révision (audit ChatGPT F01, 2026-11-17) : l'écriture porte l'empreinte
  // de la version lue (If-Match). Si le projet a changé entre-temps : avec
  // opts.rev (les Fondations, qui fusionnent elles-mêmes), erreur code 409
  // rendue à l'appelant ; sinon (nom, marque…) relecture et nouvel essai.
  async function saveProjectPatch(patch, silent, opts = {}) {
    const fail = (text, code) => {
      if (code !== 409) onMessage({ error: true, text });
      const e = new Error(text);
      e.shown = code !== 409;
      e.code = code;
      throw e;
    };
    try {
      for (let essai = 0; essai < 3; essai++) {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) fail("Non enregistré : le projet n'a pas pu être relu. Réessaie dans un instant.");
        const current = await res.json();
        const rev = opts.rev ?? res.headers.get("ETag");
        const save = await fetch(`/api/projects/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(rev ? { "If-Match": rev } : {}) },
          body: JSON.stringify({ ...current, ...patch }),
        });
        if (save.status === 409) {
          if (opts.rev) fail("Le projet a été modifié ailleurs entre-temps.", 409);
          continue;
        }
        const body = await save.json().catch(() => ({}));
        if (!save.ok) fail(`Non enregistré : ${body.error ?? `refus du serveur (${save.status})`}.`);
        const saved = { ...current, ...patch, ...(body.fondations ? { fondations: body.fondations } : {}) };
        setProject(saved);
        if (!silent) onMessage({ text: "Fiche du projet enregistrée." });
        return saved;
      }
      fail("Non enregistré : le projet change sans arrêt ailleurs (autre onglet ?). Réessaie dans un instant.");
    } catch (e) {
      if (e.shown || e.code === 409) throw e;
      fail("Non enregistré : la connexion avec l'atelier est coupée. Vérifie ta connexion puis réessaie.");
    }
  }

  if (!pages) return <p className="cat-muted">Chargement du projet…</p>;
  if (!project) return <div className="cat-empty">Projet introuvable.</div>;
  // Onglet d'ouverture : l'étape en cours (Fondations, puis Angles, puis Pages).
  const currentTab =
    OLD_TABS[tab] ?? tab ?? (project.fondations?.statut !== "validée" ? "fondations" : (project.angles ?? []).some((a) => a.choisi) ? "pages" : "angles");

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
      <div className="cat-lead cat-project-lead">
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
      </div>
      <ProjectProgress project={project} pages={pages} onGo={setTab} current={currentTab} />
      <nav className="cat-res" aria-label="Ressources du projet">
        <span>Ressources</span>
        {RESSOURCES.map((t) => (
          <button key={t.id} type="button" className={currentTab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {currentTab === "fondations" && (
        <FoundationsTab key={project.id} project={project} pages={pages} onSave={saveProjectPatch} onMessage={onMessage} request={request} offer={<OfferTab key={`o-${project.id}`} project={project} onSave={saveProjectPatch} onMessage={onMessage} />} />
      )}
      {currentTab === "angles" && <AnglesTab key={project.id} project={project} pages={pages} allPages={allPages} templates={templates} onSave={saveProjectPatch} onChanged={load} onMessage={onMessage} onGo={setTab} />}
      {currentTab === "pages" && <PagesTab project={project} pages={pages} allPages={allPages} templates={templates} onChanged={load} onMessage={onMessage} onSave={saveProjectPatch} />}
      {currentTab === "images" && <TwoViews labels={["D'origine", "Modifiées"]} views={[<OriginalImagesTab key="o" pages={pages} />, <EditedImagesTab key="m" pages={pages} project={project} onMessage={onMessage} />]} />}
      {currentTab === "textes" && <TwoViews labels={["D'origine", "Corrigés"]} views={[<OriginalTextsTab key="o" pages={pages} />, <EditedTextsTab key="c" pages={pages} />]} />}
      {currentTab === "marque" && <ProjectSummary project={project} pages={pages} />}
      {currentTab === "marque" && <BrandTab key={project.id} project={project} pages={pages} onSave={saveProjectPatch} onMessage={onMessage} />}
      {currentTab === "creatives" && <CreativesTab key={project.id} project={project} onSave={saveProjectPatch} onMessage={onMessage} />}
            {currentTab === "publication" && <PublicationTab project={project} pages={pages} onSave={saveProjectPatch} />}
      {currentTab === "resultats" && <ResultsTab project={project} pages={pages} onMessage={onMessage} />}
    </>
  );
}

function PagesTab({ project, pages, allPages, templates, onChanged, onMessage, onSave }) {
  // role : "mere:<id angle>" (page mère de ce type, pour cet angle), "mere"
  // (page mère sans angle), id d'un angle choisi dans l'onglet Angles (copie de
  // la mère), ou "" (page simple, profil libre). Le type de page et la page
  // mère de chaque type se choisissent ICI, pas dans l'onglet Angles (2026-11-08).
  // depuis : l'origine de la page (2026-11-08) : "page" (un template ou une de
  // mes pages, via SourcePicker), "lien" (URL à reproduire : demande d'import)
  // ou "vide" (page vide). Une page d'angle part par défaut d'une copie de la
  // page mère de son type. L'origine est enregistrée (root.props.origine) et
  // peut être changée ensuite (bouton « Changer » de la colonne Origine).
  const [form, setForm] = useState({ pageType: "produit", role: "mere", profil: "", source: "", depuis: "page", url: "", vierge: false });
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState([]);
  const [originFor, setOriginFor] = useState(null); // page dont on change l'origine
  useEffect(() => {
    fetch("/api/requests")
      .then((r) => r.json())
      .then(setRequests)
      .catch(() => {});
  }, [pages.length]);
  const buyPages = pages.filter((p) => pageTypeById[p.info.pageType]?.achat);
  const angles = project.angles ?? [];
  const pageNames = pages.map((p) => p.info.name);
  const motherOf = (type) => pageMenuGroups(pages.map((p) => p.info), project).find((g) => g.id === type)?.items.find((i) => i.mere)?.name ?? "";
  // Pas de page d'angle tant que le type n'a pas sa page mère.
  const hasMother = !!motherOf(form.pageType);
  // Angles cochés dans l'onglet Angles et encore sans page.
  const noPage = (a) => !a.page || !pageNames.includes(a.page);
  const freeAngles = angles.map((a, i) => ({ ...a, n: i + 1 })).filter((a) => a.choisi && noPage(a));
  // Origine d'une page : enregistrée à la création (root.props.origine), sinon
  // déduite (demande d'import avec lien, ou template d'import). « edited » :
  // la page a-t-elle été modifiée dans l'éditeur depuis (null = inconnu) ?
  const tplName = (s) => templates.find((t) => t.page === s || t.id === s)?.nom ?? s;
  const titleOfPage = (n) => allPages.find((p) => p.name === n)?.title ?? n;
  const reqOf = (name) => requests.find((r) => r.details?.page === name && r.url);
  function originOf({ info, data, originData }) {
    const o = data?.root?.props?.origine;
    const content = data?.content ?? [];
    if (o?.type) {
      const edited = o.empreinte ? empreinte(content) !== o.empreinte : null;
      const req = reqOf(info.name);
      if (o.type === "lien") return { type: o.type, label: `Lien : ${o.url}`, detail: req?.statut === "traitée" ? "importé" : "import en attente", edited };
      if (o.type === "vide") return { type: o.type, label: "Page vide", edited };
      if (o.type === "page") return { type: o.type, label: `Copie de « ${titleOfPage(o.source)} »`, edited };
      return { type: "template", label: `Template : ${tplName(o.source)}`, edited };
    }
    const req = reqOf(info.name);
    if (req) return { type: "lien", label: `Lien : ${req.url}`, detail: req.statut === "traitée" ? "importé" : "import en attente", edited: null };
    if (info.importSource) {
      const edited = originData?.content ? JSON.stringify(content) !== JSON.stringify(originData.content) : null;
      return { type: "template", label: `Template : ${tplName(info.importSource)}`, edited };
    }
    return content.length ? { type: "?", label: "Inconnue", edited: null } : { type: "vide", label: "Page vide", edited: false };
  }
  const mereRoleOf = (role) => role === "mere" || role.startsWith("mere:");
  const isAngleRole = !mereRoleOf(form.role) && form.role !== "";
  // Choix par défaut, à chaque changement de type : sans page mère, la page
  // mère pour le premier angle coché ; avec, la page de ce premier angle.
  // Type sans pages d'angle (listicle, accueil, produit… : parAngle false) :
  // une seule page, qui sert tous les angles (2026-11-09).
  const parAngle = declineParAngle(form.pageType);
  useEffect(() => {
    const first = freeAngles[0]?.id;
    if (!parAngle) return setForm((f) => ({ ...f, role: "mere" }));
    setForm((f) => ({ ...f, role: hasMother ? (first ?? "") : first ? `mere:${first}` : "mere" }));
  }, [form.pageType, hasMother, freeAngles[0]?.id, parAngle]);

  async function add() {
    const mereRole = mereRoleOf(form.role);
    // page mère : pour l'angle choisi dans la liste (mere:<id>)
    const angle = angles.find((a) => a.id === (mereRole ? form.role.slice(5) : form.role));
    const profil = !parAngle && mereRole ? "Tous les angles" : angle ? angle.titre : mereRole ? "" : form.profil.trim();
    const fromUrl = form.depuis === "lien";
    const blank = form.depuis === "vide";
    if (!parAngle && angle && !mereRole) return onMessage({ error: true, text: "Ce type de page ne se décline pas par angle : une seule page sert tous les angles." });
    if (!hasMother && !mereRole && angle) return onMessage({ error: true, text: "Crée d'abord la page mère de ce type : les angles en sont des copies." });
    if (fromUrl && !isUrl(form.url)) return onMessage({ error: true, text: "Indique le lien de la page à reproduire (https://…)." });
    // un angle part de la page mère de son type (copie), sauf autre choix
    const source = fromUrl || blank ? "" : form.source || (isAngleRole ? motherOf(form.pageType) : "");
    if (form.depuis === "page" && !source) return onMessage({ error: true, text: "Choisis le template ou la page de départ (ou « Page vide », ou « Lien »)." });
    const isTemplate = source && !pageNames.includes(source);
    const origine = fromUrl ? { type: "lien", url: form.url.trim() } : blank ? { type: "vide" } : { type: isTemplate ? "template" : "page", source };
    setBusy(true);
    try {
      const name = uniquePageName(pageNameFor(project.id, form.pageType, profil || (mereRole ? "mere" : "")), allPages);
      await createPage(
        {
          name,
          projet: project.id,
          produit: project.produit || project.nom,
          pageType: form.pageType,
          profil,
          source,
          pageAchat: buyPages[0]?.info.name ?? "",
          origine,
          vierge: form.depuis === "page" && form.vierge,
        },
        allPages,
      );
      // Lien : la page est créée vide et une demande d'import la remplira
      // (imports un par un, par l'atelier).
      if (fromUrl) await requestImport({ url: form.url.trim(), projet: project.id, page: name, pageType: form.pageType });
      const linked = angle ? angles.map((a) => (a.id === angle.id ? { ...a, page: name, choisi: true, pageType: form.pageType } : a)) : null;
      if (mereRole) await onSave({ meresParType: { ...(project.meresParType ?? {}), [form.pageType]: name }, ...(linked ? { angles: linked } : {}) }, true);
      else if (linked) await onSave({ angles: linked }, true);
      setForm({ ...form, profil: "", source: "", url: "" });
      const label = pageTypeById[form.pageType]?.label ?? form.pageType;
      onMessage({ text: fromUrl ? `Page « ${label} » créée ; demande d'import envoyée pour ${form.url.trim()}.` : blank ? `Page vide « ${label} » ajoutée au projet.` : mereRole ? `Page mère « ${label} » ajoutée au projet${angle ? ` (angle « ${angle.titre} »)` : ""}.` : `Page ajoutée au projet${profil ? ` pour l'angle « ${profil} »` : ""}${source && source === motherOf(form.pageType) ? " (copie de la page mère)" : ""}.` });
      onChanged();
    } catch (e) {
      onMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="cat-muted cat-pages__intro">
        Une page peut partir de trois origines : <b>un template</b> (ou une de tes pages, recopiée), <b>un lien</b> (la page d'un site,
        reproduite par Claude) ou <b>une page vide</b>. L'origine de chaque page est indiquée dans la colonne « Origine » ; « Changer » la
        remplace, mais efface alors le contenu de la page (une copie de sécurité est gardée dans son Historique).
      </p>
      {pages.length === 0 ? (
        <div className="cat-empty">Ce projet n'a pas encore de page.</div>
      ) : (
        // Une carte par type de page (même ordre que le menu « Page » de
        // l'éditeur) : fermée, elle montre la page mère ; ouverte, la mère (★)
        // puis les pages des angles, puis les autres pages du type.
        <>
          {/* En-tête des colonnes, une seule fois au-dessus des cartes (2026-11-08) */}
          <div className="cat-typehead" aria-hidden="true">
            <table className="cat-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Angle / profil client</th>
                  <th>Origine</th>
                  <th>Achat</th>
                  <th title="Couverture de la structure conseillée (sections présentes, pas une note de vente)">Couverture</th>
                  <th>Textes</th>
                  <th />
                </tr>
              </thead>
            </table>
          </div>
          {pageMenuGroups(pages.map((p) => p.info), project).map((g) => {
          const mother = g.items.find((i) => i.mere);
          const angles = g.items.filter((i) => i.angle && !i.mere).length;
          const byName = Object.fromEntries(pages.map((p) => [p.info.name, p]));
          return (
            <details key={g.id} className="cat-typecard">
              <summary>
                <span className="cat-typecard__title">{g.label}</span>
                <span className="cat-typecard__count">{g.items.length} page{g.items.length > 1 ? "s" : ""}</span>
                <span className="cat-typecard__mere">{mother ? (declineParAngle(g.id) ? `★ Mère : ${mother.detail}` : `★ Page unique · tous les angles`) : declineParAngle(g.id) ? "Pas de page mère" : "Pas encore de page"}{angles ? ` · ${angles} angle${angles > 1 ? "s" : ""}` : ""}</span>
              </summary>
        <table className="cat-table">
          <tbody>
            {g.items.map((item) => byName[item.name]).filter(Boolean).map((entry) => {
              const { info, data, score } = entry;
              const origin = originOf(entry);
              const type = pageTypeById[info.pageType];
              const texts = pageTexts(data);
              const briefs = texts.filter((t) => isBrief(t.text)).length;
              const item = g.items.find((i) => i.name === info.name);
              return (
                <tr key={info.name} className={item?.mere ? "is-mere" : ""}>
                  <td>
                    <b>{item?.mere ? (declineParAngle(g.id) ? `★ ${g.label} mère` : `★ ${g.label} · tous les angles`) : item?.angle ? `${g.label} angle` : type?.label ?? info.title}</b>
                    <small className="cat-muted">{info.name}</small>
                  </td>
                  <td>{info.profil || <span className="cat-muted">—</span>}</td>
                  <td className="cat-origin">
                    <span className="cat-origin__label" title={origin.label}>
                      {origin.label}
                    </span>
                    {origin.detail && <small className="cat-muted">{origin.detail}</small>}
                    {origin.edited && <small className="cat-origin__edited">modifiée dans l'éditeur</small>}
                    <button type="button" className="cat-linkbtn" onClick={() => setOriginFor({ info, origin })}>
                      Changer
                    </button>
                  </td>
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
            </details>
          );
        })}
        </>
      )}

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>Ajouter une page au projet</strong>
        </div>
        <div className="cat-use__row cat-addpage">
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
            <span>Page mère ou angle</span>
            {!parAngle ? (
              <>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="mere">{hasMother ? "★ Page unique · tous les angles (remplace l'actuelle)" : "★ Page unique · tous les angles"}</option>
                  <option value="">Autre (sans angle)</option>
                </select>
                {form.role === "" && <input value={form.profil} onChange={(e) => setForm({ ...form, profil: e.target.value })} placeholder="Profil client (facultatif)" />}
                <small className="cat-muted">
                  {form.pageType === "listicle"
                    ? "Un listicle ne se décline pas par angle : une seule page, où chaque angle choisi devient une raison."
                    : "Ce type de page ne se décline pas par angle : une seule page, qui sert tous les angles."}
                </small>
              </>
            ) : (
            <>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <optgroup label={hasMother ? "★ Page mère (remplace l'actuelle)" : "★ Page mère de ce type"}>
                {freeAngles.map((a) => (
                  <option key={`m${a.id}`} value={`mere:${a.id}`}>
                    ★ Page mère · Angle {a.n} · {a.titre}
                  </option>
                ))}
                <option value="mere">★ Page mère sans angle</option>
              </optgroup>
              {hasMother && freeAngles.length > 0 && (
                <optgroup label="Page d'angle (copie de la page mère)">
                  {freeAngles.map((a) => (
                    <option key={a.id} value={a.id}>
                      Angle {a.n} · {a.titre}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="">Autre (sans angle)</option>
            </select>
            {form.role === "" && <input value={form.profil} onChange={(e) => setForm({ ...form, profil: e.target.value })} placeholder="Profil client (facultatif)" />}
            {!hasMother && <small className="cat-muted">Pas encore de page mère pour ce type : choisis l'angle de la page mère. Les autres angles de ce type en seront des copies.</small>}
            {!freeAngles.length && <small className="cat-muted">Tous les angles cochés ont leur page : coche-en d'autres dans l'onglet Angles.</small>}
            </>
            )}
          </label>
          <div className="cat-field">
            <span>Partir de</span>
            {form.depuis === "lien" && <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://… page à reproduire" />}
            {form.depuis === "page" && (
              <SourcePicker value={form.source || (isAngleRole ? motherOf(form.pageType) : "")} onChange={(source) => setForm({ ...form, source })} templates={templates} pages={pages} pageType={form.pageType} noBlank />
            )}
            {form.depuis === "vide" && <div className="cat-addpage__vide">Page vide : tu la construis dans l'éditeur.</div>}
            <div className="cat-depuis" role="radiogroup" aria-label="Origine de la page">
              {[
                ["page", "Template ou page"],
                ["lien", "Lien"],
                ["vide", "Page vide"],
              ].map(([v, l]) => (
                <label key={v}>
                  <input type="radio" checked={form.depuis === v} onChange={() => setForm({ ...form, depuis: v })} /> {l}
                </label>
              ))}
            </div>
            {form.depuis === "page" && isAngleRole && !form.source && hasMother && <small className="cat-muted">Par défaut : copie de la page mère de ce type.</small>}
            {form.depuis === "page" && (
              <label className="cat-use__vierge">
                <input type="checkbox" checked={form.vierge} onChange={(e) => setForm({ ...form, vierge: e.target.checked })} />
                <span>
                  <b>Sans les textes ni les images d'origine</b>
                  <small>Consignes « [ Titre H2 — 7 mots ] » à la place des textes, emplacements d'image vides.</small>
                </span>
              </label>
            )}
          </div>
          <button type="button" className="cat-btn" disabled={busy} onClick={add}>
            {busy ? "Création…" : "Ajouter"}
          </button>
        </div>
      </section>
      {originFor && (
        <OriginDialog
          info={originFor.info}
          origin={originFor.origin}
          templates={templates}
          pages={pages}
          onClose={() => setOriginFor(null)}
          onDone={(text) => {
            setOriginFor(null);
            onMessage({ text });
            onChanged();
          }}
          onError={(text) => onMessage({ error: true, text })}
        />
      )}
    </>
  );
}

// « Changer l'origine » d'une page : template / page, lien ou page vide. Le
// contenu actuel est remplacé ; si la page a été modifiée dans l'éditeur, on
// prévient que ces modifications seront perdues (copie dans l'Historique).
function OriginDialog({ info, origin, templates, pages, onClose, onDone, onError }) {
  const [depuis, setDepuis] = useState("page");
  const [source, setSource] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    if (depuis === "page" && !source) return onError("Choisis le template ou la page de départ.");
    if (depuis === "lien" && !isUrl(url)) return onError("Indique le lien de la page à reproduire (https://…).");
    const warn =
      origin.edited === false
        ? ""
        : origin.edited
          ? "\n\nCette page a été modifiée dans l'éditeur : ces modifications seront perdues."
          : "\n\nSi cette page a été modifiée dans l'éditeur, ces modifications seront perdues.";
    if (!confirm(`Remplacer tout le contenu de « ${info.title} » ?${warn}\n\nUne copie de sécurité est gardée dans l'Historique de la page.`)) return;
    setBusy(true);
    try {
      const isPage = pages.some((p) => p.info.name === source);
      const type = depuis === "lien" ? "lien" : depuis === "vide" ? "vide" : isPage ? "page" : "template";
      await changePageOrigin(info.name, { type, source: depuis === "page" ? source : "", url: depuis === "lien" ? url.trim() : "" });
      if (depuis === "lien") await requestImport({ url: url.trim(), projet: info.projet, page: info.name, pageType: info.pageType });
      onDone(
        depuis === "lien"
          ? `« ${info.title} » vidée ; demande d'import envoyée pour ${url.trim()}.`
          : depuis === "vide"
            ? `« ${info.title} » est maintenant une page vide.`
            : `« ${info.title} » reprend maintenant ${isPage ? "la page choisie" : "le template choisi"}.`,
      );
    } catch (e) {
      onError(e.message);
      setBusy(false);
    }
  }
  return (
    <div className="cat-modal" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="cat-modal__panel cat-origin-dlg">
        <header className="cat-modal__head">
          <div>
            <h2>Changer l'origine</h2>
            <p className="cat-muted">{info.title}</p>
          </div>
          <button type="button" className="cat-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <p>
          Origine actuelle : <b>{origin.label}</b>
          {origin.detail ? ` (${origin.detail})` : ""}
        </p>
        {origin.edited !== false && (
          <p className="cat-origin__warn">
            {origin.edited
              ? "⚠ Cette page a été modifiée dans l'éditeur. Changer son origine remplace tout son contenu : ces modifications seront perdues."
              : "⚠ Changer l'origine remplace tout le contenu de la page. Si elle a été modifiée dans l'éditeur, ces modifications seront perdues."}{" "}
            Une copie de sécurité est gardée dans son Historique.
          </p>
        )}
        <div className="cat-depuis" role="radiogroup" aria-label="Nouvelle origine">
          {[
            ["page", "Template ou page"],
            ["lien", "Lien"],
            ["vide", "Page vide"],
          ].map(([v, l]) => (
            <label key={v}>
              <input type="radio" checked={depuis === v} onChange={() => setDepuis(v)} /> {l}
            </label>
          ))}
        </div>
        {depuis === "page" && <SourcePicker value={source} onChange={setSource} templates={templates} pages={pages.filter((p) => p.info.name !== info.name)} pageType={info.pageType} noBlank />}
        {depuis === "lien" && <input className="cat-origin-dlg__url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… page à reproduire" />}
        {depuis === "vide" && <p className="cat-muted">La page sera vidée : tu la reconstruis dans l'éditeur.</p>}
        <div className="cat-actions">
          <button type="button" className="cat-btn cat-btn--ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="cat-btn cat-btn--danger" onClick={run} disabled={busy}>
            {busy ? "Remplacement…" : "Remplacer le contenu"}
          </button>
        </div>
      </div>
    </div>
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

// « Modifiées » : les images et vidéos du projet (Studio, Canvas, ajoutées),
// une seule fois chacune (elles sont communes à toutes les pages du projet).
// Cocher puis « Mettre à la corbeille » : rien n'est effacé
// (corbeille/medias/, « Restaurer » plus bas). Un fichier encore utilisé
// dans une page ou un tableau du Canvas demande une confirmation.
const KIND_TITLE = { ia: "Créées par l'IA (Studio, Canvas)", televersee: "Téléversées", video: "Vidéos" };
function EditedImagesTab({ pages, project, onMessage }) {
  const [list, setList] = useState(null); // [{ url, kind }]
  const [checked, setChecked] = useState(() => new Set());
  const [bin, setBin] = useState([]);
  const [busy, setBusy] = useState(false);
  async function load() {
    const seen = new Map();
    for (const { info } of pages) {
      const l = await fetch(`/api/medias/${info.name}?detail=1`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      for (const m of l) if (!seen.has(m.url)) seen.set(m.url, /\.(mp4|webm|mov)$/i.test(m.url) ? { ...m, kind: "video" } : m);
    }
    setList([...seen.values()].reverse());
    const q = project?.id ? `projet=${encodeURIComponent(project.id)}` : "";
    setBin(await fetch(`/api/medias-corbeille?${q}`).then((r) => (r.ok ? r.json() : [])).catch(() => []));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);
  const toggle = (u) => setChecked((c) => (c.has(u) ? new Set([...c].filter((x) => x !== u)) : new Set([...c, u])));
  async function trash(force = false) {
    const urls = [...checked];
    if (!urls.length) return;
    setBusy(true);
    try {
      const r = await fetch("/api/medias-corbeille", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls, force }) }).then((x) => x.json());
      if (r.utilisees?.length) {
        const lines = r.utilisees.map((u) => `• ${u.url.split("/").pop()} : ${[u.pages.length ? `page(s) ${u.pages.join(", ")}` : "", u.tableaux.length ? `tableau(x) du Canvas ${u.tableaux.join(", ")}` : ""].filter(Boolean).join(" ; ")}`);
        if (confirm(`Ces fichiers sont encore utilisés :\n${lines.join("\n")}\n\nLes mettre quand même à la corbeille ? Leurs emplacements afficheront une image manquante (Restaurer les remet).`)) return trash(true);
        return;
      }
      onMessage({ text: `${r.deplacees} fichier(s) mis à la corbeille des images (récupérables plus bas).` });
      setChecked(new Set());
      load();
    } catch (e) {
      onMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }
  async function restore(entrees) {
    const r = await fetch("/api/medias-corbeille/restaurer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entrees }) }).then((x) => x.json());
    onMessage({ text: `${r.restaurees} fichier(s) remis à leur place.` });
    load();
  }
  if (!list) return <p className="cat-muted">Chargement…</p>;
  const groups = ["ia", "televersee", "video"].map((k) => [k, list.filter((m) => (m.kind === "video" ? "video" : m.kind === "ia" ? "ia" : "televersee") === k)]).filter(([, l]) => l.length);
  return (
    <>
      <p className="cat-muted">
        {list.length} fichier(s) à toi, communs à toutes les pages du projet (medias/projets/&lt;projet&gt;/). Ce sont les mêmes que dans le Studio
        d'images et dans « Tes images » du Canvas. Les images d'origine restent à part, jamais modifiées.
      </p>
      {list.length > 0 && (
        <div className="cat-medias-bar">
          <label>
            <input
              type="checkbox"
              checked={checked.size > 0 && checked.size === list.length}
              ref={(el) => el && (el.indeterminate = checked.size > 0 && checked.size < list.length)}
              onChange={() => setChecked(checked.size === list.length ? new Set() : new Set(list.map((m) => m.url)))}
            />{" "}
            Tout cocher
          </label>
          <button type="button" className="cat-btn cat-btn--danger" disabled={!checked.size || busy} onClick={() => trash()}>
            {busy ? "Déplacement…" : `Mettre à la corbeille${checked.size ? ` (${checked.size})` : ""}`}
          </button>
        </div>
      )}
      {list.length === 0 && <div className="cat-empty">Aucune image ni vidéo à toi pour l'instant.</div>}
      {groups.map(([k, l]) => (
        <section key={k} className="cat-panel">
          <div className="cat-panel__head">
            <strong>
              {KIND_TITLE[k]} · {l.length}
            </strong>
          </div>
          <div className="cat-gallery">
            {l.map((m) => (
              <figure key={m.url} className={`cat-media${checked.has(m.url) ? " is-checked" : ""}`}>
                <label className="cat-media__check" title="Cocher">
                  <input type="checkbox" checked={checked.has(m.url)} onChange={() => toggle(m.url)} />
                </label>
                <a href={m.url} target="_blank" rel="noreferrer">
                  {m.kind === "video" ? <video src={m.url} muted preload="metadata" /> : <img src={m.url} alt="" loading="lazy" />}
                </a>
                <figcaption>{m.url.split("/").pop()}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      {bin.length > 0 && (
        <details className="cat-panel cat-medias-bin">
          <summary>
            Corbeille des images · {bin.length} fichier(s)
            <button type="button" className="cat-btn cat-btn--ghost" onClick={(e) => (e.preventDefault(), restore(bin.map((b) => b.entree)))}>
              Tout restaurer
            </button>
          </summary>
          <div className="cat-gallery">
            {bin.map((b) => (
              <figure key={b.entree} className="cat-media">
                {/\.(mp4|webm|mov)$/i.test(b.url) ? <video src={b.apercu} muted preload="metadata" /> : <img src={b.apercu} alt="" loading="lazy" />}
                <figcaption>
                  {b.url.split("/").pop()}{" "}
                  <button type="button" className="cat-link" onClick={() => restore([b.entree])}>
                    Restaurer
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
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
// Deux vues d'un même onglet (d'origine / modifiées), au choix.
function TwoViews({ labels, views }) {
  const [i, setI] = useState(0);
  return (
    <>
      <div className="cat-seg cat-twoviews">
        {labels.map((l, k) => (
          <button key={l} type="button" className={i === k ? "is-on" : ""} onClick={() => setI(k)}>
            {l}
          </button>
        ))}
      </div>
      {views[i]}
    </>
  );
}

// En-tête de « Marque & design » : design.md des pages et produit Shopify.
function ProjectSummary({ project, pages }) {
  const design = projectDesignOf(pages);
  const products = [...new Set(pages.flatMap((p) => (p.data?.content ?? []).map((c) => c.props?.product).filter(Boolean)))];
  const items = [
    ["Design", design ? `${design.id}.md` : "aucun"],
    ["Produit Shopify", products.length ? products.join(", ") : "aucun"],
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
