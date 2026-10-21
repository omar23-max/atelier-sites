import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderSectionHtml } from "../engine/render.js";

const DELAY_MS = 450; // temps de survol avant l'ouverture de l'aperçu
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

// Grand aperçu flottant : s'ouvre après un court survol, se ferme dès que la
// souris quitte la miniature. Il ne capte pas la souris (pointer-events: none).
function Floating({ item }) {
  const [height, setHeight] = useState(700);
  const width = Math.min(1180, window.innerWidth * 0.86);
  const maxHeight = window.innerHeight * 0.84;
  const doc = useMemo(() => (item.kind === "section" ? sectionDocument(item.value) : null), [item]);

  if (item.kind === "design") {
    return (
      <div className="cat-float">
        <img src={item.value.thumbnail} alt="" style={{ width: Math.min(900, width) }} />
      </div>
    );
  }
  const scale = width / 1440;
  return (
    <div className="cat-float">
      <div style={{ width, height: Math.min(height * scale, maxHeight), overflow: "hidden" }}>
        <iframe
          title="Aperçu"
          srcDoc={doc}
          style={{ width: 1440, height, border: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}
          onLoad={(e) => setHeight(Math.max(200, e.currentTarget.contentDocument.documentElement.scrollHeight))}
        />
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
        setItem(null);
      },
    }),
    [],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <HoverContext.Provider value={api}>
      {children}
      {item && createPortal(<Floating item={item} />, document.body)}
    </HoverContext.Provider>
  );
}

// À poser sur une miniature : { onMouseEnter, onMouseLeave }.
export function useHoverPreview(kind, value) {
  const api = useContext(HoverContext);
  return {
    onMouseEnter: () => api?.enter({ kind, value }),
    onMouseLeave: () => api?.leave(),
  };
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
