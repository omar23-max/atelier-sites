import { Component, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { sections, sectionsIndex } from "./engine/sections.js";
import { buildPuckConfig } from "./engine/puck-config.jsx";
import { normalizeProps } from "./engine/render.js";
import { FullscreenButton, RightPanelTab, RetourPosition } from "./library-ui.jsx";
import { StyletButton } from "./stylet-ui.jsx";
import { ZoomPage } from "./zoom-page.jsx";
import { SlotPicker } from "./slot-picker.jsx";
import { LeftPanel } from "./left-ui.jsx";
import { RewriteButton } from "./copy-ui.jsx";
import { StudioButton } from "./studio-ui.jsx";
import { CanvasButton } from "./canvas-ui.jsx";
import { LanguageSwitch } from "./lang-ui.jsx";
// Plus de boutons « + » (projet, page, design) dans la barre : on les crée
// depuis le projet, dans le catalogue (2026-11-08).
import { ProposalsBanner } from "./proposals-ui.jsx";
import { WorkspaceSwitch } from "./workspace-switch.jsx";
import { PreviewBarLanguage, PreviewBarProject, RailProject, PreviewBarSave, TopbarTools, UndoRedo, FloatingViewportBar, PreviewBarMenu } from "./topbar-ui.jsx";
import { DownloadHtmlButton, DownloadZipButton, HistoryButton, RebrandButton } from "./tools-ui.jsx";
import { MirrorButton } from "./mirror-ui.jsx";
import { OriginalSwitch } from "./original-ui.jsx";
import { TrialHost } from "./trial-ui.jsx";
import { CharteKeeper } from "./charte-keeper.jsx";
import { Inspector, ProjectBrandSync } from "./inspector-ui.jsx";
import { ClosePageButton, DeletePageButton, OrphanBanner, PageCrumb, ProjectsMenu, useProjectsAndTemplates } from "./pages-ui.jsx";

// Chaque page est un fichier pages/<nom>.json, ouvert avec ?page=<nom>.
// « Enregistrer » (automatique, ou Ctrl + S) écrit dans ce fichier : c'est lui que lisent les exports.
const pageName = new URLSearchParams(location.search).get("page");

// Sans page demandée : le catalogue des projets. On n'ouvre plus une autre
// page au hasard (elles « réapparaissaient » après une suppression).
if (!pageName) location.replace("/catalogue.html#projets");
const EMPTY_PAGE = { root: { props: { title: "Nouvelle page" } }, content: [] };

function withDefaults(data) {
  const byId = sectionsIndex;
  return {
    ...data,
    content: (data.content ?? []).map((item, i) => {
      const section = byId[item.type];
      const props = { id: `${item.type}-${i}`, ...item.props };
      return section ? { ...item, props: normalizeProps(section, props) } : item;
    }),
  };
}

// Version de la page chargée / enregistrée par cet éditeur (en-tête ETag) :
// renvoyée à chaque enregistrement pour détecter une autre version (T3).
let pageRev = null;
async function loadPage() {
  const res = await fetch(`/api/pages/${pageName}`);
  pageRev = res.headers.get("ETag");
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
  // Section neuve (retravail IA, 2026-11-16) : la config de Puck est
  // complétée. Correctif du 2026-11-18 : Puck 0.23 ne relit sa config que si on
  // lui en passe une NOUVELLE (il la recopie dans son store quand l'objet
  // change) ; modifier l'ancienne en place laissait « No configuration for
  // <section>-ia-… » et la section retravaillée n'apparaissait pas.
  const [config, setConfig] = useState(() => buildPuckConfig(sections));
  const sectionsAddedWaiting = useRef([]);
  useEffect(() => {
    const on = (e) => {
      const fresh = buildPuckConfig(sections);
      const added = {};
      for (const id of e.detail?.ids ?? []) if (fresh.components[id]) added[id] = fresh.components[id];
      if (e.detail?.resolve) sectionsAddedWaiting.current.push(e.detail.resolve);
      setConfig((c) => ({ ...c, components: { ...c.components, ...added } }));
    };
    window.addEventListener("atl-sections-added", on);
    return () => window.removeEventListener("atl-sections-added", on);
  }, []);
  // Les effets des enfants (Puck recopie la config) passent avant celui-ci.
  useEffect(() => {
    const waiting = sectionsAddedWaiting.current.splice(0);
    waiting.forEach((resolve) => resolve());
  }, [config]);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [pages, setPages] = useState([]);
  // Dernier état de la page dans l'éditeur (pour l'enregistrer avant d'appliquer un design).
  const latest = useRef(null);
  const { projects } = useProjectsAndTemplates();
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
  // Sections utilisées par la page ouverte (bandeau « modifiée ailleurs », engine/sections.js).
  window.__atlPageTypes = () => ((latest.current ?? dataRef.current)?.content ?? []).map((c) => c.type);
  const savedJson = useRef(null);
  const saveTimer = useRef(null);
  const saving = useRef(false);
  const isDirty = () => Boolean(latest.current) && JSON.stringify(latest.current) !== savedJson.current;

  const savePage = useCallback(async function savePage(next = latest.current ?? dataRef.current) {
    clearTimeout(saveTimer.current);
    if (!next || window.__atlPageDeleted) return; // page mise à la corbeille : ne pas la recréer
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
      const res = await fetch(`/api/pages/${pageName}`, { method: "PUT", headers: { "Content-Type": "application/json", ...(pageRev ? { "If-Match": pageRev } : {}) }, body: json });
      const body = await res.json();
      if (res.status === 409 && body.conflit) {
        saveStore.set("error");
        setConflict(true);
        return;
      }
      if (!res.ok) throw new Error(body.error);
      pageRev = res.headers.get("ETag") ?? body.rev ?? pageRev;
      setConflict(false);
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
    // Essai d'un style en cours (trial-ui.jsx) : rien n'est enregistré.
    if (window.__atlTrial) return;
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
      if (window.__atlPageDeleted || (!isDirty() && !saving.current)) return;
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

  // Conflit d'écriture (T3) : la page a été modifiée dans un autre onglet ou
  // sur un autre appareil. Rien n'est écrasé sans le demander.
  const [conflict, setConflict] = useState(false);
  async function keepMine() {
    // L'autre version reste dans l'Historique (copie de sécurité d'abord).
    await fetch(`/api/pages/${pageName}/snapshot`, { method: "POST" }).catch(() => {});
    pageRev = null;
    setConflict(false);
    savePage();
  }

  // Barre unique (2026-11-17) : Projet et Page sont dans la barre de l'aperçu,
  // toujours visible ; plus de barre du haut à ouvrir par « Projet ▾ ».
  try {
    localStorage.removeItem("atl-topbar-pinned");
  } catch {}

  return (
    <>
      {/* Vues « originale + modifiée » et « ordinateur + téléphone » : icônes
          dans la barre de l'aperçu, après les écrans de Puck. */}
      <OriginalSwitch
        importSource={data?.root?.props?.importSource ?? null}
        pageName={pageName}
        projet={data?.root?.props?.projet ?? null}
        pages={pages}
        getData={() => latest.current ?? data}
      />
      {status && (
        <div className={`atl-status-toast${status.error ? " is-error" : ""}`} role="status">
          {status.text}
        </div>
      )}
      {conflict && (
        <div className="atl-conflict" role="alert">
          <b>Cette page a été modifiée ailleurs</b> (un autre onglet ou un autre appareil) depuis que tu l'as ouverte. Tes dernières modifications ne sont pas encore enregistrées.
          <span>
            <button type="button" onClick={keepMine}>
              Garder ma version
            </button>
            <button type="button" onClick={() => ((window.__atlPageDeleted = true), location.reload())}>
              Voir l'autre version
            </button>
          </span>
          <small>« Garder ma version » met d'abord l'autre dans l'Historique.</small>
        </div>
      )}
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
                <CanvasButton />
                {/* Page de projet : infos, produit et logo repris du projet. */}
                <ProjectBrandSync />
                {/* Choix d'un modèle pour un emplacement de section manquante. */}
                <SlotPicker />
                {/* Essai d'un design, d'une palette ou d'une charte avant de l'écrire. */}
                <TrialHost />
                {/* Charte : héritage par les nouvelles sections, rappel de la charte du projet. */}
                <CharteKeeper />
                {/* Catalogue et Historique sont en bas du rail de gauche. */}
                <HistoryButton hidden />
                <FullscreenButton />
                {/* Stylet : dessiner sur l'écran, capture pour l'IA (2026-11-18). */}
                <StyletButton />
                <ZoomPage />
                {/* Panneau de droite : seulement par la languette (2026-11-18). */}
                <RightPanelTab />
                {/* Retour au même endroit après un rechargement (2026-11-19). */}
                <RetourPosition />
                {/* Annuler / Rétablir : dans la barre de l'aperçu. */}
                <UndoRedo />
                {/* Barre de l'aperçu → pilule flottante en bas (plein écran). */}
                <FloatingViewportBar />
                {/* Une seule barre en haut : ces outils s'affichent à côté de Projet / Page / Design. */}
                {/* EN / FR : dans la barre de l'aperçu, avant les écrans (ceux de Puck). */}
                {/* Une seule ligne (2026-11-17) : Projet · Page au début de la barre. */}
                {/* 2026-11-22 : Projet ▾ et Page ▾ en haut du rail de gauche ;
                    en haut, Agents army · Studio · Canvas · Catalogue. */}
                <RailProject>
                  <ProjectsMenu current={pageName} pages={pages} projects={projects} />
                </RailProject>
                {/* 2026-11-24 (demande de l'utilisateur) : la page et son état
                    d'enregistrement au début de la barre, le menu des espaces au
                    bout ; HTML et ZIP dans « Télécharger » du rail de gauche ;
                    bouton Mirror (Mirror Studio hébergé) retiré de la barre. */}
                <PreviewBarProject>
                  <span className="atl-crumbbox">
                    <PageCrumb current={pageName} pages={pages} projects={projects} />
                    <ClosePageButton current={pageName} pages={pages} onSave={() => savePage()} />
                    <DeletePageButton current={pageName} pages={pages} />
                    <span className="atl-save-host atl-save-inline">
                      <SaveButton onSave={savePage} />
                    </span>
                  </span>
                </PreviewBarProject>
                <PreviewBarMenu>
                  <WorkspaceSwitch current="page" page={pageName} />
                </PreviewBarMenu>
              </>
            ),
          }}
        />
      )}
    </>
  );
}
