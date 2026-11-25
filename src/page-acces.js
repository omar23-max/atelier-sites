// Accès aux données de la page pour le Canvas (2026-11-24).
// Dans l'éditeur : celles de Puck (page ouverte, Ctrl+Z…). Dans canvas.html
// (Canvas seul, ouvert directement depuis un autre menu, sans dessiner la
// page) : la page lue sur le serveur, en lecture ; les poses dans une page
// passent par le serveur (copie de sécurité puis enregistrement).
import { useGetPuck as usePuckReel } from "@puckeditor/core";

export const canvasSeul = typeof window !== "undefined" && location.pathname === "/canvas.html";
export const pageSeule = { data: { root: { props: {} }, content: [] } };
const seul = () => ({
  appState: { data: pageSeule.data },
  dispatch: () => {
    throw new Error("Pose directe indisponible dans le Canvas seul : passe par « Exporter vers une page ».");
  },
});
export function useGetPuck() {
  // canvasSeul ne change jamais pendant la session : l'ordre des hooks reste stable.
  if (canvasSeul) return seul;
  return usePuckReel();
}
