import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sections, sectionsIndex } from "./engine/sections.js";
import { renderSectionHtml } from "./engine/render.js";
import { brandCss } from "./engine/brand.js";
import { designById } from "./engine/designs.js";

const byId = sectionsIndex;

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

// Trois affichages (décision du 2026-11-14, faite le 2026-11-17), dans la
// barre de l'aperçu, à la place de « Original / Modifiable » :
//   Ordinateur seul        — la page à modifier ;
//   Édition + originale    — la page à modifier à gauche, la page d'origine à
//                            droite, défilement lié (pages issues d'un import) ;
//   Ordinateur + téléphone — la page à modifier à gauche, son rendu sur
//                            téléphone à droite, mis à jour pendant l'édition.
// Vues doubles en icônes (2026-11-17), après les écrans de Puck (téléphone,
// tablette, ordinateur = vue simple) : ordinateur + ordinateur (page modifiée
// à gauche, originale à droite) et ordinateur + téléphone.
const Monitor = ({ x }) => (
  <>
    <rect x={x + 0.75} y="1.75" width="11" height="8" rx="1.5" />
    <path d={`M${x + 6.25} 9.75v3M${x + 3.75} 13.25h5`} />
  </>
);
const VIEWS = [
  { id: "seul", label: "Ordinateur seul", title: "La page à modifier, seule" },
  {
    id: "originale",
    label: "Édition + originale",
    title: "Page modifiée à gauche, page d'origine à droite (défilement lié)",
    icon: (
      <svg viewBox="0 0 26 15" width="26" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <Monitor x={0} />
        <Monitor x={13.5} />
      </svg>
    ),
  },
  {
    id: "telephone",
    label: "Ordinateur + téléphone",
    title: "Page modifiée sur ordinateur à gauche, son rendu sur téléphone à droite",
    icon: (
      <svg viewBox="0 0 22 15" width="22" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <Monitor x={0} />
        <rect x="15" y="1.5" width="6.25" height="12" rx="1.4" />
        <path d="M17.6 11.4h1" />
      </svg>
    ),
  },
];

export function OriginalSwitch({ importSource, pageName, projet, pages = [], getData }) {
  const [info, setInfo] = useState(null);
  const [view, setView] = useState("seul");
  const bar = useElement('[class*="ViewportControls-actionsInner"]');
  const canvas = useElement('[class*="PuckCanvas-inner"]');
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    setInfo(null);
    setView((v) => (v === "originale" ? "seul" : v));
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
  // Un clic sur un écran de Puck (téléphone, tablette, ordinateur) revient à
  // la vue simple. isTrusted : le clic automatique ci-dessous ne compte pas.
  useEffect(() => {
    if (!bar) return;
    // L'écran déjà choisi est désactivé par Puck : en vue double, son clic
    // arrive sur l'enveloppe (span), le bouton laissant passer la souris (CSS).
    const on = (e) => {
      if (!e.isTrusted) return;
      const hit = e.target.closest?.('button[title^="Switch to"]') ?? e.target.closest?.("span")?.querySelector(':scope > button[title^="Switch to"]');
      if (hit) setView("seul");
    };
    bar.addEventListener("click", on);
    return () => bar.removeEventListener("click", on);
  }, [bar]);
  // Les vues doubles s'affichent avec l'aperçu en version ordinateur.
  useEffect(() => {
    document.body.classList.toggle("atl-view-split", view === "originale");
    document.body.classList.toggle("atl-view-phone", view === "telephone");
    if (view !== "seul") document.querySelector('button[title="Switch to Ordinateur viewport"]')?.click();
    return () => document.body.classList.remove("atl-view-split", "atl-view-phone");
  }, [view]);
  if (!slot) return null;
  const outer = canvas?.parentElement;
  return (
    <>
      {createPortal(
        <span className="atl-switch atl-views" role="tablist" aria-label="Affichage">
          {VIEWS.filter((v) => v.icon).map((v) => (
            <button
              key={v.id}
              type="button"
              className={`atl-view-icon${view === v.id ? " is-on" : ""}`}
              disabled={v.id === "originale" && !info}
              aria-pressed={view === v.id}
              aria-label={v.label}
              onClick={() => setView(view === v.id ? "seul" : v.id)}
              title={v.id === "originale" && !info ? "Pas de page d'origine : cette page ne vient pas d'un import" : view === v.id ? `${v.title} — clic : revenir à la vue simple` : v.title}
            >
              {v.icon}
            </button>
          ))}
          {info && <PageMenu pageName={pageName} importSource={importSource} projet={projet} pages={pages} getData={getData} />}
        </span>,
        slot,
      )}
      {view === "originale" && info && canvas && outer && createPortal(<OriginalView importSource={importSource} info={info} canvas={canvas} split />, outer)}
      {view === "telephone" && canvas && outer && createPortal(<PhonePane getData={getData} canvas={canvas} />, outer)}
    </>
  );
}

// Rendu téléphone de la page en cours (390 px), refait quand la page change.
const CSS_IMPORT = /@import\s+url\([^)]*\)\s*;?/g;
function phoneHtml(data) {
  const items = (data.content ?? []).filter((it) => byId[it.type] && !byId[it.type].leger);
  const used = [...new Set(items.map((it) => it.type))].map((t) => byId[t]);
  const body = items
    .map((it) => {
      try {
        return renderSectionHtml(byId[it.type], it.props, it.props.id);
      } catch {
        return "";
      }
    })
    .join("\n");
  const css = [brandCss(data.root?.props, designById[data.root?.props?.design]?.tokens?.styles), ...used.map((s) => s.css ?? "")].join("\n");
  const imports = [...new Set(css.match(CSS_IMPORT) ?? [])].join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="${location.origin}/"><style>${imports}\nhtml, body { margin: 0; }\n${css.replace(CSS_IMPORT, "")}</style></head><body>${body}</body></html>`;
}

function PhonePane({ getData, canvas }) {
  const [html, setHtml] = useState("");
  const frameRef = useRef(null);
  const lastRatio = useRef(-1);
  useEffect(() => {
    let last = null;
    const build = () => {
      const data = getData?.();
      if (!data) return;
      const key = JSON.stringify([data.content, data.root?.props]);
      if (key === last) return;
      last = key;
      setHtml(phoneHtml(data));
    };
    build();
    const timer = setInterval(build, 1200);
    return () => clearInterval(timer);
  }, [getData]);
  // Défilement lié : le téléphone suit la page à modifier.
  useEffect(() => {
    const timer = setInterval(() => {
      const pw = [...canvas.querySelectorAll("iframe")].find((f) => f !== frameRef.current)?.contentWindow;
      const fw = frameRef.current?.contentWindow;
      if (!pw || !fw?.document?.documentElement) return;
      const r = ratioOf(pw);
      if (Math.abs(r - lastRatio.current) > 0.002) {
        lastRatio.current = r;
        scrollToRatio(fw, r);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [canvas]);
  return (
    <div className="atl-phone-pane">
      <div className="atl-original-pane__note">Téléphone (390 px) · les modifications se font à gauche</div>
      <iframe ref={frameRef} title="Aperçu sur téléphone" srcDoc={html} sandbox="allow-scripts allow-same-origin" onLoad={() => (lastRatio.current = -1)} />
    </div>
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
function OriginalView({ importSource, info, canvas, split = false }) {
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
      let lastCopy = ratioOf(pw);
      // (Au retour, la page d'origine est déjà retirée : on garde la dernière
      // position relevée tant qu'elle était affichée.)
      const poll = setInterval(() => {
        if (!frame.isConnected || !(ow.document?.documentElement?.scrollHeight > ow.innerHeight)) return;
        // Côte à côte (« Édition + originale ») : les deux pages défilent ensemble.
        if (split) {
          const w = copy();
          if (!w) return;
          const c = ratioOf(w);
          if (Math.abs(c - lastCopy) > 0.002) {
            lastCopy = c;
            ratio = c;
            return scrollToRatio(ow, c);
          }
          const o = ratioOf(ow);
          if (Math.abs(o - ratio) > 0.002) {
            ratio = o;
            scrollToRatio(w, o);
            lastCopy = ratioOf(w);
          }
          return;
        }
        ratio = ratioOf(ow);
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
  }, [canvas, src, split]);
  return (
    <div className={`atl-original-pane${split ? " is-split" : ""}`}>
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
