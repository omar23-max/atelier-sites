import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { listPages } from "../projects.js";

// Fenêtre d'aperçu commune (sections, designs), sur le modèle de celle des
// templates : barre du haut avec ← titre → (flèches du clavier aussi), les
// actions et ✕ ; Échap ou un clic à côté la ferme.
export const VIEWER_BAR = 56;

export function Viewer({ title, subtitle, position, onPrev, onNext, onClose, actions, notice, children }) {
  useEffect(() => {
    const before = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") return onClose();
      if (e.target.closest?.("input, textarea, select")) return;
      if (e.key === "ArrowLeft" && onPrev) (e.preventDefault(), onPrev());
      if (e.key === "ArrowRight" && onNext) (e.preventDefault(), onNext());
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [onPrev, onNext, onClose]);
  const width = Math.min(1280, window.innerWidth * 0.92);
  const height = window.innerHeight * 0.9;
  return createPortal(
    <div className="cat-pageview" onClick={onClose}>
      <div className="cat-pageview__box cat-viewer" style={{ width, height }} onClick={(e) => e.stopPropagation()}>
        <div className="cat-pv" style={{ height: VIEWER_BAR }}>
          <div className="cat-pv__nav">
            <button type="button" className="cat-pv__arrow" disabled={!onPrev} onClick={onPrev} title="Précédent (←)" aria-label="Précédent">
              ←
            </button>
            <span className="cat-pv__title" title={title}>
              <b>{title}</b>
              <small>
                {position}
                {subtitle ? ` · ${subtitle}` : ""}
              </small>
            </span>
            <button type="button" className="cat-pv__arrow" disabled={!onNext} onClick={onNext} title="Suivant (→)" aria-label="Suivant">
              →
            </button>
          </div>
          <div className="cat-pv__actions">{actions}</div>
          <button type="button" className="cat-pv__close" onClick={onClose} aria-label="Fermer l'aperçu" title="Fermer (Échap)">
            ✕
          </button>
        </div>
        <div className="cat-viewer__body" style={{ height: height - VIEWER_BAR }}>
          {children}
        </div>
        {notice && (
          <div className={`cat-pageview__bar${notice.error ? " is-error" : ""}`}>
            {notice.text} {notice.href && <a href={notice.href}>Ouvrir la page →</a>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Liste des pages, chargée une fois pour tout le catalogue.
let pagesCache = null;
export function usePages() {
  const [pages, setPages] = useState(pagesCache ?? []);
  useEffect(() => {
    if (pagesCache) return;
    let alive = true;
    listPages()
      .then((p) => ((pagesCache = p), alive && setPages(p)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return pages;
}

// Choix de la page qui reçoit (section) ou à laquelle on applique (design) :
// pages des projets d'abord, rangées par projet, puis les autres pages.
export function PageSelect({ value, onChange, placeholder = "Choisir la page…" }) {
  const pages = usePages();
  const byProject = new Map();
  const others = [];
  for (const p of pages) {
    if (p.projet) byProject.set(p.projet, [...(byProject.get(p.projet) ?? []), p]);
    else others.push(p);
  }
  const label = (p) => p.title || p.name;
  const known = !value || pages.some((p) => p.name === value);
  return (
    <select className="cat-pv__select" value={value ?? ""} onChange={(e) => onChange(e.target.value)} title={value ? `Page : ${value}` : placeholder}>
      <option value="">{placeholder}</option>
      {!known && <option value={value}>{value}</option>}
      {[...byProject].map(([projet, list]) => (
        <optgroup key={projet} label={`Projet ${projet}`}>
          {list.map((p) => (
            <option key={p.name} value={p.name}>
              {label(p)}
            </option>
          ))}
        </optgroup>
      ))}
      {others.length > 0 && (
        <optgroup label="Pages sans projet (templates, essais)">
          {others.map((p) => (
            <option key={p.name} value={p.name}>
              {label(p)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
