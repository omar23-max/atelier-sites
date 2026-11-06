import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderSectionHtml } from "../engine/render.js";
import { useFull } from "../engine/sections.js";

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
  const full = useFull(item.kind === "section" ? item.value : null); // version légère : complétée ici
  const doc = useMemo(() => (item.kind !== "section" ? null : full ? sectionDocument(full) : "<p style='font:14px system-ui;padding:20px'>Chargement…</p>"), [item, full]);
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
// Copie la section n° index de la page « from » à la fin de la page « to »
// (copie de sécurité de « to » avant), telle qu'elle est dans le template.
async function takeSection(from, index, to) {
  const get = async (name) => {
    const res = await fetch(`/api/pages/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`page « ${name} » illisible`);
    return res.json();
  };
  const [source, target] = await Promise.all([get(from), get(to)]);
  const item = source.content?.[index];
  if (!item) throw new Error("section introuvable");
  const id = `${item.type}-${Date.now().toString(36)}`;
  const copy = structuredClone({ ...item, props: { ...item.props, id } });
  await fetch(`/api/pages/${encodeURIComponent(to)}/snapshot`, { method: "POST" }).catch(() => {});
  const res = await fetch(`/api/pages/${encodeURIComponent(to)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, content: [...(target.content ?? []), copy] }),
  });
  if (!res.ok) throw new Error("enregistrement refusé");
  return id;
}

// Dans l'aperçu (même origine) : la section survolée est entourée, avec un
// bouton « Prendre cette section ». Les sections sont repérées par les
// <template data-atl-sec> de /partage/<page>?reperes=1 : une section va d'un
// repère au suivant. Tailles divisées par scale : l'aperçu est réduit.
function armSections(frame, scale, onTake) {
  const doc = frame.contentDocument;
  if (!doc?.body) return;
  const marks = [...doc.querySelectorAll("template[data-atl-sec]")];
  if (!marks.length) return;
  const box = doc.createElement("div");
  box.setAttribute("data-atl-take", "");
  const z = 1 / scale;
  box.style.cssText = `position:absolute;z-index:2147483646;pointer-events:none;display:none;outline:${3 * z}px solid #6d28d9;outline-offset:-${3 * z}px;background:rgba(109,40,217,.06)`;
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.textContent = "＋ Prendre cette section";
  btn.style.cssText = `position:absolute;top:${10 * z}px;right:${70 * z}px;pointer-events:auto;cursor:pointer;border:0;border-radius:${999}px;background:#6d28d9;color:#fff;font:600 ${14 * z}px/1 system-ui,sans-serif;padding:${10 * z}px ${18 * z}px;box-shadow:0 ${4 * z}px ${14 * z}px rgba(0,0,0,.25)`;
  box.append(btn);
  doc.body.append(box);
  let current = -1;
  const rectOf = (i) => {
    const range = doc.createRange();
    range.setStartAfter(marks[i]);
    if (marks[i + 1]) range.setEndBefore(marks[i + 1]);
    else range.setEndBefore(box);
    return range.getBoundingClientRect();
  };
  doc.addEventListener("mousemove", (e) => {
    if (box.contains(e.target)) return;
    for (let i = 0; i < marks.length; i++) {
      const r = rectOf(i);
      if (r.height > 4 && e.clientY >= r.top && e.clientY < r.bottom) {
        if (i !== current || box.style.display === "none") {
          current = i;
          const y = r.top + doc.defaultView.scrollY;
          Object.assign(box.style, { display: "block", top: `${y}px`, left: "0px", width: "100%", height: `${r.height}px` });
          btn.textContent = "＋ Prendre cette section";
          btn.disabled = false;
        }
        return;
      }
    }
  });
  doc.documentElement.addEventListener("mouseleave", () => (box.style.display = "none"));
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.disabled = true;
    btn.textContent = "Ajout…";
    btn.textContent = (await onTake(Number(marks[current].dataset.atlSec))) ? "✓ Ajoutée" : "✗ Échec";
  });
}

export function PagePreview({ page, image, title, onClose, target, toolbar }) {
  const width = Math.min(1280, window.innerWidth * 0.92);
  const boxHeight = window.innerHeight * 0.9;
  const TOOLBAR = 56; // barre d'actions en haut (aperçu d'un template)
  const height = toolbar ? boxHeight - TOOLBAR : boxHeight;
  const scale = width / 1440;
  const [notice, setNotice] = useState(null);
  const onTake = async (index) => {
    try {
      const id = await takeSection(page, index, target);
      setNotice({ text: `Section ajoutée à la fin de « ${target} ».`, href: `/?page=${encodeURIComponent(target)}&section=${encodeURIComponent(id)}` });
      return true;
    } catch (e) {
      setNotice({ text: `Échec : ${e.message}`, error: true });
      return false;
    }
  };
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
      <div className="cat-pageview__box" style={{ width, height: boxHeight }} onClick={(e) => e.stopPropagation()}>
        {toolbar ? (
          <div className="cat-pv" style={{ height: TOOLBAR }}>
            {toolbar}
            <button type="button" className="cat-pv__close" onClick={onClose} aria-label="Fermer l'aperçu" title="Fermer (Échap)">
              ✕
            </button>
          </div>
        ) : (
          <button type="button" className="cat-pageview__close" onClick={onClose} aria-label="Fermer l'aperçu" title="Fermer (Échap)">
            ✕
          </button>
        )}
        {page && (
          <div className={`cat-pageview__bar${notice?.error ? " is-error" : ""}`}>
            {notice ? (
              <>
                {notice.text} {notice.href && <a href={notice.href}>Ouvrir la page →</a>}
              </>
            ) : target ? (
              <>Survole une section, puis « Prendre cette section » : elle est ajoutée à la fin de « {target} ».</>
            ) : (
              <>Pour prendre une section, ouvre d'abord la page qui doit la recevoir dans l'atelier, puis reviens ici.</>
            )}
          </div>
        )}
        {page ? (
          <iframe
            title={title ?? "Aperçu"}
            src={`/partage/${page}${target ? "?reperes=1" : ""}`}
            onLoad={(e) => target && armSections(e.currentTarget, scale, onTake)}
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
