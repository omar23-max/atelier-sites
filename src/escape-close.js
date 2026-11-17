// Échap ferme la fenêtre ouverte (lot B, 2026-11-16).
// Toutes les fenêtres de l'atelier ont la même forme : role="dialog"
// aria-modal="true" et un bouton « Fermer » (.atl-modal__close, .atl-cv__close
// ou aria-label « Fermer… »). Échap clique ce bouton dans la fenêtre du dessus
// (la dernière du document). Un bouton désactivé (travail en cours) n'est pas
// cliqué. Les menus qui gèrent déjà Échap eux-mêmes passent avant (ils
// arrêtent l'événement) ; le Canvas (Excalidraw) garde Échap pour ses outils.
function topDialog() {
  const all = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
  for (let i = all.length - 1; i >= 0; i--) {
    const d = all[i];
    if (d.offsetParent !== null || getComputedStyle(d).position === "fixed") return d;
  }
  return null;
}

function closeButtonOf(dialog) {
  return (
    dialog.querySelector(".atl-modal__close, .atl-cv__close") ??
    [...dialog.querySelectorAll('button[aria-label^="Fermer"]')].find((b) => !b.closest('[role="dialog"]') || b.closest('[role="dialog"]') === dialog) ??
    null
  );
}

function onKey(e) {
  if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
  if (e.target?.closest?.(".excalidraw")) return;
  const dialog = topDialog();
  if (!dialog) return;
  const btn = closeButtonOf(dialog);
  if (!btn || btn.disabled) return;
  e.preventDefault();
  e.stopPropagation();
  btn.click();
}

export function installEscapeClose() {
  document.addEventListener("keydown", onKey);
  // Après un clic dans l'aperçu, le clavier reste dans son iframe : on écoute
  // aussi les iframes de la même origine (aperçu Puck), posées au fil de l'eau.
  const seen = new WeakSet();
  setInterval(() => {
    for (const f of document.querySelectorAll("iframe")) {
      let d = null;
      try {
        d = f.contentDocument;
      } catch {}
      if (d && !seen.has(d)) {
        seen.add(d);
        d.addEventListener("keydown", onKey);
      }
    }
  }, 1000);
}
