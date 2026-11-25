// Étape « Médias » du projet (2026-11-24) : la même médiathèque que dans le
// Canvas (server/mediatheque.mjs), hors de l'éditeur. Images | Vidéos,
// onglets Projet / Créées / Références, filtres, fiche modifiable, « En faire
// une pub », téléverser dans l'onglet ouvert. Les images d'origine encore
// affichées dans les pages restent visibles sous Références.
import { useEffect, useMemo, useRef, useState } from "react";

const SOUS = { produit: "Photo produit", marque: "Marque", "a-classer": "À classer", ajoutee: "Ajoutée", origine: "Site d'origine", wh: "WinningHunter", site: "Autre site ou marque", concurrent: "Pub concurrente", ia: "IA directe", agent: "Agent", studio: "Studio", mirror: "Mirror" };
const DEST = { produit: "Page produit", landing: "Landing", homepage: "Homepage", advertorial: "Advertorial", pub: "Pub", marque: "Marque" };
const STYLE = { mockup: "Mise en scène", ugc: "UGC", "avant-apres": "Avant / après", lifestyle: "Lifestyle", "fond-blanc": "Fond blanc", infographie: "Infographie", autre: "Autre" };
const CHOIX = { brouillon: "Brouillon", selectionnee: "Sélectionnée", ecartee: "Écartée" };
const TABS = [["projet", "Projet", "Photos du produit, marque"], ["creee", "Créées", "Par l'IA, les agents, le Studio, Mirror"], ["reference", "Références", "Site d'origine, WinningHunter, autres marques"]];

const lireFichier = (f) =>
  new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = ko;
    r.readAsDataURL(f);
  });

export function MediathequeProjet({ project, origine = [] }) {
  const page = `projet-${project.id}`;
  const [type, setType] = useState("image");
  const [tab, setTab] = useState(null);
  const [items, setItems] = useState(null);
  const [f, setF] = useState({ dest: "", style: "", choix: "" });
  const [ticked, setTicked] = useState([]);
  const [fiche, setFiche] = useState(null);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  function load() {
    fetch(`/api/mediatheque/${page}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setMsg({ error: d.error });
        setItems(d.items ?? []);
        setTab((t) => t ?? (["projet", "creee", "reference"].find((k) => (d.items ?? []).some((x) => x.type === "image" && x.provenance === k && x.choix !== "ecartee")) || "projet"));
      })
      .catch((e) => setMsg({ error: e.message }));
  }
  useEffect(load, [project.id]);
  const all = useMemo(() => {
    const known = new Set((items ?? []).map((x) => x.url));
    const orig = origine.filter((u) => !known.has(u)).map((url) => ({ url, type: "image", provenance: "reference", sous: "origine", choix: "selectionnee", destination: [], style: "", origine: { source: "Site d'origine (photo encore dans une page)" }, utiliseeDans: [], lectureSeule: true }));
    return [...(items ?? []), ...orig];
  }, [items, origine]);
  const byUrl = new Map(all.map((x) => [x.url, x]));
  const ofType = all.filter((x) => x.type === type);
  const count = (t) => ofType.filter((x) => x.provenance === t && x.choix !== "ecartee").length;
  const list = ofType.filter((x) => x.provenance === tab && (f.choix ? x.choix === f.choix : x.choix !== "ecartee") && (!f.dest || (x.destination ?? []).includes(f.dest)) && (!f.style || x.style === f.style));
  const fi = fiche ? byUrl.get(fiche) : null;
  async function patch(urls, set) {
    const ok = urls.filter((u) => !byUrl.get(u)?.lectureSeule);
    if (!ok.length) return;
    setItems((l) => (l ?? []).map((x) => (ok.includes(x.url) ? { ...x, ...set } : x)));
    const r = await fetch(`/api/mediatheque/${page}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: ok, set }) }).catch(() => null);
    // Audit F18 : refus → on recharge l'état réel au lieu de garder l'affichage modifié.
    if (!r?.ok) {
      setMsg({ error: "Le classement n'a pas été enregistré : affichage remis à l'état réel." });
      load();
    }
  }
  function toggleDest(urls, d) {
    const on = urls.every((u) => (byUrl.get(u)?.destination ?? []).includes(d));
    for (const u of urls) {
      const cur = byUrl.get(u)?.destination ?? [];
      patch([u], { destination: on ? cur.filter((x) => x !== d) : [...new Set([...cur, d])] });
    }
  }
  async function enPub(x) {
    const r = await fetch(`/api/publicites/${project.id}/ajouter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: x.url, type: x.type, poster: x.poster ?? null, titre: (x.origine?.consigne ?? "").replace(/^.*«\s*|\s*»\s*$/g, "").slice(0, 120), origine: x.origine ?? null, format: x.origine?.format ?? "" }) });
    if (!r.ok) return setMsg({ error: "Ajout au registre impossible." });
    await patch([x.url], { destination: [...new Set([...(x.destination ?? []), "pub"])] });
    setMsg({ ok: "Ajoutée au registre des pubs (étape Publicités)." });
    load();
  }
  async function televerser(files) {
    try {
      const urls = [];
      for (const file of files) {
        const r = await fetch(`/api/medias/${page}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, dataUrl: await lireFichier(file) }) });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "Envoi impossible.");
        urls.push(b.url);
      }
      const set = tab === "reference" ? { provenance: "reference", sous: "site", choix: "selectionnee" } : tab === "creee" ? { provenance: "creee", sous: "ia", choix: "brouillon" } : { provenance: "projet", sous: "produit", choix: "selectionnee" };
      await fetch(`/api/mediatheque/${page}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls, set }) });
      setMsg({ ok: `${urls.length} fichier(s) ajouté(s) dans ${TABS.find((t) => t[0] === tab)?.[1]}.` });
      load();
    } catch (e) {
      setMsg({ error: e.message });
    }
  }
  const Sel = ({ value, options, tous, onPick }) => (
    <select value={value} onChange={(e) => onPick(e.target.value)}>
      <option value="">{tous}</option>
      {Object.entries(options).map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  );
  return (
    <section className="cat-card cat-mt">
      <div className="cat-mt__head">
        <h3>Médias du projet</h3>
        <div className="cat-mt__type">
          {[["image", "Images"], ["video", "Vidéos"]].map(([k, l]) => (
            <button key={k} type="button" className={type === k ? "is-on" : ""} onClick={() => (setType(k), setTicked([]), setFiche(null))}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="cat-muted">Tout ce que le projet possède, rangé au même endroit que dans le Canvas. Ce qui est créé (Canvas, Studio, Mirror, Publicités) arrive tout seul dans « Créées », en brouillon. Les logos et la planche de l'étape Marque apparaissent dans « Projet ».</p>
      <div className="cat-mt__tabs">
        {TABS.map(([k, l, aide]) => (
          <button key={k} type="button" className={tab === k ? "is-on" : ""} onClick={() => (setTab(k), setTicked([]), setFiche(null))}>
            <b>{l}</b> <span>{count(k)}</span>
            <small>{aide}</small>
          </button>
        ))}
      </div>
      <div className="cat-mt__filters">
        <Sel value={f.dest} options={DEST} tous="Toutes destinations" onPick={(v) => setF({ ...f, dest: v })} />
        <Sel value={f.style} options={STYLE} tous="Tous les styles" onPick={(v) => setF({ ...f, style: v })} />
        <select value={f.choix} onChange={(e) => setF({ ...f, choix: e.target.value })}>
          <option value="">Sans les écartées</option>
          {Object.entries(CHOIX).map(([k, l]) => (
            <option key={k} value={k}>
              {l}s seulement
            </option>
          ))}
        </select>
        <button type="button" className="cat-btn cat-btn--ghost" onClick={() => fileRef.current?.click()}>
          + Téléverser dans {TABS.find((t) => t[0] === tab)?.[1] ?? "Projet"}
        </button>
        <input ref={fileRef} type="file" multiple hidden accept={type === "video" ? "video/mp4,video/webm,video/quicktime" : "image/*"} onChange={(e) => (televerser([...e.target.files]), (e.target.value = ""))} />
      </div>
      {msg?.ok && <p className="cat-flash">✓ {msg.ok}</p>}
      {msg?.error && <p className="cat-flash is-error">⚠ {msg.error}</p>}
      {ticked.length > 0 && (
        <div className="cat-mt__bulk">
          <b>{ticked.length} cochée(s) :</b>
          <button type="button" className="cat-btn cat-btn--ghost" onClick={() => patch(ticked, { choix: "selectionnee" })}>
            Sélectionner
          </button>
          <button type="button" className="cat-btn cat-btn--ghost" onClick={() => patch(ticked, { choix: "ecartee" })}>
            Écarter
          </button>
          <Sel value="" options={DEST} tous="Destination…" onPick={(v) => v && toggleDest(ticked, v)} />
          <Sel value="" options={STYLE} tous="Style…" onPick={(v) => v && patch(ticked, { style: v })} />
          <button type="button" className="cat-link" onClick={() => setTicked([])}>
            Tout décocher
          </button>
        </div>
      )}
      <div className="cat-mt__body">
        <div className="cat-mt__grid">
          {items === null && !msg?.error && <p className="cat-muted">Chargement…</p>}
          {items !== null && !list.length && <p className="cat-muted">Rien ici pour l'instant{f.dest || f.style || f.choix ? " avec ces filtres" : ""}.</p>}
          {list.map((x) => (
            <div key={x.url} className={`cat-mt__item${ticked.includes(x.url) ? " is-on" : ""}${fiche === x.url ? " is-focus" : ""}`}>
              <button type="button" className="cat-mt__thumb" onClick={() => setFiche(x.url)} title="Voir la fiche">
                {x.type === "video" ? x.poster ? <img src={x.poster} alt="" loading="lazy" /> : <video src={`${x.url}#t=0.5`} preload="metadata" muted /> : <img src={x.url} alt="" loading="lazy" />}
                {x.type === "video" && <i>▶</i>}
              </button>
              <label className="cat-mt__check">
                <input type="checkbox" checked={ticked.includes(x.url)} onChange={() => setTicked((t) => (t.includes(x.url) ? t.filter((y) => y !== x.url) : [...t, x.url]))} />
                <span className={`cat-mt__choix is-${x.choix}`}>{CHOIX[x.choix]}</span>
                <span>{SOUS[x.sous] ?? x.sous}</span>
                {x.utiliseeDans?.length > 0 && <span className="cat-mt__used">Utilisée</span>}
              </label>
            </div>
          ))}
        </div>
        {fi && (
          <aside className="cat-mt__fiche">
            <div className="cat-mt__fichehead">
              <b>Fiche</b>
              <button type="button" className="cat-link" onClick={() => setFiche(null)}>
                Fermer
              </button>
            </div>
            {fi.type === "video" ? <video src={fi.url} poster={fi.poster ?? undefined} controls preload="metadata" /> : <img src={fi.url} alt="" />}
            {fi.lectureSeule ? (
              <p className="cat-muted">Photo d'origine encore affichée dans une page : refais-la avec le Studio de l'atelier.</p>
            ) : (
              <>
                <span className="cat-mt__lab">Choix</span>
                <div className="cat-mt__seg">
                  {Object.entries(CHOIX).map(([k, l]) => (
                    <button key={k} type="button" className={fi.choix === k ? "is-on" : ""} onClick={() => patch([fi.url], { choix: k })}>
                      {l}
                    </button>
                  ))}
                </div>
                <span className="cat-mt__lab">Onglet</span>
                <div className="cat-mt__seg">
                  {TABS.map(([k, l]) => (
                    <button key={k} type="button" className={fi.provenance === k ? "is-on" : ""} onClick={() => patch([fi.url], { provenance: k, sous: k === "projet" ? "produit" : k === "reference" ? "site" : fi.sous })}>
                      {l}
                    </button>
                  ))}
                </div>
                {fi.provenance !== "creee" && (
                  <select value={fi.sous} onChange={(e) => patch([fi.url], { sous: e.target.value })}>
                    {(fi.provenance === "projet" ? ["produit", "marque", "a-classer"] : ["site", "wh", "concurrent", "origine"]).map((k) => (
                      <option key={k} value={k}>
                        {SOUS[k]}
                      </option>
                    ))}
                  </select>
                )}
                <span className="cat-mt__lab">Destination</span>
                <div className="cat-mt__chips">
                  {Object.entries(DEST).map(([k, l]) => (
                    <button key={k} type="button" className={(fi.destination ?? []).includes(k) ? "is-on" : ""} onClick={() => toggleDest([fi.url], k)}>
                      {l}
                    </button>
                  ))}
                </div>
                <span className="cat-mt__lab">Style</span>
                <Sel value={fi.style ?? ""} options={STYLE} tous="Non précisé" onPick={(v) => patch([fi.url], { style: v })} />
              </>
            )}
            <dl className="cat-mt__orig">
              <dt>Provenance</dt>
              <dd>
                {SOUS[fi.sous] ?? fi.sous}
                {fi.origine?.source ? ` · ${fi.origine.source}` : ""}
              </dd>
              {fi.origine?.agent && (
                <>
                  <dt>Agent</dt>
                  <dd>{fi.origine.agent}</dd>
                </>
              )}
              {fi.origine?.modele && (
                <>
                  <dt>Modèle</dt>
                  <dd>
                    {fi.origine.modele}
                    {fi.origine.format ? ` · ${fi.origine.format}` : ""}
                  </dd>
                </>
              )}
              {fi.origine?.consigne && (
                <>
                  <dt>Consigne</dt>
                  <dd className="cat-mt__consigne">{fi.origine.consigne}</dd>
                </>
              )}
              <dt>Utilisée dans</dt>
              <dd>{fi.utiliseeDans?.length ? fi.utiliseeDans.map((u) => `${u.type === "pub" ? "Pub" : "Page"} « ${u.titre} »`).join(", ") : "nulle part pour l'instant"}</dd>
            </dl>
            <div className="cat-actions">
              {!fi.lectureSeule && !fi.utiliseeDans?.some((u) => u.type === "pub") && (
                <button type="button" className="cat-btn cat-btn--ghost" onClick={() => enPub(fi)}>
                  En faire une pub
                </button>
              )}
              <a className="cat-btn cat-btn--ghost" href={fi.url} download>
                Télécharger
              </a>
            </div>
            <p className="cat-muted">Pour la poser dans une page ou sur un tableau : Canvas → Médias.</p>
          </aside>
        )}
      </div>
    </section>
  );
}
