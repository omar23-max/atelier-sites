import { Component, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
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
// « Enregistrer » (automatique, ou Ctrl + S) écrit dans ce fichier : c'est lui que lisent les exports.
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

// État de l'enregistrement, partagé avec le bouton seul (voir App).
const saveStore = {
  state: "saved", // saved | dirty | saving | error
  subs: new Set(),
  set(next) {
    if (next === this.state) return;
    this.state = next;
    this.subs.forEach((f) => f());
  },
};

function SaveButton({ onSave }) {
  const [, redraw] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    saveStore.subs.add(redraw);
    return () => saveStore.subs.delete(redraw);
  }, []);
  const st = saveStore.state;
  return (
    <button
      type="button"
      className={`atl-save is-${st}`}
      onClick={() => onSave()}
      title="Enregistrement automatique après chaque modification · Ctrl + S pour enregistrer tout de suite"
    >
      {st === "saving" ? "Enregistrement…" : st === "dirty" ? "Enregistrer" : st === "error" ? "Réessayer" : "Enregistré ✓"}
    </button>
  );
}

// Panneau de droite : une erreur s'affiche (avec « Réessayer ») au lieu
// d'un panneau blanc et figé.
class PanelGuard extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[atelier] panneau de droite :", error, info?.componentStack);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="atl-panel-error">
        <b>Le panneau a rencontré une erreur.</b>
        <code>{String(error?.message ?? error).slice(0, 300)}</code>
        <button type="button" onClick={() => this.setState({ error: null })}>Réessayer</button>
        <button type="button" onClick={() => location.reload()}>Recharger la page</button>
      </div>
    );
  }
}
function SafeInspector(props) {
  return (
    <PanelGuard>
      <Inspector {...props} />
    </PanelGuard>
  );
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

  // ---- Enregistrement ----
  // Automatique 2 s après la dernière modification, tout de suite avec
  // Ctrl + S ou le bouton « Enregistrer ». Avertissement si on quitte la page
  // avant. (Le dossier pages/ n'est pas surveillé par Vite : enregistrer ne
  // recharge pas l'atelier ; l'Historique garde les versions précédentes.)
  // L'état du bouton vit hors de ce composant (saveStore) : redessiner App
  // redessine tout l'éditeur Puck (plusieurs secondes sur une grande page).
  const dataRef = useRef(null);
  dataRef.current = data;
  const savedJson = useRef(null);
  const saveTimer = useRef(null);
  const saving = useRef(false);
  const isDirty = () => Boolean(latest.current) && JSON.stringify(latest.current) !== savedJson.current;

  const savePage = useCallback(async function savePage(next = latest.current ?? dataRef.current) {
    clearTimeout(saveTimer.current);
    if (!next) return;
    const json = JSON.stringify(next);
    if (json === savedJson.current && saveStore.state !== "error") return saveStore.set("saved");
    if (saving.current) {
      // Un enregistrement en cours : on refera le point juste après.
      saveTimer.current = setTimeout(() => savePage(), 500);
      return;
    }
    saving.current = true;
    saveStore.set("saving");
    try {
      const res = await fetch(`/api/pages/${pageName}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: json });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      savedJson.current = json;
      saveStore.set(isDirty() ? "dirty" : "saved");
      setStatus((st) => (st?.error ? null : st));
      if (isDirty()) saveTimer.current = setTimeout(() => savePage(), 2000);
    } catch (e) {
      saveStore.set("error");
      setStatus({ error: true, text: `Échec de l'enregistrement : ${e.message}` });
    } finally {
      saving.current = false;
    }
  }, []);

  const onPageChange = useCallback((d) => {
    latest.current = d;
    if (savedJson.current == null) savedJson.current = JSON.stringify(dataRef.current);
    if (!isDirty()) return;
    saveStore.set("dirty");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePage(), 2000);
  }, []);

  // Ctrl + S (aussi dans l'aperçu, qui est un autre document) et
  // avertissement avant de quitter avec des modifications non enregistrées.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        savePage();
      }
    };
    const onLeave = (e) => {
      if (!isDirty() && !saving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("beforeunload", onLeave);
    let frameWin = null;
    const attach = () => {
      const w = [...document.querySelectorAll("iframe")].find((f) => f.contentDocument?.querySelector("[data-atl-id]"))?.contentWindow ?? null;
      if (w === frameWin) return;
      frameWin?.removeEventListener("keydown", onKey, true);
      frameWin = w;
      frameWin?.addEventListener("keydown", onKey, true);
    };
    const timer = setInterval(attach, 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("beforeunload", onLeave);
      frameWin?.removeEventListener("keydown", onKey, true);
    };
  }, []);

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
        {/* Écrans, langue, HTML, Mirror, Enregistrer : rendus par Puck (topbar-ui). */}
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
          onChange={onPageChange}
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
            fields: SafeInspector,
            headerActions: () => (
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
                    {/* Remplace « Publish » de Puck : il n'enregistrait que la page. */}
                    <SaveButton onSave={savePage} />
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
