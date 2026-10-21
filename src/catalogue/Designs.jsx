import { useEffect, useState } from "react";
import { designs, designById } from "../engine/designs.js";
import { ROLES, applyDesign } from "../engine/design.js";
import { sections } from "../engine/sections.js";
import { normalizeProps } from "../engine/render.js";
import { SourceLink, useHoverPreview } from "./hover.jsx";
import { confirmDelete } from "../projects.js";

const sectionsById = Object.fromEntries(sections.map((s) => [s.id, s]));

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erreur");
  return data;
}

// Applique un design à une page : copie de sécurité, application, enregistrement.
export async function applyDesignToPage(pageName, design) {
  const page = await api("GET", `/api/pages/${pageName}`);
  // Valeurs complètes (y compris les valeurs par défaut) pour reconnaître les rôles.
  page.content = (page.content ?? []).map((item) =>
    sectionsById[item.type] ? { ...item, props: normalizeProps(sectionsById[item.type], item.props) } : item,
  );
  const previous = designById[page.root?.props?.design] ?? null;
  const result = applyDesign(page, design, sectionsById, previous);
  const snap = await api("POST", `/api/pages/${pageName}/snapshot`);
  await api("PUT", `/api/pages/${pageName}`, result.page);
  // Pour le menu « Design » de l'atelier : les derniers designs appliqués.
  await api("POST", "/api/designs/recents", { id: design.id }).catch(() => {});
  return { ...result, snapshot: snap.file };
}

function Swatches({ design }) {
  const c = design.tokens.couleurs ?? {};
  return (
    <div className="cat-swatches">
      {ROLES.filter((r) => c[r.id]).map((r) => (
        <span key={r.id} title={`${r.label} — ${c[r.id]}`} style={{ background: c[r.id] }} />
      ))}
    </div>
  );
}

// Carte de design : miniature (grand aperçu au survol) + contenu.
function DesignCard({ design, isCurrent, onDetails, children }) {
  const hover = useHoverPreview("design", design);
  return (
    <article className={`cat-card${isCurrent ? " is-current" : ""}`}>
      <button
        type="button"
        className="cat-card__thumb cat-card__thumb--design"
        onClick={() => {
          hover.onMouseLeave();
          onDetails();
        }}
        {...(design.thumbnail ? hover : {})}
      >
        {design.thumbnail ? <img src={design.thumbnail} alt="" loading="lazy" /> : <span>Pas de miniature</span>}
      </button>
      {children}
    </article>
  );
}

function DesignPreview({ design, onClose, onApply, targetPage }) {
  const c = design.tokens.couleurs ?? {};
  const f = design.tokens.polices ?? {};
  return (
    <div className="cat-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cat-modal__panel">
        <header className="cat-modal__head">
          <div>
            <h2>{design.id}.md</h2>
            <p className="cat-muted">
              <SourceLink url={design.source} prefix="Extrait de" />
            </p>
          </div>
          {targetPage && (
            <button type="button" className="cat-btn" style={{ marginLeft: "auto" }} onClick={() => onApply(design)}>
              Appliquer à « {targetPage} »
            </button>
          )}
          <button type="button" className="cat-close" onClick={onClose} aria-label="Fermer" style={targetPage ? {} : { marginLeft: "auto" }}>
            ×
          </button>
        </header>
        <div className="cat-design-detail">
          {design.thumbnail && <img src={design.thumbnail} alt="" />}
          <div>
            <h3>Polices</h3>
            <p>
              Titres : <b>{f.titres ?? "—"}</b> · Texte : <b>{f.texte ?? "—"}</b>
            </p>
            <h3>Couleurs</h3>
            <table className="cat-roles">
              <tbody>
                {ROLES.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="cat-chip" style={{ background: c[r.id] ?? "transparent" }} />
                    </td>
                    <td>{r.label}</td>
                    <td className="cat-muted">{c[r.id] ?? "non défini"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <details className="cat-md">
          <summary>Voir le fichier {design.id}.md complet</summary>
          <pre>{design.markdown}</pre>
        </details>
      </div>
    </div>
  );
}

export function DesignsView({ targetPage, onMessage }) {
  const [preview, setPreview] = useState(null);
  const [pages, setPages] = useState([]);
  const [chosenPage, setChosenPage] = useState(targetPage ?? "");
  const [busy, setBusy] = useState(null);
  const [currentDesign, setCurrentDesign] = useState(null);

  useEffect(() => {
    api("GET", "/api/pages").then(setPages).catch(() => {});
  }, []);
  useEffect(() => {
    if (!chosenPage) return setCurrentDesign(null);
    api("GET", `/api/pages/${chosenPage}`)
      .then((p) => setCurrentDesign(p.root?.props?.design ?? null))
      .catch(() => setCurrentDesign(null));
  }, [chosenPage]);

  // Supprimer un design.md : les pages qui l'utilisent gardent leurs couleurs et
  // polices actuelles, mais n'ont plus de design.md de référence.
  async function remove(design) {
    const using = [];
    for (const name of pages) {
      const p = await api("GET", `/api/pages/${name}`).catch(() => null);
      if (p?.root?.props?.design === design.id) using.push(`• ${p.root.props.title ?? name}`);
    }
    const details = [`${design.id}.md`];
    if (using.length) details.push("Ces pages l'utilisent (elles gardent leurs couleurs et polices actuelles) :", ...using);
    if (!confirmDelete("ce design", details)) return;
    try {
      await api("POST", `/api/corbeille/designs/${design.id}`);
      onMessage({ text: `${design.id}.md déplacé dans la corbeille. Le catalogue se recharge…` });
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      onMessage({ error: true, text: `Échec : ${e.message}` });
    }
  }

  async function apply(design) {
    if (!chosenPage) return onMessage({ error: true, text: "Choisis d'abord la page à laquelle appliquer le design." });
    setBusy(design.id);
    try {
      const r = await applyDesignToPage(chosenPage, design);
      onMessage({
        text: `${design.id}.md appliqué à « ${chosenPage} » : ${r.changed} couleur(s) changée(s)${r.offPalette ? ` (dont ${r.offPalette} hors palette, ramenée(s) au design)` : ""}. Copie de sécurité : ${r.snapshot}. Retour à l'atelier…`,
      });
      setTimeout(() => (location.href = `/?page=${encodeURIComponent(chosenPage)}`), 1600);
    } catch (e) {
      onMessage({ error: true, text: `Échec : ${e.message}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1>Designs</h1>
      <p className="cat-lead">
        Chaque fichier design.md décrit l'univers visuel d'un site : polices, couleurs et formes. Appliquer un design à une page
        change les polices et les couleurs de toutes ses sections ; une copie de sécurité de la page est faite avant.
      </p>

      <section className="cat-panel cat-apply">
        <label className="cat-field">
          <span>Page à laquelle appliquer un design</span>
          <select value={chosenPage} onChange={(e) => setChosenPage(e.target.value)}>
            <option value="">Choisir une page…</option>
            {pages.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        {chosenPage && (
          <p className="cat-muted">
            Design actuel : <b>{currentDesign ? `${currentDesign}.md` : "aucun"}</b>
          </p>
        )}
      </section>

      {designs.length === 0 ? (
        <div className="cat-empty">Aucun design pour l'instant. Chaque import de site en ajoute un.</div>
      ) : (
        <div className="cat-grid">
          {designs.map((d) => (
            <DesignCard key={d.id} design={d} isCurrent={d.id === currentDesign} onDetails={() => setPreview(d)}>
              <div className="cat-card__body">
                <strong>{d.id}.md</strong>
                <span className="cat-muted cat-card__meta">
                  {d.tokens.polices?.titres ?? "?"} · {d.tokens.polices?.texte ?? "?"}
                </span>
                <span className="cat-muted cat-card__meta">
                  <SourceLink url={d.source} prefix="Extrait de" />
                </span>
                <Swatches design={d} />
                <div className="cat-card__badges">
                  {d.id === currentDesign && <span className="cat-badge cat-badge--green">Appliqué à cette page</span>}
                  {d.error && <span className="cat-badge cat-badge--red">À corriger : {d.error}</span>}
                </div>
              </div>
              <div className="cat-card__actions">
                <button type="button" className="cat-btn cat-btn--ghost" onClick={() => setPreview(d)}>
                  Détails
                </button>
                <button type="button" className="cat-btn" disabled={!!busy || !!d.error} onClick={() => apply(d)}>
                  {busy === d.id ? "Application…" : chosenPage ? "Appliquer" : "Appliquer à une page"}
                </button>
                <button type="button" className="cat-btn cat-btn--danger" disabled={!!busy} onClick={() => remove(d)}>
                  Supprimer
                </button>
              </div>
            </DesignCard>
          ))}
        </div>
      )}

      {preview && (
        <DesignPreview
          design={preview}
          targetPage={chosenPage}
          onClose={() => setPreview(null)}
          onApply={(d) => {
            setPreview(null);
            apply(d);
          }}
        />
      )}
    </>
  );
}
