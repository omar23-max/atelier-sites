import { useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { sections } from "./engine/sections.js";
import { normalizeProps } from "./engine/render.js";
import { atelierImagesOf, buildShopifySectionFile, buildShopifyTemplate } from "./engine/shopify.js";
import { pageTypeById } from "./engine/page-types.js";
import { originalPhotoTargets } from "./engine/photos.js";

// « Publier sur Shopify » : deux façons.
//  1. Envoyer : demande « shopify » que Claude traite (copie NON publiée du thème,
//     via la connexion Shopify), puis la note dans l'onglet Publication du projet.
//  2. Télécharger le code Liquid (.zip) : sections + modèle de page + mode d'emploi,
//     à ajouter soi-même dans le thème (Modifier le code). Un zip importé comme
//     thème remplacerait tout le thème : on ne fait pas ça.

const pageName = new URLSearchParams(location.search).get("page");
const byId = Object.fromEntries(sections.map((s) => [s.id, s]));

// Fichiers Shopify de la page : une section .liquid par type utilisé + le modèle.
function buildFiles(data) {
  const used = [...new Set((data.content ?? []).map((c) => c.type))].map((t) => byId[t]).filter(Boolean);
  const invalid = used.filter((s) => s.errors?.length);
  const page = { ...data, content: (data.content ?? []).map((c) => (byId[c.type] ? { ...c, props: normalizeProps(byId[c.type], c.props) } : c)) };
  const achat = pageTypeById[data.root?.props?.pageType]?.id === "produit";
  const templateFile = `templates/${achat ? "product" : "page"}.atelier-${pageName}.json`;
  const files = used.map((s) => ({ path: `sections/atl-${s.id}.liquid`, content: buildShopifySectionFile(s) }));
  files.push({ path: templateFile, content: JSON.stringify(buildShopifyTemplate(page, byId), null, 2) });
  // Images créées dans l'atelier (jamais les photos d'origine) : à envoyer dans
  // les Fichiers de la boutique, sous le nom utilisé par le modèle.
  const images = atelierImagesOf(page);
  return { files, templateFile, used, invalid, achat, images };
}

const imagesStep = (images) =>
  images.length
    ? `  0. Contenu → Fichiers → Téléverser des fichiers : les ${images.length} image(s) du dossier
     « images » de ce zip, SANS les renommer (le modèle les appelle par leur nom).
`
    : "";

const README = ({ templateFile, achat, used, photos, images }) => `ATELIER — code Liquid de la page « ${pageName} »
${"=".repeat(60)}

Contenu :
${used.map((s) => `  sections/atl-${s.id}.liquid`).join("\n")}
  ${templateFile}

Installer dans Shopify (toujours sur une COPIE du thème, jamais le thème en ligne) :
${imagesStep(images)}  1. Boutique en ligne → Thèmes → « … » à côté du thème → Dupliquer.
  2. Sur la copie : « … » → Modifier le code.
  3. Dossier « sections » → Ajouter une section → nom « atl-… » (sans .liquid)
     → coller le contenu du fichier correspondant. Une fois par fichier.
  4. Dossier « templates » → Ajouter un modèle → type « ${achat ? "product" : "page"} »
     → nom « atelier-${pageName} » → JSON → coller le contenu du modèle.
  5. ${achat ? "Produits → ton produit → Modèle de thème" : "Pages → ta page → Modèle de thème"} : choisir « atelier-${pageName} ».
  6. Aperçu de la copie du thème pour vérifier, puis publier quand tout est prêt.

${
  images.length
    ? `Images incluses : les ${images.length} image(s) créée(s) dans l'atelier (dossier « images »).`
    : "Aucune image créée dans l'atelier : ajoute tes images dans l'éditeur de thème Shopify."
}${photos ? `\nAttention : ${photos} photo(s) d'origine du site d'inspiration ne sont pas incluses (elles ne doivent jamais être publiées).` : ""}
`;

export function ShopifyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="atl-shopify-btn" onClick={() => setOpen(true)} title="Envoyer la page dans une copie de ton thème Shopify, ou télécharger son code">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8h12l-1 13H7L6 8Z" />
          <path d="M9 8a3 3 0 0 1 6 0" />
        </svg>
        Publier sur Shopify
      </button>
      {open && createPortal(<ShopifyDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ShopifyDialog({ onClose }) {
  const getPuck = useGetPuck();
  const data = getPuck().appState.data;
  const info = buildFiles(data);
  const photos = originalPhotoTargets(data.content ?? []).length;
  const [state, setState] = useState(null);

  const savePage = async () => {
    const res = await fetch(`/api/pages/${pageName}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(getPuck().appState.data) });
    if (!res.ok) throw new Error((await res.json()).error);
  };

  async function send() {
    setState({ busy: "send" });
    try {
      await savePage();
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "shopify",
          page: pageName,
          notes: `Envoyer la page « ${pageName} » dans une copie NON publiée du thème Shopify (${info.used.length} section(s) + ${info.templateFile}).`,
          details: {
            page: pageName,
            projet: data.root?.props?.projet ?? null,
            template: info.templateFile,
            sections: info.used.map((s) => s.id),
            images: info.images, // [{ src, name }] : à téléverser dans Contenu → Fichiers, sous ce nom
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setState({ sent: body.dossier });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  async function download() {
    setState({ busy: "zip" });
    try {
      await savePage();
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const f of info.files) zip.file(f.path, f.content);
      for (const img of info.images) zip.file(`images/${img.name}`, await (await fetch(img.src)).blob());
      zip.file("LISEZ-MOI.txt", README({ ...info, photos }));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `shopify-${pageName}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setState({ zipped: true });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  return (
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="atl-modal__panel atl-newpage">
        <header className="atl-modal__head">
          <h2>Publier sur Shopify</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="atl-newpage__body">
          <p className="atl-newpage__hint" style={{ margin: 0 }}>
            {info.used.length} section(s) Shopify, le modèle <code>{info.templateFile}</code>
            {info.images.length ? ` et ${info.images.length} image(s) créée(s) dans l'atelier` : " (aucune image créée dans l'atelier pour l'instant)"}. Toujours dans une <b>copie non publiée</b> du
            thème : ta boutique en ligne n'est jamais modifiée.
            {photos > 0 && ` ${photos} photo(s) d'origine ne partent pas : remplace-les par tes images (Régénérer → images).`}
          </p>
          {info.invalid.length > 0 && (
            <p className="atl-topbar__error" style={{ margin: 0 }}>
              À corriger avant l'envoi : {info.invalid.map((s) => `${s.id} (${s.errors[0]})`).join(" ; ")}
            </p>
          )}
          <div className="atl-choices">
            <button type="button" disabled={!!state?.busy || info.invalid.length > 0} onClick={send}>
              <b>1. Envoyer sur Shopify (recommandé)</b>
              <small>
                Claude envoie les sections et le modèle dans une copie non publiée de ton thème, puis le note dans l'onglet Publication du
                projet. Dis-lui ensuite « traite les demandes ».
              </small>
            </button>
            <button type="button" disabled={!!state?.busy || info.invalid.length > 0} onClick={download}>
              <b>2. Télécharger le code Liquid (.zip)</b>
              <small>Les fichiers .liquid, le modèle de page et un mode d'emploi pour les ajouter toi-même (Thèmes → Modifier le code).</small>
            </button>
          </div>
          {state?.sent && (
            <div className="atl-done">
              <b>Demande enregistrée</b>
              <span>Dis à Claude « traite les demandes » : la page part dans une copie non publiée de ton thème.</span>
            </div>
          )}
          {state?.zipped && (
            <div className="atl-done">
              <b>Zip téléchargé</b>
              <span>Ouvre LISEZ-MOI.txt dans le zip : les étapes pour l'ajouter à une copie de ton thème.</span>
            </div>
          )}
          {state?.busy && <p className="atl-newpage__hint">{state.busy === "zip" ? "Préparation du zip…" : "Envoi…"}</p>}
          {state?.error && <p className="atl-topbar__error">{state.error}</p>}
        </div>
        <footer className="atl-newpage__foot">
          <button type="button" onClick={onClose}>
            Fermer
          </button>
        </footer>
      </div>
    </div>
  );
}
