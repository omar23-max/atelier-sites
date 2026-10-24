import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { IconPen } from "./icons.jsx";

const pageName = new URLSearchParams(location.search).get("page") ?? "brouillon";
const MIN_INFO = 100;

// Compte les textes encore en consigne entre crochets (« [ Titre — 3 mots ] »).
function countBriefs(content) {
  let n = 0;
  const walk = (v) => {
    if (typeof v === "string") n += /^\s*\[[^\]]+\]\s*$/.test(v) || /\[[^\]]*\d+[^\]]*mots?[^\]]*\]/i.test(v) ? 1 : 0;
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  content.forEach((item) => walk(item.props));
  return n;
}

// Bouton « Réécrire les textes » : enregistre la page, puis crée une demande
// (demandes/<date>-textes/) que Claude traite : chaque consigne entre crochets
// est remplacée par un vrai texte, au bon nombre de mots, pour ce produit et
// ce profil client. Jamais le texte du site d'origine.
// hidden : pas de bouton, seulement la fenêtre, ouverte par l'événement
// « atl-open-rewrite » (outil « Régénérer » du rail de gauche).
export function RewriteButton({ hidden = false }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("atl-open-rewrite", onOpen);
    return () => window.removeEventListener("atl-open-rewrite", onOpen);
  }, []);
  return (
    <>
      {!hidden && (
        <button type="button" className="atl-tool" onClick={() => setOpen(true)} title="Remplir les textes de la page pour ton produit">
          <IconPen />
          Réécrire les textes
        </button>
      )}
      {open && createPortal(<RewriteDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function RewriteDialog({ onClose }) {
  const getPuck = useGetPuck();
  const { data } = getPuck().appState;
  const root = data.root?.props ?? {};
  const briefs = countBriefs(data.content ?? []);
  const [form, setForm] = useState({
    marque: "",
    produit: root.produit ?? "",
    profil: root.profil ?? "",
    langue: "anglais",
    ton: "",
    infos: "",
    // Page copiée avec ses textes d'origine (aucune consigne entre crochets) :
    // on réécrit tous les textes.
    portee: briefs > 0 ? "consignes" : "tout",
    prompt: "",
  });
  const [state, setState] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function send() {
    if (form.infos.trim().length < MIN_INFO) return setState({ error: `Donne au moins ${MIN_INFO} caractères d'informations sur le produit.` });
    setState({ busy: true });
    try {
      // La demande porte sur le fichier : on enregistre d'abord la page telle
      // qu'elle est dans l'éditeur.
      const save = await fetch(`/api/pages/${pageName}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getPuck().appState.data),
      });
      if (!save.ok) throw new Error((await save.json()).error);
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "textes", page: pageName, details: { ...form, pageType: root.pageType ?? null, nbConsignes: briefs } }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setState({ done: body.dossier });
    } catch (e) {
      setState({ error: `Échec : ${e.message}` });
    }
  }

  return (
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="atl-modal__panel atl-newpage">
        <header className="atl-modal__head">
          <h2>Réécrire les textes de la page</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        {state?.done ? (
          <div className="atl-newpage__body">
            <p>
              <b>Demande enregistrée</b> dans <code>{state.done}</code>. La page a été enregistrée.
            </p>
            <p>
              Dis à Claude <b>« traite les demandes »</b> :{" "}
              {form.portee === "tout"
                ? "il réécrit tous les textes de la version modifiable pour ton produit, en suivant tes consignes, à la même longueur et avec la même mise en forme"
                : `il remplit les ${briefs} consignes de la page, au bon nombre de mots, pour ton produit et ton client`}
              , puis enregistre la page (une copie de sécurité est faite avant). Recharge ensuite l'atelier ; l'original ne change pas.
            </p>
          </div>
        ) : (
          <div className="atl-newpage__body">
            <p className="atl-newpage__hint" style={{ margin: 0 }}>
              {briefs > 0
                ? `${briefs} texte(s) de la page sont encore des consignes entre crochets.`
                : "La version modifiable a encore les textes de la page d'origine : ils seront tous réécrits pour ton produit (l'original reste consultable)."}{" "}
              Les textes écrits sont neufs : rien n'est recopié du site d'origine.
            </p>
            <fieldset className="atl-newpage__grid">
              <legend>Tes consignes (prompt)</legend>
              <label style={{ gridColumn: "1 / -1" }}>
                <span>Ce que tu veux changer, comme tu le dirais à un rédacteur (facultatif)</span>
                <textarea
                  rows={4}
                  value={form.prompt}
                  onChange={set("prompt")}
                  className="atl-copy__infos"
                  placeholder="ex. La narratrice est une maman de 35 ans, pas une grand-mère. Ton plus urgent. Insiste sur l'absence de produits chimiques. Garde les intertitres courts."
                />
              </label>
            </fieldset>
            <fieldset className="atl-newpage__grid">
              <legend>Ton produit</legend>
              <label>
                <span>Nom de la marque</span>
                <input value={form.marque} onChange={set("marque")} placeholder="ex. Clearflow" />
              </label>
              <label>
                <span>Nom du produit</span>
                <input value={form.produit} onChange={set("produit")} placeholder="ex. Clearflow Cayenne Complex" />
              </label>
              <label>
                <span>Profil client visé</span>
                <input value={form.profil} onChange={set("profil")} placeholder="ex. femmes 45+, cholestérol élevé" />
              </label>
              <label>
                <span>Langue du site</span>
                <select value={form.langue} onChange={set("langue")}>
                  <option value="anglais">Anglais</option>
                  <option value="français">Français</option>
                  <option value="espagnol">Espagnol</option>
                </select>
              </label>
              <label>
                <span>Ton (facultatif)</span>
                <input value={form.ton} onChange={set("ton")} placeholder="ex. rassurant, médical, direct" />
              </label>
              <label>
                <span>Quels textes</span>
                <select value={form.portee} onChange={set("portee")}>
                  <option value="consignes">Seulement les consignes entre crochets</option>
                  <option value="tout">Tous les textes de la page</option>
                </select>
              </label>
            </fieldset>
            <fieldset className="atl-newpage__grid">
              <legend>Ce que tu as</legend>
              <label style={{ gridColumn: "1 / -1" }}>
                <span>
                  Colle tout ce que tu as : description du produit, ingrédients, prix et packs, avis clients, textes de concurrents que tu
                  aimes, résumé ChatGPT… Plus il y a de contexte, meilleurs sont les textes. ({form.infos.trim().length} / {MIN_INFO}{" "}
                  caractères minimum)
                </span>
                <textarea rows={9} value={form.infos} onChange={set("infos")} className="atl-copy__infos" />
              </label>
            </fieldset>
          </div>
        )}

        <footer className="atl-newpage__foot">
          {state?.error && <span className="atl-topbar__error">{state.error}</span>}
          <button type="button" onClick={onClose}>
            {state?.done ? "Fermer" : "Annuler"}
          </button>
          {!state?.done && (
            <button type="button" className="atl-newpage__create" disabled={state?.busy} onClick={send}>
              {state?.busy ? "Envoi…" : "Enregistrer et demander les textes"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
