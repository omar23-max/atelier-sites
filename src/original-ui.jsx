import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sections } from "./engine/sections.js";

const byId = Object.fromEntries(sections.map((s) => [s.id, s]));

// Bascule « Original / Modifiable » d'une page issue d'un import
// (root.props.importSource), dans la barre de l'aperçu, à gauche des tailles
// d'écran. « Original » montre la page capturée telle quelle (textes, design et
// images d'origine, scripts coupés), en lecture seule, à la place de l'aperçu
// et à la même taille d'écran. « Modifiable » est la page de l'éditeur.
// Rien de l'original n'est exporté ni publié.

// Puck n'a pas d'emplacement prévu pour ces éléments : on attend qu'ils existent.
function useElement(selector) {
  const [el, setEl] = useState(null);
  useEffect(() => {
    const find = () => document.querySelector(selector);
    if (find()) return setEl(find());
    const obs = new MutationObserver(() => find() && (setEl(find()), obs.disconnect()));
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [selector]);
  return el;
}

// Deux gestes sur la version modifiable d'une page de projet, sans jamais
// toucher au template du catalogue (pages/<importSource>.json) :
// « Repartir de l'original » remet ses sections telles que dans le template
// (l'état actuel part dans l'historique) ; « Supprimer cette page » l'envoie
// à la corbeille, d'où on peut la restaurer.
async function resetFromOriginal(pageName, importSource, current) {
  const res = await fetch(`/api/pages/${importSource}`);
  if (!res.ok) throw new Error("La page d'origine n'est plus dans le catalogue.");
  const original = await res.json();
  await fetch(`/api/pages/${pageName}/snapshot`, { method: "POST" });
  const props = { ...current.root?.props };
  // Design et polices exactement comme l'original (une police absente de
  // l'original ne doit pas rester imposée à la page).
  for (const k of ["design", "font_heading", "font_body"]) {
    if (original.root?.props?.[k] != null) props[k] = original.root.props[k];
    else delete props[k];
  }
  const put = await fetch(`/api/pages/${pageName}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...current, root: { ...current.root, props }, content: original.content }),
  });
  if (!put.ok) throw new Error((await put.json()).error);
}

function PageMenu({ pageName, importSource, projet, pages, getData }) {
  // La page du template elle-même (sans projet) : l'original, on ne la remet
  // pas à zéro et on ne la supprime pas d'ici.
  const original = !projet || pageName === importSource;
  // open : position de la liste (la barre de Puck coupe ce qui dépasse, la
  // liste est donc posée sur la page entière).
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !e.target.closest?.(".atl-pagemenu, .atl-pagemenu__list") && setOpen(null);
    document.addEventListener("mousedown", close);
    // La barre du bas (au survol) reste levée tant que le menu est ouvert.
    const bar = document.querySelector(".atl-vpbar");
    bar?.classList.add("is-menu");
    return () => {
      document.removeEventListener("mousedown", close);
      bar?.classList.remove("is-menu");
    };
  }, [open]);

  async function reset() {
    setOpen(null);
    if (!confirm("Remettre cette page comme la page d'origine du catalogue ?\n\nTes modifications partent dans l'historique (bouton Historique pour revenir en arrière).")) return;
    setBusy(true);
    try {
      await resetFromOriginal(pageName, importSource, getData());
      location.reload();
    } catch (e) {
      setBusy(false);
      alert(e.message);
    }
  }

  // Version wireframe (comme le rendu de Whitelabeler) : nouvelle page du même
  // projet, même mise en page et même design, textes remplacés par des briefs
  // « [ Titre H2 — 7 mots ] » et emplacements d'image vides. La page d'origine
  // ne change pas.
  async function wireframe() {
    setOpen(null);
    const data = getData();
    let name = `${pageName}-wireframe`;
    for (let n = 2; pages.some((p) => p.name === name); n++) name = `${pageName}-wireframe-${n}`;
    const plainText = (html) => String(html ?? "").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const brief = (html, label) => {
      const t = plainText(html);
      if (!t) return html;
      if (/^[\d\s$€£.,:%/+×x*-]+$/i.test(t)) return t.replace(/\d/g, "0");
      const w = t.split(" ").length;
      return `[ ${label} — ${w} mot${w > 1 ? "s" : ""} ]`;
    };
    const content = (data.content ?? []).map((item) => {
      const section = byId[item.type];
      const props = { ...item.props, wireframe: true };
      // Noms des éléments d'une copie (meta.arbre) : Titre H2, Paragraphe…
      const names = {};
      (function walk(t) {
        if (!t) return;
        if (t.group) return (t.children ?? []).forEach(walk);
        names[t.slot] = t.name;
      })(section?.meta?.arbre);
      for (const [key, value] of Object.entries(props)) {
        if (!Array.isArray(value)) continue;
        const blockType = key.replace(/^blocks_/, "");
        const defs = section?.schema.blocks?.find((b) => b.type === blockType)?.settings ?? [];
        props[key] = value.map((b) => {
          const out = { ...b };
          if ("slot" in out) {
            if (out.text) out.text = brief(out.text, names[out.slot] ?? "Texte");
            if (out.image) out.image = "";
            return out;
          }
          for (const s of defs) {
            if (s.type === "image_picker") out[s.id] = "";
            else if (["text", "textarea", "richtext", "inline_richtext"].includes(s.type) && out[s.id]) out[s.id] = brief(out[s.id], s.label ?? "Texte");
          }
          return out;
        });
      }
      for (const s of section && !section.meta.pageSpecific ? section.schema.settings ?? [] : []) {
        if (s.type === "image_picker") props[s.id] = "";
        else if (["text", "textarea", "richtext", "inline_richtext"].includes(s.type) && props[s.id]) props[s.id] = brief(props[s.id], s.label ?? "Texte");
      }
      return { ...item, props };
    });
    const page = { ...data, root: { ...data.root, props: { ...data.root.props, title: `${data.root.props.title ?? pageName} (wireframe)` } }, content };
    setBusy(true);
    const res = await fetch(`/api/pages/${name}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(page) });
    if (!res.ok) {
      setBusy(false);
      return alert((await res.json()).error);
    }
    location.assign(`/?page=${name}`);
  }

  async function remove() {
    setOpen(null);
    if (!confirm("Supprimer cette page du projet ?\n\nLa page d'origine reste dans le catalogue. Celle-ci part dans la corbeille, d'où tu peux la restaurer.")) return;
    setBusy(true);
    const res = await fetch(`/api/corbeille/pages/${pageName}`, { method: "POST" });
    if (!res.ok) {
      setBusy(false);
      return alert((await res.json()).error);
    }
    const next = pages.find((p) => p.name !== pageName && p.projet === projet);
    location.replace(next ? `/?page=${next.name}` : "/catalogue.html#projets");
  }

  return (
    <div className="atl-pagemenu">
      <button
        type="button"
        className="atl-pagemenu__btn"
        disabled={busy}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          // Bouton dans le bas de l'écran (barre du bas) : le menu s'ouvre
          // vers le haut, sinon il sortirait de la fenêtre.
          const up = r.top > innerHeight / 2;
          setOpen((o) => (o ? null : up ? { bottom: innerHeight - r.top + 6, left: r.left } : { top: r.bottom + 6, left: r.left }));
        }}
        title="Repartir de l'original, supprimer la page"
      >
        {busy ? "…" : "⋯"}
      </button>
      {open &&
        createPortal(
        <div className="atl-pagemenu__list" role="menu" style={open}>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              // La version enregistrée (Publish) de la page, en lecture seule.
              const url = `${location.origin}/partage/${pageName}`;
              await navigator.clipboard?.writeText(url).catch(() => {});
              window.open(url, "_blank", "noopener");
              setOpen(null);
            }}
          >
            🔗 Lien de partage (lecture seule)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(null);
              setBusy(true);
              try {
                const res = await fetch(`/api/verifier/${importSource}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: pageName }) });
                const r = await res.json();
                if (!res.ok) throw new Error(r.error);
                const inst = r.instable;
                alert(
                  [
                    `Vérification du miroir (capture enregistrée, Edge, Chrome, HTML brut) — fidélité ${r.score} / 100 contre la ${r.reference ?? "capture"}`,
                    "",
                    r.siteChange ? `Site d'origine : ${r.siteChange.verdict} (${r.siteChange.score} / 100)` : "",
                    r.visuel ? `Visuel : ${r.visuel.ecart} % de pixels différents — planche imports/${importSource}/compare-copie.png` : "",
                    `Hauteur : capture ${r.hauteur.capture ?? r.hauteur.edge} px · copie ${r.hauteur.copie} px (${r.hauteur.ecart})`,
                    `Images : ${r.images.retrouvees} / ${r.images.original} retrouvées`,
                    `Titres : ${r.titres.original - r.titres.manquants.length} / ${r.titres.original}${r.titres.manquants.length ? ` — manquants : ${r.titres.manquants.slice(0, 4).join(" · ")}` : ""}`,
                    `Textes : ${r.textes.couverture} des phrases retrouvées`,
                    inst ? `Edge et Chrome ${inst.hauteur || inst.images || inst.titres ? "diffèrent (contenu instable sur le site d'origine)" : "donnent le même résultat"}` : "",
                    "",
                    `Détail : imports/${importSource}/verification.json`,
                  ].join("\n"),
                );
              } catch (e) {
                alert(`Vérification impossible : ${e.message}`);
              } finally {
                setBusy(false);
              }
            }}
          >
            🔍 Vérifier le miroir (3 passes, ~1 min)
          </button>
          {original ? (
            <>
              <p className="atl-pagemenu__note">C'est la page d'origine du catalogue : elle ne se supprime pas d'ici. Pour la modifier, utilise-la dans un projet.</p>
              <button type="button" role="menuitem" onClick={() => location.assign("/catalogue.html#templates")}>
                ➕ L'utiliser dans un projet…
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={reset}>
                ↺ Repartir de l'original
              </button>
              <button type="button" role="menuitem" onClick={() => location.assign(`/catalogue.html?page=${encodeURIComponent(pageName)}#templates`)}>
                🪞 Miroring d'un autre template…
              </button>
              <button type="button" role="menuitem" onClick={wireframe} title="Nouvelle page du projet : même mise en page, textes remplacés par des briefs, images vides">
                ▭ Créer une version wireframe
              </button>
              <button type="button" role="menuitem" className="is-danger" onClick={remove}>
                🗑 Supprimer cette page
              </button>
            </>
          )}
        </div>,
          document.body,
        )}
    </div>
  );
}

export function OriginalSwitch({ importSource, pageName, projet, pages = [], getData }) {
  const [info, setInfo] = useState(null);
  const [view, setView] = useState("modifiable");
  const bar = useElement('[class*="ViewportControls-actionsInner"]');
  const canvas = useElement('[class*="PuckCanvas-inner"]');
  const [slot, setSlot] = useState(null);

  useEffect(() => {
    setInfo(null);
    setView("modifiable");
    if (!importSource) return;
    fetch(`/api/original/${importSource}/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => {});
  }, [importSource]);

  // Place réservée au début de la barre de l'aperçu.
  useEffect(() => {
    if (!bar) return;
    const host = document.createElement("span");
    host.className = "atl-switch-host";
    bar.prepend(host);
    setSlot(host);
    return () => host.remove();
  }, [bar]);

  if (!info || !slot) return null;
  return (
    <>
      {createPortal(
        <span className="atl-switch" role="tablist" aria-label="Version de la page">
          <button type="button" className={view === "original" ? "is-on" : ""} onClick={() => setView("original")} title="La page d'origine : ses textes, son design et ses images (lecture seule)">
            Original
          </button>
          <button type="button" className={view === "modifiable" ? "is-on" : ""} onClick={() => setView("modifiable")} title="La version que tu modifies et publies">
            Modifiable
          </button>
          <PageMenu pageName={pageName} importSource={importSource} projet={projet} pages={pages} getData={getData} />
        </span>,
        slot,
      )}
      {view === "original" && canvas && createPortal(<OriginalView importSource={importSource} info={info} canvas={canvas} />, canvas)}
    </>
  );
}

// Même largeur d'écran et même zoom que l'aperçu de Puck.
function usePreviewSize(canvas) {
  const [size, setSize] = useState({ width: 1440, scale: 1, height: 800 });
  useEffect(() => {
    const measure = () => {
      const frame = canvas.querySelector('[class*="PuckPreview"] iframe, iframe');
      const width = frame?.offsetWidth || 1440;
      const shown = frame?.getBoundingClientRect().width || width;
      const next = { width, scale: shown / width || 1, height: canvas.clientHeight };
      setSize((s) => (s.width === next.width && Math.abs(s.scale - next.scale) < 0.001 && s.height === next.height ? s : next));
    };
    measure();
    const timer = setInterval(measure, 400);
    return () => clearInterval(timer);
  }, [canvas]);
  return size;
}

// Position dans la page, de 0 (haut) à 1 (bas) : les deux versions n'ont pas
// exactement la même hauteur, on garde la même proportion.
const ratioOf = (w) => w.scrollY / Math.max(1, w.document.documentElement.scrollHeight - w.innerHeight);
const scrollToRatio = (w, r) => w.scrollTo(0, r * Math.max(0, w.document.documentElement.scrollHeight - w.innerHeight));

// « Original » = la page EN LIGNE, à son adresse web (2026-11-08) : rendue par
// le serveur (scripts/original-live.mjs, les sites refusent d'être affichés
// dans un cadre) puis servie par l'atelier, scripts coupés. Refaite au plus
// toutes les 6 h, ou avec « Actualiser ». La capture faite à l'import reste
// visible avec « Voir la capture ».
function OriginalView({ importSource, info, canvas }) {
  const { width, scale, height } = usePreviewSize(canvas);
  const frameHeight = (height - 40) / scale;
  const frameRef = useRef(null);
  const [mode, setMode] = useState(info.url ? "live" : "capture");
  const [nonce, setNonce] = useState(0); // « Actualiser » : nouveau rendu de la page en ligne
  const [loading, setLoading] = useState(true);
  const [liveAt, setLiveAt] = useState(info.liveAt ?? null);
  const src = mode === "live" ? `/api/original/${importSource}/live${nonce ? `?refresh=1&n=${nonce}` : ""}` : `/api/original/${importSource}`;
  const onLoad = () => {
    setLoading(false);
    if (mode === "live")
      fetch(`/api/original/${importSource}/info`)
        .then((r) => (r.ok ? r.json() : null))
        .then((i) => i?.liveAt && setLiveAt(i.liveAt))
        .catch(() => {});
  };
  const when = liveAt ? new Date(liveAt).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : null;

  // Défilement lié : l'original s'ouvre à l'endroit où l'on était dans la
  // copie, et le faire défiler fait défiler la copie (cachée dessous) — au
  // retour sur « Modifiable », on est au même endroit.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const copy = () => [...canvas.querySelectorAll("iframe")].find((f) => f !== frame)?.contentWindow;
    let detach = () => {};
    // L'événement « load » arrive parfois avant ce code : on attend que la
    // page d'origine soit là (pas about:blank) plutôt que de l'écouter.
    const timer = setInterval(() => {
      const ow = frame.contentWindow;
      const pw = copy();
      const ready = ow && ow.location.href !== "about:blank" && ow.document.readyState !== "loading";
      if (!ready || !pw) return;
      clearInterval(timer);
      const start = ratioOf(pw);
      scrollToRatio(ow, start);
      // Les images de l'original changent sa hauteur en arrivant : on recale.
      setTimeout(() => scrollToRatio(ow, start), 700);
      // La page d'origine est isolée (sans scripts) : ses événements « scroll »
      // n'arrivent pas, on relève sa position régulièrement. La copie est
      // cachée pendant ce temps (sans hauteur) : la position lui est appliquée
      // juste après son retour, en revenant sur « Modifiable ».
      let ratio = start;
      // (Au retour, la page d'origine est déjà retirée : on garde la dernière
      // position relevée tant qu'elle était affichée.)
      const poll = setInterval(() => {
        if (frame.isConnected && ow.document?.documentElement?.scrollHeight > ow.innerHeight) ratio = ratioOf(ow);
      }, 150);
      detach = () => {
        clearInterval(poll);
        setTimeout(() => {
          const w = copy();
          if (w) scrollToRatio(w, ratio);
        }, 80);
      };
    }, 150);
    return () => (clearInterval(timer), detach());
  }, [canvas, src]);
  return (
    <div className="atl-original-pane">
      <div className="atl-original-pane__note">
        {mode === "live" ? "Page en ligne, telle qu'elle apparaît sur internet (lecture seule)" : "Capture faite à l'import (lecture seule)"}
        {info.url && (
          <>
            {" · "}
            <a href={info.url} target="_blank" rel="noreferrer noopener" title={info.url}>
              {new URL(info.url).hostname.replace(/^www\./, "")}
              {new URL(info.url).pathname !== "/" ? new URL(info.url).pathname : ""} ↗
            </a>
          </>
        )}
        {mode === "live" && when && ` · relevée le ${when}`}
        {mode === "capture" && info.capturedAt && ` · capturée le ${info.capturedAt}`}
        {info.url && mode === "live" && (
          <button type="button" className="atl-original-pane__btn" disabled={loading} onClick={() => (setLoading(true), setNonce(Date.now()))} title="Recharger la page en ligne maintenant">
            ↻ Actualiser
          </button>
        )}
        {info.url && (
          <button type="button" className="atl-original-pane__btn" onClick={() => (setLoading(true), setMode(mode === "live" ? "capture" : "live"))}>
            {mode === "live" ? "Voir la capture" : "Voir la page en ligne"}
          </button>
        )}
      </div>
      <div className="atl-original-pane__frame" style={{ width: width * scale, height: frameHeight * scale }}>
        {loading && <div className="atl-original-pane__loading">{mode === "live" ? "Chargement de la page en ligne… (jusqu'à 15 s la première fois)" : "Chargement…"}</div>}
        <iframe
          key={src}
          ref={frameRef}
          title="Page d'origine"
          src={src}
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={onLoad}
          style={{ width, height: frameHeight, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}
