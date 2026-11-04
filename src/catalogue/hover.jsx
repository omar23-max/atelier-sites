import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderSectionHtml } from "../engine/render.js";

const DELAY_MS = 450; // temps de survol avant l'ouverture de l'aperçu
const CLOSE_MS = 250; // délai pour passer de la miniature à l'aperçu sans qu'il se ferme
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;

export function sectionDocument(section) {
  const imports = [...new Set(section.css.match(IMPORT) ?? [])].join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
${imports}
html, body { margin: 0; background: #fff; overflow: hidden; }
${section.css.replace(IMPORT, "")}
</style></head><body>${renderSectionHtml(section, {}, "apercu")}</body></html>`;
}

const HoverContext = createContext(null);

// Grand aperçu flottant : s'ouvre après un court survol de la miniature et
// reste ouvert tant que la souris est sur lui. La molette fait défiler
// l'aperçu, jamais la page derrière (bloquée pendant l'ouverture).
// Sections : rendu réel à 1440 px réduit à la taille de l'écran (net à tout
// zoom). Templates : la capture pleine page d'origine, pas la vignette.
function Floating({ item, onEnter, onLeave }) {
  const [height, setHeight] = useState(700);
  const [imageFailed, setImageFailed] = useState(false);
  const width = Math.min(1180, window.innerWidth * 0.86);
  const maxHeight = window.innerHeight * 0.86;
  const doc = useMemo(() => (item.kind === "section" ? sectionDocument(item.value) : null), [item]);
  const frame = { onMouseEnter: onEnter, onMouseLeave: onLeave };

  if (item.kind !== "section") {
    const src = !imageFailed && item.value.full ? item.value.full : item.value.thumbnail;
    return (
      <div className="cat-float" {...frame}>
        <div className="cat-float__scroll" style={{ width: Math.min(item.value.full ? 1000 : 900, width), maxHeight }}>
          <img src={src} alt="" style={{ width: "100%" }} onError={() => setImageFailed(true)} />
        </div>
      </div>
    );
  }
  const scale = width / 1440;
  return (
    <div className="cat-float" {...frame}>
      <div className="cat-float__scroll" style={{ width, maxHeight }}>
        <div style={{ height: height * scale, overflow: "hidden" }}>
          <iframe
            title="Aperçu"
            srcDoc={doc}
            style={{ width: 1440, height, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
            onLoad={(e) => setHeight(Math.max(200, e.currentTarget.contentDocument.documentElement.scrollHeight))}
          />
        </div>
      </div>
    </div>
  );
}

export function HoverPreviewProvider({ children }) {
  const [item, setItem] = useState(null);
  const timer = useRef(null);
  const api = useMemo(
    () => ({
      enter(next) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setItem(next), DELAY_MS);
      },
      leave() {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setItem(null), CLOSE_MS);
      },
      stay() {
        clearTimeout(timer.current);
      },
      close() {
        clearTimeout(timer.current);
        setItem(null);
      },
    }),
    [],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  // Pendant l'aperçu : la page derrière ne défile pas ; Échap le ferme.
  useEffect(() => {
    if (!item) return;
    const before = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && api.close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [item, api]);
  return (
    <HoverContext.Provider value={api}>
      {children}
      {item && createPortal(<Floating key={item.value?.id ?? item.value?.full ?? item.value?.thumbnail} item={item} onEnter={api.stay} onLeave={api.leave} />, document.body)}
    </HoverContext.Provider>
  );
}

// À poser sur une miniature : { onMouseEnter, onMouseLeave }.
// Désactivé (demande du 2026-11-02) : l'aperçu ne s'ouvre plus au survol,
// seulement avec le bouton « Aperçu » ; on fait défiler l'image dans la carte.
export function useHoverPreview() {
  return { onMouseEnter() {}, onMouseLeave() {} };
}

// Aperçu d'une page au-dessus du catalogue : la vraie page (/partage/<page>)
// rendue à 1440 px et réduite à la fenêtre ; on la fait défiler, ✕, Échap ou
// un clic à côté la ferme. Sans page, la capture pleine page (image).
export function PagePreview({ page, image, title, onClose }) {
  const width = Math.min(1280, window.innerWidth * 0.92);
  const height = window.innerHeight * 0.9;
  const scale = width / 1440;
  useEffect(() => {
    const before = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="cat-pageview" onClick={onClose}>
      <div className="cat-pageview__box" style={{ width, height }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cat-pageview__close" onClick={onClose} aria-label="Fermer l'aperçu" title="Fermer (Échap)">
          ✕
        </button>
        {page ? (
          <iframe
            title={title ?? "Aperçu"}
            src={`/partage/${page}`}
            style={{ width: 1440, height: height / scale, border: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}
          />
        ) : (
          <div className="cat-float__scroll" style={{ height }}>
            <img src={image} alt="" style={{ display: "block", width: "100%" }} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Lien vers le site d'inspiration, ouvert dans un nouvel onglet.
export function SourceLink({ url, prefix = "Inspirée de" }) {
  let host = null;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return <span>Modèle de base</span>;
  }
  return (
    <span>
      {prefix}{" "}
      <a className="cat-source" href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        {host} ↗
      </a>
    </span>
  );
}
