import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createUsePuck, useGetPuck } from "@puckeditor/core";

const usePuckSelect = createUsePuck();

// Les outils de l'éditeur (annuler, écrans, langue, HTML, Shopify, Publish)
// sont rendus par Puck dans son en-tête (overrides.headerActions) mais
// affichés dans la barre du haut, à côté de Projet / Page / Design : une seule
// barre au lieu de deux. Le portail garde le contexte de Puck.
export function TopbarTools({ children }) {
  const [slot, setSlot] = useState(null);
  useEffect(() => setSlot(document.getElementById("atl-topbar-tools")), []);
  return slot ? createPortal(<div className="atl-tools">{children}</div>, slot) : null;
}

// Une place dans la barre de l'aperçu (Original / Modifiable, écrans, zoom).
// La barre est en flex : `order` (CSS) range les éléments ajoutés.
function usePreviewBarSlot(className) {
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    let host = null;
    const attach = () => {
      const bar = document.querySelector('[class*="ViewportControls-actionsInner"]');
      if (!bar) return false;
      host = document.createElement("span");
      host.className = className;
      bar.append(host);
      setSlot(host);
      return true;
    };
    if (attach()) return () => host?.remove();
    const timer = setInterval(() => attach() && clearInterval(timer), 300);
    return () => (clearInterval(timer), host?.remove());
  }, [className]);
  return slot;
}

// État de l'enregistrement, toujours visible au bout de la barre de l'aperçu
// (audit T7, 2026-11-17 : avant, il était dans la barre du haut, cachée).
export function PreviewBarSave({ children }) {
  const slot = usePreviewBarSlot("atl-save-host");
  return slot ? createPortal(children, slot) : null;
}

// EN / FR dans la barre de l'aperçu, juste avant les écrans.
export function PreviewBarLanguage({ children }) {
  const slot = usePreviewBarSlot("atl-lang-host");
  return slot ? createPortal(children, slot) : null;
}

// La barre de l'aperçu (Original / Modifiable, EN / FR, écrans, zoom, annuler)
// devient une pilule flottante en bas de l'écran : elle est cachée, une
// languette en bas au centre la fait apparaître au survol (plein écran).
export function FloatingViewportBar() {
  useEffect(() => {
    const bar = () => document.querySelector('[class^="_ViewportControls_"]');
    const add = () => {
      const b = bar();
      if (b && !b.classList.contains("atl-vpbar")) b.classList.add("atl-vpbar");
    };
    add();
    const obs = new MutationObserver(add);
    obs.observe(document.body, { childList: true, subtree: true });
    // Zone de survol FIXE au bas de l'écran : contrairement à la languette
    // CSS, elle ne bouge pas quand la pilule monte, donc plus de vibration.
    const zone = document.createElement("div");
    zone.className = "atl-vpzone";
    let timer = null;
    zone.addEventListener("mouseenter", () => {
      clearTimeout(timer);
      bar()?.classList.add("is-up");
    });
    zone.addEventListener("mouseleave", () => {
      timer = setTimeout(() => {
        const b = bar();
        // Ne pas replier si la souris est passée sur la pilule elle-même.
        if (b && !b.matches(":hover")) b.classList.remove("is-up");
      }, 150);
    });
    document.body.append(zone);
    return () => {
      obs.disconnect();
      zone.remove();
    };
  }, []);
  return null;
}

// Annuler / Rétablir (remplace ceux de l'en-tête de Puck, masqué), placés
// dans la barre de l'aperçu (Original / Modifiable, zoom) pour libérer la
// barre du haut.
export function UndoRedo() {
  const getPuck = useGetPuck();
  const hasPast = usePuckSelect((s) => s.history.hasPast);
  const hasFuture = usePuckSelect((s) => s.history.hasFuture);
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    const find = () => document.querySelector('[class*="ViewportControls-actionsInner"]');
    if (find()) return setSlot(find());
    const timer = setInterval(() => find() && (setSlot(find()), clearInterval(timer)), 300);
    return () => clearInterval(timer);
  }, []);
  if (!slot) return null;
  return createPortal(
    <div className="atl-undo" role="group" aria-label="Historique des modifications">
      <button type="button" disabled={!hasPast} onClick={() => getPuck().history.back()} title="Annuler (Ctrl+Z)" aria-label="Annuler">
        ↶
      </button>
      <button type="button" disabled={!hasFuture} onClick={() => getPuck().history.forward()} title="Rétablir (Ctrl+Y)" aria-label="Rétablir">
        ↷
      </button>
    </div>,
    slot,
  );
}
