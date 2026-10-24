import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Bascule « Original / Modifiable » d'une page issue d'un import
// (root.props.importSource), dans la barre de l'aperçu, à gauche des tailles
// d'écran. « Original » montre la page capturée telle quelle (textes, design et
// images d'origine, scripts coupés), en lecture seule, à la place de l'aperçu
// et à la même taille d'écran. « Modifiable » est la page de l'éditeur.
// Rien de l'original n'est exporté ni publié.

// Puck n'a pas d'emplacement prévu pour ces éléments : on attend qu'ils existent.
function useElement(selector) {
  const [el, setEl] = useState(null);
  useEffect(() => {
    const find = () => document.querySelector(selector);
    if (find()) return setEl(find());
    const obs = new MutationObserver(() => find() && (setEl(find()), obs.disconnect()));
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [selector]);
  return el;
}

export function OriginalSwitch({ importSource }) {
  const [info, setInfo] = useState(null);
  const [view, setView] = useState("modifiable");
  const bar = useElement('[class*="ViewportControls-actionsInner"]');
  const canvas = useElement('[class*="PuckCanvas-inner"]');
  const [slot, setSlot] = useState(null);

  useEffect(() => {
    setInfo(null);
    setView("modifiable");
    if (!importSource) return;
    fetch(`/api/original/${importSource}/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => {});
  }, [importSource]);

  // Place réservée au début de la barre de l'aperçu.
  useEffect(() => {
    if (!bar) return;
    const host = document.createElement("span");
    host.className = "atl-switch-host";
    bar.prepend(host);
    setSlot(host);
    return () => host.remove();
  }, [bar]);

  if (!info || !slot) return null;
  return (
    <>
      {createPortal(
        <span className="atl-switch" role="tablist" aria-label="Version de la page">
          <button type="button" className={view === "original" ? "is-on" : ""} onClick={() => setView("original")} title="La page d'origine : ses textes, son design et ses images (lecture seule)">
            Original
          </button>
          <button type="button" className={view === "modifiable" ? "is-on" : ""} onClick={() => setView("modifiable")} title="La version que tu modifies et publies">
            Modifiable
          </button>
        </span>,
        slot,
      )}
      {view === "original" && canvas && createPortal(<OriginalView importSource={importSource} info={info} canvas={canvas} />, canvas)}
    </>
  );
}

// Même largeur d'écran et même zoom que l'aperçu de Puck.
function usePreviewSize(canvas) {
  const [size, setSize] = useState({ width: 1440, scale: 1, height: 800 });
  useEffect(() => {
    const measure = () => {
      const frame = canvas.querySelector('[class*="PuckPreview"] iframe, iframe');
      const width = frame?.offsetWidth || 1440;
      const shown = frame?.getBoundingClientRect().width || width;
      const next = { width, scale: shown / width || 1, height: canvas.clientHeight };
      setSize((s) => (s.width === next.width && Math.abs(s.scale - next.scale) < 0.001 && s.height === next.height ? s : next));
    };
    measure();
    const timer = setInterval(measure, 400);
    return () => clearInterval(timer);
  }, [canvas]);
  return size;
}

function OriginalView({ importSource, info, canvas }) {
  const { width, scale, height } = usePreviewSize(canvas);
  const frameHeight = (height - 40) / scale;
  return (
    <div className="atl-original-pane">
      <div className="atl-original-pane__note">
        Page d'origine, en lecture seule
        {info.url && (
          <>
            {" · "}
            <a href={info.url} target="_blank" rel="noreferrer noopener">
              {new URL(info.url).hostname.replace(/^www\./, "")} ↗
            </a>
          </>
        )}
        {info.capturedAt && ` · capturée le ${info.capturedAt}`}
      </div>
      <div className="atl-original-pane__frame" style={{ width: width * scale, height: frameHeight * scale }}>
        <iframe
          title="Page d'origine"
          src={`/api/original/${importSource}`}
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          style={{ width, height: frameHeight, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}
