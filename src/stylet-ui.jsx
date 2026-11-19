// Stylet (2026-11-18) : dessiner sur l'écran de l'éditeur, puis enregistrer
// une capture de l'aperçu avec le dessin (« croquis »). Les croquis d'une page
// sont proposés dans « Retravailler avec l'IA » comme images de référence.
//
// Capture : getDisplayMedia (onglet courant). Chrome demande « Partager cet
// onglet ? », on prend une image puis on arrête. Le croquis est recadré sur
// l'aperçu, avec les sections qu'il touche, puis enregistré par
// POST /api/croquis/<page> (medias/croquis/<page>/).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const pageName = new URLSearchParams(location.search).get("page");
const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#111111"];
const SIZES = [
  ["Fin", 3],
  ["Moyen", 6],
  ["Épais", 12],
];

function previewFrame() {
  for (const f of document.querySelectorAll("iframe")) if (f.contentDocument?.querySelector("[data-atl-id]")) return f;
  return null;
}

// Repère de la page (2026-11-18) : les traits sont gardés dans les
// coordonnées du contenu de l'aperçu (défilement et zoom compris), pas de
// l'écran. Zoom du navigateur, zoom de l'aperçu ou défilement : le dessin
// reste sur ce qu'on a annoté. Sans aperçu : coordonnées de l'écran.
function view() {
  const frame = previewFrame();
  if (!frame) return { frame: null, left: 0, top: 0, z: 1, sx: 0, sy: 0 };
  const fr = frame.getBoundingClientRect();
  const win = frame.contentWindow;
  return { frame, left: fr.left, top: fr.top, z: fr.width / frame.offsetWidth || 1, sx: win.scrollX, sy: win.scrollY, fr };
}
const toPage = (v, cx, cy) => ({ x: (cx - v.left) / v.z + v.sx, y: (cy - v.top) / v.z + v.sy });
const toScreen = (v, p) => ({ x: v.left + (p.x - v.sx) * v.z, y: v.top + (p.y - v.sy) * v.z });

function draw(ctx, strokes) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const k = window.devicePixelRatio || 1;
  const v = view();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    const pts = s.points.map((p) => ({ ...toScreen(v, p), p: p.p }));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      ctx.lineWidth = s.size * v.z * k * (b.p > 0 && s.pen ? 0.4 + b.p * 1.2 : 1);
      ctx.beginPath();
      ctx.moveTo(a.x * k, a.y * k);
      ctx.lineTo(b.x * k, b.y * k);
      ctx.stroke();
    }
    if (pts.length === 1) {
      const a = pts[0];
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(a.x * k, a.y * k, (s.size * v.z * k) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

async function grabTab() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser", frameRate: 5 },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
  });
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // Une image à jour (après l'apparition de la barre de partage).
    await new Promise((r) => setTimeout(r, 400));
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d").drawImage(video, 0, 0);
    return c;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

function Overlay({ onClose }) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const current = useRef(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(6);
  const [count, setCount] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [msg, setMsg] = useState(null);
  // Dernier croquis enregistré (2026-11-19) : pour les boutons « Créer une
  // section avec ce croquis » et « Retravailler cette section ».
  const [saved, setSaved] = useState(null); // { image, sectionId, index }

  const redraw = () => {
    const c = canvasRef.current;
    if (c) draw(c.getContext("2d"), strokes.current);
  };
  const undo = () => {
    strokes.current.pop();
    setCount(strokes.current.length);
    redraw();
  };
  const clear = () => {
    strokes.current = [];
    setCount(0);
    redraw();
  };

  useEffect(() => {
    const fit = () => {
      const c = canvasRef.current;
      if (!c) return;
      const k = window.devicePixelRatio || 1;
      c.width = Math.round(window.innerWidth * k);
      c.height = Math.round(window.innerHeight * k);
      redraw();
    };
    fit();
    window.addEventListener("resize", fit);
    // Le dessin suit l'aperçu : redessiné dès que sa place, son zoom ou son
    // défilement change (zoom du navigateur, zoom de l'aperçu, molette).
    // Minuterie (50 ms) plutôt que requestAnimationFrame : suspendu dans
    // certains onglets ou panneaux en arrière-plan.
    let last = "";
    const follow = () => {
      const v = view();
      const sig = `${v.left}|${v.top}|${v.z}|${v.sx}|${v.sy}|${window.innerWidth}|${window.innerHeight}`;
      if (sig !== last) {
        last = sig;
        const c = canvasRef.current;
        const k = window.devicePixelRatio || 1;
        if (c && (c.width !== Math.round(window.innerWidth * k) || c.height !== Math.round(window.innerHeight * k))) fit();
        else redraw();
      }
    };
    const timer = setInterval(follow, 50);
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.stopPropagation();
        undo();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", fit);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  // Molette pendant le dessin : fait défiler l'aperçu (le dessin suit).
  const wheel = (e) => {
    const frame = previewFrame();
    if (frame) frame.contentWindow.scrollBy(0, e.deltaY);
  };
  const pt = (e) => ({ ...toPage(view(), e.clientX, e.clientY), p: e.pressure });
  const down = (e) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointeur déjà relâché : le trait se dessine quand même
    }
    current.current = { color, size, pen: e.pointerType === "pen", points: [pt(e)] };
    strokes.current.push(current.current);
    redraw();
  };
  const move = (e) => {
    if (!current.current) return;
    const coalesced = e.nativeEvent.getCoalescedEvents?.();
    for (const ev of coalesced?.length ? coalesced : [e.nativeEvent]) current.current.points.push(pt(ev));
    redraw();
  };
  const up = () => {
    if (current.current) setCount(strokes.current.length);
    current.current = null;
  };

  async function save() {
    const frame = previewFrame();
    if (!frame) return setMsg({ error: "Aperçu introuvable." });
    if (!navigator.mediaDevices?.getDisplayMedia) return setMsg({ error: "Ce navigateur ne permet pas la capture d'écran (utilise Chrome ou Edge)." });
    setHidden(true);
    setMsg(null);
    await new Promise((r) => setTimeout(r, 120));
    try {
      const shot = await grabTab();
      setHidden(false);
      const fr = frame.getBoundingClientRect();
      const k = shot.width / window.innerWidth;
      const out = document.createElement("canvas");
      const scale = Math.min(1, 1600 / (fr.width * k));
      out.width = Math.round(fr.width * k * scale);
      out.height = Math.round(fr.height * k * scale);
      out.getContext("2d").drawImage(shot, fr.left * k, fr.top * k, fr.width * k, fr.height * k, 0, 0, out.width, out.height);
      // Sections touchées par le dessin (sans dessin : celles qu'on voit).
      const v = view();
      const pts = strokes.current.flatMap((s) => s.points).map((p) => toScreen(v, p));
      const box = pts.length ? { t: Math.min(...pts.map((p) => p.y)), b: Math.max(...pts.map((p) => p.y)) } : { t: fr.top, b: fr.bottom };
      const z = fr.width / frame.offsetWidth || 1;
      const sections = [...frame.contentDocument.querySelectorAll("[data-atl-id]")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const top = fr.top + r.top * z;
          const bottom = fr.top + r.bottom * z;
          return r.height > 0 && bottom > Math.max(box.t, fr.top) && top < Math.min(box.b, fr.bottom);
        })
        .map((el) => el.getAttribute("data-atl-id"));
      const image = out.toDataURL("image/jpeg", 0.88);
      const res = await fetch(`/api/croquis/${encodeURIComponent(pageName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, sections }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      // Section dessinée : la première touchée ; son rang = ordre dans l'aperçu.
      const all = [...frame.contentDocument.querySelectorAll("[data-atl-id]")].map((el) => el.getAttribute("data-atl-id"));
      const sectionId = sections[0] ?? null;
      setSaved({ image, sectionId, index: sectionId ? all.indexOf(sectionId) : all.length - 1 });
      setMsg({ ok: "Croquis enregistré." });
    } catch (e) {
      setHidden(false);
      setMsg({ error: e?.name === "NotAllowedError" ? "Capture annulée." : e.message });
    }
  }

  return createPortal(
    <div className="atl-stylet">
      <canvas ref={canvasRef} className="atl-stylet__canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} />
      {!hidden && (
        <div className="atl-stylet__bar" onPointerDown={(e) => e.stopPropagation()}>
          <b>✎ Stylet</b>
          {COLORS.map((c) => (
            <button key={c} type="button" className={`atl-stylet__color${c === color ? " is-on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} title="Couleur" />
          ))}
          <span className="atl-stylet__sep" />
          {SIZES.map(([label, s]) => (
            <button key={s} type="button" className={s === size ? "is-on" : ""} onClick={() => setSize(s)}>
              {label}
            </button>
          ))}
          <span className="atl-stylet__sep" />
          <button type="button" onClick={undo} disabled={!count} title="Annuler le dernier trait (Ctrl+Z)">
            ↶
          </button>
          <button type="button" onClick={clear} disabled={!count}>
            Effacer
          </button>
          <button type="button" className="atl-stylet__save" onClick={save} title="Capture l'aperçu avec ton dessin">
            📸 Enregistrer
          </button>
          {saved && (
            <>
              <button
                type="button"
                className="atl-stylet__next"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("atl-add-section", { detail: { index: saved.index + 1, image: saved.image } }));
                  onClose();
                }}
                title="Ouvre « Ajouter une section » avec ce croquis, juste après la section dessinée"
              >
                🖼 Créer une section avec ce croquis
              </button>
              {saved.sectionId && (
                <button
                  type="button"
                  className="atl-stylet__next"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("atl-ai-section", { detail: { sectionId: saved.sectionId, image: saved.image } }));
                    onClose();
                  }}
                  title="Ouvre « Retravailler avec l'IA » sur la section dessinée, onglet Design, avec ce croquis comme exemple"
                >
                  ✨ Retravailler cette section
                </button>
              )}
            </>
          )}
          <button type="button" onClick={onClose} title="Fermer (Échap)">
            Fermer
          </button>
          {msg && <span className={msg.error ? "atl-stylet__err" : "atl-stylet__ok"}>{msg.error ?? msg.ok}</span>}
        </div>
      )}
    </div>,
    document.body,
  );
}

// Bouton dans la barre de l'aperçu (à côté de « Plein écran »).
export function StyletButton() {
  const [on, setOn] = useState(false);
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    const find = () => document.querySelector('[class*="ViewportControls-actionsInner"]');
    if (find()) return setSlot(find());
    const obs = new MutationObserver(() => find() && (setSlot(find()), obs.disconnect()));
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  const button = (
    <button type="button" className={`atl-viewport-btn atl-stylet-btn${on ? " is-on" : ""}`} onClick={() => setOn(!on)} title="Stylet : dessiner sur l'écran, puis enregistrer une capture pour l'IA" aria-label="Stylet">
      {/* La barre de l'aperçu n'affiche que les icônes (texte à 0 px). */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      Stylet
    </button>
  );
  return (
    <>
      {slot && createPortal(button, slot)}
      {on && <Overlay onClose={() => setOn(false)} />}
    </>
  );
}

// Croquis d'une page, du plus récent au plus ancien ; ceux qui touchent la
// section donnée d'abord. Pour la fenêtre « Retravailler avec l'IA ».
export async function croquisFor(sectionId) {
  try {
    const list = await fetch(`/api/croquis/${encodeURIComponent(pageName)}`).then((r) => r.json());
    if (!Array.isArray(list)) return [];
    return [...list.filter((c) => c.sections?.includes(sectionId)), ...list.filter((c) => !c.sections?.includes(sectionId))];
  } catch {
    return [];
  }
}

export async function dataUrlOf(url) {
  const blob = await fetch(url).then((r) => r.blob());
  return new Promise((ok) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.readAsDataURL(blob);
  });
}
