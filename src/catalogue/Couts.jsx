// Panneau « Dépense IA » (lot 1 du plan, 2026-11-25) : tokens, appels
// WinningHunter et coût estimé d'un projet ou d'un produit, avec les prix au
// million de tokens saisis par l'utilisateur et un budget facultatif.
import { useEffect, useRef, useState } from "react";

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n ?? 0));
const date = (s) => (s ? new Date(s).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export function CoutsPanneau({ cle, titre = "Dépense IA", compact = false }) {
  const [d, setD] = useState(null);
  const [prixEdit, setPrixEdit] = useState({});
  const [budget, setBudget] = useState("");
  const [msg, setMsg] = useState(null);
  // Réponse d'une ancienne clé (changement de projet) ignorée.
  const cleRef = useRef(cle);
  cleRef.current = cle;
  const charger = () => {
    const pour = cle;
    return fetch(`/api/couts/${cle}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Dépense non lue (${r.status})`))))
      .then((x) => cleRef.current === pour && (setD(x), setBudget(x.budgetDefaut ? "" : x.budget ?? "")))
      .catch((e) => cleRef.current === pour && setMsg(`⚠ ${e.message}`));
  };
  useEffect(() => {
    setD(null);
    setPrixEdit({});
    charger();
  }, [cle]);
  if (!d) return msg ? <p className="cat-flash is-error">{msg}</p> : null;
  const t = d.total;
  const rien = !t.appels;
  async function poster(url, corps) {
    setMsg(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    if (!r?.ok) return setMsg(`⚠ ${b?.error ?? "Échec"}`), false;
    charger();
    return true;
  }
  const resume = rien
    ? "aucune dépense enregistrée pour l'instant"
    : `${fmt(t.entree)} tokens lus · ${fmt(t.sortie)} écrits${t.appelsWh ? ` · ${t.appelsWh} appel(s) WinningHunter` : ""}${t.dollars ? ` · ≈ ${t.dollars.toLocaleString("fr-CA")} $` : ""}${t.sansPrix ? " (prix à renseigner)" : ""}`;
  const depasse = d.budget != null && t.dollars >= d.budget;
  return (
    <details className={`cat-couts${depasse ? " is-depasse" : ""}`}>
      <summary>
        <b>{titre}</b> : {resume}
        {d.budget != null && <span className="cat-couts__budget"> · plafond {d.budget} ${d.budgetDefaut ? " (par défaut)" : ""} {depasse ? "atteint : nouveaux appels bloqués" : t.dollars >= d.budget * 0.8 ? `(${Math.round((t.dollars / d.budget) * 100)} % : bientôt atteint)` : `(${Math.round((t.dollars / d.budget) * 100) || 0} %)`}</span>}
      </summary>
      <p className="cat-muted">Compté automatiquement depuis le {d.depuis ? date(d.depuis) : "branchement du compteur (25 nov.)"} : chaque appel à OpenAI, Gemini, Claude ou WinningHunter fait pour {cle.startsWith("projet-") ? "ce projet (et la recherche du produit lancé dedans)" : cle.startsWith("produit-") ? "ce produit" : "la recherche"}. Les dépenses plus anciennes ne sont pas connues. Le coût en dollars n'apparaît que pour les modèles dont tu as saisi le prix (tableau de bord du fournisseur, rubrique Pricing).</p>
      {d.parModele.length > 0 && (
        <table className="cat-couts__table">
          <thead>
            <tr>
              <th>Modèle</th>
              <th>Appels</th>
              <th>Tokens lus</th>
              <th>Tokens écrits</th>
              <th>WinningHunter</th>
              <th>Prix / million (lus · écrits)</th>
              <th>≈ Coût</th>
            </tr>
          </thead>
          <tbody>
            {d.parModele.map((m) => {
              const p = prixEdit[m.modele] ?? { entree: d.prix[m.modele]?.entree ?? "", sortie: d.prix[m.modele]?.sortie ?? "" };
              const tokens = m.entree || m.sortie;
              return (
                <tr key={m.modele}>
                  <td>{m.modele}</td>
                  <td>{m.appels}</td>
                  <td>{fmt(m.entree)}</td>
                  <td>{fmt(m.sortie)}</td>
                  <td>{m.appelsWh || ""}</td>
                  <td>
                    {tokens ? (
                      <span className="cat-couts__prix">
                        <input value={p.entree} onChange={(e) => setPrixEdit((x) => ({ ...x, [m.modele]: { ...p, entree: e.target.value } }))} aria-label={`Prix des tokens lus, ${m.modele}`} placeholder="$ lus" />
                        <input value={p.sortie} onChange={(e) => setPrixEdit((x) => ({ ...x, [m.modele]: { ...p, sortie: e.target.value } }))} aria-label={`Prix des tokens écrits, ${m.modele}`} placeholder="$ écrits" />
                        {prixEdit[m.modele] && (
                          <button type="button" className="cat-link" onClick={() => poster("/api/couts/prix", { modele: m.modele, ...p }).then((ok) => ok && setPrixEdit((x) => ({ ...x, [m.modele]: undefined })))}>
                            OK
                          </button>
                        )}
                      </span>
                    ) : (
                      ""
                    )}
                  </td>
                  <td>{m.dollars != null ? `${m.dollars.toLocaleString("fr-CA")} $` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {!compact && (
        <p className="cat-couts__ligne">
          Budget IA {cle.startsWith("projet-") ? "du projet" : "du produit"} :{" "}
          <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={cle.startsWith("projet-") ? `${d.budgetDefaut ? d.budget : 5} (par défaut)` : "ex. 20"} aria-label="Plafond en dollars" /> ${" "}
          <button type="button" className="cat-link" onClick={() => poster(`/api/couts/${cle}/budget`, { dollars: budget })}>
            Enregistrer
          </button>{" "}
          <span className="cat-muted">Plafond : au-delà, l'atelier refuse les nouveaux appels payants {cle.startsWith("projet-") ? "de ce projet" : "de ce produit"} (une marge est gardée pour les appels en cours), avec un message ; rien n'est facturé. {cle.startsWith("projet-") ? "Vide = plafond par défaut des projets (5 $)." : "Vide = pas de plafond."} Les modèles sans prix saisi ne comptent pas dans le total.</span>
        </p>
      )}
      {d.derniers.length > 0 && (
        <details className="cat-couts__derniers">
          <summary>Derniers appels</summary>
          <ul>
            {d.derniers.map((l, i) => (
              <li key={i}>
                {date(l.le)} · {l.modele} · {l.route || "?"}
                {l.entree || l.sortie ? ` · ${fmt(l.entree)} lus / ${fmt(l.sortie)} écrits` : ""}
                {l.appelsWh ? ` · ${l.appelsWh} WH` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {msg && <p className="cat-flash is-error">{msg}</p>}
    </details>
  );
}
