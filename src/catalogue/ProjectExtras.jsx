import { useEffect, useState } from "react";
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

// ---- Marque et design (refaite le 2026-11-24) ----
// Identité (nom, slogan, ton), couleurs par rôle avec contrôle de lisibilité,
// polices avec aperçu, logos et planche (téléversés ou proposés par l'IA),
// aperçu de la marque, et proposition complète par l'agent Brand Sprint.
// Enregistré dans projet.marque : nom, slogan, ton, couleurs {rôle: hex},
// polices {titres, texte}, logos, brandBoard (+ palette / titres / texte pour
// les anciens écrans). Les agents lisent nom, couleurs, polices et ton.
const ROLES = [
  ["fond", "Fond", "#ffffff"],
  ["texte", "Texte", "#1a1a1a"],
  ["accent", "Accent", "#2f6fed"],
  ["bouton", "Bouton", "#2f6fed"],
  ["sombre", "Fond sombre", "#111827"],
  ["surface", "Surface (cartes)", "#f4f4f6"],
];
const POLICES = ["Inter", "Poppins", "Montserrat", "DM Sans", "Manrope", "Plus Jakarta Sans", "Outfit", "Lato", "Nunito", "Work Sans", "Playfair Display", "Fraunces", "DM Serif Display", "Cormorant Garamond", "Libre Baskerville", "Lora", "Space Grotesk", "Archivo", "Bebas Neue", "Oswald"];
function lum(hex) {
  const h = String(hex || "").replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(f)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const la = lum(a);
  const lb = lum(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function Lisible({ a, b, label }) {
  const c = contraste(a, b);
  if (c == null) return null;
  return (
    <span className={`cat-brand__ok${c >= 4.5 ? "" : " is-bad"}`} title="Contraste WCAG : 4,5 minimum pour un texte courant">
      {label} : {c >= 4.5 ? "lisible" : "peu lisible"} ({c.toFixed(1)})
    </span>
  );
}
function migrer(brand) {
  const pal = brand.palette ?? [];
  const couleurs = brand.couleurs && typeof brand.couleurs === "object" ? { ...brand.couleurs } : {};
  ROLES.forEach(([k], i) => {
    if (!couleurs[k] && pal[i]) couleurs[k] = pal[i];
  });
  return {
    nom: brand.nom ?? "",
    slogan: brand.slogan ?? "",
    ton: brand.ton ?? "",
    couleurs,
    polices: { titres: brand.polices?.titres ?? brand.titres ?? "", texte: brand.polices?.texte ?? brand.texte ?? "" },
    logos: brand.logos ?? [],
    brandBoard: brand.brandBoard ?? "",
  };
}

export function BrandTab({ project, pages, onSave, onMessage }) {
  const [form, setForm] = useState(() => migrer(project.marque ?? {}));
  const [busy, setBusy] = useState(null);
  const [prop, setProp] = useState(null);
  const [demande, setDemande] = useState("");
  const [propositions, setPropositions] = useState([]);
  const design = projectDesignOf(pages);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const c = (k) => form.couleurs[k] || ROLES.find((r) => r[0] === k)[2];

  // Polices de l'aperçu chargées depuis Google Fonts.
  useEffect(() => {
    const fams = [form.polices.titres, form.polices.texte].filter(Boolean);
    if (!fams.length) return;
    const id = "atl-brand-fonts";
    let l = document.getElementById(id);
    if (!l) {
      l = document.createElement("link");
      l.id = id;
      l.rel = "stylesheet";
      document.head.appendChild(l);
    }
    l.href = `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700`).join("&")}&display=swap`;
  }, [form.polices.titres, form.polices.texte]);

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
    const d = design.tokens.couleurs ?? {};
    set({
      couleurs: { ...form.couleurs, fond: d.fond ?? form.couleurs.fond, texte: d.texte ?? form.couleurs.texte, accent: d.accent ?? form.couleurs.accent, bouton: d.bouton ?? form.couleurs.bouton, sombre: d["fond-sombre"] ?? form.couleurs.sombre, surface: d.surface ?? form.couleurs.surface },
      polices: { titres: design.tokens.polices?.titres ?? form.polices.titres, texte: design.tokens.polices?.texte ?? form.polices.texte },
    });
  }
  async function ia(path, body, quoi) {
    setBusy(quoi);
    try {
      const r = await fetch(`/api/ia/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const t = await r.text();
      const d = JSON.parse(t.trim() || "{}");
      if (!r.ok || d.error) throw new Error(d.error || `Erreur ${r.status}`);
      return d;
    } catch (e) {
      onMessage({ error: true, text: e.message });
      return null;
    } finally {
      setBusy(null);
    }
  }
  async function proposer() {
    const d = await ia("marque-proposer", { projet: project.id, marque: form, consigne: demande }, "agent");
    if (d) setProp(d.proposition);
  }
  function adopter(champs) {
    const p = prop ?? {};
    const patch = {};
    if (champs.includes("nom") && p.nom) patch.nom = p.nom;
    if (champs.includes("slogan") && p.slogan) patch.slogan = p.slogan;
    if (champs.includes("ton") && p.ton) patch.ton = p.ton;
    if (champs.includes("couleurs") && p.couleurs) patch.couleurs = { ...form.couleurs, ...Object.fromEntries(Object.entries(p.couleurs).filter(([, v]) => /^#[0-9a-f]{3,8}$/i.test(String(v)))) };
    if (champs.includes("polices") && p.polices) patch.polices = { titres: p.polices.titres || form.polices.titres, texte: p.polices.texte || form.polices.texte };
    set(patch);
    onMessage({ text: "Proposition reprise dans le formulaire : vérifie, puis « Enregistrer la marque »." });
  }
  async function logosIA() {
    const d = await ia("marque-image", { projet: project.id, type: "logos", marque: form, consigne: demande }, "logos");
    if (d) setPropositions((l) => [...d.urls, ...l]);
  }
  async function plancheIA() {
    const d = await ia("marque-image", { projet: project.id, type: "planche", marque: form, logos: form.logos }, "planche");
    if (d) set({ brandBoard: d.urls[0] });
  }
  function enregistrer() {
    const couleurs = Object.fromEntries(ROLES.map(([k]) => [k, form.couleurs[k]]).filter(([, v]) => v));
    onSave({ marque: { ...(project.marque ?? {}), ...form, couleurs, palette: ROLES.map(([k]) => couleurs[k]).filter(Boolean), titres: form.polices.titres, texte: form.polices.texte } });
  }
  const pret = form.nom && Object.keys(form.couleurs).length >= 3 && form.polices.titres && form.logos.length;

  return (
    <div className="cat-extra cat-brand">
      <section className="cat-panel cat-brand__agent">
        <div className="cat-panel__head">
          <strong>Proposition par l'agent Brand Sprint</strong>
          <span className="cat-muted">{pret ? "Marque complète" : "Nom, couleurs, polices et logo à compléter"}</span>
        </div>
        <p className="cat-muted">L'agent lit les Fondations du projet (produit, client, offre, preuves) et propose nom, slogan, ton, couleurs et polices. Rien n'est enregistré tant que tu ne l'adoptes pas.</p>
        <div className="cat-brand__row">
          <input value={demande} onChange={(e) => setDemande(e.target.value)} placeholder="Ta demande (facultatif) : « haut de gamme et minimal », « couleurs chaudes », « garde le nom »…" />
          <button type="button" className="cat-btn" onClick={proposer} disabled={busy === "agent"}>
            {busy === "agent" ? "L'agent réfléchit… (30 s à 1 min)" : "Proposer la marque · ~0,05 $"}
          </button>
        </div>
        {prop && (
          <div className="cat-brand__prop">
            {prop.noms?.length > 1 && (
              <p className="cat-brand__noms">
                <b>Noms possibles :</b>{" "}
                {prop.noms.map((n) => (
                  <button key={n} type="button" className="cat-brand__nom" onClick={() => set({ nom: n })} title="Choisir ce nom (à enregistrer ensuite)">
                    {n}
                  </button>
                ))}
              </p>
            )}
            <p>
              <b>Nom :</b> {prop.nom} · <b>Slogan :</b> « {prop.slogan} »
            </p>
            <p>
              <b>Ton :</b> {prop.ton}
            </p>
            <div className="cat-brand__swatches">
              {Object.entries(prop.couleurs ?? {}).map(([k, v]) => (
                <span key={k} title={k}>
                  <i style={{ background: v }} />
                  {ROLES.find((r) => r[0] === k)?.[1] ?? k} <code>{v}</code>
                </span>
              ))}
            </div>
            <p>
              <b>Polices :</b> {prop.polices?.titres} (titres) · {prop.polices?.texte} (texte)
            </p>
            {prop.pourquoi && <p className="cat-muted">{prop.pourquoi}</p>}
            <div className="cat-actions">
              <button type="button" className="cat-btn" onClick={() => adopter(["nom", "slogan", "ton", "couleurs", "polices"])}>
                Tout adopter
              </button>
              {["nom", "slogan", "ton", "couleurs", "polices"].map((k) => (
                <button key={k} type="button" className="cat-btn cat-btn--ghost" onClick={() => adopter([k])}>
                  Adopter {k === "nom" ? "le nom" : k === "slogan" ? "le slogan" : k === "ton" ? "le ton" : k === "couleurs" ? "les couleurs" : "les polices"}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>1. Identité</strong>
        </div>
        <div className="cat-use__row cat-use__row--2">
          <label className="cat-field">
            <span>Nom de la marque</span>
            <input value={form.nom} onChange={(e) => set({ nom: e.target.value })} placeholder="ex. NexTap" />
          </label>
          <label className="cat-field">
            <span>Slogan</span>
            <input value={form.slogan} onChange={(e) => set({ slogan: e.target.value })} placeholder="ex. One tap. Every contact." />
          </label>
        </div>
        <label className="cat-field">
          <span>Ton et personnalité</span>
          <textarea rows={3} value={form.ton} onChange={(e) => set({ ton: e.target.value })} placeholder="ex. rassurant, direct, chaleureux ; tutoiement ; pas de jargon" />
        </label>
      </section>

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>2. Couleurs</strong>
          {design && (
            <button type="button" className="cat-link" onClick={fromDesign}>
              Reprendre celles des pages ({design.id}.md)
            </button>
          )}
        </div>
        <div className="cat-brand__roles">
          {ROLES.map(([k, l, def]) => (
            <label key={k} className="cat-brand__role">
              <input type="color" value={form.couleurs[k] || def} onChange={(e) => set({ couleurs: { ...form.couleurs, [k]: e.target.value } })} />
              <span>
                <b>{l}</b>
                <input value={form.couleurs[k] ?? ""} onChange={(e) => set({ couleurs: { ...form.couleurs, [k]: e.target.value } })} placeholder={def} />
              </span>
            </label>
          ))}
        </div>
        <div className="cat-brand__checks">
          <Lisible a={c("texte")} b={c("fond")} label="Texte sur fond" />
          <Lisible a="#ffffff" b={c("bouton")} label="Texte blanc sur bouton" />
          <Lisible a="#ffffff" b={c("sombre")} label="Texte blanc sur fond sombre" />
          <Lisible a={c("texte")} b={c("surface")} label="Texte sur carte" />
        </div>
      </section>

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>3. Polices</strong>
        </div>
        <datalist id="atl-polices">
          {POLICES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="cat-use__row cat-use__row--2">
          <label className="cat-field">
            <span>Titres</span>
            <input list="atl-polices" value={form.polices.titres} onChange={(e) => set({ polices: { ...form.polices, titres: e.target.value } })} placeholder="ex. Fraunces" />
          </label>
          <label className="cat-field">
            <span>Texte</span>
            <input list="atl-polices" value={form.polices.texte} onChange={(e) => set({ polices: { ...form.polices, texte: e.target.value } })} placeholder="ex. Inter" />
          </label>
        </div>
      </section>

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>4. Logos</strong>
          <span className="cat-actions">
            <button type="button" className="cat-btn cat-btn--ghost" onClick={logosIA} disabled={busy === "logos"}>
              {busy === "logos" ? "Création des logos… (30 s)" : "Proposer 4 logos avec l'IA · ~0,16 $"}
            </button>
            <UploadButton label="+ Ajouter des logos" multiple busy={busy === "logos-up"} onFiles={(f) => addFiles("logos", f)} />
          </span>
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
          <p className="cat-muted">Aucun logo retenu. Ajoute les tiens (PNG transparent de préférence) ou demande des propositions à l'IA.</p>
        )}
        {propositions.length > 0 && (
          <>
            <p className="cat-muted">Propositions de l'IA (rangées aussi dans Médias → Créées) : clique « Garder » sur celles qui te plaisent.</p>
            <div className="cat-gallery">
              {propositions.map((u) => (
                <figure key={u}>
                  <img src={u} alt="" />
                  <button type="button" className="cat-link" disabled={form.logos.includes(u)} onClick={() => set({ logos: [...form.logos, u] })}>
                    {form.logos.includes(u) ? "Gardé" : "Garder"}
                  </button>
                </figure>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>5. Planche de marque</strong>
          <span className="cat-actions">
            <button type="button" className="cat-btn cat-btn--ghost" onClick={plancheIA} disabled={busy === "planche"}>
              {busy === "planche" ? "Création de la planche… (30 s)" : "Générer la planche avec l'IA · ~0,04 $"}
            </button>
            <UploadButton label={form.brandBoard ? "Remplacer" : "+ Ajouter"} busy={busy === "board"} onFiles={(f) => addFiles("board", f)} />
          </span>
        </div>
        {form.brandBoard ? <img className="cat-board" src={form.brandBoard} alt="" /> : <p className="cat-muted">La planche réunit logo, couleurs, polices et ambiance. Elle sert de référence aux agents et au Studio.</p>}
      </section>

      <section className="cat-panel">
        <div className="cat-panel__head">
          <strong>6. Aperçu</strong>
        </div>
        <p className="cat-muted">Maquette pour juger tes couleurs et tes polices ensemble : rien n&apos;y est cliquable, le bouton montre seulement son style.</p>
        <div className="cat-brand__apercu" style={{ background: c("fond"), color: c("texte"), fontFamily: form.polices.texte ? `"${form.polices.texte}", sans-serif` : undefined }}>
          <div className="cat-brand__bar" style={{ background: c("surface") }}>
            {form.logos[0] ? <img src={form.logos[0]} alt="" /> : <b style={{ fontFamily: form.polices.titres ? `"${form.polices.titres}", serif` : undefined }}>{form.nom || "Ta marque"}</b>}
          </div>
          <h2 style={{ fontFamily: form.polices.titres ? `"${form.polices.titres}", serif` : undefined, color: c("texte") }}>{form.slogan || "Ton slogan s'affiche ici"}</h2>
          <p>Un paragraphe dans la police du texte, pour juger la lecture : {form.nom || "ta marque"} explique simplement ce qu'elle apporte à ses clients.</p>
          <span className="cat-brand__btn" title="Exemple de bouton (non cliquable)" style={{ background: c("bouton"), cursor: "default" }}>
            Découvrir <span style={{ color: c("accent"), background: "#fff", borderRadius: 999, padding: "0 6px", marginLeft: 6 }}>→</span>
          </span>
          <div className="cat-brand__dark" style={{ background: c("sombre") }}>
            <b style={{ fontFamily: form.polices.titres ? `"${form.polices.titres}", serif` : undefined }}>Bandeau sombre</b> · texte blanc sur le fond sombre
          </div>
        </div>
      </section>

      <div className="cat-actions">
        <button
          type="button"
          className="cat-btn cat-btn--ghost"
          title="Demande à Claude de créer le design.md du projet depuis cette marque et de l'appliquer aux pages"
          onClick={async () => {
            try {
              const dossier = await request("design", `Projet « ${project.nom} » : créer ${project.id}-design.md à partir de son kit de marque et l'appliquer à ses pages.`, { projet: project.id, depuisKitDeMarque: true });
              onMessage({ text: `Demande enregistrée (${dossier}). Dis à Claude « traite les demandes ».` });
            } catch (e) {
              if (!e.shown) onMessage({ error: true, text: e.message });
            }
          }}
        >
          Appliquer aux pages (design.md)
        </button>
        <button type="button" className="cat-btn" onClick={enregistrer}>
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

// Dans les Fondations (audit F04, 2026-11-17) : form / setForm / onSaveAll
// viennent des Fondations, une seule sauvegarde pour le questionnaire, les
// faits, le message et l'offre. Seule (sans ces props) : comme avant.
// Sources uniques (avis ChatGPT, 2026-11-26) : la promesse fait foi dans le
// message central, les prix et packs dans la fiche d'offre chiffrée. Ici on
// montre la source et on signale une copie qui diverge (rien n'est effacé).
const montantsDe = (t) => [...String(t ?? "").matchAll(/(\d+(?:[.,]\d{1,2})?)\s*\$/g)].map((m) => Number(m[1].replace(",", ".")));
const normTxt = (t) => String(t ?? "").toLowerCase().replace(/\s+/g, " ").trim();
function SourceUnique({ k, form, setForm, sources }) {
  if (!sources) return null;
  if (k === "promesse" && String(sources.promesse ?? "").trim()) {
    const src = String(sources.promesse).trim();
    const diff = String(form.promesse ?? "").trim() && !normTxt(form.promesse).includes(normTxt(src));
    return (
      <span className={`cat-src${diff ? " is-diff" : ""}`}>
        Fait foi : la promesse du message central : « {src} ».{" "}
        {diff && <>Ce texte est différent : les pages et les agents suivent le message central. </>}
        {(diff || !String(form.promesse ?? "").trim()) && (
          <button type="button" className="cat-link" onClick={() => setForm({ ...form, promesse: src })}>
            Reprendre celle du message central
          </button>
        )}
      </span>
    );
  }
  if ((k === "prix" || k === "packs") && sources.packs?.length) {
    const prix = new Set(sources.packs.flatMap((x) => [x.prix, x.prixBarre]).filter((v) => v != null && v !== "").map(Number));
    const etrangers = [...new Set(montantsDe(form[k]).filter((n) => !prix.has(n)))];
    return (
      <span className={`cat-src${etrangers.length ? " is-diff" : ""}`}>
        {k === "packs" ? <>Prix de référence (fiche d'offre ci-dessus) : {sources.packs.map((x) => `${x.nom} ${x.prix} $`).join(" · ")}. </> : <>Les prix de référence sont ceux de la fiche d'offre ci-dessus. </>}
        {etrangers.length > 0 && <>Ce texte cite {etrangers.map((n) => `${n} $`).join(", ")}, absent(s) de la fiche : c'est la fiche qui fait foi.</>}
      </span>
    );
  }
  return null;
}

export function OfferTab({ project, onSave, onMessage, form: ctrlForm, setForm: ctrlSet, onSaveAll, sources = null }) {
  const [own, setOwn] = useState(project.offre ?? {});
  const form = ctrlForm ?? own;
  const setForm = ctrlSet ?? setOwn;
  const saveOffer = (silent) => (onSaveAll ? onSaveAll(silent) : onSave({ offre: form }, silent));

  async function askOffer() {
    try {
      await saveOffer(true);
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
            <SourceUnique k={key} form={form} setForm={setForm} sources={sources} />
            {rows > 1 ? (
              <textarea rows={rows} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />
            ) : (
              <input value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />
            )}
          </label>
        ))}
      </section>
      {/* Dans les Fondations (2026-11-25) : un seul « Enregistrer », celui de la
          barre du bas ; l'offre se prépare avec « ✨ Préparer / Relancer : Offre »
          en haut de l'étape (l'ancienne demande à Claude prêtait à confusion). */}
      {!onSaveAll && (
        <div className="cat-actions">
          <button type="button" className="cat-btn cat-btn--ghost" onClick={askOffer}>
            Travailler l'offre avec Claude (méthode Hormozi)
          </button>
          <button type="button" className="cat-btn" onClick={() => saveOffer(false).catch(() => {})}>
            Enregistrer l'offre
          </button>
        </div>
      )}
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
