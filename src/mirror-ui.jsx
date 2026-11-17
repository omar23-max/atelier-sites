import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { sections, sectionsIndex } from "./engine/sections.js";
import { renderSectionHtml, setPhotoResolver } from "./engine/render.js";
import { brandCss } from "./engine/brand.js";
import { designById } from "./engine/designs.js";
import { originalPhotoTargets } from "./engine/photos.js";

// ---- Connecteur Mirror Studio ----
// Envoie la page courante (HTML de chaque section + CSS + tes images) vers un
// projet hébergé sur ton Mirror Studio. Nécessite côté serveur :
//   ATELIER_SHARED_KEY  (même valeur que la clé saisie ici)
//   ATELIER_OWNER_ID    (id du compte Kimi propriétaire des projets importés)

const pageName = new URLSearchParams(location.search).get("page") ?? "brouillon";
const byId = sectionsIndex;
const IMPORT = /@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g;
const URL_KEY = "atl-mirror-url";
const KEY_KEY = "atl-mirror-key";

const toDataUrl = async (url) => {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
};

// Construit le paquet d'import : une section « custom » par section de la page,
// photos d'origine exclues (jamais publiées), tes images embarquées.
async function buildPayload(data, { includeImages }) {
  const used = [...new Set(data.content.map((c) => c.type))].map((t) => byId[t]).filter(Boolean);
  setPhotoResolver(() => "");
  let htmlBySection;
  try {
    htmlBySection = data.content
      .filter((item) => byId[item.type])
      .map((item) => ({ item, html: renderSectionHtml(byId[item.type], item.props, item.props.id) }));
  } finally {
    setPhotoResolver((p) => p);
  }
  // Les @import (polices…) et tout le CSS vont dans la première section :
  // chaque section importée porte son HTML, le CSS global ne se répète pas.
  const css = [brandCss(data.root?.props, designById[data.root?.props?.design]?.tokens?.styles), ...used.map((s) => s.css)].join("\n");
  const imports = [...new Set(css.match(IMPORT) ?? [])].join("\n");
  const plainCss = css.replace(IMPORT, "");
  const sectionsOut = htmlBySection.map(({ item, html }, i) => ({
    label: byId[item.type].meta.label ?? item.type,
    atelierId: item.type,
    html,
    css: i === 0 ? `${imports}\n${plainCss}` : "",
  }));
  const images = [];
  if (includeImages) {
    const refs = [...new Set(sectionsOut.flatMap((s) => s.html.match(/\/medias\/[^"')\s]+/g) ?? []))].slice(0, 80);
    for (const ref of refs) {
      try {
        const dataUrl = await toDataUrl(ref);
        const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
        if (!m) continue;
        images.push({ ref, name: ref.split("/").pop(), dataBase64: m[2], contentType: m[1] });
      } catch {
        // Image illisible : le HTML garde l'URL locale, elle ne marchera pas côté Mirror.
      }
    }
  }
  return { sections: sectionsOut, images };
}

async function mirrorImport(baseUrl, key, payload) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/trpc/studio.atelierImport`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { ...payload, key } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.json?.message ?? body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.join(" ") : String(msg));
  }
  return body.result.data;
}

export function MirrorButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="atl-tool" onClick={() => setOpen(true)} title="Envoyer la page vers ton Mirror Studio hébergé">
        ⬆ Mirror
      </button>
      {open && <MirrorDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function MirrorDialog({ onClose }) {
  const getPuck = useGetPuck();
  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) ?? "");
  const [key, setKey] = useState(() => localStorage.getItem(KEY_KEY) ?? "");
  const [projectName, setProjectName] = useState("");
  const [includeImages, setIncludeImages] = useState(true);
  const [state, setState] = useState(null); // {busy, step} | {error} | {done, projectId}

  useEffect(() => {
    const title = getPuck().appState.data.root?.props?.title;
    if (title) setProjectName(title);
  }, []);

  async function push() {
    if (!url.trim() || !key.trim() || !projectName.trim()) return setState({ error: "URL, clé et nom du projet sont requis." });
    localStorage.setItem(URL_KEY, url.trim());
    localStorage.setItem(KEY_KEY, key.trim());
    const data = getPuck().appState.data;
    const originals = originalPhotoTargets(data.content ?? []).length;
    if (originals && !confirm(`${originals} photo(s) d'origine ne seront pas envoyées (elles ne doivent pas être publiées) : leurs emplacements seront vides.\nContinuer ?`))
      return;
    setState({ busy: true, step: "Préparation de la page…" });
    try {
      setState({ busy: true, step: "Rendu des sections…" });
      const { sections, images } = await buildPayload(data, { includeImages });
      setState({ busy: true, step: `Envoi de ${sections.length} section(s)${images.length ? ` et ${images.length} image(s)` : ""}…` });
      const out = await mirrorImport(url.trim(), key.trim(), {
        projectName: projectName.trim(),
        pageName: data.root?.props?.title ?? pageName,
        theme: {
          bg: "#ffffff",
          surface: "#ffffff",
          text: "#111318",
          primary: "#4f46e5",
          accent: "#4f46e5",
          muted: "#6b7280",
          radius: "rounded-2xl",
          font: "sans",
        },
        sections,
        images,
      });
      setState({ done: true, projectId: out.projectId, count: out.sections, imgs: out.images });
    } catch (e) {
      console.error("[mirror] envoi impossible", e);
      setState({ error: e.message });
    }
  }

  return createPortal(
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && !state?.busy && onClose()}>
      <div className="atl-modal__panel atl-newpage">
        <header className="atl-modal__head">
          <h2>Envoyer vers Mirror Studio</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer" disabled={state?.busy}>
            ×
          </button>
        </header>
        <div className="atl-newpage__body">
          {state?.done ? (
            <div className="atl-mirror-done">
              <p className="atl-topbar__ok">Projet créé : {state.count} section(s){state.imgs ? `, ${state.imgs} image(s)` : ""}.</p>
              <p className="atl-newpage__hint" style={{ margin: 0 }}>
                Ouvre ton Mirror Studio : le projet « {projectName} » t'attend, page prête à l'aperçu. La retouche se repousse depuis ici à tout moment.
              </p>
              <a className="atl-tool" href={url.trim()} target="_blank" rel="noreferrer">
                Ouvrir Mirror Studio ↗
              </a>
            </div>
          ) : (
            <>
              <label className="atl-f">
                <span className="atl-f__label">URL de ton Mirror Studio</span>
                <input className="atl-f__input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (l'adresse de ton Mirror hébergé)" />
              </label>
              <label className="atl-f">
                <span className="atl-f__label">Clé partagée</span>
                <input className="atl-f__input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="La même que ATELIER_SHARED_KEY côté serveur" />
                <span className="atl-f__info">Une fois par serveur : ATELIER_SHARED_KEY (clé) et ATELIER_OWNER_ID (ton compte).</span>
              </label>
              <label className="atl-f">
                <span className="atl-f__label">Nom du projet</span>
                <input className="atl-f__input" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex. Derila — Memory Foam Pillow" />
              </label>
              <label className="atl-f atl-f--row">
                <span className="atl-f__label">
                  <span>Envoyer mes images</span>
                </span>
                <button type="button" role="switch" aria-checked={includeImages} className={`atl-switch${includeImages ? " is-on" : ""}`} onClick={() => setIncludeImages(!includeImages)}>
                  <span />
                </button>
              </label>
            </>
          )}
        </div>
        <footer className="atl-newpage__foot">
          {state?.error && <span className="atl-topbar__error">{state.error}</span>}
          {state?.busy && <span className="atl-aidlg__step">{state.step}</span>}
          {!state?.done && (
            <>
              <button type="button" onClick={onClose} disabled={state?.busy}>
                Annuler
              </button>
              <button type="button" className="atl-newpage__create" onClick={push} disabled={state?.busy}>
                {state?.busy ? "Envoi…" : "Envoyer"}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
