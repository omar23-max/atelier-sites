// Étape « Validation produit » (refonte guidée, lot 3, 2026-11-23) et
// étape « Publicités » (entrée vers Studio, Canvas et Mirror ; lot 4 à venir).
import { useEffect, useState } from "react";

const VERDICT = {
  GO: ["GO", "Le produit tient la route : on peut lancer.", "is-go"],
  GO_CONDITIONS: ["GO avec conditions", "Possible, à condition de régler les points ci-dessous.", "is-cond"],
  ALTERNATIVES: ["Chercher mieux", "Signal faible : possible, mais un autre produit ou un autre angle ferait sans doute mieux.", "is-cond"],
  NO_GO: ["NON", "Trop de signaux contre : mieux vaut changer de produit ou attendre.", "is-no"],
};
const liste = (a) => (Array.isArray(a) ? a.filter(Boolean) : a ? [a] : []);

export function ValidationTab({ project, onSave, onMessage }) {
  const [etat, setEtat] = useState(null);
  const [err, setErr] = useState(null);
  async function charger() {
    const e = await fetch(`/api/validation/${project.id}`).then((r) => r.json()).catch(() => null);
    setEtat(e);
    return e;
  }
  useEffect(() => {
    charger();
  }, [project.id]);
  const enCours = etat?.statut === "en cours";
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(async () => {
      const e = await charger();
      if (e?.statut === "pret" && e.resultat?.verdict) {
        onSave({ validation: { verdict: e.resultat.verdict, score: e.resultat.score ?? null, le: e.le } });
        onMessage?.({ text: `Validation terminée : ${VERDICT[e.resultat.verdict]?.[0] ?? e.resultat.verdict}.` });
      }
    }, 4000);
    return () => clearInterval(t);
  }, [enCours, project.id]);
  async function lancer() {
    setErr(null);
    const r = await fetch(`/api/validation/${project.id}`, { method: "POST" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 409) return setErr(b.error ?? `Erreur ${r.status}`);
    charger();
  }
  const R = etat?.resultat;
  const v = R ? VERDICT[R.verdict] : null;
  return (
    <section className="cat-card cat-val">
      <h3>Validation produit</h3>
      <p className="cat-muted">
        Avant de dépenser en pubs : l'agent <b>Product Validator</b> examine ton produit avec la recherche web (demande réelle, tendance, concurrents, prix du marché, coût d'achat) et rend un verdict. Il s'appuie sur tes Fondations ; ce qu'il a observé est sourcé, ce qu'il estime est dit comme une estimation.
      </p>
      <label className="cat-val__mots">
        <span className="cat-fd__label">Mots-clés WinningHunter (en anglais, type de produit, séparés par des virgules)</span>
        <input defaultValue={(project.validationMotsCles ?? []).join(", ")} placeholder="vide = trouvés automatiquement, ex. nfc business card, digital business card" onBlur={(e) => onSave({ validationMotsCles: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3) })} />
      </label>
      <div className="cat-actions">
        <button type="button" className="cat-btn" disabled={enCours} onClick={lancer}>
          {enCours ? "Analyse en cours… (1 à 3 min)" : R ? "Refaire la validation" : "Lancer la validation"}
        </button>
        {etat?.le && !enCours && <span className="cat-muted">Dernière analyse : {new Date(etat.le).toLocaleString("fr-CA")}</span>}
      </div>
      {(err || etat?.statut === "erreur") && <p className="cat-flash is-error">⚠ {err ?? etat.erreur}</p>}
      {R && (
        <>
          <div className={`cat-val__verdict ${v?.[2] ?? ""}`}>
            <b>{v?.[0] ?? R.verdict}</b>
            {R.score != null && <span className="cat-val__score">{R.score}/10</span>}
            <p>{R.resume || v?.[1]}</p>
          </div>
          {R.signaux?.length > 0 && (
            <div className="cat-val__signaux">
              {R.signaux.map((x, i) => (
                <div key={i}>
                  <span className="cat-fd__label">{x.nom}</span>
                  <b>{x.note}/10</b> <em>{x.source}</em>
                  <p>{x.constat}</p>
                </div>
              ))}
            </div>
          )}
          {etat.winninghunter?.resume?.length > 0 && (
            <div className="cat-val__bloc">
              <span className="cat-fd__label">WinningHunter (pubs Meta actives, observées)</span>
              <ul>
                {etat.winninghunter.resume.map((w) => (
                  <li key={w.mot}>
                    « {w.mot} » : {w.pubs} pubs actives de vrais concurrents{w.releves ? ` (sur ${w.releves})` : ""}, {w.annonceurs} annonceurs{w.exclus?.length ? ` (${w.exclus.length} hors sujet écartés)` : ""}, durée médiane {w.median ?? "?"} j, {w.longues} depuis 30 j ou plus
                    {w.marques?.length > 0 && <> · en tête : {w.marques.slice(0, 4).map((m) => `${m.marque} (${m.joursMax} j)`).join(", ")}</>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="cat-val__grid">
            <Bloc titre="Demande" niveau={R.demande?.niveau} items={R.demande?.constats} />
            <Bloc titre="Tendance" niveau={R.tendance?.direction} sous={R.tendance?.saison} items={R.tendance?.constats} />
            <Bloc titre="Concurrence" niveau={R.concurrence?.niveau} items={[...liste(R.concurrence?.acteurs).map((a) => `${a.nom}${a.prix ? ` · ${a.prix}` : ""}${a.angle ? ` · ${a.angle}` : ""}`), ...liste(R.concurrence?.constats)]} />
            <Bloc titre="Marge (estimation de l'IA)" items={[R.marge?.prixMarche && `Prix du marché : ${R.marge.prixMarche}`, R.marge?.coutEstime && `Coût estimé : ${R.marge.coutEstime}`, R.marge?.commentaire]} />
            <Bloc titre="Risques" items={R.risques} />
            <Bloc titre="Conditions pour réussir" items={R.conditions} />
            <Bloc titre="À vérifier" items={R.aVerifier} />
            <Bloc titre="Prochaines actions" items={R.prochainesActions} />
          </div>
          {etat.sources?.length > 0 && (
            <p className="cat-val__sources">
              Sources :{" "}
              {etat.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.titre || new URL(s.url).hostname}
                </a>
              ))}
            </p>
          )}
        </>
      )}
      <Marge project={project} onSave={onSave} />
    </section>
  );
}

function Bloc({ titre, niveau, sous, items }) {
  const l = liste(items);
  if (!niveau && !l.length) return null;
  return (
    <div className="cat-val__bloc">
      <span className="cat-fd__label">{titre}</span>
      {niveau && <b className="cat-val__niveau">{niveau}{sous ? ` · ${sous}` : ""}</b>}
      {l.length > 0 && (
        <ul>
          {l.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Calcul de marge (tes vrais chiffres), comme le tableau « Sourcing Strategy & Margins ».
function Marge({ project, onSave }) {
  const [m, setM] = useState(() => ({ prix: "", cout: "", livraison: "", paiement: "3", cpa: "", ...(project.validationMarge ?? {}) }));
  const n = (k) => Number(String(m[k] ?? "").replace(",", ".")) || 0;
  const frais = (n("prix") * n("paiement")) / 100;
  const brut = n("prix") - n("cout") - n("livraison") - frais;
  const net = brut - n("cpa");
  const pct = (x) => (n("prix") ? `${Math.round((x / n("prix")) * 100)} %` : "—");
  const champ = (k, label) => (
    <label key={k}>
      <span className="cat-fd__label">{label}</span>
      <input inputMode="decimal" value={m[k]} onChange={(e) => setM((o) => ({ ...o, [k]: e.target.value }))} onBlur={() => onSave({ validationMarge: m })} />
    </label>
  );
  return (
    <div className="cat-val__marge">
      <h4>Marge (tes chiffres)</h4>
      <div className="cat-val__margeChamps">
        {champ("prix", "Prix de vente")}
        {champ("cout", "Coût du produit")}
        {champ("livraison", "Livraison")}
        {champ("paiement", "Frais de paiement %")}
        {champ("cpa", "Coût pub par vente (CPA)")}
      </div>
      <div className="cat-val__margeRes">
        <span>
          Marge brute <b>{brut.toFixed(2)}</b> <em>{pct(brut)}</em>
        </span>
        <span>
          Après pub <b className={net < 0 ? "is-neg" : ""}>{net.toFixed(2)}</b> <em>{pct(net)}</em>
        </span>
        <span>
          CPA maximum pour ne pas perdre <b>{Math.max(0, brut).toFixed(2)}</b>
        </span>
      </div>
    </div>
  );
}

// Étape « Publicités » (lot 4, 2026-11-23) : pubs images guidées par un agent
// (contexte du projet + contrôle des promesses) et suivi des vidéos Mirror.
export function PublicitesTab({ project, pages }) {
  const page = pages[0]?.info?.name;
  const [data, setData] = useState({ modes: {}, pubs: [] });
  const [medias, setMedias] = useState([]);
  const [mirrors, setMirrors] = useState([]);
  const [mode, setMode] = useState("rebuild");
  const [source, setSource] = useState(null);
  const [refs, setRefs] = useState([]);
  const [format, setFormat] = useState("4:5");
  const [consigne, setConsigne] = useState("");
  const [err, setErr] = useState(null);
  const charger = () =>
    fetch(`/api/publicites/${project.id}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  useEffect(() => {
    charger();
    fetch(`/api/medias/projet-${project.id}?detail=1`)
      .then((r) => r.json())
      .then((l) => setMedias((Array.isArray(l) ? l : []).filter((m) => m.kind !== "video" && /\.(png|jpe?g|webp)$/i.test(m.url))))
      .catch(() => {});
    fetch(`/api/mirror?page=projet-${project.id}`)
      .then((r) => r.json())
      .then((d) => setMirrors(d.mirrors ?? []))
      .catch(() => {});
  }, [project.id]);
  const enCours = data.pubs.some((x) => x.statut === "en cours");
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(charger, 4000);
    return () => clearInterval(t);
  }, [enCours, project.id]);
  const m = data.modes[mode];
  async function creer() {
    setErr(null);
    const r = await fetch(`/api/publicites/${project.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, source: m?.source ? source : null, refs, format, consigne }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(b.error ?? `Erreur ${r.status}`);
    setConsigne("");
    charger();
  }
  const toggleRef = (u) => setRefs((l) => (l.includes(u) ? l.filter((x) => x !== u) : [...l, u].slice(0, 6)));
  const ouvrir = (espace) => page && (location.href = `/?page=${encodeURIComponent(page)}&ouvrir=${espace}`);
  return (
    <section className="cat-card cat-val">
      <h3>Publicités</h3>
      <p className="cat-muted">Chaque mode utilise le meilleur agent pour ce type de pub, avec ton produit, ton offre, ta marque et tes preuves. Contrôle des promesses : sur l'image, seules tes preuves peuvent apparaître ; celles d'une pub concurrente sont remplacées par ta preuve équivalente, reformulées en bénéfice ou retirées, et chaque remplacement est listé.</p>

      <h4>Pubs images</h4>
      <div className="cat-pub__modes">
        {Object.entries(data.modes).map(([k, x]) => (
          <button key={k} type="button" className={`cat-pub__mode${mode === k ? " is-on" : ""}`} onClick={() => setMode(k)}>
            <b>{x.label}</b>
            <small>{x.source ? "à partir d'une pub existante" : "à partir du projet"}</small>
          </button>
        ))}
      </div>
      {medias.length === 0 && <p className="cat-flash">Aucune image dans les médias du projet : ajoute la pub d'origine et les photos du produit (étape Médias, ou le Canvas).</p>}
      {m?.source && (
        <div>
          <span className="cat-fd__label">Pub d'origine (une image)</span>
          <div className="cat-pub__pick">
            {medias.map((x) => (
              <button key={x.url} type="button" className={source === x.url ? "is-on" : ""} onClick={() => setSource(source === x.url ? null : x.url)} title={x.url.split("/").pop()}>
                <img src={x.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <span className="cat-fd__label">Références du produit et de la marque (jusqu'à 6)</span>
        <div className="cat-pub__pick">
          {medias.map((x) => (
            <button key={x.url} type="button" className={refs.includes(x.url) ? "is-on" : ""} onClick={() => toggleRef(x.url)} title={x.url.split("/").pop()}>
              <img src={x.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      </div>
      <div className="cat-pub__row">
        <label>
          <span className="cat-fd__label">Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="4:5">4:5 (fil Meta)</option>
            <option value="1:1">1:1 (carré)</option>
            <option value="9:16">9:16 (Stories, Reels)</option>
          </select>
        </label>
        <label className="cat-pub__consigne">
          <span className="cat-fd__label">Précision (facultatif)</span>
          <input value={consigne} onChange={(e) => setConsigne(e.target.value)} placeholder="ex. angle « fatigué même après 8 h de sommeil », ambiance matinale" />
        </label>
        <button type="button" className="cat-btn" disabled={!m || (m.source && !source)} onClick={creer}>
          Créer la pub
        </button>
      </div>
      {err && <p className="cat-flash is-error">⚠ {err}</p>}

      {data.pubs.length > 0 && (
        <div className="cat-pub__gal">
          {data.pubs.map((x) => (
            <article key={x.id} className="cat-pub__card">
              <div className="cat-pub__img">{x.image ? <img src={x.image} alt="" /> : <span className="cat-muted">{x.statut === "erreur" ? "⚠ Échec" : x.etape || "En cours…"}</span>}</div>
              <div className="cat-pub__info">
                <b>{data.modes[x.mode]?.label ?? x.mode}</b>
                <small className="cat-muted">{new Date(x.le).toLocaleString("fr-CA")} · {x.format}</small>
                {x.erreur && <p className="cat-flash is-error">{x.erreur}</p>}
                {x.plan?.accroche && <p>« {x.plan.accroche} »{x.plan.cta ? ` · ${x.plan.cta}` : ""}</p>}
                {x.plan?.remplacements?.length > 0 && (
                  <details>
                    <summary>Promesses remplacées ({x.plan.remplacements.length})</summary>
                    <ul>
                      {x.plan.remplacements.map((r, i) => (
                        <li key={i}>
                          <s>{r.origine}</s> → {r.remplacement} <span className="cat-muted">({r.raison})</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {x.plan?.textesVisibles?.length > 0 && <small className="cat-muted">Textes sur l'image : {x.plan.textesVisibles.join(" · ")}</small>}
                <div className="cat-actions">
                  {x.image && (
                    <a className="cat-btn cat-btn--ghost" href={x.image} download>
                      Télécharger
                    </a>
                  )}
                  <button type="button" className="cat-link" onClick={() => fetch(`/api/publicites/${project.id}/${x.id}`, { method: "DELETE" }).then(charger)}>
                    Retirer
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <h4>Pubs vidéos</h4>
      <p className="cat-muted">Mirror vidéo, dans le Canvas : analyse d'une pub concurrente (plans, script), adaptation à ton produit avec le contexte du projet, images de référence, puis prompts pour TopView ou Seedance.</p>
      {mirrors.filter((x) => x.kind !== "image").length > 0 ? (
        <ul className="cat-pub__mirrors">
          {mirrors
            .filter((x) => x.kind !== "image")
            .map((x) => (
              <li key={x.id}>
                <b>{String(x.video ?? x.id).split("/").pop()}</b> <span className="cat-muted">· {new Date(x.cree).toLocaleDateString("fr-CA")} · analyse : {x.analyse ?? "—"}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="cat-muted">Aucune vidéo Mirror dans ce projet pour l'instant.</p>
      )}
      <div className="cat-actions">
        <button type="button" className="cat-btn" disabled={!page} onClick={() => ouvrir("canvas")}>
          Ouvrir le Canvas (Mirror vidéo)
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" disabled={!page} onClick={() => ouvrir("studio")}>
          Ouvrir le Studio
        </button>
      </div>
    </section>
  );
}
