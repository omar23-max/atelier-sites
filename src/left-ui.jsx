import { useEffect, useMemo, useRef, useState } from "react";
import { useGetPuck } from "@puckeditor/core";
import { sections } from "./engine/sections.js";
import { FAMILIES, familyOf } from "./engine/families.js";
import { designs, designById } from "./engine/designs.js";
import { parseDesign } from "./engine/design.js";
import { brandRoles, designMarkdown, extractPalette } from "./engine/palette.js";
import { applyDesignToPage } from "./catalogue/Designs.jsx";
import { ROOT_ZONE, Thumb, insertSection, scrollCanvasTo, usePuckSelect } from "./library-ui.jsx";
import { ScorePanel } from "./score-ui.jsx";
import { IconGauge, IconGrid, IconHistory, IconList, IconPalette, IconPlusSquare, IconSparkles, IconSwap } from "./icons.jsx";

// Colonne de gauche : un rail d'icônes et l'outil choisi.
//   Structure · Ajouter une section · Palette · Régénérer · Rebrand · Score

const pageName = new URLSearchParams(location.search).get("page");
const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
const visible = sections.filter((s) => s.meta.status !== "masquee" && !s.meta.pageSpecific);
const nameOf = (s, fallback) => (s?.meta.label ?? fallback).split(" — ");

const TOOLS = [
  { id: "structure", label: "Structure", icon: IconList },
  { id: "ajouter", label: "Ajouter une section", icon: IconPlusSquare },
  { id: "palette", label: "Palette", icon: IconPalette },
  { id: "regenerer", label: "Régénérer", icon: IconSparkles },
  { id: "rebrand", label: "Rebrand", icon: IconSwap },
  { id: "score", label: "Score de vente", icon: IconGauge },
];

// Un clic sur un outil déroule son panneau ; un second clic le referme et il
// ne reste que le rail (la colonne se réduit à sa largeur).
export function LeftPanel() {
  const [tool, setTool] = useState(null);
  const toggle = (id) => {
    // Un seul panneau à la fois : ouvrir un outil referme l'éditeur.
    window.dispatchEvent(new CustomEvent("atl-close-editor"));
    setTool((t) => (t === id ? null : id));
  };
  // Ouvrir un outil depuis ailleurs : window.dispatchEvent(new CustomEvent("atl-left-tool", { detail: "ajouter" }))
  useEffect(() => {
    const on = (e) => setTool(e.detail);
    window.addEventListener("atl-left-tool", on);
    return () => window.removeEventListener("atl-left-tool", on);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("atl-rail-only", !tool);
    return () => document.body.classList.remove("atl-rail-only");
  }, [tool]);
  const current = TOOLS.find((t) => t.id === tool);
  return (
    <div className="atl-left">
      <nav className="atl-rail" aria-label="Outils">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" title={label} aria-label={label} className={tool === id ? "is-on" : ""} onClick={() => toggle(id)}>
            <Icon />
          </button>
        ))}
        <button type="button" title="Réglages de la page" aria-label="Réglages de la page" onClick={() => (setTool(null), window.dispatchEvent(new CustomEvent("atl-open-page-settings")))}>
          ⚙
        </button>
        {/* En bas : le catalogue et l'historique de la page. */}
        <span className="atl-rail__sep" />
        <a href={`/catalogue.html${location.search}#tout`} title="Catalogue" aria-label="Catalogue">
          <IconGrid />
        </a>
        <button type="button" title="Historique de la page" aria-label="Historique" onClick={() => window.dispatchEvent(new CustomEvent("atl-open-history"))}>
          <IconHistory />
        </button>
      </nav>
      {tool && (
      <div className="atl-tool-panel">
        {tool !== "score" && (
          <div className="atl-tool-panel__head">
            <small>Outil</small>
            <b>{current.label}</b>
          </div>
        )}
        {tool === "structure" && <StructureTool onAdd={() => setTool("ajouter")} />}
        {tool === "ajouter" && <AddTool />}
        {tool === "palette" && <PaletteTool />}
        {tool === "regenerer" && <RegenerateTool />}
        {tool === "rebrand" && <RebrandTool />}
        {tool === "score" && <ScorePanel />}
      </div>
      )}
    </div>
  );
}

// ---- Structure : les sections de la page, par leur nom ----
function StructureTool({ onAdd }) {
  const content = usePuckSelect((s) => s.appState.data.content);
  const selectedId = usePuckSelect((s) => s.selectedItem?.props?.id ?? null);
  const dispatch = usePuckSelect((s) => s.dispatch);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (selectedId) listRef.current?.querySelector(`[data-item="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  function select(index, id) {
    dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
    setTimeout(() => scrollCanvasTo(id), 60);
  }
  function move(from, to, id) {
    if (to < 0 || to >= content.length || from === to) return;
    dispatch({ type: "reorder", sourceIndex: from, destinationIndex: to, destinationZone: ROOT_ZONE });
    dispatch({ type: "setUi", ui: { itemSelector: { index: to, zone: ROOT_ZONE } } });
    setTimeout(() => scrollCanvasTo(id), 60);
  }

  const needle = q.trim().toLowerCase();
  return (
    <>
      <input className="atl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une section" />
      {content.length === 0 && <p className="atl-tool-panel__empty">Page vide. Ajoute une première section.</p>}
      <ol className="atl-structure" ref={listRef}>
        {content.map((item, index) => {
          const section = byId[item.type];
          const [name, variant] = nameOf(section, item.type);
          if (needle && !`${name} ${variant ?? ""}`.toLowerCase().includes(needle)) return null;
          const id = item.props.id;
          return (
            <li
              key={id}
              data-item={id}
              className={`${id === selectedId ? "is-active" : ""}${drag === index ? " is-drag" : ""}`}
              draggable
              onDragStart={() => setDrag(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => (drag !== null ? move(drag, index, content[drag].props.id) : null, setDrag(null))}
              onDragEnd={() => setDrag(null)}
            >
              <span className="atl-structure__grip" aria-hidden="true">
                ⋮⋮
              </span>
              <button type="button" className="atl-structure__name" onClick={() => select(index, id)} title={section?.meta.label}>
                <b>{name}</b>
                {variant && <small>{variant}</small>}
              </button>
              <span className="atl-structure__tools">
                <button type="button" title="Monter" disabled={index === 0} onClick={() => move(index, index - 1, id)}>
                  ↑
                </button>
                <button type="button" title="Descendre" disabled={index === content.length - 1} onClick={() => move(index, index + 1, id)}>
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <button type="button" className="atl-left__cta" onClick={onAdd}>
        + Ajouter une section
      </button>
    </>
  );
}

// ---- Ajouter : type de section, puis galerie ou création par l'IA ----
// Questions posées par l'IA selon le type de section.
const GENERIC_Q = [
  { id: "objectif", label: "À quoi doit servir cette section ?", ph: "ex. rassurer sur la sécurité du produit" },
  { id: "contenu", label: "Que doit-elle contenir ?", ph: "ex. 3 colonnes avec icône, titre et phrase" },
];
const AI_QUESTIONS = {
  hero: [
    { id: "promesse", label: "La promesse principale", ph: "ex. Des ongles sains en 30 jours" },
    { id: "visuel", label: "Le visuel", ph: "ex. produit détouré à droite, fond photo nature" },
    { id: "cta", label: "Le bouton d'action", ph: "ex. Commander maintenant → page produit" },
    { id: "preuve", label: "Preuve sous le titre (avis, chiffres…)", ph: "ex. ★ 4,8 – 12 000 clients" },
  ],
  temoignages: [
    { id: "nombre", label: "Combien d'avis ?", ph: "ex. 3 cartes, ou un carrousel de 6" },
    { id: "format", label: "Format", ph: "ex. photo du client, étoiles, citation courte" },
    { id: "angle", label: "Ce que les avis doivent montrer", ph: "ex. résultats visibles en 2 semaines" },
  ],
  expert: [
    { id: "expert", label: "Qui est l'expert ?", ph: "ex. pharmacienne, nutritionniste" },
    { id: "message", label: "Ce qu'il/elle affirme", ph: "ex. pourquoi cet ingrédient est efficace" },
    { id: "format", label: "Format", ph: "ex. photo + citation + signature" },
  ],
  faq: [
    { id: "nombre", label: "Combien de questions ?", ph: "ex. 6" },
    { id: "themes", label: "Sujets à couvrir", ph: "ex. livraison, efficacité, allergies, remboursement" },
    { id: "format", label: "Format", ph: "ex. accordéon avec image à gauche" },
  ],
  avantages: [
    { id: "nombre", label: "Combien d'avantages ?", ph: "ex. 4" },
    { id: "format", label: "Format", ph: "ex. icônes en grille, ou liste avec photo" },
    { id: "liste", label: "Les avantages (si tu les connais)", ph: "ex. naturel, rapide, sans odeur, fabriqué au Canada" },
  ],
  ingredients: [
    { id: "liste", label: "Ingrédients à présenter", ph: "ex. vitamine D3, zinc, curcuma" },
    { id: "format", label: "Format", ph: "ex. cartes avec photo de l'ingrédient et son bienfait" },
  ],
  comparatif: [
    { id: "contre", label: "Comparé à quoi ?", ph: "ex. les autres marques, ou les crèmes classiques" },
    { id: "criteres", label: "Critères", ph: "ex. prix, efficacité, ingrédients, garantie" },
    { id: "format", label: "Format", ph: "ex. tableau 3 colonnes avec coches" },
  ],
  garantie: [
    { id: "garantie", label: "La garantie", ph: "ex. 120 jours satisfait ou remboursé" },
    { id: "format", label: "Format", ph: "ex. badge rond + texte rassurant" },
  ],
  offre: [
    { id: "offre", label: "L'offre", ph: "ex. 3 achetés + 2 offerts, livraison gratuite" },
    { id: "urgence", label: "Urgence", ph: "ex. compte à rebours, stock limité" },
    { id: "cta", label: "Bouton", ph: "ex. Je profite de l'offre" },
  ],
  bonus: [
    { id: "bonus", label: "Les bonus offerts", ph: "ex. ebook, plan repas, accès vidéo" },
    { id: "format", label: "Format", ph: "ex. 3 cartes avec visuel et valeur barrée" },
  ],
  chiffres: [
    { id: "chiffres", label: "Les chiffres", ph: "ex. 50 000 clients, 4,8/5, 120 jours" },
    { id: "format", label: "Format", ph: "ex. grandes cartes sur fond sombre" },
  ],
  newsletter: [
    { id: "incitation", label: "Pourquoi s'inscrire ?", ph: "ex. -10 % sur la première commande" },
    { id: "format", label: "Format", ph: "ex. bandeau avec champ e-mail et bouton" },
  ],
  confiance: [
    { id: "badges", label: "Badges à montrer", ph: "ex. paiement sécurisé, fabriqué au Canada, vu dans…" },
    { id: "format", label: "Format", ph: "ex. une ligne de logos/icônes" },
  ],
};

function AddTool() {
  const getPuck = useGetPuck();
  const hasSelection = usePuckSelect((s) => !!s.selectedItem);
  const [family, setFamily] = useState(null);
  const [mode, setMode] = useState(null); // "galerie" | "ia"
  const [answers, setAnswers] = useState({});
  const [state, setState] = useState(null);
  const grouped = useMemo(() => {
    const g = Object.fromEntries(FAMILIES.map((f) => [f.id, []]));
    for (const s of visible) (g[familyOf(s).id] ??= []).push(s);
    return g;
  }, []);
  const current = FAMILIES.find((f) => f.id === family);
  const variants = family ? grouped[family] ?? [] : [];
  const questions = [...(AI_QUESTIONS[family] ?? GENERIC_Q), { id: "reference", label: "Une référence (URL ou description) — facultatif", ph: "https://… ou « comme la FAQ de tel site »" }];

  async function askAI() {
    const { appState, selectedItem, getSelectorForId } = getPuck();
    const sel = selectedItem ? getSelectorForId(selectedItem.props.id) : null;
    const after = sel ? appState.data.content[sel.index] : null;
    setState({ busy: true });
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ia",
          family,
          page: pageName,
          notes: questions.map((q) => (answers[q.id] ? `${q.label} : ${answers[q.id]}` : null)).filter(Boolean).join("\n"),
          details: { page: pageName, famille: family, reponses: answers, apres: after ? after.props.id : null },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setState({ done: body.dossier });
      setAnswers({});
    } catch (e) {
      setState({ error: e.message });
    }
  }

  // Menu déroulant des types, comme la « Section library » de Whitelabeler :
  // une seule liste, ses 24 types d'abord puis ceux de structure de page.
  const typeSelect = (
    <select className="atl-family-select" value={family ?? ""} onChange={(e) => (setFamily(e.target.value || null), setMode(null), setState(null))}>
      <option value="">Choose a section type…</option>
      {FAMILIES.map((f) => (
        <option key={f.id} value={f.id}>
          {f.label}
        </option>
      ))}
    </select>
  );

  // 1. Type de section
  if (!family) {
    return (
      <>
        {typeSelect}
        <p className="atl-tool-panel__hint">{hasSelection ? "Elle sera ajoutée après la section sélectionnée." : "Elle sera ajoutée en fin de page."}</p>
      </>
    );
  }

  return (
    <>
      {typeSelect}
      <p className="atl-tool-panel__hint">{current.hint}</p>

      {/* 2. Galerie ou IA */}
      {!mode && (
        <div className="atl-choices">
          <button type="button" disabled={!variants.length} onClick={() => setMode("galerie")}>
            <b>Depuis la galerie</b>
            <small>{variants.length ? `${variants.length} modèle(s) tirés de vrais sites` : "Aucun modèle pour ce type pour l'instant"}</small>
          </button>
          <button type="button" onClick={() => setMode("ia")}>
            <b>Créer avec l'IA</b>
            <small>Quelques questions sur la section, puis Claude la conçoit (proche des codes des vrais sites).</small>
          </button>
        </div>
      )}

      {mode === "galerie" && (
        <ol className="atl-variants">
          {variants.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => insertSection(getPuck, s.id)} title="Ajouter à la page">
                <Thumb section={s} />
                <span>{nameOf(s, s.id)[1] ?? s.meta.label}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {mode === "ia" &&
        (state?.done ? (
          <div className="atl-done">
            <b>Demande enregistrée.</b>
            <span>Dis à Claude « traite les demandes » : la section sera conçue, ajoutée au catalogue et placée dans cette page.</span>
            <button type="button" className="atl-back" onClick={() => setState(null)}>
              Créer une autre section
            </button>
          </div>
        ) : (
          <form
            className="atl-ai-form"
            onSubmit={(e) => {
              e.preventDefault();
              askAI();
            }}
          >
            {questions.map((q) => (
              <label key={q.id}>
                <span>{q.label}</span>
                <textarea rows={2} value={answers[q.id] ?? ""} placeholder={q.ph} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              </label>
            ))}
            {state?.error && <span className="atl-topbar__error">{state.error}</span>}
            <button type="submit" className="atl-left__cta" disabled={state?.busy}>
              {state?.busy ? "Envoi…" : "Demander la section"}
            </button>
          </form>
        ))}
    </>
  );
}

// ---- Palette : design.md, palette d'un logo, ou palette au choix ----
function Swatches({ colors }) {
  return (
    <span className="atl-swatches">
      {colors.map((c, i) => (
        <span key={i} style={{ background: c }} title={c} />
      ))}
    </span>
  );
}
const mainColors = (d) => ["fond", "texte", "accent", "bouton", "fond-sombre", "surface"].map((r) => d.tokens.couleurs?.[r]).filter(Boolean);

function PaletteTool() {
  const getPuck = useGetPuck();
  const root = usePuckSelect((s) => s.appState.data.root?.props ?? {});
  const [mode, setMode] = useState(null); // "design" | "logo" | "palette"
  const [project, setProject] = useState(null);
  const [logo, setLogo] = useState(null);
  const [logoColors, setLogoColors] = useState([]);
  const [custom, setCustom] = useState(["#ffffff", "#1a1a1a", "#2f7d5b", "#f2efe8", "#0f2e22"]);
  const [level, setLevel] = useState(2); // intensité de la marque, 1 à 4
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!root.projet) return;
    fetch(`/api/projects/${root.projet}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setProject)
      .catch(() => {});
  }, [root.projet]);

  const currentDesign = designById[root.design];
  const polices = {
    titres: root.font_heading || currentDesign?.tokens.polices?.titres || "Inter",
    texte: root.font_body || currentDesign?.tokens.polices?.texte || "Inter",
  };
  const base = root.projet || pageName;

  // Enregistre la page, (crée le design.md), l'applique à toute la page, recharge.
  async function apply(design) {
    setState({ busy: true });
    try {
      const save = await fetch(`/api/pages/${pageName}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(getPuck().appState.data) });
      if (!save.ok) throw new Error((await save.json()).error);
      await applyDesignToPage(pageName, design);
      location.reload();
    } catch (e) {
      setState({ error: e.message });
    }
  }

  async function applyPalette(colors, origine, suffix) {
    let id = `${base}-${suffix}`;
    for (let n = 2; designById[id]; n++) id = `${base}-${suffix}-${n}`;
    const couleurs = brandRoles(colors, currentDesign?.tokens.couleurs ?? {}, level);
    const markdown = designMarkdown({ title: `${project?.nom ?? base} — palette ${suffix === "logo" ? "du logo" : "personnalisée"} (intensité ${level})`, origine: `${origine}, intensité ${level}/4`, polices, couleurs });
    // La page d'abord, le design.md ensuite : créer le fichier recharge
    // l'atelier, ce qui couperait l'application en cours.
    setState({ busy: true });
    try {
      const save = await fetch(`/api/pages/${pageName}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(getPuck().appState.data) });
      if (!save.ok) throw new Error((await save.json()).error);
      await applyDesignToPage(pageName, parseDesign(id, markdown));
      const res = await fetch(`/api/designs/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      setState({ error: e.message });
    }
  }

  async function onLogo(file) {
    if (!file) return;
    setState(null);
    const url = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(file);
    });
    setLogo(url);
    try {
      setLogoColors(await extractPalette(url));
    } catch (e) {
      setState({ error: e.message });
    }
    // Le logo et sa palette rejoignent la marque du projet.
    if (project) {
      try {
        const up = await fetch(`/api/medias/projet-${project.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, dataUrl: url }) });
        const { url: saved } = await up.json();
        const colors = await extractPalette(url);
        const marque = { ...(project.marque ?? {}), logos: [...new Set([...(project.marque?.logos ?? []), saved])], palette: colors };
        const next = { ...project, marque };
        await fetch(`/api/projects/${project.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
        setProject(next);
      } catch {
        // la palette s'applique quand même ; seule la sauvegarde dans le projet a échoué
      }
    }
  }

  if (state?.busy) return <p className="atl-tool-panel__hint">Application à toute la page…</p>;

  return (
    <>
      <p className="atl-tool-panel__hint">Ce que tu choisis s'applique à toute la page (couleurs et polices de toutes les sections). Une copie de sécurité est faite avant.</p>
      {state?.error && <p className="atl-topbar__error">{state.error}</p>}
      <div className="atl-choices">
        {[
          ["design", "1. Choisir un design.md", currentDesign ? `Actuel : ${currentDesign.id}.md` : "Les designs extraits des sites importés"],
          ["logo", "2. À partir du logo", "Je reprends les couleurs de ton logo"],
          ["palette", "3. Appliquer une palette", "Celle du logo, celle d'un design.md, ou une nouvelle"],
        ].map(([id, title, hint]) => (
          <button key={id} type="button" className={mode === id ? "is-on" : ""} onClick={() => setMode(mode === id ? null : id)}>
            <b>{title}</b>
            <small>{hint}</small>
          </button>
        ))}
      </div>

      {mode === "design" && (
        <ul className="atl-palettes">
          {designs.map((d) => (
            <li key={d.id} className={d.id === root.design ? "is-current" : ""}>
              <span>
                <b>{d.id}.md</b>
                <small>
                  {d.tokens.polices?.titres ?? "?"} · {d.tokens.polices?.texte ?? "?"}
                </small>
                <Swatches colors={mainColors(d)} />
              </span>
              <button type="button" disabled={d.id === root.design || !!d.error} onClick={() => apply(d)}>
                {d.id === root.design ? "Appliqué" : "Appliquer"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(mode === "logo" || mode === "palette") && (
        <div className="atl-intensity">
          <span>Intensité de la marque</span>
          <div className="atl-intensity__seg">
            {[
              [1, "Discrète"],
              [2, "Marquée"],
              [3, "Forte"],
              [4, "Totale"],
            ].map(([n, label]) => (
              <button key={n} type="button" className={level === n ? "is-on" : ""} onClick={() => setLevel(n)} title={label}>
                {n}
              </button>
            ))}
          </div>
          <small>
            {["", "Boutons et liens à tes couleurs.", "+ fonds de cartes et encadrés teintés.", "+ sections sombres à ta couleur.", "Toute la page : fonds et textes compris."][level]}
          </small>
        </div>
      )}

      {mode === "logo" && (
        <div className="atl-logo">
          <label className="atl-left__cta atl-left__cta--ghost">
            <input type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
            {logo ? "Choisir un autre logo" : "Choisir le logo"}
          </label>
          {logo && <img src={logo} alt="" />}
          {logoColors.length > 0 && (
            <>
              <Swatches colors={logoColors} />
              <button type="button" className="atl-left__cta" onClick={() => applyPalette(logoColors, "à partir du logo", "logo")}>
                Appliquer ces couleurs à la page
              </button>
              {project && <small className="atl-tool-panel__hint">Logo et palette ajoutés à la marque du projet.</small>}
            </>
          )}
        </div>
      )}

      {mode === "palette" && (
        <ul className="atl-palettes">
          {project?.marque?.palette?.length > 0 && (
            <li>
              <span>
                <b>Palette du logo</b>
                <small>Marque du projet {project.nom}</small>
                <Swatches colors={project.marque.palette} />
              </span>
              <button type="button" onClick={() => applyPalette(project.marque.palette, "à partir de la palette du logo", "logo")}>
                Appliquer
              </button>
            </li>
          )}
          {designs.map((d) => (
            <li key={d.id}>
              <span>
                <b>Palette de {d.id}.md</b>
                <small>Couleurs seulement, tes polices restent</small>
                <Swatches colors={mainColors(d)} />
              </span>
              <button type="button" onClick={() => applyPalette(mainColors(d), `à partir de la palette de ${d.id}.md`, "palette")}>
                Appliquer
              </button>
            </li>
          ))}
          <li className="atl-palettes__new">
            <span>
              <b>Nouvelle palette</b>
              <small>Fond, texte, accent, surface, fond sombre…</small>
              <span className="atl-custom">
                {custom.map((c, i) => (
                  <input key={i} type="color" value={c} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? e.target.value : x)))} />
                ))}
                <button type="button" title="Ajouter une couleur" onClick={() => setCustom([...custom, "#888888"])}>
                  +
                </button>
              </span>
            </span>
            <button type="button" onClick={() => applyPalette(custom, "à partir d'une nouvelle palette", "palette")}>
              Appliquer
            </button>
          </li>
        </ul>
      )}
    </>
  );
}

// ---- Régénérer : les textes ou les images ----
function RegenerateTool() {
  const open = (name) => window.dispatchEvent(new CustomEvent(name));
  return (
    <>
      <p className="atl-tool-panel__hint">Deux choix : refaire les textes de la page, ou refaire ses images avec ton produit.</p>
      <div className="atl-choices">
        <button type="button" onClick={() => open("atl-open-board")}>
          <b>Planche des images</b>
          <small>Toutes les images de la page côte à côte : en refaire une avec une consigne, ou en créer une pour une section.</small>
        </button>
        <button type="button" onClick={() => open("atl-open-rewrite")}>
          <b>Régénérer les textes</b>
          <small>Toutes les consignes entre crochets remplacées par de vrais textes, pour ton produit et ton client.</small>
        </button>
        <button type="button" onClick={() => open("atl-open-studio")}>
          <b>Régénérer les images</b>
          <small>Studio d'images : chaque photo d'origine refaite avec ton produit, ton logo et ta palette.</small>
        </button>
      </div>
    </>
  );
}

// ---- Rebrand : rechercher / remplacer ----
function RebrandTool() {
  return (
    <>
      <p className="atl-tool-panel__hint">Remplace un mot partout dans la page : la marque d'origine par la tienne, un nom de produit, un prix…</p>
      <div className="atl-choices">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("atl-open-rebrand"))}>
          <b>Rechercher et remplacer</b>
          <small>Ex. Aurivita → Clearflow. Ne touche que les textes lus par le client. Annulable avec ↶.</small>
        </button>
      </div>
    </>
  );
}
