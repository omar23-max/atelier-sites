import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { IconImage } from "./icons.jsx";
import { originalPhotoTargets } from "./engine/photos.js";
import { designById } from "./engine/designs.js";

export { originalPhotoTargets };

const pageName = new URLSearchParams(location.search).get("page") ?? "brouillon";
const MAX_REFS = 10; // en tout (produit + marque) : limite des demandes

// Deux boîtes, comme Whitelabeler : les photos du produit, et la marque.
const TAGS = {
  produit: ["Face avant", "Dos / étiquette", "Emballage", "Gros plan", "Produit en main", "Autre"],
  marque: ["Logo", "Brand board", "Palette de couleurs", "Exemple de style", "Autre"],
};
// Prix indicatif d'une image gpt-image-2 en qualité moyenne (OpenAI), en $.
// Estimation à ajuster si le tarif change.
const PRIX_IMAGE = 0.05;
const FORMATS = { "1:1": "Carré 1:1 (fil d'actualité)", "4:5": "Portrait 4:5 (Facebook, Instagram)", "9:16": "Story 9:16 (Reels, TikTok)" };

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
const urlToDataUrl = async (url) => readAsDataUrl(await (await fetch(url)).blob());
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Bouton « Studio d'images » : chaque photo d'origine de la page est refaite
// avec ton produit (tes photos, ton logo, ta palette), ou transformée en
// visuel publicitaire. Crée une demande (demandes/<date>-images/) que Claude
// traite avec gpt-image-2 ; les images obtenues sont posées dans la page
// (medias/<page>/), les pubs rangées dans medias/<page>/pubs/.
export function StudioButton({ hidden = false }) {
  const [open, setOpen] = useState(false);
  // Ouvert aussi depuis un champ image (« Refaire avec le Studio d'images »).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("atl-open-studio", onOpen);
    return () => window.removeEventListener("atl-open-studio", onOpen);
  }, []);
  return (
    <>
      {!hidden && (
        <button type="button" className="atl-tool" onClick={() => setOpen(true)} title="Refaire les photos d'origine avec ton produit">
          <IconImage />
          Studio d'images
        </button>
      )}
      {open && createPortal(<StudioDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

// Une boîte de références (produit ou marque).
function RefBox({ title, hint, group, refs, setRefs, room }) {
  const mine = refs.filter((r) => r.groupe === group);
  async function addFiles(files) {
    const list = [...files].filter((f) => f?.type?.startsWith("image/")).slice(0, room);
    const added = await Promise.all(list.map(async (f) => ({ groupe: group, name: f.name, dataUrl: await readAsDataUrl(f), tag: TAGS[group][0] })));
    setRefs((r) => [...r, ...added].slice(0, MAX_REFS));
  }
  return (
    <div className="atl-studio__box">
      <p className="atl-studio__boxtitle">
        {title} <em>{mine.length}</em>
      </p>
      <p className="atl-newpage__hint">{hint}</p>
      <div
        className="atl-studio__drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        onPaste={(e) => addFiles([...e.clipboardData.items].map((i) => i.getAsFile()).filter(Boolean))}
        tabIndex={0}
      >
        {mine.map((r) => (
          <figure key={r.dataUrl.slice(-40) + r.name} className="atl-studio__ref">
            <img src={r.dataUrl} alt="" />
            <select value={r.tag} onChange={(e) => setRefs(refs.map((x) => (x === r ? { ...x, tag: e.target.value } : x)))}>
              {TAGS[group].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            {r.auto && <small className="atl-studio__auto">du projet</small>}
            <button type="button" onClick={() => setRefs(refs.filter((x) => x !== r))} aria-label="Retirer">
              ×
            </button>
          </figure>
        ))}
        {room > 0 && (
          <label className="atl-studio__add">
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <b>+ Ajouter</b>
            <small>Glisse, colle ou choisis</small>
          </label>
        )}
      </div>
    </div>
  );
}

// Avancement des demandes d'images de cette page (écrit par scripts/studio.mjs).
function Progress() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const load = () =>
      fetch("/api/requests")
        .then((r) => r.json())
        .then((list) => setItems(list.filter((d) => d.type === "images" && d.page === pageName).slice(0, 3)))
        .catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);
  if (!items.length) return null;
  return (
    <div className="atl-studio__progress">
      {items.map((d) => {
        const total = d.details?.cibles?.length ?? 0;
        const faites = d.progression?.faites ?? 0;
        return (
          <div key={d.dossier}>
            <span>
              {d.details?.mode === "pub" ? "Pubs" : "Photos"} · {d.dossier.slice(0, 10)} : <b>{faites}</b> sur {total} générée(s)
              {d.progression?.etat ? ` · ${d.progression.etat}` : d.statut === "en attente" ? " · en attente" : ""}
              {d.progression?.sautees?.length > 0 && ` · ${d.progression.sautees.length} sautée(s), refusée(s) par l'IA`}
            </span>
            <i style={{ width: `${total ? (100 * faites) / total : 0}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function StudioDialog({ onClose }) {
  const getPuck = useGetPuck();
  const data = getPuck().appState.data;
  const root = data.root?.props ?? {};
  const targets = useMemo(() => originalPhotoTargets(data.content ?? []), [data]);
  const [refs, setRefs] = useState([]); // { groupe, dataUrl, tag, name, auto? }
  const [chosen, setChosen] = useState(() => new Set(targets.map((t) => t.key)));
  const [notes, setNotes] = useState({});
  // Accroche proposée en mode pub : le premier titre de la page.
  const firstTitle = useMemo(() => {
    for (const item of data.content ?? []) {
      for (const b of item.props?.blocks_element ?? []) if (/^Grand titre/.test(b.repere ?? "") && plain(b.text)) return plain(b.text).slice(0, 90);
    }
    return "";
  }, [data]);
  const [form, setForm] = useState({
    produit: root.produit ?? "",
    description: "",
    mode: "fidele",
    rythme: "tout",
    n: 8,
    format: "4:5",
    accroche: firstTitle,
    cta: "",
    textes: "",
  });
  const [state, setState] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const design = designById[root.design];

  // La boîte « marque » se remplit avec le kit de marque du projet (logos,
  // brand board) ; la description du produit avec celle du projet.
  useEffect(() => {
    if (!root.projet) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then(async (list) => {
        const project = list.find((p) => p.id === root.projet);
        if (!project) return;
        if (project.description) setForm((f) => ({ ...f, description: f.description || project.description }));
        const brand = project.marque ?? {};
        const urls = [...(brand.logos ?? []).map((u) => [u, "Logo"]), ...(brand.brandBoard ? [[brand.brandBoard, "Brand board"]] : [])].slice(0, 4);
        const auto = await Promise.all(
          urls.map(([u, tag]) =>
            urlToDataUrl(u)
              .then((dataUrl) => ({ groupe: "marque", tag, name: u.split("/").pop(), dataUrl, auto: true }))
              .catch(() => null),
          ),
        );
        setRefs((r) => [...r, ...auto.filter(Boolean)].slice(0, MAX_REFS));
      })
      .catch(() => {});
  }, [root.projet]);

  function toggle(key) {
    const next = new Set(chosen);
    next.has(key) ? next.delete(key) : next.add(key);
    setChosen(next);
  }

  const count = chosen.size;
  const runs = form.rythme === "5" ? Math.min(5, count) : form.rythme === "n" ? Math.min(Number(form.n) || 1, count) : form.rythme === "une-par-une" ? Math.min(1, count) : count;
  const cost = (count * PRIX_IMAGE).toFixed(2).replace(".", ",");

  async function send() {
    if (!refs.some((r) => r.groupe === "produit")) return setState({ error: "Ajoute au moins une photo de ton produit." });
    if (count === 0) return setState({ error: "Choisis au moins une photo." });
    setState({ busy: true });
    try {
      const save = await fetch(`/api/pages/${pageName}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getPuck().appState.data),
      });
      if (!save.ok) throw new Error((await save.json()).error);
      const cibles = targets.filter((t) => chosen.has(t.key)).map((t) => ({ ...t, consigne: notes[t.key] ?? "" }));
      // Produit d'abord, marque ensuite : l'ordre des images envoyées.
      const ordered = [...refs.filter((r) => r.groupe === "produit"), ...refs.filter((r) => r.groupe === "marque")];
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "images",
          page: pageName,
          images: ordered.map((r) => r.dataUrl),
          details: {
            ...form,
            n: Number(form.n) || 1,
            references: ordered.map((r, i) => ({ ordre: i + 1, groupe: r.groupe, etiquette: r.tag, nom: r.name })),
            marque: { couleurs: design?.tokens?.couleurs ?? null, polices: design?.tokens?.polices ?? null },
            prixEstime: Number((count * PRIX_IMAGE).toFixed(2)),
            cibles,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setState({ done: body.dossier, count: cibles.length });
    } catch (e) {
      setState({ error: `Échec : ${e.message}` });
    }
  }

  const room = MAX_REFS - refs.length;
  const pub = form.mode === "pub";
  return (
    <div className="atl-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="atl-modal__panel atl-newpage atl-studio">
        <header className="atl-modal__head">
          <h2>Studio d'images</h2>
          <button type="button" className="atl-modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        {state?.done ? (
          <div className="atl-newpage__body">
            <p>
              <b>Demande enregistrée</b> dans <code>{state.done}</code> : {state.count} image(s). La page a été enregistrée.
            </p>
            <p>
              Dis à Claude <b>« traite les demandes »</b>. Chaque image est créée avec gpt-image-2 (OpenAI) à partir de la photo d'origine et de tes
              références ; {pub ? "les pubs sont rangées dans medias/" + pageName + "/pubs/." : "elle est posée à sa place dans la page. Recharge ensuite l'atelier."}
            </p>
            <Progress />
          </div>
        ) : (
          <div className="atl-newpage__body">
            <fieldset>
              <legend>1. Ton produit</legend>
              <div className="atl-newpage__grid">
                <label>
                  <span>Nom du produit</span>
                  <input value={form.produit} onChange={set("produit")} placeholder="ex. Clearflow Cayenne Complex" />
                  <small className="atl-newpage__hint">Il remplace tout texte ou nom de marque visible dans les images.</small>
                </label>
                <label>
                  <span>Ce que c'est, ce qu'il contient</span>
                  <textarea rows={2} value={form.description} onChange={set("description")} placeholder="ex. Complément au piment de Cayenne, 60 gélules, pour la circulation." />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>2. Tes images ({refs.length} / {MAX_REFS})</legend>
              <div className="atl-studio__boxes">
                <RefBox title="Ton produit" hint="Quelques photos : face avant, dos, emballage, en main." group="produit" refs={refs} setRefs={setRefs} room={room} />
                <RefBox
                  title="Ta marque"
                  hint={`Logo, brand board, style.${design ? ` Couleurs et polices prises dans ${design.id}.` : ""}${root.projet ? " Rempli depuis le kit de marque du projet." : ""}`}
                  group="marque"
                  refs={refs}
                  setRefs={setRefs}
                  room={room}
                />
              </div>
            </fieldset>

            <fieldset className="atl-newpage__grid">
              <legend>3. Réglages</legend>
              <label>
                <span>Mode</span>
                <select value={form.mode} onChange={set("mode")}>
                  <option value="fidele">Miroir : la même photo, avec ton produit</option>
                  <option value="pub">Pub : un visuel publicitaire à partir de la photo</option>
                </select>
              </label>
              {pub && (
                <>
                  <label>
                    <span>Format</span>
                    <select value={form.format} onChange={set("format")}>
                      {Object.entries(FORMATS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Accroche écrite sur le visuel</span>
                    <input value={form.accroche} onChange={set("accroche")} placeholder="ex. Fini les nuits sans sommeil" />
                  </label>
                  <label>
                    <span>Bouton (facultatif)</span>
                    <input value={form.cta} onChange={set("cta")} placeholder="ex. Essayer -50 %" />
                  </label>
                </>
              )}
              <label>
                <span>Rythme</span>
                <select value={form.rythme} onChange={set("rythme")}>
                  <option value="tout">Tout générer d'un coup</option>
                  <option value="5">S'arrêter après 5 images</option>
                  <option value="n">S'arrêter après un nombre choisi</option>
                  <option value="une-par-une">Demander avant chaque image</option>
                </select>
              </label>
              {form.rythme === "n" && (
                <label>
                  <span>Nombre d'images avant l'arrêt</span>
                  <input type="number" min={1} max={count || 1} value={form.n} onChange={set("n")} />
                </label>
              )}
              <label>
                <span>Textes précis à changer (facultatif)</span>
                <input value={form.textes} onChange={set("textes")} placeholder="ex. Aurivita → Clearflow ; 60 softgels → 90 softgels" />
              </label>
            </fieldset>

            <fieldset>
              <legend>
                4. {pub ? "Photos d'où partir" : "Photos d'origine à refaire"} ({count} / {targets.length})
                {targets.length > 0 && (
                  <button
                    type="button"
                    className="atl-score__more"
                    onClick={() => setChosen(count === targets.length ? new Set() : new Set(targets.map((t) => t.key)))}
                  >
                    {count === targets.length ? "Tout décocher" : "Tout cocher"}
                  </button>
                )}
              </legend>
              {targets.length === 0 ? (
                <p className="atl-newpage__hint">Cette page n'affiche plus aucune photo d'origine : tout est déjà remplacé.</p>
              ) : (
                <ul className="atl-studio__targets">
                  {targets.map((t) => (
                    <li key={t.key} className={chosen.has(t.key) ? "is-on" : ""}>
                      <label>
                        <input type="checkbox" checked={chosen.has(t.key)} onChange={() => toggle(t.key)} />
                        <img src={t.source} alt="" />
                        <span>
                          <b>{t.sectionLabel}</b>
                          <small>
                            {t.settingLabel}
                            {t.blockType ? ` · bloc ${t.blockIndex + 1}` : ""}
                          </small>
                          {t.brief && <small className="atl-studio__brief">{t.brief}</small>}
                        </span>
                      </label>
                      {chosen.has(t.key) && (
                        <input
                          className="atl-studio__note"
                          value={notes[t.key] ?? ""}
                          onChange={(e) => setNotes({ ...notes, [t.key]: e.target.value })}
                          placeholder="Consigne pour cette image (facultatif)"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
            <Progress />
          </div>
        )}

        <footer className="atl-newpage__foot">
          {state?.error && <span className="atl-topbar__error">{state.error}</span>}
          {!state?.done && count > 0 && (
            <span className="atl-studio__cost" title="Estimation : gpt-image-2, qualité moyenne. Le prix réel dépend du tarif OpenAI.">
              {count} image(s) × ≈ {String(PRIX_IMAGE).replace(".", ",")} $ ≈ <b>{cost} $</b>
              {runs < count ? ` · ${runs} au premier lancement` : ""}
            </span>
          )}
          <button type="button" onClick={onClose}>
            {state?.done ? "Fermer" : "Annuler"}
          </button>
          {!state?.done && (
            <button type="button" className="atl-newpage__create" disabled={state?.busy || targets.length === 0} onClick={send}>
              {state?.busy ? "Envoi…" : `Enregistrer et demander ${count} ${pub ? "pub(s)" : "image(s)"}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
