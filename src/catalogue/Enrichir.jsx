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
    text: "Donne l'adresse d'une page. Je la capture (ordinateur et téléphone, avec ses vrais styles et ses animations), je reconstruis chaque section demandée et je la range dans sa famille.",
  },
  {
    id: "bibliotheque",
    short: "Depuis une bibliothèque de sections",
    title: "3. Depuis une bibliothèque de sections",
    text: "Un site qui propose des sections toutes faites, gratuit ou payant. Je reprends les sections choisies au format de l'atelier.",
  },
  {
    id: "design",
    short: "Reprendre le style d'un site",
    title: "4. Reprendre le style d'un site (design.md)",
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

// Toutes les adresses web trouvées dans un texte ou un tableau, sans doublon.
const URL_RE = /https?:\/\/[^\s"',;<>()]+/g;
const MAX_URLS = 100;
function extractUrls(text) {
  return [...new Set((String(text).match(URL_RE) ?? []).map((u) => u.replace(/[.)\]]+$/, "")))].slice(0, MAX_URLS);
}

// Plusieurs pages d'un coup : fichier Excel / CSV, lien Google Sheets, ou
// adresses collées. Une demande est créée par adresse cochée.
function UrlBatch({ urls, setUrls, onError }) {
  const [sheet, setSheet] = useState("");
  const [busy, setBusy] = useState(false);

  function addFound(found, source) {
    if (!found.length) return onError(`Aucune adresse web (https://…) trouvée dans ${source}.`);
    setUrls((prev) => {
      const known = new Set(prev.map((u) => u.url));
      return [...prev, ...found.filter((u) => !known.has(u)).map((url) => ({ url, on: true }))].slice(0, MAX_URLS);
    });
  }

  async function readFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      if (/\.(csv|txt)$/i.test(file.name)) {
        addFound(extractUrls(await file.text()), file.name);
      } else {
        // Excel : toutes les feuilles, toutes les cellules (y compris les liens).
        const XLSX = await import("xlsx");
        const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const parts = [];
        for (const name of book.SheetNames) {
          const ws = book.Sheets[name];
          for (const [key, cell] of Object.entries(ws)) {
            if (key.startsWith("!")) continue;
            parts.push(cell.l?.Target ?? "", String(cell.v ?? ""));
          }
        }
        addFound(extractUrls(parts.join("\n")), file.name);
      }
    } catch (e) {
      onError(`Lecture impossible : ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function readSheet() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sheet?url=${encodeURIComponent(sheet.trim())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      addFound(extractUrls(body.csv), "la Google Sheet");
      setSheet("");
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const checked = urls.filter((u) => u.on).length;
  return (
    <div className="cat-batch">
      <strong>Plusieurs pages d'un coup</strong>
      <div className="cat-batch__sources">
        <label className="cat-btn cat-btn--ghost">
          <input type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={(e) => (readFile(e.target.files?.[0]), (e.target.value = ""))} />
          {busy ? "Lecture…" : "Importer un fichier Excel / CSV"}
        </label>
        <span className="cat-batch__sheet">
          <input value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="ou colle le lien d'une Google Sheet" />
          <button type="button" className="cat-btn cat-btn--ghost" disabled={busy || !sheet.trim()} onClick={readSheet}>
            Lire
          </button>
        </span>
      </div>
      <textarea
        rows={2}
        placeholder="ou colle ici des adresses (une par ligne, ou tout un texte : je trouve les liens)"
        onBlur={(e) => {
          if (e.target.value.trim()) {
            addFound(extractUrls(e.target.value), "le texte collé");
            e.target.value = "";
          }
        }}
      />
      <p className="cat-muted">
        Je prends toutes les adresses https:// du fichier, quelle que soit la colonne (100 au plus). La Google Sheet doit être partagée en « Tous
        les utilisateurs disposant du lien ».
      </p>
      {urls.length > 0 && (
        <>
          <div className="cat-batch__head">
            <span>
              {checked} / {urls.length} page(s) cochée(s) — une demande par page
            </span>
            <button type="button" className="cat-link" onClick={() => setUrls(urls.map((u) => ({ ...u, on: checked !== urls.length })))}>
              {checked === urls.length ? "Tout décocher" : "Tout cocher"}
            </button>
            <button type="button" className="cat-link" onClick={() => setUrls([])}>
              Vider la liste
            </button>
          </div>
          <ul className="cat-batch__list">
            {urls.map((u, i) => (
              <li key={u.url}>
                <label>
                  <input type="checkbox" checked={u.on} onChange={() => setUrls(urls.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
                  <span>{u.url}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Une ligne par source (2026-11-17, audit « source d'abord ») : on choisit
// d'abord d'où vient ce qu'on ajoute, puis seul ce formulaire s'affiche.
const SOURCE_HINTS = {
  capture: "Une image d'une section que tu aimes",
  site: "L'adresse d'une page (ou une liste d'adresses)",
  bibliotheque: "Un site de sections toutes faites",
  design: "Seulement les couleurs, polices et formes",
  ia: "Une section décrite avec tes mots",
};
const SOURCE_ICONS = { capture: "🖼", site: "🌐", bibliotheque: "📚", design: "🎨", ia: "✨" };

function Method({ method, children, onSubmit, busy, submitLabel, hidden }) {
  return (
    <section className="cat-panel" id={`m-${method.id}`} hidden={hidden}>
      <div className="cat-panel__head">
        <h2>{method.title.replace(/^\d+\.\s*/, "")}</h2>
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
            {busy ? "Envoi…" : (submitLabel ?? "Enregistrer la demande")}
          </button>
        </div>
      </form>
    </section>
  );
}

export function Enrichir({ onSent, onError }) {
  const [busy, setBusy] = useState(null);
  const [source, setSource] = useState(null);
  const [capture, setCapture] = useState({ family: "", notes: "" });
  const [captureImages, setCaptureImages] = useState([]);
  const [site, setSite] = useState({ url: "", sections: "", family: "", notes: "" });
  const [batch, setBatch] = useState([]); // [{ url, on }] lues dans un fichier ou une Google Sheet
  const batchChecked = batch.filter((u) => u.on).map((u) => u.url);
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
      <h1>Importer une page ou des sections</h1>
      {!source ? (
        <>
          <p className="cat-lead">D'où vient ce que tu veux ajouter au catalogue ?</p>
          <div className="cat-sources">
            {METHODS.map((m) => (
              <button key={m.id} type="button" className="cat-source" onClick={() => setSource(m.id)}>
                <span className="cat-source__icon" aria-hidden="true">
                  {SOURCE_ICONS[m.id]}
                </span>
                <b>{m.short}</b>
                <small>{SOURCE_HINTS[m.id]}</small>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button type="button" className="cat-link" onClick={() => setSource(null)}>
          ← Choisir une autre source
        </button>
      )}
      <details className="cat-howto">
        <summary>Comment ça marche</summary>
        <p>
          Ta demande est enregistrée (dossier « demandes » de l'atelier) puis apparaît dans l'onglet <b>Demandes</b>, « En attente de Claude ».
          Dis ensuite à Claude « traite les demandes du catalogue » : il capture la page ou lit ta capture, reconstruit les sections au
          format de l'atelier (outils Copycat et REA pour les animations), les range dans leur famille, puis marque la demande « Traitée ». Un
          style seul devient un fichier design.md dans « Designs ».
        </p>
      </details>

      <Method
        hidden={source !== "capture"}
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
        hidden={source !== "site"}
        method={m2}
        busy={busy === "site"}
        submitLabel={batchChecked.length ? `Enregistrer ${batchChecked.length + (site.url ? 1 : 0)} demande(s)` : undefined}
        onSubmit={async () => {
          const all = [...new Set([...(site.url.trim() ? [site.url.trim()] : []), ...batchChecked])];
          if (!all.length) return onError("Indique l'adresse d'une page (https://…), ou importe une liste d'adresses.");
          if (all.some((u) => !/^https?:\/\//.test(u))) return onError("Indique l'adresse complète de la page (https://…).");
          if (all.length === 1) return send("site", { ...site, url: all[0] }, () => (setSite({ url: "", sections: "", family: "", notes: "" }), setBatch([])));
          // Plusieurs pages : une demande par adresse, avec les mêmes consignes.
          setBusy("site");
          let done = 0;
          try {
            for (const url of all) {
              const res = await fetch("/api/requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "site", ...site, url, notes: [site.notes, `Lot de ${all.length} pages.`].filter(Boolean).join(" ") }),
              });
              if (!res.ok) throw new Error((await res.json()).error);
              done++;
            }
            setSite({ url: "", sections: "", family: "", notes: "" });
            setBatch([]);
            onSent(`${done} demandes`);
          } catch (e) {
            onError(`${done} demande(s) enregistrée(s), puis échec : ${e.message}`);
          } finally {
            setBusy(null);
          }
        }}
      >
        <label className="cat-field">
          <span>Adresse de la page</span>
          <input type="url" placeholder="https://exemple.com/products/…" value={site.url} onChange={(e) => setSite({ ...site, url: e.target.value })} />
        </label>
        <UrlBatch urls={batch} setUrls={setBatch} onError={onError} />
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
        hidden={source !== "bibliotheque"}
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
        hidden={source !== "design"}
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
        hidden={source !== "ia"}
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
