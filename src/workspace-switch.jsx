// Passer d'un espace à l'autre sans revenir à la page (lot B, 2026-11-16) :
// Page · Studio · Canvas · Catalogue, en haut du Studio d'images, du Canvas
// et (2026-11-17) du catalogue.
// onLeave ferme l'espace courant (le Canvas enregistre d'abord le tableau).
// Depuis le catalogue (page = la page à reprendre) : Studio et Canvas
// rouvrent la page puis s'ouvrent tout seuls (?ouvrir=studio|canvas).
const SPACES = [
  { id: "page", label: "Page", title: "Revenir à la page" },
  { id: "studio", label: "Studio", title: "Studio d'images" },
  { id: "canvas", label: "Canvas", title: "Canvas du projet" },
  { id: "catalogue", label: "Catalogue", title: "Catalogue (sections, templates, designs, projets)" },
];

export function WorkspaceSwitch({ current, onLeave = () => {}, page = null, onNoPage = null }) {
  async function go(id) {
    if (id === current) return;
    if (current === "catalogue") {
      if (!page) return onNoPage?.();
      const q = `?page=${encodeURIComponent(page)}`;
      location.href = id === "page" ? `/${q}` : `/${q}&ouvrir=${id}`;
      return;
    }
    await onLeave();
    if (id === "studio") window.dispatchEvent(new CustomEvent("atl-open-studio"));
    if (id === "canvas") window.dispatchEvent(new CustomEvent("atl-open-canvas"));
    if (id === "catalogue") location.href = `/catalogue.html${location.search}#tout`;
  }
  return (
    <nav className="atl-wswitch" aria-label="Changer d'espace">
      {SPACES.map((s) => (
        <button
          key={s.id}
          type="button"
          className={s.id === current ? "is-on" : ""}
          aria-current={s.id === current ? "page" : undefined}
          title={current === "catalogue" && !page && s.id !== current ? "Choisis d'abord une page à ouvrir" : s.title}
          onClick={() => go(s.id)}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}

// Arrivée depuis le catalogue avec ?ouvrir=studio|canvas : ouvre l'espace une
// fois la page affichée (10 s au plus), puis retire le paramètre de l'adresse.
export function useOpenFromUrl(id) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(location.search);
  if (params.get("ouvrir") !== id || window.__atlOuvert) return;
  window.__atlOuvert = true;
  params.delete("ouvrir");
  history.replaceState(null, "", `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`);
  const t0 = Date.now();
  const tick = () => {
    const ready = [...document.querySelectorAll("iframe")].some((f) => f.contentDocument?.querySelector("[data-atl-id]"));
    // Par le même signal que le menu : capté par le bouton monté à ce moment-là.
    // window.__atlEspace : l'espace reste ouvert si l'éditeur remonte ses boutons.
    if (ready || Date.now() - t0 > 10000) {
      window.__atlEspace = id;
      window.dispatchEvent(new CustomEvent(`atl-open-${id}`));
    }
    else setTimeout(tick, 250);
  };
  setTimeout(tick, 250);
}
