import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { sections } from "./engine/sections.js";
import { renderSectionHtml, setPhotoResolver } from "./engine/render.js";
import { brandCss } from "./engine/brand.js";
import { rebrand } from "./engine/texts.js";
import { originalPhotoTargets } from "./studio-ui.jsx";
import { IconDownload, IconGrid, IconHistory, IconReplace } from "./icons.jsx";

const pageName = new URLSearchParams(location.search).get("page") ?? "brouillon";
const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;

function Dialog({ title, onClose, children, footer, wide }) {
  return createPortal(
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`atl-modal__panel atl-newpage${wide ? " atl-studio" : ""}`}>
        <header className="atl-modal__head">
          <h2>{title}</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="atl-newpage__body">{children}</div>
        <footer className="atl-newpage__foot">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}

// ---- Rebrand : rechercher / remplacer dans tous les textes de la page ----
export function RebrandButton({ hidden = false }) {
  const [open, setOpen] = useState(false);
  // Ouvert aussi par l'outil « Rebrand » du rail de gauche.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("atl-open-rebrand", onOpen);
    return () => window.removeEventListener("atl-open-rebrand", onOpen);
  }, []);
  return (
    <>
      {!hidden && (
        <button type="button" className="atl-tool" onClick={() => setOpen(true)} title="Remplacer un mot dans toute la page (marque, produit…)">
          <IconReplace />
          Rebrand
        </button>
      )}
      {open && <RebrandDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function RebrandDialog({ onClose }) {
  const getPuck = useGetPuck();
  const [pairs, setPairs] = useState([{ find: "", replace: "" }]);
  const [keepCase, setKeepCase] = useState(true);
  const preview = useMemo(() => rebrand(getPuck().appState.data, pairs, { keepCase }).count, [pairs, keepCase, getPuck]);

  function apply() {
    const { page } = rebrand(getPuck().appState.data, pairs, { keepCase });
    getPuck().dispatch({ type: "setData", data: page });
    onClose();
  }

  const setPair = (i, k) => (e) => setPairs(pairs.map((p, j) => (j === i ? { ...p, [k]: e.target.value } : p)));

  return (
    <Dialog
      title="Rebrand — rechercher et remplacer"
      onClose={onClose}
      footer={
        <>
          <span className="atl-newpage__hint" style={{ marginRight: "auto" }}>
            {preview} remplacement(s) dans la page. Annulable avec la flèche ↶ de l'éditeur.
          </span>
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="atl-newpage__create" disabled={!preview} onClick={apply}>
            Remplacer partout
          </button>
        </>
      }
    >
      <p className="atl-newpage__hint" style={{ margin: 0 }}>
        Ne change que les textes que lit le client (titres, paragraphes, boutons), jamais les couleurs, les liens ni le code.
      </p>
      <div className="atl-rebrand">
        {pairs.map((p, i) => (
          <div key={i} className="atl-rebrand__row">
            <input value={p.find} onChange={setPair(i, "find")} placeholder="Rechercher (ex. Aurivita)" autoFocus={i === 0} />
            <span>→</span>
            <input value={p.replace} onChange={setPair(i, "replace")} placeholder="Remplacer par (ex. Clearflow)" />
            {pairs.length > 1 && (
              <button type="button" onClick={() => setPairs(pairs.filter((_, j) => j !== i))} aria-label="Retirer">
                ×
              </button>
            )}
          </div>
        ))}
        <button type="button" className="atl-score__more" style={{ margin: 0 }} onClick={() => setPairs([...pairs, { find: "", replace: "" }])}>
          + Ajouter un remplacement
        </button>
        <label className="atl-rebrand__case">
          <input type="checkbox" checked={keepCase} onChange={(e) => setKeepCase(e.target.checked)} />
          Ignorer les majuscules et garder la casse (AURIVITA → CLEARFLOW, Aurivita → Clearflow)
        </label>
      </div>
    </Dialog>
  );
}

// ---- Historique : restaurer une copie de sécurité ----
// hidden : seulement la fenêtre, ouverte par « atl-open-history » (rail de gauche).
export function HistoryButton({ hidden = false }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("atl-open-history", onOpen);
    return () => window.removeEventListener("atl-open-history", onOpen);
  }, []);
  return (
    <>
      {!hidden && (
        <button type="button" className="atl-tool" onClick={() => setOpen(true)} title="Revenir à une version précédente de la page">
          <IconHistory />
          Historique
        </button>
      )}
      {open && <HistoryDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function HistoryDialog({ onClose }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/pages/${pageName}/history`)
      .then((r) => r.json())
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);

  async function restore(item) {
    if (!confirm("Restaurer cette version ?\nLa version actuelle enregistrée est gardée dans l'historique. Les changements non publiés seront perdus."))
      return;
    const res = await fetch(`/api/pages/${pageName}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: item.file }),
    });
    if (!res.ok) return setError((await res.json()).error);
    location.reload();
  }

  return (
    <Dialog title="Historique de la page" onClose={onClose} footer={<button onClick={onClose}>Fermer</button>}>
      <p className="atl-newpage__hint" style={{ margin: 0 }}>
        Une copie est faite automatiquement avant chaque opération sur toute la page (design appliqué, textes réécrits, images posées,
        restauration).
      </p>
      {error && <p className="atl-topbar__error">{error}</p>}
      {!items ? (
        <p>Chargement…</p>
      ) : items.length === 0 ? (
        <p>Aucune copie pour cette page pour l'instant.</p>
      ) : (
        <ul className="atl-history">
          {items.map((it) => (
            <li key={it.file}>
              <span>
                <b>{it.date ? new Date(it.date).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : it.file}</b>
                <small>
                  {it.sections} section(s){it.design ? ` · design ${it.design}` : ""}
                </small>
              </span>
              <button type="button" onClick={() => restore(it)}>
                Restaurer
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

// ---- Télécharger la page en un fichier HTML autonome ----
const toDataUrl = async (url) => {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
};

async function buildHtml(data) {
  const used = [...new Set(data.content.map((c) => c.type))].map((t) => byId[t]).filter(Boolean);
  // Les photos d'origine ne partent jamais : leurs champs restent vides.
  setPhotoResolver(() => "");
  let body;
  try {
    body = data.content
      .filter((item) => byId[item.type])
      .map((item) => renderSectionHtml(byId[item.type], item.props, item.props.id))
      .join("\n");
  } finally {
    setPhotoResolver((p) => p);
  }
  // Tes propres images (studio) sont intégrées dans le fichier.
  for (const url of [...new Set(body.match(/\/medias\/[^"')\s]+/g) ?? [])]) body = body.split(url).join(await toDataUrl(url));
  const css = [brandCss(data.root?.props), ...used.map((s) => s.css)].join("\n");
  const imports = [...new Set(css.match(IMPORT) ?? [])].join("\n");
  const title = data.root?.props?.title ?? pageName;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>
${imports}
html, body { margin: 0; }
${css.replace(IMPORT, "")}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function DownloadHtmlButton() {
  const getPuck = useGetPuck();
  const [busy, setBusy] = useState(false);

  async function download() {
    const data = getPuck().appState.data;
    const originals = originalPhotoTargets(data.content ?? []).length;
    if (originals && !confirm(`${originals} photo(s) d'origine du site d'inspiration ne seront pas incluses (elles ne doivent pas être publiées) : leurs emplacements seront vides.\nContinuer ?`))
      return;
    setBusy(true);
    try {
      const html = await buildHtml(data);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      a.download = `${pageName}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      // Noté dans le projet (onglet Publication du catalogue).
      const projet = data.root?.props?.projet;
      if (projet) {
        fetch(`/api/projects/${projet}/publication`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: pageName, canal: "html", sansPhotosOrigine: originals > 0 }),
        }).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="atl-tool" onClick={download} disabled={busy} title="Télécharger la page en un seul fichier HTML">
      <IconDownload />
      {busy ? "Préparation…" : "HTML"}
    </button>
  );
}

// Lien vers le catalogue (sections, designs, templates, projets).
export function CatalogueLink() {
  return (
    <a className="atl-tool" href="/catalogue.html" title="Ouvrir le catalogue : projets, sections, designs, templates">
      <IconGrid />
      Catalogue
    </a>
  );
}
