// Choix d'un modèle pour un emplacement de section manquante (2026-11-09).
// Ouvert par un clic sur un rectangle de l'aperçu (engine/missing-slots.jsx) :
// les modèles de la famille, du meilleur score de vente au plus faible ; le
// modèle choisi prend la place du rectangle. Sur une page d'angle, une section
// du socle se complète dans la page mère : on propose de l'ouvrir.
// Monté une fois dans l'éditeur (barre du haut de Puck), affiché dans la page
// principale (pas dans l'aperçu).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { sections } from "./engine/sections.js";
import { familyOf } from "./engine/families.js";
import { ROOT_ZONE, Thumb, scrollCanvasTo } from "./library-ui.jsx";
import { listTemplates, templateScore } from "./projects.js";
import { pageRole } from "./angle-zones.js";
import { slotStore, useSlotStore } from "./engine/missing-slots.jsx";

const visible = sections.filter((s) => s.meta.status !== "masquee" && !s.meta.pageSpecific);
const pageName = new URLSearchParams(location.search).get("page");

// Défile l'aperçu jusqu'au rectangle d'un rang et le fait clignoter.
export function showSlot(index) {
  let el = null;
  for (const frame of document.querySelectorAll("iframe")) {
    el = frame.contentDocument?.querySelector(`[data-atl-slot-index="${index}"]`);
    if (!el) continue;
    const win = frame.contentWindow;
    win.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + win.scrollY - 120), behavior: "smooth" });
    break;
  }
  slotStore.set({ flash: null });
  setTimeout(() => slotStore.set({ flash: index }), 30);
  setTimeout(() => slotStore.get().flash === index && slotStore.set({ flash: null }), 1800);
  return Boolean(el);
}

export function SlotPicker() {
  const getPuck = useGetPuck();
  const { picker, motherName } = useSlotStore();
  const [scores, setScores] = useState([]);

  // Rôle de la page dans son projet (mère, angle) : étiquettes Socle / Angle
  // et renvoi du socle vers la page mère.
  useEffect(() => {
    const root = getPuck().appState.data.root?.props ?? {};
    if (!pageName || !root.projet) return;
    pageRole(pageName, root)
      .then((r) => slotStore.set({ role: r.role, motherName: r.motherName }))
      .catch(() => {});
  }, [getPuck]);
  useEffect(() => {
    if (!picker || scores.length) return;
    listTemplates()
      .then((t) => setScores(t.map((x) => [x.id, templateScore(x)]).sort((a, b) => b[0].length - a[0].length)))
      .catch(() => {});
  }, [picker, scores.length]);

  if (!picker) return null;
  const close = () => slotStore.set({ picker: null });
  const score = (s) => scores.find(([id]) => s.id.startsWith(`${id}-`))?.[1] ?? -1;
  const models = visible.filter((s) => picker.families.includes(familyOf(s).id)).sort((a, b) => score(b) - score(a));

  function add(type) {
    const { dispatch } = getPuck();
    const index = picker.index;
    dispatch({ type: "insert", componentType: type, destinationIndex: index, destinationZone: ROOT_ZONE });
    dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
    close();
    setTimeout(() => {
      const added = getPuck().appState.data.content[index];
      if (added) scrollCanvasTo(added.props.id);
    }, 150);
  }

  return createPortal(
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="atl-modal__panel atl-slotpick">
        <div className="atl-modal__head">
          <h2>{picker.elsewhere ? `« ${picker.label} » : dans la page mère` : `Ajouter « ${picker.label} » ici`}</h2>
          <button type="button" className="atl-modal__close" onClick={close} aria-label="Fermer">
            ×
          </button>
        </div>
        <p className="atl-slotpick__why">
          {picker.why} <em>+{picker.gain} points</em>
        </p>
        {picker.elsewhere ? (
          <div className="atl-slotpick__elsewhere">
            <p>
              Cette section fait partie du <b>socle</b> : elle est la même pour tous les angles. Ajoute-la une fois dans la page mère,
              à cet endroit ; elle servira à toutes les pages d'angle.
            </p>
            {motherName ? (
              <a className="atl-btn" href={`/?page=${encodeURIComponent(motherName)}`} target="_blank" rel="noreferrer">
                Ouvrir la page mère « {motherName} » ↗
              </a>
            ) : (
              <p className="atl-muted">Aucune page mère trouvée pour ce type dans le projet.</p>
            )}
            <button type="button" className="atl-linkbtn" onClick={() => slotStore.set({ picker: { ...picker, elsewhere: false } })}>
              L'ajouter quand même dans cette page
            </button>
          </div>
        ) : models.length === 0 ? (
          <p className="atl-muted">
            Aucun modèle de cette famille dans le catalogue.{" "}
            <a href="/catalogue.html#enrichir" target="_blank" rel="noreferrer">
              En ajouter un ↗
            </a>
          </p>
        ) : (
          <>
            <p className="atl-muted">{models.length} modèle{models.length > 1 ? "s" : ""}, du meilleur score de vente au plus faible. Clique pour l'ajouter.</p>
            <div className="atl-slotpick__grid">
              {models.map((s) => (
                <button type="button" key={s.id} onClick={() => add(s.id)} title={s.meta.label}>
                  <Thumb section={s} />
                  <span>{s.meta.label?.split(" — ")[1] ?? s.meta.label}</span>
                  {score(s) >= 0 && <em>Vente {score(s)}</em>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
