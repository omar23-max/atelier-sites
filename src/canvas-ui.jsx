import { WhImport } from "./winninghunter-ui.jsx";
import { MirrorPanel, MirrorImagePanel } from "./mirror-pub-ui.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { sections, sectionsIndex } from "./engine/sections.js";
import { ROOT_ZONE } from "./library-ui.jsx";
import { WorkspaceSwitch, useOpenFromUrl } from "./workspace-switch.jsx";
import { aiTargets, applyValues } from "./inspector-ui.jsx";
import { familiesOf } from "./engine/page-score.js";
import { FAMILIES } from "./engine/families.js";
import { fondationsPourAudit } from "./engine/fidelite.js";
import { pageTypeOf } from "./engine/page-types.js";
import { originalPhotoTargets } from "./engine/photos.js";

// ---- Canvas (2026-11-11 ; refait sur Excalidraw le 2026-11-12) ----
// Le Canvas de Whitelabeler est un tableau Excalidraw : mêmes outils
// (verrou, main, sélection, rectangle, losange, ellipse, flèche, ligne,
// dessin, texte, image, gomme, autres outils), même panneau de style, menu ☰,
// zoom et annuler en bas à gauche. En haut à droite, comme chez lui : Tes
// images, Créer une image, Créer une vidéo, Section images, le nom du tableau
// et « Enregistré ». Plusieurs tableaux par projet (menu ☰).
// Fichiers : medias/projets/<projet>/canvas/<id>.json (route /api/canvas).
// Polices d'Excalidraw servies par l'atelier (pas de site externe).
if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/node_modules/@excalidraw/excalidraw/dist/prod/";

const byId = sectionsIndex;
const pageName = new URLSearchParams(location.search).get("page") ?? "brouillon";
const FORMATS = { "1:1": [1024, 1024], "4:5": [1024, 1280], "3:4": [1024, 1365], "2:3": [1024, 1536], "16:9": [1536, 864], "9:16": [864, 1536] };
const MODELES = { "nano-banana": { label: "Nano Banana", prix: 0.04 }, "gpt-image-2": { label: "GPT Image 2", prix: 0.05 }, "nano-banana-pro": { label: "Nano Banana Pro", prix: 0.13 } };
const QUALITES = { high: "Haute", medium: "Moyenne", low: "Basse" };
const MAX_REFS = 8;
const FAMILY_BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));

// Lecteur vidéo de l'atelier (2026-11-20) : aperçu ou première image au lieu
// d'un rectangle noir. url / poster : adresses /medias/… du projet.
// Vidéo d'un tableau (2026-11-20) : gros bouton ▶ qui lance la lecture dès
// le premier clic (sinon Canvas demande d'abord d'« activer » le cadre).
// Pendant la lecture, les commandes répondent ; en pause, la vidéo redevient
// un élément qu'on déplace comme les autres.
// Appui sur un élément posé au-dessus du tableau (bouton ▶) → même appui sur
// le tableau d'Excalidraw, Ctrl ou Cmd valant Maj (ajout à la sélection).
function forwardToBoard(e) {
  const board = document.querySelector(".excalidraw canvas.interactive");
  if (!board) return;
  board.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, pointerId: e.pointerId, pointerType: e.pointerType || "mouse", isPrimary: true, button: 0, buttons: 1, shiftKey: e.shiftKey || e.ctrlKey || e.metaKey, altKey: e.altKey }),
  );
}

function CanvasVideo({ url, poster }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  return (
    <div className="atl-cv__vwrap">
      <video
        ref={ref}
        className="atl-cv__video"
        src={poster ? url : `${url}#t=0.3`}
        poster={poster}
        controls={playing}
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        style={{ pointerEvents: playing ? "auto" : undefined }}
      />
      {!playing && (
        <button
          type="button"
          className="atl-cv__play"
          title="Lire la vidéo"
          aria-label="Lire la vidéo"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const d = { x: e.clientX, y: e.clientY, mod: e.ctrlKey || e.metaKey || e.shiftKey };
            // Le tableau capture le pointeur : le clic n'arrive plus au bouton.
            // Relâché sans bouger ni touche Ctrl/Maj → lecture.
            window.addEventListener(
              "pointerup",
              (u) => {
                if (!d.mod && Math.hypot(u.clientX - d.x, u.clientY - d.y) < 6) ref.current?.play().catch(() => {});
              },
              { once: true, capture: true },
            );
            forwardToBoard(e);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          ▶
        </button>
      )}
    </div>
  );
}

const lecteurLink = (url, poster) => `${location.origin}/api/lecteur?v=${encodeURIComponent(url)}${poster ? `&p=${encodeURIComponent(poster)}` : ""}`;
const sizeOf = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
    img.onerror = () => resolve([1024, 1024]);
    img.src = src;
  });
const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
const download = (url, name) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
};
const mimeOf = (url) => (/\.jpe?g$/i.test(url) ? "image/jpeg" : /\.webp$/i.test(url) ? "image/webp" : /\.gif$/i.test(url) ? "image/gif" : "image/png");
// Identifiant de fichier stable pour une adresse : la même image n'est
// chargée qu'une fois dans le tableau.
const fileIdOf = (url) => {
  let h = 5381;
  for (const c of url) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return `f${h.toString(36)}${url.length.toString(36)}`;
};
const plainText = (h) => {
  const t = document.createElement("textarea");
  t.innerHTML = String(h ?? "").replace(/<[^>]+>/g, " ");
  t.innerHTML = t.value; // certains imports encodent deux fois (« &amp;nbsp; »)
  return t.value.replace(/\s+/g, " ").trim();
};
const nearestFormat = (w, h) => Object.entries(FORMATS).sort((a, b) => Math.abs(a[1][0] / a[1][1] - w / h) - Math.abs(b[1][0] / b[1][1] - w / h))[0][0];
const ago = (iso) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 60 * 24) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
};

// Fond blanc → transparent : remplissage depuis les bords (le blanc à
// l'intérieur du sujet reste), bord adouci. Rend une data URL PNG.
async function knockOutWhite(url, tol = 36) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H);
  const p = d.data;
  const gone = new Uint8Array(W * H);
  const seen = new Uint8Array(W * H);
  const light = (i) => 765 - (p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2]) < tol * 3;
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i]) continue;
    seen[i] = 1;
    if (!light(i)) continue;
    gone[i] = 1;
    p[i * 4 + 3] = 0;
    const x = i % W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W);
    if (i < W * (H - 1)) stack.push(i + W);
  }
  for (let i = 0; i < W * H; i++) {
    if (gone[i]) continue;
    const x = i % W;
    const near = (x > 0 && gone[i - 1]) || (x < W - 1 && gone[i + 1]) || (i >= W && gone[i - W]) || (i < W * (H - 1) && gone[i + W]);
    if (!near) continue;
    const dark = 765 - (p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2]);
    p[i * 4 + 3] = Math.min(255, Math.round((dark / (tol * 6)) * 255));
  }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL("image/png");
}

async function uploadDataUrl(dataUrl, name) {
  const res = await fetch(`/api/medias/${pageName}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, dataUrl }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Envoi refusé");
  return body.url;
}

export function CanvasButton() {
  const [open, setOpen] = useState(() => window.__atlEspace === "canvas");
  useEffect(() => {
    const on = () => setOpen(true);
    useOpenFromUrl("canvas");
    window.addEventListener("atl-open-canvas", on);
    return () => window.removeEventListener("atl-open-canvas", on);
  }, []);
  return (
    <>
      {open ? createPortal(<Canvas onClose={() => ((window.__atlEspace = null), setOpen(false))} />, document.body) : null}
      <DropTrayHost />
    </>
  );
}

// Excalidraw (≈ 2 Mo) n'est chargé qu'à l'ouverture du Canvas (audit T6,
// 2026-11-17) : l'éditeur s'ouvre plus vite. En cas d'échec : message et
// « Réessayer ».
let excalidrawJob = null;
const loadExcalidraw = () =>
  (excalidrawJob ??= Promise.all([import("@excalidraw/excalidraw"), import("@excalidraw/excalidraw/index.css")]).then(([m]) => m).catch((e) => {
    excalidrawJob = null;
    throw e;
  }));
function Canvas({ onClose }) {
  const [X, setX] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    loadExcalidraw()
      .then((m) => alive && setX(m))
      .catch((e) => alive && setError(e.message || "chargement impossible"));
    return () => {
      alive = false;
    };
  }, [attempt]);
  if (X) return <CanvasBoard onClose={onClose} X={X} />;
  return (
    <div className="atl-cv atl-cv--loading" role="dialog" aria-modal="true" aria-label="Canvas">
      <div className="atl-cv__loadbox">
        {error ? (
          <>
            <p>Le Canvas n'a pas pu se charger ({error}).</p>
            <button type="button" className="atl-left__cta" onClick={() => setAttempt((n) => n + 1)}>
              Réessayer
            </button>
          </>
        ) : (
          <p>Chargement du Canvas…</p>
        )}
        <button type="button" className="atl-cv__close" onClick={onClose} aria-label="Fermer le Canvas">
          ×
        </button>
      </div>
    </div>
  );
}

function CanvasBoard({ onClose, X }) {
  const { Excalidraw, MainMenu, convertToExcalidrawElements, CaptureUpdateAction, restoreElements } = X;
  const getPuck = useGetPuck();
  const root = getPuck().appState.data.root?.props ?? {};
  const [projet, setProjet] = useState(null);
  const [boards, setBoards] = useState([]);
  const [board, setBoard] = useState(null); // { id, nom, initial }
  const [api, setApi] = useState(null);
  const [saved, setSaved] = useState("ok");
  const [panel, setPanel] = useState(null); // "image" | "sections" | "images" | null
  const [refs, setRefs] = useState([]); // [{ fileId, url }]
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState(null); // image sélectionnée : { id, url, x, y, w, customData }
  const [details, setDetails] = useState(null);
  const [exportUrls, setExportUrls] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState({});
  const [renaming, setRenaming] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [whOpen, setWhOpen] = useState(false);
  const [selVid, setSelVid] = useState(null); // vidéo sélectionnée : { id, url, poster, left, top }
  const [mirror, setMirror] = useState(null); // { url, poster } : panneau Mirror ouvert
  const [mirrorImg, setMirrorImg] = useState(null); // adresse de la pub image : panneau Mirror image
  const lastVid = useRef("");
  const videoRef = useRef(null);
  const sig = useRef("");
  const saveTimer = useRef(null);
  const uploaded = useRef({}); // fileId → adresse /medias/… (images collées ou glissées)
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  const lastSel = useRef("");
  const emptyRef = useRef(null);

  // Ctrl + clic = Maj + clic (2026-11-21) : Excalidraw n'ajoute à la
  // sélection qu'avec Maj ; l'utilisateur sélectionne avec Ctrl.
  useEffect(() => {
    const asShift = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey) return;
      if (!(e.target instanceof Element) || !e.target.closest(".excalidraw canvas")) return;
      try {
        Object.defineProperty(e, "shiftKey", { get: () => true });
        Object.defineProperty(e, "ctrlKey", { get: () => false });
        Object.defineProperty(e, "metaKey", { get: () => false });
      } catch {}
    };
    for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"]) window.addEventListener(t, asShift, true);
    return () => {
      for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"]) window.removeEventListener(t, asShift, true);
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.error ? 10000 : 6000);
    return () => clearTimeout(t);
  }, [flash]);

  // Liste des tableaux, puis le plus récent (créé s'il n'y en a pas).
  async function refreshBoards() {
    const d = await fetch(`/api/canvas/${pageName}`).then((r) => r.json());
    setProjet(d.projet ?? null);
    setBoards(d.tableaux ?? []);
    return d.tableaux ?? [];
  }
  async function openBoard(id) {
    if (!(await confirmLeave())) return;
    const b = await fetch(`/api/canvas/${pageName}/${id}`).then((r) => r.json());
    sig.current = "";
    setSel(null);
    // Pas de remise à zéro de l'API : si c'est le même tableau (ouverture en
    // double au démarrage), Excalidraw n'est pas remonté et ne la renverrait pas.
    setBoard((cur) => (cur?.id === b.id ? cur : { id: b.id, nom: b.nom, initial: b }));
  }
  async function newBoard(nom) {
    const r = await fetch(`/api/canvas/${pageName}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nom }) }).then((x) => x.json());
    await refreshBoards();
    await openBoard(r.id);
  }
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // une seule fois (React l'appelle deux fois en développement)
    started.current = true;
    refreshBoards().then((list) => (list.length ? openBoard(list[0].id) : newBoard("Tableau 1")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // À l'ouverture : les images envoyées par le Studio (aAjouter) sont posées
  // à droite du contenu, puis le tableau est cadré.
  useEffect(() => {
    if (!api || !board?.initial) return;
    const queue = board.initial.aAjouter ?? [];
    if (queue.length) {
      (async () => {
        const els = api.getSceneElements();
        const right = els.length ? Math.max(...els.map((e) => e.x + e.width)) + 160 : 0;
        const placed = [];
        for (const [i, q] of queue.entries()) {
          const w = q.w || 280;
          const h = Math.round(w / (q.ratio > 0 ? q.ratio : 1));
          placed.push(...(await imageElements(q.url, { x: q.x ?? right + (i % 5) * (w + 40), y: q.y ?? Math.floor(i / 5) * (h + 80), w, h, customData: { label: q.label ?? "", origine: q.origine ?? null } })));
        }
        api.updateScene({ elements: [...api.getSceneElements(), ...placed], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
        api.scrollToContent(placed, { fitToContent: true, animate: false });
        save(true, queue.length);
      })();
    } else if (api.getSceneElements().length) api.scrollToContent(undefined, { fitToContent: true, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, board?.id]);

  // Images : fichier Excalidraw dont la « dataURL » est l'adresse de l'image
  // dans l'atelier (pas de copie dans le tableau).
  async function imageElements(url, { x, y, w, h, customData = {} }) {
    const fileId = fileIdOf(url);
    if (!w || !h) {
      const [nw, nh] = await sizeOf(url);
      w = w || 280;
      h = h || Math.round((w * nh) / nw);
    }
    api.addFiles([{ id: fileId, dataURL: url, mimeType: mimeOf(url), created: Date.now() }]);
    return convertToExcalidrawElements([{ type: "image", fileId, x, y, width: w, height: h, status: "saved", customData: { url, ...customData } }]);
  }
  function viewCenter() {
    const s = api.getAppState();
    return [-s.scrollX + s.width / 2 / s.zoom.value, -s.scrollY + s.height / 2 / s.zoom.value];
  }
  // Place libre près du centre de l'écran : décale vers la droite.
  function freeSpot(x, y, w, h) {
    const list = api.getSceneElements();
    for (let n = 0; n < 80; n++) {
      const hit = list.find((o) => x < o.x + o.width + 24 && x + w + 24 > o.x && y < o.y + o.height + 24 && y + h + 24 > o.y);
      if (!hit) break;
      x = hit.x + hit.width + 40;
    }
    return { x, y };
  }
  async function addImagesAtCenter(urls, customData = {}) {
    const [cx, cy] = viewCenter();
    const out = [];
    for (const url of urls) {
      const [nw, nh] = await sizeOf(url);
      const w = 280;
      const h = Math.round((w * nh) / nw);
      const spot = freeSpot(cx - w / 2, cy - h / 2, w, h);
      const els = await imageElements(url, { x: spot.x, y: spot.y, w, h, customData });
      api.updateScene({ elements: [...api.getSceneElements(), ...els], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      out.push(...els);
    }
    return out;
  }

  // ---- Enregistrement (0,8 s après le dernier changement) ----
  async function sceneForSave() {
    const elements = api.getSceneElements();
    const files = api.getFiles();
    const out = {};
    for (const el of elements) {
      if (el.type !== "image" || !el.fileId || out[el.fileId]) continue;
      const f = files[el.fileId];
      if (!f) continue;
      let url = f.dataURL;
      if (/^data:/.test(url)) {
        // Image collée ou glissée dans le tableau : envoyée une fois dans le projet.
        url = uploaded.current[el.fileId] ?? (uploaded.current[el.fileId] = await uploadDataUrl(url, "canvas.png"));
      }
      out[el.fileId] = { id: el.fileId, mimeType: f.mimeType, dataURL: url, created: f.created };
    }
    const s = api.getAppState();
    return { elements, files: out, appState: { scrollX: s.scrollX, scrollY: s.scrollY, zoom: s.zoom.value, viewBackgroundColor: s.viewBackgroundColor } };
  }
  // Audit CV01 (2026-11-23) : save() dit si l'enregistrement a réussi ;
  // flushSave() attend aussi un enregistrement déjà parti et réessaie si le
  // dernier a échoué. Fermer ou changer d'espace ne se fait plus en silence
  // après un échec (confirmLeave).
  const inflight = useRef(null);
  const lastOk = useRef(true);
  async function save(force = false, aAjouterPris = 0) {
    if (!api || !board) return true;
    const run = (async () => {
      try {
        setSaved("encours");
        const scene = await sceneForSave();
        const res = await fetch(`/api/canvas/${pageName}/${board.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nom: board.nom, ...scene, aAjouterPris }) });
        setSaved(res.ok ? "ok" : "erreur");
        return res.ok;
      } catch {
        setSaved("erreur");
        return false;
      }
    })();
    inflight.current = run;
    const ok = await run;
    if (inflight.current === run) inflight.current = null;
    lastOk.current = ok;
    return ok;
  }
  async function flushSave() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      return save();
    }
    if (inflight.current) await inflight.current;
    if (!lastOk.current) return save();
    return true;
  }
  // Avant de quitter le tableau : vrai si on peut partir.
  async function confirmLeave() {
    if (await flushSave()) return true;
    return window.confirm("L'enregistrement du tableau a échoué (connexion ou serveur).\n\nOK : quitter quand même, les dernières modifications seront perdues.\nAnnuler : rester dans le Canvas (il réessaiera au prochain changement).");
  }
  function onChange(elements, appState, files) {
    const isEmpty = !elements.some((e) => !e.isDeleted);
    if (isEmpty !== emptyRef.current) setEmpty((emptyRef.current = isEmpty));
    // Image sélectionnée → barre d'actions au-dessus d'elle.
    const ids = Object.keys(appState.selectedElementIds ?? {});
    const one = ids.length === 1 ? elements.find((e) => e.id === ids[0] && e.type === "image") : null;
    const z = appState.zoom.value;
    const key = one ? `${one.id}:${Math.round(one.x)}:${Math.round(one.y)}:${Math.round(one.width)}:${appState.scrollX | 0}:${appState.scrollY | 0}:${z}` : "";
    if (key !== lastSel.current) {
      lastSel.current = key;
      const f = one ? files[one.fileId] : null;
      const url = one ? (one.customData?.url ?? (f && !/^data:/.test(f.dataURL) ? f.dataURL : uploaded.current[one.fileId] ?? f?.dataURL)) : null;
      setSel(one && url ? { id: one.id, fileId: one.fileId, url, left: (one.x + appState.scrollX) * z + one.width * z * 0.5, top: (one.y + appState.scrollY) * z, customData: one.customData ?? {} } : null);
      // « Clique des images du tableau pour les ajouter » (Nouvelle image,
      // ou Section images en mode « Choisir sur le tableau »).
      if (one && url && (panelRef.current === "image" || pickingRef.current)) {
        setRefs((r) => (r.some((x) => x.fileId === one.fileId) ? r : r.length >= MAX_REFS ? r : [...r, { fileId: one.fileId, url }]));
      }
    }
    // Vidéo sélectionnée → barre « Mirror » au-dessus d'elle (2026-11-20).
    const vid = ids.length === 1 ? elements.find((e) => e.id === ids[0] && e.type === "embeddable" && /\.(mp4|mov|webm)$/i.test(e.customData?.url ?? "")) : null;
    const vkey = vid ? `${vid.id}:${Math.round(vid.x)}:${Math.round(vid.y)}:${Math.round(vid.width)}:${appState.scrollX | 0}:${appState.scrollY | 0}:${z}` : "";
    if (vkey !== lastVid.current) {
      lastVid.current = vkey;
      setSelVid(vid ? { id: vid.id, url: vid.customData.url, poster: vid.customData.poster ?? null, left: (vid.x + appState.scrollX) * z + vid.width * z * 0.5, top: (vid.y + appState.scrollY) * z } : null);
    }
    // Enregistrement seulement si le contenu ou la vue ont changé.
    const s = `${elements.map((e) => `${e.id}${e.version}`).join("")}|${appState.scrollX | 0}|${appState.scrollY | 0}|${z}|${appState.viewBackgroundColor}`;
    if (s === sig.current) return;
    const first = sig.current === "";
    sig.current = s;
    if (first) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      save();
    }, 800);
  }

  // ---- Créer des images (Nouvelle image et Section images) ----
  // Un cadre en pointillés « Ton image arrive ici » est posé, puis remplacé.
  async function makeImage({ prompt, type = "image", format = "1:1", modele, qualite = "medium", source, titre = null }) {
    const [W, H] = FORMATS[format] ?? FORMATS["1:1"];
    const [cx, cy] = viewCenter();
    const w = 300;
    const h = Math.round((w * H) / W);
    const spot = freeSpot(cx - w / 2, cy - h / 2, w, h + (titre ? 44 : 0));
    const y0 = spot.y + (titre ? 44 : 0);
    const ph = convertToExcalidrawElements([
      { type: "rectangle", x: spot.x, y: y0, width: w, height: h, strokeStyle: "dashed", strokeColor: "#6d5dfc", backgroundColor: "transparent", roundness: null, label: { text: "Ton image arrive ici…", fontSize: 16, strokeColor: "#4f46e5" }, customData: { attente: true } },
      ...(titre ? [{ type: "text", x: spot.x, y: spot.y, text: titre, fontSize: 22, strokeColor: "#1e1e2e" }] : []),
    ]);
    const phIds = ph.filter((e) => e.type === "rectangle" || e.customData?.attente || (e.type === "text" && e.containerId)).map((e) => e.id);
    api.updateScene({ elements: [...api.getSceneElements(), ...ph], captureUpdate: CaptureUpdateAction.NEVER });
    try {
      const res = await fetch("/api/ia/canvas-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: pageName, prompt, type, qualite, references: refs.map((x) => x.url), produit: root.produit ?? "", description: root.infos ?? "", width: W, height: H, modele }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      const img = await imageElements(body.url, { x: spot.x, y: y0, w, h, customData: { label: titre ?? prompt.slice(0, 60), origine: { source, consigne: prompt, modele: MODELES[body.modele]?.label ?? body.modele, references: refs.map((x) => x.url), format } } });
      api.updateScene({ elements: [...api.getSceneElements().filter((e) => !phIds.includes(e.id)), ...img], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      return body.url;
    } catch (e) {
      api.updateScene({ elements: api.getSceneElements().filter((e2) => !phIds.includes(e2.id) && !(titre && e2.type === "text" && e2.text === titre && ph.some((p) => p.id === e2.id))), captureUpdate: CaptureUpdateAction.NEVER });
      throw e;
    }
  }

  // ---- Retirer le fond : nouvelle image posée à droite ----
  async function detourer(it) {
    setBusy((b) => ({ ...b, [it.id]: "Détourage…" }));
    try {
      const res = await fetch("/api/ia/detourer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: pageName, source: it.url }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      let url = body.url;
      let note = body.transparent ? "Fond transparent" : "Fond blanc";
      if (!body.transparent) {
        try {
          url = await uploadDataUrl(await knockOutWhite(body.url), "detoure-transparent.png");
          note = "Fond rendu transparent (blanc autour du sujet retiré)";
        } catch {}
      }
      const el = api.getSceneElements().find((e) => e.id === it.id);
      const spot = freeSpot(el.x + el.width + 40, el.y, el.width, el.height);
      const els = await imageElements(url, { x: spot.x, y: spot.y, w: el.width, h: el.height, customData: { label: `${it.customData?.label ?? "image"} (sans fond)`, origine: { source: "Fond retiré", depuis: it.url, modele: "GPT Image 2", note } } });
      api.updateScene({ elements: [...api.getSceneElements(), ...els], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    } catch (e) {
      setFlash({ error: e.message });
    } finally {
      setBusy((b) => ({ ...b, [it.id]: undefined }));
    }
  }
  function removeSel() {
    api.updateScene({ elements: api.getSceneElements().filter((e) => e.id !== sel.id), appState: { selectedElementIds: {} }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }
  async function renameBoard(nom) {
    setRenaming(false);
    nom = nom.trim();
    if (!nom || nom === board.nom) return;
    setBoard((b) => ({ ...b, nom }));
    setBoards((l) => l.map((x) => (x.id === board.id ? { ...x, nom } : x)));
    setTimeout(() => save(true), 50);
  }

  // « Delete this board » : le tableau va dans canvas/_corbeille/ (rien
  // n'est effacé), puis le plus récent des autres s'ouvre.
  async function deleteBoard() {
    if (!confirm(`Mettre le tableau « ${board.nom} » à la corbeille du Canvas ?`)) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    await fetch(`/api/canvas/${pageName}/${board.id}`, { method: "DELETE" });
    const list = await refreshBoards();
    if (list.length) await openBoard(list[0].id);
    else await newBoard("Tableau 1");
    setFlash({ ok: "Tableau mis à la corbeille du Canvas (récupérable)." });
  }
  // « Add a video » : la vidéo est envoyée dans le projet puis posée sur le
  // tableau (élément intégré d'Excalidraw qui la lit).
  async function addVideo(file) {
    if (!file) return;
    if (file.size > 70 * 1024 * 1024) return setFlash({ error: "Vidéo trop lourde (70 Mo au plus : limite du tunnel Cloudflare)." });
    setFlash({ ok: "Envoi de la vidéo…" });
    try {
      const url = await uploadDataUrl(await readAsDataUrl(file), file.name);
      const [cx, cy] = viewCenter();
      const w = 480;
      const h = 270;
      const spot = freeSpot(cx - w / 2, cy - h / 2, w, h);
      const [el] = restoreElements([{ type: "embeddable", id: `v${Date.now().toString(36)}`, x: spot.x, y: spot.y, width: w, height: h, link: lecteurLink(url), customData: { url, origine: { source: "Vidéo ajoutée" } } }], null);
      api.updateScene({ elements: [...api.getSceneElements(), el], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      setFlash({ ok: "Vidéo posée sur le tableau (clique-la pour la lire)." });
    } catch (e) {
      setFlash({ error: e.message });
    }
  }

  // Import WinningHunter (2026-11-20) : images et vidéos posées en grille
  // (4 colonnes) près du centre de l'écran, comme Whitelabeler.
  async function placeGrid(items) {
    const [cx, cy] = viewCenter();
    const cols = Math.min(4, items.length);
    const w = 240;
    const gap = 24;
    const x0 = cx - (cols * (w + gap) - gap) / 2;
    const start = freeSpot(x0, cy - 160, cols * (w + gap), 400);
    let y = start.y;
    let rowH = 0;
    const added = [];
    for (const [i, it] of items.entries()) {
      const col = i % cols;
      if (col === 0 && i > 0) {
        y += rowH + gap;
        rowH = 0;
      }
      const x = start.x + col * (w + gap);
      const customData = { origine: { source: "WinningHunter" } };
      if (it.type === "video") {
        let h = Math.round((w * 16) / 9);
        if (it.poster) {
          const [nw, nh] = await sizeOf(it.poster).catch(() => [9, 16]);
          if (nw && nh) h = Math.round((w * nh) / nw);
        }
        const [el] = restoreElements([{ type: "embeddable", id: `v${Date.now().toString(36)}${i}`, x, y, width: w, height: h, link: lecteurLink(it.url, it.poster), customData: { url: it.url, poster: it.poster ?? null, ...customData } }], null);
        added.push(el);
        rowH = Math.max(rowH, h);
      } else {
        const [nw, nh] = await sizeOf(it.url);
        const h = Math.round((w * nh) / nw);
        added.push(...(await imageElements(it.url, { x, y, w, h, customData })));
        rowH = Math.max(rowH, h);
      }
    }
    api.updateScene({ elements: [...api.getSceneElements(), ...added], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    try {
      api.scrollToContent(added, { fitToContent: true, animate: true });
    } catch {}
    setFlash({ ok: `${items.length} média(s) WinningHunter posé(s) sur le tableau.` });
  }

  const savedLabel = saved === "ok" ? "Enregistré" : saved === "encours" ? "Enregistrement…" : "Non enregistré";
  const togglePanel = (p) => {
    setPicking(false);
    setPanel((cur) => (cur === p ? null : p));
  };

  return (
    <div className="atl-cv" role="dialog" aria-modal="true" aria-label="Canvas">
      {board && (
        <Excalidraw
          key={board.id}
          excalidrawAPI={setApi}
          langCode="fr-FR"
          initialData={{
            // Vidéos : adresse recalculée pour le site ouvert (PC, tunnel ou atelier.nive.ca).
            elements: (board.initial.elements ?? []).map((e) => (e.type === "embeddable" && e.customData?.url ? { ...e, link: lecteurLink(e.customData.url, e.customData.poster) } : e)),
            files: board.initial.files ?? {},
            appState: { viewBackgroundColor: board.initial.appState?.viewBackgroundColor ?? "transparent", currentItemFontFamily: 5, ...(board.initial.appState ? { scrollX: board.initial.appState.scrollX, scrollY: board.initial.appState.scrollY, zoom: { value: board.initial.appState.zoom ?? 1 } } : {}) },
          }}
          onChange={onChange}
          validateEmbeddable={(link) => (link.startsWith(`${location.origin}/medias/`) || link.startsWith(`${location.origin}/api/lecteur?`) ? true : undefined)}
          // Vidéos du projet lues directement dans la page (2026-11-20) : un
          // cadre isolé d'Excalidraw n'envoie pas la connexion Cloudflare
          // Access, la vidéo y était refusée sur atelier.nive.ca. Aperçu si on
          // l'a, sinon première image.
          renderEmbeddable={(el) => {
            const url = el.customData?.url;
            if (!url || !/\.(mp4|webm|mov)(\?|$)/i.test(url)) return null;
            return <CanvasVideo url={url} poster={el.customData?.poster || undefined} />;
          }}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: { saveFileToDisk: true } }, tools: { image: true } }}
          renderTopRightUI={() => (
            <div className="atl-cv__right">
              <WorkspaceSwitch current="canvas" onLeave={async () => { if (!(await confirmLeave())) throw new Error("Canvas : sortie annulée"); onClose(); }} />
              <div className="atl-cv__ai">
                <button type="button" className={imagesOpen ? "is-on" : ""} onClick={() => setImagesOpen(true)} title="Tes images" aria-label="Tes images">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 5h16v14H4z" fill="currentColor" opacity=".9" />
                    <path d="M4 16l4.5-5 3.5 4 2.5-3L20 17v2H4z" fill="#fff" />
                    <circle cx="15.5" cy="8.5" r="1.6" fill="#fff" />
                  </svg>
                  <span>Images</span>
                </button>
                <button type="button" className={`atl-cv__whbtn${whOpen ? " is-on" : ""}`} onClick={() => setWhOpen(true)} title="Importer les pubs d'une marque depuis WinningHunter" aria-label="Importer depuis WinningHunter">
                  <b className="atl-cv__whlogo">WH</b>
                  <span>WinningHunter</span>
                </button>
                <button type="button" className={`is-main${panel === "image" ? " is-on" : ""}`} onClick={() => togglePanel("image")} title="Créer une image" aria-label="Créer une image">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11 3l1.6 4.4L17 9l-4.4 1.6L11 15l-1.6-4.4L5 9l4.4-1.6zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8zM6 15l.6 1.4L8 17l-1.4.6L6 19l-.6-1.4L4 17l1.4-.6z" fill="currentColor" />
                  </svg>
                  <span>Créer</span>
                </button>
                <button type="button" className="is-video" disabled title="Créer une vidéo (bientôt : la clé Google ne donne pas accès à Veo)" aria-label="Créer une vidéo">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="6" width="13" height="12" rx="2" fill="currentColor" />
                    <path d="M17 10l4-2.5v9L17 14z" fill="currentColor" />
                  </svg>
                  <span>Vidéo</span>
                </button>
                <button type="button" className={panel === "sections" ? "is-on" : ""} onClick={() => togglePanel("sections")} title="Section images" aria-label="Section images">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="5" rx="1" fill="currentColor" />
                    <rect x="3" y="12" width="8" height="7" rx="1" fill="currentColor" />
                    <rect x="13" y="12" width="8" height="7" rx="1" fill="currentColor" />
                  </svg>
                  <span>Sections</span>
                </button>
              </div>
              <div className="atl-cv__title">
                {renaming ? (
                  <input autoFocus defaultValue={board.nom} onBlur={(e) => renameBoard(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label="Nom du tableau" />
                ) : (
                  <button type="button" onClick={() => setRenaming(true)} title="Renommer ce tableau">
                    {board.nom}
                  </button>
                )}
                <span className={`atl-cv__saved is-${saved}`}>● {savedLabel}</span>
              </div>
              <button type="button" className="atl-cv__close" onClick={async () => (await confirmLeave()) && onClose()} title="Fermer le Canvas" aria-label="Fermer le Canvas">
                ×
              </button>
            </div>
          )}
        >
          <MainMenu>
            <MainMenu.Item onSelect={async () => (await confirmLeave()) && (await refreshBoards(), setBoardsOpen(true))}>Tous les tableaux</MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.Item onSelect={() => setImagesOpen(true)}>Tes images</MainMenu.Item>
            <MainMenu.Item onSelect={() => videoRef.current?.click()}>Ajouter une vidéo</MainMenu.Item>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Help />
            <MainMenu.Separator />
            <MainMenu.Item onSelect={deleteBoard}>Supprimer ce tableau</MainMenu.Item>
          </MainMenu>
        </Excalidraw>
      )}

      {api && empty && <p className="atl-cv__hint">Glisse une image ou une vidéo ici, écris ou dessine.</p>}

      {sel && api && !picking && panel !== "image" && !mirrorImg && (
        <div className="atl-cv__bar" style={{ left: Math.min(Math.max(sel.left, 300), window.innerWidth - 300), top: Math.max(70, sel.top - 50) }}>
          <button
            type="button"
            className="is-main"
            title="Refaire cette pub avec ton produit (analyse + 3 variantes)"
            onClick={() => (/^\/medias\//.test(sel.url) ? setMirrorImg(sel.url) : setFlash({ error: "Cette image n'est pas encore enregistrée dans le projet : attends une seconde et réessaie." }))}
          >
            Mirror
          </button>
          <button type="button" onClick={() => (setRefs((r) => (r.some((x) => x.fileId === sel.fileId) ? r : [...r, { fileId: sel.fileId, url: sel.url }].slice(-MAX_REFS))), setPanel((p) => p || "image"))}>
            Utiliser comme référence
          </button>
          <button type="button" onClick={() => detourer(sel)} disabled={!!busy[sel.id]}>
            {busy[sel.id] ?? "Retirer le fond"}
          </button>
          <button type="button" className="is-main" onClick={() => setExportUrls([sel.url])}>
            Exporter vers une page
          </button>
          <button type="button" onClick={() => setDetails(sel)}>
            Détails
          </button>
          <button type="button" onClick={() => download(sel.url, sel.url.split("/").pop())} title="Télécharger" aria-label="Télécharger">
            ⤓
          </button>
          <button type="button" className="is-danger" onClick={removeSel} title="Retirer du tableau (le fichier reste dans le projet)" aria-label="Retirer du tableau">
            🗑
          </button>
        </div>
      )}

      {selVid && api && !picking && !mirror && (
        <div className="atl-cv__bar" style={{ left: Math.min(Math.max(selVid.left, 300), window.innerWidth - 300), top: Math.max(70, selVid.top - 50) }}>
          <button type="button" className="is-main" onClick={() => setMirror({ url: selVid.url, poster: selVid.poster })}>
            Mirror : adapter à mon produit
          </button>
          <button type="button" onClick={() => download(selVid.url, selVid.url.split("/").pop())} title="Télécharger" aria-label="Télécharger">
            ⤓
          </button>
        </div>
      )}

      {api && mirrorImg && (
        <MirrorImagePanel
          image={mirrorImg}
          photosDuTableau={refs.map((r) => r.url)}
          picking={picking}
          onPick={() => setPicking((x) => (x ? false : (setRefs([]), true)))}
          onPlace={(urls) => addImagesAtCenter(urls, { origine: { source: "Mirror : pub adaptée" } })}
          onClose={() => (setMirrorImg(null), setPicking(false))}
        />
      )}

      {api && mirror && (
        <MirrorPanel
          video={mirror.url}
          poster={mirror.poster}
          photosDuTableau={refs.map((r) => r.url)}
          picking={picking}
          onPick={() => setPicking((x) => (x ? false : (setRefs([]), true)))}
          onPlace={(urls) => addImagesAtCenter(urls, { origine: { source: "Mirror : storyboard" } })}
          onClose={() => (setMirror(null), setPicking(false))}
        />
      )}

      {picking && (
        <div className="atl-cv__banner" role="status">
          Clique les images du tableau pour les ajouter. Reclique dans la liste pour en retirer une.
          <button type="button" onClick={() => setPicking(false)}>
            Terminé
          </button>
        </div>
      )}

      {api && panel === "image" && <NewPicture refs={refs} setRefs={setRefs} makeImage={makeImage} addImagesAtCenter={addImagesAtCenter} setFlash={setFlash} onClose={() => setPanel(null)} />}
      <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => (addVideo(e.target.files[0]), (e.target.value = ""))} />
      {api && whOpen && <WhImport page={pageName} title="Importer depuis WinningHunter → ce tableau" onImported={(items) => placeGrid(items)} onClose={() => setWhOpen(false)} />}
      {api && imagesOpen && <YourImages root={root} onAdd={(urls) => addImagesAtCenter(urls, { origine: { source: "Tes images" } })} onClose={() => setImagesOpen(false)} />}
      {boardsOpen && (
        <AllBoards
          projet={projet}
          boards={boards}
          current={board?.id}
          onOpen={async (id) => (setBoardsOpen(false), id !== board?.id && (await openBoard(id)))}
          onNew={async () => (setBoardsOpen(false), await newBoard(`Tableau ${boards.length + 1}`))}
          onClose={() => setBoardsOpen(false)}
        />
      )}
      {api && panel === "sections" && (
        <SectionImages root={root} refs={refs} setRefs={setRefs} picking={picking} setPicking={setPicking} makeImage={makeImage} addImagesAtCenter={addImagesAtCenter} setFlash={setFlash} onClose={() => (setPanel(null), setPicking(false))} />
      )}

      {details && (
        <div className="atl-cv__modal" onPointerDown={() => setDetails(null)}>
          <div onPointerDown={(e) => e.stopPropagation()}>
            <div className="atl-cv__head">
              <h3>Détails de l'image</h3>
              <button type="button" onClick={() => setDetails(null)} aria-label="Fermer">
                ×
              </button>
            </div>
            <img src={details.url} alt="" className="atl-cv__detailimg" />
            <dl className="atl-cv__dl">
              <dt>Origine</dt>
              <dd>{details.customData?.origine?.source ?? "Posée sur le tableau"}</dd>
              {details.customData?.origine?.modele && (
                <>
                  <dt>Modèle</dt>
                  <dd>{details.customData.origine.modele}</dd>
                </>
              )}
              {details.customData?.origine?.consigne && (
                <>
                  <dt>Consigne</dt>
                  <dd>{details.customData.origine.consigne}</dd>
                </>
              )}
              {details.customData?.origine?.note && (
                <>
                  <dt>Note</dt>
                  <dd>{details.customData.origine.note}</dd>
                </>
              )}
              <dt>Fichier</dt>
              <dd>
                <a href={details.url} target="_blank" rel="noreferrer">
                  {details.url.split("/").pop()}
                </a>
              </dd>
            </dl>
          </div>
        </div>
      )}

      {exportUrls && <ExportToPage urls={exportUrls} onClose={() => setExportUrls(null)} onDone={(msg) => setFlash({ ok: msg })} />}

      {flash && (
        <div className={`atl-cv__flash${flash.error ? " is-error" : ""}`} role="status" onClick={() => setFlash(null)}>
          {flash.error ?? flash.ok}
        </div>
      )}
    </div>
  );
}

// Boîte « Ajouter une image » : Téléverser ou Choisir sur le tableau.
function AddImageMenu({ onUpload, onPick, label = "Ajouter une image" }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef(null);
  return (
    <div className="atl-cv__addwrap">
      <button type="button" className="atl-cv__add" onClick={() => (onPick ? setOpen(!open) : fileRef.current?.click())}>
        ＋ {label}
      </button>
      {open && (
        <div className="atl-cv__menu" onMouseLeave={() => setOpen(false)}>
          <button type="button" onClick={() => (setOpen(false), fileRef.current?.click())}>
            Téléverser
          </button>
          <button type="button" onClick={() => (setOpen(false), onPick())}>
            Choisir sur le tableau
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (onUpload([...e.target.files]), (e.target.value = ""))} />
    </div>
  );
}

function RefChips({ refs, setRefs }) {
  return refs.map((x, i) => (
    <span key={x.fileId} className="atl-cv__chip">
      <img src={x.url} alt="" />
      <i>{i + 1}</i>
      <button type="button" onClick={() => setRefs((r) => r.filter((y) => y.fileId !== x.fileId))} aria-label="Retirer cette référence">
        ×
      </button>
    </span>
  ));
}

async function uploadFiles(files) {
  const urls = [];
  for (const f of files.filter((x) => x?.type?.startsWith("image/")).slice(0, 12)) urls.push(await uploadDataUrl(await readAsDataUrl(f), f.name));
  return urls;
}

// ---- « Nouvelle image » : panneau en bas, comme « New picture » ----
function NewPicture({ refs, setRefs, makeImage, addImagesAtCenter, setFlash, onClose }) {
  const [prompt, setPrompt] = useState("");
  const [modele, setModele] = useState("nano-banana");
  const [qualite, setQualite] = useState("medium");
  const [nombre, setNombre] = useState(1);
  const [format, setFormat] = useState("1:1");
  const [running, setRunning] = useState(0);
  const prix = (MODELES[modele]?.prix ?? 0.05) * nombre;
  async function go() {
    if (!prompt.trim()) return setFlash({ error: "Décris l'image que tu veux." });
    setRunning((n) => n + nombre);
    await Promise.all(
      Array.from({ length: nombre }, () =>
        makeImage({ prompt, format, modele, qualite, source: "Créée sur le Canvas" })
          .catch((e) => setFlash({ error: e.message }))
          .finally(() => setRunning((n) => n - 1)),
      ),
    );
  }
  async function upload(files) {
    const urls = await uploadFiles(files);
    const els = await addImagesAtCenter(urls, { origine: { source: "Ajoutée à la main" } });
    setRefs((r) => [...r, ...els.map((e, i) => ({ fileId: e.fileId, url: urls[i] }))].slice(0, MAX_REFS));
  }
  return (
    <section className="atl-cv__dock" aria-label="Nouvelle image">
      <div className="atl-cv__head">
        <h3>Nouvelle image</h3>
        <button type="button" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="atl-cv__box">
        <div className="atl-cv__refsrow">
          <AddImageMenu onUpload={upload} />
          <RefChips refs={refs} setRefs={setRefs} />
          {!refs.length && <span className="atl-cv__muted">Clique des images du tableau pour les ajouter.</span>}
        </div>
        <div className="atl-cv__promptrow">
          <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && go()} placeholder="Décris l'image que tu veux…" />
          <kbd>Ctrl ↵</kbd>
        </div>
      </div>
      <div className="atl-cv__opts">
        <label>
          <span>Modèle</span>
          <div className="atl-cv__seg">
            {Object.entries(MODELES).map(([k, m]) => (
              <button key={k} type="button" className={modele === k ? "is-on" : ""} onClick={() => setModele(k)}>
                {m.label}
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>Qualité</span>
          <div className="atl-cv__seg">
            {Object.entries(QUALITES).map(([k, l]) => (
              <button key={k} type="button" className={qualite === k ? "is-on" : ""} onClick={() => setQualite(k)}>
                {l}
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>Images</span>
          <div className="atl-cv__seg">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" className={nombre === n ? "is-on" : ""} onClick={() => setNombre(n)}>
                {n}
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {Object.keys(FORMATS).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <button type="button" className="atl-cv__go" onClick={go} disabled={!prompt.trim()}>
          {running ? `Création… (${running})` : `Générer · ~${prix.toFixed(2)} $`}
        </button>
      </div>
    </section>
  );
}

// ---- « Tes images » (fenêtre, comme Whitelabeler) : clic pour cocher une
// ou plusieurs images, puis « Ajouter au tableau ». Images du projet ; celles
// du site d'origine dans un second onglet s'il y en a.
function YourImages({ root, onAdd, onClose }) {
  const getPuck = useGetPuck();
  const [tab, setTab] = useState("projet");
  const [lists, setLists] = useState({ projet: null, origine: [] });
  const [ticked, setTicked] = useState([]);
  const fileRef = useRef(null);
  function load() {
    fetch(`/api/medias/${pageName}?detail=1`)
      .then((r) => r.json())
      .then((l) => setLists((s) => ({ ...s, projet: l.filter((x) => x.kind !== "video" && !/\.(mp4|webm|mov)$/i.test(x.url)).map((x) => x.url).reverse() })))
      .catch(() => setLists((s) => ({ ...s, projet: [] })));
  }
  useEffect(() => {
    load();
    // Images d'origine : les mêmes que l'onglet « D'origine » du catalogue et
    // la carte 3 du Studio (photos d'origine encore dans la page), puis celles
    // du dossier images/ de l'import s'il y en a.
    const fromPage = [...new Set(originalPhotoTargets(getPuck().appState.data.content ?? []).map((t) => t.source))];
    fetch(`/api/medias-origin/${root.importSource || pageName}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((l) => setLists((s) => ({ ...s, origine: [...new Set([...fromPage, ...l])] })))
      .catch(() => setLists((s) => ({ ...s, origine: fromPage })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const list = lists[tab];
  const toggle = (u) => setTicked((t) => (t.includes(u) ? t.filter((x) => x !== u) : [...t, u]));
  return createPortal(
    <div className="atl-cv__modal is-top" onPointerDown={onClose}>
      <div className="atl-cv__images" onPointerDown={(e) => e.stopPropagation()}>
        <div className="atl-cv__head">
          <h3>Tes images</h3>
          <button type="button" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        {lists.origine.length > 0 && (
          <div className="atl-cv__seg">
            <button type="button" className={tab === "projet" ? "is-on" : ""} onClick={() => setTab("projet")}>
              Projet
            </button>
            <button type="button" className={tab === "origine" ? "is-on" : ""} onClick={() => setTab("origine")}>
              Site d'origine
            </button>
          </div>
        )}
        <div className="atl-cv__grid is-modal">
          {list === null && <p className="atl-cv__muted">Chargement…</p>}
          {list && !list.length && <p className="atl-cv__muted">Aucune image pour l'instant. Téléverse-en une.</p>}
          {(list ?? []).map((u) => (
            <button key={u} type="button" className={ticked.includes(u) ? "is-on" : ""} onClick={() => toggle(u)} onDoubleClick={() => (onAdd([u]), onClose())}>
              <img src={u} alt="" loading="lazy" />
              {ticked.includes(u) && <em>{ticked.indexOf(u) + 1}</em>}
            </button>
          ))}
        </div>
        <div className="atl-cv__modalfoot">
          <button type="button" className="atl-cv__ghost" onClick={() => fileRef.current?.click()}>
            ＋ Téléverser
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={async (e) => {
              const urls = await uploadFiles([...e.target.files]);
              e.target.value = "";
              setTab("projet");
              load();
              setTicked((t) => [...t, ...urls]);
            }}
          />
          <span />
          <button type="button" className="atl-cv__ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="atl-cv__go" disabled={!ticked.length} onClick={() => (onAdd(ticked), onClose())}>
            Ajouter au tableau{ticked.length > 1 ? ` (${ticked.length})` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---- « Tous les tableaux » (comme la page Canvas de Whitelabeler) ----
function AllBoards({ projet, boards, current, onOpen, onNew, onClose }) {
  return createPortal(
    <div className="atl-cv__modal is-top" onPointerDown={onClose}>
      <div className="atl-cv__boards" onPointerDown={(e) => e.stopPropagation()}>
        <div className="atl-cv__boardshead">
          <div>
            <h2>Canvas</h2>
            <p>Tes tableaux{projet ? ` du projet ${projet}` : ""}. Pose des images, écris et dessine, tout sur un même tableau ouvert.</p>
          </div>
          <div className="atl-cv__actions">
            <button type="button" className="atl-cv__ghost" onClick={onClose}>
              Fermer
            </button>
            <button type="button" className="atl-cv__go" onClick={onNew}>
              Nouveau tableau
            </button>
          </div>
        </div>
        <div className="atl-cv__boardgrid">
          {boards.map((b) => (
            <button key={b.id} type="button" className={b.id === current ? "is-current" : ""} onClick={() => onOpen(b.id)}>
              <span className="atl-cv__boardthumb" />
              <b>{b.nom}</b>
              <small>
                {b.nb} élément{b.nb > 1 ? "s" : ""} · modifié {ago(b.modifie)}
                {b.id === current ? " · ouvert" : ""}
              </small>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Sections d'une page qui ont au moins une image, dans l'ordre de la page.
function sectionsOf(content) {
  return content
    .map((item, i) => {
      const section = byId[item.type];
      if (!section) return null;
      const { texts, images } = aiTargets(item);
      const name = (section.meta.label ?? item.type).split(" — ")[0];
      const fam = familiesOf(item, i, byId)
        .filter((f) => f !== "entete")
        .map((f) => FAMILY_BY_ID[f])
        .filter(Boolean)[0];
      const textes = texts.map((t) => plainText(t.text)).filter(Boolean);
      const code = /^r-[a-z0-9]+$/.test(name) || /^p\d+$/.test(name);
      return {
        id: item.props.id,
        index: i,
        label: code ? fam?.label ?? textes[0]?.slice(0, 40) ?? "Section" : name,
        role: fam ? `${fam.label} (${fam.hint})` : name,
        textes: textes.slice(0, 14).map((t) => t.slice(0, 300)),
        images,
      };
    })
    .filter(Boolean);
}

// Contenu d'une page : la page ouverte (Puck), sinon lue sur le serveur.
function usePageContent(name) {
  const getPuck = useGetPuck();
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    if (!name) return;
    if (name === pageName) return setData(getPuck().appState.data);
    fetch(`/api/pages/${name}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ content: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return data;
}

// Pages proposées : celles du projet (sinon toutes), la page ouverte d'abord.
function usePages() {
  const getPuck = useGetPuck();
  const projet = getPuck().appState.data.root?.props?.projet ?? "";
  const [pages, setPages] = useState([]);
  useEffect(() => {
    fetch("/api/pages?details=1")
      .then((r) => r.json())
      .then((l) => {
        const mine = projet ? l.filter((p) => p.projet === projet) : l;
        const list = (mine.length ? mine : l).filter((p) => !/^zz-/.test(p.name) || /^zz-/.test(pageName)); // pages jetables : seulement depuis une page jetable
        list.sort((a, b) => (a.name === pageName ? -1 : b.name === pageName ? 1 : a.title.localeCompare(b.title)));
        setPages(list);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return pages;
}

// Placer une image dans une section d'une page. Page ouverte : par Puck
// (Ctrl+Z annule). Autre page : copie de sécurité, puis enregistrement.
async function placeInPage(getPuck, name, sectionId, slotKey, url) {
  if (name === pageName) {
    const { appState, dispatch } = getPuck();
    const index = appState.data.content.findIndex((c) => c.props.id === sectionId);
    if (index < 0) throw new Error("Section introuvable dans la page.");
    dispatch({ type: "replace", destinationIndex: index, destinationZone: ROOT_ZONE, data: applyValues(appState.data.content[index], { [slotKey]: { image: url } }) });
    return;
  }
  const lu = await fetch(`/api/pages/${name}`);
  const rev = lu.headers.get("ETag");
  const page = await lu.json();
  const index = page.content.findIndex((c) => c.props.id === sectionId);
  if (index < 0) throw new Error("Section introuvable dans la page.");
  await fetch(`/api/pages/${name}/snapshot`, { method: "POST" });
  page.content[index] = applyValues(page.content[index], { [slotKey]: { image: url } });
  const res = await fetch(`/api/pages/${name}`, { method: "PUT", headers: { "Content-Type": "application/json", ...(rev ? { "If-Match": rev } : {}) }, body: JSON.stringify(page) });
  if (res.status === 409) throw new Error("La page a été modifiée ailleurs entre-temps : recharge-la puis recommence.");
  if (!res.ok) throw new Error("La page n'a pas pu être enregistrée.");
}

// ---- Glisser-déposer dans la page (2026-11-16) ----
// « Glisser dans la page » (fenêtre Exporter) ferme le Studio / le Canvas et
// laisse les images dans un bandeau à gauche ; on les dépose sur une image de
// la page ouverte, à droite. Repérage par la géométrie (Puck coupe les
// clics de l'aperçu). Ctrl+Z annule (l'image est posée par Puck).
function previewFrame() {
  for (const frame of document.querySelectorAll("iframe")) {
    if (frame.contentDocument?.querySelector("[data-atl-id]")) return frame;
  }
  return null;
}
const baseName = (u) => String(u ?? "").split("?")[0].split("/").pop();

// Image de l'aperçu sous le point (x, y du document de l'aperçu) → section + emplacement.
function slotAt(getPuck, doc, x, y) {
  let best = null;
  let bestArea = Infinity;
  for (const img of doc.querySelectorAll("[data-atl-id] img")) {
    const r = img.getBoundingClientRect();
    if (!r.width || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    if (r.width * r.height < bestArea) {
      best = img;
      bestArea = r.width * r.height;
    }
  }
  if (!best) return null;
  const sectionId = best.closest("[data-atl-id]")?.dataset.atlId;
  const item = getPuck().appState.data.content.find((c) => c.props.id === sectionId);
  if (!item) return null;
  const section = byId[item.type];
  // Page copiée : l'emplacement porte son nom dans la page (data-atl-slot).
  const slot = best.closest("[data-atl-slot]")?.dataset.atlSlot;
  if (section?.meta.arbre && slot) return { img: best, sectionId, key: slot };
  // Section du catalogue : l'image se reconnaît à son fichier.
  const name = baseName(best.getAttribute("src"));
  const im = aiTargets(item).images.find((i) => baseName(i.src) === name);
  return im ? { img: best, sectionId, key: im.key } : { img: best, sectionId, key: null };
}

function DropTray({ urls, onClose }) {
  const getPuck = useGetPuck();
  const [msg, setMsg] = useState(null);
  const [placed, setPlaced] = useState([]);
  const dragged = useRef(null);
  useEffect(() => {
    let doc = null;
    let lit = null;
    const light = (el) => {
      if (lit === el) return;
      if (lit) lit.style.outline = "";
      lit = el;
      if (lit) {
        lit.style.outline = "3px solid #4f46e5";
        lit.style.outlineOffset = "-3px";
      }
    };
    const over = (e) => {
      if (!dragged.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      light(slotAt(getPuck, doc, e.clientX, e.clientY)?.img ?? null);
    };
    const drop = async (e) => {
      if (!dragged.current) return;
      e.preventDefault();
      const url = dragged.current;
      dragged.current = null;
      light(null);
      const hit = slotAt(getPuck, doc, e.clientX, e.clientY);
      if (!hit) return setMsg({ error: "Dépose l'image sur une image de la page." });
      if (!hit.key) return setMsg({ error: "Cet emplacement ne se remplit pas par glisser : utilise le parcours pas à pas (Exporter → Placer)." });
      try {
        await placeInPage(getPuck, pageName, hit.sectionId, hit.key, url);
        setPlaced((p) => [...new Set([...p, url])]);
        setMsg({ ok: "✓ Image placée (Ctrl+Z pour annuler)." });
      } catch (err) {
        setMsg({ error: err.message });
      }
    };
    const leave = () => light(null);
    const attach = () => {
      const next = previewFrame()?.contentDocument ?? null;
      if (next === doc) return;
      doc?.removeEventListener("dragover", over);
      doc?.removeEventListener("drop", drop);
      doc?.removeEventListener("dragleave", leave);
      doc = next;
      doc?.addEventListener("dragover", over);
      doc?.addEventListener("drop", drop);
      doc?.addEventListener("dragleave", leave);
    };
    attach();
    const timer = setInterval(attach, 1000);
    return () => {
      clearInterval(timer);
      light(null);
      doc?.removeEventListener("dragover", over);
      doc?.removeEventListener("drop", drop);
      doc?.removeEventListener("dragleave", leave);
    };
  }, [getPuck]);
  return createPortal(
    <aside className="atl-droptray" aria-label="Images à placer">
      <header>
        <b>Glisse une image sur la page</b>
        <button type="button" onClick={onClose} aria-label="Fermer le bandeau">
          ×
        </button>
      </header>
      <small>Dépose-la sur l'image à remplacer, à droite.</small>
      <div className="atl-droptray__list">
        {urls.map((u) => (
          <img
            key={u}
            src={u}
            alt=""
            draggable
            className={placed.includes(u) ? "is-placed" : ""}
            onDragStart={(e) => {
              dragged.current = u;
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData("text/uri-list", u);
            }}
            onDragEnd={() => setTimeout(() => (dragged.current = null), 0)}
          />
        ))}
      </div>
      {msg?.ok && <p className="atl-droptray__ok">{msg.ok}</p>}
      {msg?.error && <p className="atl-droptray__err">{msg.error}</p>}
    </aside>,
    document.body,
  );
}

// Monté une fois dans l'éditeur (avec le Canvas) : ouvre le bandeau sur demande.
export function DropTrayHost() {
  const [urls, setUrls] = useState(null);
  useEffect(() => {
    const on = (e) => setUrls(e.detail?.urls ?? null);
    window.addEventListener("atl-drop-tray", on);
    return () => window.removeEventListener("atl-drop-tray", on);
  }, []);
  return urls?.length ? <DropTray urls={urls} onClose={() => setUrls(null)} /> : null;
}

// Ferme le Studio et le Canvas (le Canvas enregistre d'abord son tableau).
function closeWorkspaces() {
  document.querySelector(".atl-cv__close")?.click();
  document.querySelector('.atl-mirror[role="dialog"] .atl-modal__close')?.click();
}

// ---- Aperçu d'une page, sections cliquables (comme dans Section images) ----
// /partage/<page>?reperes=1 : un repère avant chaque section (n = rang).
function PagePicker({ name, selected, onToggle, width = 360 }) {
  const ref = useRef(null);
  const scale = width / 1440;
  const [h, setH] = useState(2000);
  const selRef = useRef(selected);
  selRef.current = selected;
  function arm() {
    const frame = ref.current;
    const doc = frame?.contentDocument;
    if (!doc?.body) return;
    setH(doc.documentElement.scrollHeight);
    const marks = [...doc.querySelectorAll("template[data-atl-sec]")];
    const z = 1 / scale;
    const style = doc.createElement("style");
    style.textContent = `[data-atl-box]{position:absolute;left:0;width:100%;pointer-events:none;z-index:2147483646;box-sizing:border-box}[data-atl-box].is-hover{outline:${3 * z}px solid rgba(79,70,229,.45);outline-offset:-${3 * z}px}[data-atl-box].is-sel{outline:${4 * z}px solid #4f46e5;outline-offset:-${4 * z}px;background:rgba(79,70,229,.07)}`;
    doc.head.append(style);
    const rectOf = (i) => {
      const range = doc.createRange();
      range.setStartAfter(marks[i]);
      if (marks[i + 1]) range.setEndBefore(marks[i + 1]);
      else range.setEndAfter(doc.body.lastChild);
      return range.getBoundingClientRect();
    };
    const boxes = marks.map((m, i) => {
      const r = rectOf(i);
      const b = doc.createElement("div");
      b.setAttribute("data-atl-box", m.dataset.atlSec);
      Object.assign(b.style, { top: `${r.top + doc.defaultView.scrollY}px`, height: `${r.height}px` });
      doc.body.append(b);
      return b;
    });
    const paint = () => boxes.forEach((b) => b.classList.toggle("is-sel", selRef.current.includes(Number(b.dataset.atlBox))));
    paint();
    frame._paint = paint;
    doc.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const y = e.clientY;
        const i = marks.findIndex((m, k) => {
          const r = rectOf(k);
          return r.height > 4 && y >= r.top && y < r.bottom;
        });
        if (i >= 0) onToggle(Number(marks[i].dataset.atlSec));
      },
      true,
    );
    doc.addEventListener("mousemove", (e) => {
      boxes.forEach((b, k) => {
        const r = rectOf(k);
        b.classList.toggle("is-hover", e.clientY >= r.top && e.clientY < r.bottom);
      });
    });
  }
  useEffect(() => {
    ref.current?._paint?.();
  }, [selected]);
  return (
    <div className="atl-cv__pagepick" style={{ height: Math.min(h * scale, 520) }}>
      <div style={{ width, height: h * scale, overflow: "hidden" }}>
        <iframe ref={ref} title="Aperçu de la page" src={`/partage/${name}?reperes=1`} onLoad={() => setTimeout(arm, 400)} style={{ width: 1440, height: h, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }} />
      </div>
    </div>
  );
}

// ---- Section images (comme Whitelabeler) ----
// Ajouter une image (téléverser ou choisir sur le tableau), choisir une page,
// cliquer les sections dans l'aperçu, Image ou Infographie, « Écrire les
// consignes » ; puis pour chaque section : format, consigne, Créer, Placer
// dans la page.
function SectionImages({ root, refs, setRefs, picking, setPicking, makeImage, addImagesAtCenter, setFlash, onClose }) {
  const getPuck = useGetPuck();
  const pages = usePages();
  const [page, setPage] = useState(pageName);
  const data = usePageContent(page);
  const list = useMemo(() => (data ? sectionsOf(data.content ?? []) : []), [data]);
  const [chosen, setChosen] = useState([]); // rangs dans la page
  const [type, setType] = useState("image");
  const [modele, setModele] = useState("nano-banana");
  const [rows, setRows] = useState({}); // id → { on, slot, format, prompt, results, sel, placed }
  const [writing, setWriting] = useState(false);
  const [running, setRunning] = useState({});
  const [project, setProject] = useState(null);
  const setRow = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  useEffect(() => {
    setChosen([]);
    setRows({});
  }, [page]);
  useEffect(() => {
    if (!root.projet) return;
    fetch(`/api/projects/${encodeURIComponent(root.projet)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setProject)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const picked = list.filter((s) => chosen.includes(s.index));
  const withPrompt = picked.filter((s) => rows[s.id]?.prompt);

  async function toggle(index) {
    setChosen((c) => (c.includes(index) ? c.filter((x) => x !== index) : [...c, index]));
    const s = list.find((x) => x.index === index);
    if (s && !rows[s.id]) {
      const [w, h] = s.images[0] ? await sizeOf(s.images[0].src) : [1024, 1024];
      setRow(s.id, { on: true, slot: s.images[0]?.key ?? null, format: nearestFormat(w, h), prompt: "", results: [], sel: 0, placed: null });
    }
  }
  async function writePrompts() {
    if (!picked.length) return setFlash({ error: "Clique au moins une section dans l'aperçu." });
    setWriting(true);
    try {
      const pr = data.root?.props ?? {};
      const res = await fetch("/api/ia/section-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produit: pr.produit || project?.produit || project?.nom || "",
          description: pr.infos || project?.description || "",
          pageType: pageTypeOf(pr)?.label ?? "",
          fondations: project ? fondationsPourAudit(project, pr.pageType) : null,
          type,
          nbRefs: refs.length,
          sections: picked.map((s) => ({ id: s.id, numero: s.index + 1, role: s.role, textes: s.textes, format: rows[s.id]?.format ?? "1:1" })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      for (const p of body.prompts ?? []) if (p.prompt) setRow(p.id, { prompt: p.prompt, on: true });
    } catch (e) {
      setFlash({ error: e.message });
    } finally {
      setWriting(false);
    }
  }
  async function createOne(s) {
    const r = rows[s.id];
    if (!r?.prompt?.trim()) return;
    setRunning((x) => ({ ...x, [s.id]: true }));
    try {
      const url = await makeImage({ prompt: r.prompt, type, format: r.format, modele, source: `Section images · ${s.label}`, titre: s.label });
      setRows((all) => ({ ...all, [s.id]: { ...all[s.id], results: [...all[s.id].results, url], sel: all[s.id].results.length } }));
    } catch (e) {
      setFlash({ error: `${s.label} : ${e.message}` });
    } finally {
      setRunning((x) => ({ ...x, [s.id]: false }));
    }
  }
  async function createAll() {
    for (const s of withPrompt.filter((x) => rows[x.id].on)) await createOne(s);
  }
  async function place(s) {
    const r = rows[s.id];
    const url = r.results[r.sel];
    if (!url || !r.slot) return setFlash({ error: "Cette section n'a pas d'image à remplacer." });
    try {
      await placeInPage(getPuck, page, s.id, r.slot, url);
      setRow(s.id, { placed: url });
      setFlash({ ok: `Placée dans « ${s.label} »${page === pageName ? ". Ctrl+Z pour annuler" : ` (page ${page}, copie de sécurité faite)`}.` });
    } catch (e) {
      setFlash({ error: e.message });
    }
  }
  async function upload(files) {
    const urls = await uploadFiles(files);
    const els = await addImagesAtCenter(urls, { origine: { source: "Ajoutée à la main" } });
    setRefs((rr) => [...rr, ...els.map((e, i) => ({ fileId: e.fileId, url: urls[i] }))].slice(0, MAX_REFS));
  }
  const prix = (MODELES[modele]?.prix ?? 0.05) * Math.max(1, withPrompt.length);

  return (
    <aside className="atl-cv__side is-wide" aria-label="Section images">
      <div className="atl-cv__head">
        <h3>Section images</h3>
        <button type="button" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="atl-cv__refsrow">
        <RefChips refs={refs} setRefs={setRefs} />
        <AddImageMenu onUpload={upload} onPick={() => setPicking(true)} />
      </div>
      <select className="atl-cv__select" value={page} onChange={(e) => setPage(e.target.value)} aria-label="Choisir une page">
        {pages.map((p) => (
          <option key={p.name} value={p.name}>
            {p.title}
            {p.name === pageName ? " (page ouverte)" : ""}
          </option>
        ))}
      </select>
      {page && <PagePicker name={page} selected={chosen} onToggle={toggle} />}
      <small className="atl-cv__muted">Clique les sections qui doivent recevoir une image. Reclique pour en retirer une.</small>
      <p className="atl-cv__label">Images</p>
      <div className="atl-cv__seg is-full">
        <button type="button" className={type === "image" ? "is-on" : ""} onClick={() => setType("image")}>
          Image
        </button>
        <button type="button" className={type === "infographie" ? "is-on" : ""} onClick={() => setType("infographie")}>
          Infographie
        </button>
      </div>
      {picked.length > 0 && (
        <>
          <p className="atl-cv__label">Sections choisies ({picked.length})</p>
          <ol className="atl-cv__cards">
            {picked.map((s) => {
              const r = rows[s.id] ?? {};
              return (
                <li key={s.id}>
                  <div className="atl-cv__cardhead">
                    <label>
                      <input type="checkbox" checked={!!r.on} onChange={(e) => setRow(s.id, { on: e.target.checked })} />
                      <b>{s.label}</b>
                    </label>
                    <span className={r.placed ? "is-ok" : r.results?.length ? "is-made" : ""}>{r.placed ? "Placée ✓" : r.results?.length ? "Faite" : ""}</span>
                  </div>
                  <div className="atl-cv__line">
                    <span>{type === "infographie" ? "Infographie" : "Image"}</span>
                    <select value={r.format ?? "1:1"} onChange={(e) => setRow(s.id, { format: e.target.value })} aria-label="Format">
                      {Object.keys(FORMATS).map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                    {s.images.length > 1 && (
                      <div className="atl-cv__slots" title="Image de la section à remplacer">
                        {s.images.map((im) => (
                          <button key={im.key} type="button" className={r.slot === im.key ? "is-on" : ""} onClick={() => setRow(s.id, { slot: im.key })}>
                            <img src={im.src} alt="" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!s.images.length && <small className="atl-cv__muted">Pas d'image dans cette section : l'image sera créée sur le tableau, sans placement.</small>}
                  <textarea rows={4} value={r.prompt ?? ""} onChange={(e) => setRow(s.id, { prompt: e.target.value })} placeholder={writing ? "L'IA écrit la consigne…" : "Consigne : « Écrire les consignes », ou écris-la toi-même."} />
                  {r.results?.length > 0 && (
                    <div className="atl-cv__slots">
                      {r.results.map((u, i) => (
                        <button key={u} type="button" className={r.sel === i ? "is-on" : ""} onClick={() => setRow(s.id, { sel: i })} title={`Version ${i + 1}`}>
                          <img src={u} alt="" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="atl-cv__actions">
                    <button type="button" className="atl-cv__ghost" onClick={() => createOne(s)} disabled={running[s.id] || !r.prompt?.trim()}>
                      {running[s.id] ? "Création…" : r.results?.length ? "Nouvelle" : "Créer"}
                    </button>
                    <button type="button" className="atl-cv__go" onClick={() => place(s)} disabled={!r.results?.length || !r.slot || r.placed === r.results[r.sel]}>
                      {r.placed && r.placed === r.results[r.sel] ? "Placée ✓" : "Placer dans la page"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <div className="atl-cv__foot">
        <div className="atl-cv__seg is-full">
          {Object.entries(MODELES).map(([k, m]) => (
            <button key={k} type="button" className={modele === k ? "is-on" : ""} onClick={() => setModele(k)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="atl-cv__actions">
          {withPrompt.length > 0 && (
            <button type="button" className="atl-cv__ghost" onClick={createAll} disabled={Object.values(running).some(Boolean)}>
              Créer les images ({withPrompt.filter((x) => rows[x.id].on).length}) · ~{prix.toFixed(2)} $
            </button>
          )}
          <button type="button" className="atl-cv__go" onClick={writePrompts} disabled={writing || !picked.length}>
            {writing ? "Écriture…" : "Écrire les consignes"}
          </button>
        </div>
      </div>
    </aside>
  );
}

// ---- « Exporter vers une page » en 3 étapes : Images, Page, Placer ----
// Aussi utilisé par le Studio d'images.
export function ExportToPage({ urls, onClose, onDone }) {
  const getPuck = useGetPuck();
  const pages = usePages();
  const [step, setStep] = useState(urls.length > 1 ? 1 : 2);
  const [ticked, setTicked] = useState(urls);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(null);
  const data = usePageContent(page);
  const list = useMemo(() => (data ? sectionsOf(data.content ?? []).filter((s) => s.images.length) : []), [data]);
  const [done, setDone] = useState({}); // slot → url
  const [error, setError] = useState(null);
  const next = ticked.find((u) => !Object.values(done).includes(u)) ?? ticked[ticked.length - 1];
  async function place(s, im) {
    setError(null);
    try {
      await placeInPage(getPuck, page, s.id, im.key, next);
      setDone((d) => ({ ...d, [`${s.id}|${im.key}`]: next }));
      onDone?.(`Placée dans « ${s.label} » (${page === pageName ? "page ouverte, Ctrl+Z pour annuler" : `page ${page}, copie de sécurité faite`}).`);
    } catch (e) {
      setError(e.message);
    }
  }
  const shown = pages.filter((p) => !q || `${p.title} ${p.name}`.toLowerCase().includes(q.toLowerCase()));
  function dragIntoPage() {
    window.dispatchEvent(new CustomEvent("atl-drop-tray", { detail: { urls: ticked } }));
    onClose();
    closeWorkspaces();
  }
  return createPortal(
    <div className="atl-cv__modal is-top" onPointerDown={onClose}>
      <div className="atl-cv__export" onPointerDown={(e) => e.stopPropagation()}>
        <div className="atl-cv__head">
          <div>
            <h3>Exporter vers une page</h3>
            <small className="atl-cv__muted">
              {ticked.length} image{ticked.length > 1 ? "s" : ""} cochée{ticked.length > 1 ? "s" : ""} · gratuit
            </small>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <ol className="atl-cv__steps">
          {["Images", "Page", "Placer"].map((l, i) => (
            <li key={l} className={step === i + 1 ? "is-on" : step > i + 1 ? "is-done" : ""}>
              <button type="button" onClick={() => (i + 1 < step || (i + 1 === 3 && page)) && setStep(i + 1)}>
                <i>{i + 1}</i> {l}
              </button>
            </li>
          ))}
        </ol>
        <div className="atl-cv__thumbs">
          {ticked.map((u) => (
            <img key={u} src={u} alt="" className={u === next && step === 3 ? "is-next" : ""} />
          ))}
        </div>
        {step === 1 && (
          <>
            <p className="atl-cv__q">Quelles images exporter ?</p>
            <div className="atl-cv__grid is-big">
              {urls.map((u) => (
                <button key={u} type="button" className={ticked.includes(u) ? "is-on" : ""} onClick={() => setTicked((t) => (t.includes(u) ? t.filter((x) => x !== u) : [...t, u]))}>
                  <img src={u} alt="" />
                </button>
              ))}
            </div>
            <div className="atl-cv__actions">
              <button type="button" className="atl-cv__go" disabled={!ticked.length} onClick={() => setStep(2)}>
                Suivant
              </button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="atl-cv__q">Sur quelle page vont-elles ?</p>
            {pageName && (
              <button type="button" className="atl-cv__dragbtn" onClick={dragIntoPage} disabled={!ticked.length}>
                ✋ Glisser dans la page ouverte
                <small>Les images restent à gauche, la page à droite : dépose chaque image sur celle à remplacer.</small>
              </button>
            )}
            <input className="atl-cv__search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une page" />
            <div className="atl-cv__pages">
              {shown.map((p) => (
                <button key={p.name} type="button" onClick={() => (setPage(p.name), setStep(3))}>
                  <b>{p.title}</b>
                  <small>{p.name === pageName ? "Page ouverte" : p.pageType || p.name}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <p className="atl-cv__q">
              Clique l'image de la page à remplacer
              {ticked.length > 1 ? " (une image par clic, dans l'ordre)" : ""}.
            </p>
            {!data && <p className="atl-cv__muted">Chargement de la page…</p>}
            {data && !list.length && <p className="atl-cv__muted">Aucune image dans cette page.</p>}
            {error && <p className="atl-cv__err">{error}</p>}
            {page === pageName && (
              <button type="button" className="atl-cv__dragbtn" onClick={dragIntoPage}>
                ✋ Plutôt glisser les images dans la page
              </button>
            )}
            {/* Miniature de la page à droite (2026-11-16) : un clic sur une
                section amène à ses images dans la liste. */}
            <div className="atl-cv__placewrap">
            <div className="atl-cv__placelist">
              {list.map((s) => (
                <section key={s.id} id={`atl-exp-${s.index}`}>
                  <h4>
                    {s.index + 1}. {s.label}
                  </h4>
                  <div className="atl-cv__slots is-big">
                    {s.images.map((im) => {
                      const d = done[`${s.id}|${im.key}`];
                      return (
                        <button key={im.key} type="button" className={d ? "is-on" : ""} onClick={() => place(s, im)} title="Remplacer cette image">
                          <img src={d ?? im.src} alt="" />
                          {d && <em>✓</em>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            {page && <PagePicker name={page} selected={[]} width={280} onToggle={(n) => document.getElementById(`atl-exp-${n}`)?.scrollIntoView({ block: "center", behavior: "smooth" })} />}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
