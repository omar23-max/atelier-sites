import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { IconImage } from "./icons.jsx";
import { originalPhotoTargets } from "./engine/photos.js";

export { originalPhotoTargets };

const pageName = new URLSearchParams(location.search).get("page") ?? "brouillon";
const MAX_REFS = 10;

const TAGS = ["Face avant du produit", "Emballage", "Gros plan", "Produit en main", "Logo", "Palette de couleurs", "Autre"];

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

// Bouton « Studio d'images » : chaque photo d'origine de la page est refaite
// avec ton produit (tes photos fournisseur, ton logo, ta palette). Crée une
// demande (demandes/<date>-images/) que Claude traite avec gpt-image-2 ; les
// images obtenues sont posées dans la page (medias/<page>/).
export function StudioButton({ hidden = false }) {
  const [open, setOpen] = useState(false);
  // Ouvert aussi depuis un champ image (« Refaire avec le Studio d'images »).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("atl-open-studio", onOpen);
    return () => window.removeEventListener("atl-open-studio", onOpen);
  }, []);
  return (
    <>
      {!hidden && (
        <button type="button" className="atl-tool" onClick={() => setOpen(true)} title="Refaire les photos d'origine avec ton produit">
          <IconImage />
          Studio d'images
        </button>
      )}
      {open && createPortal(<StudioDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function StudioDialog({ onClose }) {
  const getPuck = useGetPuck();
  const data = getPuck().appState.data;
  const targets = useMemo(() => originalPhotoTargets(data.content ?? []), [data]);
  const [refs, setRefs] = useState([]); // { dataUrl, tag, name }
  const [chosen, setChosen] = useState(() => new Set(targets.map((t) => t.key)));
  const [notes, setNotes] = useState({});
  const [form, setForm] = useState({
    produit: data.root?.props?.produit ?? "",
    mode: "fidele",
    rythme: "tout",
    textes: "",
  });
  const [state, setState] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function addFiles(files) {
    const list = [...files].filter((f) => f.type.startsWith("image/")).slice(0, MAX_REFS - refs.length);
    const added = await Promise.all(list.map(async (f) => ({ name: f.name, dataUrl: await readAsDataUrl(f), tag: TAGS[0] })));
    setRefs((r) => [...r, ...added].slice(0, MAX_REFS));
  }

  function toggle(key) {
    const next = new Set(chosen);
    next.has(key) ? next.delete(key) : next.add(key);
    setChosen(next);
  }

  async function send() {
    if (refs.length === 0) return setState({ error: "Ajoute au moins une photo de ton produit en référence." });
    if (chosen.size === 0) return setState({ error: "Choisis au moins une photo à refaire." });
    setState({ busy: true });
    try {
      const save = await fetch(`/api/pages/${pageName}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getPuck().appState.data),
      });
      if (!save.ok) throw new Error((await save.json()).error);
      const cibles = targets.filter((t) => chosen.has(t.key)).map((t) => ({ ...t, consigne: notes[t.key] ?? "" }));
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "images",
          page: pageName,
          images: refs.map((r) => r.dataUrl),
          details: { ...form, references: refs.map((r, i) => ({ ordre: i + 1, etiquette: r.tag, nom: r.name })), cibles },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setState({ done: body.dossier, count: cibles.length });
    } catch (e) {
      setState({ error: `Échec : ${e.message}` });
    }
  }

  return (
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="atl-modal__panel atl-newpage atl-studio">
        <header className="atl-modal__head">
          <h2>Studio d'images</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        {state?.done ? (
          <div className="atl-newpage__body">
            <p>
              <b>Demande enregistrée</b> dans <code>{state.done}</code> : {state.count} photo(s) à refaire. La page a été enregistrée.
            </p>
            <p>
              Dis à Claude <b>« traite les demandes »</b>. Chaque image est créée avec gpt-image-2 (OpenAI) à partir de la photo d'origine et de tes
              références, puis posée à sa place dans la page. Recharge ensuite l'atelier.
            </p>
          </div>
        ) : (
          <div className="atl-newpage__body">
            <fieldset>
              <legend>1. Tes références — photos fournisseur, logo, palette ({refs.length} / {MAX_REFS})</legend>
              <div
                className="atl-studio__drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
                onPaste={(e) => addFiles([...e.clipboardData.items].map((i) => i.getAsFile()).filter(Boolean))}
                tabIndex={0}
              >
                {refs.map((r, i) => (
                  <figure key={i} className="atl-studio__ref">
                    <img src={r.dataUrl} alt="" />
                    <select value={r.tag} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)))}>
                      {TAGS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setRefs(refs.filter((_, j) => j !== i))} aria-label="Retirer">
                      ×
                    </button>
                  </figure>
                ))}
                {refs.length < MAX_REFS && (
                  <label className="atl-studio__add">
                    <input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                    <b>+ Ajouter</b>
                    <small>Glisse, colle ou choisis des images</small>
                  </label>
                )}
              </div>
            </fieldset>

            <fieldset className="atl-newpage__grid">
              <legend>2. Réglages</legend>
              <label>
                <span>Nom de ton produit</span>
                <input value={form.produit} onChange={set("produit")} placeholder="ex. Clearflow Cayenne Complex" />
              </label>
              <label>
                <span>Mode</span>
                <select value={form.mode} onChange={set("mode")}>
                  <option value="fidele">Fidèle : même image, avec ton produit</option>
                  <option value="pub">Publicité : version plus percutante</option>
                </select>
              </label>
              <label>
                <span>Rythme</span>
                <select value={form.rythme} onChange={set("rythme")}>
                  <option value="tout">Tout faire d'un coup</option>
                  <option value="5">Les 5 premières, puis s'arrêter</option>
                  <option value="une-par-une">Me montrer chaque image avant la suivante</option>
                </select>
              </label>
              <label>
                <span>Textes à changer dans les images (facultatif)</span>
                <input value={form.textes} onChange={set("textes")} placeholder="ex. Aurivita → Clearflow ; 60 softgels → 90 softgels" />
              </label>
            </fieldset>

            <fieldset>
              <legend>
                3. Photos d'origine à refaire ({chosen.size} / {targets.length})
                {targets.length > 0 && (
                  <button
                    type="button"
                    className="atl-score__more"
                    onClick={() => setChosen(chosen.size === targets.length ? new Set() : new Set(targets.map((t) => t.key)))}
                  >
                    {chosen.size === targets.length ? "Tout décocher" : "Tout cocher"}
                  </button>
                )}
              </legend>
              {targets.length === 0 ? (
                <p className="atl-newpage__hint">Cette page n'affiche plus aucune photo d'origine : tout est déjà remplacé.</p>
              ) : (
                <ul className="atl-studio__targets">
                  {targets.map((t) => (
                    <li key={t.key} className={chosen.has(t.key) ? "is-on" : ""}>
                      <label>
                        <input type="checkbox" checked={chosen.has(t.key)} onChange={() => toggle(t.key)} />
                        <img src={t.source} alt="" />
                        <span>
                          <b>{t.sectionLabel}</b>
                          <small>
                            {t.settingLabel}
                            {t.blockType ? ` · bloc ${t.blockIndex + 1}` : ""}
                          </small>
                          {t.brief && <small className="atl-studio__brief">{t.brief}</small>}
                        </span>
                      </label>
                      {chosen.has(t.key) && (
                        <input
                          className="atl-studio__note"
                          value={notes[t.key] ?? ""}
                          onChange={(e) => setNotes({ ...notes, [t.key]: e.target.value })}
                          placeholder="Consigne pour cette image (facultatif)"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          </div>
        )}

        <footer className="atl-newpage__foot">
          {state?.error && <span className="atl-topbar__error">{state.error}</span>}
          <button type="button" onClick={onClose}>
            {state?.done ? "Fermer" : "Annuler"}
          </button>
          {!state?.done && (
            <button type="button" className="atl-newpage__create" disabled={state?.busy || targets.length === 0} onClick={send}>
              {state?.busy ? "Envoi…" : `Enregistrer et demander ${chosen.size} image(s)`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
