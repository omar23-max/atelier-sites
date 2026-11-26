import { DEVISES, LEVIERS, controlesFiche, packsCalcules, packsDepuisTexte } from "../engine/offre-fiche.js";

// Fiche d'offre structurée (audit ChatGPT F09, 2026-11-18) : les données
// commerciales de l'offre, avec calculs et contrôles. Les champs de texte de
// l'offre (en dessous) restent le texte de vente.
const nid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function OffreFiche({ value, onChange, texteOffre }) {
  const fiche = value ?? {};
  const up = (patch) => onChange({ ...fiche, ...patch });
  const packs = fiche.packs ?? [];
  const calc = packsCalcules(fiche);
  const dev = DEVISES.find(([v]) => v === fiche.devise)?.[1] ?? "";
  const setPack = (i, patch) => up({ packs: packs.map((p, j) => (j === i ? { ...p, ...patch } : patch.populaire ? { ...p, populaire: false } : p)) });
  const bonus = fiche.bonus ?? [];
  const setBonus = (i, patch) => up({ bonus: bonus.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const leviers = fiche.leviers ?? {};
  const setLevier = (k, patch) => up({ leviers: { ...leviers, [k]: { ...leviers[k], ...patch } } });
  const controles = controlesFiche(fiche);
  const proposes = !packs.length ? packsDepuisTexte(texteOffre) : [];
  // Où sont les problèmes (2026-11-25) : chaque élément en cause est encadré.
  const niveauDe = (cible) => {
    const l = controlesFiche(fiche).filter((c) => c.cible === cible);
    return l.some((c) => c.niveau === "erreur") ? "is-pb-err" : l.length ? "is-pb-warn" : "";
  };

  return (
    <div className="cat-fiche">
      <div className="cat-fiche__row">
        <label className={`cat-field ${niveauDe("devise")}`} data-cible="offre-devise">
          <span>Devise</span>
          <select value={fiche.devise ?? ""} onChange={(e) => up({ devise: e.target.value })}>
            <option value="">— choisir —</option>
            {DEVISES.map(([v, l]) => (
              <option key={v} value={v}>
                {l} ({v})
              </option>
            ))}
          </select>
        </label>
        <label className="cat-field cat-fiche__grow">
          <span>Unité vendue</span>
          <input value={fiche.unite ?? ""} onChange={(e) => up({ unite: e.target.value })} placeholder="ex. flacon de 60 gélules" />
        </label>
      </div>

      <span className="cat-fd__label">Packs</span>
      {proposes.length > 0 && (
        <p className="cat-fiche__propose">
          {proposes.length} pack(s) repérés dans le texte de l'offre.{" "}
          <button type="button" className="cat-link" onClick={() => up({ packs: proposes })}>
            Les reprendre (à vérifier)
          </button>
        </p>
      )}
      <div className="cat-fiche__tablewrap">
        <table className="cat-fiche__packs">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Quantité</th>
              <th>Offertes</th>
              <th>Prix {dev}</th>
              <th>Prix barré</th>
              <th>Abonnement</th>
              <th>Le + populaire</th>
              <th title="Calculé">Unités</th>
              <th title="Calculé">Prix / unité</th>
              <th title="Calculé, par rapport au plus petit pack">Remise</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {packs.map((p, i) => (
              <tr key={p.id ?? i} className={niveauDe(`pack-${i}`)} data-cible={`offre-pack-${i}`}>
                <td>
                  <input value={p.nom ?? ""} onChange={(e) => setPack(i, { nom: e.target.value })} placeholder="ex. La cure 90 jours" aria-label={`Nom du pack ${i + 1}`} />
                </td>
                <td>
                  <input inputMode="numeric" value={p.quantite ?? ""} onChange={(e) => setPack(i, { quantite: e.target.value })} placeholder="3" aria-label={`Quantité du pack ${i + 1}`} />
                </td>
                <td>
                  <input inputMode="numeric" value={p.offertes ?? ""} onChange={(e) => setPack(i, { offertes: e.target.value })} placeholder="0" aria-label={`Unités offertes du pack ${i + 1}`} />
                </td>
                <td>
                  <input inputMode="decimal" value={p.prix ?? ""} onChange={(e) => setPack(i, { prix: e.target.value })} placeholder="115" aria-label={`Prix du pack ${i + 1}`} />
                </td>
                <td>
                  <input inputMode="decimal" value={p.prixBarre ?? ""} onChange={(e) => setPack(i, { prixBarre: e.target.value })} placeholder="174" aria-label={`Prix barré du pack ${i + 1}`} />
                </td>
                <td>
                  <label className="cat-fiche__inline">
                    <input type="checkbox" checked={Boolean(p.abonnement)} onChange={(e) => setPack(i, { abonnement: e.target.checked })} aria-label={`Pack ${i + 1} en abonnement`} />
                    {p.abonnement && <input value={p.cadence ?? ""} onChange={(e) => setPack(i, { cadence: e.target.value })} placeholder="tous les 30 jours" aria-label={`Cadence du pack ${i + 1}`} />}
                  </label>
                </td>
                <td>
                  <input type="radio" name="atl-pack-populaire" checked={Boolean(p.populaire)} onChange={() => setPack(i, { populaire: true })} aria-label={`Pack ${i + 1} le plus populaire`} />
                </td>
                <td className="cat-fiche__calc">{calc[i]?.total || "—"}</td>
                <td className="cat-fiche__calc">{calc[i]?.prixUnite != null ? `${calc[i].prixUnite} ${dev}` : "—"}</td>
                <td className="cat-fiche__calc">{calc[i]?.remise != null ? `${calc[i].remise > 0 ? "-" : ""}${Math.abs(calc[i].remise)} %` : "base"}</td>
                <td>
                  <button type="button" className="cat-link" onClick={() => up({ packs: packs.filter((_, j) => j !== i) })} aria-label={`Supprimer le pack ${i + 1}`}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="cat-btn cat-btn--ghost" onClick={() => up({ packs: [...packs, { id: nid("p"), nom: "", quantite: "", offertes: "", prix: "", prixBarre: "", abonnement: false, cadence: "", populaire: false }] })}>
        + Ajouter un pack
      </button>

      <div className="cat-fiche__grid">
        <fieldset className={niveauDe("garantie")} data-cible="offre-garantie">
          <legend>Garantie</legend>
          <div className="cat-fiche__row">
            <input inputMode="numeric" value={fiche.garantie?.duree ?? ""} onChange={(e) => up({ garantie: { ...fiche.garantie, duree: e.target.value } })} placeholder="90" aria-label="Durée de la garantie" />
            <select value={fiche.garantie?.unite ?? "jours"} onChange={(e) => up({ garantie: { ...fiche.garantie, unite: e.target.value } })} aria-label="Unité de la garantie">
              <option value="jours">jours</option>
              <option value="mois">mois</option>
            </select>
          </div>
          <input value={fiche.garantie?.conditions ?? ""} onChange={(e) => up({ garantie: { ...fiche.garantie, conditions: e.target.value } })} placeholder="ex. remboursé même flacon vide" aria-label="Conditions de la garantie" />
        </fieldset>
        <fieldset className={niveauDe("retours")} data-cible="offre-retours">
          <legend>Retours</legend>
          <div className="cat-fiche__row">
            <input inputMode="numeric" value={fiche.retours?.duree ?? ""} onChange={(e) => up({ retours: { ...fiche.retours, duree: e.target.value } })} placeholder="90" aria-label="Fenêtre de retour" />
            <select value={fiche.retours?.unite ?? "jours"} onChange={(e) => up({ retours: { ...fiche.retours, unite: e.target.value } })} aria-label="Unité de la fenêtre de retour">
              <option value="jours">jours</option>
              <option value="mois">mois</option>
            </select>
          </div>
          <input value={fiche.retours?.conditions ?? ""} onChange={(e) => up({ retours: { ...fiche.retours, conditions: e.target.value } })} placeholder="ex. frais de retour à la charge du client" aria-label="Conditions de retour" />
        </fieldset>
        <fieldset className={niveauDe("livraison")} data-cible="offre-livraison">
          <legend>Livraison</legend>
          <input value={fiche.livraison?.texte ?? ""} onChange={(e) => up({ livraison: { ...fiche.livraison, texte: e.target.value } })} placeholder="ex. 3 à 5 jours ouvrables" aria-label="Délai de livraison" />
          <input inputMode="decimal" value={fiche.livraison?.seuilGratuit ?? ""} onChange={(e) => up({ livraison: { ...fiche.livraison, seuilGratuit: e.target.value } })} placeholder={`Gratuite dès… ${dev}`} aria-label="Seuil de livraison gratuite" />
        </fieldset>
        <fieldset className={niveauDe("rarete")} data-cible="offre-rarete">
          <legend>Rareté / urgence (facultatif)</legend>
          <label className="cat-fiche__inline">
            <input type="checkbox" checked={Boolean(fiche.rarete?.active)} onChange={(e) => up({ rarete: { ...fiche.rarete, active: e.target.checked } })} /> Il y a une vraie limite
          </label>
          {fiche.rarete?.active && <input value={fiche.rarete?.condition ?? ""} onChange={(e) => up({ rarete: { ...fiche.rarete, condition: e.target.value } })} placeholder="ex. lot de 500 flacons, prix de lancement jusqu'au 30 nov." aria-label="Condition réelle de la rareté" />}
        </fieldset>
      </div>

      <span className="cat-fd__label">Bonus</span>
      {bonus.map((b, i) => (
        <div key={b.id ?? i} className={`cat-fiche__row ${niveauDe(`bonus-${i}`)}`} data-cible={`offre-bonus-${i}`}>
          <input className="cat-fiche__grow" value={b.nom ?? ""} onChange={(e) => setBonus(i, { nom: e.target.value })} placeholder="ex. Guide « Mon plan énergie 90 jours »" aria-label={`Nom du bonus ${i + 1}`} />
          <input value={b.valeur ?? ""} onChange={(e) => setBonus(i, { valeur: e.target.value })} placeholder="valeur (facultatif)" aria-label={`Valeur du bonus ${i + 1}`} />
          <label className="cat-fiche__inline">
            <input type="checkbox" checked={Boolean(b.livre)} onChange={(e) => setBonus(i, { livre: e.target.checked })} /> réellement livré
          </label>
          <button type="button" className="cat-link" onClick={() => up({ bonus: bonus.filter((_, j) => j !== i) })} aria-label={`Supprimer le bonus ${i + 1}`}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="cat-btn cat-btn--ghost" onClick={() => up({ bonus: [...bonus, { id: nid("b"), nom: "", valeur: "", livre: false }] })}>
        + Ajouter un bonus
      </button>

      <span className="cat-fd__label">Les 4 leviers de valeur (Hormozi) — une aide à la conception, pas un calcul</span>
      <div className="cat-fiche__leviers">
        {LEVIERS.map(([k, l, aide]) => (
          <fieldset key={k}>
            <legend>{l}</legend>
            <small className="cat-muted">{aide}</small>
            <textarea rows={2} value={leviers[k]?.obstacle ?? ""} onChange={(e) => setLevier(k, { obstacle: e.target.value })} placeholder="L'obstacle du client" aria-label={`${l} : obstacle`} />
            <textarea rows={2} value={leviers[k]?.reponse ?? ""} onChange={(e) => setLevier(k, { reponse: e.target.value })} placeholder="Ta réponse concrète" aria-label={`${l} : réponse`} />
            <textarea rows={1} value={leviers[k]?.preuve ?? ""} onChange={(e) => setLevier(k, { preuve: e.target.value })} placeholder="Ce qui le prouve (fait, preuve cochée)" aria-label={`${l} : preuve`} />
          </fieldset>
        ))}
      </div>

      {controles.length > 0 && (
        <ul className="cat-fiche__controles" aria-label="Contrôles de la fiche">
          {controles.map((c, i) => (
            <li key={i} className={`is-${c.niveau}`}>
              {c.niveau === "erreur" ? "⚠ " : "• "}
              {c.texte}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
