import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { FAMILIES, familyOf } from "./engine/families.js";
import { sections } from "./engine/sections.js";
import { applyDesign } from "./engine/design.js";
import { designById } from "./engine/designs.js";

const sectionsById = Object.fromEntries(sections.map((s) => [s.id, s]));
import { IconCollapse, IconExpand } from "./icons.jsx";

export const ROOT_ZONE = "root:default-zone";
const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
export const usePuckSelect = createUsePuck();

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

export function Thumb({ section, large = false }) {
  return (
    <span className={`atl-thumb${large ? " atl-thumb--large" : ""}`}>
      {section?.thumbnail ? (
        <img src={section.thumbnail} alt="" loading="lazy" />
      ) : (
        <span className="atl-thumb__empty">Pas de miniature</span>
      )}
    </span>
  );
}

// Fait défiler l'aperçu jusqu'à la section (identifiée par son id Puck).
// L'aperçu de Puck est une iframe de hauteur fixe dont la page défile à
// l'intérieur : on fait défiler sa fenêtre jusqu'à la section.
export function scrollCanvasTo(id) {
  for (const frame of document.querySelectorAll("iframe")) {
    const el = frame.contentDocument?.querySelector(`[data-atl-id="${CSS.escape(id)}"]`);
    if (!el) continue;
    const win = frame.contentWindow;
    win.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + win.scrollY - 20), behavior: "smooth" });
    return;
  }
}

// Onglets « Sections / Ajouter / Score » en haut de la colonne de gauche (remplacent
// la barre d'icônes verticale de Puck, masquée en CSS).
export function PanelTabs() {
  const current = usePuckSelect((s) => s.appState.ui.plugin?.current ?? "blocks");
  const dispatch = usePuckSelect((s) => s.dispatch);
  const tabs = [
    { name: "blocks", label: "Sections" },
    { name: "outline", label: "+ Ajouter" },
    { name: "score", label: "Score" },
  ];
  return (
    <div className="atl-panel-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          type="button"
          role="tab"
          key={t.name}
          aria-selected={current === t.name}
          className={current === t.name ? "is-on" : ""}
          onClick={() => dispatch({ type: "setUi", ui: { plugin: { current: t.name } } })}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Colonne de gauche : uniquement les sections de la page ouverte.
export function PageSections() {
  const content = usePuckSelect((s) => s.appState.data.content);
  const selectedId = usePuckSelect((s) => s.selectedItem?.props?.id ?? null);
  const dispatch = usePuckSelect((s) => s.dispatch);
  const listRef = useRef(null);

  // Section choisie dans l'aperçu : on la montre aussi dans la liste.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-item="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  function select(index, id) {
    dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
    setTimeout(() => scrollCanvasTo(id), 60);
  }

  function move(index, delta, id) {
    const to = index + delta;
    if (to < 0 || to >= content.length) return;
    dispatch({ type: "reorder", sourceIndex: index, destinationIndex: to, destinationZone: ROOT_ZONE });
    dispatch({ type: "setUi", ui: { itemSelector: { index: to, zone: ROOT_ZONE } } });
    setTimeout(() => scrollCanvasTo(id), 60);
  }

  return (
    <div className="atl-page-sections" ref={listRef}>
      <PanelTabs />
      <div className="atl-page-sections__head">
        <span>Sections de la page</span>
        <em>{content.length}</em>
      </div>
      {content.length === 0 && <p className="atl-page-sections__empty">Page vide. Ajoute une première section.</p>}
      <ol>
        {content.map((item, index) => {
          const section = byId[item.type];
          const id = item.props.id;
          const active = id === selectedId;
          return (
            <li key={id} data-item={id} className={active ? "is-active" : ""}>
              <button type="button" className="atl-page-sections__item" onClick={() => select(index, id)}>
                <Thumb section={section} />
                <span className="atl-page-sections__label">
                  <b>{index + 1}</b> {section?.meta.label?.split(" — ")[0] ?? item.type}
                  <small>{section?.meta.label?.split(" — ")[1] ?? ""}</small>
                </span>
              </button>
              <span className="atl-page-sections__tools">
                <button type="button" title="Monter" disabled={index === 0} onClick={() => move(index, -1, id)}>
                  ↑
                </button>
                <button type="button" title="Descendre" disabled={index === content.length - 1} onClick={() => move(index, 1, id)}>
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="atl-page-sections__add">
        <AddSectionButton variant="block" />
      </div>
    </div>
  );
}

// Bouton « Plein écran » : masque les panneaux de gauche et de droite et la
// barre du haut ; Échap ou le même bouton pour revenir.
export function FullscreenButton() {
  const getPuck = useGetPuck();
  const [on, setOn] = useState(false);

  function toggle(next) {
    getPuck().dispatch({ type: "setUi", ui: { leftSideBarVisible: !next, rightSideBarVisible: !next } });
    document.body.classList.toggle("atl-fullscreen", next);
    setOn(next);
  }

  useEffect(() => {
    if (!on) return;
    const onKey = (e) => e.key === "Escape" && toggle(false);
    window.addEventListener("keydown", onKey);
    // Échap pressé alors que le curseur est dans l'aperçu (iframe).
    const frames = [...document.querySelectorAll("iframe")];
    frames.forEach((f) => f.contentWindow?.addEventListener("keydown", onKey));
    return () => {
      window.removeEventListener("keydown", onKey);
      frames.forEach((f) => f.contentWindow?.removeEventListener("keydown", onKey));
    };
  }, [on]);

  // Le bouton se place dans la barre de l'aperçu (tailles d'écran, zoom) de
  // Puck, qui n'a pas d'emplacement prévu : on attend qu'elle existe.
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    const find = () => document.querySelector('[class*="ViewportControls-actionsInner"]');
    if (find()) return setSlot(find());
    const obs = new MutationObserver(() => find() && (setSlot(find()), obs.disconnect()));
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  const button = (
    <>
      <span className="atl-viewport-divider" />
      <button type="button" className={`atl-viewport-btn${on ? " is-on" : ""}`} onClick={() => toggle(!on)} title={on ? "Quitter le plein écran (Échap)" : "Voir le site en plein écran"}>
        {on ? <IconCollapse /> : <IconExpand />}
        {on ? "Quitter" : "Plein écran"}
      </button>
    </>
  );
  return slot ? createPortal(button, slot) : null;
}

// Sections proposées (non masquées), regroupées par famille.
function groupedSections() {
  const grouped = Object.fromEntries(FAMILIES.map((f) => [f.id, []]));
  for (const s of sections.filter((x) => x.meta.status !== "masquee" && !x.meta.pageSpecific)) (grouped[familyOf(s).id] ??= []).push(s);
  return grouped;
}

// Insère une section après la section sélectionnée (ou en fin de page),
// la sélectionne et fait défiler l'aperçu jusqu'à elle.
export function insertSection(getPuck, type) {
  const { appState, selectedItem, getSelectorForId, dispatch } = getPuck();
  const selector = selectedItem ? getSelectorForId(selectedItem.props.id) : null;
  const index = selector && selector.zone === ROOT_ZONE ? selector.index + 1 : appState.data.content.length;
  dispatch({ type: "insert", componentType: type, destinationIndex: index, destinationZone: ROOT_ZONE });
  // La page a un design.md : la section ajoutée prend tout de suite ses couleurs
  // (rôles déclarés dans meta.designRoles) ; les polices viennent déjà de la page.
  const design = designById[appState.data.root?.props?.design];
  const added = getPuck().appState.data.content[index];
  if (design && added) {
    const { page } = applyDesign({ root: {}, content: [added] }, design, sectionsById);
    dispatch({ type: "replace", destinationIndex: index, destinationZone: ROOT_ZONE, data: page.content[0] });
  }
  dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
  setTimeout(() => {
    const added = getPuck().appState.data.content[index];
    if (added) scrollCanvasTo(added.props.id);
  }, 150);
}

// Onglet « Ajouter » de la colonne de gauche : familles, puis modèles.
export function LibraryPanel() {
  const getPuck = useGetPuck();
  const hasSelection = usePuckSelect((s) => !!s.selectedItem);
  const [family, setFamily] = useState(null);
  const grouped = groupedSections();
  const current = family ? FAMILIES.find((f) => f.id === family) : null;

  return (
    <div className="atl-library">
      <PanelTabs />
      <div className="atl-page-sections__head">
        {current ? (
          <button type="button" className="atl-library__back" onClick={() => setFamily(null)}>
            ← Familles
          </button>
        ) : (
          <span>Ajouter une section</span>
        )}
      </div>
      <p className="atl-library__where">{hasSelection ? "Ajout après la section sélectionnée" : "Ajout à la fin de la page"}</p>
      {!current ? (
        <ul className="atl-library__families">
          {FAMILIES.map((f) => {
            const n = grouped[f.id]?.length ?? 0;
            return (
              <li key={f.id}>
                <button type="button" disabled={!n} onClick={() => setFamily(f.id)}>
                  <span>{f.label}</span>
                  <em>{n}</em>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <p className="atl-library__title">{current.label}</p>
          <ol className="atl-library__variants">
            {grouped[current.id].map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => insertSection(getPuck, s.id)} title="Ajouter à la page">
                  <Thumb section={s} />
                  <span>{s.meta.label?.split(" — ")[1] ?? s.meta.label}</span>
                  <small>{hostOf(s.meta.source?.url) ?? "Modèle de base"}</small>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

// Bouton « + Ajouter une section » : familles, puis variantes de la famille.
export function AddSectionButton({ variant = "header" }) {
  const getPuck = useGetPuck();
  const [open, setOpen] = useState(false);
  const [family, setFamily] = useState(null);
  const [where, setWhere] = useState({ index: 0, afterSelected: false });

  const grouped = Object.fromEntries(FAMILIES.map((f) => [f.id, []]));
  // Les sections masquées dans le catalogue ne sont pas proposées.
  for (const s of sections.filter((x) => x.meta.status !== "masquee")) (grouped[familyOf(s).id] ??= []).push(s);

  function openDialog() {
    const { appState, selectedItem, getSelectorForId } = getPuck();
    const selector = selectedItem ? getSelectorForId(selectedItem.props.id) : null;
    const afterSelected = !!selector && selector.zone === ROOT_ZONE;
    setWhere({ index: afterSelected ? selector.index + 1 : appState.data.content.length, afterSelected });
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setFamily(null);
  }

  function insert(id) {
    const { dispatch } = getPuck();
    dispatch({ type: "insert", componentType: id, destinationIndex: where.index, destinationZone: ROOT_ZONE });
    dispatch({ type: "setUi", ui: { itemSelector: { index: where.index, zone: ROOT_ZONE } } });
    close();
    setTimeout(() => {
      const added = getPuck().appState.data.content[where.index];
      if (added) scrollCanvasTo(added.props.id);
    }, 120);
  }

  const current = family ? FAMILIES.find((f) => f.id === family) : null;

  return (
    <>
      <button type="button" className={variant === "block" ? "atl-add-btn atl-add-btn--block" : "atl-add-btn"} onClick={openDialog}>
        + Ajouter une section
      </button>
      {open &&
        createPortal(
          <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <div className="atl-modal__panel">
              <header className="atl-modal__head">
                {current ? (
                  <button type="button" className="atl-modal__back" onClick={() => setFamily(null)}>
                    ← Familles
                  </button>
                ) : null}
                <h2>{current ? current.label : "Ajouter une section"}</h2>
                <span className="atl-modal__where">
                  {where.afterSelected ? "Sera ajoutée après la section sélectionnée" : "Sera ajoutée à la fin de la page"}
                </span>
                <button type="button" className="atl-modal__close" onClick={close} aria-label="Fermer">
                  ×
                </button>
              </header>

              {!current ? (
                <div className="atl-modal__grid atl-modal__grid--families">
                  {FAMILIES.map((f) => {
                    const list = grouped[f.id] ?? [];
                    return (
                      <button
                        type="button"
                        key={f.id}
                        className={`atl-family${list.length ? "" : " atl-family--empty"}`}
                        disabled={!list.length}
                        onClick={() => setFamily(f.id)}
                      >
                        <Thumb section={list[0]} />
                        <strong>{f.label}</strong>
                        <span className="atl-family__count">
                          {list.length
                            ? `${list.length} modèle${list.length > 1 ? "s" : ""}`
                            : "Aucun modèle — à ajouter depuis le catalogue"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="atl-modal__grid">
                  {(grouped[current.id] ?? []).map((s) => (
                    <button type="button" key={s.id} className="atl-variant" onClick={() => insert(s.id)}>
                      <Thumb section={s} large />
                      <strong>{s.meta.label ?? s.schema.name}</strong>
                      <span className="atl-family__count">
                        {hostOf(s.meta.source?.url) ? `Inspirée de ${hostOf(s.meta.source.url)}` : "Modèle de base"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// En-tête du panneau de droite quand une section est sélectionnée : son nom,
// sa famille, et les actions (monter, descendre, dupliquer, supprimer).
export function FieldsPanel({ children, itemSelector }) {
  const getPuck = useGetPuck();
  const content = usePuckSelect((s) => s.appState.data.content);
  const selected = usePuckSelect((s) => s.selectedItem);
  const inRoot = itemSelector && itemSelector.zone === ROOT_ZONE;
  const index = inRoot ? itemSelector.index : -1;
  const section = selected ? byId[selected.type] : null;

  function run(action, nextIndex) {
    const { dispatch } = getPuck();
    dispatch(action);
    if (nextIndex === null) return dispatch({ type: "setUi", ui: { itemSelector: null } });
    dispatch({ type: "setUi", ui: { itemSelector: { index: nextIndex, zone: ROOT_ZONE } } });
    setTimeout(() => {
      const item = getPuck().appState.data.content[nextIndex];
      if (item) scrollCanvasTo(item.props.id);
    }, 80);
  }

  if (!section || !inRoot) return <>{children}</>;
  const [name, variant] = (section.meta.label ?? section.id).split(" — ");
  return (
    <div className="atl-fields">
      <div className="atl-fields__head">
        <Thumb section={section} />
        <div className="atl-fields__title">
          <b>{name}</b>
          <small>
            {familyOf(section).label}
            {variant ? ` · ${variant}` : ""}
          </small>
        </div>
        <div className="atl-fields__actions">
          <button type="button" title="Monter" disabled={index === 0} onClick={() => run({ type: "reorder", sourceIndex: index, destinationIndex: index - 1, destinationZone: ROOT_ZONE }, index - 1)}>
            ↑
          </button>
          <button
            type="button"
            title="Descendre"
            disabled={index === content.length - 1}
            onClick={() => run({ type: "reorder", sourceIndex: index, destinationIndex: index + 1, destinationZone: ROOT_ZONE }, index + 1)}
          >
            ↓
          </button>
          <button type="button" title="Dupliquer" onClick={() => run({ type: "duplicate", sourceIndex: index, sourceZone: ROOT_ZONE }, index + 1)}>
            ⧉
          </button>
          <button
            type="button"
            title="Supprimer la section"
            className="is-danger"
            onClick={() => confirm(`Supprimer la section « ${name} » de la page ?`) && run({ type: "remove", index, zone: ROOT_ZONE }, null)}
          >
            🗑
          </button>
        </div>
      </div>
      {children}
      <button
        type="button"
        className="atl-fields__remove"
        onClick={() => confirm(`Supprimer la section « ${name} » de la page ?`) && run({ type: "remove", index, zone: ROOT_ZONE }, null)}
      >
        Supprimer la section
      </button>
    </div>
  );
}
