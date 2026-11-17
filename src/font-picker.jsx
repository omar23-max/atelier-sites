import { useEffect, useMemo, useRef, useState } from "react";
import { FONT_GROUPS, fallbackOf, groupOfFont } from "./engine/fonts.js";
import { designs } from "./engine/designs.js";

// Sélecteur de police avec aperçu (audit « Ensuite », 2026-11-17) : au lieu
// de taper un nom Google Fonts, on choisit dans une liste où chaque police
// s'affiche dans sa vraie forme. Recherche, polices des designs du catalogue,
// nom libre ; disponibilité vérifiée sur Google Fonts ; police de secours
// affichée (celle qui s'affiche si la police ne charge pas).

const loaded = new Set();
// Charge seulement les lettres de l'aperçu (paramètre text=) : léger.
function preload(name, text) {
  const key = `${name}|${text}`;
  if (!name || loaded.has(key)) return;
  loaded.add(key);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}&text=${encodeURIComponent(text)}&display=swap`;
  document.head.appendChild(link);
}

const availability = new Map();
// Une feuille de style Google Fonts qui se charge = police trouvée ; une
// erreur (réponse 400, police inconnue) = introuvable. (fetch ne marche pas :
// la réponse d'erreur de Google n'autorise pas la lecture.)
async function isOnGoogle(name) {
  if (!availability.has(name)) {
    availability.set(
      name,
      new Promise((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}&text=Aa&display=swap`;
        const timer = setTimeout(() => (link.remove(), resolve(null)), 8000);
        link.onload = () => (clearTimeout(timer), resolve(true));
        link.onerror = () => (clearTimeout(timer), link.remove(), resolve(false));
        document.head.appendChild(link);
      }),
    );
  }
  return availability.get(name);
}

const SAMPLE = "Aa Bb 123 — Ton titre";
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function FontPicker({ label, value, designFont, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [ok, setOk] = useState(null);
  const box = useRef(null);
  const shown = value || designFont || "";

  // Polices des designs du catalogue qui ne sont pas dans la liste.
  const fromDesigns = useMemo(() => {
    const set = new Set();
    for (const d of designs) for (const f of [d.tokens?.polices?.titres, d.tokens?.polices?.texte]) if (f && !groupOfFont(f)) set.add(String(f).trim());
    return [...set].filter((f) => f.length < 40).sort((a, b) => a.localeCompare(b));
  }, []);

  useEffect(() => {
    if (shown) preload(shown, `${shown}${SAMPLE}`);
    if (!value) return setOk(null);
    let alive = true;
    setOk(undefined);
    isOnGoogle(value).then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, [value, shown]);

  useEffect(() => {
    if (!open) return;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const match = (f) => !q || fold(f).includes(fold(q));
  const groups = [...FONT_GROUPS.map((g) => ({ ...g, list: g.fonts.filter(match) })), { id: "designs", label: "Polices de tes designs (à vérifier)", list: fromDesigns.filter(match) }].filter((g) => g.list.length);
  const exact = q.trim() && [...FONT_GROUPS.flatMap((g) => g.fonts), ...fromDesigns].some((f) => fold(f) === fold(q.trim()));
  const pick = (name) => {
    onChange(name);
    setOpen(false);
    setQ("");
  };

  return (
    <div className="atl-fontpick" ref={box}>
      <span className="atl-fontpick__label">{label}</span>
      <button type="button" className="atl-fontpick__btn" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ fontFamily: shown ? `'${shown}', ${fallbackOf(shown)}` : undefined }}>
        <span>{shown || "Police du site"}</span>
        <small>{value ? "choisie" : "du design"} ▾</small>
      </button>
      <small className="atl-fontpick__info">
        {value && ok === false ? <b className="is-warn">⚠ Introuvable sur Google Fonts : la police de secours s'affichera. </b> : null}
        {value && ok === true ? "✓ Google Fonts · " : ""}
        Secours : {fallbackOf(shown)}
      </small>
      {open && (
        <div className="atl-fontpick__pop" role="listbox" aria-label={label}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une police…" />
          <div className="atl-fontpick__list">
            <button type="button" className={!value ? "is-on" : ""} onClick={() => pick("")}>
              <span>Celle du design{designFont ? ` (${designFont})` : ""}</span>
            </button>
            {q.trim() && !exact && (
              <button type="button" onClick={() => pick(q.trim())}>
                <span>Utiliser « {q.trim()} »</span>
                <small>nom Google Fonts</small>
              </button>
            )}
            {groups.map((g) => (
              <div key={g.id} className="atl-fontpick__group">
                <p>{g.label}</p>
                {g.list.map((f) => (
                  <FontRow key={f} name={f} on={fold(f) === fold(value)} onPick={() => pick(f)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FontRow({ name, on, onPick }) {
  const ref = useRef(null);
  // Chargée seulement quand la ligne devient visible dans la liste.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        preload(name, `${name}${SAMPLE}`);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [name]);
  return (
    <button ref={ref} type="button" className={on ? "is-on" : ""} onClick={onPick} style={{ fontFamily: `'${name}', ${fallbackOf(name)}` }}>
      <span>{name}</span>
      <small>{SAMPLE}</small>
    </button>
  );
}
