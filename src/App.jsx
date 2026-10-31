import { useEffect, useMemo, useRef, useState } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { sections } from "./engine/sections.js";
import { buildPuckConfig } from "./engine/puck-config.jsx";
import { normalizeProps } from "./engine/render.js";
import { FullscreenButton } from "./library-ui.jsx";
import { LeftPanel } from "./left-ui.jsx";
import { RewriteButton } from "./copy-ui.jsx";
import { StudioButton } from "./studio-ui.jsx";
import { BoardButton } from "./board-ui.jsx";
import { LanguageSwitch } from "./lang-ui.jsx";
import { DesignSelect, NewDesignButton } from "./design-ui.jsx";
import { ProposalsBanner } from "./proposals-ui.jsx";
import { PreviewBarLanguage, TopbarTools, UndoRedo, FloatingViewportBar } from "./topbar-ui.jsx";
import { DownloadHtmlButton, HistoryButton, RebrandButton } from "./tools-ui.jsx";
import { MirrorButton } from "./mirror-ui.jsx";
import { OriginalSwitch } from "./original-ui.jsx";
import { Inspector } from "./inspector-ui.jsx";
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
    // Zoom du navigateur (Ctrl + / Ctrl -) : les menus gardent leur taille.
    // devicePixelRatio suit le zoom ; on compense avec la variable --atl-ui-zoom,
    // appliquée en CSS (zoom:) aux menus ancrés aux bords, et en division des
    // coordonnées pour les menus positionnés par JS (barre flottante, clic droit).
    const baseRatio = window.devicePixelRatio || 1;
    const syncUiZoom = () => {
      const z = (window.devicePixelRatio || 1) / baseRatio;
      const comp = Math.abs(1 - 1 / z) < 0.03 ? 1 : 1 / z;
      document.documentElement.style.setProperty("--atl-ui-zoom", String(comp));
    };
    syncUiZoom();
    window.addEventListener("resize", syncUiZoom);
    return () => window.removeEventListener("resize", syncUiZoom);
  }, []);

  useEffect(() => {
    if (!pageName) return; // redirection en cours (voir plus haut)
    try {
      localStorage.setItem("atl-last-page", pageName); // « page courante » du catalogue
    } catch {}
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
            <NewDesignButton />
          </div>
          <OriginalSwitch
            importSource={data?.root?.props?.importSource ?? null}
            pageName={pageName}
            projet={data?.root?.props?.projet ?? null}
            pages={pages}
            getData={() => latest.current ?? data}
          />
        </div>
        {/* Écrans, langue, HTML, Shopify, Publish : rendus par Puck (topbar-ui). */}
        <div id="atl-topbar-tools" />
        {status && <span className={status.error ? "atl-topbar__error" : "atl-topbar__ok"}>{status.text}</span>}
      </div>
      {data && <ProposalsBanner pageName={pageName} proposals={data.root?.props?.propositionsImport} />}
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
            // Colonne de gauche : rail d'outils (Structure, Ajouter, Palette,
            // Régénérer, Rebrand, Score). Remplace « Blocks » et « Outline » de Puck.
            { name: "blocks", label: "Outils", icon: <span className="atl-plugin-icon">▤</span>, render: LeftPanel },
            { name: "outline", label: "Outils", icon: <span className="atl-plugin-icon">▤</span>, render: LeftPanel },
          ]}
          overrides={{
            fields: Inspector,
            headerActions: ({ children }) => (
              <>
                {/* Contenu de la page, puis outils de la page. */}
                {/* Rebrand, Réécrire et Studio s'ouvrent depuis le rail de gauche. */}
                <RebrandButton hidden />
                <RewriteButton hidden />
                <StudioButton hidden />
                <BoardButton />
                {/* Catalogue et Historique sont en bas du rail de gauche. */}
                <HistoryButton hidden />
                <FullscreenButton />
                {/* Annuler / Rétablir : dans la barre de l'aperçu. */}
                <UndoRedo />
                {/* Barre de l'aperçu → pilule flottante en bas (plein écran). */}
                <FloatingViewportBar />
                {/* Une seule barre en haut : ces outils s'affichent à côté de Projet / Page / Design. */}
                {/* EN / FR : dans la barre de l'aperçu, avant les écrans (ceux de Puck). */}
                <PreviewBarLanguage>
                  <LanguageSwitch />
                </PreviewBarLanguage>
                <TopbarTools>
                  <span className="atl-publish">
                    <DownloadHtmlButton />
                    <MirrorButton />
                    {children}
                  </span>
                </TopbarTools>
              </>
            ),
          }}
        />
      )}
    </>
  );
}
