import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { sectionsIndex } from "./engine/sections.js";
import { designById } from "./engine/designs.js";
import { autoRole, charteForItem, measureIn } from "./engine/charte.js";

const usePuckSelect = createUsePuck();
const byId = sectionsIndex;
const frameDoc = () => [...document.querySelectorAll("iframe")].find((f) => f.contentDocument?.querySelector("[data-atl-id]"))?.contentDocument;

// Lot 4 « Réutilisation » (2026-11-17).
// 1. Héritage : une section ajoutée (ou dupliquée sans charte) dans une page
//    qui suit une charte la reçoit aussitôt (typographie, boutons, cartes),
//    avec les couleurs actuelles de la page.
// 2. Rappel : si le projet a une charte et que la page n'en a pas la
//    version, un petit bandeau propose de l'essayer (Palette, essai contrôlé).
export function CharteKeeper() {
  const getPuck = useGetPuck();
  const content = usePuckSelect((s) => s.appState.data.content);
  const root = usePuckSelect((s) => s.appState.data.root?.props ?? {});
  const known = useRef(null);

  useEffect(() => {
    const ids = content.map((c) => c.props.id);
    if (!known.current) {
      known.current = new Set(ids);
      return;
    }
    const fresh = content.filter((c) => !known.current.has(c.props.id)).map((c) => c.props.id);
    ids.forEach((id) => known.current.add(id));
    const ch = root.charte;
    const base = ch && designById[ch.design];
    if (!base || !fresh.length || window.__atlTrial) return;
    // Après le rendu : la mesure des éléments (boutons, grands textes) en a besoin.
    setTimeout(() => {
      const { appState, dispatch } = getPuck();
      const colors = designById[appState.data.root?.props?.design]?.tokens?.couleurs ?? base.tokens.couleurs;
      const design = { ...base, tokens: { ...base.tokens, couleurs: colors } };
      const doc = frameDoc();
      let changed = false;
      const next = appState.data.content.map((it) => {
        if (!fresh.includes(it.props.id) || it.props.atl_charte) return it;
        const { charte } = charteForItem(it, byId[it.type], design, ch, measureIn(doc, it.props.id));
        if (!charte) return it;
        changed = true;
        return { ...it, props: { ...it.props, atl_charte: charte } };
      });
      if (changed) dispatch({ type: "setData", data: { ...appState.data, content: next }, recordHistory: false });
    }, 500);
  }, [content]);

  // Rappel de la charte du projet.
  const [projCharte, setProjCharte] = useState(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!root.projet) return setProjCharte(null);
    fetch(`/api/projects/${encodeURIComponent(root.projet)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setProjCharte(p?.charte ?? null))
      .catch(() => {});
  }, [root.projet, root.charte?.version]);
  const showCharte = projCharte && !hidden && root.charte?.version !== projCharte.version;
  return createPortal(
    <div className="atl-rappels">
      {showCharte && (
    <div className="atl-charterappel" role="status">
      <span>
        Le projet a une charte (version {projCharte.version}, {projCharte.design}.md) que cette page ne suit pas encore.
      </span>
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("atl-left-tool", { detail: "palette" }));
          setTimeout(() => window.dispatchEvent(new CustomEvent("atl-apply-project-charte")), 400);
        }}
      >
        L'essayer
      </button>
      <button type="button" className="atl-charterappel__x" onClick={() => setHidden(true)} aria-label="Plus tard">
        Plus tard
      </button>
    </div>
      )}
      <CtaCheck />
    </div>,
    document.body,
  );
}

// Bouton principal à confirmer après un import (2026-11-17). La copie repère
// les boutons « appel à l'action » d'après leur forme et leur texte ; une
// fois par page importée, la liste est proposée : Oui (bouton principal, fixé
// dans atl_roles) ou Non (« aucun » : la charte ne le touchera pas).
function leavesOf(arbre) {
  const out = [];
  (function walk(n) {
    if (!n) return;
    if (n.group) (n.children ?? []).forEach(walk);
    else if (n.slot) out.push(n);
  })(arbre);
  return out;
}
function CtaCheck() {
  const getPuck = useGetPuck();
  const root = usePuckSelect((s) => s.appState.data.root?.props ?? {});
  const count = usePuckSelect((s) => s.appState.data.content.length);
  const [found, setFound] = useState(null);
  const [open, setOpen] = useState(false);
  const [later, setLater] = useState(false);
  const imported = Boolean(root.importSource || root.propositionsImport);

  useEffect(() => {
    if (!imported || root.ctaValides) return;
    const t = setTimeout(() => {
      const doc = frameDoc();
      if (!doc) return;
      const out = [];
      for (const it of getPuck().appState.data.content) {
        const sec = byId[it.type];
        if (!sec?.meta?.arbre) continue;
        const m = measureIn(doc, it.props.id);
        for (const leaf of leavesOf(sec.meta.arbre)) {
          if (it.props.atl_roles?.[leaf.slot]) continue;
          const mm = m(leaf.slot);
          if (autoRole(leaf, mm, sec.meta.family) !== "bouton") continue;
          out.push({ id: it.props.id, slot: leaf.slot, text: (mm?.btn?.text || mm?.text || "").slice(0, 48), section: (sec.meta.label ?? it.type).split(" — ")[0] });
        }
      }
      setFound(out);
    }, 1500);
    return () => clearTimeout(t);
  }, [imported, root.ctaValides, count]);

  const finish = (value = new Date().toISOString()) => {
    const { appState, dispatch } = getPuck();
    dispatch({ type: "replaceRoot", root: { ...appState.data.root, props: { ...appState.data.root.props, ctaValides: value } } });
    setOpen(false);
  };
  const decide = (list, yes) => {
    const { appState, dispatch } = getPuck();
    const ch = appState.data.root?.props?.charte;
    const design = ch && designById[ch.design];
    const doc = frameDoc();
    const content = appState.data.content.map((it) => {
      const mine = list.filter((x) => x.id === it.props.id);
      if (!mine.length) return it;
      const roles = { ...(it.props.atl_roles ?? {}) };
      for (const x of mine) roles[x.slot] = yes ? "bouton" : "aucun";
      const props = { ...it.props, atl_roles: roles };
      if (design) {
        const { charte } = charteForItem({ ...it, props }, byId[it.type], design, ch, measureIn(doc, it.props.id));
        if (charte) props.atl_charte = charte;
        else delete props.atl_charte;
      }
      return { ...it, props };
    });
    dispatch({ type: "setData", data: { ...appState.data, content }, recordHistory: true });
    const rest = (found ?? []).filter((f) => !list.includes(f));
    setFound(rest);
    if (!rest.length) finish();
  };
  const show = (f, on) => {
    const el = frameDoc()?.querySelector(`[data-atl-id="${CSS.escape(f.id)}"] [data-atl-slot="${CSS.escape(f.slot)}"]`);
    const box = el?.closest("[data-atl-btn], [data-atl-link]") ?? el;
    if (!box) return;
    if (on) box.scrollIntoView({ block: "center", behavior: "smooth" });
    box.style.outline = on ? "3px solid #4f46e5" : "";
    box.style.outlineOffset = on ? "3px" : "";
  };

  if (!imported || root.ctaValides || later || !found?.length) return null;
  if (!open)
    return (
      <div className="atl-charterappel" role="status">
        <span>
          Import : {found.length} bouton{found.length > 1 ? "s" : ""} repéré{found.length > 1 ? "s" : ""} comme « bouton principal ». À vérifier ?
        </span>
        <button type="button" onClick={() => setOpen(true)}>
          Vérifier
        </button>
        <button type="button" className="atl-charterappel__x" onClick={() => setLater(true)}>
          Plus tard
        </button>
        <button type="button" className="atl-charterappel__x" onClick={() => finish("non demandé")}>
          Ne plus demander
        </button>
      </div>
    );
  return (
    <div className="atl-ctacheck" role="dialog" aria-label="Boutons principaux">
      <b>Est-ce bien un bouton principal (appel à l'action) ?</b>
      <small>La charte donnera à chaque « oui » le style du bouton principal ; un « non » ne sera jamais touché. Survole une ligne pour voir le bouton dans la page.</small>
      <ul>
        {found.map((f) => (
          <li key={f.id + f.slot} onMouseEnter={() => show(f, true)} onMouseLeave={() => show(f, false)}>
            <span>
              <b>{f.text || "(sans texte)"}</b>
              <small>{f.section}</small>
            </span>
            <button type="button" onClick={() => (show(f, false), decide([f], true))}>
              Oui
            </button>
            <button type="button" className="is-no" onClick={() => (show(f, false), decide([f], false))}>
              Non
            </button>
          </li>
        ))}
      </ul>
      <div className="atl-ctacheck__foot">
        <button type="button" onClick={() => decide(found, true)}>
          Tout est bon
        </button>
        <button type="button" className="is-no" onClick={() => setOpen(false)}>
          Fermer
        </button>
      </div>
    </div>
  );
}
