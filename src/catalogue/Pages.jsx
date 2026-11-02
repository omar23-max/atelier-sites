import { useEffect, useMemo, useState } from "react";
import { sections } from "../engine/sections.js";
import { normalizeProps } from "../engine/render.js";
import { PAGE_TYPES, pageTypeById } from "../engine/page-types.js";
import { scorePage } from "../engine/page-score.js";
import { designById } from "../engine/designs.js";
import { confirmDelete, getPage, listPages, listProjects, trashItem } from "../projects.js";
import { useHoverPreview } from "./hover.jsx";

const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
// Seules les pages d'un projet (créées ou modifiées dans l'atelier) sont ici ;
// les pages copiées de sites sont des templates (Catalogue → Templates).
const groupOf = (p) => p.projet;

// Aperçu d'une page : le haut de la vraie page (medias/_vignettes/<page>.png,
// refait à chaque enregistrement) ; à défaut, les miniatures de ses premières
// sections, empilées.
const loadedAt = Date.now();
function PageThumb({ name, data }) {
  const [failed, setFailed] = useState(false);
  // Survol : la page entière en grand, qu'on fait défiler (medias/_vignettes/<page>-full.jpg).
  const hover = useHoverPreview("template", {
    thumbnail: `/medias/_vignettes/${name}.png?v=${loadedAt}`,
    full: `/medias/_vignettes/${name}-full.jpg?v=${loadedAt}`,
  });
  const shown = (data?.content ?? []).slice(0, 4).map((item) => byId[item.type]).filter((s) => s?.thumbnail);
  if (!failed && data?.content?.length)
    return (
      <span className="cat-page-thumb cat-card__scroll">
        <img
          src={`/medias/_vignettes/${name}-full.jpg?v=${loadedAt}`}
          alt=""
          loading="lazy"
          onError={(e) => (e.currentTarget.src.includes("-full.jpg") ? (e.currentTarget.src = `/medias/_vignettes/${name}.png?v=${loadedAt}`) : setFailed(true))}
        />
      </span>
    );
  return (
    <span className="cat-page-thumb">
      {shown.length ? shown.map((s, i) => <img key={i} src={s.thumbnail} alt="" loading="lazy" />) : <span>Page vide</span>}
    </span>
  );
}

// Toutes les pages, rangées par projet (puis templates, puis sans projet).
export function PagesView({ onOpenProject, onMessage }) {
  const [pages, setPages] = useState(null);
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState({ projet: "", type: "", q: "" });
  const [reload, setReload] = useState(0);

  async function remove(info) {
    const linked = (pages ?? []).filter((p) => p.info.pageAchat === info.name).map((p) => `• ${p.info.title}`);
    const details = [`« ${info.title} » (${info.name})`];
    if (info.importSource && !info.projet) details.push("C'est la page d'un template : le template ne pourra plus servir de point de départ.");
    if (linked.length) details.push("Ces pages renvoient vers elle pour l'achat :", ...linked);
    if (!confirmDelete("cette page", details)) return;
    try {
      await trashItem("pages", info.name);
      onMessage?.({ text: `Page « ${info.title} » déplacée dans la corbeille.` });
      setReload((n) => n + 1);
    } catch (e) {
      onMessage?.({ error: true, text: e.message });
    }
  }

  useEffect(() => {
    (async () => {
      const [list, proj] = await Promise.all([listPages(), listProjects()]);
      setProjects(proj);
      const full = await Promise.all(
        list.map(async (info) => {
          const raw = await getPage(info.name).catch(() => null);
          const data = raw && {
            ...raw,
            content: (raw.content ?? []).map((item) => (byId[item.type] ? { ...item, props: normalizeProps(byId[item.type], item.props) } : item)),
          };
          return { info, data, score: data ? scorePage(data, byId) : null };
        }),
      );
      setPages(full);
    })().catch(() => setPages([]));
  }, [reload]);

  const groups = useMemo(() => {
    const names = Object.fromEntries(projects.map((p) => [p.id, p.nom]));
    const q = filter.q.trim().toLowerCase();
    const visible = (pages ?? []).filter(
      ({ info }) =>
        info.projet &&
        (!filter.projet || groupOf(info) === filter.projet) &&
        (!filter.type || info.pageType === filter.type) &&
        (!q || [info.name, info.title, info.profil, info.produit].join(" ").toLowerCase().includes(q)),
    );
    const order = projects.map((p) => p.id);
    return order
      .map((id) => ({
        id,
        label: `Projet · ${names[id] ?? id}`,
        items: visible.filter(({ info }) => groupOf(info) === id),
      }))
      .filter((g) => g.items.length);
  }, [pages, projects, filter]);

  return (
    <>
      <h1>Pages</h1>
      <p className="cat-lead">
        Les pages de tes projets, créées ou modifiées dans l'atelier, rangées par projet : type, profil client visé, design, score. Les pages copiées de sites sont dans Templates.
      </p>

      <section className="cat-panel cat-pages-filters">
        <label className="cat-field">
          <span>Projet</span>
          <select value={filter.projet} onChange={(e) => setFilter({ ...filter, projet: e.target.value })}>
            <option value="">Tous</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="cat-field">
          <span>Type de page</span>
          <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
            <option value="">Tous</option>
            {PAGE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="cat-field">
          <span>Rechercher</span>
          <input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="nom, profil, produit…" />
        </label>
      </section>

      {!pages ? (
        <p className="cat-muted">Chargement…</p>
      ) : groups.length === 0 ? (
        <div className="cat-empty">Aucune page ne correspond.</div>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="cat-pages-group">
            <div className="cat-title-row">
              <h2>
                {g.label} <span className="cat-muted">· {g.items.length}</span>
              </h2>
              {(
                <button type="button" className="cat-link" onClick={() => onOpenProject(g.id)}>
                  Voir le projet →
                </button>
              )}
            </div>
            <div className="cat-grid">
              {g.items.map(({ info, data, score }) => {
                const type = pageTypeById[info.pageType];
                const design = designById[data?.root?.props?.design];
                return (
                  <article key={info.name} className="cat-card">
                    <a className="cat-card__thumb cat-card__thumb--page" href={`/?page=${info.name}`} title="Ouvrir dans l'atelier">
                      <PageThumb name={info.name} data={data} />
                    </a>
                    <div className="cat-card__body">
                      <strong>{type ? `${type.label}${info.profil ? ` · ${info.profil}` : ""}` : info.title}</strong>
                      <span className="cat-muted cat-card__meta">{info.name}</span>
                      <span className="cat-muted cat-card__meta">
                        {data?.content?.length ?? 0} section(s){design ? ` · ${design.id}.md` : " · sans design"}
                        {info.pageAchat ? ` · achat sur ${info.pageAchat}` : ""}
                      </span>
                      <div className="cat-card__badges">
                        {type ? (
                          <span className={`cat-badge ${type.achat ? "cat-badge--green" : "cat-badge--blue"}`}>{type.achat ? "Achat" : "Pas d'achat"}</span>
                        ) : (
                          <span className="cat-badge cat-badge--amber">Type à définir</span>
                        )}
                        {score?.type && <span className="cat-badge cat-badge--grey">Score de vente {score.score} / 100</span>}
                      </div>
                    </div>
                    <div className="cat-card__actions">
                      <button type="button" className="cat-btn cat-btn--danger" onClick={() => remove(info)}>
                        Supprimer
                      </button>
                      <a className="cat-btn" href={`/?page=${info.name}`}>
                        Ouvrir
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}
