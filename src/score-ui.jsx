import { useState } from "react";
import { useGetPuck } from "@puckeditor/core";
import { sections } from "./engine/sections.js";
import { scorePage, ruleLabel } from "./engine/page-score.js";
import { PAGE_TYPES } from "./engine/page-types.js";
import { familyOf } from "./engine/families.js";
import { ROOT_ZONE, Thumb, scrollCanvasTo, usePuckSelect } from "./library-ui.jsx";
import { adaptInstructionFor, rebuildSectionWith, savePageWith } from "./inspector-ui.jsx";

const sectionsById = Object.fromEntries(sections.map((s) => [s.id, s]));
const visible = sections.filter((s) => s.meta.status !== "masquee" && !s.meta.pageSpecific);
const variantsFor = (families) => visible.filter((s) => families.includes(familyOf(s).id));

// Insère une section à un endroit précis, la sélectionne et la montre.
function insertAt(getPuck, type, index) {
  const { dispatch } = getPuck();
  dispatch({ type: "insert", componentType: type, destinationIndex: index, destinationZone: ROOT_ZONE });
  dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
  setTimeout(() => {
    const added = getPuck().appState.data.content[index];
    if (added) scrollCanvasTo(added.props.id);
  }, 150);
}

function Ring({ score }) {
  const color = score >= 90 ? "#2f9e44" : score >= 75 ? "#5b7cff" : score >= 50 ? "#e8890c" : "#d6336c";
  return (
    <span className="atl-score__ring" style={{ background: `conic-gradient(${color} ${score * 3.6}deg, #ececec 0)` }}>
      <span>{score}</span>
    </span>
  );
}

// Aucun type défini : on le choisit ici (même question que « Nouvelle page »).
function ChooseType() {
  const getPuck = useGetPuck();
  function choose(id) {
    const { appState, dispatch } = getPuck();
    dispatch({ type: "replaceRoot", root: { ...appState.data.root, props: { ...appState.data.root.props, pageType: id } } });
  }
  return (
    <div className="atl-score__choose">
      <p>
        Pour noter la page, dis d'abord de quel type elle est. <b>Les gens achètent-ils sur cette page ?</b>
      </p>
      {[true, false].map((achat) => (
        <div key={String(achat)}>
          <h4>{achat ? "Oui, on achète ici" : "Non, on achète ailleurs"}</h4>
          {PAGE_TYPES.filter((t) => t.achat === achat).map((t) => (
            <button type="button" key={t.id} onClick={() => choose(t.id)}>
              <b>{t.label}</b>
              <small>{t.hint}</small>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function Recommendation({ item, onAdd }) {
  const [open, setOpen] = useState(false);
  const variants = item.rule.families ? variantsFor(item.rule.families) : [];
  const shown = open ? variants : variants.slice(0, 1);
  return (
    <li className="atl-score__item">
      <div className="atl-score__item-head">
        <strong>{ruleLabel(item.rule)}</strong>
        <em>+{item.gain}</em>
      </div>
      <p>{item.rule.why}</p>
      {item.rule.check === "pageAchat" ? (
        <p className="atl-score__where">À régler dans les réglages de la page : clique dans le vide de l'aperçu, panneau de droite.</p>
      ) : variants.length === 0 ? (
        <p className="atl-score__where">
          Aucun modèle de cette famille dans le catalogue.{" "}
          <a href="/catalogue.html#enrichir" target="_blank" rel="noreferrer">
            En ajouter un ↗
          </a>
        </p>
      ) : (
        <>
          <p className="atl-score__where">À placer {item.where}</p>
          <div className="atl-score__variants">
            {shown.map((s) => (
              <button type="button" key={s.id} onClick={() => onAdd(s.id, item.index)} title={`Ajouter « ${s.meta.label} »`}>
                <Thumb section={s} />
                <span>{s.meta.label?.split(" — ")[1] ?? s.meta.label}</span>
              </button>
            ))}
          </div>
          {variants.length > 1 && (
            <button type="button" className="atl-score__more" onClick={() => setOpen(!open)}>
              {open ? "Moins de modèles" : `Voir les ${variants.length} modèles`}
            </button>
          )}
        </>
      )}
    </li>
  );
}

export function ScorePanel() {
  const getPuck = useGetPuck();
  const data = usePuckSelect((s) => s.appState.data);
  const result = scorePage(data, sectionsById);
  const [showPresent, setShowPresent] = useState(false);

  // Ajoute un modèle pour chaque famille manquante qui en a un, une à une,
  // en recalculant l'emplacement après chaque ajout.
  const [ai, setAi] = useState(null);

  // Comme Whitelabeler (« Build all recommended ») : les sections ajoutées sont
  // aussitôt redessinées par l'IA au style de la page, textes écrits pour le
  // produit de la page. Une seule sauvegarde et un rechargement à la fin.
  async function addAllWithAi() {
    const before = new Set(getPuck().appState.data.content.map((c) => c.props.id));
    addAll();
    await new Promise((r) => setTimeout(r, 1500));
    const data = getPuck().appState.data;
    const added = data.content.filter((c) => !before.has(c.props.id)).map((c) => c.props.id);
    const produit = data.root?.props?.produit || null;
    const replacements = [];
    try {
      for (const [i, id] of added.entries()) {
        setAi({ step: `Section ${i + 1} / ${added.length} : l'IA l'adapte à la page${produit ? " et à ton produit" : ""}…` });
        scrollCanvasTo(id);
        await new Promise((r) => setTimeout(r, 600));
        replacements.push(await rebuildSectionWith(getPuck, id, adaptInstructionFor(getPuck().appState.data, id, { produit }), null, { reload: false }));
      }
      setAi({ step: "Enregistrement…" });
      await savePageWith(getPuck, replacements);
      location.reload();
    } catch (e) {
      // Les sections déjà refaites sont gardées.
      if (replacements.length) await savePageWith(getPuck, replacements).catch(() => {});
      setAi({ error: `${e.message} (${replacements.length} / ${added.length} adaptées, les sections ajoutées restent telles quelles)` });
    }
  }

  function addAll() {
    const done = new Set();
    for (;;) {
      const next = scorePage(getPuck().appState.data, sectionsById).missing.find(
        (m) => m.rule.families && !done.has(m.rule) && variantsFor(m.rule.families).length > 0,
      );
      if (!next) break;
      done.add(next.rule);
      getPuck().dispatch({ type: "insert", componentType: variantsFor(next.rule.families)[0].id, destinationIndex: next.index, destinationZone: ROOT_ZONE });
    }
  }

  const addable = result.type ? result.missing.filter((m) => m.rule.families && variantsFor(m.rule.families).length > 0) : [];

  return (
    <div className="atl-score">
      {!result.type ? (
        <ChooseType />
      ) : (
        <>
          <div className="atl-score__top">
            <Ring score={result.score} />
            <div>
              <b>{result.verdict}</b>
              <span>
                {result.type.label} · {result.type.achat ? "achat sur la page" : "pas d'achat sur la page"}
              </span>
              <span>
                {result.missing.length ? `${result.missing.length} amélioration(s) conseillée(s)` : "Rien à ajouter : la page est complète."}
              </span>
            </div>
          </div>
          {addable.length > 0 && (
            <>
              <button type="button" className="atl-score__all atl-score__all--ia" disabled={ai?.step} onClick={addAllWithAi}>
                ✨ Ajouter les {addable.length} section(s) conseillée(s) et les adapter
              </button>
              <p className="atl-score__note">
                Chaque section est placée où elle doit aller, puis l'IA la redessine au style de la page et écrit ses textes pour
                {result.type && " ton produit"} (≈ 1 min par section).
              </p>
              {ai?.step && <p className="atl-aidlg__step">{ai.step}</p>}
              {ai?.error && <p className="atl-topbar__error">{ai.error}</p>}
            </>
          )}
          {addable.length > 1 && (
            <button type="button" className="atl-score__all" onClick={addAll}>
              Ajouter les {addable.length} sections conseillées (sans IA)
            </button>
          )}
          <ol className="atl-score__list">
            {result.missing.map((m) => (
              <Recommendation key={ruleLabel(m.rule)} item={m} onAdd={(type, index) => insertAt(getPuck, type, index)} />
            ))}
          </ol>
          <button type="button" className="atl-score__more" onClick={() => setShowPresent(!showPresent)}>
            {showPresent ? "Masquer" : "Voir"} ce qui est déjà en place ({result.present.length})
          </button>
          {showPresent && (
            <ul className="atl-score__present">
              {result.present.map((p) => (
                <li key={ruleLabel(p.rule)}>✓ {ruleLabel(p.rule)}</li>
              ))}
            </ul>
          )}
          <p className="atl-score__note">
            Note calculée selon le type de page : chaque famille de section conseillée pour ce type rapporte des points. Change le
            type dans les réglages de la page (clic dans le vide de l'aperçu).
          </p>
        </>
      )}
    </div>
  );
}
