import { useState } from "react";
import { FAMILIES } from "../engine/families.js";

export const METHODS = [
  {
    id: "capture",
    short: "Depuis une capture d'écran",
    title: "1. Depuis des captures d'écran",
    text: "Colle ou dépose une ou plusieurs captures d'une section que tu aimes (desktop, et mobile si tu l'as). Je la code à l'identique dans le format de l'atelier, avec des textes à remplacer.",
  },
  {
    id: "site",
    short: "Depuis un site web",
    title: "2. Depuis un site web",
    text: "Donne l'adresse d'une page. Je la capture (desktop et mobile, styles réels, comportements avec REA), je reconstruis chaque section demandée et je la range dans sa famille.",
  },
  {
    id: "bibliotheque",
    short: "Depuis une bibliothèque de sections",
    title: "3. Depuis une bibliothèque de sections",
    text: "Un site qui propose des sections toutes faites, gratuit ou payant. Je reprends les sections choisies au format de l'atelier.",
  },
  {
    id: "design",
    short: "Extraire un design.md",
    title: "4. Extraire le design.md d'un site",
    text: "Seulement l'univers visuel d'un site (polices, couleurs, formes), sans ses sections. Il rejoint le catalogue des designs pour être essayé sur tes pages.",
  },
  {
    id: "ia",
    short: "Générer avec l'IA",
    title: "5. Générer avec l'IA",
    text: "Pour une famille où tu n'as encore aucun modèle réel. Décris la section ; je la conçois, de préférence en m'appuyant sur une référence (capture ou site) pour rester loin du « site généré par IA ».",
  },
];

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

function FamilySelect({ value, onChange }) {
  return (
    <label className="cat-field">
      <span>Famille</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Au choix (je la déduis)</option>
        {FAMILIES.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Images({ images, setImages }) {
  async function add(files) {
    const list = [...files].filter((f) => f.type.startsWith("image/")).slice(0, 10);
    const urls = await Promise.all(list.map(readAsDataUrl));
    setImages((prev) => [...prev, ...urls].slice(0, 10));
  }
  return (
    <div
      className="cat-drop"
      tabIndex={0}
      onPaste={(e) => add(e.clipboardData.files)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(e.dataTransfer.files);
      }}
    >
      <p>
        Glisse tes captures ici, colle-les (Ctrl + V après avoir cliqué dans ce cadre), ou{" "}
        <label className="cat-link">
          choisis des fichiers
          <input type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
        </label>
        .
      </p>
      {images.length > 0 && (
        <div className="cat-drop__list">
          {images.map((src, i) => (
            <figure key={i}>
              <img src={src} alt="" />
              <button type="button" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))} aria-label="Retirer">
                ×
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function Method({ method, children, onSubmit, busy }) {
  return (
    <section className="cat-panel" id={`m-${method.id}`}>
      <div className="cat-panel__head">
        <h3>{method.title}</h3>
      </div>
      <p className="cat-muted">{method.text}</p>
      <form
        className="cat-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
        <div>
          <button type="submit" className="cat-btn" disabled={busy}>
            {busy ? "Envoi…" : "Enregistrer la demande"}
          </button>
        </div>
      </form>
    </section>
  );
}

export function Enrichir({ onSent, onError }) {
  const [busy, setBusy] = useState(null);
  const [capture, setCapture] = useState({ family: "", notes: "" });
  const [captureImages, setCaptureImages] = useState([]);
  const [site, setSite] = useState({ url: "", sections: "", family: "", notes: "" });
  const [lib, setLib] = useState({ url: "", sections: "", family: "", notes: "" });
  const [ia, setIa] = useState({ family: "", notes: "" });
  const [iaImages, setIaImages] = useState([]);

  async function send(type, payload, reset) {
    setBusy(type);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      reset();
      onSent(data.dossier);
    } catch (e) {
      onError(`Échec de l'envoi : ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  const [m1, m2, m3, mDesign, m4] = METHODS;
  const [designReq, setDesignReq] = useState({ url: "", notes: "" });

  return (
    <>
      <h1>Enrichir le catalogue</h1>
      <p className="cat-lead">Chaque demande est enregistrée dans le dossier « demandes » du projet. Dis-moi ensuite « traite les demandes du catalogue ».</p>

      <Method
        method={m1}
        busy={busy === "capture"}
        onSubmit={() => {
          if (!captureImages.length) return onError("Ajoute au moins une capture d'écran.");
          send("capture", { ...capture, images: captureImages }, () => {
            setCapture({ family: "", notes: "" });
            setCaptureImages([]);
          });
        }}
      >
        <Images images={captureImages} setImages={setCaptureImages} />
        <FamilySelect value={capture.family} onChange={(family) => setCapture({ ...capture, family })} />
        <label className="cat-field">
          <span>Consignes (optionnel)</span>
          <textarea rows={2} placeholder="Ex. : garder l'effet de survol des cartes ; en mobile, une carte par ligne." value={capture.notes} onChange={(e) => setCapture({ ...capture, notes: e.target.value })} />
        </label>
      </Method>

      <Method
        method={m2}
        busy={busy === "site"}
        onSubmit={() => {
          if (!/^https?:\/\//.test(site.url)) return onError("Indique l'adresse complète de la page (https://…).");
          send("site", site, () => setSite({ url: "", sections: "", family: "", notes: "" }));
        }}
      >
        <label className="cat-field">
          <span>Adresse de la page</span>
          <input type="url" placeholder="https://exemple.com/products/…" value={site.url} onChange={(e) => setSite({ ...site, url: e.target.value })} />
        </label>
        <label className="cat-field">
          <span>Sections à prélever</span>
          <input placeholder="Toutes, ou ex. : la FAQ, le comparatif et les avis" value={site.sections} onChange={(e) => setSite({ ...site, sections: e.target.value })} />
        </label>
        <FamilySelect value={site.family} onChange={(family) => setSite({ ...site, family })} />
        <label className="cat-field">
          <span>Consignes (optionnel)</span>
          <textarea rows={2} value={site.notes} onChange={(e) => setSite({ ...site, notes: e.target.value })} />
        </label>
      </Method>

      <Method
        method={m3}
        busy={busy === "bibliotheque"}
        onSubmit={() => {
          if (!/^https?:\/\//.test(lib.url)) return onError("Indique l'adresse de la bibliothèque ou de la section (https://…).");
          send("bibliotheque", lib, () => setLib({ url: "", sections: "", family: "", notes: "" }));
        }}
      >
        <div className="cat-info">
          <strong>À vérifier avant d'importer :</strong> la licence. Les bibliothèques libres (licence MIT, par exemple HyperUI, Flowbite, Preline UI) peuvent être réutilisées librement. Les sections payantes (thèmes, apps de sections Shopify, packs vendus) sont souvent réservées à l'usage prévu par le vendeur : je reprends la mise en page, pas leur code. Si un compte est nécessaire, tu te connectes toi-même dans le navigateur, je ne saisis jamais tes identifiants.
        </div>
        <label className="cat-field">
          <span>Adresse de la bibliothèque ou de la section</span>
          <input type="url" placeholder="https://…" value={lib.url} onChange={(e) => setLib({ ...lib, url: e.target.value })} />
        </label>
        <label className="cat-field">
          <span>Sections à reprendre</span>
          <input placeholder="Ex. : les 3 modèles de FAQ, les blocs témoignages" value={lib.sections} onChange={(e) => setLib({ ...lib, sections: e.target.value })} />
        </label>
        <FamilySelect value={lib.family} onChange={(family) => setLib({ ...lib, family })} />
        <label className="cat-field">
          <span>Consignes (optionnel)</span>
          <textarea rows={2} value={lib.notes} onChange={(e) => setLib({ ...lib, notes: e.target.value })} />
        </label>
      </Method>

      <Method
        method={mDesign}
        busy={busy === "design"}
        onSubmit={() => {
          if (!/^https?:\/\//.test(designReq.url)) return onError("Indique l'adresse complète du site (https://…).");
          send("design", designReq, () => setDesignReq({ url: "", notes: "" }));
        }}
      >
        <label className="cat-field">
          <span>Adresse du site</span>
          <input type="url" placeholder="https://exemple.com" value={designReq.url} onChange={(e) => setDesignReq({ ...designReq, url: e.target.value })} />
        </label>
        <label className="cat-field">
          <span>Consignes (optionnel)</span>
          <textarea rows={2} placeholder="Ex. : prendre aussi les couleurs de la page produit." value={designReq.notes} onChange={(e) => setDesignReq({ ...designReq, notes: e.target.value })} />
        </label>
      </Method>

      <Method
        method={m4}
        busy={busy === "ia"}
        onSubmit={() => {
          if (!ia.notes.trim()) return onError("Décris la section à générer.");
          send("ia", { ...ia, images: iaImages }, () => {
            setIa({ family: "", notes: "" });
            setIaImages([]);
          });
        }}
      >
        <FamilySelect value={ia.family} onChange={(family) => setIa({ ...ia, family })} />
        <label className="cat-field">
          <span>Description de la section</span>
          <textarea
            rows={3}
            placeholder="Ex. : bloc « Ingrédients » avec 4 ingrédients en cartes rondes, photo + nom + bénéfice, fond crème, style épuré."
            value={ia.notes}
            onChange={(e) => setIa({ ...ia, notes: e.target.value })}
          />
        </label>
        <p className="cat-muted">Référence visuelle (optionnelle mais recommandée) :</p>
        <Images images={iaImages} setImages={setIaImages} />
      </Method>
    </>
  );
}
