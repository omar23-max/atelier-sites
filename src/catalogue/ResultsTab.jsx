import { useEffect, useState } from "react";
import { pageTypeById } from "../engine/page-types.js";

// Onglet « Résultats » de la fiche projet : suivi des ventes et des tests,
// page par page et jour par jour, enregistré dans Supabase (table « suivi »).
// Indicateurs calculés par la base (vue suivi_par_page).

const SOURCES = ["meta", "tiktok", "google", "organique", "email", "autre"];
const today = () => new Date().toISOString().slice(0, 10);
const money = (v) => (v == null ? "—" : `${Number(v).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`);
const pct = (v) => (v == null ? "—" : `${Number(v).toLocaleString("fr-CA")} %`);
const num = (v) => (v == null ? "—" : Number(v).toLocaleString("fr-CA"));

export function ResultsTab({ project, pages, onMessage }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const first = pages[0]?.info.name ?? "";
  const [form, setForm] = useState({ page: first, jour: today(), source: "meta", depense_pub: "", visites: "", ajouts_panier: "", commandes: "", chiffre: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/suivi?projet=${project.id}`);
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setError(null);
    setData(body);
  };
  useEffect(() => {
    load();
  }, [project.id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const titleOf = (id) => {
    const p = pages.find((x) => x.info.name === id)?.info;
    return p ? `${pageTypeById[p.pageType]?.label ?? p.title}${p.profil ? ` · ${p.profil}` : ""}` : id;
  };

  async function add(e) {
    e.preventDefault();
    if (!form.page) return onMessage({ error: true, text: "Choisis la page." });
    setBusy(true);
    try {
      const res = await fetch("/api/suivi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projet: project.id, ...form }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      onMessage({ text: "Résultats enregistrés dans la base." });
      setForm({ ...form, depense_pub: "", visites: "", ajouts_panier: "", commandes: "", chiffre: "" });
      await load();
    } catch (err) {
      onMessage({ error: true, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (!confirm(`Supprimer la ligne du ${row.jour} (${titleOf(row.page_id)}, ${row.source}) ?\nElle est effacée de la base.`)) return;
    const res = await fetch(`/api/suivi/${row.id}`, { method: "DELETE" });
    if (!res.ok) return onMessage({ error: true, text: (await res.json()).error });
    await load();
  }

  if (error) return <div className="cat-empty">{error} Voir docs/SUPABASE.md.</div>;
  if (!data) return <p className="cat-muted">Chargement des résultats…</p>;

  const best = [...data.resume].filter((r) => r.visites > 0).sort((a, b) => (b.taux_conversion ?? 0) - (a.taux_conversion ?? 0))[0];

  return (
    <div className="cat-extra">
      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>Résultats par page</strong>
          {best && <span className="cat-badge cat-badge--green">Meilleure conversion : {titleOf(best.page_id)}</span>}
        </div>
        {data.resume.length === 0 ? (
          <p className="cat-muted">Aucun résultat pour l'instant. Ajoute ta première journée ci-dessous (chiffres de Shopify et de tes pubs).</p>
        ) : (
          <table className="cat-table cat-results">
            <thead>
              <tr>
                <th>Page</th>
                <th>Période</th>
                <th>Dépense pub</th>
                <th>Visites</th>
                <th>Ajouts panier</th>
                <th>Commandes</th>
                <th>Chiffre</th>
                <th>Conversion</th>
                <th>Panier moyen</th>
                <th>ROAS</th>
                <th>Coût / commande</th>
              </tr>
            </thead>
            <tbody>
              {data.resume.map((r) => (
                <tr key={r.page_id}>
                  <td>
                    <b>{titleOf(r.page_id)}</b>
                    <small className="cat-muted">{r.page_id}</small>
                  </td>
                  <td>
                    {r.du} → {r.au}
                  </td>
                  <td>{money(r.depense_pub)}</td>
                  <td>{num(r.visites)}</td>
                  <td>
                    {num(r.ajouts_panier)} <small className="cat-muted">{pct(r.taux_ajout_panier)}</small>
                  </td>
                  <td>{num(r.commandes)}</td>
                  <td>{money(r.chiffre)}</td>
                  <td>
                    <b>{pct(r.taux_conversion)}</b>
                  </td>
                  <td>{money(r.panier_moyen)}</td>
                  <td>{r.roas == null ? "—" : `× ${Number(r.roas).toLocaleString("fr-CA")}`}</td>
                  <td>{money(r.cout_par_commande)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>Ajouter une journée</strong>
          <span className="cat-muted">Même page, même jour, même source : la ligne est remplacée.</span>
        </div>
        {pages.length === 0 ? (
          <p className="cat-muted">Ce projet n'a pas encore de page.</p>
        ) : (
          <form className="cat-results-form" onSubmit={add}>
            <label className="cat-field">
              <span>Page</span>
              <select value={form.page} onChange={set("page")}>
                {pages.map(({ info }) => (
                  <option key={info.name} value={info.name}>
                    {titleOf(info.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="cat-field">
              <span>Jour</span>
              <input type="date" value={form.jour} onChange={set("jour")} />
            </label>
            <label className="cat-field">
              <span>Source</span>
              <select value={form.source} onChange={set("source")}>
                {SOURCES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {[
              ["depense_pub", "Dépense pub ($)", "0.01"],
              ["visites", "Visites", "1"],
              ["ajouts_panier", "Ajouts au panier", "1"],
              ["commandes", "Commandes", "1"],
              ["chiffre", "Chiffre d'affaires ($)", "0.01"],
            ].map(([k, label, step]) => (
              <label key={k} className="cat-field">
                <span>{label}</span>
                <input type="number" min="0" step={step} value={form[k]} onChange={set(k)} placeholder="0" />
              </label>
            ))}
            <button type="submit" className="cat-btn" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        )}
      </section>

      {data.lignes.length > 0 && (
        <section className="cat-panel">
          <div className="cat-panel__head">
            <strong>Journées saisies ({data.lignes.length})</strong>
          </div>
          <table className="cat-table">
            <thead>
              <tr>
                <th>Jour</th>
                <th>Page</th>
                <th>Source</th>
                <th>Dépense</th>
                <th>Visites</th>
                <th>Panier</th>
                <th>Commandes</th>
                <th>Chiffre</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.lignes.map((r) => (
                <tr key={r.id}>
                  <td>{r.jour}</td>
                  <td>{titleOf(r.page_id)}</td>
                  <td>{r.source}</td>
                  <td>{money(r.depense_pub)}</td>
                  <td>{num(r.visites)}</td>
                  <td>{num(r.ajouts_panier)}</td>
                  <td>{num(r.commandes)}</td>
                  <td>{money(r.chiffre)}</td>
                  <td className="cat-table__actions">
                    <button type="button" className="cat-btn cat-btn--danger" onClick={() => remove(r)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
