import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isOriginalPhoto } from "./engine/render.js";

// Champs du panneau de droite, sur le modèle de l'éditeur de thème Shopify :
// titres de groupe, aide sous le champ, interrupteurs, curseurs, couleurs avec
// leur rôle de design, image avec vignette et menu (remplacer, téléverser…).

const pageName = () => new URLSearchParams(location.search).get("page") ?? "brouillon";
const BRIEF = /\[[^\]]*\]/;
const wordCount = (s) => String(s ?? "").replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/).filter(Boolean).length;
const targetWords = (s) => String(s ?? "").match(/(\d+)\s*(?:-|à)?\s*(\d+)?\s*mots?/i);

function Label({ field, children, aside }) {
  return (
    <span className="atl-f__label">
      <span>{field.label}</span>
      {aside}
      {children}
    </span>
  );
}

function Info({ field }) {
  return field.info ? <span className="atl-f__info">{field.info}</span> : null;
}

// ---- Titre de groupe (réglage « header » du schéma Shopify) ----
export function HeaderField({ field }) {
  return <div className="atl-f__group">{field.label}</div>;
}

// ---- Texte : une ligne ou plusieurs, avec la consigne et le nombre de mots ----
export function TextSetting({ field, value, onChange }) {
  const multiline = field.multiline;
  const isBrief = BRIEF.test(value ?? "");
  const target = isBrief ? targetWords(value) : null;
  const ref = useRef(null);
  useEffect(() => {
    if (!multiline || !ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight + 2}px`;
  }, [value, multiline]);
  const Input = multiline ? "textarea" : "input";
  return (
    <label className="atl-f">
      <Label field={field} aside={isBrief ? <em className="atl-f__brief">consigne</em> : null} />
      <Input
        ref={ref}
        className={`atl-f__input${isBrief ? " is-brief" : ""}`}
        value={value ?? ""}
        rows={multiline ? 2 : undefined}
        placeholder={field.placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="atl-f__info">
        {isBrief
          ? `À remplacer par ton texte${target ? ` (${target[2] ? `${target[1]} à ${target[2]}` : target[1]} mots)` : ""}.`
          : value
            ? `${wordCount(value)} mot(s)`
            : ""}
      </span>
      <Info field={field} />
    </label>
  );
}

// ---- Interrupteur (checkbox) ----
export function ToggleSetting({ field, value, onChange }) {
  return (
    <label className="atl-f atl-f--row">
      <span className="atl-f__label">
        <span>{field.label}</span>
      </span>
      <button type="button" role="switch" aria-checked={!!value} className={`atl-switch${value ? " is-on" : ""}`} onClick={() => onChange(!value)}>
        <span />
      </button>
      <Info field={field} />
    </label>
  );
}

// ---- Curseur (range) avec sa valeur et son unité ----
export function RangeSetting({ field, value, onChange }) {
  const v = Number(value ?? field.min ?? 0);
  return (
    <label className="atl-f">
      <Label field={field} />
      <span className="atl-range">
        <input type="range" min={field.min} max={field.max} step={field.step ?? 1} value={v} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="atl-range__value">
          <input type="number" min={field.min} max={field.max} step={field.step ?? 1} value={v} onChange={(e) => onChange(Number(e.target.value))} />
          {field.unit && <em>{field.unit}</em>}
        </span>
      </span>
      <Info field={field} />
    </label>
  );
}

// ---- Liste (select / radio) ----
export function SelectSetting({ field, value, onChange }) {
  return (
    <label className="atl-f">
      <Label field={field} />
      <select className="atl-f__input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Info field={field} />
    </label>
  );
}

// ---- Couleur : pastille, code, et le rôle de design qui la pilote ----
export function ColorSetting({ field, value, onChange }) {
  return (
    <label className="atl-f">
      <Label field={field} aside={field.role ? <em className="atl-f__role" title="Rôle dans le design.md : suit le design appliqué">{field.role}</em> : null} />
      <span className="atl-color">
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} />
        <input className="atl-f__input" type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      </span>
      <Info field={field} />
    </label>
  );
}

// ---- Lien ----
export function UrlSetting({ field, value, onChange }) {
  return (
    <label className="atl-f">
      <Label field={field} />
      <input className="atl-f__input" value={value ?? ""} placeholder="/collections/all, /products/…, https://…" onChange={(e) => onChange(e.target.value)} />
      <span className="atl-f__info">Où mène ce lien. Vide : le bouton ne mène nulle part.</span>
    </label>
  );
}

// ---- Image : vignette + menu Remplacer / Téléverser / Mes images / Lien / Retirer ----
const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

async function upload(file) {
  const res = await fetch(`/api/medias/${pageName()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, dataUrl: await readAsDataUrl(file) }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body.url;
}

function MediaPicker({ onPick, onClose }) {
  // Trois sources (2026-11-09) : images créées par l'IA, images téléversées
  // (pour une page de projet : celles de tout le projet, rangées dans
  // medias/projets/<projet>/), et captures du site d'origine
  // (imports/<slug>/images/, jamais modifiées) quand la page vient d'un import.
  const [tab, setTab] = useState("ia");
  const [all, setAll] = useState(null);
  const [origin, setOrigin] = useState(null);
  useEffect(() => {
    fetch(`/api/medias/${pageName()}?detail=1`)
      .then((r) => r.json())
      .then((list) => {
        const imgs = list.filter((x) => x.kind !== "video");
        setAll(imgs);
        // Onglet ouvert : le premier qui a des images.
        if (!imgs.some((x) => x.kind === "ia")) setTab(imgs.length ? "televersee" : "ia");
      })
      .catch(() => setAll([]));
    fetch(`/api/pages/${pageName()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((page) => page?.root?.props?.importSource ?? null)
      .then((slug) => (slug ? fetch(`/api/medias-origin/${slug}`).then((r) => r.json()) : []))
      .then((list) => setOrigin(list.filter((u) => u.startsWith("/imports/"))))
      .catch(() => setOrigin([]));
  }, []);
  const hasOrigin = (origin?.length ?? 0) > 0;
  const created = all?.filter((x) => x.kind === "ia").map((x) => x.url) ?? null;
  const uploaded = all?.filter((x) => x.kind === "televersee").map((x) => x.url) ?? null;
  const shown = tab === "origine" ? origin : tab === "televersee" ? uploaded : created;
  return createPortal(
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="atl-modal__panel atl-newpage">
        <header className="atl-modal__head">
          <h2>Choisir une image</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="atl-newpage__body">
          <div className="atl-mediatabs" role="tablist">
            {[
              ["ia", "Créées par l'IA", created?.length ?? 0],
              ["televersee", "Téléversées", uploaded?.length ?? 0],
              ...(hasOrigin ? [["origine", "Site d'origine", origin.length]] : []),
            ].map(([id, label, n]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
                {label} ({n})
              </button>
            ))}
          </div>
          {tab === "origine" && <p className="atl-newpage__hint">Photos de l'inspiration importée : à reprendre, jamais à publier telles quelles.</p>}
          {shown == null ? (
            <p>Chargement…</p>
          ) : shown.length === 0 ? (
            <p className="atl-newpage__hint">
              {tab === "origine"
                ? "Aucune capture d'origine pour cette page."
                : tab === "televersee"
                  ? "Aucune image téléversée. Utilise « Téléverser » dans le menu de l'image."
                  : "Aucune image créée par l'IA pour l'instant. Refais une image avec l'IA ou le Studio d'images."}
            </p>
          ) : (
            <div className="atl-media-grid">
              {shown.map((m) => (
                <button type="button" key={m} onClick={() => onPick(m)}>
                  <img src={m} alt="" loading="lazy" />
                  <small>{m.split("/").pop()}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ImageSetting({ field, value, onChange }) {
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const original = !value || isOriginalPhoto(value);
  const shown = value && !isOriginalPhoto(value) ? value : value || field.original;

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await upload(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const act = (fn) => () => {
    setMenu(false);
    fn();
  };

  return (
    <div className="atl-f">
      <Label field={field} />
      <div className={`atl-img${original ? " is-original" : ""}`}>
        <div className="atl-img__thumb">
          {shown ? <img src={shown} alt="" /> : <span>Aucune image</span>}
          {original && shown && <em>Photo d'origine — à remplacer</em>}
        </div>
        <div className="atl-img__actions">
          <button type="button" className="atl-img__btn" onClick={() => setMenu(!menu)} disabled={busy}>
            {busy ? "Envoi…" : original ? "Choisir une image ▾" : "Remplacer ▾"}
          </button>
          {menu && (
            <div className="atl-img__menu" onMouseLeave={() => setMenu(false)}>
              <button type="button" onClick={act(() => fileRef.current?.click())}>
                Téléverser depuis l'ordinateur
              </button>
              <button type="button" onClick={act(() => setPicker(true))}>
                Mes images (cette page)
              </button>
              <button
                type="button"
                onClick={act(() => {
                  const url = prompt("Lien de l'image (https://…) :", value && !isOriginalPhoto(value) ? value : "");
                  if (url) onChange(url.trim());
                })}
              >
                Coller un lien
              </button>
              <button type="button" onClick={act(() => window.dispatchEvent(new CustomEvent("atl-ai-image")))}>
                ✨ Refaire avec l'IA
              </button>
              {!original && (
                <button type="button" className="is-danger" onClick={act(() => onChange(""))}>
                  Retirer mon image
                </button>
              )}
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
      {field.brief && <span className="atl-f__info">Ta photo : {field.brief}</span>}
      {error && <span className="atl-f__info atl-f__error">{error}</span>}
      {picker && (
        <MediaPicker
          onClose={() => setPicker(false)}
          onPick={(m) => {
            onChange(m);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}
