import { useEffect, useState } from "react";
import { designById } from "./engine/designs.js";
import { applyDesignToPage } from "./catalogue/Designs.jsx";

const MAX_RECENTS = 5;
const OTHER = "__autre";

// « Design ▾ » : les 5 derniers designs appliqués, puis « Autre design… » qui
// ouvre le catalogue des designs. Choisir un design l'applique à la page
// (la page est d'abord enregistrée telle qu'elle est dans l'éditeur, puis une
// copie de sécurité est faite).
export function DesignSelect({ pageName, current, getData }) {
  const [recents, setRecents] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/designs/recents")
      .then((r) => r.json())
      .then(setRecents)
      .catch(() => {});
  }, []);

  const ids = [...new Set([current, ...recents.map((r) => r.id)].filter((id) => id && designById[id]))].slice(0, MAX_RECENTS + (current ? 1 : 0));

  async function choose(id) {
    if (id === OTHER) return (location.href = `/catalogue.html?page=${encodeURIComponent(pageName)}#designs`);
    if (!id || id === current) return;
    setBusy(true);
    try {
      const save = await fetch(`/api/pages/${pageName}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getData()),
      });
      if (!save.ok) throw new Error((await save.json()).error);
      await applyDesignToPage(pageName, designById[id]);
      location.reload();
    } catch (e) {
      alert(`Impossible d'appliquer le design : ${e.message}`);
      setBusy(false);
    }
  }

  const design = designById[current];
  return (
    <label className="atl-topbar__field">
      <span>Design</span>
      {design?.thumbnail && <img className="atl-design-thumb" src={design.thumbnail} alt="" />}
      <select value={current ?? ""} disabled={busy} onChange={(e) => choose(e.target.value)} className="atl-topbar__pages" title="Derniers designs appliqués">
        {!current && <option value="">Aucun design</option>}
        {ids.map((id) => (
          <option key={id} value={id}>
            {id}.md
          </option>
        ))}
        <option value={OTHER}>Autre design…</option>
      </select>
      {busy && <small className="atl-muted">Application…</small>}
    </label>
  );
}

// « + » du bloc Design : un nouveau design.md, depuis l'outil Palette
// (choisir un design, partir du logo ou d'une palette).
export function NewDesignButton() {
  return (
    <button type="button" className="atl-plus" title="Nouveau design (palette, logo ou design.md)" aria-label="Nouveau design" onClick={() => window.dispatchEvent(new CustomEvent("atl-left-tool", { detail: "palette" }))}>
      +
    </button>
  );
}
