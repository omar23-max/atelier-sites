// Barre « nouvelle version » : src/catalogue/version-check.js
// Espace « Recherche produits » (2026-11-23) : agents Omar_winninghunter
// (guides officiels WinningHunter) + agents de recherche Whitelabeler.
import "./version-check.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../tokens.css";
import "../styles.css";
import "./catalogue.css";
import { WorkspaceSwitch } from "../workspace-switch.jsx";
import { AgentsArmy } from "./AgentsArmy.jsx";

const page = new URLSearchParams(location.search).get("page") ?? (() => { try { return localStorage.getItem("atl-last-page"); } catch { return null; } })();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <div className="cat cat--agents">
      <header className="cat-top">
        <div className="cat-top__brand">
          <span className="cat-logo">A</span>
          <strong>Atelier — Recherche produits</strong>
        </div>
        {page && (
          <a className="cat-btn cat-btn--ghost cat-top__back" href={`/?page=${encodeURIComponent(page)}`} title={page}>
            ← Reprendre ma page
          </a>
        )}
        <WorkspaceSwitch current="recherche" page={page} onNoPage={() => (location.href = "/catalogue.html#pages")} />
      </header>
      <main className="cat-agents-main">
        <AgentsArmy espace={{ titre: "Recherche produits" }} />
      </main>
    </div>
  </StrictMode>,
);
