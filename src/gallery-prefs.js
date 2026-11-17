import { useSyncExternalStore } from "react";

// Favoris et modèles récents de la galerie « Ajouter une section »
// (2026-11-17). Rangés sur le serveur (galerie.json, /api/galerie) : les
// mêmes depuis l'ordinateur et le téléphone.
let state = { favoris: [], recents: [] };
let loaded = false;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

function load() {
  if (loaded) return;
  loaded = true;
  fetch("/api/galerie")
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => {
      if (s) {
        state = { favoris: s.favoris ?? [], recents: s.recents ?? [] };
        emit();
      }
    })
    .catch(() => {});
}

function save(next) {
  state = next;
  emit();
  fetch("/api/galerie", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
}

export function toggleFavori(id) {
  const has = state.favoris.includes(id);
  save({ ...state, favoris: has ? state.favoris.filter((x) => x !== id) : [id, ...state.favoris] });
}

export function pushRecent(id) {
  save({ ...state, recents: [id, ...state.recents.filter((x) => x !== id)].slice(0, 12) });
}

export function useGalleryPrefs() {
  load();
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state,
  );
}

// Filtres de composition, tirés de l'arbre des copies (meta.arbre) ou des
// réglages des sections du catalogue (schema) : sans template à charger.
export function traitsOf(section) {
  let image = false;
  let accordeon = false;
  (function walk(n) {
    if (!n) return;
    if (n.group) {
      if (n.kind === "question" || n.kind === "faq") accordeon = true;
      return (n.children ?? []).forEach(walk);
    }
    if (n.type === "image" || n.type === "image-fond" || n.type === "video") image = true;
    if (n.name === "Question" || n.name === "Réponse") accordeon = true;
  })(section?.meta?.arbre);
  // Copies : l'arbre suffit (chaque élément a un champ image dans le schéma,
  // même un texte : le schéma ne dit rien). Sections du catalogue : le schéma.
  if (!section?.meta?.arbre) {
    const settings = [...(section?.schema?.settings ?? []), ...(section?.schema?.blocks ?? []).flatMap((b) => b.settings ?? [])];
    if (settings.some((s) => s.type === "image_picker" || s.type === "video_url")) image = true;
  }
  if (familyOfId(section) === "faq") accordeon = true;
  return { image, accordeon };
}
const familyOfId = (s) => s?.meta?.family ?? null;
