import { useEffect, useState } from "react";
import { pageTypeById } from "../engine/page-types.js";
import { nicheLabel } from "./Templates.jsx";

// « Partir de » : un bouton qui ouvre une fenêtre avec les miniatures —
// une page vide, une copie d'une page du projet, ou un template (filtré par le
// type de page choisi, avec recherche).
const thumbOf = (t) => t.vignette?.replace(/vignette\.png$/, "carte.jpg");
// noBlank : pas de « page vide » (page mère : on part d'une page ou d'un template).
export function SourcePicker({ value, onChange, templates, pages, pageType, noBlank = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sameType, setSameType] = useState(true);
  const usable = templates.filter((t) => t.page);
  const chosenTpl = usable.find((t) => t.page === value);
  const chosenPage = pages.find((p) => p.info.name === value);
  const label = chosenTpl ? chosenTpl.nom : chosenPage ? `Copie de « ${chosenPage.info.title} »` : noBlank ? "Choisir une page ou un template…" : "Une page vide";
  const shownPages = noBlank && sameType ? pages.filter((p) => p.info.pageType === pageType) : pages;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = usable.filter(
    (t) => (!sameType || t.pageType === pageType) && words.every((w) => [t.nom, t.marque, t.niche, t.url].join(" ").toLowerCase().includes(w)),
  );
  const pick = (v) => (onChange(v), setOpen(false));
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <button type="button" className="cat-source-btn" onClick={() => setOpen(true)} title="Choisir le point de départ">
        {chosenTpl?.vignette && <img src={thumbOf(chosenTpl)} alt="" />}
        <span>{label}</span>
        <i>▾</i>
      </button>
      {open && (
        <div className="cat-modal" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="cat-modal__panel cat-modal__panel--wide cat-picker">
            <header className="cat-modal__head">
              <div>
                <h2>Partir de…</h2>
                <p className="cat-muted">Clique sur une miniature pour la choisir.</p>
              </div>
              <button type="button" className="cat-close" onClick={() => setOpen(false)} aria-label="Fermer">
                ×
              </button>
            </header>
            <div className="cat-picker__bar">
              <input className="cat-search" autoFocus placeholder="Rechercher un template : marque, produit, niche, site…" value={q} onChange={(e) => setQ(e.target.value)} />
              <label className="cat-picker__type">
                <input type="checkbox" checked={sameType} onChange={(e) => setSameType(e.target.checked)} />
                Seulement « {pageTypeById[pageType]?.label ?? pageType} »
              </label>
            </div>
            <div className="cat-picker__grid">
              {!noBlank && (
                <button type="button" className={`cat-picker__item is-blank${!value ? " is-on" : ""}`} onClick={() => pick("")}>
                  <span className="cat-picker__thumb">＋</span>
                  <b>Une page vide</b>
                </button>
              )}
              {shownPages.map((p) => (
                <button key={p.info.name} type="button" className={`cat-picker__item${value === p.info.name ? " is-on" : ""}`} onClick={() => pick(p.info.name)}>
                  <span className="cat-picker__thumb">
                    <img src={`/medias/_vignettes/${p.info.name}.png`} alt="" loading="lazy" />
                  </span>
                  <b>Copie de « {p.info.title} »</b>
                  <small>Page du projet</small>
                </button>
              ))}
              {shown.map((t) => (
                <button key={t.id} type="button" className={`cat-picker__item${value === t.page ? " is-on" : ""}`} onClick={() => pick(t.page)} title={t.nom}>
                  <span className="cat-picker__thumb">{t.vignette ? <img src={thumbOf(t)} alt="" loading="lazy" decoding="async" /> : null}</span>
                  <b>{t.nom}</b>
                  <small>
                    {pageTypeById[t.pageType]?.label ?? t.pageType}
                    {t.niche ? ` · ${nicheLabel(t.niche)}` : ""}
                  </small>
                </button>
              ))}
            </div>
            {shown.length === 0 && <p className="cat-empty">Aucun template ne correspond. Décoche « Seulement … » pour voir tous les types.</p>}
          </div>
        </div>
      )}
    </>
  );
}
