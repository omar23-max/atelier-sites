import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { IconImage } from "./icons.jsx";
import { originalPhotoTargets } from "./engine/photos.js";
import { designById } from "./engine/designs.js";
import { sections, sectionsIndex } from "./engine/sections.js";
import { blocksKey, normalizeProps } from "./engine/render.js";
import { ROOT_ZONE } from "./library-ui.jsx";
import { ExportToPage } from "./canvas-ui.jsx";
import { WorkspaceSwitch, useOpenFromUrl } from "./workspace-switch.jsx";

const sectionsById = sectionsIndex;

export { originalPhotoTargets };

const pageName = new URLSearchParams(location.search).get("page") ?? "brouillon";
const MAX_REFS = 10; // en tout (produit + marque) : limite des demandes

// Deux boîtes, comme Whitelabeler : les photos du produit, et la marque.
const TAGS = {
  produit: ["Face avant", "Dos / étiquette", "Emballage", "Gros plan", "Produit en main", "Autre"],
  marque: ["Logo", "Brand board", "Palette de couleurs", "Exemple de style", "Autre"],
};
// Prix indicatif d'une image gpt-image-2 en qualité moyenne (OpenAI), en $.
// Estimation à ajuster si le tarif change.
const PRIX_IMAGE = 0.05;
const FORMATS = { "1:1": "Carré 1:1 (fil d'actualité)", "4:5": "Portrait 4:5 (Facebook, Instagram)", "9:16": "Story 9:16 (Reels, TikTok)" };

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
const urlToDataUrl = async (url) => readAsDataUrl(await (await fetch(url)).blob());
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Bouton « Studio d'images » : chaque photo d'origine de la page est refaite
// avec ton produit (tes photos, ton logo, ta palette), ou transformée en
// visuel publicitaire. Crée une demande (demandes/<date>-images/) que Claude
// traite avec gpt-image-2 ; les images obtenues sont posées dans la page
// (medias/<page>/), les pubs rangées dans medias/<page>/pubs/.
export function StudioButton({ hidden = false }) {
  const [open, setOpen] = useState(() => window.__atlEspace === "studio");
  // Ouvert aussi depuis un champ image (« Refaire avec le Studio d'images »).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    useOpenFromUrl("studio");
    window.addEventListener("atl-open-studio", onOpen);
    return () => window.removeEventListener("atl-open-studio", onOpen);
  }, []);
  return (
    <>
      {!hidden && (
        <button type="button" className="atl-tool" onClick={() => setOpen(true)} title="Refaire les photos d'origine avec ton produit">
          <IconImage />
          Studio d'images
        </button>
      )}
      {open && createPortal(<StudioDialog onClose={() => ((window.__atlEspace = null), setOpen(false))} />, document.body)}
    </>
  );
}

// Une boîte de références (produit ou marque).
function RefBox({ title, hint, group, refs, setRefs, room }) {
  const mine = refs.filter((r) => r.groupe === group);
  async function addFiles(files) {
    const list = [...files].filter((f) => f?.type?.startsWith("image/")).slice(0, room);
    const added = await Promise.all(list.map(async (f) => ({ groupe: group, name: f.name, dataUrl: await readAsDataUrl(f), tag: TAGS[group][0] })));
    setRefs((r) => [...r, ...added].slice(0, MAX_REFS));
  }
  return (
    <div className="atl-studio__box">
      <p className="atl-studio__boxtitle">
        {title} <em>{mine.length}</em>
      </p>
      <p className="atl-newpage__hint">{hint}</p>
      <div
        className="atl-studio__drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        onPaste={(e) => addFiles([...e.clipboardData.items].map((i) => i.getAsFile()).filter(Boolean))}
        tabIndex={0}
      >
        {mine.map((r) => (
          <figure key={r.dataUrl.slice(-40) + r.name} className="atl-studio__ref">
            <img src={r.dataUrl} alt="" />
            <select value={r.tag} onChange={(e) => setRefs(refs.map((x) => (x === r ? { ...x, tag: e.target.value } : x)))}>
              {TAGS[group].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            {r.auto && <small className="atl-studio__auto">du projet</small>}
            <button type="button" onClick={() => setRefs(refs.filter((x) => x !== r))} aria-label="Retirer">
              ×
            </button>
          </figure>
        ))}
        {room > 0 && (
          <label className="atl-studio__add">
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <b>+ Ajouter</b>
            <small>Glisse, colle ou choisis</small>
          </label>
        )}
      </div>
    </div>
  );
}

// Avancement des demandes d'images de cette page (écrit par scripts/studio.mjs).
function Progress() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const load = () =>
      fetch("/api/requests")
        .then((r) => r.json())
        .then((list) => setItems(list.filter((d) => d.type === "images" && d.page === pageName).slice(0, 3)))
        .catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);
  if (!items.length) return null;
  return (
    <div className="atl-studio__progress">
      {items.map((d) => {
        const total = d.details?.cibles?.length ?? 0;
        const faites = d.progression?.faites ?? 0;
        return (
          <div key={d.dossier}>
            <span>
              {d.details?.mode === "pub" ? "Pubs" : "Photos"} · {d.dossier.slice(0, 10)} : <b>{faites}</b> sur {total} générée(s)
              {d.progression?.etat ? ` · ${d.progression.etat}` : d.statut === "en attente" ? " · en attente" : ""}
              {d.progression?.sautees?.length > 0 && ` · ${d.progression.sautees.length} sautée(s), refusée(s) par l'IA`}
            </span>
            <i style={{ width: `${total ? (100 * faites) / total : 0}%` }} />
          </div>
        );
      })}
    </div>
  );
}

// ---- Studio d'images en direct (2026-11-11) : la page « Image Mirror » de
// Whitelabeler, dans l'atelier. À gauche quatre cartes numérotées (1 ton
// produit, 2 tes images, 3 images à refaire, 4 images générées) ; à droite le
// panneau Réglages (coût, mode Miroir / Pub, pilote automatique, bouton
// Lancer, modèle, réglages du pilote, « Que se passe-t-il »). Chaque image est
// faite par le serveur de l'atelier (/api/ia/studio, gpt-image-2 ou Nano
// Banana), une à la fois, puis installée à sa place dans la page, une par une.
// Les versions sont gardées dans le navigateur (localStorage) par page.
// Lot E (2026-11-24) : agents qui peuvent écrire le prompt de chaque image.
const STUDIO_AGENTS_MIROIR = [["whitelabeler-image-mirror-studio-v-1", "Image Mirror Studio V.1"], ["whitelabeler-style-mirror-image-creator-v-1", "Style Mirror Image Creator V.1"], ["shopfunnels-ai-image-recreator", "AI Image Recreator"]];
const STUDIO_AGENTS_PUB = [["shopfunnels-ai-scroll-stopping-image-ad-specialists", "Scroll-Stopping Image Ad Specialists"], ["shopfunnels-ai-ad-rebuilder-v-3", "AI Ad Rebuilder V3"], ["whitelabeler-product-mockup-generator-v-1", "Product Mockup Generator"], ["whitelabeler-hyper-realistic-ugc-image-studio-v-1", "Hyper Realistic UGC Image Studio"], ["whitelabeler-branded-image-creator-v-1", "Branded Image Creator"]];
const MODELES = {
  auto: { label: "Auto", prix: 0.05, aide: "GPT Image 2 : fiable, clé OpenAI de l'atelier." },
  "nano-banana": { label: "Nano Banana", prix: 0.04, aide: "Google : très fidèle au produit. Demande la facturation activée sur ton projet Google." },
  "gpt-image-2": { label: "GPT Image 2", prix: 0.05, aide: "OpenAI : fiable, bonne gestion des textes." },
  "nano-banana-pro": { label: "Nano Banana Pro", prix: 0.13, aide: "Google, la meilleure qualité, plus cher." },
};
const modeleReel = (m) => (m === "auto" ? "gpt-image-2" : m);
const LS = `atl-studio-${pageName}`;
const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? "{}");
  } catch {
    return {};
  }
};
const sizeOf = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve([img.naturalWidth || 1024, img.naturalHeight || 1024]);
    img.onerror = () => resolve([1024, 1024]);
    img.src = src;
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function StudioDialog({ onClose }) {
  const getPuck = useGetPuck();
  const data = getPuck().appState.data;
  const root = data.root?.props ?? {};
  // Emplacements d'image à refaire : relevés à l'ouverture (une image installée
  // ne doit pas disparaître de la liste).
  // Images retirées de la liste (2026-11-18) : gardées par page dans ce
  // navigateur ; la page et les images déjà générées ne sont pas touchées.
  const LS_RETIREES = `atl-studio-retirees-${pageName}`;
  const [retirees, setRetirees] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(LS_RETIREES) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [dernierRetrait, setDernierRetrait] = useState(null); // { target, index }
  const [targets, setTargets] = useState(() => originalPhotoTargets(data.content ?? []).filter((t) => !retirees.has(t.key)));
  const [chosen, setChosen] = useState(() => new Set(targets.map((t) => t.key)));
  const [refs, setRefs] = useState([]);
  const [notes, setNotes] = useState({});
  const [form, setForm] = useState({ produit: root.produit ?? "", description: root.infos ?? "", mode: "fidele", format: "4:5", accroche: "", cta: "", textes: "", modele: "auto", autopilot: true, rythme: "tout", n: 8, agent: "" });
  const [results, setResults] = useState(loadSaved); // { [cle]: { versions: [{url, modele, note, consigne}], sel, installee } }
  const [status, setStatus] = useState({}); // { [cle]: "attente" | "encours" | "erreur" }
  const [errors, setErrors] = useState({});
  const [current, setCurrent] = useState(null); // clé affichée en 4
  const [run, setRun] = useState(null); // { state: "marche" | "pause" | "demande", faites }
  const [refine, setRefine] = useState("");
  const [exportUrl, setExportUrl] = useState(null);
  const [flash, setFlash] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const stopRef = useRef(false);
  const continueRef = useRef(null);
  const design = designById[root.design];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const pub = form.mode === "pub";

  useEffect(() => {
    try {
      localStorage.setItem(LS, JSON.stringify(results));
    } catch {}
  }, [results]);
  useEffect(() => {
    try {
      if (retirees.size) localStorage.setItem(LS_RETIREES, JSON.stringify([...retirees]));
      else localStorage.removeItem(LS_RETIREES);
    } catch {}
  }, [retirees]);
  // Retirer une image de la liste « Images à refaire » (annulable).
  function retirer(t) {
    const index = targets.findIndex((x) => x.key === t.key);
    setTargets((list) => list.filter((x) => x.key !== t.key));
    setChosen((c) => new Set([...c].filter((x) => x !== t.key)));
    if (t.sectionId) setRetirees((s) => new Set([...s, t.key]));
    if (current === t.key) setCurrent(null);
    setDernierRetrait({ target: t, index });
  }
  function annulerRetrait() {
    const d = dernierRetrait;
    if (!d) return;
    setTargets((list) => {
      const next = list.filter((x) => x.key !== d.target.key);
      next.splice(Math.min(d.index, next.length), 0, d.target);
      return next;
    });
    setRetirees((s) => new Set([...s].filter((x) => x !== d.target.key)));
    setDernierRetrait(null);
  }
  // Remettre toutes les photos d'origine retirées, à leur place dans l'ordre de la page.
  function remettreTout() {
    const all = originalPhotoTargets(getPuck().appState.data.content ?? []);
    setTargets((list) => {
      const have = new Set(list.map((x) => x.key));
      const back = all.filter((x) => retirees.has(x.key) && !have.has(x.key));
      const order = new Map(all.map((x, i) => [x.key, i]));
      const page = [...list.filter((x) => x.sectionId), ...back].sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9));
      return [...page, ...list.filter((x) => !x.sectionId)];
    });
    setRetirees(new Set());
    setDernierRetrait(null);
  }
  // Versions dont le fichier a été mis à la corbeille (catalogue) : retirées.
  useEffect(() => {
    const urls = Object.values(results).flatMap((r) => (r.versions ?? []).map((v) => v.url));
    Promise.all(urls.map((u) => fetch(u, { method: "HEAD" }).then((r) => [u, r.ok && !/text\/html/.test(r.headers.get("content-type") ?? "")]).catch(() => [u, true]))).then((list) => {
      const gone = new Set(list.filter(([, ok]) => !ok).map(([u]) => u));
      if (!gone.size) return;
      setResults((rs) =>
        Object.fromEntries(
          Object.entries(rs)
            .map(([k, r]) => {
              const versions = (r.versions ?? []).filter((v) => !gone.has(v.url));
              return [k, { ...r, versions, sel: Math.min(r.sel ?? versions.length - 1, versions.length - 1) }];
            })
            .filter(([, r]) => r.versions.length),
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Taille minimale (comme le filtre « Min size » de Whitelabeler) : les
  // icônes, logos et pictos de moins de 150 px ne sont pas cochés au départ.
  const [dims, setDims] = useState({});
  const MIN_PX = 150;
  useEffect(() => {
    let alive = true;
    Promise.all(targets.map(async (t) => [t.key, await sizeOf(t.source)])).then((list) => {
      if (!alive) return;
      const d = Object.fromEntries(list);
      setDims(d);
      setChosen((c) => new Set([...c].filter((k) => !d[k] || Math.max(...d[k]) >= MIN_PX)));
    });
    return () => {
      alive = false;
    };
  }, []);
  const small = (k) => dims[k] && Math.max(...dims[k]) < MIN_PX;

  // Photos du produit et logo de la page, kit de marque et description du projet.
  useEffect(() => {
    const urls = [...(Array.isArray(root.photos_produit) ? root.photos_produit : []).map((u) => [u, "produit", "Produit"]), ...(root.logo ? [[root.logo, "marque", "Logo"]] : [])];
    Promise.all(urls.map(([u, groupe, tag]) => urlToDataUrl(u).then((dataUrl) => ({ groupe, tag, name: u.split("/").pop(), dataUrl, auto: true })).catch(() => null))).then((auto) =>
      setRefs((r) => [...auto.filter(Boolean), ...r].slice(0, MAX_REFS)),
    );
    if (!root.projet) return;
    fetch(`/api/projects/${encodeURIComponent(root.projet)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (project) => {
        if (!project) return;
        const fd = project.fondations?.reponses ?? {};
        setForm((f) => ({ ...f, produit: f.produit || project.produit || project.nom || "", description: f.description || project.description || fd.role || "" }));
        const brand = project.marque ?? {};
        const list = [...(brand.logos ?? []).map((u) => [u, "Logo"]), ...(brand.brandBoard ? [[brand.brandBoard, "Brand board"]] : [])].slice(0, 4);
        const auto = await Promise.all(list.map(([u, tag]) => urlToDataUrl(u).then((dataUrl) => ({ groupe: "marque", tag, name: u.split("/").pop(), dataUrl, auto: true })).catch(() => null)));
        setRefs((r) => [...r, ...auto.filter(Boolean)].slice(0, MAX_REFS));
        // Lot E : photos produit et marque rangées dans la médiathèque (onglet Projet).
        const mt = await fetch(`/api/mediatheque/${pageName}`).then((x) => (x.ok ? x.json() : { items: [] })).catch(() => ({ items: [] }));
        const deja = new Set([...urls.map(([u]) => u), ...list.map(([u]) => u)]);
        const choisis = (mt.items ?? []).filter((x) => x.type === "image" && x.provenance === "projet" && ["produit", "marque"].includes(x.sous) && x.choix !== "ecartee" && !deja.has(x.url)).slice(0, 6);
        const plus = await Promise.all(choisis.map((x) => urlToDataUrl(x.url).then((dataUrl) => ({ groupe: x.sous === "marque" ? "marque" : "produit", tag: x.sous === "marque" ? "Logo" : "Produit", name: x.url.split("/").pop(), dataUrl, auto: true })).catch(() => null)));
        setRefs((r) => [...r, ...plus.filter(Boolean).filter((p) => !r.some((y) => y.name === p.name))].slice(0, MAX_REFS));
      })
      .catch(() => {});
  }, []);

  const ordered = [...refs.filter((r) => r.groupe === "produit"), ...refs.filter((r) => r.groupe === "marque")];
  const prix = MODELES[form.modele]?.prix ?? 0.05;
  const queue = targets.filter((t) => chosen.has(t.key) && !results[t.key]?.versions?.length);
  const done = targets.filter((t) => results[t.key]?.versions?.length).length;
  const room = MAX_REFS - refs.length;
  const cur = targets.find((t) => t.key === current) ?? targets.find((t) => results[t.key]?.versions?.length) ?? null;
  const curRes = cur ? results[cur.key] : null;
  const curVer = curRes?.versions?.[curRes.sel ?? curRes.versions.length - 1] ?? null;

  async function generate(t, affiner = null) {
    setStatus((s) => ({ ...s, [t.key]: "encours" }));
    setErrors((e) => ({ ...e, [t.key]: null }));
    try {
      const prev = results[t.key]?.versions ?? [];
      const source = affiner ? prev[results[t.key]?.sel ?? prev.length - 1]?.url : t.source;
      const [w, h] = await sizeOf(source);
      const res = await fetch("/api/ia/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: pageName,
          source,
          references: ordered.map((r) => r.dataUrl),
          refs: ordered.map((r) => ({ groupe: r.groupe, etiquette: r.tag })),
          produit: form.produit,
          description: form.description,
          mode: form.mode,
          format: form.format,
          accroche: form.accroche,
          cta: form.cta,
          textes: form.textes,
          brief: t.brief,
          consigne: notes[t.key] ?? "",
          affiner,
          marque: { couleurs: design?.tokens?.couleurs ?? null, polices: design?.tokens?.polices ?? null },
          width: w,
          height: h,
          modele: modeleReel(form.modele),
          agent: form.agent || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setResults((r) => {
        const versions = [...(r[t.key]?.versions ?? []), { url: body.url, modele: body.modele, note: body.note, consigne: affiner || notes[t.key] || "" }];
        return { ...r, [t.key]: { ...(r[t.key] ?? {}), versions, sel: versions.length - 1 } };
      });
      setStatus((s) => ({ ...s, [t.key]: null }));
      setCurrent(t.key);
      return true;
    } catch (e) {
      setStatus((s) => ({ ...s, [t.key]: "erreur" }));
      setErrors((x) => ({ ...x, [t.key]: e.message }));
      return false;
    }
  }

  // Lancer : une image (pilote automatique coupé), ou toute la file selon les
  // réglages du pilote (tout, s'arrêter après 5 ou N, demander avant chaque image).
  async function start() {
    if (!ordered.some((r) => r.groupe === "produit")) return setFlash({ error: "Ajoute au moins une photo de ton produit (carte 2)." });
    const todo = [...queue];
    if (!todo.length) return setFlash({ error: "Rien à générer : coche des images en 3." });
    stopRef.current = false;
    const limit = !form.autopilot ? 1 : form.rythme === "5" ? 5 : form.rythme === "n" ? Math.max(1, Number(form.n) || 1) : todo.length;
    // Image d'essai (audit, 2026-11-17) : rien encore de généré et plusieurs
    // images prévues → on s'arrête après la première pour la regarder.
    const essai = done === 0 && Math.min(limit, todo.length) > 1;
    setStatus((s) => ({ ...s, ...Object.fromEntries(todo.map((t) => [t.key, "attente"])) }));
    let faites = 0;
    for (const t of todo) {
      if (stopRef.current || faites >= limit) break;
      if (faites > 0 && ((form.autopilot && form.rythme === "demander") || (essai && faites === 1))) {
        setRun({ state: "demande", faites, next: t.sectionLabel, essai: essai && faites === 1 });
        const go = await new Promise((resolve) => (continueRef.current = resolve));
        if (!go) break;
      }
      setRun({ state: "marche", faites, total: Math.min(limit, todo.length) });
      await generate(t);
      faites++;
      await sleep(50);
    }
    setStatus((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== "attente")));
    setRun(null);
  }
  function stop() {
    stopRef.current = true;
    continueRef.current?.(false);
  }

  // Installer l'image affichée dans la page : à la place de la photo d'origine
  // de son emplacement, ou dans un autre emplacement choisi. Ctrl+Z l'annule.
  function install(t, url, toKey) {
    const target = targets.find((x) => x.key === (toKey || t.key)) ?? t;
    const { appState, dispatch } = getPuck();
    const index = appState.data.content.findIndex((c) => c.props.id === target.sectionId);
    if (index < 0) return setFlash({ error: "Section introuvable dans la page." });
    const item = appState.data.content[index];
    const section = sectionsById[item.type];
    const props = { ...item.props };
    if (target.blockType) {
      const k = blocksKey(target.blockType);
      const full = normalizeProps(section, item.props)[k] ?? [];
      const list = [...(props[k] ?? full)];
      list[target.blockIndex] = { ...(full[target.blockIndex] ?? {}), ...(list[target.blockIndex] ?? {}), [target.settingId]: url };
      props[k] = list;
    } else props[target.settingId] = url;
    dispatch({ type: "replace", destinationIndex: index, destinationZone: ROOT_ZONE, data: { ...item, props } });
    setResults((r) => ({ ...r, [t.key]: { ...(r[t.key] ?? {}), installee: target.key } }));
    setFlash({ ok: `Installée dans « ${target.sectionLabel} ». Ctrl+Z pour annuler ; la page s'enregistre toute seule.` });
  }

  async function addSources(files) {
    const list = await Promise.all([...files].filter((f) => f?.type?.startsWith("image/")).slice(0, 20).map(readAsDataUrl));
    const added = list.map((src, i) => ({ key: `ajout-${Date.now()}-${i}`, sectionId: null, sectionLabel: "Image ajoutée", settingLabel: "à installer où tu veux", source: src, brief: "" }));
    setTargets((t) => [...t, ...added]);
    setChosen((c) => new Set([...c, ...added.map((a) => a.key)]));
  }
  const pageSlots = targets.filter((t) => t.sectionId);
  // « Export to Canvas » / « Export all to Canvas » de Whitelabeler : la
  // version affichée rejoint le dernier tableau du projet. Toutes : le
  // Canvas s'ouvre ensuite.
  async function sendToCanvas(list = targets, ouvrir = true) {
    const images = [];
    for (const t of list) {
      const r = results[t.key];
      if (!r?.versions?.length) continue;
      const v = r.versions[r.sel ?? r.versions.length - 1];
      const [w, h] = await sizeOf(v.url);
      images.push({ url: v.url, ratio: w / h, label: t.sectionLabel, origine: { source: "Studio d'images", modele: MODELES[v.modele]?.label ?? v.modele, consigne: v.consigne || "", note: v.note || "" } });
    }
    const res = await fetch(`/api/canvas/${pageName}/dernier/ajouter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images }) });
    if (!res.ok) return setFlash({ error: "Le Canvas n'a pas pu être mis à jour." });
    if (!ouvrir) return setFlash({ ok: "Envoyée dans le Canvas du projet (dernier tableau)." });
    onClose();
    window.dispatchEvent(new CustomEvent("atl-open-canvas"));
  }
  const download = (url, name) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="atl-mirror" role="dialog" aria-modal="true" aria-label="Studio d'images">
      <header className="atl-mirror__top">
        <div>
          <h2>Studio d'images</h2>
          <span>Chaque photo d'origine refaite avec ton produit et ta marque, puis installée dans la page.</span>
        </div>
        <WorkspaceSwitch current="studio" onLeave={() => (stop(), onClose())} />
        <button type="button" className="atl-modal__close" onClick={() => (stop(), onClose())} aria-label="Fermer">
          ×
        </button>
      </header>
      <div className="atl-mirror__layout">
        <div className="atl-mirror__main">
          {/* 1. Le produit */}
          <section className="atl-mirror__card">
            <h3>
              <i>1</i> Parle-nous de ton produit {form.produit.trim() && <em className="atl-mirror__ready">✓ PRÊT</em>}
            </h3>
            <p className="atl-mirror__sub">C'est ce qui rend les images justes.</p>
            <label className="atl-mirror__field">
              <span>Nom du produit</span>
              <input value={form.produit} onChange={set("produit")} placeholder="ex. Chinup Face Sculpt Wrap" />
              <small>Sert à réécrire tout texte visible dans les images.</small>
            </label>
            <label className="atl-mirror__field">
              <span>Ce que c'est, ce qu'il contient</span>
              <textarea rows={3} value={form.description} onChange={set("description")} placeholder="Une courte description. Ex. « Bandeau en tissu respirant, réutilisable, à porter la nuit. »" />
            </label>
          </section>

          {/* 2. Les références */}
          <section className="atl-mirror__card">
            <h3>
              <i>2</i> Tes images
            </h3>
            <p className="atl-mirror__sub">Les photos de ton produit et ce qui montre ta marque. Tout est construit à partir de là.</p>
            <div className="atl-studio__boxes">
              <RefBox title="Ton produit" hint="Quelques photos : face, dos, en main, emballage (fournisseur ou les tiennes)." group="produit" refs={refs} setRefs={setRefs} room={room} />
              <RefBox title="Ta marque" hint={`Logo, brand board, couleurs.${design ? ` Couleurs et polices de ${design.id}.` : ""}`} group="marque" refs={refs} setRefs={setRefs} room={room} />
            </div>
            {!refs.some((r) => r.groupe === "produit") && (
              <p className="atl-studio__warn" role="note">
                Aucune photo de ton produit : sans elle, l'IA ne peut pas le reproduire fidèlement. Ajoute-en au moins une avant de lancer.
              </p>
            )}
          </section>

          {/* 3. Les images à refaire */}
          <section className="atl-mirror__card">
            <h3>
              <i>3</i> Images à refaire
              <span className="atl-mirror__headtools">
                <label className="atl-mirror__linkbtn">
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => addSources(e.target.files)} />+ Ajouter des images
                </label>
                <button type="button" className="atl-mirror__linkbtn" onClick={() => setChosen(chosen.size ? new Set() : new Set(targets.map((t) => t.key)))}>
                  {chosen.size ? "Tout décocher" : "Tout cocher"}
                </button>
              </span>
            </h3>
            <p className="atl-mirror__sub">
              Les photos d'origine de la page, dans l'ordre. Décoche celles à garder telles quelles. Les images de moins de {MIN_PX} px (icônes, logos) ne sont pas cochées.
            </p>
            {targets.length === 0 ? (
              <div className="atl-mirror__empty">Rien ici : la page n'affiche plus de photo d'origine. Ajoute des images pour les refaire.</div>
            ) : (
              <ul className="atl-mirror__strip">
                {targets.map((t, i) => {
                  const r = results[t.key];
                  const st = status[t.key];
                  const label = st === "encours" ? "En cours" : st === "attente" ? "En attente" : st === "erreur" ? "Erreur" : r?.installee ? "Installée" : r?.versions?.length ? "Fait" : chosen.has(t.key) ? "À faire" : small(t.key) ? "Petite" : "Gardée";
                  return (
                    <li key={t.key} className={`${chosen.has(t.key) ? "is-on" : ""}${cur?.key === t.key ? " is-current" : ""}`}>
                      <button
                        type="button"
                        className="atl-mirror__remove"
                        disabled={st === "encours"}
                        onClick={() => retirer(t)}
                        title={st === "encours" ? "En cours de génération" : "Retirer de la liste (la page n'est pas modifiée)"}
                        aria-label={`Retirer l'image ${i + 1} de la liste`}
                      >
                        ×
                      </button>
                      <button type="button" onClick={() => setCurrent(t.key)} title={`${t.sectionLabel} · ${t.settingLabel ?? ""}`}>
                        <span className="atl-mirror__num">{i + 1}</span>
                        <img src={r?.versions?.length ? r.versions[r.sel ?? r.versions.length - 1].url : t.source} alt="" />
                        {st === "encours" && <span className="atl-mirror__spin" aria-hidden="true" />}
                      </button>
                      <label className={`atl-mirror__chip is-${st ?? (r?.installee ? "installee" : r?.versions?.length ? "fait" : "idle")}`}>
                        <input type="checkbox" checked={chosen.has(t.key)} onChange={() => setChosen((c) => (c.has(t.key) ? new Set([...c].filter((x) => x !== t.key)) : new Set([...c, t.key])))} />
                        {label}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {(dernierRetrait || retirees.size > 0) && (
              <p className="atl-mirror__retraits" role="status">
                {dernierRetrait && (
                  <>
                    Image retirée de la liste.{" "}
                    <button type="button" className="atl-mirror__linkbtn" onClick={annulerRetrait}>
                      Annuler
                    </button>
                  </>
                )}
                {retirees.size > 0 && (
                  <button type="button" className="atl-mirror__linkbtn" onClick={remettreTout}>
                    Remettre les images retirées ({retirees.size})
                  </button>
                )}
              </p>
            )}
            <div className="atl-mirror__bar">
              <span>
                {done} sur {targets.length} générée(s)
              </span>
              <i style={{ width: `${targets.length ? (100 * done) / targets.length : 0}%` }} />
              <span>{run?.state === "marche" ? "En cours…" : run?.state === "demande" ? "En pause" : queue.length ? `${queue.length} à faire` : "Tout est fait"}</span>
            </div>
          </section>

          {/* 4. Les images générées */}
          <section className="atl-mirror__card">
            <h3>
              <i>4</i> Tes images générées
              <span className="atl-mirror__headtools">
                <button type="button" className="atl-mirror__linkbtn" onClick={() => setShowAll(!showAll)}>
                  {showAll ? "Une à la fois" : "Voir toutes les images"}
                </button>
                <button
                  type="button"
                  className="atl-mirror__linkbtn"
                  disabled={!done}
                  onClick={async () => {
                    for (const t of targets) {
                      const r = results[t.key];
                      if (!r?.versions?.length) continue;
                      download(r.versions[r.sel ?? r.versions.length - 1].url, `${pageName}-${t.key}.png`);
                      await sleep(300);
                    }
                  }}
                >
                  Tout télécharger ({done})
                </button>
                <button type="button" className="atl-mirror__linkbtn" disabled={!done} onClick={() => sendToCanvas()} title="Pose toutes les images générées sur le Canvas du projet">
                  Tout envoyer dans le Canvas ({done})
                </button>
              </span>
            </h3>
            <p className="atl-mirror__sub">Faites à partir de tes références et de chaque photo d'origine.</p>
            {showAll ? (
              <ul className="atl-mirror__all">
                {targets
                  .filter((t) => results[t.key]?.versions?.length)
                  .map((t) => {
                    const r = results[t.key];
                    return (
                      <li key={t.key}>
                        <button type="button" onClick={() => (setCurrent(t.key), setShowAll(false))}>
                          <img src={r.versions[r.sel ?? r.versions.length - 1].url} alt="" />
                        </button>
                        <small>
                          {t.sectionLabel}
                          {r.installee ? " · installée" : ""}
                        </small>
                      </li>
                    );
                  })}
              </ul>
            ) : !cur || !curVer ? (
              <div className="atl-mirror__placeholder">
                <span>🖼</span>
                Ton image arrive ici. Quelques secondes à une minute chacune.
              </div>
            ) : (
              <div className="atl-mirror__result">
                <figure>
                  <div className="atl-mirror__vbar">
                    <button type="button" disabled={(curRes.sel ?? 0) <= 0} onClick={() => setResults((r) => ({ ...r, [cur.key]: { ...curRes, sel: (curRes.sel ?? 0) - 1 } }))} aria-label="Version précédente">
                      ‹
                    </button>
                    <span>
                      Version {(curRes.sel ?? curRes.versions.length - 1) + 1} / {curRes.versions.length} · {cur.sectionLabel}
                    </span>
                    <button type="button" disabled={(curRes.sel ?? 0) >= curRes.versions.length - 1} onClick={() => setResults((r) => ({ ...r, [cur.key]: { ...curRes, sel: (curRes.sel ?? 0) + 1 } }))} aria-label="Version suivante">
                      ›
                    </button>
                    <button type="button" className="atl-mirror__dl" onClick={() => download(curVer.url, `${pageName}-${cur.key}.png`)}>
                      ⬇ Télécharger
                    </button>
                  </div>
                  <img src={curVer.url} alt="" />
                  {status[cur.key] === "encours" && <span className="atl-mirror__overlay">En cours…</span>}
                </figure>
                <div className="atl-mirror__side">
                  <div className="atl-mirror__about">
                    <b>À propos de cette version</b>
                    <p>
                      {curVer.note || (curVer.consigne ? `Retouche : ${curVer.consigne}` : `Photo d'origine refaite avec ${form.produit || "ton produit"}, ${MODELES[curVer.modele]?.label ?? curVer.modele}.`)}
                    </p>
                    <div className="atl-mirror__orig">
                      <img src={cur.source} alt="" />
                      <small>
                        L'originale · {cur.sectionLabel}
                        {cur.settingLabel ? ` · ${cur.settingLabel}` : ""}
                      </small>
                    </div>
                  </div>
                  <textarea rows={2} value={refine} onChange={(e) => setRefine(e.target.value)} placeholder="Ce qu'il faut changer. Ex. « plus lumineux », « le produit plus grand », « garde l'emballage »" />
                  <button type="button" className="atl-mirror__refine" disabled={!refine.trim() || status[cur.key] === "encours"} onClick={async () => (await generate(cur, refine.trim())) && setRefine("")}>
                    ✦ Affiner cette image
                  </button>
                  <button type="button" className="atl-mirror__export" onClick={() => sendToCanvas([cur], false)}>
                    ▤ Envoyer dans le Canvas
                  </button>
                  <button type="button" className="atl-mirror__export" onClick={() => setExportUrl(curVer.url)}>
                    ⇪ Exporter vers une page
                  </button>
                  <div className="atl-mirror__minor">
                    <button type="button" className="atl-mirror__linkbtn" disabled={status[cur.key] === "encours"} onClick={() => generate(cur)}>
                      ↻ Refaire depuis l'originale
                    </button>
                    {!pub && cur.sectionId && (
                      <button type="button" className="atl-mirror__linkbtn" onClick={() => install(cur, curVer.url, cur.key)}>
                        {curRes.installee ? "✓ Installée à sa place" : "Installer à sa place"}
                      </button>
                    )}
                  </div>
                  {errors[cur.key] && <p className="atl-topbar__error">{errors[cur.key]}</p>}
                </div>
              </div>
            )}
            {flash && <p className={flash.error ? "atl-topbar__error" : "atl-topbar__ok"}>{flash.error ?? flash.ok}</p>}
            {exportUrl && <ExportToPage urls={[exportUrl]} onClose={() => setExportUrl(null)} onDone={(msg) => setFlash({ ok: msg })} />}
          </section>
        </div>

        {/* Panneau Réglages */}
        <aside className="atl-mirror__settings">
          <div className="atl-mirror__panel">
            <h4>Réglages</h4>
            <div className="atl-mirror__credits">
              <b>≈ {(queue.length * prix).toFixed(2).replace(".", ",")} $</b>
              <span>
                pour {queue.length} image(s) à faire · environ {String(prix).replace(".", ",")} $ l'image ({MODELES[form.modele].label})
              </span>
            </div>
            <span className="atl-mirror__label">Mode</span>
            <div className="atl-mirror__seg">
              <button type="button" className={!pub ? "is-on" : ""} onClick={() => setForm({ ...form, mode: "fidele" })}>
                Miroir
              </button>
              <button type="button" className={pub ? "is-on" : ""} onClick={() => setForm({ ...form, mode: "pub" })}>
                Pub
              </button>
            </div>
            <small>{pub ? "Fait un visuel publicitaire à partir de chaque photo ; rangé à part, la page ne change pas." : "Refait chaque photo fidèlement, avec ton produit et ta marque à la place."}</small>
            {pub && (
              <div className="atl-mirror__pub">
                <select value={form.format} onChange={set("format")} aria-label="Format">
                  {Object.entries(FORMATS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <input value={form.accroche} onChange={set("accroche")} placeholder="Accroche écrite sur le visuel" />
                <input value={form.cta} onChange={set("cta")} placeholder="Bouton (facultatif)" />
              </div>
            )}
            <label className="atl-mirror__toggle">
              <span>
                <b>Pilote automatique</b>
                <small>Activé : chaque image démarre dès que la précédente est finie.</small>
              </span>
              <input type="checkbox" checked={form.autopilot} onChange={set("autopilot")} />
              <i aria-hidden="true" />
            </label>
            {run ? (
              run.state === "demande" ? (
                <div className="atl-mirror__ask">
                  <span>
                    {run.essai ? "Image d'essai faite : regarde-la avant de lancer les autres. " : `${run.faites} faite(s). `}
                    Suivante : <b>{run.next}</b>
                  </span>
                  <button type="button" className="atl-mirror__go" onClick={() => continueRef.current?.(true)}>
                    Continuer
                  </button>
                  <button type="button" className="atl-mirror__stop" onClick={stop}>
                    Arrêter
                  </button>
                </div>
              ) : (
                <button type="button" className="atl-mirror__stop" onClick={stop}>
                  ■ Arrêter après l'image en cours ({run.faites} / {run.total})
                </button>
              )
            ) : (
              <button type="button" className="atl-mirror__go" disabled={!queue.length} onClick={start}>
                ✦ Lancer la génération · {form.autopilot ? queue.length : Math.min(1, queue.length)} image(s)
              </button>
            )}
            <small className="atl-mirror__center">{queue.length ? `${queue.length} image(s) en attente en 3.` : "Rien en attente. Coche ou ajoute des images en 3."}</small>

            <span className="atl-mirror__label">Modèle</span>
            <div className="atl-mirror__seg atl-mirror__seg--grid">
              {Object.entries(MODELES).map(([id, m]) => (
                <button key={id} type="button" className={form.modele === id ? "is-on" : ""} onClick={() => setForm({ ...form, modele: id })}>
                  {m.label}
                </button>
              ))}
            </div>
            <small>{MODELES[form.modele].aide}</small>

            <span className="atl-mirror__label">Agent qui écrit le prompt</span>
            <select className="atl-mirror__agent" value={form.agent} onChange={set("agent")}>
              <option value="">Aucun : prompt de l'atelier (le plus rapide)</option>
              {(pub ? STUDIO_AGENTS_PUB : STUDIO_AGENTS_MIROIR).map(([slug, nom]) => (
                <option key={slug} value={slug}>
                  {nom}
                </option>
              ))}
            </select>
            <small>{form.agent ? "L'agent applique sa méthode au prompt de chaque image (≈ 0,05 $ et 20 s de plus par image). Les règles produit, marque et preuves restent prioritaires." : "Le prompt de l'atelier suffit pour une recréation simple. Un agent affine la mise en scène."}</small>

            {form.autopilot && (
              <>
                <span className="atl-mirror__label">Réglages du pilote</span>
                <div className="atl-mirror__radios">
                  {[
                    ["tout", "Tout générer dans la file"],
                    ["5", "S'arrêter après 5 images"],
                    ["n", "S'arrêter après N images"],
                    ["demander", "Demander avant chaque image"],
                  ].map(([v, l]) => (
                    <label key={v} className={form.rythme === v ? "is-on" : ""}>
                      <input type="radio" name="rythme" value={v} checked={form.rythme === v} onChange={set("rythme")} />
                      {v === "n" ? (
                        <>
                          S'arrêter après <input type="number" min={1} value={form.n} onChange={set("n")} className="atl-mirror__n" /> images
                        </>
                      ) : (
                        l
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
            <label className="atl-mirror__field">
              <span>Textes précis à changer (facultatif)</span>
              <input value={form.textes} onChange={set("textes")} placeholder="ex. Skult → Chinup ; 4,7 → (retirer)" />
            </label>
            <button
              type="button"
              className="atl-mirror__linkbtn"
              onClick={() => {
                if (confirm("Effacer toutes les versions gardées pour cette page ? Les fichiers restent dans le dossier du projet.")) setResults({});
              }}
            >
              ↺ Tout effacer
            </button>
          </div>
          <div className="atl-mirror__panel atl-mirror__how">
            <h4>Que se passe-t-il quand je lance ?</h4>
            <ol>
              <li>On lit les infos de ton produit et les références de la carte 2.</li>
              <li>Chaque image de la carte 3 est refaite avec ton produit et ta marque.</li>
              <li>Les images finies arrivent en 4 : affine celles que tu veux, puis installe-les une par une.</li>
            </ol>
          </div>
          {cur && (
            <label className="atl-mirror__field atl-mirror__panel">
              <span>Consigne pour « {cur.sectionLabel} » (facultatif)</span>
              <input value={notes[cur.key] ?? ""} onChange={(e) => setNotes({ ...notes, [cur.key]: e.target.value })} placeholder="ex. une femme de 50 ans, lumière du matin" />
            </label>
          )}
        </aside>
      </div>
    </div>
  );
}
