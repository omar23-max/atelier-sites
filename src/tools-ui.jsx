import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { ensureFull, sections, sectionsIndex } from "./engine/sections.js";
import { langueOf } from "./engine/langue.js";
import { renderSectionHtml, setPhotoResolver } from "./engine/render.js";
import { brandCss } from "./engine/brand.js";
import { designById } from "./engine/designs.js";
import { rebrand } from "./engine/texts.js";
import { originalPhotoTargets } from "./studio-ui.jsx";
import { IconDownload, IconGrid, IconHistory, IconReplace } from "./icons.jsx";

const pageName = new URLSearchParams(location.search).get("page") ?? "brouillon";
const byId = sectionsIndex;
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

// Export vérifié (audit T4, 2026-11-17) : chaque section est rendue ou
// signalée, les médias de l'atelier (corps ET CSS) sont intégrés, la langue
// est celle de la page, et un bilan dit ce qui dépend encore d'Internet.
// zip : version autonome (2026-11-17) — médias rangés dans assets/, polices
// Google téléchargées dans fonts/ ; renvoie aussi les fichiers à zipper.
async function buildHtml(data, { zip = false } = {}) {
  const bilan = { sections: 0, sautees: [], integres: 0, manquants: [], enLigne: [], polices: 0, policesLocales: 0, zip };
  const files = new Map();
  const taken = new Set();
  const localName = (dir, url, ext = "") => {
    let base = (url.split("?")[0].split("/").pop() || "fichier").replace(/[^a-zA-Z0-9._-]/g, "_");
    if (ext && !/\.[a-z0-9]{2,5}$/i.test(base)) base += ext;
    let name = `${dir}/${base}`;
    for (let n = 2; taken.has(name); n++) name = `${dir}/${n}-${base}`;
    taken.add(name);
    return name;
  };
  await ensureFull([...new Set(data.content.map((c) => c.type))].filter((t) => byId[t])).catch(() => {});
  const used = [...new Set(data.content.map((c) => c.type))].map((t) => byId[t]).filter((s) => s && !s.leger);
  // Les photos d'origine ne partent jamais : leurs champs restent vides.
  setPhotoResolver(() => "");
  const parts = [];
  try {
    for (const item of data.content) {
      const section = byId[item.type];
      const name = (section?.meta?.label ?? item.type).split(" — ")[0];
      if (!section || section.leger) {
        bilan.sautees.push(name);
        continue;
      }
      try {
        parts.push(renderSectionHtml(section, item.props, item.props.id));
        bilan.sections++;
      } catch (e) {
        bilan.sautees.push(`${name} (${e.message})`);
      }
    }
  } finally {
    setPhotoResolver((p) => p);
  }
  let body = parts.join("\n");
  let css = [brandCss(data.root?.props, designById[data.root?.props?.design]?.tokens?.styles), ...used.map((s) => s.css)].join("\n");
  // Tes propres images et vidéos (studio, téléversées) intégrées dans le fichier.
  for (const url of [...new Set([...(body.match(/\/medias\/[^"')\s]+/g) ?? []), ...(css.match(/\/medias\/[^"')\s]+/g) ?? [])])]) {
    try {
      let target;
      if (zip) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status);
        target = localName("assets", url);
        files.set(target, await res.blob());
      } else target = await toDataUrl(url);
      body = body.split(url).join(target);
      css = css.split(url).join(target);
      bilan.integres++;
    } catch {
      bilan.manquants.push(url);
    }
  }
  let imports = [...new Set(css.match(IMPORT) ?? [])];
  // ZIP : les polices Google (feuille + fichiers .woff2) sont téléchargées et
  // servies depuis fonts/ : la page s'affiche sans Internet.
  let fontsCss = "";
  if (zip) {
    const keep = [];
    for (const imp of imports) {
      const href = /url\(\s*['"]?([^'")\s]+)/.exec(imp)?.[1] ?? /@import\s+['"]([^'"]+)/.exec(imp)?.[1];
      if (!href || !/fonts\.googleapis\.com/.test(href)) {
        keep.push(imp);
        continue;
      }
      try {
        let text = await (await fetch(href)).text();
        for (const m of [...new Set([...text.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((x) => x[1]))]) {
          const blob = await (await fetch(m)).blob();
          const name = localName("fonts", m, ".woff2");
          files.set(name, blob);
          text = text.split(m).join(name);
          bilan.policesLocales++;
        }
        fontsCss += text + "\n";
      } catch {
        keep.push(imp);
      }
    }
    imports = keep;
    // Polices Google appelées directement dans les styles des sections.
    for (const m of [...new Set([...css.matchAll(/url\(\s*['"]?(https:\/\/fonts\.gstatic\.com\/[^'")\s]+)/g)].map((x) => x[1]))]) {
      try {
        const blob = await (await fetch(m)).blob();
        const name = localName("fonts", m, ".woff2");
        files.set(name, blob);
        css = css.split(m).join(name);
        bilan.policesLocales++;
      } catch {}
    }
  }
  // Fichiers du site d'origine appelés par un chemin relatif (polices
  // « assets/pp-… » des copies) : jamais inclus, comme les photos d'origine
  // (licence à vérifier) ; la police de secours s'affiche.
  bilan.origine = [...new Set([...css.matchAll(/url\(\s*['"]?((?:\.\/)?assets\/[^'")\s?#]+)/g)].map((x) => x[1].split("/").pop()))];
  const title = data.root?.props?.title ?? pageName;
  const html = `<!doctype html>
<html lang="${langueOf(data.root?.props).code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>
${imports.join("\n")}
${fontsCss}
html, body { margin: 0; }
${css.replace(IMPORT, "")}
</style>
</head>
<body>
${body}
</body>
</html>
`;
  // Ce qui reste en ligne dans le fichier final : ressources (images, vidéos,
  // polices, CSS) et liens vers d'autres sites.
  const host = (u) => {
    try {
      return new URL(u).hostname;
    } catch {
      return null;
    }
  };
  const ressources = new Set();
  for (const m of html.matchAll(/(?:src|poster|srcset)="(https?:\/\/[^"\s]+)|url\(\s*['"]?(https?:\/\/[^'")\s]+)/g)) ressources.add(host(m[1] || m[2]));
  const liens = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\shref="(https?:\/\/[^"]+)"/g)) liens.add(host(m[1]));
  ressources.delete(null);
  liens.delete(null);
  bilan.polices = [...ressources].filter((h) => /fonts\.(googleapis|gstatic)\.com$/.test(h)).length > 0;
  bilan.enLigne = [...ressources].filter((h) => !/fonts\.(googleapis|gstatic)\.com$/.test(h));
  bilan.liens = [...liens];
  return { html, bilan, files };
}

// Bilan de l'export (alerte, et LISEZ-MOI.txt du ZIP).
function bilanLines(bilan, originals, fichier) {
  return [
    `${bilan.zip ? "ZIP" : "HTML"} téléchargé (${fichier}).`,
    "",
    `• ${bilan.sections} section(s) rendue(s).`,
    bilan.sautees.length ? `• ⚠ ${bilan.sautees.length} section(s) NON rendue(s) : ${bilan.sautees.join(", ")}.` : null,
    `• ${bilan.integres} image(s) ou vidéo(s) de l'atelier ${bilan.zip ? "rangée(s) dans assets/" : "intégrée(s) dans le fichier"}.`,
    bilan.manquants.length ? `• ⚠ ${bilan.manquants.length} média(s) introuvable(s) : ${bilan.manquants.slice(0, 5).join(", ")}.` : null,
    originals ? `• ${originals} photo(s) d'origine retirée(s) : emplacements vides.` : null,
    bilan.policesLocales ? `• ${bilan.policesLocales} fichier(s) de police Google dans ${bilan.zip ? "fonts/ : affichage sans Internet" : "le fichier"}.` : null,
    bilan.origine?.length ? `• ${bilan.origine.length} police(s) ou fichier(s) du site d'origine non inclus (licence à vérifier) : ${bilan.origine.slice(0, 5).join(", ")} ; la police de secours s'affiche.` : null,
    bilan.polices ? "• Polices : chargées depuis Google à l'ouverture (Internet nécessaire)." : null,
    bilan.enLigne.length ? `• Ressources restées en ligne (Internet nécessaire) : ${bilan.enLigne.slice(0, 6).join(", ")}.` : "• Aucune autre ressource en ligne.",
    bilan.liens?.length ? `• Liens vers d'autres sites : ${bilan.liens.slice(0, 6).join(", ")} (à vérifier : liens du site d'origine ?).` : null,
  ].filter(Boolean);
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
      const { html, bilan } = await buildHtml(data);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      a.download = `${pageName}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      // Bilan de l'export : ce qui est dedans, ce qui manque, ce qui demande Internet.
      alert(bilanLines(bilan, originals, `${pageName}.html`).join("\n"));
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

// ZIP autonome (2026-11-17) : index.html + assets/ (tes médias) + fonts/
// (polices Google) + LISEZ-MOI.txt : la page s'ouvre sans Internet, sauf
// les ressources restées sur d'autres sites (listées).
export function DownloadZipButton() {
  const getPuck = useGetPuck();
  const [busy, setBusy] = useState(false);
  async function download() {
    const data = getPuck().appState.data;
    const originals = originalPhotoTargets(data.content ?? []).length;
    setBusy(true);
    try {
      const { html, bilan, files } = await buildHtml(data, { zip: true });
      const { default: JSZip } = await import("jszip");
      const z = new JSZip();
      z.file("index.html", html);
      for (const [name, blob] of files) z.file(name, blob);
      const lignes = bilanLines(bilan, originals, `${pageName}.zip`);
      z.file("LISEZ-MOI.txt", [`Page « ${data.root?.props?.title ?? pageName} » exportée par l'atelier le ${new Date().toLocaleString("fr-CA")}.`, "Ouvre index.html dans un navigateur.", "", ...lignes].join("\r\n"));
      const blob = await z.generateAsync({ type: "blob", compression: "DEFLATE" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${pageName}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      const projet = data.root?.props?.projet;
      if (projet) fetch(`/api/projects/${projet}/publication`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: pageName, canal: "html", sansPhotosOrigine: originals > 0 }) }).catch(() => {});
      alert(lignes.join("\n"));
    } catch (e) {
      alert(`Export ZIP impossible : ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="atl-tool" onClick={download} disabled={busy} title="Télécharger la page en ZIP autonome (HTML, images, polices) : s'ouvre sans Internet">
      <IconDownload />
      {busy ? "Préparation…" : "ZIP"}
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
