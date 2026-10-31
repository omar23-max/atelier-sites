import { useEffect, useState } from "react";
import { designs, designById } from "../engine/designs.js";
import { ROLES, applyDesign } from "../engine/design.js";
import { sections } from "../engine/sections.js";
import { normalizeProps } from "../engine/render.js";
import { SourceLink } from "./hover.jsx";
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

// Carte de design : un échantillon vivant du design.md (qui défile), puis le
// contenu. Clic sur le titre de l'échantillon : la fiche complète.
function DesignCard({ design, isCurrent, onDetails, children }) {
  return (
    <article className={`cat-card cat-dcard${isCurrent ? " is-current" : ""}`}>
      <DesignSpecimen design={design} onOpen={onDetails} />
      {children}
    </article>
  );
}

// Échantillon d'un design, lu dans ses jetons : hero (titre, sous-titre,
// boutons), titres H1-H3 et texte avec leur police et leur taille, sections
// claire et sombre, couleurs. Tailles réduites de moitié pour tenir dans la
// carte ; on fait défiler l'échantillon pour tout voir.
function DesignSpecimen({ design, onOpen }) {
  const c = design.tokens.couleurs ?? {};
  const r = roleStyles(design);
  useDesignFonts([r.h1.police, r.sousTitre.police, r.h2.police, r.h3.police, r.texte.police, r.bouton.police]);
  const small = (role, max) => ({ ...css(role), fontSize: Math.max(10, Math.min((role.taille ?? 16) * 0.5, max)) });
  const button = {
    ...small(r.bouton, 12),
    background: r.bouton.fond ?? c.bouton ?? "#111",
    color: r.bouton.couleur ?? c["bouton-texte"] ?? "#fff",
    borderRadius: r.bouton.rayon ?? 6,
    padding: "6px 12px",
    display: "inline-block",
  };
  const ghost = { ...button, background: "transparent", color: r.bouton.fond ?? c.bouton ?? "#111", border: `1px solid ${r.bouton.fond ?? c.bouton ?? "#111"}` };
  const rows = [
    ["H1", r.h1, r.h1.exemple || "Grand titre"],
    ["H2", r.h2, r.h2.exemple || "Titre de section"],
    ["H3", r.h3, r.h3.exemple || "Petit titre"],
    ["Sous-titre", r.sousTitre, r.sousTitre.exemple || "Une phrase qui précise la promesse"],
    ["Texte", r.texte, r.texte.exemple || "Le texte des paragraphes de la page."],
  ];
  const label = (role) => [role.police, role.taille && `${Math.round(role.taille)} px`, role.graisse].filter(Boolean).join(" · ");
  return (
    <div className="cat-spec" style={{ background: c.fond ?? "#fff", color: c.texte ?? "#111" }} title="Fais défiler pour tout voir">
      <button type="button" className="cat-spec__hero" onClick={onOpen} title="Ouvrir la fiche du design">
        <span style={{ ...small(r.h1, 26), display: "block" }}>{r.h1.exemple || "Grand titre"}</span>
        <span style={{ ...small(r.sousTitre, 12), display: "block", marginTop: 6 }}>{r.sousTitre.exemple || "Une phrase qui précise la promesse"}</span>
        <span className="cat-spec__btns">
          <span style={button}>{r.bouton.exemple || "Acheter"}</span>
          <span style={ghost}>En savoir plus</span>
        </span>
      </button>
      <div className="cat-spec__typo">
        {rows.map(([name, role, sample]) => (
          <div key={name}>
            <small>
              {name} · {label(role)}
            </small>
            <div style={small(role, name === "Texte" || name === "Sous-titre" ? 12 : 20)}>{sample}</div>
          </div>
        ))}
      </div>
      <div className="cat-spec__blocks">
        <div style={{ background: c.surface ?? "#f6f6f6" }}>
          <span style={{ color: c.etoiles ?? "#f5b301" }}>★★★★★</span>
          <b style={{ ...small(r.h3, 12), color: c.texte }}>Carte claire</b>
        </div>
        <div style={{ background: c["fond-sombre"] ?? "#222", color: c["texte-sur-sombre"] ?? "#fff" }}>
          <b style={{ ...small(r.h3, 12), color: c["texte-sur-sombre"] ?? "#fff" }}>Section sombre</b>
          <span style={{ fontSize: 10, color: c["accent-clair"] ?? c.accent }}>accent</span>
        </div>
      </div>
      <div className="cat-spec__colors">
        {ROLES.filter((x) => c[x.id]).map((x) => (
          <div key={x.id} title={x.label}>
            <span style={{ background: c[x.id] }} />
            <small>{x.label}</small>
            <code>{c[x.id]}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

// Styles d'un rôle (relevés sur le site, sinon déduits des polices et couleurs).
function roleStyles(design) {
  const c = design.tokens.couleurs ?? {};
  const f = design.tokens.polices ?? {};
  const s = design.tokens.styles ?? {};
  const base = (police, taille, graisse, couleur, extra = {}) => ({ police, taille, graisse, couleur, interligne: null, ...extra });
  return {
    entete: s.entete ?? base(f.texte, 15, 500, c.texte),
    h1: s.h1 ?? base(f.titres, 44, 700, c.texte),
    sousTitre: s.sousTitre ?? base(f.texte, 20, 500, c.texte),
    h2: s.h2 ?? base(f.titres, 32, 700, c.texte),
    h3: s.h3 ?? base(f.titres, 20, 600, c.texte),
    texte: s.texte ?? base(f.texte, 16, 400, c.texte, { interligne: 1.6 }),
    bouton: s.bouton ?? base(f.texte, 16, 700, c["bouton-texte"], { fond: c.bouton, rayon: "8px", marges: "14px 28px" }),
    mesure: Boolean(design.tokens.styles),
  };
}

function css(r) {
  if (!r) return {};
  return {
    fontFamily: r.police ? `"${r.police}", system-ui, sans-serif` : undefined,
    fontSize: r.taille ? `${r.taille}px` : undefined,
    fontWeight: r.graisse,
    lineHeight: r.interligne ?? 1.25,
    color: r.couleur ?? undefined,
    textTransform: r.casse ?? undefined,
    letterSpacing: r.espacement ?? undefined,
  };
}

const spec = (r) =>
  [r.police ?? "police ?", r.taille && `${r.taille} px`, r.graisse && `graisse ${r.graisse}`, r.interligne && `interligne ${r.interligne}`, r.casse, r.couleur]
    .filter(Boolean)
    .join(" · ");

// Charge les polices du design depuis Google Fonts (celles qui y sont).
function useDesignFonts(names) {
  useEffect(() => {
    const families = [...new Set(names.filter(Boolean))];
    if (!families.length) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700;800`).join("&")}&display=swap`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [names.join("|")]);
}

// « Inspecter » : le design.md présenté comme une charte (en-tête, hero,
// titres, texte, boutons, sections sombres, couleurs).
function DesignInspect({ design }) {
  const c = design.tokens.couleurs ?? {};
  const r = roleStyles(design);
  useDesignFonts([r.entete.police, r.h1.police, r.sousTitre.police, r.h2.police, r.h3.police, r.texte.police, r.bouton.police]);
  const button = { ...css(r.bouton), background: r.bouton.fond ?? c.bouton, borderRadius: r.bouton.rayon ?? 8, padding: r.bouton.marges ?? "14px 28px", border: 0, display: "inline-block" };
  const rows = [
    ["En-tête (menu)", r.entete, r.entete.exemple || "Boutique · Nos produits · Avis"],
    ["Grand titre (H1 / hero)", r.h1, r.h1.exemple || "Le grand titre de la page"],
    ["Sous-titre du hero", r.sousTitre, r.sousTitre.exemple || "Une phrase qui précise la promesse"],
    ["Titre de section (H2)", r.h2, r.h2.exemple || "Titre de section"],
    ["Petit titre (H3)", r.h3, r.h3.exemple || "Petit titre"],
    ["Texte courant", r.texte, r.texte.exemple || "Le texte des paragraphes de la page, tel qu'il s'affiche."],
  ];
  return (
    <div className="cat-inspect">
      <p className="cat-muted">
        {r.mesure ? "Styles relevés sur la page d'origine (élément le plus fréquent pour chaque rôle)." : "Pas de relevé de la page d'origine : styles déduits des polices et couleurs du design."}
      </p>
      <div className="cat-inspect__mock" style={{ background: c.fond ?? "#fff" }}>
        <div className="cat-inspect__bar" style={{ borderColor: c["surface-forte"] ?? "#eee" }}>
          <b style={{ ...css(r.h3), fontSize: 18, textTransform: "none" }}>Marque</b>
          <span style={css(r.entete)}>Boutique</span>
          <span style={css(r.entete)}>Avis</span>
          <span style={css(r.entete)}>Contact</span>
        </div>
        <div className="cat-inspect__hero">
          <div style={{ ...css(r.h1), fontSize: Math.min(r.h1.taille ?? 44, 46) }}>{r.h1.exemple || "Le grand titre de la page"}</div>
          <div style={{ ...css(r.sousTitre), marginTop: 10 }}>{r.sousTitre.exemple || "Une phrase qui précise la promesse"}</div>
          <div style={{ marginTop: 18 }}>
            <span style={button}>{r.bouton.exemple || "Acheter maintenant"}</span>
          </div>
        </div>
      </div>

      <h3>Typographie</h3>
      <table className="cat-typo">
        <tbody>
          {rows.map(([label, role, sample]) => (
            <tr key={label}>
              <th>
                {label}
                <small>{spec(role)}</small>
              </th>
              <td>
                <div style={{ ...css(role), fontSize: Math.min(role.taille ?? 16, 40) }}>{sample}</div>
              </td>
            </tr>
          ))}
          <tr>
            <th>
              Bouton
              <small>
                {spec(r.bouton)} · fond {r.bouton.fond ?? c.bouton} · rayon {r.bouton.rayon ?? "?"}
                {r.bouton.hauteur ? ` · hauteur ${r.bouton.hauteur} px` : ""}
              </small>
            </th>
            <td>
              <span style={button}>{r.bouton.exemple || "Acheter maintenant"}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Sections</h3>
      <div className="cat-inspect__blocks">
        <div style={{ background: c.surface ?? "#f6f6f6", color: c.texte }}>
          <div style={{ color: c.etoiles ?? "#f5b301", fontSize: 18 }}>★★★★★</div>
          <div style={{ ...css(r.h3), color: c.texte, fontSize: 17 }}>Carte claire (surface)</div>
          <div style={{ ...css(r.texte), fontSize: 14 }}>Avis, encadrés, cartes produit.</div>
        </div>
        <div style={{ background: c["fond-sombre"] ?? "#222", color: c["texte-sur-sombre"] ?? "#fff" }}>
          <div style={{ ...css(r.h3), color: c["texte-sur-sombre"] ?? "#fff", fontSize: 17 }}>Section sombre</div>
          <div style={{ ...css(r.texte), color: c["texte-sur-sombre"] ?? "#fff", fontSize: 14 }}>
            Texte sur fond sombre, <b style={{ color: c["accent-clair"] ?? c.accent }}>accent clair</b>.
          </div>
        </div>
        <div style={{ background: c.fond ?? "#fff", color: c.texte, border: `1px solid ${c["surface-forte"] ?? "#eee"}` }}>
          <div style={{ ...css(r.h3), color: c.texte, fontSize: 17 }}>Fond de page</div>
          <div style={{ ...css(r.texte), fontSize: 14 }}>
            Lien et icônes : <b style={{ color: c.accent }}>couleur d'accent ✓</b>
          </div>
        </div>
      </div>

      <h3>Couleurs</h3>
      <div className="cat-inspect__colors">
        {ROLES.filter((x) => c[x.id]).map((x) => (
          <div key={x.id}>
            <span style={{ background: c[x.id] }} />
            <b>{x.label}</b>
            <small>{c[x.id]}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesignPreview({ design, onClose, onApply, targetPage }) {
  const c = design.tokens.couleurs ?? {};
  const f = design.tokens.polices ?? {};
  const [tab, setTab] = useState("inspect");
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
          <span className="cat-seg" style={{ marginLeft: "auto" }}>
            <button type="button" className={tab === "inspect" ? "is-on" : ""} onClick={() => setTab("inspect")}>
              Inspecter
            </button>
            <button type="button" className={tab === "file" ? "is-on" : ""} onClick={() => setTab("file")}>
              Aperçu et fichier
            </button>
          </span>
          <button type="button" className="cat-btn" disabled={!targetPage} title={targetPage ? "" : "Ouvre d'abord une page dans l'atelier"} onClick={() => onApply(design)}>
            {targetPage ? `Appliquer dans la page courante (« ${targetPage} »)` : "Appliquer dans la page courante"}
          </button>
          <button type="button" className="cat-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        {tab === "inspect" && <DesignInspect design={design} />}
        {tab === "file" && <>
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
        </>}
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
        <div className="cat-grid cat-grid--designs">
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
                  Inspecter
                </button>
                <button
                  type="button"
                  className="cat-btn"
                  disabled={!!busy || !!d.error}
                  onClick={() => apply(d)}
                  title={chosenPage ? `Appliquer ce design à « ${chosenPage} »` : "Appliquer ce design à une page"}
                >
                  {busy === d.id ? "Application…" : "Appliquer"}
                </button>
                <button type="button" className="cat-btn cat-btn--danger cat-btn--icon" disabled={!!busy} onClick={() => remove(d)} title="Supprimer ce design" aria-label="Supprimer ce design">
                  🗑
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
