import { useEffect, useMemo, useRef, useState } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { sections } from "./engine/sections.js";
import { buildPuckConfig } from "./engine/puck-config.jsx";
import { normalizeProps } from "./engine/render.js";
import { FieldsPanel, FullscreenButton, LibraryPanel, PageSections } from "./library-ui.jsx";
import { ScorePanel } from "./score-ui.jsx";
import { RewriteButton } from "./copy-ui.jsx";
import { StudioButton } from "./studio-ui.jsx";
import { DesignSelect } from "./design-ui.jsx";
import { CatalogueLink, DownloadHtmlButton, HistoryButton, RebrandButton } from "./tools-ui.jsx";
import { NewPageButton, NewProjectButton, OrphanBanner, PageSelect, ProjectSelect, useProjectsAndTemplates } from "./pages-ui.jsx";

// Chaque page est un fichier pages/<nom>.json, ouvert avec ?page=<nom>.
// « Publish » enregistre dans ce fichier : c'est lui que lisent les exports.
const pageName = new URLSearchParams(location.search).get("page");

// Sans page demandée : on ouvre la dernière page d'un projet, sinon le
// catalogue des projets (une page n'existe jamais hors projet).
if (!pageName) {
  fetch("/api/pages?details=1")
    .then((r) => r.json())
    .then((list) => {
      const first = list.find((p) => p.projet) ?? list.find((p) => p.importSource);
      location.replace(first ? `/?page=${first.name}` : "/catalogue.html#projets");
    })
    .catch(() => location.replace("/catalogue.html#projets"));
}
const EMPTY_PAGE = { root: { props: { title: "Nouvelle page" } }, content: [] };

function withDefaults(data) {
  const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
  return {
    ...data,
    content: (data.content ?? []).map((item, i) => {
      const section = byId[item.type];
      const props = { id: `${item.type}-${i}`, ...item.props };
      return section ? { ...item, props: normalizeProps(section, props) } : item;
    }),
  };
}

async function loadPage() {
  const res = await fetch(`/api/pages/${pageName}`);
  if (res.status === 404) return EMPTY_PAGE;
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

export default function App() {
  const config = useMemo(() => buildPuckConfig(sections), []);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [pages, setPages] = useState([]);
  // Dernier état de la page dans l'éditeur (pour l'enregistrer avant d'appliquer un design).
  const latest = useRef(null);
  const { projects, templates } = useProjectsAndTemplates();
  const invalid = sections.filter((s) => s.errors.length > 0);

  useEffect(() => {
    if (!pageName) return; // redirection en cours (voir plus haut)
    loadPage()
      .then((d) => setData(withDefaults(d)))
      .catch((e) => setStatus({ error: true, text: `Chargement impossible : ${e.message}` }));
    fetch("/api/pages?details=1")
      .then((r) => r.json())
      .then(setPages)
      .catch(() => {});
  }, []);

  async function savePage(next) {
    setStatus({ text: "Enregistrement…" });
    try {
      const res = await fetch(`/api/pages/${pageName}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setStatus({ text: `Enregistré dans ${body.file}` });
    } catch (e) {
      setStatus({ error: true, text: `Échec de l'enregistrement : ${e.message}` });
    }
  }

  return (
    <>
      <div className="atl-topbar">
        {/* Trois blocs de même taille : projet, page, design. */}
        <div className="atl-topbar__groups">
          <div className="atl-group">
            <ProjectSelect current={pageName} pages={pages} projects={projects} />
            <NewProjectButton pages={pages} projects={projects} templates={templates} />
          </div>
          <div className="atl-group">
            <PageSelect current={pageName} pages={pages} />
            <NewPageButton pages={pages} projects={projects} templates={templates} />
          </div>
          <div className="atl-group">
            <DesignSelect pageName={pageName} current={data?.root?.props?.design ?? null} getData={() => latest.current ?? data} />
          </div>
        </div>
        {status && <span className={status.error ? "atl-topbar__error" : "atl-topbar__ok"}>{status.text}</span>}
      </div>
      {data && pages.length > 0 && (
        <OrphanBanner pageName={pageName} info={pages.find((p) => p.name === pageName)} projects={projects} getData={() => latest.current ?? data} />
      )}
      {invalid.length > 0 && (
        <div className="atl-errors" role="alert">
          {invalid.map((s) => (
            <div key={s.id}>
              <strong>{s.id}</strong> : {s.errors.join(" ")}
            </div>
          ))}
        </div>
      )}
      {data && (
        <Puck
          config={config}
          data={data}
          onPublish={savePage}
          onChange={(d) => (latest.current = d)}
          viewports={[
            { width: 390, height: "auto", label: "Mobile", icon: "Smartphone" },
            { width: 768, height: "auto", label: "Tablette", icon: "Tablet" },
            { width: 1440, height: "auto", label: "Ordinateur", icon: "Monitor" },
          ]}
          plugins={[
            // Remplace le panneau « Blocks » de Puck : à gauche, seulement les
            // sections de la page ouverte (la librairie s'ouvre via « + Ajouter »).
            { name: "blocks", label: "Sections", icon: <span className="atl-plugin-icon">▤</span>, render: PageSections },
            // Remplace « Outline » (doublon) : la librairie par famille.
            { name: "outline", label: "Ajouter", icon: <span className="atl-plugin-icon">＋</span>, render: LibraryPanel },
            // Page Score : note de la page selon son type, sections manquantes.
            { name: "score", label: "Score", icon: <span className="atl-plugin-icon">◎</span>, render: ScorePanel },
          ]}
          overrides={{
            fields: FieldsPanel,
            headerActions: ({ children }) => (
              <>
                {/* Contenu de la page, puis outils de la page. */}
                <div className="atl-tools">
                  <RebrandButton />
                  <RewriteButton />
                  <StudioButton />
                </div>
                <div className="atl-tools atl-tools--plain">
                  <CatalogueLink />
                  <HistoryButton />
                  <DownloadHtmlButton />
                  <FullscreenButton />
                </div>
                <span className="atl-publish">{children}</span>
              </>
            ),
          }}
        />
      )}
    </>
  );
}
