import { useCallback, useEffect, useRef, useState } from "react";
import { sections } from "../engine/sections.js";
import { PAGE_TYPES, pageTypeById } from "../engine/page-types.js";
import { NAME, confirmDelete, createPage, listPages, listProjects, listTemplates, mirrorIntoPage, pageNameFor, saveProject, slug, trashItem } from "../projects.js";
import { PagePreview, SourceLink } from "./hover.jsx";
import { ORIGINS, OriginBar, originLabel, useOrigins } from "./origins.jsx";

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

// Page ouverte en dernier dans l'atelier (ou ?page=) : cible du miroring.
const currentPage = new URLSearchParams(location.search).get("page") ?? (() => {
  try {
    return localStorage.getItem("atl-last-page");
  } catch {
    return null;
  }
})();

async function mirrorHere(template, onMessage) {
  const question = `Miroring de « ${template.nom} » dans la page « ${currentPage} » ?\n\nToutes les sections de la page sont remplacées par celles du template (copie de sécurité dans l'Historique). La page garde son projet, son titre et son produit.`;
  if (!confirm(question)) return;
  try {
    const n = await mirrorIntoPage(currentPage, template.page);
    onMessage?.({ text: `${n} section(s) copiées dans « ${currentPage} ». Ouverture…` });
    location.href = `/?page=${encodeURIComponent(currentPage)}`;
  } catch (e) {
    onMessage?.({ error: true, text: `Échec : ${e.message}` });
  }
}

// « La page originale a-t-elle changé ? » : site en ligne contre la capture
// enregistrée (~40 s). Pas de re-vérification de la copie elle-même.
async function checkSite(template, onMessage, onChecked) {
  onMessage?.({ text: `Contrôle de ${template.url} en cours (~40 s)…` });
  try {
    const res = await fetch(`/api/verifier/${template.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site: true }) });
    const r = await res.json();
    if (!res.ok || r.erreur) throw new Error(r.error ?? r.erreur);
    onChecked({ date: r.date, score: r.score, change: r.change, verdict: r.verdict });
    onMessage?.({
      text: `${template.nom} : ${r.verdict} (${r.score} / 100). ${r.textes}, ${r.images}, hauteur ${r.hauteur.ecart}.${r.change ? " Pour reprendre la nouvelle version : réimporter la page." : ""}`,
      error: r.change,
    });
  } catch (e) {
    onMessage?.({ error: true, text: `Contrôle impossible : ${e.message}` });
  }
}

// Petit menu (⋯ de l'aperçu, ▾ du bouton) : se ferme au clic ailleurs ou sur Échap.
function Menu({ className, label, icon, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className={`cat-menu ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        className="cat-menu__trigger"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={(e) => (e.preventDefault(), e.stopPropagation(), setOpen(!open))}
      >
        {icon}
      </button>
      {open && (
        <div className="cat-menu__list" role="menu">
          {items.filter(Boolean).map((it) =>
            it.href ? (
              <a key={it.label} role="menuitem" href={it.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                {it.label}
              </a>
            ) : (
              <button key={it.label} type="button" role="menuitem" className={it.danger ? "is-danger" : ""} onClick={() => (setOpen(false), it.action())}>
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// Titre court : le produit (« Burn2O (shot liquide) » → « Burn2O — shot
// liquide »), sinon le nom du template.
const shortTitle = (t) => {
  const p = String(t.produit ?? "").trim();
  if (!p) return t.nom;
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(p);
  return m ? `${m[1]} — ${m[2]}` : p;
};

// Carte d'un template : un aperçu (clic = ouvrir la page modifiable), un titre
// court, des pastilles, une seule action principale (avec ▾ pour remplacer la
// page ouverte) et un menu ⋯ pour les actions rares.
function TemplateCard({ template, onUse, onDelete, onMessage }) {
  // Aperçu : la capture pleine page (nette), la vignette en secours.
  const { originOf, setOrigin } = useOrigins();
  const origin = originOf(template.id);
  const type = pageTypeById[template.pageType];
  const extracted = sectionsFromTemplate(template).length;
  const [check, setCheck] = useState(template.controleSite ?? null);
  const [preview, setPreview] = useState(false);
  const closePreview = useCallback(() => setPreview(false), []);
  const host = (() => {
    try {
      return new URL(template.url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();
  const props = template.propositions;
  const niche = String(template.niche ?? "").split(/\s+[—-]\s+/)[0];
  const canReplace = currentPage && template.page && currentPage !== template.page;
  return (
    <article className="cat-card cat-tpl">
      <div className="cat-tpl__media">
        {/* Page entière (desktop.png), à faire défiler dans la carte ; la vignette en secours. */}
        <div className="cat-tpl__thumb cat-card__scroll">
          {template.vignette ? (
            <img src={template.vignette.replace(/vignette.png$/, "desktop.png")} alt="" loading="lazy" onError={(e) => e.currentTarget.src !== new URL(template.vignette, location.href).href && (e.currentTarget.src = template.vignette)} />
          ) : (
            <span>Pas de vignette</span>
          )}
        </div>
        {type && <span className="cat-tpl__type">{type.label}</span>}
        <Menu
          className="cat-tpl__more"
          label="Plus d'actions"
          icon="⋯"
          items={[
            template.url && { label: "Voir l'original", href: `/api/original/${template.id}` },
            template.url && { label: "Vérifier si le site a changé", action: () => checkSite(template, onMessage, setCheck) },
            ...ORIGINS.map((o) => ({ label: `${o.id === origin ? "✓ " : ""}Origine : ${o.label}`, action: () => setOrigin(template.id, o.id).catch((e) => onMessage({ error: true, text: e.message })) })),
            { label: "Supprimer", danger: true, action: () => onDelete(template) },
          ]}
        />
      </div>
      <div className="cat-tpl__body">
        <strong className="cat-tpl__title" title={template.nom}>
          {shortTitle(template)}
        </strong>
        <span className="cat-tpl__meta">
          {template.marque}
          {template.marque && host && " · "}
          {host && (
            <a href={template.url} target="_blank" rel="noreferrer noopener" title={template.url}>
              {host} ↗
            </a>
          )}
        </span>
        <div className="cat-tpl__pills">
          <span className="cat-tpl__pill is-origin">{originLabel(origin)}</span>
          {niche && <span className="cat-tpl__pill">{niche}</span>}
          {extracted > 0 && <span className="cat-tpl__pill">{extracted} sections</span>}
          {props && (
            <span className="cat-tpl__pill is-info" title={props.manquantes.map((m) => `${m.section} (${m.ou}, +${m.gain} pts) : ${m.pourquoi}`).join("\n") || "Toutes les sections conseillées sont là"}>
              Vente {props.score}
            </span>
          )}
          {check?.change && (
            <span className="cat-tpl__pill is-bad" title={`${check.verdict} — contrôlé le ${String(check.date).slice(0, 10)}`}>
              Site modifié
            </span>
          )}
        </div>
      </div>
      <div className="cat-tpl__actions">
        {/* Aperçu : la page du template, en lecture seule, par-dessus le catalogue. */}
        <button type="button" className="cat-btn cat-btn--ghost cat-tpl__preview" disabled={!template.page && !template.vignette} onClick={() => setPreview(true)}>
          Aperçu
        </button>
        {preview && (
          <PagePreview
            page={template.page}
            image={template.vignette?.replace(/vignette.png$/, "desktop.png")}
            title={template.nom}
            onClose={closePreview}
          />
        )}
        <div className={`cat-tpl__use${canReplace ? " has-more" : ""}`}>
          <button type="button" className="cat-tpl__primary" disabled={!template.page} onClick={() => onUse(template)} title="Créer une page avec ce template, dans un projet">
            Utiliser ce template
          </button>
          {canReplace && (
            <Menu
              className="cat-tpl__usemore"
              label="Autres façons de l'utiliser"
              icon="▾"
              items={[
                { label: "Nouvelle page dans un projet", action: () => onUse(template) },
                { label: `Remplacer la page « ${currentPage} »`, action: () => mirrorHere(template, onMessage) },
              ]}
            />
          )}
        </div>
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

export function TemplatesView({ onMessage, initialType = "tous", typeLabels = {} }) {
  const [templates, setTemplates] = useState(null);
  const [type, setType] = useState(initialType);
  const [origin, setOriginFilter] = useState("");
  const [q, setQ] = useState("");
  const { originOf } = useOrigins();
  const shown = (t) =>
    (type === "tous" || t.pageType === type) &&
    (!origin || originOf(t.id) === origin) &&
    (!q.trim() || q.toLowerCase().split(/\s+/).every((w) => [t.id, t.nom, t.marque, t.niche, t.url, t.produit, originLabel(originOf(t.id))].join(" ").toLowerCase().includes(w)));
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
      <h1 className="cat-h1-type">
        Templates
        {/* Le type affiché (menu de gauche ou onglet), à côté du titre. */}
        {type !== "tous" && <span>{typeLabels[type] ?? pageTypeById[type]?.label ?? type}</span>}
      </h1>
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
          <OriginBar ids={templates.map((t) => t.id)} value={origin} onChange={setOriginFilter} />
          <input className="cat-search" placeholder="Rechercher un template : marque, produit, niche, site…" value={q} onChange={(e) => setQ(e.target.value)} />
        {templates.some(shown) ? (
          <div className="cat-grid">
            {templates.filter(shown).map((t) => (
              <TemplateCard key={t.id} template={t} onUse={setUsing} onDelete={remove} onMessage={onMessage} />
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
