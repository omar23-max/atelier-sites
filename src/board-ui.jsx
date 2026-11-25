import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { sections, sectionsIndex } from "./engine/sections.js";
import { ROOT_ZONE } from "./library-ui.jsx";
import { aiTargets, applyValues } from "./engine/arbre-section.js";

// Planche des images (comme le « Canvas » de Whitelabeler) : toutes les images
// de la page côte à côte, dans l'ordre de la page. Pour chacune : la refaire
// avec une consigne, ou en créer une nouvelle pour sa section à partir des
// photos du produit. Le résultat (gpt-image-2) est posé à sa place ; Ctrl+Z
// l'annule, Publish l'enregistre.
const byId = sectionsIndex;
const pageName = new URLSearchParams(location.search).get("page") ?? "brouillon";
const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export function BoardButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("atl-open-board", on);
    return () => window.removeEventListener("atl-open-board", on);
  }, []);
  return open ? createPortal(<Board onClose={() => setOpen(false)} />, document.body) : null;
}

function Board({ onClose }) {
  const getPuck = useGetPuck();
  const [tick, setTick] = useState(0);
  const data = getPuck().appState.data;
  const root = data.root?.props ?? {};
  // Les images de la page, section par section.
  const images = useMemo(
    () =>
      data.content.flatMap((item) => {
        const section = byId[item.type];
        if (!section) return [];
        const label = (section.meta.label ?? item.type).split(" — ")[0];
        return aiTargets(item).images.map((img) => ({ ...img, sectionId: item.props.id, sectionLabel: label }));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const [refs, setRefs] = useState([]);
  const [prompts, setPrompts] = useState({});
  const [busy, setBusy] = useState({});
  const [error, setError] = useState(null);

  function place(img, url) {
    const content = getPuck().appState.data.content;
    const index = content.findIndex((c) => c.props.id === img.sectionId);
    if (index < 0) return;
    getPuck().dispatch({ type: "replace", destinationIndex: index, destinationZone: ROOT_ZONE, data: applyValues(content[index], { [img.key]: { image: url } }) });
    setTick((t) => t + 1);
  }

  // mode : "refaire" (même image, consigne) ou "creer" (nouvelle image pour la section, depuis le produit).
  async function run(img, mode) {
    const consigne = (prompts[img.key] ?? "").trim();
    if (mode === "creer" && !refs.length) return setError("Ajoute d'abord une ou deux photos de ton produit.");
    if (mode === "refaire" && !consigne && !refs.length) return setError("Écris une consigne, ou ajoute des photos de ton produit.");
    setError(null);
    setBusy((b) => ({ ...b, [img.key]: mode }));
    try {
      const [w, h] = String(img.size ?? "1024×1024").split("×").map(Number);
      const prompt =
        mode === "creer"
          ? `Crée une nouvelle image pour la section « ${img.sectionLabel} » d'une page de vente${root.produit ? ` du produit « ${root.produit} »` : ""}, avec ce produit tel qu'il apparaît sur les photos de référence. ${consigne || "Photo réaliste et parlante pour cette section."}`
          : `${consigne || "Refais l'image avec mon produit à la place de celui d'origine."}${root.produit ? ` Le produit est « ${root.produit} ».` : ""}`;
      const res = await fetch("/api/ia/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: pageName,
          source: mode === "creer" ? refs[0] : img.src,
          references: mode === "creer" ? refs.slice(1) : refs,
          prompt,
          width: w || 1024,
          height: h || 1024,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      place(img, body.url);
    } catch (e) {
      setError(`${img.sectionLabel} : ${e.message}`);
    } finally {
      setBusy((b) => ({ ...b, [img.key]: null }));
    }
  }

  async function addRefs(files) {
    const list = await Promise.all([...files].filter((f) => f.type.startsWith("image/")).slice(0, 6).map(readAsDataUrl));
    setRefs((r) => [...r, ...list].slice(0, 6));
  }

  return (
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="atl-modal__panel atl-board">
        <header className="atl-modal__head">
          <h2>Planche des images · {images.length}</h2>
          {/* Toutes les photos d'un coup avec ton produit (Studio d'images). */}
          <button type="button" className="atl-board__all" onClick={() => (onClose(), window.dispatchEvent(new CustomEvent("atl-open-studio")))}>
            ✨ Tout refaire avec mon produit
          </button>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="atl-board__refs">
          <b>Photos de ton produit</b>
          {refs.map((r, i) => (
            <figure key={i}>
              <img src={r} alt="" />
              <button type="button" onClick={() => setRefs(refs.filter((_, j) => j !== i))} aria-label="Retirer">
                ×
              </button>
            </figure>
          ))}
          <label className="atl-board__add">
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addRefs(e.target.files)} />+ Ajouter
          </label>
          <small>Utilisées pour « Refaire » et « Créer ». Chaque image ≈ 0,05 $ (gpt-image-2).</small>
        </div>
        {error && <p className="atl-topbar__error">{error}</p>}
        <ul className="atl-board__grid">
          {images.map((img) => (
            <li key={`${img.sectionId}/${img.key}`}>
              <div className="atl-board__img">
                <img src={img.src} alt="" />
                {busy[img.key] && <span className="atl-board__busy">{busy[img.key] === "creer" ? "Création…" : "En cours…"}</span>}
              </div>
              <small>
                {img.sectionLabel}
                {img.size ? ` · ${img.size}` : ""}
              </small>
              <input value={prompts[img.key] ?? ""} onChange={(e) => setPrompts({ ...prompts, [img.key]: e.target.value })} placeholder="Consigne (facultatif)" />
              <div className="atl-board__actions">
                <button type="button" disabled={!!busy[img.key]} onClick={() => run(img, "refaire")}>
                  ↻ Refaire
                </button>
                <button type="button" disabled={!!busy[img.key]} onClick={() => run(img, "creer")}>
                  ✨ Créer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
