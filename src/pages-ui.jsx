import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PAGE_TYPES, pageTypeById } from "./engine/page-types.js";
import { confirmDelete, createPage, listProjects, listTemplates, pageNameFor, saveProject, slug, trashItem, NAME } from "./projects.js";
import { designById } from "./engine/designs.js";
import { applyDesignToPage } from "./catalogue/Designs.jsx";

const currentName = () => new URLSearchParams(location.search).get("page");

// Projets et templates, chargés une fois pour les fenêtres de l'en-tête.
export function useProjectsAndTemplates() {
  const [projects, setProjects] = useState([]);
  const [templates, setTemplates] = useState([]);
  useEffect(() => {
    listProjects().then(setProjects).catch(() => {});
    listTemplates().then(setTemplates).catch(() => {});
  }, []);
  return { projects, templates };
}

// Pages mirror des templates : plusieurs pages du même type, on ajoute le produit.
const pageLabel = (p) => {
  const type = pageTypeById[p.pageType];
  if (!type) return p.title;
  const detail = !p.projet && p.importSource ? p.produit || p.importSource : p.profil;
  return `${type.label}${detail ? ` · ${detail}` : ""}`;
};

// Groupe d'une page : son projet, ou « Templates » pour les pages mirror des
// imports, ou « Sans projet ».
const TEMPLATES = "__templates";
const NO_PROJECT = "__sans-projet";
const OTHER = "__autre";
const groupOf = (p) => p?.projet || (p?.importSource ? TEMPLATES : NO_PROJECT);

// « Projet ▾ » : choisir un projet ouvre sa première page.
export function ProjectSelect({ current, pages, projects }) {
  const currentGroup = groupOf(pages.find((p) => p.name === current));
  const inProject = projects.some((p) => p.id === currentGroup);
  // Les 5 derniers projets ouverts (le projet en cours en tête) ; les autres
  // sont dans le catalogue (« Autre projet… »).
  const recent = [...projects].sort((a, b) => String(b.ouvertLe ?? b.creeLe).localeCompare(String(a.ouvertLe ?? a.creeLe)));
  const shown = recent.slice(0, 5);
  const open_ = recent.find((p) => p.id === currentGroup);
  if (open_ && !shown.includes(open_)) shown.unshift(open_);
  const groups = shown.map((p) => ({ id: p.id, label: p.nom }));

  // Le projet de la page ouverte devient le plus récemment ouvert.
  useEffect(() => {
    if (inProject) fetch(`/api/projects/${currentGroup}/opened`, { method: "POST" }).catch(() => {});
  }, [currentGroup, inProject]);

  function open(id) {
    if (id === OTHER) return (location.href = "/catalogue.html#projets");
    const first = pages.find((p) => groupOf(p) === id);
    if (first) location.search = `?page=${first.name}`;
    else location.href = `/catalogue.html#projet-${id}`; // projet encore sans page
  }

  return (
    <label className="atl-topbar__field">
      <span>Projet</span>
      <select value={inProject ? currentGroup : ""} onChange={(e) => open(e.target.value)} className="atl-topbar__pages" title="Les 5 derniers projets ouverts">
        {!inProject && (
          <option value="" disabled>
            — Choisir un projet —
          </option>
        )}
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
          </option>
        ))}
        <option value={OTHER}>Autre projet…</option>
      </select>
    </label>
  );
}

// « Page ▾ » : les pages du projet en cours.
export function PageSelect({ current, pages }) {
  const currentInfo = pages.find((p) => p.name === current);
  const list = useMemo(() => {
    const own = pages.filter((p) => groupOf(p) === groupOf(currentInfo));
    return currentInfo ? own : [{ name: current, title: current }, ...own];
  }, [pages, current, currentInfo]);

  return (
    <label className="atl-topbar__field">
      <span>Page</span>
      <select value={current} onChange={(e) => (location.search = `?page=${e.target.value}`)} className="atl-topbar__pages" title="Pages du projet">
        {list.map((p) => (
          <option key={p.name} value={p.name}>
            {pageLabel(p)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Modal({ title, onClose, children, footer }) {
  return createPortal(
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="atl-modal__panel atl-newpage">
        <header className="atl-modal__head">
          <h2>{title}</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="atl-newpage__body">{children}</div>
        <footer className="atl-newpage__foot">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}

// Point de départ d'une page : vide, une page existante, ou un template.
const NEW_PROJECT = "__nouveau-projet";
const FROM_URL = "__url";
const FROM_SHOTS = "__captures";

function SourceSelect({ value, onChange, pages, templates }) {
  const own = pages.filter((p) => !p.importSource || p.projet);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Une page vide</option>
      <optgroup label="Reproduire une page existante">
        <option value={FROM_URL}>Depuis l'URL d'une page…</option>
        <option value={FROM_SHOTS}>Depuis des captures d'écran…</option>
      </optgroup>
      {templates.length > 0 && (
        <optgroup label="Templates (sites importés)">
          {templates.filter((t) => t.page).map((t) => (
            <option key={t.id} value={t.page}>
              {t.nom}
            </option>
          ))}
        </optgroup>
      )}
      {own.length > 0 && (
        <optgroup label="Copie d'une de mes pages">
          {own.map((p) => (
            <option key={p.name} value={p.name}>
              {p.title}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// ---- Nouvelle page ----
export function NewPageButton({ pages, projects, templates }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Nouvelle page dans ce projet" className="atl-plus" aria-label="Nouvelle page">
        +
      </button>
      {open && <NewPageDialog pages={pages} projects={projects} templates={templates} onClose={() => setOpen(false)} />}
    </>
  );
}

// « ✕ » : fermer la page sans la supprimer (elle reste dans son projet).
// Enregistre d'abord, oublie la « dernière page ouverte », puis retour au
// catalogue sur la fiche du projet.
export function ClosePageButton({ current, pages, onSave }) {
  async function close() {
    const info = pages.find((p) => p.name === current);
    try {
      await onSave?.();
    } catch {}
    try {
      if (localStorage.getItem("atl-last-page") === current) localStorage.removeItem("atl-last-page");
    } catch {}
    location.href = info?.projet ? `/catalogue.html#projet-${info.projet}` : "/catalogue.html#projets";
  }
  return (
    <button type="button" onClick={close} title="Fermer cette page (elle reste dans le projet)" className="atl-plus atl-close-page" aria-label="Fermer cette page">
      ✕
    </button>
  );
}

// « 🗑 » : la page ouverte part dans la corbeille (restaurable), puis retour au
// catalogue (la fiche de son projet), sans ouvrir une autre page.
export function DeletePageButton({ current, pages }) {
  async function remove() {
    const info = pages.find((p) => p.name === current);
    const title = info?.title ?? current;
    const linked = pages.filter((p) => p.pageAchat === current).map((p) => `• ${p.title}`);
    const details = [`« ${title} » (${current})`];
    if (info?.importSource && !info.projet) details.push("C'est la page d'un template : le template ne pourra plus servir de point de départ.");
    if (linked.length) details.push("Ces pages renvoient vers elle pour l'achat :", ...linked);
    if (!confirmDelete("cette page", details)) return;
    window.__atlPageDeleted = true; // l'enregistrement automatique ne la recrée pas
    try {
      await trashItem("pages", current);
      try {
        if (localStorage.getItem("atl-last-page") === current) localStorage.removeItem("atl-last-page");
      } catch {}
      location.replace(info?.projet ? `/catalogue.html#projet-${info.projet}` : "/catalogue.html#pages");
    } catch (e) {
      window.__atlPageDeleted = false;
      alert(`Suppression impossible : ${e.message}`);
    }
  }
  return (
    <button type="button" onClick={remove} title="Supprimer cette page (corbeille du catalogue, restaurable)" className="atl-plus atl-trash" aria-label="Supprimer cette page">
      🗑
    </button>
  );
}

function NewPageDialog({ pages, projects, templates, onClose }) {
  const currentInfo = pages.find((p) => p.name === currentName());
  const [achat, setAchat] = useState(null);
  const [type, setType] = useState("");
  // Une page appartient toujours à un projet : celui de la page ouverte par
  // défaut, sinon à choisir ou à créer ici.
  const [projet, setProjet] = useState(currentInfo?.projet || (projects.length ? "" : NEW_PROJECT));
  const [newProject, setNewProject] = useState("");
  const project = projects.find((p) => p.id === projet);
  const [produit, setProduit] = useState(currentInfo?.projet ? (currentInfo?.produit ?? "") : "");
  const [profil, setProfil] = useState("");
  const [pageAchat, setPageAchat] = useState("");
  const [source, setSource] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [shots, setShots] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const types = PAGE_TYPES.filter((t) => achat === null || t.achat === achat);
  const pagesAchat = pages.filter((p) => pageTypeById[p.pageType]?.achat && (!projet || p.projet === projet));
  const projectId = projet === NEW_PROJECT ? slug(newProject) : projet;
  const finalName = name || pageNameFor(projectId, type, profil);

  async function create() {
    setError(null);
    if (!projet) return setError("Choisis le projet de la page, ou crée-le.");
    if (projet === NEW_PROJECT) {
      if (!newProject.trim() || !NAME.test(projectId)) return setError("Donne un nom au nouveau projet.");
      if (projects.some((p) => p.id === projectId)) return setError(`Le projet « ${newProject} » existe déjà : choisis-le dans la liste.`);
    }
    const fromImport = source === FROM_URL || source === FROM_SHOTS;
    if (source === FROM_URL && !isUrl(importUrl)) return setError("Indique l'URL de la page à reproduire (https://…).");
    if (source === FROM_SHOTS && !shots.length) return setError("Ajoute les captures d'écran de la page.");
    setBusy(true);
    try {
      if (projet === NEW_PROJECT) {
        await saveProject({ id: projectId, nom: newProject.trim(), produit: produit.trim(), description: "", creeLe: new Date().toISOString() });
      }
      const created = await createPage(
        {
          name: finalName,
          projet: projectId,
          produit: project?.produit || produit.trim() || newProject.trim(),
          pageType: type,
          profil,
          pageAchat,
          source: fromImport ? "" : source,
        },
        pages,
      );
      // URL ou captures : la page est créée (vide) et une demande d'import la remplira.
      if (fromImport) {
        await requestImport({
          url: source === FROM_URL ? importUrl.trim() : undefined,
          images: source === FROM_SHOTS ? shots : undefined,
          projet: projectId,
          page: created,
          pageType: type,
        });
      }
      location.search = `?page=${created}`;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Nouvelle page"
      onClose={onClose}
      footer={
        <>
          {error && <span className="atl-topbar__error">{error}</span>}
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="atl-newpage__create" disabled={busy || !type} onClick={create}>
            {busy ? "Création…" : `Créer « ${finalName || "…"} »`}
          </button>
        </>
      }
    >
      <fieldset>
        <legend>1. Les gens achètent-ils sur cette page ?</legend>
        <div className="atl-newpage__choice">
          {[
            [true, "Oui, on achète ici", "Page produit, landing de vente"],
            [false, "Non, on achète ailleurs", "Accueil, advertorial, listicle, à propos"],
          ].map(([value, label, hint]) => (
            <button
              type="button"
              key={label}
              className={achat === value ? "is-on" : ""}
              onClick={() => {
                setAchat(value);
                if (type && pageTypeById[type].achat !== value) setType("");
              }}
            >
              <b>{label}</b>
              <small>{hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>2. Type de page</legend>
        <div className="atl-newpage__types">
          {types.map((t) => (
            <button type="button" key={t.id} className={type === t.id ? "is-on" : ""} onClick={() => (setType(t.id), setAchat(t.achat))}>
              <b>{t.label}</b>
              <small>{t.hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="atl-newpage__grid">
        <legend>3. Projet et client</legend>
        <label>
          <span>Projet (obligatoire)</span>
          <select value={projet} onChange={(e) => setProjet(e.target.value)} className={!projet ? "is-missing" : ""}>
            <option value="">— Choisir le projet —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
            <option value={NEW_PROJECT}>+ Créer un nouveau projet…</option>
          </select>
        </label>
        {projet === NEW_PROJECT && (
          <>
            <label>
              <span>Nom du nouveau projet</span>
              <input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="ex. Clearflow" autoFocus />
            </label>
            <label>
              <span>Produit ou gamme</span>
              <input value={produit} onChange={(e) => setProduit(e.target.value)} placeholder="ex. Clearflow Cayenne Complex" />
            </label>
          </>
        )}
        {!projet && projects.length === 0 && (
          <p className="atl-newpage__hint" style={{ gridColumn: "1 / -1", margin: 0 }}>
            Une page appartient toujours à un projet. Tu n'as pas encore de projet : choisis « + Créer un nouveau projet… ».
          </p>
        )}
        <label>
          <span>Profil client visé</span>
          <input value={profil} onChange={(e) => setProfil(e.target.value)} placeholder="ex. femmes 45+, cholestérol élevé" />
        </label>
        {achat === false && (
          <label>
            <span>Page d'achat vers laquelle elle renvoie</span>
            <select value={pageAchat} onChange={(e) => setPageAchat(e.target.value)}>
              <option value="">— À choisir plus tard —</option>
              {pagesAchat.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset className="atl-newpage__grid">
        <legend>4. Point de départ</legend>
        <label>
          <span>Partir de</span>
          <SourceSelect value={source} onChange={setSource} pages={pages} templates={templates} />
        </label>
        {source === FROM_URL && (
          <label style={{ gridColumn: "1 / -1" }}>
            <span>URL de la page à reproduire</span>
            <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://exemple.com/page" />
          </label>
        )}
        {source === FROM_SHOTS && (
          <div style={{ gridColumn: "1 / -1" }}>
            <ScreenshotDrop images={shots} onChange={setShots} />
          </div>
        )}
        <label>
          <span>Nom du fichier</span>
          <input value={name} onChange={(e) => setName(slug(e.target.value))} placeholder={finalName || "nom-de-la-page"} />
        </label>
        <p className="atl-newpage__hint">
          Un template garde les sections et le design du site importé. Depuis une URL ou des captures, la page est créée tout de suite
          et une demande d'import la remplira (dis ensuite à Claude « traite les demandes ») ; l'import ira aussi au catalogue.
        </p>
      </fieldset>
    </Modal>
  );
}

// ---- Nouveau projet : un produit ou une gamme qu'on lance ----
// Tout le site (depuis l'URL d'un site ou un template), puis les pages en plus
// (landing, advertorial, listicle…), chacune depuis une page vide, un template
// ou une URL. Toutes les pages créées appartiennent au projet.
const EXTRA_PAGES = ["accueil", "produit", "landing", "advertorial", "listicle", "autre"];
const SITE_PAGES = ["accueil", "produit"]; // couvertes par « tout le site »
const isUrl = (s) => /^https?:\/\/\S+\.\S+/.test(String(s ?? "").trim());

// Demande d'import pour un projet : depuis une URL (type « site ») ou depuis
// des captures d'écran (type « capture », images jointes).
async function requestImport({ url, images, projet, page, pageType, siteComplet }) {
  const fromShots = Array.isArray(images) && images.length > 0;
  const what = fromShots ? "ces captures d'écran" : siteComplet ? "tout le site" : "cette page";
  const res = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: fromShots ? "capture" : "site",
      url: fromShots ? undefined : url,
      images: fromShots ? images : undefined,
      page: page || undefined,
      notes: siteComplet
        ? `Projet « ${projet} » : reproduire ${what} (accueil, page produit et les autres pages utiles), une page du projet par page du site.`
        : `${projet ? `Projet « ${projet} » : ` : ""}reproduire ${what} dans la page « ${page} ».`,
      details: { projet, page: page || null, pageType: pageType || null, siteComplet: !!siteComplet },
    }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
}

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

// Captures d'écran : glisser, coller ou choisir (10 au plus).
export function ScreenshotDrop({ images = [], onChange, hint = "captures de la page, de haut en bas" }) {
  async function add(files) {
    const list = [...files].filter((f) => f && f.type.startsWith("image/")).slice(0, 10 - images.length);
    const urls = await Promise.all(list.map(readAsDataUrl));
    onChange([...images, ...urls].slice(0, 10));
  }
  return (
    <div
      className="atl-shots"
      tabIndex={0}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(e.dataTransfer.files);
      }}
      onPaste={(e) => add([...e.clipboardData.items].map((i) => i.getAsFile()))}
    >
      {images.map((src, i) => (
        <figure key={i}>
          <img src={src} alt="" />
          <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} aria-label="Retirer">
            ×
          </button>
        </figure>
      ))}
      {images.length < 10 && (
        <label className="atl-shots__add">
          <input type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
          <b>+ Captures</b>
          <small>{images.length ? `${images.length} / 10` : `Glisse, colle ou choisis — ${hint}`}</small>
        </label>
      )}
    </div>
  );
}

// Source d'une page : page vide, template, URL ou captures d'écran.
function PageSourceFields({ value, onChange, templates, allowEmpty = true }) {
  return (
    <span className="atl-source atl-source--wrap">
      <select value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value })}>
        {allowEmpty && <option value="vide">Page vide</option>}
        <option value="template">Template</option>
        <option value="url">URL d'une page</option>
        <option value="captures">Captures d'écran</option>
      </select>
      {value.mode === "captures" && <ScreenshotDrop images={value.images} onChange={(images) => onChange({ ...value, images })} />}
      {value.mode === "template" && (
        <select value={value.template} onChange={(e) => onChange({ ...value, template: e.target.value })}>
          <option value="">— Choisir un template —</option>
          {templates.filter((t) => t.page).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom}
            </option>
          ))}
        </select>
      )}
      {value.mode === "url" && (
        <input value={value.url} onChange={(e) => onChange({ ...value, url: e.target.value })} placeholder="https://exemple.com/page" />
      )}
    </span>
  );
}

export function NewProjectButton({ pages, projects, templates }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Nouveau projet (un produit ou une gamme)" className="atl-plus" aria-label="Nouveau projet">
        +
      </button>
      {open && <NewProjectDialog pages={pages} projects={projects} templates={templates} onClose={() => setOpen(false)} />}
    </>
  );
}

export function NewProjectDialog({ pages, projects, templates, onClose, onCreated }) {
  const [nom, setNom] = useState("");
  const [produit, setProduit] = useState("");
  const [description, setDescription] = useState("");
  const [site, setSite] = useState({ on: true, mode: "url", url: "", template: "", images: [] });
  const [extras, setExtras] = useState(EXTRA_PAGES.map((pageType) => ({ pageType, checked: false, mode: "vide", template: "", url: "", images: [] })));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const id = slug(nom);

  const setExtra = (i, patch) => setExtras(extras.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const tplById = Object.fromEntries(templates.map((t) => [t.id, t]));
  const chosen = extras.filter((x) => x.checked && !(site.on && SITE_PAGES.includes(x.pageType)));
  const siteTemplate = site.on && site.mode === "template" ? tplById[site.template] : null;
  const count = chosen.length + (siteTemplate ? (siteTemplate.pages ?? [siteTemplate.page]).length : 0);

  async function create() {
    setError(null);
    if (!nom.trim() || !NAME.test(id)) return setError("Donne un nom au projet.");
    if (projects.some((p) => p.id === id)) return setError(`Le projet « ${nom} » existe déjà.`);
    if (site.on && site.mode === "url" && !isUrl(site.url)) return setError("Indique l'URL du site à reproduire (https://…).");
    if (site.on && site.mode === "captures" && !site.images.length) return setError("Ajoute les captures d'écran du site.");
    if (site.on && site.mode === "template" && !siteTemplate) return setError("Choisis le template du site.");
    for (const x of chosen) {
      if (x.mode === "url" && !isUrl(x.url)) return setError(`Indique l'URL de la page « ${pageTypeById[x.pageType].label} ».`);
      if (x.mode === "captures" && !x.images.length) return setError(`Ajoute les captures de la page « ${pageTypeById[x.pageType].label} ».`);
      if (x.mode === "template" && !tplById[x.template]) return setError(`Choisis le template de la page « ${pageTypeById[x.pageType].label} ».`);
    }
    setBusy(true);
    try {
      const produitNom = produit.trim() || nom.trim();
      await saveProject({ id, nom: nom.trim(), produit: produit.trim(), description: description.trim(), creeLe: new Date().toISOString() });
      const known = [...pages];
      const created = [];
      let imports = 0;
      const add = async (pageType, source, suffix = "") => {
        let name = pageNameFor(id, pageType, suffix);
        for (let n = 2; known.some((p) => p.name === name); n++) name = pageNameFor(id, pageType, `${suffix} ${n}`);
        await createPage({ name, projet: id, produit: produitNom, pageType, source }, known);
        known.push({ name });
        created.push({ name, pageType });
        return name;
      };

      // 1. Tout le site
      if (site.on && site.mode === "template") {
        for (const pageName of siteTemplate.pages ?? [siteTemplate.page]) {
          const info = pages.find((p) => p.name === pageName);
          await add(info?.pageType || siteTemplate.pageType || "produit", pageName);
        }
      }
      if (site.on && site.mode === "url") {
        await requestImport({ url: site.url.trim(), projet: id, siteComplet: true });
        imports++;
      }
      if (site.on && site.mode === "captures") {
        await requestImport({ images: site.images, projet: id, siteComplet: true });
        imports++;
      }

      // 2. Pages en plus
      for (const x of chosen) {
        if (x.mode === "template") await add(x.pageType, tplById[x.template].page);
        else if (x.mode === "url" || x.mode === "captures") {
          const name = await add(x.pageType, "");
          await requestImport({
            url: x.mode === "url" ? x.url.trim() : undefined,
            images: x.mode === "captures" ? x.images : undefined,
            projet: id,
            page: name,
            pageType: x.pageType,
          });
          imports++;
        } else await add(x.pageType, "");
      }

      // Un seul design par projet : celui de la première page (le site), appliqué
      // aux pages venues d'autres templates.
      const designs = await Promise.all(created.map(async (c) => (await (await fetch(`/api/pages/${c.name}`)).json()).root?.props?.design ?? null));
      const projectDesign = designs.find(Boolean);
      if (projectDesign && designById[projectDesign]) {
        for (const [i, c] of created.entries()) {
          if (designs[i] !== projectDesign) await applyDesignToPage(c.name, designById[projectDesign]);
        }
      }

      // Les pages sans achat renvoient vers la page d'achat du projet.
      const buy = created.find((c) => pageTypeById[c.pageType]?.achat);
      if (buy) {
        for (const c of created.filter((c) => !pageTypeById[c.pageType]?.achat)) {
          const page = await (await fetch(`/api/pages/${c.name}`)).json();
          page.root.props.pageAchat = buy.name;
          await fetch(`/api/pages/${c.name}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(page) });
        }
      }

      if (onCreated) onCreated(id, { created, imports });
      else if (created.length) location.search = `?page=${created[0].name}`;
      else location.href = `/catalogue.html#projet-${id}`;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const label = busy
    ? "Création…"
    : `Créer le projet${count ? ` et ${count} page(s)` : ""}${site.on && site.mode !== "template" ? " + import du site" : ""}`;

  return (
    <Modal
      title="Nouveau projet"
      onClose={onClose}
      footer={
        <>
          {error && <span className="atl-topbar__error">{error}</span>}
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="atl-newpage__create" disabled={busy || !nom.trim()} onClick={create}>
            {label}
          </button>
        </>
      }
    >
      <fieldset className="atl-newpage__grid">
        <legend>1. Le projet</legend>
        <label>
          <span>Nom du projet</span>
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Clearflow" autoFocus />
        </label>
        <label>
          <span>Produit ou gamme</span>
          <input value={produit} onChange={(e) => setProduit(e.target.value)} placeholder="ex. Clearflow Cayenne Complex" />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          <span>Notes (facultatif) : marché, cible, offre…</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex. Canada / US, femmes 45+, pack 3+2" />
        </label>
      </fieldset>

      <fieldset>
        <legend>2. Créer tout le site</legend>
        <div className={`atl-site${site.on ? " is-on" : ""}`}>
          <label className="atl-site__toggle">
            <input type="checkbox" checked={site.on} onChange={(e) => setSite({ ...site, on: e.target.checked })} />
            <b>Créer tout le site</b>
            <small>page d'accueil, page produit et les autres pages du site</small>
          </label>
          {site.on && (
            <span className="atl-source atl-source--wrap">
              <select value={site.mode} onChange={(e) => setSite({ ...site, mode: e.target.value })}>
                <option value="url">Depuis l'URL d'un site</option>
                <option value="template">Depuis un template</option>
                <option value="captures">Depuis des captures d'écran</option>
              </select>
              {site.mode === "captures" ? (
                <ScreenshotDrop images={site.images} onChange={(images) => setSite({ ...site, images })} hint="les pages du site, dans l'ordre" />
              ) : site.mode === "url" ? (
                <input value={site.url} onChange={(e) => setSite({ ...site, url: e.target.value })} placeholder="https://site-a-reproduire.com" />
              ) : (
                <select value={site.template} onChange={(e) => setSite({ ...site, template: e.target.value })}>
                  <option value="">— Choisir un template —</option>
                  {templates.filter((t) => t.page).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nom}
                    </option>
                  ))}
                </select>
              )}
            </span>
          )}
          {site.on && site.mode !== "template" && (
            <p className="atl-newpage__hint">
              Le site sera reproduit page par page dans ce projet, et ajouté au catalogue (template, sections, design.md). Dis ensuite à
              Claude « traite les demandes ».
            </p>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>3. Pages en plus</legend>
        <ul className="atl-starters">
          {extras.map((x, i) => {
            const type = pageTypeById[x.pageType];
            const covered = site.on && SITE_PAGES.includes(x.pageType);
            return (
              <li key={x.pageType} className={x.checked && !covered ? "is-on" : covered ? "is-covered" : ""}>
                <label>
                  <input type="checkbox" disabled={covered} checked={x.checked && !covered} onChange={(e) => setExtra(i, { checked: e.target.checked })} />
                  <b>{type.label}</b>
                  <small>{covered ? "inclus dans le site" : type.achat ? "achat" : "pas d'achat"}</small>
                </label>
                {x.checked && !covered && <PageSourceFields value={x} onChange={(v) => setExtra(i, v)} templates={templates} />}
              </li>
            );
          })}
        </ul>
        <p className="atl-newpage__hint">Toutes ces pages sont rangées dans le projet. Tu pourras en ajouter d'autres plus tard (« + Nouvelle »).</p>
      </fieldset>
    </Modal>
  );
}

// Bandeau d'une page qui n'est rangée dans aucun projet (page ancienne, ou
// ouverte par son adresse) : la ranger dans un projet existant ou nouveau.
// Les pages mirror des templates (importSource) n'en ont pas besoin.
export function OrphanBanner({ pageName, info, projects, getData }) {
  const [choice, setChoice] = useState("");
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (info?.projet || info?.importSource) return null;

  async function attach() {
    setError(null);
    const id = choice === NEW_PROJECT ? slug(nom) : choice;
    if (!id) return setError(choice === NEW_PROJECT ? "Donne un nom au projet." : "Choisis un projet.");
    setBusy(true);
    try {
      if (choice === NEW_PROJECT) {
        if (projects.some((p) => p.id === id)) throw new Error(`Le projet « ${nom} » existe déjà.`);
        await saveProject({ id, nom: nom.trim(), produit: "", description: "", creeLe: new Date().toISOString() });
      }
      const data = getData();
      const page = { ...data, root: { ...data.root, props: { ...data.root?.props, projet: id } } };
      const res = await fetch(`/api/pages/${pageName}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(page) });
      if (!res.ok) throw new Error((await res.json()).error);
      location.reload();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="atl-orphan" role="alert">
      <b>Cette page n'est rangée dans aucun projet.</b>
      <span>Une page appartient toujours à un projet :</span>
      <select value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">— Choisir le projet —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nom}
          </option>
        ))}
        <option value={NEW_PROJECT}>+ Créer un nouveau projet…</option>
      </select>
      {choice === NEW_PROJECT && <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du projet" />}
      <button type="button" disabled={busy} onClick={attach}>
        {busy ? "Enregistrement…" : "Ranger la page"}
      </button>
      {error && <span className="atl-topbar__error">{error}</span>}
    </div>
  );
}
