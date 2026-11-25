// Passer d'un espace à l'autre sans revenir à la page (lot B, 2026-11-16) :
// Page · Studio · Canvas · Catalogue, en haut du Studio d'images, du Canvas
// et (2026-11-17) du catalogue.
// onLeave ferme l'espace courant (le Canvas enregistre d'abord le tableau).
// Depuis le catalogue (page = la page à reprendre) : Studio et Canvas
// rouvrent la page puis s'ouvrent tout seuls (?ouvrir=studio|canvas).
const SPACES = [
  { id: "projets", label: "Projets", title: "Tes projets (Fondations, pages, exports)" },
  { id: "recherche", label: "Recherche", title: "Recherche produits : tendances, chasse aux produits gagnants (WinningHunter et Whitelabeler)" },
  { id: "page", label: "Page", title: "Revenir à la page" },
  { id: "agents", label: "Agents army", title: "Agents army (fenêtre à part)" },
  { id: "studio", label: "Studio", title: "Studio d'images" },
  { id: "canvas", label: "Canvas", title: "Canvas du projet" },
  { id: "catalogue", label: "Catalogue", title: "Catalogue (sections, templates, designs, projets)" },
];

export function WorkspaceSwitch({ current, onLeave = () => {}, page: pageInitiale = null, onNoPage = null, hide = [] }) {
  let page = pageInitiale;
  async function go(id) {
    if (id === current) return;
    // Projets (2026-11-22) : un espace du catalogue, plein écran, sans son menu.
    const surCatalogue = location.pathname === "/catalogue.html";
    if (id === "projets") {
      if (surCatalogue) return void (location.hash = "projets");
      await onLeave();
      const p = new URLSearchParams(location.search).get("page") ?? page;
      location.href = `/catalogue.html${p ? `?page=${encodeURIComponent(p)}` : ""}#projets`;
      return;
    }
    if (id === "catalogue" && surCatalogue) return void (location.hash = "tout");
    // Agents army : sa propre page, on y va directement depuis partout.
    if (id === "recherche") {
      await onLeave();
      const p = new URLSearchParams(location.search).get("page") ?? page;
      location.href = `/recherche.html${p ? `?page=${encodeURIComponent(p)}` : ""}`;
      return;
    }
    if (id === "agents") {
      await onLeave();
      const q = new URLSearchParams(location.search);
      const p = q.get("page") ?? page;
      location.href = `/agents.html${p ? `?page=${encodeURIComponent(p)}` : ""}`;
      return;
    }
    // Canvas seul (canvas.html) : on quitte la page du Canvas pour l'espace demandé.
    const canvasSeul = location.pathname === "/canvas.html";
    if (canvasSeul) {
      window.__atlQuitteVers = id;
      try {
        await onLeave();
      } catch (e) {
        window.__atlQuitteVers = null;
        throw e;
      }
      page = new URLSearchParams(location.search).get("page") ?? page;
    }
    if (canvasSeul || current === "catalogue" || current === "agents" || current === "projets" || current === "recherche") {
      if (!page && id === "catalogue") return void (location.href = "/catalogue.html#tout");
      if (!page) return onNoPage?.(id);
      const q = `?page=${encodeURIComponent(page)}`;
      // Canvas : ouvert directement (canvas.html), sans passer par la page.
      location.href = id === "catalogue" ? `/catalogue.html${q}#tout` : id === "page" ? `/${q}` : id === "canvas" ? `/canvas.html${q}` : `/${q}&ouvrir=${id}`;
      return;
    }
    await onLeave();
    if (id === "studio") window.dispatchEvent(new CustomEvent("atl-open-studio"));
    if (id === "canvas") window.dispatchEvent(new CustomEvent("atl-open-canvas"));
    if (id === "catalogue") location.href = `/catalogue.html${location.search}#tout`;
  }
  return (
    <nav className="atl-wswitch" aria-label="Changer d'espace">
      {SPACES.filter((s) => !hide.includes(s.id)).map((s) => (
        <button
          key={s.id}
          type="button"
          className={s.id === current ? "is-on" : ""}
          aria-current={s.id === current ? "page" : undefined}
          title={(current === "catalogue" || current === "agents" || current === "projets") && !page && s.id !== current && s.id !== "agents" && s.id !== "catalogue" ? "Choisis d'abord une page à ouvrir" : s.title}
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
  // ?ouvrir=<espace> (depuis un autre menu) ou &studio=1 (rafraîchissement avec le Studio ouvert).
  const parRafraichi = id === "studio" && params.get("studio") === "1";
  if ((params.get("ouvrir") !== id && !parRafraichi) || window.__atlOuvert) return;
  window.__atlOuvert = true;
  params.delete("ouvrir");
  history.replaceState(null, "", `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`);
  // 2026-11-24 : on n'attend plus que la page soit dessinée (plusieurs
  // secondes) : Studio et Canvas lisent les données de la page, déjà là quand
  // ce bouton est monté. Le cache posé par index.html (« Ouverture du… »)
  // masque la page pendant ce court instant, puis s'efface.
  const tick = () => {
    // Par le même signal que le menu : capté par le bouton monté à ce moment-là.
    // window.__atlEspace : l'espace reste ouvert si l'éditeur remonte ses boutons.
    window.__atlEspace = id;
    window.dispatchEvent(new CustomEvent(`atl-open-${id}`));
    setTimeout(() => document.documentElement.classList.remove("atl-ouvre"), 500);
  };
  setTimeout(tick, 60);
}
