import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { installEscapeClose } from "./escape-close.js";
import { installUndoKeys } from "./undo-keys.js";
import "./tokens.css";
import "./styles.css";

// Onglet de l'éditeur : chaque appel à l'API porte son identifiant, pour que
// le serveur reconnaisse ses propres écritures (conflits, audit T3).
const atlTab = Math.random().toString(36).slice(2, 10);
const nativeFetch = window.fetch.bind(window);
// Lectures identiques lancées en même temps (plusieurs panneaux qui
// demandent la liste des templates, des pages, des projets à l'ouverture) :
// une seule requête, chacun reçoit sa copie de la réponse (vitesse, 2026-11-17).
const inflight = new Map();
window.fetch = (input, init = {}) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.startsWith("/api/")) {
    const headers = new Headers(init.headers ?? (typeof input === "string" ? undefined : input.headers));
    headers.set("X-Atl-Tab", atlTab);
    init = { ...init, headers };
    const method = String(init.method ?? (typeof input === "string" ? "GET" : input.method) ?? "GET").toUpperCase();
    if (method === "GET" && typeof input === "string") {
      if (!inflight.has(url)) {
        const p = nativeFetch(input, init);
        inflight.set(url, p);
        p.finally(() => inflight.delete(url)).catch(() => {});
      }
      return inflight.get(url).then((r) => r.clone());
    }
  }
  return nativeFetch(input, init);
};

installEscapeClose();
installUndoKeys();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
