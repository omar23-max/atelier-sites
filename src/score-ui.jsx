import { useEffect, useState } from "react";
import { useGetPuck } from "@puckeditor/core";
import { sections, sectionsIndex } from "./engine/sections.js";
import { scorePage, ruleLabel } from "./engine/page-score.js";
import { PAGE_TYPES } from "./engine/page-types.js";
import { familyById, familyOf } from "./engine/families.js";
import { ROOT_ZONE, Thumb, scrollCanvasTo, usePuckSelect } from "./library-ui.jsx";
import { adaptInstructionFor, applyReplacements, rebuildSectionWith } from "./inspector-ui.jsx";
import { showSlot } from "./slot-picker.jsx";
import { slotStore, useSlotStore } from "./engine/missing-slots.jsx";
import { zoneOfFamilies } from "./engine/zones.js";
import { localFidelity } from "./engine/fidelite.js";
import { runDesignCheck, KIND_LABEL } from "./engine/design-check.js";

const sectionsById = sectionsIndex;
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
  const { role } = useSlotStore();
  const variants = item.rule.families ? variantsFor(item.rule.families) : [];
  const shown = open ? variants : variants.slice(0, 1);
  return (
    <li className="atl-score__item">
      <div className="atl-score__item-head">
        <strong>{ruleLabel(item.rule)}</strong>
        {role && item.rule.families && (
          <span className={`atl-score__zone is-${zoneOfFamilies(item.rule.families)}`}>{zoneOfFamilies(item.rule.families) === "angle" ? "Angle" : "Socle"}</span>
        )}
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
          <p className="atl-score__where">
            À placer {item.where}
            {" · "}
            <button type="button" className="atl-linkbtn" onClick={() => showSlot(item.index)}>
              voir l'emplacement
            </button>
          </p>
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

// Choisit une section de la page et la montre.
function showSection(getPuck, sectionId) {
  const { appState, dispatch } = getPuck();
  const index = appState.data.content.findIndex((c) => c.props.id === sectionId);
  if (index < 0) return;
  dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
  setTimeout(() => scrollCanvasTo(sectionId), 60);
}

// Les 5 croyances (skill landing-page-jeffrey-arsh) : installées par quelles
// sections, ou quoi ajouter.
function Beliefs({ result, onAdd }) {
  const getPuck = useGetPuck();
  const missingCount = result.beliefs.filter((b) => !b.ok).length;
  return (
    <div className="atl-score__block">
      <h4>
        Les 5 croyances <em>{5 - missingCount} / 5</em>
      </h4>
      <p className="atl-score__note">S'il en manque une seule, le visiteur hésite ou part.</p>
      <ul className="atl-beliefs">
        {result.beliefs.map((b) => {
          // Où placer la section qui l'installe : comme une section conseillée
          // de la même famille, sinon à la fin.
          const rec = result.missing.find((m) => m.rule.families?.some((f) => b.families.includes(f)));
          const model = !b.ok && variantsFor(rec ? rec.rule.families : [b.families[0]])[0];
          return (
            <li key={b.n} className={b.ok ? "is-ok" : "is-missing"}>
              <span className="atl-beliefs__mark">{b.ok ? "✓" : "✗"}</span>
              <div>
                <b>
                  {b.n}. {b.label}
                </b>
                {b.ok ? (
                  <small>
                    Par{" "}
                    {[...new Set(b.by.map((x) => x.family))]
                      .slice(0, 3)
                      .map((f) => familyById[f]?.label ?? f)
                      .join(", ")}
                    {" · "}
                    <button type="button" className="atl-linkbtn" onClick={() => showSection(getPuck, b.by[0].sectionId)}>
                      voir
                    </button>
                  </small>
                ) : (
                  <small>{b.how}</small>
                )}
                {model && (
                  <button type="button" className="atl-beliefs__add" onClick={() => onAdd(model.id, rec?.index ?? getPuck().appState.data.content.length)}>
                    + Ajouter « {familyOf(model).label} »
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Textes à reprendre : titres-étiquettes, boutons génériques, réassurance
// absente sous un bouton d'achat, consignes entre crochets.
const KIND_ICON = { titre: "H", bouton: "▭", reassurance: "🛡", consignes: "[ ]" };
function TextChecks({ items }) {
  const getPuck = useGetPuck();
  if (!items.length) return <p className="atl-score__note">✓ Textes : aucun titre-étiquette, bouton générique ou consigne oubliée.</p>;
  return (
    <div className="atl-score__block">
      <h4>
        Textes à reprendre <em>{items.length}</em>
      </h4>
      <ul className="atl-textchecks">
        {items.slice(0, 20).map((t, i) => (
          <li key={i}>
            <button type="button" onClick={() => showSection(getPuck, t.sectionId)} title="Voir la section">
              <span className="atl-textchecks__icon">{KIND_ICON[t.kind]}</span>
              <span>
                <b>« {t.text.slice(0, 60)} »</b>
                <small>{t.fix}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Fidélité aux Fondations du projet (2026-11-10) : contrôle immédiat, sans IA.
// Chiffres de la page absents des Fondations, notes [MANQUE] oubliées, contenu
// prêt dans les Fondations sans section pour le recevoir. Le fond (promesse,
// mécanisme, objections) est jugé par ✨ IA → Auditer la page.
function FoundationsCheck({ data }) {
  const getPuck = useGetPuck();
  const projet = data.root?.props?.projet ?? null;
  const [project, setProject] = useState(null);
  useEffect(() => {
    setProject(null);
    if (!projet) return;
    let alive = true;
    fetch(`/api/projects/${encodeURIComponent(projet)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => alive && setProject(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projet]);
  if (!projet || !project) return null;
  const f = localFidelity(data, sectionsById, project);
  const total = f.chiffres.length + f.notes.length + f.sansSection.length;
  return (
    <div className="atl-score__block">
      <h4>
        Fidélité aux Fondations {total > 0 && <em>{total}</em>}
      </h4>
      {!f.aCarte ? (
        <p className="atl-score__note">Ce type de page n'a pas de carte dans les Fondations.</p>
      ) : !f.carteRemplie ? (
        <p className="atl-score__note">La carte de ce type de page est vide dans les Fondations du projet (partie 9) : remplis-la, puis ✨ IA → Remplir depuis les Fondations.</p>
      ) : (
        <p className="atl-score__note">
          {f.couverture.avecContenu} section(s) sur {f.couverture.total} ont un contenu prévu dans les Fondations.
          {total === 0 ? " ✓ Aucun chiffre hors Fondations, aucune note oubliée." : ""}
        </p>
      )}
      {f.chiffres.length > 0 && (
        <>
          <p className="atl-score__note">
            <b>{f.chiffres.length} chiffre(s) absent(s) des Fondations.</b> À vérifier un par un : s'il est vrai, ajoute-le aux Fondations ; sinon, retire-le de la page.
          </p>
          <ul className="atl-textchecks">
            {f.chiffres.slice(0, 15).map((c, i) => (
              <li key={i}>
                <button type="button" onClick={() => showSection(getPuck, c.sectionId)} title="Voir la section">
                  <span className="atl-textchecks__icon">#</span>
                  <span>
                    <b>{c.valeur}</b>
                    <small>
                      {c.extrait} — {c.name}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {f.notes.length > 0 && (
        <>
          <p className="atl-score__note">
            <b>{f.notes.length} note(s) [MANQUE] ou [À VALIDER] restée(s) dans la page.</b> À remplacer par un vrai texte ou à retirer.
          </p>
          <ul className="atl-textchecks">
            {f.notes.slice(0, 10).map((n, i) => (
              <li key={i}>
                <button type="button" onClick={() => showSection(getPuck, n.sectionId)} title="Voir la section">
                  <span className="atl-textchecks__icon">[ ]</span>
                  <span>
                    <b>« {n.text} »</b>
                    <small>{n.name}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {f.sansSection.length > 0 && (
        <p className="atl-score__note">
          <b>Contenu prêt, mais pas de section pour le recevoir :</b> {f.sansSection.join(", ")}. Ajoute ces sections (liste ci-dessous), puis remplis-les depuis les Fondations.
        </p>
      )}
    </div>
  );
}

// Contrôle du design (2026-11-11) : la page enregistrée, rendue comme à la
// publication à deux largeurs (ordinateur 1440, mobile 390), sans IA. Voir
// src/engine/design-check.js. Dernière étape avant l'export.
const pageNameOf = () => new URLSearchParams(location.search).get("page");
const VUE = { ordi: "ordinateur", mobile: "mobile" };
function DesignCheck({ data }) {
  const getPuck = useGetPuck();
  const [state, setState] = useState(null);
  const name = pageNameOf();
  if (!name) return null;
  async function run() {
    setState({ busy: true, step: "Préparation…" });
    try {
      const result = await runDesignCheck(name, (step) => setState({ busy: true, step }));
      setState({ result });
    } catch (e) {
      setState({ error: `Contrôle impossible : ${e.message}` });
    }
  }
  // Audit approfondi : Claude passe la page au skill Impeccable (accessibilité,
  // hiérarchie, espacements, cohérence, mobile) et rend ses constats dans la
  // demande (Catalogue → Demandes). Demande « auditdesign ».
  const [asked, setAsked] = useState(null);
  async function askDeep() {
    setAsked({ busy: true });
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "auditdesign",
          page: name,
          notes: `Audit approfondi du design de la page « ${name} » avec Impeccable, sur ordinateur et mobile.`,
          details: { page: name, controleLocal: state?.result ? { note: state.result.note, parType: state.result.parType } : null },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setAsked({ done: `Demande enregistrée (${body.dossier}). Dis à Claude « traite les demandes » : le résultat apparaîtra dans Catalogue → Demandes.` });
    } catch (e) {
      setAsked({ error: e.message });
    }
  }
  const r = state?.result;
  const kinds = r ? Object.keys(KIND_LABEL).filter((k) => r.parType[k]) : [];
  const idOf = (index) => (index == null ? null : data.content[index]?.props?.id ?? null);
  return (
    <div className="atl-score__block">
      <h4>
        Design {r && <em>{r.issues.length}</em>}
      </h4>
      {!r && (
        <p className="atl-score__note">
          Dernier contrôle avant l'export : la page enregistrée est affichée comme un client la verra, sur ordinateur et sur téléphone. Textes
          coupés ou trop pâles, images absentes, page qui dépasse, boutons trop petits, premier bouton invisible sans défiler. Environ 15 s,
          sans IA.
        </p>
      )}
      <button type="button" className="atl-score__all" disabled={state?.busy} onClick={run}>
        {state?.busy ? `Contrôle en cours… ${state.step ?? ""}` : r ? "Refaire le contrôle du design" : "Contrôler le design (ordinateur et mobile)"}
      </button>
      {state?.error && <p className="atl-topbar__error">{state.error}</p>}
      <button type="button" className="atl-score__all" disabled={asked?.busy || Boolean(asked?.done)} onClick={askDeep}>
        {asked?.busy ? "Envoi…" : "Demander l'audit approfondi à Claude"}
      </button>
      <p className="atl-score__note">
        {asked?.done ?? "Pour aller plus loin que ce contrôle : hiérarchie, espacements, cohérence, accessibilité, jugés par Claude avec son outil de design (Impeccable)."}
      </p>
      {asked?.error && <p className="atl-topbar__error">{asked.error}</p>}
      {r && (
        <>
          <p className="atl-score__note">
            <b>Design : {r.note} / 100.</b>{" "}
            {r.issues.length ? `${r.issues.length} point(s) à voir, du plus gênant au moins gênant.` : "✓ Rien à signaler sur ordinateur ni sur mobile."} Page enregistrée
            contrôlée (les changements non enregistrés ne sont pas vus).
          </p>
          {kinds.map((kind) => {
            const list = r.issues.filter((i) => i.kind === kind);
            return (
              <div key={kind}>
                <p className="atl-score__note">
                  <b>
                    {KIND_LABEL[kind]} ({list.length})
                  </b>
                </p>
                <ul className="atl-textchecks">
                  {list.slice(0, 8).map((i, n) => (
                    <li key={n}>
                      <button type="button" disabled={!idOf(i.section)} onClick={() => idOf(i.section) && showSection(getPuck, idOf(i.section))} title={idOf(i.section) ? "Voir la section" : ""}>
                        <span className="atl-textchecks__icon">{i.vue === "mobile" ? "📱" : "🖥"}</span>
                        <span>
                          <b>{i.text ? `« ${i.text.slice(0, 60)} »` : VUE[i.vue]}{i.n > 1 ? ` × ${i.n}` : ""}</b>
                          <small>
                            {i.detail} · {VUE[i.vue]}
                            {i.section != null ? ` · section ${i.section + 1}` : ""}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {list.length > 8 && <p className="atl-score__note">… et {list.length - 8} autre(s) du même type.</p>}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export function ScorePanel() {
  const getPuck = useGetPuck();
  const data = usePuckSelect((s) => s.appState.data);
  const result = scorePage(data, sectionsById);
  const [showPresent, setShowPresent] = useState(false);
  const { visible: slotsVisible } = useSlotStore();

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
      setAi({ step: "Mise en place…" });
      await applyReplacements(getPuck, replacements);
      setAi(null);
    } catch (e) {
      // Les sections déjà refaites sont gardées (posées sans rechargement).
      if (replacements.length) await applyReplacements(getPuck, replacements).catch(() => {});
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
              <b>Couverture de la structure conseillée · {result.verdict}</b>
              <span>
                {result.type.label} · {result.type.achat ? "achat sur la page" : "pas d'achat sur la page"}
              </span>
              <span>
                {result.missing.length ? `${result.missing.length} amélioration(s) conseillée(s)` : "Rien à ajouter : la page est complète."}
              </span>
            </div>
          </div>
          {result.missing.some((m) => m.rule.families) && (
            <label className="atl-score__slots">
              <input type="checkbox" checked={slotsVisible} onChange={(e) => slotStore.setVisible(e.target.checked)} />
              Montrer les emplacements dans la page
              <small>Un rectangle en pointillés là où chaque section conseillée doit aller. Jamais publié.</small>
            </label>
          )}
          <Beliefs result={result} onAdd={(type, index) => insertAt(getPuck, type, index)} />
          <TextChecks items={result.texts} />
          <FoundationsCheck data={data} />
          <DesignCheck data={data} />
          {addable.length > 0 && (
            <>
              <button type="button" className="atl-score__all atl-score__all--ia" disabled={ai?.step} onClick={addAllWithAi}>
                ✨ Ajouter les {addable.length} section(s) conseillée(s) et les adapter
              </button>
              <p className="atl-score__note">
                Chaque section est placée où elle doit aller, puis l'IA la redessine au style de la page et écrit ses textes pour
                {result.type && " ton produit"} (≈ 1 min par section).
              </p>
            </>
          )}
          {ai?.step && <p className="atl-aidlg__step">{ai.step}</p>}
          {ai?.error && <p className="atl-topbar__error">{ai.error}</p>}
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
