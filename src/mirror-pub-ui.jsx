// Mirror (2026-11-20) : adapter une pub vidéo du tableau à ton produit.
// Panneau ouvert depuis la barre d'une vidéo sélectionnée dans Canvas.
// 1. Analyse (rea-video) → 2. Fiche de continuité → 3. Argumentaire, puis
// script et plan → 4. Prompts vidéo (bloc A, puis les autres). Le serveur
// travaille en tâche de fond (server/mirror.mjs) ; on interroge son état.
import { useEffect, useRef, useState } from "react";

const pageName = new URLSearchParams(location.search).get("page") ?? "brouillon";
const api = (path, body) =>
  fetch(`/api/mirror${path}${path.includes("?") ? "&" : "?"}page=${encodeURIComponent(pageName)}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).then(async (r) => {
    const t = await r.text();
    let d;
    try {
      d = JSON.parse(t);
    } catch {
      throw new Error(r.status >= 500 ? `Le serveur n'a pas répondu (erreur ${r.status}).` : "Réponse inattendue du serveur.");
    }
    if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
    return d;
  });

const STEP_INFO = {
  cast: { titre: "2. Fiche de continuité", bouton: "Écrire la fiche et les prompts d'images", aide: "Ce qui doit rester identique d'un plan à l'autre (ton produit, le décor, les mains…) et 3 à 5 prompts d'images de référence à faire dans TopView." },
  argument: { titre: "3. Argumentaire", bouton: "Analyser l'argumentaire", aide: "Ce que la pub dit et dans quel ordre, transposé sur les vraies caractéristiques de ton produit. C'est la seule étape à valider." },
  story: { titre: "3 bis. Script et plan", bouton: "Approuver et écrire le script", aide: "Voix off au même nombre de mots, tableau plan par plan, découpage en blocs de 30 s au plus." },
  motion: { titre: "4. Prompts vidéo : bloc A", bouton: "Écrire le prompt du bloc A", aide: "À coller dans TopView (Seedance 2.5). Génère-le, puis compte les coupes obtenues." },
  suite: { titre: "4 bis. Les autres blocs", bouton: "Écrire les autres blocs", aide: "Selon le nombre de coupes du bloc A, le mode change (plan par plan, par temps forts, ou une génération par plan)." },
};

// Agent spécialiste par étape vidéo (même liste que server/mirror.mjs STEP_AGENTS).
const STEP_AGENT_LABEL = { cast: "UGC Video Producer", argument: "Video Ad Cloner", story: "Scene Architect", motion: "Seedance Video Ad Cloner", suite: "Seedance Video Ad Cloner" };

export function MirrorPanel({ video, poster, photosDuTableau, onPick, picking, onPlace, onPlaceVideo, onClose }) {
  const [id, setId] = useState(null);
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});
  const [coupes, setCoupes] = useState("");
  const timer = useRef(null);

  // Mirror déjà lancé pour cette vidéo ? (le plus récent)
  useEffect(() => {
    let off = false;
    setLoading(true);
    api("")
      .then((d) => {
        if (off) return;
        const m = (d.mirrors ?? []).find((x) => x.video === video);
        setId(m?.id ?? null);
        if (!m) setSt(null);
      })
      .catch((e) => setErr(e.message))
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [video]);

  async function refresh(which = id) {
    if (!which) return;
    try {
      const d = await api(`/${which}`);
      setSt(d);
      setErr(null);
      return d;
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    if (!id) return;
    refresh(id);
  }, [id]);
  // Interroge le serveur tant que quelque chose tourne.
  const busy = st && (["en attente", "en cours"].includes(st.analyse?.statut) || [...Object.values(st.etapes ?? {}), ...Object.values(st.images ?? {})].some((e) => e.statut === "en cours"));
  useEffect(() => {
    clearInterval(timer.current);
    if (busy) timer.current = setInterval(() => refresh(), 4000);
    return () => clearInterval(timer.current);
  }, [busy, id]);

  async function start() {
    setErr(null);
    try {
      const d = await api("", { video, poster });
      setId(d.id);
    } catch (e) {
      setErr(e.message);
    }
  }
  async function saveSettings(patch) {
    setSt((s) => ({ ...s, ...patch }));
    try {
      await api(`/${id}/reglages`, patch);
    } catch (e) {
      setErr(e.message);
    }
  }
  async function run(name, extra = {}) {
    setErr(null);
    try {
      await api(`/${id}/etape/${name}`, { consigne: notes[name] ?? "", ...extra });
      setNotes((n) => ({ ...n, [name]: "" }));
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  }

  const base = st?.base;
  const sc = st?.scenes;
  const photos = st?.photos ?? [];
  const usable = (photosDuTableau ?? []).filter((u) => /^\/medias\//.test(u));

  return (
    <aside className="atl-mir" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <header className="atl-mir__head">
        <div>
          <strong>Mirror</strong>
          <span>Adapter cette pub à ton produit</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </header>
      <div className="atl-mir__body">
        {err && <p className="atl-mir__err">{err}</p>}
        {loading && <p className="atl-mir__muted">Chargement…</p>}

        {!loading && !id && (
          <section className="atl-mir__step">
            <h3>1. Décortiquer la vidéo</h3>
            <p className="atl-mir__muted">Découpe la pub en plans : images de chaque plan, répliques, textes à l'écran, musique. Compte 3 à 5 minutes pour une pub de 15 s.</p>
            <button type="button" className="is-main" onClick={start}>
              Lancer l'analyse
            </button>
          </section>
        )}

        {st && (
          <>
            <section className="atl-mir__step">
              <h3>1. Décortiquer la vidéo</h3>
              {["en attente", "en cours"].includes(st.analyse?.statut) && <Wait label={st.analyse.statut === "en attente" ? "En file d'attente (une analyse à la fois)…" : "Analyse en cours (3 à 5 min)…"} since={st.analyse.debut} />}
              {st.analyse?.statut === "erreur" && (
                <>
                  <p className="atl-mir__err">{st.analyse.erreur}</p>
                  <button type="button" onClick={() => api(`/${id}/relancer`, {}).then(() => refresh())}>
                    Relancer l'analyse
                  </button>
                </>
              )}
              {st.analyse?.statut === "faite" && sc && (
                <>
                  <p className="atl-mir__muted">
                    {sc.scenes.length} plans · {sc.duree} s{sc.transcription ? "" : " · aucune parole reconnue (les textes à l'écran servent de script)"}
                  </p>
                  {sc.storyboard && <img className="atl-mir__board" src={`${base}/${sc.storyboard}`} alt="Storyboard" />}
                  <div className="atl-mir__row">
                    {sc.storyboard && (
                      <button type="button" onClick={() => onPlace([`${base}/${sc.storyboard}`])}>
                        Poser le storyboard sur le tableau
                      </button>
                    )}
                    <a className="atl-mir__btn" href={`${base}/scenes.zip`} download={`plans-${id}.zip`}>
                      Images des plans (zip)
                    </a>
                  </div>
                  <details className="atl-mir__scenes">
                    <summary>Voir les plans un par un</summary>
                    {sc.scenes.map((s) => (
                      <div key={s.n} className="atl-mir__scene">
                        {s.frame && <img src={`${base}/scenes/${s.frame}`} alt={`Plan ${s.n}`} />}
                        <div>
                          <b>
                            Plan {s.n} · {s.debut}–{s.fin} s
                          </b>
                          {s.texte && <p>Texte : {s.texte}</p>}
                          {s.dit && <p>Dit : « {s.dit} »</p>}
                        </div>
                      </div>
                    ))}
                  </details>
                </>
              )}
            </section>

            {st.analyse?.statut === "faite" && (
              <>
                <section className="atl-mir__step">
                  <h3>Ton produit</h3>
                  <p className="atl-mir__muted">Photos de ton produit (2 ou 3, nettes, sans texte incrusté). Les infos du produit viennent des Fondations du projet.</p>
                  <div className="atl-mir__photos">
                    {photos.map((p) => (
                      <figure key={p}>
                        <img src={p} alt="" />
                        <button type="button" onClick={() => saveSettings({ photos: photos.filter((x) => x !== p) })} aria-label="Retirer">
                          ×
                        </button>
                      </figure>
                    ))}
                  </div>
                  <div className="atl-mir__row">
                    <button type="button" className={picking ? "is-on" : ""} onClick={onPick}>
                      {picking ? "Terminé" : "Choisir sur le tableau"}
                    </button>
                    {picking && usable.some((u) => !photos.includes(u)) && (
                      <button type="button" className="is-main" onClick={() => saveSettings({ photos: [...new Set([...photos, ...usable])].slice(0, 8) })}>
                        Ajouter les {usable.filter((u) => !photos.includes(u)).length} image(s) choisie(s)
                      </button>
                    )}
                  </div>
                  <label className="atl-mir__field">
                    Langue de la pub
                    <select value={st.langue ?? "anglais"} onChange={(e) => saveSettings({ langue: e.target.value })}>
                      <option value="anglais">Anglais</option>
                      <option value="français (Québec)">Français (Québec)</option>
                      <option value="français (France)">Français (France)</option>
                    </select>
                  </label>
                  <label className="atl-mir__field">
                    Ce qu'il faut dire ou ne pas dire (facultatif)
                    <textarea rows={2} defaultValue={st.notes ?? ""} onBlur={(e) => e.target.value !== (st.notes ?? "") && saveSettings({ notes: e.target.value })} placeholder="Ex. : ne pas parler de prix, mettre l'accent sur « sans appli »…" />
                  </label>
                </section>

                {["cast", "argument", "story", "motion", "suite"].map((name) => {
                  const e = st.etapes?.[name];
                  const prevOk = { cast: true, argument: !!st.etapes?.cast?.texte, story: !!st.etapes?.argument?.texte, motion: !!st.etapes?.story?.texte, suite: !!st.etapes?.motion?.texte }[name];
                  if (!prevOk && !e) return null;
                  const info = STEP_INFO[name];
                  return (
                    <section key={name} className="atl-mir__step">
                      <h3>{info.titre}</h3>
                      <p className="atl-mir__muted">{info.aide}</p>
                      {e?.perime && <p className="atl-mir__warn">Une étape précédente a été refaite : refais celle-ci pour rester cohérent.</p>}
                      {e?.statut === "en cours" && <Wait label="L'IA écrit… (1 à 4 min)" since={e.debut} />}
                      {e?.statut === "erreur" && <p className="atl-mir__err">{e.erreur}</p>}
                      {e?.texte && e.statut !== "en cours" && <Markdown text={e.texte} />}
                      {name === "cast" && e?.texte && e.statut !== "en cours" && <RefImages st={st} id={id} text={e.texte} refresh={refresh} onPlace={onPlace} setErr={setErr} />}
                      {e?.statut !== "en cours" && (
                        <>
                          {name === "suite" && (
                            <label className="atl-mir__field">
                              Combien de coupes as-tu comptées dans le bloc A ?
                              <input type="number" min="0" value={coupes} onChange={(ev) => setCoupes(ev.target.value)} />
                            </label>
                          )}
                          {e?.texte && <textarea rows={2} value={notes[name] ?? ""} onChange={(ev) => setNotes((n) => ({ ...n, [name]: ev.target.value }))} placeholder="Consigne pour refaire cette étape (facultatif)" />}
                          <button type="button" className="is-main" disabled={(name === "cast" && !photos.length && !e) || (name === "suite" && !coupes)} onClick={() => run(name, name === "suite" ? { coupes: Number(coupes) } : {})}>
                            {e?.texte ? (notes[name] ? "Refaire avec cette consigne" : "Refaire") : info.bouton}
                          </button>
                          {/* Lot 4 (2026-11-23) : l'agent spécialiste de l'étape affine la réponse. */}
                          {e?.texte && STEP_AGENT_LABEL[name] && (
                            <button type="button" onClick={() => run(name, { agent: true, ...(name === "suite" ? { coupes: Number(coupes) || e.coupes } : {}) })} title={`Refait cette étape en appliquant la méthode de l'agent ${STEP_AGENT_LABEL[name]} à la réponse actuelle (la version précédente est gardée)`}>
                              ✨ Affiner avec {STEP_AGENT_LABEL[name]}
                            </button>
                          )}
                          {e?.agent && e.statut === "faite" && <p className="atl-mir__muted">Dernière version affinée par {STEP_AGENT_LABEL[name] ?? e.agent}.</p>}
                          {name === "cast" && !photos.length && !e && <p className="atl-mir__muted">Ajoute d'abord au moins une photo de ton produit.</p>}
                        </>
                      )}
                    </section>
                  );
                })}
                {st.etapes?.story?.texte && <OmniStep st={st} id={id} refresh={refresh} setErr={setErr} onPlaceVideo={onPlaceVideo} />}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

// ---- 5. Générer la vidéo avec Gemini Omni (lot C, 2026-11-24) ----
// Le scénario validé est découpé en plans ; chaque plan part de son image de
// référence (étape 2) ; un plan bloqué par le filtre de Google est reformulé
// tout seul. La pub assemblée arrive dans Médias et dans le registre des pubs.
const OMNI_PRIX = { "360p": 0.025, "720p": 0.075, "1080p": 0.11 };
function OmniStep({ st, id, refresh, setErr, onPlaceVideo }) {
  const o = st.etapes?.omni;
  const [qualite, setQualite] = useState(o?.qualite ?? "720p");
  const [son, setSon] = useState(o?.son ?? "voix");
  const [agent, setAgent] = useState(o?.agent ?? "");
  const [edit, setEdit] = useState({});
  const duree = Math.min(30, Math.max(8, Math.round(st.scenes?.duree || 15)));
  const enCours = o?.statut === "en cours";
  async function lancer() {
    setErr(null);
    try {
      await api(`/${id}/omni`, { qualite, son, agent });
      refresh();
    } catch (e) {
      setErr(e.message);
    }
  }
  async function refaire(n) {
    setErr(null);
    try {
      await api(`/${id}/omni/plan/${n}`, { prompt: edit[n] ?? "" });
      setEdit((x) => ({ ...x, [n]: undefined }));
      refresh();
    } catch (e) {
      setErr(e.message);
    }
  }
  return (
    <section className="atl-mir__step atl-mir__omni">
      <h3>5. Générer la vidéo avec Omni</h3>
      <p className="atl-mir__muted">Le scénario validé est découpé en 3 à 6 plans. Chaque plan part de son image de référence (étape 2), Gemini Omni le filme, puis l'atelier assemble la pub. Elle arrive dans Médias (Vidéos → Créées) et dans le registre des pubs. Format vertical 9:16 (Omni ne fait pas le 4:5).</p>
      {!enCours && (
        <div className="atl-mir__omniopts">
          <label>
            Qualité
            <select value={qualite} onChange={(e) => setQualite(e.target.value)}>
              <option value="360p">Brouillon 360p</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </label>
          <label>
            Son
            <select value={son} onChange={(e) => setSon(e.target.value)}>
              <option value="voix">Une voix off continue (même voix du début à la fin)</option>
              <option value="omni">Le son de chaque plan (voix et bruits d'Omni)</option>
            </select>
          </label>
          <label>
            Agent qui écrit les plans
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="">Aucun : règles de l'atelier</option>
              <option value="shopfunnels-seedance-video-ad-cloner-v-1">Seedance Video Ad Cloner</option>
              <option value="shopfunnels-claude-seedance-ugc-video-ad-producer-v-1">Claude Seedance UGC Video Ad Producer</option>
            </select>
          </label>
          <button type="button" className="is-main" onClick={lancer}>
            {o?.plans?.length ? "Tout refaire" : "Générer la vidéo"} · ~{(duree * OMNI_PRIX[qualite] + 0.05).toFixed(2)} $
          </button>
          {o?.plans?.length > 0 && o.plans.every((p) => p.statut === "faite") && (
            <button type="button" onClick={() => api(`/${id}/omni/assembler`, { son }).then(refresh).catch((e) => setErr(e.message))} title="Garde les plans déjà faits et refait seulement le montage (par exemple avec l'autre choix de son)">
              Réassembler seulement · gratuit
            </button>
          )}
        </div>
      )}
      {enCours && <Wait label={o.etape || "Omni travaille…"} since={o.debut} />}
      {o?.statut === "erreur" && <p className="atl-mir__err">{o.erreur}</p>}
      {o?.final && !enCours && (
        <div className="atl-mir__omnifinal">
          <video src={o.final.url} poster={o.final.poster} controls preload="metadata" />
          <div>
            <b>Pub prête · {o.final.duree} s · ≈ {Number(o.final.cout ?? 0).toFixed(2)} $</b>
            <p className="atl-mir__muted">Rangée dans Médias → Vidéos → Créées et dans le registre des pubs (étape Publicités), en Brouillon.</p>
            {onPlaceVideo && (
              <button type="button" onClick={() => onPlaceVideo({ url: o.final.url, poster: o.final.poster })}>
                Poser sur le tableau
              </button>
            )}
            <a href={o.final.url} download>
              Télécharger
            </a>
          </div>
        </div>
      )}
      {o?.plans?.length > 0 && (
        <div className="atl-mir__omniplans">
          {o.plans.map((p) => (
            <article key={p.n} className={`is-${p.statut}`}>
              <div className="atl-mir__omnimedia">{p.url ? <video src={p.url} controls preload="metadata" /> : <span>{p.statut === "erreur" ? "⚠ Échec" : p.statut === "en attente" && enCours ? "En cours…" : "—"}</span>}</div>
              <b>
                {p.n + 1}. {p.titre} · {p.duree} s{p.reformule ? " · reformulé" : ""}
              </b>
              {o.agent && p.n === 0 && <small>Plans écrits avec la méthode de l'agent</small>}
              {p.voix && <small>« {p.voix} »</small>}
              {p.erreur && <small className="atl-mir__err">{p.erreur}</small>}
              {!enCours && (
                <details>
                  <summary>Consigne du plan · refaire</summary>
                  <textarea rows={5} value={edit[p.n] ?? p.prompt} onChange={(e) => setEdit((x) => ({ ...x, [p.n]: e.target.value }))} />
                  <button type="button" onClick={() => refaire(p.n)}>
                    Refaire ce plan et réassembler · ~{(p.duree * OMNI_PRIX[o.qualite ?? "720p"]).toFixed(2)} $
                  </button>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
      {o?.son === "voix" && o?.voixOff && <p className="atl-mir__muted">Voix off : « {o.voixOff} »</p>}
    </section>
  );
}

// ---- Mirror d'une pub IMAGE (2026-11-20) ----
// Analyse de la pub + 3 variantes (textes modifiables), puis génération
// avec la pub comme modèle de mise en page et tes photos produit.
export function MirrorImagePanel({ image, photosDuTableau, onPick, picking, onPlace, onClose }) {
  const [id, setId] = useState(null);
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [consigne, setConsigne] = useState("");
  const [modele, setModele] = useState("nano-banana");
  const [edits, setEdits] = useState({}); // n → { accroche, sousTitre, cta, autres, prompt }
  const timer = useRef(null);
  const clean = (u) => String(u ?? "").split("?")[0];

  useEffect(() => {
    let off = false;
    setLoading(true);
    api("")
      .then((d) => {
        if (off) return;
        const m = (d.mirrors ?? []).find((x) => x.kind === "image" && x.image === clean(image));
        setId(m?.id ?? null);
        if (!m) setSt(null);
      })
      .catch((e) => setErr(e.message))
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [image]);
  async function refresh(which = id) {
    if (!which) return;
    try {
      const d = await api(`/${which}`);
      setSt(d);
      setErr(null);
      return d;
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    if (id) refresh(id);
  }, [id]);
  const busy = st && [st.etapes?.adapter, ...Object.values(st.images ?? {})].some((e) => e?.statut === "en cours");
  useEffect(() => {
    clearInterval(timer.current);
    if (busy) timer.current = setInterval(() => refresh(), 3000);
    return () => clearInterval(timer.current);
  }, [busy, id]);

  async function ensure() {
    if (id) return id;
    const d = await api("", { image: clean(image) });
    setId(d.id);
    await refresh(d.id);
    return d.id;
  }
  async function saveSettings(patch) {
    try {
      const jid = await ensure();
      setSt((s) => ({ ...(s ?? {}), ...patch }));
      await api(`/${jid}/reglages`, patch);
      await refresh(jid);
    } catch (e) {
      setErr(e.message);
    }
  }
  async function adapt() {
    setErr(null);
    try {
      const jid = await ensure();
      await api(`/${jid}/etape/adapter`, { consigne });
      setConsigne("");
      setEdits({});
      await refresh(jid);
    } catch (e) {
      setErr(e.message);
    }
  }
  const e = st?.etapes?.adapter;
  const vars = e?.variantes ?? [];
  const photos = st?.photos ?? [];
  const usable = (photosDuTableau ?? []).filter((u) => /^\/medias\//.test(u) && clean(u) !== clean(image));
  const imgs = st?.images ?? {};
  const val = (v) => ({ ...v.textes, prompt: v.prompt, ...(edits[v.n] ?? {}) });
  const setVal = (n, k, x) => setEdits((m) => ({ ...m, [n]: { ...(m[n] ?? {}), [k]: x } }));

  async function gen(v) {
    setErr(null);
    const x = val(v);
    try {
      await api(`/${id}/image`, { nom: `variante_${v.n}`, prompt: x.prompt, refs: ["__pub__", ...photos.map((p) => p.split("/").pop())], ratio: st.ratio, modele, textes: { accroche: x.accroche, sousTitre: x.sousTitre, cta: x.cta, autres: x.autres } });
      await refresh();
    } catch (er) {
      setErr(er.message);
    }
  }

  return (
    <aside className="atl-mir" onPointerDown={(ev) => ev.stopPropagation()} onWheel={(ev) => ev.stopPropagation()}>
      <header className="atl-mir__head">
        <div>
          <strong>Mirror</strong>
          <span>Adapter cette pub image à ton produit</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </header>
      <div className="atl-mir__body">
        {err && <p className="atl-mir__err">{err}</p>}
        {loading && <p className="atl-mir__muted">Chargement…</p>}
        {!loading && (
          <>
            <section className="atl-mir__step">
              <h3>La pub d'origine</h3>
              <img className="atl-mir__adsrc" src={image} alt="Pub d'origine" />
            </section>
            <section className="atl-mir__step">
              <h3>Ton produit</h3>
              <p className="atl-mir__muted">Photos de ton produit (2 ou 3, nettes, sans texte incrusté). Les infos du produit viennent des Fondations du projet.</p>
              <div className="atl-mir__photos">
                {photos.map((p) => (
                  <figure key={p}>
                    <img src={p} alt="" />
                    <button type="button" onClick={() => saveSettings({ photos: photos.filter((x) => x !== p) })} aria-label="Retirer">
                      ×
                    </button>
                  </figure>
                ))}
              </div>
              <div className="atl-mir__row">
                <button type="button" className={picking ? "is-on" : ""} onClick={onPick}>
                  {picking ? "Terminé" : "Choisir sur le tableau"}
                </button>
                {picking && usable.some((u) => !photos.includes(clean(u))) && (
                  <button type="button" className="is-main" onClick={() => saveSettings({ photos: [...new Set([...photos, ...usable.map(clean)])].slice(0, 8) })}>
                    Ajouter les {usable.filter((u) => !photos.includes(clean(u))).length} image(s) choisie(s)
                  </button>
                )}
              </div>
              <label className="atl-mir__field">
                Langue de la pub
                <select value={st?.langue ?? "anglais"} onChange={(ev) => saveSettings({ langue: ev.target.value })}>
                  <option value="anglais">Anglais</option>
                  <option value="français (Québec)">Français (Québec)</option>
                  <option value="français (France)">Français (France)</option>
                </select>
              </label>
              <label className="atl-mir__field">
                Ce qu'il faut dire ou ne pas dire (facultatif)
                <textarea rows={2} defaultValue={st?.notes ?? ""} onBlur={(ev) => ev.target.value !== (st?.notes ?? "") && saveSettings({ notes: ev.target.value })} placeholder="Ex. : mettre l'accent sur « sans appli », pas de prix…" />
              </label>
            </section>
            <section className="atl-mir__step">
              <h3>Analyse et variantes</h3>
              <p className="atl-mir__muted">L'IA lit la pub (accroche, mise en page, preuves), la transpose sur ton produit et propose 3 variantes : la plus proche, puis 2 autres angles.</p>
              {e?.statut === "en cours" && <Wait label="L'IA lit la pub… (environ 1 min)" since={e.debut} />}
              {e?.statut === "erreur" && <p className="atl-mir__err">{e.erreur}</p>}
              {e?.texte && e.statut !== "en cours" && (
                <details className="atl-mir__scenes">
                  <summary>Voir l'analyse de la pub</summary>
                  <Markdown text={e.texte} />
                </details>
              )}
              {e?.statut !== "en cours" && (
                <>
                  {e?.texte && <textarea rows={2} value={consigne} onChange={(ev) => setConsigne(ev.target.value)} placeholder="Consigne pour refaire l'analyse (facultatif)" />}
                  <button type="button" className="is-main" disabled={!photos.length} onClick={adapt}>
                    {e?.texte ? (consigne ? "Refaire avec cette consigne" : "Refaire l'analyse") : "Analyser et proposer 3 variantes"}
                  </button>
                  {!photos.length && <p className="atl-mir__muted">Ajoute d'abord au moins une photo de ton produit.</p>}
                </>
              )}
            </section>
            {vars.length > 0 && e?.statut !== "en cours" && (
              <section className="atl-mir__step">
                <h3>Tes pubs</h3>
                <div className="atl-mir__row">
                  <select value={modele} onChange={(ev) => setModele(ev.target.value)}>
                    {MODELES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="is-main" disabled={busy} onClick={() => vars.forEach((v) => imgs[`variante_${v.n}`]?.statut !== "en cours" && gen(v))}>
                    Générer les {vars.length} pubs
                  </button>
                  {vars.some((v) => imgs[`variante_${v.n}`]?.statut === "faite") && (
                    <button type="button" onClick={() => onPlace(vars.map((v) => imgs[`variante_${v.n}`]).filter((x) => x?.statut === "faite").map((x) => `${x.url}?v=${x.v}`))}>
                      Poser sur le tableau
                    </button>
                  )}
                </div>
                {vars.map((v) => {
                  const x = val(v);
                  const im = imgs[`variante_${v.n}`];
                  return (
                    <div key={v.n} className="atl-mir__var">
                      <div className="atl-mir__varimg">{im?.statut === "faite" ? <img src={`${im.url}?v=${im.v}`} alt={v.titre} /> : im?.statut === "en cours" ? <span className="atl-mir__spin" /> : <span>{v.n}</span>}</div>
                      <div className="atl-mir__refinfo">
                        <b>
                          {v.n}. {v.titre}
                        </b>
                        {v.angle && <small>{v.angle}</small>}
                        {v.pourquoi && <small className="atl-mir__why">{v.pourquoi}</small>}
                        <label className="atl-mir__field">
                          Accroche
                          <input value={x.accroche ?? ""} onChange={(ev) => setVal(v.n, "accroche", ev.target.value)} />
                        </label>
                        <label className="atl-mir__field">
                          Sous-titre
                          <input value={x.sousTitre ?? ""} onChange={(ev) => setVal(v.n, "sousTitre", ev.target.value)} />
                        </label>
                        <label className="atl-mir__field">
                          Bouton
                          <input value={x.cta ?? ""} onChange={(ev) => setVal(v.n, "cta", ev.target.value)} />
                        </label>
                        <details>
                          <summary className="atl-mir__muted">Consigne d'image (anglais)</summary>
                          <textarea rows={4} value={x.prompt ?? ""} onChange={(ev) => setVal(v.n, "prompt", ev.target.value)} />
                        </details>
                        {im?.statut === "erreur" && <p className="atl-mir__err">{im.erreur}</p>}
                        {im?.statut === "en cours" && <Wait label="Pub en cours…" since={im.debut} />}
                        <div className="atl-mir__row">
                          <button type="button" disabled={im?.statut === "en cours"} onClick={() => gen(v)}>
                            {im?.statut === "faite" ? "Refaire" : "Générer"}
                          </button>
                          {im?.statut === "faite" && (
                            <>
                              <button type="button" onClick={() => onPlace([`${im.url}?v=${im.v}`])}>
                                Poser sur le tableau
                              </button>
                              <a className="atl-mir__btn" href={im.url} download={im.url.split("/").pop()}>
                                ⤓
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

// Prompts d'images de la fiche (« LIBRARY SHOT N OF M ») : nom à créer,
// images à envoyer dans l'ordre, format, prompt.
function parseShots(text) {
  const heads = [...String(text).matchAll(/^#{1,4}\s.*?LIBRARY SHOT\s+(\d+)[^\n]*$/gim)];
  return heads
    .map((h, i) => {
      const body = text.slice(h.index, heads[i + 1]?.index ?? text.length);
      const nom = /Save the result as[^`\n]*`([^`]+)`/i.exec(body)?.[1]?.trim();
      const promptAt = body.search(/^#{1,4}\s.*PROMPT/im);
      const refZone = promptAt > 0 ? body.slice(0, promptAt) : body;
      const tableZone = refZone.slice(Math.max(0, refZone.search(/REFERENCE IMAGES/i)));
      // Ordre exact du tableau, doublons compris : le prompt compte « image 2 »,
      // « image 3 »… même quand c'est la même photo.
      const refs = [...tableZone.matchAll(/`([\w.-]+\.(?:jpe?g|png|webp))`/gi)].map((m) => m[1]).filter((f) => f !== nom);
      const prompt = /```[^\n]*\n([\s\S]*?)```/.exec(promptAt > 0 ? body.slice(promptAt) : body)?.[1]?.trim();
      const ratio = /Aspect ratio[^0-9\n]*(\d+\s*:\s*\d+)/i.exec(body)?.[1]?.replace(/\s/g, "") ?? "4:5";
      const titre = h[0].replace(/^#+\s*(🎬\s*)?/, "").trim();
      return nom && prompt ? { n: Number(h[1]), titre, nom, refs, prompt, ratio } : null;
    })
    .filter(Boolean);
}

const MODELES = [
  ["nano-banana", "Nano Banana (0,04 $)"],
  ["nano-banana-pro", "Nano Banana Pro (0,13 $)"],
  ["gpt-image-2", "GPT Image 2 (0,05 $)"],
];

function RefImages({ st, id, text, refresh, onPlace, setErr }) {
  const shots = parseShots(text);
  const [modele, setModele] = useState("nano-banana");
  const [chain, setChain] = useState(false);
  const imgs = st.images ?? {};
  const stem = (n) => n.replace(/\.[a-z0-9]+$/i, "");
  const anyRunning = shots.some((s) => imgs[stem(s.nom)]?.statut === "en cours");

  async function gen(s) {
    setErr(null);
    try {
      await api(`/${id}/image`, { nom: s.nom, prompt: s.prompt, refs: s.refs, ratio: s.ratio, modele });
      await refresh();
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    }
  }
  // « Tout générer » : une image après l'autre (la 1re sert de référence aux
  // suivantes), en sautant celles déjà faites.
  const tried = useRef(new Set());
  useEffect(() => {
    if (!chain) return void tried.current.clear();
    if (anyRunning) return;
    const next = shots.find((s) => imgs[stem(s.nom)]?.statut !== "faite");
    if (!next) return setChain(false);
    // Déjà tentée dans cette série et en erreur : on s'arrête là.
    if (tried.current.has(next.nom)) return setChain(false);
    tried.current.add(next.nom);
    gen(next).then((ok) => !ok && setChain(false));
  }, [chain, anyRunning, JSON.stringify(imgs)]);

  if (!shots.length) return <p className="atl-mir__muted">Je ne trouve pas les prompts d'images dans la fiche (refais l'étape si besoin).</p>;
  const done = shots.map((s) => imgs[stem(s.nom)]).filter((x) => x?.statut === "faite");
  return (
    <div className="atl-mir__refs">
      <h4>Images de référence ({done.length}/{shots.length})</h4>
      <p className="atl-mir__muted">Faites ici, avec les images demandées par chaque prompt, envoyées dans l'ordre. La 1re sert ensuite de référence aux autres : commence par elle.</p>
      <div className="atl-mir__row">
        <select value={modele} onChange={(e) => setModele(e.target.value)}>
          {MODELES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button type="button" className="is-main" disabled={chain || anyRunning || done.length === shots.length} onClick={() => setChain(true)}>
          {chain ? "Génération en cours…" : done.length ? "Générer les images restantes" : `Générer les ${shots.length} images`}
        </button>
        {done.length > 0 && (
          <button type="button" onClick={() => onPlace(done.map((x) => `${x.url}?v=${x.v}`))}>
            Poser les images sur le tableau
          </button>
        )}
      </div>
      {shots.map((s) => {
        const im = imgs[stem(s.nom)];
        return (
          <div key={s.nom} className="atl-mir__ref">
            <div className="atl-mir__refimg">{im?.statut === "faite" ? <img src={`${im.url}?v=${im.v}`} alt={s.nom} /> : im?.statut === "en cours" ? <span className="atl-mir__spin" /> : <span>{s.n}</span>}</div>
            <div className="atl-mir__refinfo">
              <b>{s.titre}</b>
              <small>
                {s.nom} · {s.ratio} · envoie : {s.refs.join(", ") || "aucune image"}
              </small>
              {im?.statut === "erreur" && <p className="atl-mir__err">{im.erreur}</p>}
              {im?.statut === "en cours" && <Wait label="Image en cours…" since={im.debut} />}
              <div className="atl-mir__row">
                <button type="button" disabled={im?.statut === "en cours" || chain} onClick={() => gen(s)}>
                  {im?.statut === "faite" ? "Refaire" : "Générer"}
                </button>
                {im?.statut === "faite" && (
                  <>
                    <button type="button" onClick={() => onPlace([`${im.url}?v=${im.v}`])}>
                      Poser sur le tableau
                    </button>
                    <a className="atl-mir__btn" href={im.url} download={im.url.split("/").pop()}>
                      ⤓
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Wait({ label, since }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = since ? Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000)) : 0;
  return (
    <p className="atl-mir__wait">
      <span className="atl-mir__spin" /> {label} {s ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : ""}
    </p>
  );
}

// Markdown simple (titres, listes, tableaux, gras, citations) ; chaque bloc
// de code devient une boîte avec un bouton Copier. Le texte est échappé
// avant mise en forme.
export function Markdown({ text }) {
  const parts = String(text).split(/^```[^\n]*\n([\s\S]*?)^```\s*$/m);
  return (
    <div className="atl-mir__md">
      {parts.map((p, i) => (i % 2 ? <CodeBox key={i} code={p.replace(/\n$/, "")} /> : <div key={i} dangerouslySetInnerHTML={{ __html: mdHtml(p) }} />))}
    </div>
  );
}
function CodeBox({ code }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="atl-mir__code">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(code).then(() => (setOk(true), setTimeout(() => setOk(false), 1500)));
        }}
      >
        {ok ? "Copié" : "Copier"}
      </button>
      <pre>{code}</pre>
    </div>
  );
}
function mdHtml(src) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  const lines = src.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      out.push(`<div class="atl-mir__tbl"><table>${body.map((r, k) => `<tr>${cells(r).map((c) => (k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join("")}</tr>`).join("")}</table></div>`);
      continue;
    }
    if (/^#{1,6}\s/.test(l)) {
      const n = Math.min(6, l.match(/^#+/)[0].length + 1);
      out.push(`<h${n}>${inline(l.replace(/^#+\s*/, ""))}</h${n}>`);
    } else if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    } else if (/^>\s?/.test(l)) {
      out.push(`<blockquote>${inline(l.replace(/^>\s?/, ""))}</blockquote>`);
    } else if (/^\s*(---|\*\*\*)\s*$/.test(l)) {
      out.push("<hr>");
    } else if (l.trim()) {
      out.push(`<p>${inline(l)}</p>`);
    }
    i++;
  }
  return out.join("");
}
