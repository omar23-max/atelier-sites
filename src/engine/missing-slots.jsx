// Emplacements des sections manquantes, dans l'aperçu de l'éditeur (2026-11-09).
//
// Le Score de vente (engine/page-score.js) dit quelles familles de sections
// manquent et à quel rang les placer. Ici, un rectangle en pointillés est
// dessiné à ce rang, dans la page : « + Ajouter une section Garantie ici ».
// Plusieurs sections conseillées au même endroit : un seul rectangle.
// Jamais dans la page publiée : rendu seulement par l'éditeur (SectionView).
//
// Petit magasin partagé entre l'aperçu (iframe) et l'éditeur : affichage
// oui/non, rôle de la page (mère, angle) et la demande de choix d'un modèle
// (ouverte par un clic sur un rectangle, affichée par src/slot-picker.jsx).
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createUsePuck } from "@puckeditor/core";
import { scorePage, RULES } from "./page-score.js";
import { sections, sectionsIndex } from "./sections.js";
import { familyById } from "./families.js";
import { zoneOfFamilies } from "./zones.js";

const sectionsById = sectionsIndex;
const usePuckSelect = createUsePuck();

const readVisible = () => {
  try {
    return localStorage.getItem("atl-emplacements") !== "non";
  } catch {
    return true;
  }
};
let state = { visible: readVisible(), role: null, motherName: null, picker: null, flash: null };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
export const slotStore = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    emit();
  },
  setVisible(visible) {
    try {
      localStorage.setItem("atl-emplacements", visible ? "oui" : "non");
    } catch {}
    slotStore.set({ visible });
  },
  subscribe(l) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
export const useSlotStore = () => useSyncExternalStore(slotStore.subscribe, slotStore.get);

// Rang d'une règle dans la liste de son type de page : au même endroit, les
// sections s'affichent dans l'ordre où elles se suivent sur une page.
const ruleOrder = (rule) => {
  for (const list of Object.values(RULES)) {
    const i = list.indexOf(rule);
    if (i >= 0) return i;
  }
  return 99;
};

// Calcul partagé par toutes les sections de l'aperçu : refait seulement quand
// la page change (même objet data = même résultat).
let cache = { data: null, byIndex: null };
export function missingByIndex(data) {
  if (cache.data === data) return cache.byIndex;
  const byIndex = new Map();
  const result = data ? scorePage(data, sectionsById) : null;
  if (result?.type) {
    for (const m of result.missing) {
      if (!m.rule.families) continue; // « lien vers la page d'achat » : un réglage, pas une section
      const list = byIndex.get(m.index) ?? [];
      list.push({
        key: m.rule.families.join("+"),
        families: m.rule.families,
        label: m.rule.label ?? m.rule.families.map((f) => familyById[f]?.label ?? f).join(" ou "),
        why: m.rule.why,
        gain: m.gain,
        index: m.index,
        zone: zoneOfFamilies(m.rule.families),
        order: ruleOrder(m.rule),
      });
      byIndex.set(m.index, list);
    }
    for (const list of byIndex.values()) list.sort((a, b) => a.order - b.order);
  }
  cache = { data, byIndex };
  return byIndex;
}

// Rectangles d'un rang donné. Sélection en texte (clé) : la section ne se
// redessine que si ses emplacements changent.
export function MissingSlots({ sectionId, where }) {
  const key = usePuckSelect((s) => {
    const data = s.appState.data;
    const i = data.content.findIndex((c) => c.props.id === sectionId);
    if (i < 0) return "";
    if (where === "before" && i !== 0) return "";
    const items = missingByIndex(data).get(where === "before" ? 0 : i + 1);
    return items?.length ? JSON.stringify(items) : "";
  });
  const { visible, role, flash } = useSlotStore();
  const ref = useRef(null);
  const itemsRef = useRef([]);
  // Les clics de l'aperçu (iframe) n'arrivent pas aux gestionnaires React :
  // écouteurs posés directement sur le rectangle. Ils arrêtent aussi le clic
  // pour que Puck ne sélectionne pas la section voisine.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const halt = (e) => e.stopPropagation();
    const onClick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const b = e.target.closest?.("button[data-slot-key]");
      const it = b && itemsRef.current.find((x) => x.key === b.dataset.slotKey);
      if (it) slotStore.set({ picker: { ...it, elsewhere: b.dataset.elsewhere === "1" } });
    };
    el.addEventListener("click", onClick);
    el.addEventListener("mousedown", halt);
    el.addEventListener("pointerdown", halt);
    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("mousedown", halt);
      el.removeEventListener("pointerdown", halt);
    };
  }, [key, visible]);
  if (!key || !visible) return null;
  const items = JSON.parse(key);
  itemsRef.current = items;
  const index = items[0].index;
  const isFlash = flash != null && flash === index;
  return (
    <div ref={ref} className={`atl-slot${isFlash ? " is-flash" : ""}`} data-atl-slot-index={index}>
      {items.length > 1 && <p className="atl-slot__count">{items.length} sections conseillées ici</p>}
      {items.map((it) => {
        // Page d'angle : le socle se complète dans la page mère (une seule fois
        // pour tous les angles) ; seules les zones d'angle s'ajoutent ici.
        const elsewhere = role === "angle" && it.zone === "socle";
        return (
          <div key={it.key} className={`atl-slot__item${elsewhere ? " is-elsewhere" : ""}`}>
            <div className="atl-slot__text">
              <b>
                {elsewhere ? "À ajouter dans la page mère" : "+ Ajouter une section"} « {it.label} »{elsewhere ? "" : " ici"}
                {role && <span className={`atl-slot__zone is-${it.zone}`}>{it.zone === "angle" ? "Angle" : "Socle"}</span>}
                <em>+{it.gain}</em>
              </b>
              <small>{it.why}</small>
            </div>
            <button type="button" data-slot-key={it.key} data-elsewhere={elsewhere ? "1" : "0"}>
              {elsewhere ? "Ouvrir la page mère" : "Choisir un modèle"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Styles de l'aperçu (ajoutés à EDITOR_CSS) : jamais exportés.
export const SLOT_CSS = `
.atl-slot { margin: 14px 18px; padding: 14px 16px; border: 2px dashed #8ea2ff; border-radius: 14px; background: rgba(91,124,255,.06); font: 14px/1.35 "Inter", system-ui, sans-serif; color: #1f2a5c; text-align: left; position: relative; z-index: 60; }
.atl-slot.is-flash { animation: atl-slot-flash 1.6s ease-out 1; }
.atl-slot__count { margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #5b6bb5; }
.atl-slot__item { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.atl-slot__item + .atl-slot__item { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #c5cffc; }
.atl-slot__text { display: grid; gap: 3px; min-width: 0; }
.atl-slot__text b { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 14.5px; font-weight: 650; }
.atl-slot__text small { color: #5c6690; font-size: 12.5px; }
.atl-slot__text em { padding: 1px 7px; border-radius: 99px; background: #e3e8ff; color: #3949ab; font-size: 11px; font-style: normal; font-weight: 700; }
.atl-slot__zone { padding: 1px 7px; border-radius: 99px; font-size: 10.5px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.atl-slot__zone.is-socle { background: #eceae4; color: #5a5446; }
.atl-slot__zone.is-angle { background: #ffe6d2; color: #a3480f; }
.atl-slot button { flex: none; height: 34px; padding: 0 14px; border: 0; border-radius: 99px; background: #4c5fd5; color: #fff; font: 600 13px "Inter", system-ui, sans-serif; cursor: pointer; }
.atl-slot button:hover { background: #3a4bc0; }
.atl-slot__item.is-elsewhere { opacity: .72; }
.atl-slot__item.is-elsewhere button { background: #fff; color: #4c5fd5; box-shadow: inset 0 0 0 1px #8ea2ff; }
@keyframes atl-slot-flash { 0% { box-shadow: 0 0 0 0 rgba(76,95,213,.65); background: rgba(91,124,255,.2); } 100% { box-shadow: 0 0 0 14px rgba(76,95,213,0); background: rgba(91,124,255,.06); } }
`;
