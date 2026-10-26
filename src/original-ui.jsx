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

// Deux gestes sur la version modifiable d'une page de projet, sans jamais
// toucher au template du catalogue (pages/<importSource>.json) :
// « Repartir de l'original » remet ses sections telles que dans le template
// (l'état actuel part dans l'historique) ; « Supprimer cette page » l'envoie
// à la corbeille, d'où on peut la restaurer.
async function resetFromOriginal(pageName, importSource, current) {
  const res = await fetch(`/api/pages/${importSource}`);
  if (!res.ok) throw new Error("La page d'origine n'est plus dans le catalogue.");
  const original = await res.json();
  await fetch(`/api/pages/${pageName}/snapshot`, { method: "POST" });
  const props = { ...current.root?.props };
  // Design et polices exactement comme l'original (une police absente de
  // l'original ne doit pas rester imposée à la page).
  for (const k of ["design", "font_heading", "font_body"]) {
    if (original.root?.props?.[k] != null) props[k] = original.root.props[k];
    else delete props[k];
  }
  const put = await fetch(`/api/pages/${pageName}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...current, root: { ...current.root, props }, content: original.content }),
  });
  if (!put.ok) throw new Error((await put.json()).error);
}

function PageMenu({ pageName, importSource, projet, pages, getData }) {
  // La page du template elle-même (sans projet) : l'original, on ne la remet
  // pas à zéro et on ne la supprime pas d'ici.
  const original = !projet || pageName === importSource;
  // open : position de la liste (la barre de Puck coupe ce qui dépasse, la
  // liste est donc posée sur la page entière).
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !e.target.closest?.(".atl-pagemenu, .atl-pagemenu__list") && setOpen(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function reset() {
    setOpen(null);
    if (!confirm("Remettre cette page comme la page d'origine du catalogue ?\n\nTes modifications partent dans l'historique (bouton Historique pour revenir en arrière).")) return;
    setBusy(true);
    try {
      await resetFromOriginal(pageName, importSource, getData());
      location.reload();
    } catch (e) {
      setBusy(false);
      alert(e.message);
    }
  }

  async function remove() {
    setOpen(null);
    if (!confirm("Supprimer cette page du projet ?\n\nLa page d'origine reste dans le catalogue. Celle-ci part dans la corbeille, d'où tu peux la restaurer.")) return;
    setBusy(true);
    const res = await fetch(`/api/corbeille/pages/${pageName}`, { method: "POST" });
    if (!res.ok) {
      setBusy(false);
      return alert((await res.json()).error);
    }
    const next = pages.find((p) => p.name !== pageName && p.projet === projet);
    location.replace(next ? `/?page=${next.name}` : "/catalogue.html#projets");
  }

  return (
    <div className="atl-pagemenu">
      <button
        type="button"
        className="atl-pagemenu__btn"
        disabled={busy}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setOpen((o) => (o ? null : { top: r.bottom + 6, left: r.left }));
        }}
        title="Repartir de l'original, supprimer la page"
      >
        {busy ? "…" : "⋯"}
      </button>
      {open &&
        createPortal(
        <div className="atl-pagemenu__list" role="menu" style={open}>
          {original ? (
            <>
              <p className="atl-pagemenu__note">C'est la page d'origine du catalogue : elle ne se supprime pas d'ici. Pour la modifier, utilise-la dans un projet.</p>
              <button type="button" role="menuitem" onClick={() => location.assign("/catalogue.html#templates")}>
                ➕ L'utiliser dans un projet…
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={reset}>
                ↺ Repartir de l'original
              </button>
              <button type="button" role="menuitem" className="is-danger" onClick={remove}>
                🗑 Supprimer cette page
              </button>
            </>
          )}
        </div>,
          document.body,
        )}
    </div>
  );
}

export function OriginalSwitch({ importSource, pageName, projet, pages = [], getData }) {
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
          <PageMenu pageName={pageName} importSource={importSource} projet={projet} pages={pages} getData={getData} />
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
