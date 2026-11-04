import { useEffect, useState } from "react";
import { CAR_DEFAULTS, atlCarrousels, looksLikeCarrousel } from "./engine/carrousel.js";

// Consignes pour l'onglet Design de « Retravailler avec l'IA » : la section
// refaite garde une piste data-atl-car="track", que ce panneau sait régler.
const PISTE =
  'La piste qui défile porte l\'attribut data-atl-car="track" (display:flex; overflow-x:auto; scroll-snap-type:x mandatory; gap entre les diapos) et chaque diapo en est un enfant direct (flex:0 0 auto; scroll-snap-align:start). Ne dessine ni flèches ni points : l\'atelier les ajoute.';
export const IA_VRAI_CARROUSEL = `Transforme cette section en vrai carrousel (slider) qui défile horizontalement. Garde toutes les diapos, leurs textes et leurs images, dans le même ordre. ${PISTE}`;
const iaAjout = (n) => `Ajoute ${n} diapo${n > 1 ? "s" : ""} à ce carrousel, sur le même modèle que les diapos existantes (même structure, même style), avec des textes provisoires du même genre et les mêmes images en attendant. Garde les diapos existantes. ${PISTE}`;

// Panneau « Carrousel » d'une section (réglage atl_carrousel, engine/carrousel.js).
// el : la section dans l'aperçu ; onAiDesign(consigne) ouvre l'IA, onglet Design.
export function CarrouselPanel({ section, props, el, onChange, onAiDesign }) {
  const [found, setFound] = useState(null);
  const [ajout, setAjout] = useState(2);
  const value = { ...CAR_DEFAULTS, ...(props.atl_carrousel ?? {}) };
  const set = (patch) => onChange({ ...props, atl_carrousel: { ...value, ...patch } });

  // Les pistes réelles, relues après chaque rendu de la section.
  useEffect(() => {
    if (!el) return setFound(null);
    const t = setTimeout(() => setFound(atlCarrousels(el.ownerDocument, el)), 250);
    return () => clearTimeout(t);
  }, [el, props]);

  if (!found?.length) {
    if (!looksLikeCarrousel(section)) return null;
    return (
      <div className="atl-style atl-car">
        <p className="atl-style__title">Carrousel</p>
        <p className="atl-insp__hint">Ce carrousel a été copié figé : il ne défile pas et ne se règle pas ici.</p>
        <button type="button" className="atl-car__ia" onClick={() => onAiDesign(IA_VRAI_CARROUSEL)}>
          ✨ En faire un vrai carrousel avec l'IA
        </button>
      </div>
    );
  }

  const count = Math.max(...found.map((f) => f.count));
  const shown = value.nombre > 0 ? Math.min(value.nombre, count) : count;
  return (
    <div className="atl-style atl-car">
      <p className="atl-style__title">Carrousel</p>
      <label className="atl-style__row">
        <span>Navigation</span>
        <select value={value.nav} onChange={(e) => set({ nav: e.target.value })}>
          <option value="origine">Comme le site</option>
          <option value="fleches">Flèches</option>
          <option value="points">Points</option>
          <option value="les-deux">Flèches + points</option>
          <option value="aucune">Au doigt seulement</option>
        </select>
      </label>

      <label className="atl-style__toggle">
        <input type="checkbox" checked={value.auto > 0} onChange={(e) => set({ auto: e.target.checked ? 4 : 0 })} /> Défilement automatique
      </label>
      {value.auto > 0 && (
        <div className="atl-car__sub">
          <label className="atl-style__row">
            <span>Toutes les</span>
            <span className="atl-style__px">
              <input type="number" min="1" max="30" step="0.5" value={value.auto} onChange={(e) => set({ auto: Math.max(1, Number(e.target.value) || 1) })} />s
            </span>
          </label>
          <label className="atl-style__toggle">
            <input type="checkbox" checked={value.pause} onChange={(e) => set({ pause: e.target.checked })} /> Pause quand la souris est dessus
          </label>
        </div>
      )}
      <label className="atl-style__toggle">
        <input type="checkbox" checked={value.boucle} onChange={(e) => set({ boucle: e.target.checked })} /> Revenir au début après la dernière
      </label>

      <p className="atl-style__title">Diapos visibles à la fois</p>
      <div className="atl-style__two">
        <label>
          <span>Ordinateur</span>
          <select value={value.visibles} onChange={(e) => set({ visibles: Number(e.target.value) })}>
            <option value={0}>Comme le site</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Mobile</span>
          <select value={value.visiblesM} onChange={(e) => set({ visiblesM: Number(e.target.value) })}>
            <option value={0}>Comme le site</option>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="atl-style__title">Nombre de diapos</p>
      <div className="atl-style__row">
        <input type="range" min="1" max={count} value={shown} onChange={(e) => set({ nombre: Number(e.target.value) === count ? 0 : Number(e.target.value) })} />
        <code>
          {shown} / {count}
        </code>
      </div>
      <div className="atl-car__add">
        <span>Ajouter</span>
        <input type="number" min="1" max="10" value={ajout} onChange={(e) => setAjout(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
        <button type="button" className="atl-car__ia" onClick={() => onAiDesign(iaAjout(ajout))}>
          ✨ diapo{ajout > 1 ? "s" : ""} avec l'IA
        </button>
      </div>
      <p className="atl-insp__hint">Les images de chaque diapo se changent en cliquant dessus dans l'aperçu. Pour un autre changement (forme des diapos, effet…), utilise « Retravailler avec l'IA » → Design.</p>
    </div>
  );
}
