// Canvas seul (2026-11-24) : ouvert directement depuis Projets, Recherche,
// Agents army ou le catalogue, sans charger ni dessiner la page dans
// l'éditeur (avant : la page s'affichait d'abord, le Canvas plusieurs
// secondes après). ?page=<nom> : la page du projet dont le Canvas s'ouvre.
import "./catalogue/version-check.js";
import { createRoot } from "react-dom/client";
import "./tokens.css";
import "./styles.css";
import { pageSeule } from "./page-acces.js";
import { CanvasSeul } from "./canvas-ui.jsx";

const page = new URLSearchParams(location.search).get("page");
const racine = createRoot(document.getElementById("root"));
if (!page) location.replace("/catalogue.html#projets");
else {
  try {
    localStorage.setItem("atl-last-page", page);
  } catch {}
  fetch(`/api/pages/${encodeURIComponent(page)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d) pageSeule.data = d;
      racine.render(<CanvasSeul page={page} />);
    })
    .catch(() => racine.render(<CanvasSeul page={page} />));
}
