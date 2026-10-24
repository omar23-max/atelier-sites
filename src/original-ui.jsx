import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Bascule « Original / Modifiable » d'une page issue d'un import
// (root.props.importSource) : l'original est la page capturée telle quelle
// (textes, design et images d'origine, scripts coupés), la version modifiable
// est la page de l'éditeur. Rien de l'original n'est exporté ni publié.
export function OriginalSwitch({ importSource }) {
  const [info, setInfo] = useState(null);
  const [view, setView] = useState("modifiable");
  useEffect(() => {
    setInfo(null);
    setView("modifiable");
    if (!importSource) return;
    fetch(`/api/original/${importSource}/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => {});
  }, [importSource]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setView("modifiable");
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  if (!info) return null;

  return (
    <>
      <div className="atl-switch" role="tablist" aria-label="Version de la page">
        <button type="button" className={view === "original" ? "is-on" : ""} onClick={() => setView("original")} title="La page d'origine, avec ses textes, son design et ses images">
          Original
        </button>
        <button type="button" className={view === "modifiable" ? "is-on" : ""} onClick={() => setView("modifiable")} title="La version que tu modifies et publies">
          Modifiable
        </button>
      </div>
      {view === "original" && createPortal(<OriginalView importSource={importSource} info={info} onClose={() => setView("modifiable")} />, document.body)}
    </>
  );
}

const WIDTHS = { ordinateur: 1440, mobile: 390 };

function OriginalView({ importSource, info, onClose }) {
  const [device, setDevice] = useState("ordinateur");
  const [mode, setMode] = useState("page");
  const [box, setBox] = useState({ top: 48, width: innerWidth, height: innerHeight - 48 });
  const ref = useRef(null);
  useEffect(() => {
    const measure = () => {
      const top = Math.round(document.querySelector(".atl-topbar")?.getBoundingClientRect().bottom ?? 48);
      setBox({ top, width: innerWidth, height: innerHeight - top });
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, []);

  const width = WIDTHS[device];
  const usable = box.width - 48;
  const scale = Math.min(1, usable / width);
  const frameHeight = (box.height - 56) / scale;
  const shot = `/imports/${importSource}/${device === "mobile" ? "mobile" : "desktop"}.png`;

  return (
    <div className="atl-original" style={{ top: box.top }} ref={ref}>
      <div className="atl-original__bar">
        <strong>Page d'origine</strong>
        {info.url && (
          <a href={info.url} target="_blank" rel="noreferrer noopener">
            {new URL(info.url).hostname.replace(/^www\./, "")} ↗
          </a>
        )}
        {info.capturedAt && <span className="atl-original__muted">capturée le {info.capturedAt}</span>}
        <span className="atl-original__seg">
          <button type="button" className={mode === "page" ? "is-on" : ""} onClick={() => setMode("page")}>
            Page
          </button>
          <button type="button" className={mode === "capture" ? "is-on" : ""} onClick={() => setMode("capture")} title="Capture d'écran prise à l'import">
            Capture
          </button>
        </span>
        <span className="atl-original__seg">
          <button type="button" className={device === "ordinateur" ? "is-on" : ""} onClick={() => setDevice("ordinateur")}>
            Ordinateur
          </button>
          <button type="button" className={device === "mobile" ? "is-on" : ""} onClick={() => setDevice("mobile")}>
            Mobile
          </button>
        </span>
        <span className="atl-original__muted">Lecture seule · jamais exportée</span>
        <button type="button" className="atl-original__back" onClick={onClose}>
          Revenir à la version modifiable
        </button>
      </div>
      <div className="atl-original__stage">
        {mode === "page" ? (
          <div className="atl-original__frame" style={{ width: width * scale, height: frameHeight * scale }}>
            <iframe
              key={device}
              title="Page d'origine"
              src={`/api/original/${importSource}`}
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              style={{ width, height: frameHeight, transform: `scale(${scale})` }}
            />
          </div>
        ) : (
          <div className="atl-original__shot" style={{ width: width * scale, height: box.height - 56 }}>
            <img src={shot} alt="Capture de la page d'origine" style={{ width: width * scale }} />
          </div>
        )}
      </div>
    </div>
  );
}
