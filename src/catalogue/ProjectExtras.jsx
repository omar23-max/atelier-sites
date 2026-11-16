import { useState } from "react";
import { designById } from "../engine/designs.js";
import { pageTypeById } from "../engine/page-types.js";

// Onglets de la fiche projet : Marque, Créatives, Offre, Publication.
// Tout est enregistré dans projets/<id>.json ; les fichiers (logos, brand
// board, créatives) dans medias/projet-<id>/.

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

async function upload(projectId, file) {
  const res = await fetch(`/api/medias/projet-${projectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, dataUrl: await readAsDataUrl(file) }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body.url;
}

export async function request(type, notes, details) {
  const res = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, notes, details }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body.dossier;
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : null);

function UploadButton({ label, multiple, onFiles, busy }) {
  return (
    <label className={`cat-btn cat-btn--ghost cat-upload${busy ? " is-busy" : ""}`}>
      <input type="file" accept="image/*" multiple={multiple} hidden onChange={(e) => (onFiles([...e.target.files]), (e.target.value = ""))} />
      {busy ? "Envoi…" : label}
    </label>
  );
}

// Le design du projet : celui de ses pages (un seul par projet).
export const projectDesignOf = (pages) => designById[pages.map((p) => p.data?.root?.props?.design).find(Boolean)] ?? null;

// ---- Marque : logos, palette, polices, brand board, ton ----
export function BrandTab({ project, pages, onSave, onMessage }) {
  const brand = project.marque ?? {};
  const [form, setForm] = useState({
    logos: brand.logos ?? [],
    palette: brand.palette ?? [],
    titres: brand.titres ?? "",
    texte: brand.texte ?? "",
    brandBoard: brand.brandBoard ?? "",
    ton: brand.ton ?? "",
  });
  const [busy, setBusy] = useState(null);
  const design = projectDesignOf(pages);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function addFiles(key, files) {
    setBusy(key);
    try {
      const urls = [];
      for (const f of files) urls.push(await upload(project.id, f));
      set(key === "logos" ? { logos: [...form.logos, ...urls] } : { brandBoard: urls[0] });
    } catch (e) {
      if (!e.shown) onMessage({ error: true, text: e.message });
    } finally {
      setBusy(null);
    }
  }

  function fromDesign() {
    const c = design.tokens.couleurs ?? {};
    set({
      palette: ["fond", "texte", "accent", "bouton", "fond-sombre", "surface"].map((r) => c[r]).filter(Boolean),
      titres: design.tokens.polices?.titres ?? form.titres,
      texte: design.tokens.polices?.texte ?? form.texte,
    });
  }

  async function askDesign() {
    try {
      const dossier = await request("design", `Projet « ${project.nom} » : créer ${project.id}-design.md à partir de son kit de marque et l'appliquer à ses pages.`, {
        projet: project.id,
        depuisKitDeMarque: true,
      });
      onMessage({ text: `Demande enregistrée (${dossier}). Dis à Claude « traite les demandes ».` });
    } catch (e) {
      if (!e.shown) onMessage({ error: true, text: e.message });
    }
  }

  return (
    <div className="cat-extra">
      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>Logos</strong>
          <UploadButton label="+ Ajouter des logos" multiple busy={busy === "logos"} onFiles={(f) => addFiles("logos", f)} />
        </div>
        {form.logos.length ? (
          <div className="cat-gallery">
            {form.logos.map((u) => (
              <figure key={u}>
                <img src={u} alt="" />
                <button type="button" className="cat-link" onClick={() => set({ logos: form.logos.filter((x) => x !== u) })}>
                  Retirer
                </button>
              </figure>
            ))}
          </div>
        ) : (
          <p className="cat-muted">Aucun logo. Ajoute tes propositions de logo (PNG transparent de préférence).</p>
        )}
      </section>

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>Palette et polices</strong>
          {design && (
            <button type="button" className="cat-link" onClick={fromDesign}>
              Reprendre celles de {design.id}.md
            </button>
          )}
        </div>
        <div className="cat-palette">
          {form.palette.map((c, i) => (
            <span key={i} className="cat-palette__chip">
              <input type="color" value={c} onChange={(e) => set({ palette: form.palette.map((x, j) => (j === i ? e.target.value : x)) })} />
              <code>{c}</code>
              <button type="button" onClick={() => set({ palette: form.palette.filter((_, j) => j !== i) })} aria-label="Retirer">
                ×
              </button>
            </span>
          ))}
          <button type="button" className="cat-btn cat-btn--ghost" onClick={() => set({ palette: [...form.palette, "#000000"] })}>
            + Couleur
          </button>
        </div>
        <div className="cat-use__row cat-use__row--2">
          <label className="cat-field">
            <span>Police des titres</span>
            <input value={form.titres} onChange={(e) => set({ titres: e.target.value })} placeholder="ex. Fraunces" />
          </label>
          <label className="cat-field">
            <span>Police du texte</span>
            <input value={form.texte} onChange={(e) => set({ texte: e.target.value })} placeholder="ex. Inter" />
          </label>
        </div>
      </section>

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>Brand board</strong>
          <UploadButton label={form.brandBoard ? "Remplacer" : "+ Ajouter"} busy={busy === "board"} onFiles={(f) => addFiles("board", f)} />
        </div>
        {form.brandBoard ? <img className="cat-board" src={form.brandBoard} alt="" /> : <p className="cat-muted">La planche de la marque : logo, couleurs, typos, ambiance.</p>}
        <label className="cat-field">
          <span>Ton et personnalité de la marque</span>
          <textarea rows={3} value={form.ton} onChange={(e) => set({ ton: e.target.value })} placeholder="ex. rassurant, scientifique, chaleureux ; tutoiement ; pas de jargon" />
        </label>
      </section>

      <div className="cat-actions">
        <button type="button" className="cat-btn cat-btn--ghost" onClick={askDesign}>
          Créer le design.md du projet depuis ce kit
        </button>
        <button type="button" className="cat-btn" onClick={() => onSave({ marque: form })}>
          Enregistrer la marque
        </button>
      </div>
    </div>
  );
}

// ---- Créatives publicitaires ----
const FORMATS = ["1:1", "4:5", "9:16", "16:9"];
const STATUTS = ["à faire", "prête", "en ligne"];

export function CreativesTab({ project, onSave, onMessage }) {
  const [items, setItems] = useState(project.creatives ?? []);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState({ formats: ["1:1", "4:5", "9:16"], nombre: 3, consigne: "" });

  async function addFiles(files) {
    setBusy(true);
    try {
      const added = [];
      for (const f of files) added.push({ url: await upload(project.id, f), format: "1:1", titre: "", statut: "prête" });
      setItems([...items, ...added]);
    } catch (e) {
      if (!e.shown) onMessage({ error: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const update = (i, patch) => setItems(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function askCreatives() {
    try {
      const dossier = await request(
        "creatives",
        `Projet « ${project.nom} » : ${ask.nombre} créative(s) publicitaire(s) par format (${ask.formats.join(", ")}) avec le produit du projet. ${ask.consigne}`.trim(),
        { projet: project.id, ...ask },
      );
      onMessage({ text: `Demande enregistrée (${dossier}). Dis à Claude « traite les demandes » (génération Nano Banana : facturation Google requise).` });
    } catch (e) {
      if (!e.shown) onMessage({ error: true, text: e.message });
    }
  }

  return (
    <div className="cat-extra">
      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>Créatives ({items.length})</strong>
          <UploadButton label="+ Ajouter des créatives" multiple busy={busy} onFiles={addFiles} />
        </div>
        {items.length === 0 ? (
          <p className="cat-muted">Aucune créative. Ajoute les tiennes ou demande-les ci-dessous.</p>
        ) : (
          <div className="cat-creatives">
            {items.map((c, i) => (
              <article key={c.url} className="cat-creative">
                <a href={c.url} target="_blank" rel="noreferrer" className={`cat-creative__img cat-creative__img--${c.format.replace(":", "x")}`}>
                  <img src={c.url} alt="" />
                </a>
                <input value={c.titre} onChange={(e) => update(i, { titre: e.target.value })} placeholder="Angle / accroche" />
                <span className="cat-creative__row">
                  <select value={c.format} onChange={(e) => update(i, { format: e.target.value })}>
                    {FORMATS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <select value={c.statut} onChange={(e) => update(i, { statut: e.target.value })}>
                    {STATUTS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button type="button" className="cat-link" onClick={() => confirm("Retirer cette créative du projet ?") && setItems(items.filter((_, j) => j !== i))}>
                    Retirer
                  </button>
                </span>
              </article>
            ))}
          </div>
        )}
        <div className="cat-actions">
          <button type="button" className="cat-btn" onClick={() => onSave({ creatives: items })}>
            Enregistrer les créatives
          </button>
        </div>
      </section>

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>Demander des créatives</strong>
        </div>
        <div className="cat-formats">
          {FORMATS.map((f) => (
            <label key={f}>
              <input
                type="checkbox"
                checked={ask.formats.includes(f)}
                onChange={(e) => setAsk({ ...ask, formats: e.target.checked ? [...ask.formats, f] : ask.formats.filter((x) => x !== f) })}
              />
              {f} {f === "1:1" ? "(fil)" : f === "4:5" ? "(fil Meta)" : f === "9:16" ? "(stories, reels)" : "(bannière)"}
            </label>
          ))}
          <label>
            Nombre par format
            <input type="number" min={1} max={10} value={ask.nombre} onChange={(e) => setAsk({ ...ask, nombre: Number(e.target.value) })} />
          </label>
        </div>
        <label className="cat-field">
          <span>Angles, accroches, consignes (facultatif)</span>
          <textarea rows={2} value={ask.consigne} onChange={(e) => setAsk({ ...ask, consigne: e.target.value })} placeholder="ex. avant/après, avis client en gros plan, offre 3+2" />
        </label>
        <div className="cat-actions">
          <button type="button" className="cat-btn" disabled={!ask.formats.length} onClick={askCreatives}>
            Demander les créatives
          </button>
        </div>
      </section>
    </div>
  );
}

// ---- Offre ----
const OFFER_FIELDS = [
  ["promesse", "Promesse (le résultat rêvé)", "ex. Une circulation plus fluide en 30 jours, sans médicament", 2],
  ["cible", "Client visé", "ex. Femmes 45+, cholestérol limite, fatiguées des traitements", 2],
  ["prix", "Prix et prix barré", "ex. 30 $ l'unité (au lieu de 45 $)", 1],
  ["packs", "Packs", "ex. 1 = 30 $ ; 2+1 = 60 $ ; 3+2 = 90 $ (le plus populaire)", 2],
  ["garantie", "Garantie", "ex. Satisfait ou remboursé 120 jours, même flacon vide", 2],
  ["bonus", "Bonus offerts", "ex. Ebook « 10 signes cachés », plan repas 30 jours", 2],
  ["urgence", "Urgence / rareté", "ex. Offre limitée, stock du lot, compte à rebours", 1],
  ["angles", "Angles de vente", "Un angle par ligne", 3],
  ["objections", "Objections et réponses", "« C'est trop cher » → … (une par ligne)", 3],
];

export function OfferTab({ project, onSave, onMessage }) {
  const [form, setForm] = useState(project.offre ?? {});

  async function askOffer() {
    try {
      await onSave({ offre: form }, true);
      const dossier = await request(
        "offre",
        `Projet « ${project.nom} » : construire / renforcer l'offre (méthode Hormozi : offre, prix, angles, objections) à partir de la fiche, puis compléter l'onglet Offre.`,
        { projet: project.id },
      );
      onMessage({ text: `Demande enregistrée (${dossier}). Dis à Claude « traite les demandes ».` });
    } catch (e) {
      if (!e.shown) onMessage({ error: true, text: e.message });
    }
  }

  return (
    <div className="cat-extra">
      <section className="cat-panel cat-offer">
        {OFFER_FIELDS.map(([key, label, placeholder, rows]) => (
          <label key={key} className="cat-field">
            <span>{label}</span>
            {rows > 1 ? (
              <textarea rows={rows} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />
            ) : (
              <input value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />
            )}
          </label>
        ))}
      </section>
      <div className="cat-actions">
        <button type="button" className="cat-btn cat-btn--ghost" onClick={askOffer}>
          Travailler l'offre avec Claude (méthode Hormozi)
        </button>
        <button type="button" className="cat-btn" onClick={() => onSave({ offre: form })}>
          Enregistrer l'offre
        </button>
      </div>
    </div>
  );
}

// ---- Publication : export HTML, page par page ----
export function PublicationTab({ project, pages }) {
  const pub = project.publication ?? {};

  return (
    <div className="cat-extra">
      <p className="cat-muted">
        L'export HTML est noté automatiquement (bouton « HTML » de l'atelier).
      </p>
      {pages.length === 0 ? (
        <div className="cat-empty">Ce projet n'a pas encore de page.</div>
      ) : (
        <table className="cat-table">
          <thead>
            <tr>
              <th>Page</th>
              <th>HTML téléchargé</th>
            </tr>
          </thead>
          <tbody>
            {pages.map(({ info }) => {
              const p = pub[info.name] ?? {};
              return (
                <tr key={info.name}>
                  <td>
                    <b>{pageTypeById[info.pageType]?.label ?? info.title}</b>
                    <small className="cat-muted">{info.name}</small>
                  </td>
                  <td>{p.html ? fmtDate(p.html.le) : <span className="cat-muted">jamais</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
