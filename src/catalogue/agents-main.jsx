// Agents army dans sa propre fenêtre (2026-11-22) : plus dans le catalogue.
// Même en-tête que le catalogue, avec le menu Page · Agents army · Studio ·
// Canvas · Catalogue.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../tokens.css";
import "../styles.css";
import "./catalogue.css";
import { WorkspaceSwitch } from "../workspace-switch.jsx";
import { AgentsArmy } from "./AgentsArmy.jsx";

const page = new URLSearchParams(location.search).get("page") ?? (() => { try { return localStorage.getItem("atl-last-page"); } catch { return null; } })();

function AgentsPage() {
  return (
    <div className="cat cat--agents">
      <header className="cat-top">
        <div className="cat-top__brand">
          <span className="cat-logo">A</span>
          <strong>Atelier — Agents army</strong>
        </div>
        {page ? (
          <a className="cat-btn cat-btn--ghost cat-top__back" href={`/?page=${encodeURIComponent(page)}`} title={page}>
            ← Reprendre ma page
          </a>
        ) : (
          <a className="cat-btn cat-btn--ghost cat-top__back" href="/catalogue.html#pages">
            Choisir une page à ouvrir
          </a>
        )}
        <WorkspaceSwitch current="agents" page={page} onNoPage={() => (location.href = "/catalogue.html#pages")} />
      </header>
      <main className="cat-agents-main">
        <AgentsArmy />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AgentsPage />
  </StrictMode>,
);
