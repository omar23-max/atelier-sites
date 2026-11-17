// Passer d'un espace à l'autre sans revenir à la page (lot B, 2026-11-16) :
// Page · Studio · Canvas · Catalogue, en haut du Studio d'images et du Canvas.
// onLeave ferme l'espace courant (le Canvas enregistre d'abord le tableau).
const SPACES = [
  { id: "page", label: "Page", title: "Revenir à la page" },
  { id: "studio", label: "Studio", title: "Studio d'images" },
  { id: "canvas", label: "Canvas", title: "Canvas du projet" },
  { id: "catalogue", label: "Catalogue", title: "Catalogue (sections, templates, designs, projets)" },
];

export function WorkspaceSwitch({ current, onLeave }) {
  async function go(id) {
    if (id === current) return;
    await onLeave();
    if (id === "studio") window.dispatchEvent(new CustomEvent("atl-open-studio"));
    if (id === "canvas") window.dispatchEvent(new CustomEvent("atl-open-canvas"));
    if (id === "catalogue") location.href = `/catalogue.html${location.search}#tout`;
  }
  return (
    <nav className="atl-wswitch" aria-label="Changer d'espace">
      {SPACES.map((s) => (
        <button key={s.id} type="button" className={s.id === current ? "is-on" : ""} aria-current={s.id === current ? "page" : undefined} title={s.title} onClick={() => go(s.id)}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}
