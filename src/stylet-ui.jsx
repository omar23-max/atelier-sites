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
const COLORS = ["#e11d48", "#2563eb", "#16a34a"];
// Outils (2026-11-21) : crayon libre, puis formes posées en deux points
// (début et fin du glisser), texte posé d'un clic.
const TOOLS = [
  ["free", "Crayon", "M3 21l3.5-1 11-11-2.5-2.5-11 11zM14.5 5.5l2.5 2.5"],
  ["line", "Ligne", "M4 20L20 4"],
  ["arrow", "Flèche", "M4 20L20 4M11 4h9v9"],
  ["rect", "Rectangle", "M4 6h16v12H4z"],
  ["ellipse", "Rond", "M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z"],
  ["grid", "Grille", "M4 5h16v14H4zM9.3 5v14M14.7 5v14M4 12h16"],
  ["text", "Texte", "M5 6V4h14v2M12 4v16M9 20h6"],
];
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
    ctx.fillStyle = s.color;
    if (s.type && s.type !== "free") {
      drawShape(ctx, s, v, k);
      continue;
    }
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

function drawShape(ctx, s, v, k) {
  const a = toScreen(v, s.points[0]);
  const b = toScreen(v, s.points[1] ?? s.points[0]);
  const [x1, y1, x2, y2] = [a.x * k, a.y * k, b.x * k, b.y * k];
  ctx.lineWidth = s.size * v.z * k;
  ctx.beginPath();
  if (s.type === "line" || s.type === "arrow") {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (s.type === "arrow" && Math.hypot(x2 - x1, y2 - y1) > 4) {
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = Math.max(14, s.size * 3.2) * v.z * k;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - len * Math.cos(ang - 0.45), y2 - len * Math.sin(ang - 0.45));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - len * Math.cos(ang + 0.45), y2 - len * Math.sin(ang + 0.45));
      ctx.stroke();
    }
  } else if (s.type === "rect" || s.type === "grid") {
    ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    if (s.type === "grid") {
      const [l, t, w, h] = [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
      ctx.save();
      ctx.lineWidth = Math.max(1, s.size * 0.6) * v.z * k;
      ctx.setLineDash([8 * k, 6 * k]);
      ctx.beginPath();
      for (let i = 1; i < (s.cols ?? 3); i++) {
        ctx.moveTo(l + (w * i) / s.cols, t);
        ctx.lineTo(l + (w * i) / s.cols, t + h);
      }
      for (let i = 1; i < (s.rows ?? 1); i++) {
        ctx.moveTo(l, t + (h * i) / s.rows);
        ctx.lineTo(l + w, t + (h * i) / s.rows);
      }
      ctx.stroke();
      ctx.restore();
    }
  } else if (s.type === "ellipse") {
    ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.type === "text") {
    const px = (14 + s.size * 2.2) * v.z * k;
    ctx.font = `600 ${px}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    String(s.text ?? "")
      .split("\n")
      .forEach((line, i) => ctx.fillText(line, x1, y1 + i * px * 1.25));
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
  const [tool, setTool] = useState("free");
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(1);
  const [count, setCount] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [msg, setMsg] = useState(null);
  // Dernier croquis enregistré (2026-11-19) : pour les boutons « Créer une
  // section avec ce croquis » et « Retravailler cette section ».
  const [saved, setSaved] = useState(null); // { image, sectionId, index }

  // Grille (2026-11-21) : changer colonnes / lignes modifie aussi la
  // dernière grille tracée, puis sert aux suivantes.
  const regrid = (key, n) => {
    (key === "cols" ? setCols : setRows)(n);
    const last = [...strokes.current].reverse().find((x) => x.type === "grid");
    if (last) {
      last[key] = n;
      redraw();
    }
  };
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
    if (tool === "text") {
      const p0 = pt(e);
      const text = window.prompt("Texte à écrire sur la page :");
      if (text && text.trim()) {
        strokes.current.push({ type: "text", color, size, text: text.trim(), points: [p0] });
        setCount(strokes.current.length);
        redraw();
      }
      return;
    }
    current.current = tool === "free" ? { color, size, pen: e.pointerType === "pen", points: [pt(e)] } : { type: tool, color, size, cols, rows, points: [pt(e), pt(e)] };
    strokes.current.push(current.current);
    redraw();
  };
  const move = (e) => {
    if (!current.current) return;
    if (current.current.type) {
      // Forme : le second point suit le pointeur ; Maj = carré / cercle /
      // ligne à 45°.
      const a = current.current.points[0];
      let b = pt(e);
      if (e.shiftKey) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (current.current.type === "line" || current.current.type === "arrow") {
          const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          b = { x: a.x + len * Math.cos(ang), y: a.y + len * Math.sin(ang) };
        } else {
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          b = { x: a.x + Math.sign(dx || 1) * m, y: a.y + Math.sign(dy || 1) * m };
        }
      }
      current.current.points[1] = b;
      redraw();
      return;
    }
    const coalesced = e.nativeEvent.getCoalescedEvents?.();
    for (const ev of coalesced?.length ? coalesced : [e.nativeEvent]) current.current.points.push(pt(ev));
    redraw();
  };
  const up = () => {
    // Forme sans glisser (simple clic) : retirée.
    const c = current.current;
    if (c?.type && Math.hypot(c.points[1].x - c.points[0].x, c.points[1].y - c.points[0].y) < 3) strokes.current.pop();
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
          {TOOLS.map(([id, label, d]) => (
            <button key={id} type="button" className={`atl-stylet__tool${tool === id ? " is-on" : ""}`} onClick={() => setTool(id)} title={id === "free" || id === "text" ? label : `${label} (Maj : forme régulière)`} aria-label={label}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={d} />
              </svg>
            </button>
          ))}
          {tool === "grid" && (
            <span className="atl-stylet__grid">
              <select value={cols} onChange={(e) => regrid("cols", Number(e.target.value))} title="Colonnes (change aussi la dernière grille)">
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} col.
                  </option>
                ))}
              </select>
              <select value={rows} onChange={(e) => regrid("rows", Number(e.target.value))} title="Lignes (change aussi la dernière grille)">
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} lig.
                  </option>
                ))}
              </select>
            </span>
          )}
          <span className="atl-stylet__sep" />
          {COLORS.map((c) => (
            <button key={c} type="button" className={`atl-stylet__color${c === color ? " is-on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} title="Couleur" />
          ))}
          <span className="atl-stylet__sep" />
          {SIZES.map(([label, s]) => (
            <button key={s} type="button" className={`atl-stylet__size${s === size ? " is-on" : ""}`} onClick={() => setSize(s)} title={`Trait ${label.toLowerCase()}`} aria-label={`Trait ${label.toLowerCase()}`}>
              <i style={{ width: Math.max(4, s * 1.2), height: Math.max(4, s * 1.2) }} />
            </button>
          ))}
          <span className="atl-stylet__sep" />
          <button type="button" className="atl-stylet__tool" onClick={undo} disabled={!count} title="Annuler le dernier trait ou la dernière forme (Ctrl+Z)" aria-label="Annuler">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />
            </svg>
          </button>
          <button type="button" className="atl-stylet__tool" onClick={clear} disabled={!count} title="Tout effacer" aria-label="Tout effacer">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
            </svg>
          </button>
          <button type="button" className="atl-stylet__save" onClick={save} title="Capture l'aperçu avec ton dessin">
            📸 Enregistrer
          </button>
          {(saved || msg) && (
            <div className="atl-stylet__extra">
              {msg && <span className={msg.error ? "atl-stylet__err" : "atl-stylet__ok"}>{msg.error ?? msg.ok}</span>}
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
            </div>
          )}
          <button type="button" className="atl-stylet__tool" onClick={onClose} title="Fermer le stylet (Échap)" aria-label="Fermer le stylet">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
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
