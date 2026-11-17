import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";

// Essai contrôlé (lot 3 « Design et palette », 2026-11-17).
//
// Appliquer un design.md, une palette ou une charte ne s'écrit plus tout de
// suite : la page change à l'écran (essai), une barre montre le bilan, la
// bascule Avant / Après, puis « Appliquer » ou « Annuler ». Pendant l'essai,
// l'enregistrement automatique est suspendu (window.__atlTrial, App.jsx) :
// fermer ou annuler ne modifie rien. Après « Appliquer », « ↶ Revenir à
// avant » (ou Ctrl+Z) remet l'état d'avant l'essai.
//
// Lancer : startTrial({ title, lines, page, apply })
//   page  : la page modifiée (données Puck) ;
//   apply : async ({ page, before }) => { …enregistre… ; return { reload } }.
export function startTrial(detail) {
  window.dispatchEvent(new CustomEvent("atl-trial", { detail }));
}

export function TrialHost() {
  const getPuck = useGetPuck();
  const [trial, setTrial] = useState(null); // { title, lines, page, apply, before, view, state, error }
  const trialRef = useRef(null);
  trialRef.current = trial;

  const show = (data) => getPuck().dispatch({ type: "setData", data, recordHistory: false });
  const end = () => {
    window.__atlTrial = false;
    setTrial(null);
  };

  useEffect(() => {
    const on = (e) => {
      const cur = trialRef.current;
      // Un essai déjà ouvert : on repart de la page d'avant cet essai.
      const before = cur && cur.state !== "done" ? cur.before : getPuck().appState.data;
      window.__atlTrial = true;
      show(e.detail.page);
      setTrial({ ...e.detail, before, view: "apres", state: "essai", error: null });
    };
    window.addEventListener("atl-trial", on);
    return () => {
      window.removeEventListener("atl-trial", on);
      // Éditeur fermé pendant un essai : rien n'a été écrit.
      if (trialRef.current?.state === "essai") window.__atlTrial = false;
    };
  }, []);

  // Échap = Annuler (pendant l'essai seulement).
  useEffect(() => {
    if (trial?.state !== "essai") return;
    const onKey = (e) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trial?.state]);

  if (!trial) return null;

  function toggle(view) {
    show(view === "avant" ? trial.before : trial.page);
    setTrial({ ...trial, view });
  }
  function cancel() {
    show(trial.before);
    end();
  }
  async function apply() {
    setTrial({ ...trial, state: "busy", error: null });
    try {
      const r = (await trial.apply({ page: trial.page, before: trial.before })) ?? {};
      if (r.reload) return setTimeout(() => location.reload(), r.delay ?? 300);
      window.__atlTrial = false;
      // Une étape d'historique : Ctrl+Z revient à la page d'avant l'essai.
      getPuck().dispatch({ type: "setData", data: trial.page, recordHistory: true });
      setTrial({ ...trial, state: "done", view: "apres" });
    } catch (e) {
      setTrial({ ...trial, state: "essai", error: e.message });
    }
  }
  function revert() {
    getPuck().dispatch({ type: "setData", data: trial.before, recordHistory: true });
    end();
  }

  return createPortal(
    <div className={`atl-trial is-${trial.state}`} role="region" aria-label="Essai du style">
      {trial.state === "done" ? (
        <div className="atl-trial__row">
          <b>✓ {trial.title} : appliqué.</b>
          <button type="button" className="atl-trial__ghost" onClick={revert}>
            ↶ Revenir à avant
          </button>
          <button type="button" className="atl-trial__x" onClick={end} aria-label="Fermer">
            ×
          </button>
        </div>
      ) : (
        <>
          <div className="atl-trial__row">
            <b>Essai : {trial.title}</b>
            <span className="atl-trial__seg" role="radiogroup" aria-label="Comparer">
              <button type="button" role="radio" aria-checked={trial.view === "avant"} className={trial.view === "avant" ? "is-on" : ""} onClick={() => toggle("avant")}>
                Avant
              </button>
              <button type="button" role="radio" aria-checked={trial.view === "apres"} className={trial.view === "apres" ? "is-on" : ""} onClick={() => toggle("apres")}>
                Après
              </button>
            </span>
            <button type="button" className="atl-trial__go" disabled={trial.state === "busy"} onClick={apply}>
              {trial.state === "busy" ? "Enregistrement…" : "Appliquer"}
            </button>
            <button type="button" className="atl-trial__ghost" disabled={trial.state === "busy"} onClick={cancel}>
              Annuler
            </button>
          </div>
          {trial.lines?.length > 0 && (
            <ul className="atl-trial__lines">
              {trial.lines.map((l, i) => (
                <li key={i} className={/^⚠/.test(l) ? "is-warn" : ""}>
                  {l}
                </li>
              ))}
            </ul>
          )}
          <small className="atl-trial__note">Rien n'est enregistré tant que tu n'appliques pas. Échap ou « Annuler » : la page revient comme avant.</small>
          {trial.error && <p className="atl-trial__err">{trial.error}</p>}
        </>
      )}
    </div>,
    document.body,
  );
}
