// Ctrl+Z / Ctrl+Y toujours actifs (lot B, 2026-11-16).
// Puck ne déclenche son Annuler que s'il a vu la touche Ctrl enfoncée à part
// (suivi des touches tenues) : après un changement de fenêtre ou dans
// certains cas l'aperçu, Ctrl+Z ne faisait rien alors que l'historique était
// bon (le bouton ↶ marchait). Filet de sécurité : si personne n'a traité la
// touche, on clique les boutons ↶ / ↷ de la barre de l'aperçu.
// Dans un champ de saisie, Ctrl+Z reste l'annulation du texte.
function isTyping(t) {
  return Boolean(t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

function onKey(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
  const redo = e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey);
  const undo = e.code === "KeyZ" && !e.shiftKey;
  if (!undo && !redo) return;
  // Une fenêtre ouverte (Studio, Canvas…) gère ses propres annulations.
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  const btn = document.querySelector(undo ? 'button[title^="Annuler (Ctrl"]' : 'button[title^="Rétablir (Ctrl"]');
  if (!btn || btn.disabled) return;
  e.preventDefault();
  btn.click();
}

export function installUndoKeys() {
  window.addEventListener("keydown", onKey);
  // L'aperçu (iframe) : sa fenêtre à lui.
  const seen = new WeakSet();
  setInterval(() => {
    for (const f of document.querySelectorAll("iframe")) {
      let w = null;
      try {
        w = f.contentWindow;
        void w.document;
      } catch {
        continue;
      }
      if (w && !seen.has(w)) {
        seen.add(w);
        w.addEventListener("keydown", onKey);
      }
    }
  }, 1000);
}
