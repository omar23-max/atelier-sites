import { validateSection } from "./shopify.js";

// Chaque dossier sections/<id>/ devient une section : ajouter un dossier
// suffit pour qu'elle apparaisse dans l'atelier. Elles arrivent en une seule
// réponse JSON compressée (/api/sections-data, plugin « atelier-sections » de
// vite.config.js). Dans l'atelier (?page=…) : les sections du catalogue plus
// les parties copiées de cette page seulement ; dans le catalogue : toutes.
const page = location.pathname === "/" ? new URLSearchParams(location.search).get("page") : null;
const all = await fetch(`/api/sections-data${page ? `?page=${encodeURIComponent(page)}` : ""}`).then((r) => r.json());

export const sections = all
  .map((section) => ({ ...section, errors: section.leger ? [] : validateSection(section) }))
  .sort((a, b) => a.id.localeCompare(b.id));

// Atelier : les sections que la page n'utilise pas arrivent sans template ni
// CSS (« leger », 30 Mo de moins à l'ouverture). Complétées sur place au
// moment de l'ajout ou du rendu ; le même objet sert partout (config Puck…).
const byId = new Map(sections.map((s) => [s.id, s]));
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

// Sections du catalogue : sans les parties d'une copie de page (meta.pageSpecific),
// qui n'ont de sens que dans la page importée dont elles viennent.
export const catalogueSections = sections.filter((s) => !s.meta.pageSpecific);

// Une section a changé sur le disque (catalogue, import, IA…) : plus de
// rechargement automatique. Dans l'atelier, seulement si la page ouverte
// utilise une section modifiée, un petit bandeau propose de recharger ;
// supprimer ou masquer une section ailleurs ne touche pas la page.
if (import.meta.hot) {
  const used = () => {
    try {
      return new Set(window.__atlPageTypes?.() ?? []);
    } catch {
      return new Set();
    }
  };
  import.meta.hot.on("atl-sections", ({ ids = [], removed = [] }) => {
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
