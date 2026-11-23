import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { LANGUES_PAGE, langueOf } from "./engine/langue.js";

const usePuckSelect = createUsePuck();

// Choix EN / FR de la page, toujours visible dans la barre du haut. Ne traduit
// pas les textes existants (outil IA → « Traduire la page ») : fixe la langue
// de tout ce que l'IA écrira ensuite pour cette page.
export function LanguageSwitch() {
  const getPuck = useGetPuck();
  const root = usePuckSelect((s) => s.appState.data.root);
  const current = langueOf(root?.props);
  const choose = (code) => {
    const { appState, dispatch } = getPuck();
    dispatch({ type: "replaceRoot", root: { ...appState.data.root, props: { ...appState.data.root.props, langue: code } } });
  };
  return (
    <div className="atl-devices atl-langs" role="group" aria-label="Langue de la page" title="Langue de la page : celle de tous les textes écrits par l'IA.">
      {LANGUES_PAGE.map((l) => (
        <button key={l.code} type="button" className={current.code === l.code ? "is-on" : ""} onClick={() => choose(l.code)}>
          {l.court}
        </button>
      ))}
    </div>
  );
}
