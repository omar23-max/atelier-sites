import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../tokens.css";
import "../styles.css";
import "./catalogue.css";

// Le catalogue attend la liste des sections (engine/sections.js) avant de
// s'afficher. Si elle n'arrive pas (serveur occupé, connexion coupée), un
// message et « Réessayer » au lieu d'une page blanche (audit T6, 2026-11-17).
const root = createRoot(document.getElementById("root"));
Promise.all([import("./Catalogue.jsx"), import("./origins.jsx")])
  .then(([{ default: Catalogue }, { OriginProvider }]) =>
    root.render(
      <StrictMode>
        <OriginProvider>
          <Catalogue />
        </OriginProvider>
      </StrictMode>,
    ),
  )
  .catch((e) => {
    console.error("[catalogue]", e);
    root.render(
      <div className="cat-loadfail" role="alert">
        <b>Le catalogue n'a pas pu se charger.</b>
        <p>L'atelier ne répond pas pour l'instant (serveur occupé ou connexion coupée).</p>
        <button type="button" onClick={() => location.reload()}>
          Réessayer
        </button>
      </div>,
    );
  });
