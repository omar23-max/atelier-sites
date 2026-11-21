// Zoom de la page seule (2026-11-21) : Ctrl + molette et Ctrl + / Ctrl −
// zooment l'aperçu (boutons de zoom de Puck) au lieu du zoom du navigateur,
// qui agrandissait aussi les menus. Ctrl + 0 reste au navigateur (pour
// revenir à 100 % si les menus ont déjà été agrandis). Le Canvas garde son
// propre zoom (Excalidraw).
import { useEffect } from "react";

export function ZoomPage() {
  useEffect(() => {
    let last = 0;
    const inCanvas = () => !!document.querySelector(".excalidraw");
    const step = (dir) => {
      const b = document.querySelector(`button[aria-label="${dir > 0 ? "Zoom viewport in" : "Zoom viewport out"}"]`);
      if (b && !b.disabled && !/disabled/.test(b.className)) b.click();
    };
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey) || inCanvas()) return;
      e.preventDefault();
      const now = Date.now();
      if (now - last < 140) return;
      last = now;
      step(e.deltaY < 0 ? 1 : -1);
    };
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || inCanvas()) return;
      const out = e.key === "-" || e.key === "_" || e.code === "NumpadSubtract";
      const inn = e.key === "+" || e.key === "=" || e.code === "NumpadAdd";
      if (!out && !inn) return;
      e.preventDefault();
      step(inn ? 1 : -1);
    };
    const wins = new Set();
    const attach = (w) => {
      if (!w || wins.has(w)) return;
      wins.add(w);
      w.addEventListener("wheel", onWheel, { passive: false, capture: true });
      w.addEventListener("keydown", onKey, true);
    };
    attach(window);
    // L'aperçu est une iframe (rechargée parfois) : on s'y accroche aussi.
    const scan = () => {
      for (const f of document.querySelectorAll("iframe")) {
        try {
          attach(f.contentWindow);
        } catch {
          // iframe d'un autre site : ignorée
        }
      }
    };
    scan();
    const t = setInterval(scan, 1000);
    return () => {
      clearInterval(t);
      for (const w of wins) {
        try {
          w.removeEventListener("wheel", onWheel, { capture: true });
          w.removeEventListener("keydown", onKey, true);
        } catch {}
      }
    };
  }, []);
  return null;
}
