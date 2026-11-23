import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { sections, sectionsIndex } from "./engine/sections.js";
import { FAMILIES, familyOf } from "./engine/families.js";
import { designs, designById } from "./engine/designs.js";
import { applyDesign, parseDesign } from "./engine/design.js";
import { normalizeProps } from "./engine/render.js";
import { brandRoles, contrastIssues, designMarkdown, extractPalette, shiftColor, varyPalette } from "./engine/palette.js";
import { applyCharte, measureIn, optionsFor, roleLabel } from "./engine/charte.js";
import { startTrial } from "./trial-ui.jsx";
import { FontPicker } from "./font-picker.jsx";
import { applyDesignToPage } from "./catalogue/Designs.jsx";
import { ROOT_ZONE, Thumb, insertSection, searchSections, scrollCanvasTo, usePuckSelect } from "./library-ui.jsx";
import { ScorePanel } from "./score-ui.jsx";
import { scorePage } from "./engine/page-score.js";
import { IconGauge, IconGrid, IconHistory, IconImage, IconList, IconPalette, IconPlusSquare, IconSettings, IconSparkles } from "./icons.jsx";
import { isAngleZone, pageRole, suggestAngleZones, zonesFromMother } from "./angle-zones.js";
import { getPage, listTemplates, templateScore } from "./projects.js";
import { ScreenshotDrop } from "./pages-ui.jsx";
import { pushRecent, toggleFavori, useGalleryPrefs } from "./gallery-prefs.js";

// Colonne de gauche : un rail d'icônes et l'outil choisi.
//   Structure · Ajouter une section · Palette · ✨ IA · Score

const pageName = new URLSearchParams(location.search).get("page");
const byId = sectionsIndex;
const visible = sections.filter((s) => s.meta.status !== "masquee" && !s.meta.pageSpecific);
const nameOf = (s, fallback) => (s?.meta.label ?? fallback).split(" — ");

const TOOLS = [
  // short : l'étiquette visible sous l'icône du rail (2026-11-10 : plus
  // d'icônes muettes qui ne se comprennent qu'au survol).
  { id: "structure", label: "Structure", short: "Structure", icon: IconList },
  { id: "ajouter", label: "Ajouter une section", short: "Ajouter", icon: IconPlusSquare },
  { id: "palette", label: "Palette", short: "Palette", icon: IconPalette },
  { id: "ia", label: "IA — toute la page", short: "IA", icon: IconSparkles },
  // Médias (2026-11-12, renommé le 2026-11-17) : Studio d'images, Canvas, vidéos.
  { id: "images", label: "Médias", short: "Médias", icon: IconImage },
  { id: "score", label: "Couverture de la structure conseillée", short: "Couverture", icon: IconGauge },
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
  // Couverture en direct sur le rail (2026-11-17) : le chiffre suit chaque
  // modification, sans ouvrir l'outil.
  const pageData = usePuckSelect((s) => s.appState.data);
  const coverage = useMemo(() => {
    try {
      const r = scorePage(pageData, sectionsIndex);
      return r.type ? r.score : null;
    } catch {
      return null;
    }
  }, [pageData]);
  return (
    <div className="atl-left">
      <nav className="atl-rail" aria-label="Outils">
        {TOOLS.map(({ id, label, short, icon: Icon }) => [
          id === "score" && (
            <a key="agents" href={`/agents.html${location.search}`} title="Agents army (fenêtre à part)" aria-label="Agents army">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
                <circle cx="17" cy="9" r="2.4" />
                <path d="M15.5 14.2c2.4-.3 4.4 1.2 5 4" />
              </svg>
              <span className="atl-rail__label" aria-hidden="true">Agents</span>
            </a>
          ),
          id === "score" && (
            <a key="catalogue" href={`/catalogue.html${location.search}#tout`} title="Catalogue" aria-label="Catalogue">
              <IconGrid />
              <span className="atl-rail__label" aria-hidden="true">Catalogue</span>
            </a>
          ),
          <button key={id} type="button" title={label} aria-label={label} aria-pressed={tool === id} className={tool === id ? "is-on" : ""} onClick={() => toggle(id)}>
            <Icon />
            <span className="atl-rail__label" aria-hidden="true">{short}</span>
            {id === "score" && coverage != null && (
              <em className={`atl-rail__badge ${coverage >= 80 ? "is-ok" : coverage >= 50 ? "is-mid" : "is-low"}`} title={`Couverture de la structure conseillée : ${coverage} / 100`}>
                {coverage}
              </em>
            )}
          </button>,
        ])}
        <button type="button" className="atl-rail__settings" title="Réglages de la page" aria-label="Réglages de la page" onClick={() => (setTool(null), window.dispatchEvent(new CustomEvent("atl-open-page-settings")))}>
          <IconSettings />
          <span className="atl-rail__label" aria-hidden="true">Réglages</span>
        </button>
        {/* En bas : l'historique de la page (le catalogue est sous Agents, 2026-11-22). */}
        <span className="atl-rail__sep" />
        <button type="button" title="Historique de la page" aria-label="Historique" onClick={() => window.dispatchEvent(new CustomEvent("atl-open-history"))}>
          <IconHistory />
          <span className="atl-rail__label" aria-hidden="true">Historique</span>
        </button>
      </nav>
      {tool && (
      <div className="atl-tool-panel">
        {tool !== "score" && (
          <div className="atl-tool-panel__head">
            {/* Plus de sur-titre « Outil » au-dessus du nom (audit design 2026-11-09). */}
            <b>{current.label}</b>
          </div>
        )}
        {tool === "structure" && <StructureTool onAdd={() => setTool("ajouter")} />}
        {tool === "ajouter" && <AddTool />}
        {tool === "palette" && <PaletteTool />}
        {tool === "ia" && <AiTool />}
        {tool === "images" && <ImagesTool />}
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
  const projet = usePuckSelect((s) => s.appState.data.root?.props?.projet ?? "");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(null);
  const [role, setRole] = useState(null);
  const listRef = useRef(null);

  // Rôle de la page (mère ou angle) : affiche le bandeau socle / zones d'angle.
  useEffect(() => {
    if (!projet) return setRole(null);
    pageRole(pageName, { projet }).then(setRole).catch(() => setRole(null));
  }, [projet]);
  const anyZone = content.some(isAngleZone);
  // Section zone d'angle (props.atl_zone = "angle") ou socle (réglage retiré).
  function setZones(ids) {
    content.forEach((item, index) => {
      const on = ids.has(item.props.id);
      if (on === isAngleZone(item)) return;
      const props = { ...item.props };
      if (on) props.atl_zone = "angle";
      else delete props.atl_zone;
      dispatch({ type: "replace", destinationIndex: index, destinationZone: ROOT_ZONE, data: { ...item, props } });
    });
  }
  const toggleZone = (item) => {
    const ids = new Set(content.filter(isAngleZone).map((it) => it.props.id));
    if (ids.has(item.props.id)) ids.delete(item.props.id);
    else ids.add(item.props.id);
    setZones(ids);
  };
  async function fromMother() {
    try {
      const mother = await getPage(role.motherName);
      const ids = zonesFromMother(content, mother.content ?? []);
      if (!ids.size) return alert("La page mère n'a pas encore de zones d'angle marquées.");
      setZones(ids);
    } catch (e) {
      alert(e.message);
    }
  }

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
      {(role?.role === "mere" || role?.role === "angle") && (
        <div className={`atl-zones atl-zones--${role.role}`}>
          {role.role === "mere" ? (
            <p>
              <b>★ Page mère.</b> Marque les <span className="atl-zone-tag is-angle">Angle</span> : les sections qui changent d'un angle à l'autre. Le reste est le <span className="atl-zone-tag">Socle</span>, commun à toutes les pages d'angle.
            </p>
          ) : (
            <p>
              <b>Page d'angle{role.angle ? ` « ${role.angle.titre} »` : ""}.</b> Ne retouche que les sections <span className="atl-zone-tag is-angle">Angle</span> ; le <span className="atl-zone-tag">Socle</span> vient de la page mère. ✨ IA → « Décliner pour cet angle ».
            </p>
          )}
          {role.role === "mere" && (
            <button type="button" onClick={() => (!anyZone || confirm("Remplacer les zones d'angle actuelles par la proposition ?")) && setZones(suggestAngleZones(content))}>
              Proposer les zones d'angle
            </button>
          )}
          {role.role === "angle" && !anyZone && role.motherName && (
            <button type="button" onClick={fromMother}>
              Reprendre les zones de la page mère
            </button>
          )}
        </div>
      )}
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
              className={`${id === selectedId ? "is-active" : ""}${drag === index ? " is-drag" : ""}${isAngleZone(item) ? " is-angle" : ""}`}
              draggable
              onDragStart={() => setDrag(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => (drag !== null ? move(drag, index, content[drag].props.id) : null, setDrag(null))}
              onDragEnd={() => setDrag(null)}
            >
              <span className="atl-structure__grip" aria-hidden="true">
                ⋮⋮
              </span>
              {/* Sans le nom du site d'origine (2026-11-16). */}
              <button type="button" className="atl-structure__name" onClick={() => select(index, id)} title={name}>
                <b>{name}</b>
              </button>
              <span className="atl-structure__tools">
                {role?.role && (
                  <button
                    type="button"
                    className={`atl-zone-tag${isAngleZone(item) ? " is-angle" : ""}`}
                    title={isAngleZone(item) ? "Zone d'angle : change d'un angle à l'autre. Clic : remettre dans le socle." : "Socle : commun à tous les angles. Clic : en faire une zone d'angle."}
                    onClick={() => toggleZone(item)}
                  >
                    {isAngleZone(item) ? "Angle" : "Socle"}
                  </button>
                )}
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
  const [peek, setPeek] = useState(null); // modèle survolé, montré en grand
  const [query, setQuery] = useState(""); // recherche dans toute la galerie (2026-11-16)
  const [answers, setAnswers] = useState({});
  const [state, setState] = useState(null);
  // D'où part l'IA (2026-11-09) : une description (questions), le lien d'un
  // site, ou des captures d'écran + une description.
  const [from, setFrom] = useState("description");
  const [link, setLink] = useState("");
  const [shots, setShots] = useState([]);
  // Galerie rangée par score de vente du template d'origine de chaque section
  // (même règle que le catalogue).
  const [tplScores, setTplScores] = useState([]);
  useEffect(() => {
    listTemplates()
      .then((t) => setTplScores(t.map((x) => [x.id, templateScore(x)]).sort((a, b) => b[0].length - a[0].length)))
      .catch(() => {});
  }, []);
  const grouped = useMemo(() => {
    const g = Object.fromEntries(FAMILIES.map((f) => [f.id, []]));
    for (const s of visible) (g[familyOf(s).id] ??= []).push(s);
    const score = (s) => tplScores.find(([id]) => s.id.startsWith(`${id}-`))?.[1] ?? -1;
    for (const list of Object.values(g)) list.sort((a, b) => score(b) - score(a));
    return g;
  }, [tplScores]);
  const current = FAMILIES.find((f) => f.id === family);
  const variants = family ? grouped[family] ?? [] : [];
  const questions = [...(AI_QUESTIONS[family] ?? GENERIC_Q), { id: "reference", label: "Une référence (URL ou description) — facultatif", ph: "https://… ou « comme la FAQ de tel site »" }];

  async function askAI() {
    const { appState, selectedItem, getSelectorForId } = getPuck();
    const sel = selectedItem ? getSelectorForId(selectedItem.props.id) : null;
    const after = sel ? appState.data.content[sel.index] : null;
    if (from === "lien" && !/^https?:\/\/\S+\.\S+/.test(link.trim())) return setState({ error: "Colle le lien de la page où se trouve la section (https://…)." });
    if (from === "capture" && !shots.length) return setState({ error: "Ajoute au moins une capture d'écran de la section." });
    const notes =
      from === "description"
        ? questions.map((q) => (answers[q.id] ? `${q.label} : ${answers[q.id]}` : null)).filter(Boolean).join("\n")
        : from === "lien"
          ? `Reproduire la section « ${current?.label ?? family} » de cette page : ${link.trim()}${answers.consigne ? `\nPrécisions : ${answers.consigne}` : ""}`
          : `Concevoir la section « ${current?.label ?? family} » d'après les captures jointes.${answers.consigne ? `\nDescription : ${answers.consigne}` : ""}`;
    setState({ busy: true });
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ia",
          family,
          page: pageName,
          url: from === "lien" ? link.trim() : undefined,
          images: from === "capture" ? shots : undefined,
          notes,
          details: { page: pageName, famille: family, source: from, lien: from === "lien" ? link.trim() : null, reponses: answers, apres: after ? after.props.id : null },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setState({ done: body.dossier });
      setAnswers({});
      setLink("");
      setShots([]);
    } catch (e) {
      setState({ error: e.message });
    }
  }

  // Favoris et récents (2026-11-17) : les mêmes que la galerie « + Section ».
  const prefs = useGalleryPrefs();
  const add = (id) => {
    pushRecent(id);
    insertSection(getPuck, id);
  };
  const railCard = (s, label) => (
    <li key={s.id} onMouseEnter={() => setPeek(s)} className="atl-railcard">
      <button type="button" onClick={() => add(s.id)} title="Ajouter à la page">
        <Thumb section={s} />
        <span>{label}</span>
      </button>
      <button
        type="button"
        className={`atl-railcard__fav${prefs.favoris.includes(s.id) ? " is-on" : ""}`}
        onClick={() => toggleFavori(s.id)}
        title={prefs.favoris.includes(s.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
        aria-label={prefs.favoris.includes(s.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
        aria-pressed={prefs.favoris.includes(s.id)}
      >
        {prefs.favoris.includes(s.id) ? "★" : "☆"}
      </button>
    </li>
  );
  const pickList = (ids) => ids.map((id) => sectionsIndex[id]).filter(Boolean);

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

  // Recherche dans toute la galerie, sans choisir de type d'abord.
  const searchBox = (
    <input className="atl-left__search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une section : faq, avis, nom d'un site…" aria-label="Chercher une section" />
  );
  const found = query.trim() ? searchSections(Object.values(grouped).flat(), query) : null;
  if (found) {
    return (
      <>
        {searchBox}
        <p className="atl-tool-panel__hint">
          {found.length ? `${found.length} section${found.length > 1 ? "s" : ""}. ` : "Aucune section ne correspond. "}
          {hasSelection ? "Ajoutée après la section sélectionnée." : "Ajoutée en fin de page."}
        </p>
        <ol className="atl-variants" onMouseLeave={() => setPeek(null)}>
          {found.slice(0, 80).map((s) => railCard(s, `${familyOf(s).label} · ${nameOf(s, s.id)[1] ?? s.meta.label}`))}
        </ol>
        {peek?.thumbnail &&
          createPortal(
            <div className="atl-peek" aria-hidden="true">
              <b>{nameOf(peek, peek.id)[1] ?? peek.meta.label}</b>
              <img src={peek.thumbnail} alt="" />
            </div>,
            document.body,
          )}
      </>
    );
  }

  // 1. Type de section
  if (!family) {
    return (
      <>
        {searchBox}
        {typeSelect}
        <p className="atl-tool-panel__hint">{hasSelection ? "Elle sera ajoutée après la section sélectionnée." : "Elle sera ajoutée en fin de page."}</p>
        {[
          ["★ Mes favoris", pickList(prefs.favoris)],
          ["Utilisées récemment", pickList(prefs.recents.filter((id) => !prefs.favoris.includes(id))).slice(0, 6)],
        ].map(
          ([title, list]) =>
            list.length > 0 && (
              <div key={title} className="atl-railstrip">
                <b>{title}</b>
                <ol className="atl-variants" onMouseLeave={() => setPeek(null)}>
                  {list.map((s) => railCard(s, `${familyOf(s).label} · ${nameOf(s, s.id)[1] ?? s.meta.label}`))}
                </ol>
              </div>
            ),
        )}
        {!prefs.favoris.length && <p className="atl-tool-panel__hint">Astuce : ☆ sur un modèle le garde dans « Mes favoris », ici et dans « + Section ».</p>}
        {peek?.thumbnail &&
          createPortal(
            <div className="atl-peek" aria-hidden="true">
              <b>{nameOf(peek, peek.id)[1] ?? peek.meta.label}</b>
              <img src={peek.thumbnail} alt="" />
            </div>,
            document.body,
          )}
      </>
    );
  }

  return (
    <>
      {searchBox}
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
        <ol className="atl-variants" onMouseLeave={() => setPeek(null)}>
          {[...variants].sort((a, b) => prefs.favoris.includes(b.id) - prefs.favoris.includes(a.id)).map((s) => railCard(s, nameOf(s, s.id)[1] ?? s.meta.label))}
        </ol>
      )}

      {/* Survol d'un modèle : la section en grand, à droite du panneau (comme Whitelabeler). */}
      {mode === "galerie" && peek?.thumbnail &&
        createPortal(
          <div className="atl-peek" aria-hidden="true">
            <b>{nameOf(peek, peek.id)[1] ?? peek.meta.label}</b>
            <img src={peek.thumbnail} alt="" />
          </div>,
          document.body,
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
            <div className="atl-ai-from" role="radiogroup" aria-label="L'IA part de">
              {[
                ["description", "Description"],
                ["lien", "Lien vers un site"],
                ["capture", "Capture + description"],
              ].map(([v, l]) => (
                <label key={v} className={from === v ? "is-on" : ""}>
                  <input type="radio" checked={from === v} onChange={() => (setFrom(v), setState(null))} /> {l}
                </label>
              ))}
            </div>
            {from === "description" &&
              questions.map((q) => (
                <label key={q.id}>
                  <span>{q.label}</span>
                  <textarea rows={2} value={answers[q.id] ?? ""} placeholder={q.ph} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                </label>
              ))}
            {from === "lien" && (
              <label>
                <span>Lien de la page où se trouve la section</span>
                <input type="url" value={link} placeholder="https://…" onChange={(e) => setLink(e.target.value)} />
              </label>
            )}
            {from === "capture" && (
              <div className="atl-ai-shots">
                <span>Capture(s) d'écran de la section</span>
                <ScreenshotDrop images={shots} onChange={setShots} hint="la section qui te plaît" />
              </div>
            )}
            {from !== "description" && (
              <label>
                <span>{from === "lien" ? "Quelle section, et ce qu'il faut changer (facultatif)" : "Description : ce que la section doit dire et faire"}</span>
                <textarea
                  rows={3}
                  value={answers.consigne ?? ""}
                  placeholder={from === "lien" ? "ex. la FAQ en bas de page, avec mes couleurs" : "ex. 3 avantages avec icône, titre court et une phrase, sur fond crème"}
                  onChange={(e) => setAnswers({ ...answers, consigne: e.target.value })}
                />
              </label>
            )}
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

async function savePageWith(before, page) {
  // Version d'avant l'essai d'abord, copie de sécurité, puis la nouvelle page.
  const save = await fetch(`/api/pages/${pageName}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(before) });
  if (!save.ok) throw new Error((await save.json()).error);
  await fetch(`/api/pages/${pageName}/snapshot`, { method: "POST" });
  const put = await fetch(`/api/pages/${pageName}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(page) });
  if (!put.ok) throw new Error((await put.json()).error);
}

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
  const setRoot = (patch) => {
    const { appState, dispatch } = getPuck();
    dispatch({ type: "replaceRoot", root: { ...appState.data.root, props: { ...appState.data.root.props, ...patch } } });
  };

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

  // ---- Portée d'un design.md (lot 2 « Charte complète », 2026-11-17) ----
  // Palette (couleurs seules) · Couleurs et polices · Charte complète (cases).
  const [portee, setPortee] = useState("complete");
  const [cases, setCases] = useState({ couleurs: true, typo: false, boutons: true, formes: true, proportions: true });
  const [effacer, setEffacer] = useState(false);
  const toggleCase = (k) => setCases((c) => ({ ...c, [k]: !c[k] }));
  // over (lot 4) : portée, options et version imposées (charte du projet,
  // révision) ; sinon les choix du panneau.
  async function applyScoped(design, over = null) {
    const P = over?.portee ?? portee;
    const E = over?.effacer ?? effacer;
    const opts = over?.opts ?? optionsFor(P, cases);
    const data = getPuck().appState.data;
    const doc = [...document.querySelectorAll("iframe")].find((f) => f.contentDocument?.querySelector("[data-atl-id]"))?.contentDocument;
    const before = data.root?.props ?? {};
    let page = { ...data, content: (data.content ?? []).map((it) => (byId[it.type] ? { ...it, props: normalizeProps(byId[it.type], it.props) } : it)) };
    if (opts.couleurs) page = applyDesign(page, design, byId, currentDesign ?? null).page;
    const pol = design.tokens?.polices ?? {};
    const rootProps = { ...page.root.props };
    if (opts.familles) {
      if (pol.titres) rootProps.font_heading = pol.titres;
      if (pol.texte) rootProps.font_body = pol.texte;
    } else {
      rootProps.font_heading = before.font_heading ?? "";
      rootProps.font_body = before.font_body ?? "";
    }
    page = { ...page, root: { ...page.root, props: rootProps } };
    let total = {};
    if (P === "palette") page = withCharte(page, design);
    if (P !== "palette") {
      const r = applyCharte(page, design, opts, byId, (sid) => measureIn(doc, sid), { effacer: E });
      page = r.page;
      total = r.total;
      page.root.props.charte = { design: design.id, portee: P, ...opts, date: new Date().toISOString(), ...(over?.version ? { version: over.version } : {}) };
    }
    // Bilan avant d'écrire.
    const parts = Object.entries(total).filter(([k]) => k !== "espacement").map(([k, n]) => `${k === "carte" ? "Cartes" : roleLabel(k)} : ${n}`);
    const lignes = [
      `${over?.version ? `Charte du projet, version ${over.version} : ` : ""}${P === "palette" ? "Palette" : P === "polices" ? "Couleurs et polices" : "Charte complète"} de ${design.id}.md`,
      "",
      opts.couleurs ? "• Couleurs des sections : changées." : "• Couleurs : gardées.",
      opts.familles ? `• Polices : ${pol.titres ?? "?"} (titres), ${pol.texte ?? "?"} (texte).` : "• Polices : gardées.",
      P === "complete" ? `• Tailles des textes : ${opts.typo && !opts.proportions ? "celles de la charte (ordinateur et téléphone)" : "gardées (proportions de la page)"}.` : null,
      parts.length ? `• Éléments qui suivent la charte : ${parts.join(", ")}.` : P !== "palette" ? "• Aucun élément reconnu (sections du catalogue : couleurs et polices seulement)." : null,
      opts.espacements ? `• Espacements (${{ serre: "serré", moyen: "moyen", aere: "aéré" }[opts.espacements]}) : ${total.espacement ? `${total.espacement} section(s) trop serrée(s) complétée(s) sur ordinateur` : "aucune section trop serrée"} ; les sections plus aérées sont gardées, le téléphone n'est pas touché.` : null,
      P !== "palette" ? (E ? "• Tes retouches de style sur ces éléments sont effacées." : "• Tes retouches de style sont gardées (elles passent devant la charte).") : null,
      "",
      "Une copie de sécurité est faite avant (Historique pour revenir). Appliquer ?",
    ].filter((l) => l != null);
    // Essai contrôlé (lot 3) : la page change à l'écran, rien n'est écrit
    // avant « Appliquer ». Bilan : ce qui change, retouches gardées, contrastes.
    let gardees = 0;
    if (!E) for (const it of page.content ?? []) for (const k of Object.keys(it.props?.atl_charte ?? {})) if (it.props?.atl_styles?.[k]) gardees++;
    const warn = opts.couleurs ? contrastIssues(design.tokens?.couleurs ?? {}).map((i) => `⚠ Contraste faible : ${i.label} ${i.ratio}:1 (il faut 4,5:1).`) : [];
    startTrial({
      title: lignes[0],
      lines: [...lignes.filter((l) => l.startsWith("•")), ...(gardees ? [`• ${gardees} élément(s) gardent ta retouche par-dessus la charte.`] : []), ...warn],
      page,
      apply: async ({ page: pg, before: prev }) => {
        await savePageWith(prev, pg);
        await fetch("/api/designs/recents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: design.id }) }).catch(() => {});
        return {};
      },
    });
  }

  // Variantes (lot 4, 2026-11-17) : une nouvelle palette garde la typographie
  // et les boutons de la charte de la page ; seules les couleurs changent.
  function withCharte(page, colorDesign) {
    const ch = page.root?.props?.charte;
    const base = ch && designById[ch.design];
    if (!base) return page;
    const doc = [...document.querySelectorAll("iframe")].find((fr) => fr.contentDocument?.querySelector("[data-atl-id]"))?.contentDocument;
    const d = { ...base, tokens: { ...base.tokens, couleurs: colorDesign?.tokens?.couleurs ?? base.tokens.couleurs } };
    return applyCharte(page, d, ch, byId, (sid) => measureIn(doc, sid)).page;
  }

  // ---- Charte du projet (lot 4 « Réutilisation », 2026-11-17) ----
  // project.charte = { design, portee, couleurs, familles, typo, boutons,
  // formes, proportions, version, date, historique: [versions précédentes] }.
  const projCharte = project?.charte ?? null;
  const pageCharte = root.charte ?? null;
  const PORTEES = { palette: "Palette", polices: "Couleurs et polices", complete: "Charte complète" };
  async function saveProjectCharte() {
    if (!project || !pageCharte) return;
    try {
      const fresh = await fetch(`/api/projects/${encodeURIComponent(project.id)}`).then((r) => r.json());
      const old = fresh.charte ?? null;
      const { historique: _h, ...oldSansHisto } = old ?? {};
      const next = {
        ...pageCharte,
        version: (old?.version ?? 0) + 1,
        date: new Date().toISOString(),
        historique: [...(old ? [oldSansHisto] : []), ...(old?.historique ?? [])].slice(0, 10),
      };
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fresh, charte: next }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setProject({ ...fresh, charte: next });
      setRoot({ charte: { ...pageCharte, version: next.version } });
      setState({ ok: `Charte du projet enregistrée (version ${next.version}). Les autres pages du projet la proposeront.` });
    } catch (e) {
      setState({ error: e.message });
    }
  }
  function applyCharteVersion(c) {
    const d = designById[c.design];
    if (!d) return setState({ error: `Le design ${c.design}.md n'existe plus dans le catalogue.` });
    applyScoped(d, { portee: c.portee ?? "complete", opts: { couleurs: c.couleurs !== false, familles: Boolean(c.familles), typo: Boolean(c.typo), boutons: Boolean(c.boutons), formes: Boolean(c.formes), proportions: c.proportions !== false, espacements: c.espacements ?? null }, effacer: false, version: c.version });
  }
  // Ouverture demandée par le bandeau « charte du projet » (charte-keeper.jsx).
  useEffect(() => {
    const on = () => projCharte && applyCharteVersion(projCharte);
    window.addEventListener("atl-apply-project-charte", on);
    return () => window.removeEventListener("atl-apply-project-charte", on);
  });

  async function applyPalette(colors, origine, suffix) {
    let id = `${base}-${suffix}`;
    for (let n = 2; designById[id]; n++) id = `${base}-${suffix}-${n}`;
    const couleurs = brandRoles(colors, currentDesign?.tokens.couleurs ?? {}, level);
    // Contraste réel avant d'appliquer (2026-11-16) : sous 4,5:1 le texte se lit mal.
    const issues = contrastIssues(couleurs);
    // Mode Palette = couleurs seulement : polices et styles du design actuel gardés.
    const markdown = designMarkdown({ title: `${project?.nom ?? base} — palette ${suffix === "logo" ? "du logo" : "personnalisée"} (intensité ${level})`, origine: `${origine}, intensité ${level}/4`, polices, couleurs, styles: currentDesign?.tokens.styles });
    // Essai contrôlé (lot 3) : la palette s'affiche sur la page, rien n'est
    // écrit avant « Appliquer ». Puis la page d'abord, le design.md ensuite :
    // créer le fichier recharge l'atelier.
    const design = parseDesign(id, markdown);
    const data = getPuck().appState.data;
    let page = { ...data, content: (data.content ?? []).map((it) => (byId[it.type] ? { ...it, props: normalizeProps(byId[it.type], it.props) } : it)) };
    page = applyDesign(page, design, byId, currentDesign ?? null).page;
    page = { ...page, root: { ...page.root, props: { ...page.root.props, font_heading: data.root?.props?.font_heading ?? "", font_body: data.root?.props?.font_body ?? "" } } };
    page = withCharte(page, design);
    startTrial({
      title: `Palette ${suffix === "logo" ? "du logo" : "personnalisée"}, intensité ${["", "Discrète", "Marquée", "Forte", "Totale"][level]}`,
      lines: ["• Couleurs des sections : changées.", "• Polices, tailles et formes : gardées.", ...issues.map((i) => `⚠ Contraste faible : ${i.label} ${i.ratio}:1 (il faut 4,5:1).`)],
      page,
      apply: async ({ page: pg, before: prev }) => {
        await savePageWith(prev, pg);
        const res = await fetch(`/api/designs/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown }) });
        if (!res.ok) throw new Error((await res.json()).error);
        await fetch("/api/designs/recents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
        return { reload: true, delay: 1500 };
      },
    });
  }

  // ---- Varier les couleurs (2026-11-17) ----
  // Deux curseurs : la teinte tourne, puis plus clair / plus sombre. La page
  // change en direct (sans rechargement) à partir de son état au premier
  // mouvement ; « Garder » crée un design.md de la variation, « Revenir » ou
  // Ctrl+Z remet les couleurs d'avant.
  const [hue, setHue] = useState(0);
  const [light, setLight] = useState(0);
  const varyStart = useRef(null);
  const varyFrame = useRef(0);
  const varyColors = currentDesign?.tokens?.couleurs;
  const canVary = !!varyColors && Object.keys(varyColors).length > 0;
  // Piste du curseur : la couleur principale de la page sur tout le tour.
  const varyMain = [varyColors?.bouton, varyColors?.accent, varyColors?.["fond-sombre"]].find((c) => c && shiftColor(c, 90) !== c);
  const hueTrack = varyMain ? { background: `linear-gradient(90deg, ${[-180, -120, -60, 0, 60, 120, 180].map((d) => shiftColor(varyMain, d, light)).join(", ")})` } : undefined;
  function vary(h, l) {
    setHue(h);
    setLight(l);
    clearTimeout(varyFrame.current);
    varyFrame.current = setTimeout(() => {
      const { appState, dispatch } = getPuck();
      if (!varyStart.current) varyStart.current = appState.data;
      const start = varyStart.current;
      if (!h && !l) return dispatch({ type: "setData", data: start, recordHistory: false });
      const page = { ...start, content: (start.content ?? []).map((it) => (byId[it.type] ? { ...it, props: normalizeProps(byId[it.type], it.props) } : it)) };
      const shifted = { ...currentDesign, tokens: { ...currentDesign.tokens, couleurs: varyPalette(varyColors, h, l) } };
      dispatch({ type: "setData", data: withCharte(applyDesign(page, shifted, byId, currentDesign).page, shifted), recordHistory: false });
    }, 30);
  }
  function varyBack() {
    clearTimeout(varyFrame.current);
    if (varyStart.current) getPuck().dispatch({ type: "setData", data: varyStart.current, recordHistory: false });
    varyStart.current = null;
    setHue(0);
    setLight(0);
  }
  // Curseur relâché : une étape dans l'historique (Ctrl+Z revient avant).
  function varyCommit() {
    if (!varyStart.current) return;
    setTimeout(() => {
      const { appState, dispatch } = getPuck();
      dispatch({ type: "setData", data: appState.data, recordHistory: true });
    }, 60);
  }
  async function varyKeep() {
    const couleurs = varyPalette(varyColors, hue, light);
    const issues = contrastIssues(couleurs);
    const lignes = issues.map((i) => `• ${i.label} : ${i.ratio}:1 (il faut 4,5:1)`).join("\n");
    if (issues.length && !confirm(`Contraste faible avec ces couleurs :\n\n${lignes}\n\nGarder quand même ?`)) return;
    let id = `${base}-variation`;
    for (let n = 2; designById[id]; n++) id = `${base}-variation-${n}`;
    const reglage = `teinte ${hue > 0 ? "+" : ""}${hue}°, ${light > 0 ? "plus clair" : light < 0 ? "plus sombre" : "même clarté"} ${light ? Math.abs(light) : ""}`.trim();
    const markdown = designMarkdown({ title: `${project?.nom ?? base} — variation de ${currentDesign.id} (${reglage})`, origine: `en variant ${currentDesign.id}.md (${reglage})`, polices, couleurs, styles: currentDesign.tokens.styles });
    setState({ busy: true });
    try {
      // Copie de sécurité = la page enregistrée avant la variation.
      await fetch(`/api/pages/${pageName}/snapshot`, { method: "POST" });
      const data = getPuck().appState.data;
      const page = { ...data, root: { ...data.root, props: { ...data.root.props, design: id } } };
      const save = await fetch(`/api/pages/${pageName}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(page) });
      if (!save.ok) throw new Error((await save.json()).error);
      // Le design.md en dernier : sa création recharge l'atelier.
      const res = await fetch(`/api/designs/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markdown }) });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetch("/api/designs/recents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
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
      {root.projet && (
        <div className="atl-projcharte">
          <span className="atl-projcharte__title">Charte du projet</span>
          {projCharte ? (
            <small>
              Version {projCharte.version} · {projCharte.design}.md · {PORTEES[projCharte.portee] ?? projCharte.portee} · {new Date(projCharte.date).toLocaleDateString("fr-CA", { dateStyle: "medium" })}
            </small>
          ) : (
            <small>Pas encore de charte : applique un design.md à cette page (de préférence « Charte complète »), puis enregistre-la ici pour tout le projet.</small>
          )}
          {projCharte && pageCharte?.version !== projCharte.version && <small className="is-warn">Cette page n'a pas la version {projCharte.version}.</small>}
          {projCharte && pageCharte?.version === projCharte.version && <small className="is-ok">✓ Cette page suit la version {projCharte.version}.</small>}
          <div className="atl-projcharte__actions">
            {pageCharte && (!projCharte || pageCharte.version !== projCharte.version) && (
              <button type="button" className="atl-left__cta atl-left__cta--ghost" onClick={saveProjectCharte}>
                Enregistrer la charte de cette page pour le projet{projCharte ? ` (version ${projCharte.version + 1})` : ""}
              </button>
            )}
            {projCharte && pageCharte?.version !== projCharte.version && (
              <button type="button" className="atl-left__cta" onClick={() => applyCharteVersion(projCharte)}>
                Essayer la version {projCharte.version} sur cette page
              </button>
            )}
          </div>
          {projCharte?.historique?.length > 0 && (
            <details className="atl-projcharte__histo">
              <summary>Versions précédentes ({projCharte.historique.length})</summary>
              <ul>
                {projCharte.historique.map((h, i) => (
                  <li key={i}>
                    <span>
                      v{h.version ?? "?"} · {h.design}.md · {h.date ? new Date(h.date).toLocaleDateString("fr-CA", { dateStyle: "medium" }) : ""}
                    </span>
                    <button type="button" onClick={() => applyCharteVersion(h)}>
                      Essayer
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {state?.ok && <p className="atl-topbar__ok">{state.ok}</p>}

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

      {/* Varier les couleurs (2026-11-17) : la page change en direct. */}
      <div className="atl-vary">
        <span className="atl-vary__title">Varier les couleurs</span>
        {canVary ? (
          <>
            <label>
              <span>
                Teinte <b>{hue > 0 ? "+" : ""}{hue}°</b>
              </span>
              <input type="range" className="atl-vary__hue" style={hueTrack} min="-180" max="180" step="5" value={hue} onChange={(e) => vary(Number(e.target.value), light)} onPointerUp={varyCommit} onKeyUp={varyCommit} aria-label="Teinte des couleurs" />
            </label>
            <label>
              <span>
                Plus sombre · plus clair <b>{light > 0 ? "+" : ""}{light}</b>
              </span>
              <input type="range" className="atl-vary__light" min="-30" max="30" step="2" value={light} onChange={(e) => vary(hue, Number(e.target.value))} onPointerUp={varyCommit} onKeyUp={varyCommit} aria-label="Plus clair ou plus sombre" />
            </label>
            <Swatches colors={[...new Set(Object.values(varyPalette(varyColors, hue, light)).filter((c) => /^#/.test(String(c))))].slice(0, 8)} />
            {(hue !== 0 || light !== 0) && (
              <div className="atl-vary__actions">
                <button type="button" className="atl-left__cta" onClick={varyKeep}>
                  Garder ces couleurs
                </button>
                <button type="button" className="atl-left__cta atl-left__cta--ghost" onClick={varyBack}>
                  Revenir
                </button>
              </div>
            )}
            <small>La page change tout de suite (blancs, noirs et gris ne bougent pas). « Garder » enregistre ces couleurs comme un nouveau design.md ; « Revenir » ou Ctrl+Z remet celles d'avant.</small>
          </>
        ) : (
          <small>Applique d'abord un design.md ou une palette (ci-dessous) : les curseurs font varier ses couleurs.</small>
        )}
      </div>

      {mode === "design" && (
        <>
        <div className="atl-portee">
          <span className="atl-portee__title">Ce que le design change</span>
          <div className="atl-portee__seg" role="radiogroup" aria-label="Portée">
            {[
              ["palette", "Palette"],
              ["polices", "Couleurs et polices"],
              ["complete", "Charte complète"],
            ].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={portee === id} className={portee === id ? "is-on" : ""} onClick={() => setPortee(id)}>
                {label}
              </button>
            ))}
          </div>
          <small>
            {portee === "palette"
              ? "Les couleurs seulement : polices, tailles et formes restent."
              : portee === "polices"
                ? "Couleurs et familles de police (titres, texte) : tailles et formes restent."
                : "Coche ce qui doit suivre le design. Contenus, images et ordre des sections ne bougent pas."}
          </small>
          {portee === "complete" && (
            <div className="atl-portee__cases">
              {[
                ["couleurs", "Couleurs"],
                ["typo", "Typographie (polices, graisse, interligne, casse)"],
                ["boutons", "Boutons (forme, taille, couleurs)"],
                ["formes", "Cartes et formes (arrondis)"],
              ].map(([k, label]) => (
                <label key={k}>
                  <input type="checkbox" checked={Boolean(cases[k])} onChange={() => toggleCase(k)} /> {label}
                </label>
              ))}
              {cases.typo && (
                <label className="is-sub">
                  <input type="checkbox" checked={Boolean(cases.proportions)} onChange={() => toggleCase("proportions")} /> Garder les tailles de la page (sinon : tailles de la charte, ordinateur et téléphone)
                </label>
              )}
              <label title="Complète le vide en haut et en bas des sections trop serrées (sections copiées, vue ordinateur) ; ne réduit jamais une section aérée.">
                <input type="checkbox" checked={Boolean(cases.espacements)} onChange={() => toggleCase("espacements")} /> Espacements réguliers entre les sections
              </label>
              {cases.espacements && (
                <div className="atl-portee__rythme" role="radiogroup" aria-label="Espace en haut et en bas des sections">
                  {[
                    ["serre", "Serré (40 px)"],
                    ["moyen", "Moyen (64 px)"],
                    ["aere", "Aéré (96 px)"],
                  ].map(([id, label]) => (
                    <label key={id}>
                      <input type="radio" name="atl-rythme" checked={(cases.rythme || "moyen") === id} onChange={() => setCases((c) => ({ ...c, rythme: id }))} /> {label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {portee !== "palette" && (
            <label className="atl-portee__reset">
              <input type="checkbox" checked={effacer} onChange={() => setEffacer((v) => !v)} /> Effacer mes retouches de style sur les éléments touchés
            </label>
          )}
        </div>
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
              <button type="button" disabled={!!d.error} onClick={() => applyScoped(d)}>
                {d.id === root.design ? "Réappliquer" : "Appliquer"}
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      {(mode === "logo" || mode === "palette") && (
        <div className="atl-intensity">
          <span>
            Intensité de la marque : <b>{["", "Discrète", "Marquée", "Forte", "Totale"][level]}</b>
          </span>
          {/* Curseur nommé (2026-11-16) : Discrète → Totale. */}
          <input type="range" className="atl-intensity__range" min="1" max="4" step="1" value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Intensité de la marque" aria-valuetext={["", "Discrète", "Marquée", "Forte", "Totale"][level]} />
          <div className="atl-intensity__names" aria-hidden="true">
            {["Discrète", "Marquée", "Forte", "Totale"].map((n, i) => (
              <span key={n} className={level === i + 1 ? "is-on" : ""} onClick={() => setLevel(i + 1)}>
                {n}
              </span>
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
      {/* Polices et fond de la page (venus des Réglages le 2026-11-13). */}
      <p className="atl-tool-panel__group">Polices et fond de la page</p>
      <div className="atl-pagefonts">
        {/* Sélecteur avec aperçu (2026-11-17) au lieu d'un nom à taper. */}
        <FontPicker label="Police des titres" value={root.font_heading ?? ""} designFont={currentDesign?.tokens.polices?.titres ?? ""} onChange={(v) => setRoot({ font_heading: v })} />
        <FontPicker label="Police du texte" value={root.font_body ?? ""} designFont={currentDesign?.tokens.polices?.texte ?? ""} onChange={(v) => setRoot({ font_body: v })} />
        <label className="is-row">
          <span>Fond de la page (derrière les sections)</span>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(root.fond_page ?? "") ? root.fond_page : "#ffffff"} onChange={(e) => setRoot({ fond_page: e.target.value })} />
          {root.fond_page && (
            <button type="button" onClick={() => setRoot({ fond_page: "" })}>
              Retirer
            </button>
          )}
        </label>
        <small className="atl-tool-panel__hint">Polices Google Fonts. « Celle du design » : la police du design.md de la page. Dans une section copiée, le panneau de style (Police) choisit « police des titres » ou « police du texte ».</small>
      </div>
    </>
  );
}

// ---- Images : Studio d'images, Canvas (Planche des images retirée le 2026-11-12) ----
function ImagesTool() {
  const open = (name) => window.dispatchEvent(new CustomEvent(name));
  const item = (title, hint, onClick) => (
    <button type="button" onClick={onClick}>
      <b>{title}</b>
      <small>{hint}</small>
    </button>
  );
  return (
    <>
      <p className="atl-tool-panel__hint">Les images et vidéos de la page et du projet. Tout ce que tu crées est rangé dans les médias du projet (catalogue → projet → Médias).</p>
      <div className="atl-choices">
        {item("Studio d'images", "Comme « Image Mirror » de Whitelabeler : chaque photo d'origine de la page refaite avec ton produit et ta marque, puis installée dans la page ou envoyée dans le Canvas.", () => open("atl-open-studio"))}
        {item("Canvas", "Le grand tableau du projet : toutes tes images, créer une image à partir de références, Section images, retirer un fond, exporter vers une page.", () => open("atl-open-canvas"))}
        {item("Vidéos", "Ajoute une vidéo au tableau du projet (Canvas → menu ☰ → « Ajouter une vidéo ») ; elle est rangée avec les médias du projet. Pour la page : choisis un emplacement vidéo et colle son lien.", () => open("atl-open-canvas"))}
      </div>
    </>
  );
}

// ---- ✨ IA : les outils qui changent TOUTE la page ----
// (une section ou un élément : clic droit → Retravailler avec l'IA.)
function AiTool() {
  const open = (name, detail) => window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
  const item = (title, hint, onClick) => (
    <button type="button" onClick={onClick}>
      <b>{title}</b>
      <small>{hint}</small>
    </button>
  );
  return (
    <>
      <p className="atl-tool-panel__hint">
        Pour toute la page. Une section ou un élément : clic droit dessus → « Retravailler avec l'IA ». Les outils se servent de la fiche « Ma marque et mon produit ».
      </p>
      <p className="atl-tool-panel__group">Analyse</p>
      <div className="atl-choices">
        {item("Auditer la page", "La grille de la méthode : 5 croyances, 5 premières secondes, confiance, bloc d'achat. Gains rapides et textes prêts à coller.", () => open("atl-ai-page", "auditer"))}
      </div>
      <p className="atl-tool-panel__group">Angle</p>
      <div className="atl-choices">
        {item("Décliner pour cet angle", "Page d'angle : réécrit seulement les zones d'angle (hero, ouverture, problème, bénéfices, avis, boutons) pour son avatar et sa promesse. Le socle ne bouge pas.", () => open("atl-ai-page", "decliner"))}
      </div>
      <p className="atl-tool-panel__group">Textes</p>
      <div className="atl-choices">
        {item("Remplir depuis les Fondations", "Chaque section reçoit le contenu préparé dans les Fondations du projet pour ce type de page (partie 9). Une section ou toute la page.", () => open("atl-ai-page", "fondations"))}
        {item("Réécrire pour mon produit", "Tous les textes, consignes entre crochets comprises, pour ta marque et ton produit.", () => open("atl-ai-page", "reecrire"))}
      </div>
      <p className="atl-tool-panel__group">Style</p>
      <div className="atl-choices">
        {item("Adapter toute la page à son style", "Chaque section redessinée avec la palette, les polices et les boutons de la page.", () => open("atl-ai-page", "adapter"))}
      </div>
      <button type="button" className="atl-tool-panel__link" onClick={() => open("atl-open-page-settings")}>
        ⚙ Ma marque et mon produit
      </button>
    </>
  );
}
