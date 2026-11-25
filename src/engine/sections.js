import { useEffect, useState } from "react";
import { onLive } from "../live.js";
import { validateSection } from "./shopify.js";

// Chaque dossier sections/<id>/ devient une section : ajouter un dossier
// suffit pour qu'elle apparaisse dans l'atelier. Elles arrivent en une seule
// réponse JSON compressée (/api/sections-data, plugin « atelier-sections » de
// vite.config.js). Dans l'atelier (?page=…) : les sections du catalogue plus
// les parties copiées de cette page seulement ; dans le catalogue : toutes.
const page = location.pathname === "/" || location.pathname === "/canvas.html" ? new URLSearchParams(location.search).get("page") : null;
const all = await fetch(`/api/sections-data${page ? `?page=${encodeURIComponent(page)}` : "?leger=1"}`).then((r) => r.json());

export const sections = all
  .map((section) => ({ ...section, errors: section.leger ? (section.errors ?? []) : validateSection(section) }))
  .sort((a, b) => a.id.localeCompare(b.id));

// Atelier : les sections que la page n'utilise pas arrivent sans template ni
// CSS (« leger », 30 Mo de moins à l'ouverture) ; catalogue : toutes (67 Mo
// de moins). Complétées sur place au moment de l'ajout, du rendu ou de
// l'aperçu ; le même objet sert partout (config Puck…). useFull : la section,
// complétée au besoin, pour un composant React.
const byId = new Map(sections.map((s) => [s.id, s]));
// Index partagé id → section (2026-11-16) : tous les modules de l'éditeur
// s'en servent ; une section ajoutée en cours de session y apparaît aussitôt.
export const sectionsIndex = Object.fromEntries(sections.map((s) => [s.id, s]));
const pending = new Map();
export function ensureFull(ids) {
  const missing = ids.filter((id) => byId.get(id)?.leger && !pending.has(id));
  if (missing.length) {
    const job = fetch(`/api/sections-data?ids=${missing.map(encodeURIComponent).join(",")}`)
      .then((r) => r.json())
      .then((full) => {
        for (const f of full) Object.assign(byId.get(f.id), f, { leger: false, errors: validateSection(f) });
      })
      .finally(() => missing.forEach((id) => pending.delete(id)));
    missing.forEach((id) => pending.set(id, job));
  }
  return Promise.all(ids.map((id) => pending.get(id)));
}

// Section créée pendant la session (retravail IA, 2026-11-16) : chargée en
// entier, ajoutée à la liste, puis l'éditeur reconstruit sa config Puck
// (événement « atl-sections-added », App.jsx). Plus besoin de recharger la page.
export async function addSections(ids) {
  const fresh = ids.filter((id) => !byId.has(id));
  if (fresh.length) {
    const full = await fetch(`/api/sections-data?ids=${fresh.map(encodeURIComponent).join(",")}`).then((r) => r.json());
    for (const f of full) {
      const section = { ...f, leger: false, errors: validateSection(f) };
      sections.push(section);
      byId.set(section.id, section);
      sectionsIndex[section.id] = section;
    }
  }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000); // pas d'éditeur à l'écoute (catalogue)
    window.dispatchEvent(new CustomEvent("atl-sections-added", { detail: { ids, resolve: () => (clearTimeout(timer), resolve()) } }));
  });
}

// Sections du catalogue : sans les parties d'une copie de page (meta.pageSpecific),
// qui n'ont de sens que dans la page importée dont elles viennent.
export const catalogueSections = sections.filter((s) => !s.meta.pageSpecific);

// Une section a changé sur le disque (catalogue, import, IA…) : plus de
// rechargement automatique. Dans l'atelier, seulement si la page ouverte
// utilise une section modifiée, un petit bandeau propose de recharger ;
// supprimer ou masquer une section ailleurs ne touche pas la page.
{
  const used = () => {
    try {
      return new Set(window.__atlPageTypes?.() ?? []);
    } catch {
      return new Set();
    }
  };
  onLive("atl-sections", ({ ids = [], removed = [] }) => {
    window.dispatchEvent(new CustomEvent("atl-sections-changed", { detail: { ids, removed } }));
    if (!page) return;
    const mine = used();
    const touched = ids.filter((id) => mine.has(id) && !removed.includes(id));
    if (!touched.length || document.getElementById("atl-stale")) return;
    const bar = document.createElement("div");
    bar.id = "atl-stale";
    bar.className = "atl-stale";
    bar.innerHTML = `<span>Une section de cette page a été modifiée ailleurs.</span><button type="button">Recharger</button><button type="button" aria-label="Fermer">×</button>`;
    const [reload, close] = bar.querySelectorAll("button");
    reload.onclick = () => location.reload();
    close.onclick = () => bar.remove();
    document.body.append(bar);
  });
}

export function useFull(section) {
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (section?.leger) ensureFull([section.id]).then(() => setLoaded((n) => n + 1));
  }, [section]);
  return section && !section.leger ? section : null;
}
