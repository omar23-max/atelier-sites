import { useState } from "react";

// Juste après un import : bandeau « sections proposées » (Page Score de la page
// importée, scripts/lib/propositions.mjs). « Voir et ajouter » ouvre l'outil
// Score (modèles du catalogue, ajout un par un ou tous, avec l'IA). Affiché une
// fois par page : ensuite, l'outil Score reste dans le rail de gauche.
export function ProposalsBanner({ pageName, proposals }) {
  const key = `atl-propositions-vues:${pageName}`;
  const [seen, setSeen] = useState(() => {
    try {
      return Boolean(localStorage.getItem(key));
    } catch {
      return false;
    }
  });
  if (!proposals || seen) return null;
  const close = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {}
    setSeen(true);
  };
  const list = proposals.sections ?? [];
  return (
    <div className="atl-proposals" role="status">
      <b>Import terminé · Score de vente {proposals.score} / 100.</b>
      {list.length ? (
        <span>
          {list.length} section{list.length > 1 ? "s" : ""} proposée{list.length > 1 ? "s" : ""} : {list.join(" · ")}
        </span>
      ) : (
        <span>Rien à ajouter : la page a déjà toutes les sections conseillées.</span>
      )}
      {list.length > 0 && (
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("atl-left-tool", { detail: "score" }));
            close();
          }}
        >
          Voir et ajouter
        </button>
      )}
      <button type="button" className="atl-proposals__later" onClick={close}>
        {list.length ? "Plus tard" : "OK"}
      </button>
    </div>
  );
}
