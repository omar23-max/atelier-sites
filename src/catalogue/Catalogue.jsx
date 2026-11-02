import { useEffect, useMemo, useState } from "react";
import { catalogueSections as allSections, sections as everySection } from "../engine/sections.js";
import { FAMILIES, familyOf } from "../engine/families.js";
import { defaultPropsFor, renderSectionHtml } from "../engine/render.js";
import { applyDesign } from "../engine/design.js";
import { Enrichir, METHODS } from "./Enrichir.jsx";
import { DesignsView } from "./Designs.jsx";
import { designById, designs } from "../engine/designs.js";
import { HoverPreviewProvider, SourceLink } from "./hover.jsx";
import { OriginBar, originLabel, useOrigins } from "./origins.jsx";
import { TemplatesView } from "./Templates.jsx";
import { ProjectDetail, ProjectsView } from "./Projets.jsx";
import { PagesView } from "./Pages.jsx";
import { confirmDelete, listPages, listProjects, listTemplates } from "../projects.js";
import { PAGE_TYPES } from "../engine/page-types.js";

// Libellés courts du menu « Templates par type ».
const TYPE_MENU = { produit: "Pages produit", offre: "Pages d'offre", collection: "Pages collection", landing: "Landing pages", accueil: "Pages d'accueil", advertorial: "Advertorials", listicle: "Listicles", autre: "Autres pages" };

// Date d'un nom de corbeille (20261021-000105, en heure UTC) → heure locale.
const stampDate = (s) => {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(String(s ?? ""));
  if (!m) return s;
  return new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
};

const BIN_KINDS = { pages: "Page", projets: "Projet", templates: "Template", designs: "Design", demandes: "Demande" };

// Ouvert depuis l'atelier avec ?page=<nom> : la page à laquelle appliquer un design.
// Page courante : celle d'où l'on vient (?page=), sinon la dernière ouverte dans l'atelier.
const targetPage = new URLSearchParams(location.search).get("page") ?? (() => { try { return localStorage.getItem("atl-last-page"); } catch { return null; } })();

const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

const statusOf = (s) => s.meta.status ?? "visible";

function previewDocument(section) {
  const imports = [...new Set(section.css.match(IMPORT) ?? [])].join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
${imports}
html, body { margin: 0; background: #fff; }
${section.css.replace(IMPORT, "")}
</style></head><body>${renderSectionHtml(section, {}, "apercu")}</body></html>`;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erreur");
  return data;
}

// Ajoute une section à la fin de la page courante (copie de sécurité avant),
// aux couleurs de son design.md comme le bouton « + » de l'atelier.
export async function addToCurrentPage(section) {
  const url = `/api/pages/${targetPage}`;
  const page = await api("GET", url);
  let item = { type: section.id, props: { ...defaultPropsFor(section), id: `${section.id}-${Date.now().toString(36)}` } };
  const design = designById[page.root?.props?.design];
  if (design) item = applyDesign({ root: {}, content: [item] }, design, Object.fromEntries(everySection.map((x) => [x.id, x]))).page.content[0];
  await api("POST", `${url}/snapshot`).catch(() => {});
  await api("PUT", url, { ...page, content: [...(page.content ?? []), item] });
  return item.props.id;
}

function AddToPageButton({ section, onMessage, short }) {
  const [busy, setBusy] = useState(false);
  if (!targetPage) return null;
  return (
    <button
      type="button"
      className="cat-btn"
      disabled={busy}
      title={`Ajouter à la fin de « ${targetPage} »`}
      onClick={async () => {
        setBusy(true);
        try {
          const id = await addToCurrentPage(section);
          // La page s'ouvre tout de suite, sur la section ajoutée (sélectionnée).
          onMessage?.({ text: `« ${section.meta.label ?? section.id} » ajoutée à « ${targetPage} ». Ouverture de la page…` });
          location.href = `/?page=${encodeURIComponent(targetPage)}&section=${encodeURIComponent(id)}`;
        } catch (e) {
          onMessage?.({ error: true, text: `Échec : ${e.message}` });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Ajout…" : short ? "+ Ajouter" : "+ Ajouter dans la page actuelle"}
    </button>
  );
}

function Preview({ section, onClose, onMessage }) {
  const [device, setDevice] = useState("desktop");
  const width = device === "desktop" ? 1440 : 390;
  const scale = device === "desktop" ? 0.62 : 1;
  const doc = useMemo(() => previewDocument(section), [section]);
  const [height, setHeight] = useState(600);

  return (
    <div className="cat-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cat-modal__panel cat-modal__panel--wide">
        <header className="cat-modal__head">
          <div>
            <h2>{section.meta.label ?? section.schema.name}</h2>
            <p className="cat-muted">
              {familyOf(section).label} · <SourceLink url={section.meta.source?.url} prefix="inspirée de" />
            </p>
          </div>
          <div className="cat-seg">
            <button type="button" className={device === "desktop" ? "is-on" : ""} onClick={() => setDevice("desktop")}>
              Ordinateur
            </button>
            <button type="button" className={device === "mobile" ? "is-on" : ""} onClick={() => setDevice("mobile")}>
              Mobile
            </button>
          </div>
          <AddToPageButton section={section} onMessage={(m) => (onMessage?.(m), m.error || onClose())} />
          <button type="button" className="cat-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="cat-preview">
          <div style={{ width: width * scale, height: height * scale }}>
            <iframe
              title="Aperçu"
              srcDoc={doc}
              style={{ width, height, transform: `scale(${scale})` }}
              onLoad={(e) => setHeight(Math.max(200, e.currentTarget.contentDocument.documentElement.scrollHeight))}
            />
          </div>
        </div>
        {section.meta.source?.note && <p className="cat-note">{section.meta.source.note}</p>}
      </div>
    </div>
  );
}

// Entrée du menu de gauche qui se déplie (Sections, Templates).
function NavGroup({ label, count, active, open, onToggle, children }) {
  return (
    <>
      <button type="button" className={`cat-nav__group${active ? " is-active" : ""}${open ? " is-open" : ""}`} aria-expanded={open} onClick={onToggle}>
        <span>
          <i aria-hidden="true">›</i> {label}
        </span>
        <em>{count}</em>
      </button>
      {open && <div className="cat-nav__sub">{children}</div>}
    </>
  );
}

function SectionCard({ section, onPreview, onStatus, onTrash, onMessage }) {
  const hidden = statusOf(section) === "masquee";
  return (
    <article className={`cat-card${hidden ? " is-hidden" : ""}`}>
      {/* Image entière de la section : on la fait défiler dans la carte. */}
      <div className="cat-card__thumb cat-card__scroll">
        {section.thumbnail ? <img src={section.thumbnail} alt="" loading="lazy" /> : <span>Pas de miniature</span>}
      </div>
      <div className="cat-card__body">
        <strong>{section.meta.label ?? section.schema.name}</strong>
        <span className="cat-muted cat-card__meta">
          <SourceLink url={section.meta.source?.url} />
          {section.meta.source?.capturedAt ? ` · ${section.meta.source.capturedAt}` : ""}
        </span>
        <div className="cat-card__badges">
          <span className={`cat-badge ${hidden ? "cat-badge--grey" : "cat-badge--green"}`}>{hidden ? "Masquée" : "Visible"}</span>
          {section.errors.length > 0 && <span className="cat-badge cat-badge--red">À corriger</span>}
        </div>
      </div>
      <div className="cat-card__actions">
        <button type="button" className="cat-btn cat-btn--ghost" onClick={() => onPreview(section)}>
          Aperçu
        </button>
        <AddToPageButton section={section} onMessage={onMessage} short />
        <button type="button" className="cat-btn cat-btn--ghost" onClick={() => onStatus(section, hidden ? "visible" : "masquee")}>
          {hidden ? "Afficher" : "Masquer"}
        </button>
        <button type="button" className="cat-btn cat-btn--danger" onClick={() => onTrash(section)}>
          Supprimer
        </button>
      </div>
    </article>
  );
}

export default function Catalogue() {
  const [view, setView] = useState(() => location.hash.slice(1) || (location.search.includes("page=") ? "designs" : "tout"));
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("");
  const { originOf } = useOrigins();
  const [preview, setPreview] = useState(null);
  const [statusOverride, setStatusOverride] = useState({});
  const [trashed, setTrashed] = useState([]);
  const [requests, setRequests] = useState([]);
  const [trash, setTrash] = useState([]);
  const [bin, setBin] = useState([]);
  const [message, setMessage] = useState(null);

  const sections = allSections
    .filter((s) => !trashed.includes(s.id))
    .map((s) => (statusOverride[s.id] ? { ...s, meta: { ...s.meta, status: statusOverride[s.id] } } : s));

  const refresh = () => {
    // Nombres affichés dans le menu : projets, pages, templates.
    Promise.all([listProjects(), listPages(), listTemplates()])
      .then(([p, pg, t]) =>
        setCounts({
          projets: p.length,
          pages: pg.filter((p) => p.projet).length,
          templates: t.length,
          parType: Object.fromEntries(PAGE_TYPES.map((x) => [x.id, t.filter((tp) => tp.pageType === x.id).length])),
        }),
      )
      .catch(() => {});
    api("GET", "/api/requests").then(setRequests).catch(() => {});
    api("GET", "/api/trash").then(setTrash).catch(() => {});
    api("GET", "/api/corbeille").then(setBin).catch(() => {});
  };
  const [counts, setCounts] = useState({});
  // Recompté à chaque changement de vue : une création ou une suppression s'y voit tout de suite.
  useEffect(refresh, [view]);
  // Liens vers une vue (#templates, #projet-<id>…) depuis l'atelier ou ailleurs.
  useEffect(() => {
    const onHash = () => setView(location.hash.slice(1) || "tout");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    location.hash = view;
    window.scrollTo(0, 0);
  }, [view]);

  const grouped = Object.fromEntries(FAMILIES.map((f) => [f.id, []]));
  for (const s of sections) (grouped[familyOf(s).id] ??= []).push(s);

  const q = query.trim().toLowerCase();
  // Recherche : nom, fonction, famille, site et template d'origine, mots du
  // contenu ; filtre : origine (Daydreamer Excel, Whitelabeler…).
  const matches = (s) =>
    (!origin || originOf(s.id) === origin) &&
    (!q ||
      q.split(/\s+/).every((w) =>
        [s.id, s.meta.label, s.meta.fonction, s.schema.name, s.meta.source?.url, familyOf(s).label, originLabel(originOf(s.id)), s.meta.family]
          .join(" ")
          .toLowerCase()
          .includes(w),
      ));

  const pending = requests.filter((r) => r.statut !== "traitée").length;
  const filledFamilies = FAMILIES.filter((f) => grouped[f.id]?.length).length;

  async function changeStatus(section, status) {
    try {
      await api("PUT", `/api/sections/${section.id}/status`, { status });
      setStatusOverride((o) => ({ ...o, [section.id]: status }));
      setMessage({ text: status === "masquee" ? "Section masquée : elle n'est plus proposée dans l'atelier." : "Section de nouveau visible dans l'atelier." });
    } catch (e) {
      setMessage({ error: true, text: e.message });
    }
  }

  async function trashSection(section) {
    if (!confirm(`Supprimer « ${section.meta.label ?? section.id} » ?\nElle part dans la corbeille et reste restaurable.\nAttention : les pages qui l'utilisent ne l'afficheront plus.`)) return;
    try {
      await api("POST", `/api/sections/${section.id}/trash`);
      setTrashed((t) => [...t, section.id]);
      setMessage({ text: "Section déplacée dans la corbeille." });
      refresh();
    } catch (e) {
      setMessage({ error: true, text: e.message });
    }
  }

  // Corbeille : éléments cochés pour la suppression définitive
  // (« kind/entry » ; « sections/<nom> » pour la corbeille des sections).
  const [checked, setChecked] = useState(() => new Set());
  const allKeys = [...bin.map((b) => `${b.kind}/${b.entry}`), ...trash.map((t) => `sections/${t.trash}`)];
  const toggleChecked = (key) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  async function purge() {
    const keys = [...checked].filter((k) => allKeys.includes(k));
    if (!keys.length) return;
    const names = keys.map((k) => {
      const b = bin.find((x) => `${x.kind}/${x.entry}` === k);
      const t = trash.find((x) => `sections/${x.trash}` === k);
      return `• ${b ? `${BIN_KINDS[b.kind]} — ${b.label}` : `Section — ${t?.label ?? k}`}`;
    });
    const shown = names.length > 15 ? [...names.slice(0, 15), `… et ${names.length - 15} autre(s)`] : names;
    if (!confirm(`Supprimer définitivement ${keys.length} élément(s) ?\n\n${shown.join("\n")}\n\nIls ne pourront plus être restaurés.`)) return;
    try {
      const items = keys.map((k) => ({ kind: k.split("/")[0], entry: k.slice(k.indexOf("/") + 1) }));
      const r = await api("POST", "/api/corbeille/purge", { items });
      setChecked(new Set());
      setMessage({ text: `${r.supprimes} élément(s) supprimé(s) définitivement.` });
      refresh();
    } catch (e) {
      setMessage({ error: true, text: `Échec : ${e.message}` });
    }
  }

  // Corbeille commune (pages, projets, templates, designs, demandes).
  async function binRemove(kind, id, what, details) {
    if (!confirmDelete(what, details)) return;
    try {
      await api("POST", `/api/corbeille/${kind}/${id}`);
      setMessage({ text: "Déplacé dans la corbeille." });
      refresh();
    } catch (e) {
      setMessage({ error: true, text: `Échec : ${e.message}` });
    }
  }
  async function binRestore(b) {
    try {
      await api("POST", `/api/corbeille/${b.kind}/${b.entry}/restore`);
      setMessage({ text: `« ${b.label} » restauré.` });
      // Un design restauré doit être relu par le catalogue.
      if (b.kind === "designs") return setTimeout(() => location.reload(), 700);
      refresh();
    } catch (e) {
      setMessage({ error: true, text: `Échec : ${e.message}` });
    }
  }

  async function restore(item) {
    try {
      await api("POST", `/api/trash/${item.trash}/restore`);
      setMessage({ text: "Section restaurée. La page va se recharger." });
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      setMessage({ error: true, text: e.message });
    }
  }

  const cardProps = { onPreview: setPreview, onStatus: changeStatus, onTrash: trashSection, onMessage: setMessage };
  const currentFamily = FAMILIES.find((f) => f.id === view);
  // Menu de gauche : un seul sous-menu ouvert, celui de la vue affichée.
  const inSections = view === "tout" || Boolean(currentFamily);
  const [openGroup, setOpenGroup] = useState(() => (inSections ? "sections" : view.startsWith("templates") ? "templates" : null));
  useEffect(() => {
    if (inSections) setOpenGroup("sections");
    else if (view.startsWith("templates")) setOpenGroup("templates");
  }, [view, inSections]);
  // Clic sur le titre : ouvre le sous-menu (et sa vue « tout »), ou le referme.
  const toggleGroup = (group, allView) => {
    if (openGroup === group) return setOpenGroup(null);
    setOpenGroup(group);
    setView(allView);
  };

  function FamilyBlock({ family }) {
    const list = (grouped[family.id] ?? []).filter(matches);
    if ((q || origin) && list.length === 0) return null;
    return (
      <section className="cat-panel">
        <div className="cat-panel__head">
          <h3>{family.label}</h3>
          <span className="cat-badge cat-badge--grey">
            {list.length} modèle{list.length > 1 ? "s" : ""}
          </span>
          <span className="cat-muted cat-panel__hint">{family.hint}</span>
        </div>
        {list.length ? (
          <div className="cat-grid">
            {list.map((s) => (
              <SectionCard key={s.id} section={s} {...cardProps} />
            ))}
          </div>
        ) : (
          <div className="cat-empty">
            Aucun modèle pour l'instant.{" "}
            <button type="button" className="cat-link" onClick={() => setView("enrichir")}>
              Enrichir cette famille
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <HoverPreviewProvider>
    <div className="cat">
      <header className="cat-top">
        <div className="cat-top__brand">
          <span className="cat-logo">A</span>
          <strong>Atelier — Catalogue</strong>
          <span className="cat-badge cat-badge--blue">Local</span>
        </div>
        <a className="cat-btn cat-btn--ghost" href={targetPage ? `/?page=${encodeURIComponent(targetPage)}` : "/"}>
          {targetPage ? `← Retour à « ${targetPage} »` : "Ouvrir l'atelier"}
        </a>
      </header>

      <div className="cat-layout">
        <nav className="cat-nav">
          <p className="cat-nav__title cat-nav__title--first">Catalogue</p>
          <button type="button" className={view === "projets" || view.startsWith("projet-") ? "is-on" : ""} onClick={() => setView("projets")}>
            Projets <em>{counts.projets ?? "…"}</em>
          </button>
          <button type="button" className={view === "pages" ? "is-on" : ""} onClick={() => setView("pages")}>
            Pages <em>{counts.pages ?? "…"}</em>
          </button>
          {/* Templates : sous-menu « Tous les templates » puis chaque type de page. */}
          <NavGroup
            label="Templates"
            count={counts.templates ?? "…"}
            active={view.startsWith("templates")}
            open={openGroup === "templates"}
            onToggle={() => toggleGroup("templates", "templates")}
          >
            <button type="button" className={view === "templates" ? "is-on" : ""} onClick={() => setView("templates")}>
              Tous les templates <em>{counts.templates ?? "…"}</em>
            </button>
            {PAGE_TYPES.map((t) => {
              const n = counts.parType?.[t.id] ?? 0;
              return (
                <button
                  type="button"
                  key={t.id}
                  className={`${view === `templates-${t.id}` ? "is-on" : ""}${n ? "" : " is-empty"}`}
                  onClick={() => setView(`templates-${t.id}`)}
                >
                  {TYPE_MENU[t.id] ?? t.label} <em>{n}</em>
                </button>
              );
            })}
          </NavGroup>
          {/* Sections : sous-menu « Toutes les sections » puis chaque famille. */}
          <NavGroup
            label="Sections"
            count={sections.length}
            active={inSections}
            open={openGroup === "sections"}
            onToggle={() => toggleGroup("sections", "tout")}
          >
            <button type="button" className={view === "tout" ? "is-on" : ""} onClick={() => setView("tout")}>
              Toutes les sections <em>{sections.length}</em>
            </button>
            {FAMILIES.map((f) => (
              <button
                type="button"
                key={f.id}
                className={`${view === f.id ? "is-on" : ""}${grouped[f.id]?.length ? "" : " is-empty"}`}
                onClick={() => setView(f.id)}
              >
                {f.label} <em>{grouped[f.id]?.length ?? 0}</em>
              </button>
            ))}
          </NavGroup>
          <button type="button" className={view === "designs" ? "is-on" : ""} onClick={() => setView("designs")}>
            Designs (design.md) <em>{designs.length}</em>
          </button>
          <button type="button" className={view === "enrichir" ? "is-on" : ""} onClick={() => setView("enrichir")}>
            Enrichir le catalogue
          </button>
          <button type="button" className={view === "demandes" ? "is-on" : ""} onClick={() => setView("demandes")}>
            Demandes {pending > 0 && <em className="cat-dot">{pending}</em>}
          </button>
          <p className="cat-nav__title">Gestion</p>
          <button type="button" className={view === "corbeille" ? "is-on" : ""} onClick={() => setView("corbeille")}>
            Corbeille <em>{trash.length + bin.length}</em>
          </button>
        </nav>

        <main className="cat-main">
          {message && (
            <div className={`cat-flash${message.error ? " is-error" : ""}`} onClick={() => setMessage(null)}>
              {message.text}
            </div>
          )}

          {view === "tout" && (
            <>
              <div className="cat-intro">
              <h1>Sections</h1>
              <p className="cat-lead">
                Toutes tes sections, rangées par famille. Ce qui est visible ici est proposé dans l'atelier (« + Ajouter »). Les
                designs (fichiers design.md) sont dans{" "}
                <button type="button" className="cat-link" onClick={() => setView("designs")}>
                  Designs
                </button>
                .
              </p>
              <div className="cat-stats">
                <div>
                  <strong>{sections.length}</strong>
                  <span>sections</span>
                </div>
                <div>
                  <strong>
                    {filledFamilies} / {FAMILIES.length}
                  </strong>
                  <span>familles remplies</span>
                </div>
                <div>
                  <strong>{pending}</strong>
                  <span>demandes en attente</span>
                </div>
              </div>
              <section className="cat-panel">
                <div className="cat-panel__head">
                  <h3>Ajouter au catalogue</h3>
                </div>
                <p className="cat-muted">Quatre façons d'enrichir le catalogue. Chaque demande est enregistrée ; je la traite quand tu me dis « traite les demandes du catalogue ».</p>
                <div className="cat-actions">
                  {METHODS.map((m, i) => (
                    <button
                      type="button"
                      key={m.id}
                      className={`cat-btn ${i === 0 ? "" : "cat-btn--ghost"}`}
                      onClick={() => {
                        setView("enrichir");
                        setTimeout(() => document.getElementById(`m-${m.id}`)?.scrollIntoView({ behavior: "smooth" }), 50);
                      }}
                    >
                      + {m.short}
                    </button>
                  ))}
                </div>
              </section>
              </div>
              <OriginBar ids={sections.map((s) => s.id)} value={origin} onChange={setOrigin} />
              <input className="cat-search" placeholder="Rechercher une section : nom, fonction (avis, FAQ…), site ou template d'origine, mot-clé…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {FAMILIES.filter((f) => grouped[f.id]?.length || !(q || origin)).map((f) => (
                <FamilyBlock key={f.id} family={f} />
              ))}
            </>
          )}

          {currentFamily && (
            <>
              <h1>{currentFamily.label}</h1>
              <p className="cat-lead">{currentFamily.hint}</p>
              <FamilyBlock family={currentFamily} />
            </>
          )}

          {view === "designs" && <DesignsView targetPage={targetPage} onMessage={setMessage} />}
          {(view === "templates" || view.startsWith("templates-")) && (
            <TemplatesView key={view} typeLabels={TYPE_MENU} initialType={view.startsWith("templates-") ? view.slice(10) : "tous"} onMessage={(m) => (setMessage(m), refresh())} />
          )}
          {view === "pages" && <PagesView onOpenProject={(id) => setView(`projet-${id}`)} onMessage={(m) => (setMessage(m), refresh())} />}
          {view === "projets" && <ProjectsView onOpen={(id) => setView(`projet-${id}`)} onMessage={(m) => (setMessage(m), refresh())} />}
          {view.startsWith("projet-") && <ProjectDetail id={view.slice(7)} onBack={() => setView("projets")} onMessage={(m) => (setMessage(m), refresh())} />}

          {view === "enrichir" && (
            <Enrichir
              onSent={(dossier) => {
                setMessage({ text: `Demande enregistrée (${dossier}). Dis-moi « traite les demandes du catalogue » pour que je m'en occupe.` });
                refresh();
                setView("demandes");
              }}
              onError={(text) => setMessage({ error: true, text })}
            />
          )}

          {view === "demandes" && (
            <>
              <h1>Demandes</h1>
              <p className="cat-lead">Ce que tu m'as demandé d'ajouter au catalogue. Dis-moi « traite les demandes du catalogue » et je les traite une par une.</p>
              {requests.length === 0 ? (
                <div className="cat-empty">Aucune demande pour l'instant.</div>
              ) : (
                <div className="cat-list">
                  {requests.map((r) => {
                    const method = METHODS.find((m) => m.id === r.type);
                    return (
                      <article key={r.dossier} className="cat-request">
                        <div>
                          <strong>{method?.title ?? { textes: "Réécrire les textes d'une page", images: "Studio d'images" }[r.type] ?? r.type}{r.page ? ` — ${r.page}` : ""}</strong>
                          <span className="cat-muted">
                            {new Date(r.creeLe).toLocaleString("fr-CA")} · {r.famille ? FAMILIES.find((f) => f.id === r.famille)?.label : "famille au choix"}
                          </span>
                          {r.url && <span className="cat-muted">{r.url}</span>}
                          {r.sections && <span>Sections : {r.sections}</span>}
                          {r.consignes && <span>{r.consignes}</span>}
                          {r.images?.length > 0 && <span className="cat-muted">{r.images.length} capture(s) jointe(s)</span>}
                          {r.resultat && <span className="cat-muted">Résultat : {r.resultat}</span>}
                        </div>
                        <span className="cat-request__side">
                          <span className={`cat-badge ${r.statut === "traitée" ? "cat-badge--green" : r.statut === "en cours" ? "cat-badge--blue" : "cat-badge--amber"}`}>
                            {r.statut}
                          </span>
                          <button
                            type="button"
                            className="cat-btn cat-btn--danger"
                            onClick={() =>
                              binRemove(
                                "demandes",
                                r.dossier.replace(/^demandes\//, ""),
                                "cette demande",
                                [
                                  `${method?.title ?? r.type}${r.page ? ` — ${r.page}` : ""} (${r.statut})`,
                                  r.statut !== "traitée" ? "Elle n'a pas encore été traitée : elle ne le sera pas." : "",
                                  r.page && r.statut !== "traitée" ? `La page « ${r.page} » reste, vide, dans son projet.` : "",
                                ].filter(Boolean),
                              )
                            }
                          >
                            Supprimer
                          </button>
                        </span>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {view === "corbeille" && (
            <>
              <h1>Corbeille</h1>
              <p className="cat-lead">
                Tout ce qui a été supprimé du catalogue : projets (avec leurs pages), pages, templates, designs, demandes et sections. Restaure ce
                que tu veux, ou coche des éléments pour les supprimer définitivement.
              </p>
              {(bin.length > 0 || trash.length > 0) && (
                <div className="cat-binbar">
                  <label>
                    <input
                      type="checkbox"
                      checked={allKeys.length > 0 && checked.size === allKeys.length}
                      ref={(el) => el && (el.indeterminate = checked.size > 0 && checked.size < allKeys.length)}
                      onChange={(e) => setChecked(new Set(e.target.checked ? allKeys : []))}
                    />
                    Tout cocher
                  </label>
                  <span className="cat-muted">{checked.size ? `${checked.size} élément(s) coché(s)` : `${allKeys.length} élément(s)`}</span>
                  <button type="button" className="cat-btn cat-btn--danger" disabled={!checked.size} onClick={purge}>
                    Supprimer définitivement{checked.size ? ` (${checked.size})` : ""}
                  </button>
                </div>
              )}
              {bin.length > 0 && (
                <div className="cat-list" style={{ marginBottom: 18 }}>
                  {bin.map((b) => (
                    <article key={`${b.kind}/${b.entry}`} className={`cat-request${checked.has(`${b.kind}/${b.entry}`) ? " is-checked" : ""}`}>
                      <input type="checkbox" className="cat-bincheck" aria-label={`Cocher « ${b.label} »`} checked={checked.has(`${b.kind}/${b.entry}`)} onChange={() => toggleChecked(`${b.kind}/${b.entry}`)} />
                      <div>
                        <strong>
                          <span className="cat-badge cat-badge--grey">{BIN_KINDS[b.kind]}</span> {b.label}
                        </strong>
                        <span className="cat-muted">
                          {b.id} · supprimé le {stampDate(b.when)}
                          {b.kind === "projets" ? " · restaurer le projet ramène aussi ses pages" : ""}
                        </span>
                      </div>
                      <button type="button" className="cat-btn cat-btn--ghost" onClick={() => binRestore(b)}>
                        Restaurer
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {trash.length > 0 && <h2 className="cat-subtitle">Sections</h2>}
              {trash.length === 0 && bin.length === 0 ? (
                <div className="cat-empty">Rien n'a été supprimé.</div>
              ) : trash.length === 0 ? null : (
                <div className="cat-list">
                  {trash.map((t) => (
                    <article key={t.trash} className={`cat-request${checked.has(`sections/${t.trash}`) ? " is-checked" : ""}`}>
                      <input type="checkbox" className="cat-bincheck" aria-label={`Cocher « ${t.label} »`} checked={checked.has(`sections/${t.trash}`)} onChange={() => toggleChecked(`sections/${t.trash}`)} />
                      <div>
                        <strong>{t.label}</strong>
                        <span className="cat-muted">Supprimée le {stampDate(t.trash.split("__")[1])}</span>
                      </div>
                      <button type="button" className="cat-btn cat-btn--ghost" onClick={() => restore(t)}>
                        Restaurer
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {preview && <Preview section={preview} onClose={() => setPreview(null)} onMessage={setMessage} />}
    </div>
    </HoverPreviewProvider>
  );
}
