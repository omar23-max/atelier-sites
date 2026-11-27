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

export function ValidationTab({ project, pages = [], onSave, onMessage }) {
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
  // Garder le verdict malgré un changement (2026-11-25).
  async function confirmer() {
    setErr(null);
    const r = await fetch(`/api/validation/${project.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmer: true }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(b.error ?? `Erreur ${r.status}`);
    charger();
  }
  // Reprendre la validation déjà faite dans la Recherche (2026-11-25).
  async function reprendre() {
    setErr(null);
    const r = await fetch(`/api/validation/${project.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reprendre: true }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 409) return setErr(b.error ?? `Erreur ${r.status}`);
    charger();
  }
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
      {etat?.recherche && !enCours && (
        <div className="cat-val__reprise">
          <b>Déjà validé dans la Recherche</b> : « {etat.recherche.nom} »
          <ul>
            {[...etat.recherche.analyses].reverse().map((a, i) => (
              <li key={i}>
                {a.agent} · {new Date(a.le).toLocaleDateString("fr-CA")} : <b>{a.verdict ?? "pas d'avis tranché"}</b>
                {a.score != null ? ` ${a.score}/10` : ""}
                {a.marche ? ` · marché ${a.marche}` : ""}
                {a.resume ? <span className="cat-muted"> — {a.resume}</span> : null}
              </li>
            ))}
            {etat.recherche.verdictTrouve && <li className="cat-muted">Piste trouvée par l'agent de recherche : {etat.recherche.verdictTrouve}</li>}
          </ul>
          <div className="cat-actions">
            {etat.repris?.de === "recherche" ? (
              <span className="cat-muted">✓ Verdict ci-dessous repris de la Recherche{etat.repris.agent ? ` (${etat.repris.agent})` : ""}.</span>
            ) : (
              <button type="button" className="cat-btn" onClick={reprendre} title="Remet en forme le rapport complet du Product Validator déjà payé dans la Recherche : un petit appel IA (≈ 0,05 $), sans nouvelle recherche web ni crédits WinningHunter">
                Reprendre ce verdict
              </button>
            )}
            {etat.recherche.rapport && (
              <a className="cat-link" href={`/api/candidats/rapport/${etat.recherche.candidat}/${etat.recherche.rapport.fichier}`} target="_blank" rel="noopener noreferrer">
                rapport complet du {etat.recherche.rapport.agent}
              </a>
            )}
          </div>
          <p className="cat-muted">Relance une validation complète (plus bas) seulement si le marché, le produit ou l'offre ont changé depuis.</p>
        </div>
      )}
      <label className="cat-val__mots">
        <span className="cat-fd__label">Mots-clés WinningHunter (en anglais, type de produit, séparés par des virgules)</span>
        <input defaultValue={(project.validationMotsCles ?? []).join(", ")} placeholder="vide = trouvés automatiquement, ex. nfc business card, digital business card" onBlur={(e) => onSave({ validationMotsCles: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3) })} />
      </label>
      <div className="cat-actions">
        <button type="button" className="cat-btn" disabled={enCours} onClick={lancer}>
          {enCours ? "Analyse en cours… (1 à 3 min)" : R ? "Refaire la validation" : "Lancer la validation"}
        </button>
        {etat?.le && !enCours && <span className="cat-muted">Dernière analyse : {new Date(etat.le).toLocaleString("fr-CA")}{etat.porteSur ? (etat.aRelire?.length ? "" : " · porte sur la version actuelle du produit et de l'offre") : ""}</span>}
        {etat?.aRelire?.length > 0 && !enCours && (
          <span className="cat-vl__relire">
            ⚠ Depuis cette analyse, {etat.aRelire.map((k) => ({ produit: "le produit", commercial: "les prix ou les packs", marche: "le marché visé" })[k] ?? k).join(", ")} {etat.aRelire.length > 1 ? "ont" : "a"} changé : ce verdict porte sur l'ancienne version.{etat.aRelire.includes("commercial") ? " Relis la marge et les offres." : ""} Relance l'analyse si le changement compte.{" "}
            <button type="button" className="cat-link" onClick={confirmer} title="Le changement ne remet pas le verdict en cause : l'alerte disparaît, sans nouvelle analyse ni coût">
              Le verdict reste valable
            </button>
          </span>
        )}
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
      <Marge project={project} onSave={onSave} recherche={etat?.recherche ?? null} page={pages[0]?.info?.name ?? null} />
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
function Marge({ project, onSave, recherche = null, page = null }) {
  const [m, setM] = useState(() => ({ prix: "", cout: "", livraison: "", paiement: "3", cpa: "", ...(project.validationMarge ?? {}) }));
  // Supplier Scout (2026-11-26) : ses chiffres remplissent le calcul, que tu corriges ensuite.
  const scout = (recherche?.rapports ?? []).filter((x) => /supplier scout/i.test(x.agent ?? "")).sort((x, y) => String(y.le).localeCompare(String(x.le)))[0] ?? null;
  const avisScout = [...(recherche?.analyses ?? [])].reverse().find((a) => /supplier scout/i.test(a.agent ?? ""));
  const [fourn, setFourn] = useState(null); // { busy, err, note, voie }
  async function reprendreFournisseur() {
    setFourn({ busy: true });
    const r = await fetch(`/api/validation/${project.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fournisseur: true }) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    if (!r?.ok) return setFourn({ err: b?.error ?? "Échec" });
    const neuf = { ...m, ...(b.prix != null ? { prix: String(b.prix) } : {}), ...(b.cout != null ? { cout: String(b.cout) } : {}), ...(b.livraison != null ? { livraison: String(b.livraison) } : {}), source: "Supplier Scout" };
    setM(neuf);
    onSave({ validationMarge: neuf });
    setFourn({ note: b.note, voie: b.voie });
  }
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
      <div className="cat-val__fourn">
        <b>Coût fournisseur</b>{" "}
        {scout ? (
          <>
            <span className="cat-muted">
              Supplier Scout du {new Date(scout.le).toLocaleDateString("fr-CA")}
              {avisScout?.resume ? ` : ${avisScout.resume}` : ""}
            </span>{" "}
            <a className="cat-link" href={`/api/candidats/rapport/${recherche.candidat}/${scout.fichier}`} target="_blank" rel="noopener noreferrer">
              rapport complet
            </a>
            <div className="cat-actions">
              <button type="button" className="cat-btn" disabled={fourn?.busy} onClick={reprendreFournisseur} title="Un petit appel IA (≈ 0,01 $) relève le coût produit et la livraison par unité dans son rapport ; tu corriges ensuite si besoin">
                {fourn?.busy ? "Lecture du rapport…" : "Reprendre ses chiffres dans le calcul"}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="cat-muted">L'agent Supplier Scout cherche des fournisseurs (AliExpress pour tester, Alibaba pour monter en volume) et calcule le coût livré d'une unité.</span>
            <div className="cat-actions">
              <a className={`cat-btn${page ? "" : " is-disabled"}`} href={page ? `/agents.html?agent=whitelabeler-ai-supplier-scout-v-2&page=${encodeURIComponent(page)}` : undefined}>
                Chercher les fournisseurs (Supplier Scout)
              </a>
            </div>
            <span className="cat-muted">Pour que son rapport s'attache à la fiche du produit, lance-le plutôt depuis la Recherche (« Discuter de ce produit »).</span>
          </>
        )}
        {fourn?.err && <p className="cat-flash is-error">⚠ {fourn.err}</p>}
        {fourn?.note && <p className="cat-muted">Repris : {fourn.voie ? `${fourn.voie}. ` : ""}{fourn.note} Corrige les cases si tes devis sont différents.</p>}
      </div>
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

// ---- Registre des pubs (lot D du plan images et vidéos, 2026-11-24) ----
// Toutes les pubs du projet, images et vidéos, d'où qu'elles viennent (étape
// Publicités, Canvas, médiathèque) : suivi, angle, accroche, agent, pub
// d'origine. Actions : ouvrir dans le Canvas, variante, télécharger, retirer.
const SUIVI = { idee: "Idée", brouillon: "Brouillon", prete: "Prête", "en-test": "En test", gagnante: "Gagnante", arretee: "Arrêtée" };
const AGENT_PUB = { rebuild: "AI Ad Rebuilder V3", replicator: "AI Winning Ad Replicator", ugc: "Hyper Realistic UGC Image Studio", mockup: "Product Mockup Generator", marque: "Branded Image Creator", scroll: "Scroll-Stopping Image Ad Specialists", transformation: "AI Transformation Image Ad Generator" };
// Nom lisible de l'agent de chaque mode (mêmes noms que les fiches des médias).
const AGENTS_PUB = { ugcVideo: "UGC Video Producer V2", pubVideo: "AI Video Ad Generator", rebuild: "AI Ad Rebuilder V3", replicator: "AI Winning Ad Replicator", ugc: "Hyper Realistic UGC Image Studio", mockup: "Product Mockup Generator", marque: "Branded Image Creator", scroll: "Scroll-Stopping Image Ad Specialists", transformation: "Transformation Image Ad Generator", concept: "ChatGPT 2.0 Image Ad Generator", rebuildWL: "AI Ad Rebuilder V1 (WL)", maquetteMarque: "Brand Mockup Studio V1" };
const nomAgent = (k, x) => AGENTS_PUB[k] ?? String(x?.agent ?? "").replace(/^(whitelabeler|shopfunnels)-/, "").replace(/-v-(\d)/, " V$1").replace(/-/g, " ");

function RegistrePubs({ project, page, data, charger }) {
  const [f, setF] = useState({ type: "", suivi: "", angle: "" });
  const [local, setLocal] = useState({});
  const angles = (project.angles ?? []).filter((a) => a.choisi || a.choisie || a.statut === "choisi").map((a) => a.titre).filter(Boolean);
  const tousAngles = angles.length ? angles : (project.angles ?? []).map((a) => a.titre).filter(Boolean).slice(0, 12);
  const pubs = data.pubs.map((x) => ({ ...x, ...(local[x.id] ?? {}) }));
  const list = pubs.filter((x) => (!f.type || x.type === f.type) && (!f.suivi || x.suivi === f.suivi) && (!f.angle || x.angle === f.angle));
  const compte = (k) => pubs.filter((x) => x.suivi === k).length;
  async function maj(x, set) {
    const avant = local[x.id];
    setLocal((l) => ({ ...l, [x.id]: { ...(l[x.id] ?? {}), ...set } }));
    // Audit F18 (2026-11-25) : refus du serveur → on revient à l'état d'avant et on le dit.
    const r = await fetch(`/api/publicites/${project.id}/${x.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(set) }).catch(() => null);
    if (!r?.ok) {
      setLocal((l) => ({ ...l, [x.id]: avant }));
      alert("Le changement n'a pas été enregistré (le serveur l'a refusé ou ne répond pas). Réessaie.");
    }
  }
  async function variante(x) {
    const note = window.prompt("Variante : que veux-tu changer ? (ex. « l'accroche », « le décor », « une personne plus âgée »)", "l'accroche et la mise en scène");
    if (note === null) return;
    await fetch(`/api/publicites/${project.id}/${x.id}/variante`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
    charger();
  }
  const ouvrirCanvas = () => page && (location.href = `/canvas.html?page=${encodeURIComponent(page)}`);
  return (
    <div className="cat-reg">
      <div className="cat-reg__head">
        <h4>Registre des pubs</h4>
        <div className="cat-reg__counts">
          {Object.entries(SUIVI).map(([k, l]) => (
            <button key={k} type="button" className={`cat-reg__chip is-${k}${f.suivi === k ? " is-on" : ""}`} onClick={() => setF({ ...f, suivi: f.suivi === k ? "" : k })}>
              {l} <b>{compte(k)}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="cat-reg__filters">
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="">Images et vidéos</option>
          <option value="image">Images</option>
          <option value="video">Vidéos</option>
        </select>
        <select value={f.angle} onChange={(e) => setF({ ...f, angle: e.target.value })}>
          <option value="">Tous les angles</option>
          {tousAngles.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span className="cat-muted">{list.length} pub(s)</span>
      </div>
      {!pubs.length && <p className="cat-muted">Aucune pub pour l'instant. Crée-en une ci-dessous ou dans le Canvas, ou ajoute une image ou une vidéo depuis Médias (« En faire une pub »).</p>}
      <div className="cat-reg__grid">
        {list.map((x) => {
          const media = x.type === "video" ? x.video : x.image;
          return (
            <article key={x.id} className={`cat-reg__card is-${x.suivi}`}>
              <div className="cat-reg__media">
                {media ? x.type === "video" ? <video src={media} poster={x.poster ?? undefined} controls preload="metadata" /> : <img src={media} alt="" loading="lazy" /> : <span className="cat-muted">{x.statut === "erreur" ? `⚠ ${x.erreur ?? "Échec"}` : x.statut === "plan" ? "Proposition à générer (dans le Canvas)" : x.etape || "En cours…"}</span>}
                <span className="cat-reg__type">{x.type === "video" ? "Vidéo" : "Image"}{x.format ? ` · ${x.format}` : ""}</span>
                {x.versions?.length > 1 && (() => {
                  const cur = x.versionCourante ?? x.versions.at(-1).n;
                  const i = x.versions.findIndex((v) => v.n === cur);
                  const aller = async (v) => {
                    if (!v) return;
                    const r = await fetch(`/api/publicites/${project.id}/${x.id}/version`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n: v.n }) }).catch(() => null);
                    if (!r?.ok) return alert("Impossible de revenir à cette version (pub en cours ?).");
                    charger();
                  };
                  return (
                    <span className="cat-reg__versions" title="Chaque génération est gardée avec son plan, ses références et son modèle">
                      <button type="button" disabled={i <= 0} onClick={() => aller(x.versions[i - 1])} aria-label="Version précédente">◀</button>
                      version {cur} / {x.versions.at(-1).n}
                      <button type="button" disabled={i < 0 || i >= x.versions.length - 1} onClick={() => aller(x.versions[i + 1])} aria-label="Version suivante">▶</button>
                    </span>
                  );
                })()}
                {media && x.statut === "plan" && <span className="cat-reg__redo">Proposition corrigée : à regénérer (Canvas → Créer). Image précédente affichée.</span>}
              </div>
              <div className="cat-reg__info">
                <select className={`cat-reg__suivi is-${x.suivi}`} value={x.suivi} onChange={(e) => maj(x, { suivi: e.target.value })} aria-label="Suivi de la pub">
                  {Object.entries(SUIVI).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                <b>{x.plan?.accroche ? `« ${x.plan.accroche} »` : x.titre || "Sans accroche"}</b>
                <small className="cat-muted">
                  {x.mode === "ajoutee" ? `Depuis Médias${x.origineMedia?.source ? ` · ${x.origineMedia.source}` : ""}` : `${data.modes[x.mode]?.label ?? x.mode} · ${AGENT_PUB[x.mode] ?? ""}`}
                  {x.origine === "canvas" ? " · Canvas" : ""}
                  {x.parent ? " · variante" : ""} · {new Date(x.le).toLocaleDateString("fr-CA")}
                </small>
                <select value={x.angle ?? ""} onChange={(e) => maj(x, { angle: e.target.value })} aria-label="Angle">
                  <option value="">Angle : non précisé</option>
                  {[...new Set([...tousAngles, ...(x.angle ? [x.angle] : [])])].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                {x.source && (
                  <small className="cat-reg__orig">
                    <img src={x.source} alt="" /> d'après une pub existante
                  </small>
                )}
                {x.plan?.remplacements?.length > 0 && (
                  <details>
                    <summary>Promesses remplacées ({x.plan.remplacements.length})</summary>
                    <ul>
                      {x.plan.remplacements.map((r, i) => (
                        <li key={i}>
                          <s>{r.origine}</s> → {r.remplacement}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="cat-actions">
                  {media && (
                    <a className="cat-btn cat-btn--ghost" href={media} download>
                      Télécharger
                    </a>
                  )}
                  <button type="button" className="cat-link" onClick={ouvrirCanvas} disabled={!page}>
                    Canvas
                  </button>
                  {AGENT_PUB[x.mode] && x.statut === "pret" && (
                    <button type="button" className="cat-link" onClick={() => variante(x)}>
                      Variante
                    </button>
                  )}
                  <button type="button" className="cat-link" onClick={() => window.confirm("Retirer cette pub du registre ? (l'image ou la vidéo reste dans Médias)") && fetch(`/api/publicites/${project.id}/${x.id}`, { method: "DELETE" }).then(charger)}>
                    Retirer
                  </button>
                </div>
              </div>
            </article>
          );
        })}
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
  const [duree, setDuree] = useState(8);
  const [qualite, setQualite] = useState("720p");
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
  const video = m?.kind === "video";
  // Vidéo (2026-11-26) : les 2 modes vidéo du Canvas aussi ici ; format vertical ou horizontal seulement.
  const choisirMode = (k) => {
    setMode(k);
    const v = data.modes[k]?.kind === "video";
    setFormat((f) => (v ? (f === "16:9" ? "16:9" : "9:16") : ["4:5", "1:1", "9:16"].includes(f) ? f : "4:5"));
  };
  async function creer() {
    setErr(null);
    const r = await fetch(`/api/publicites/${project.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, source: m?.source ? source : null, refs, format, consigne, ...(video ? { duree, qualite } : {}) }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(b.error ?? `Erreur ${r.status}`);
    setConsigne("");
    charger();
  }
  const toggleRef = (u) => setRefs((l) => (l.includes(u) ? l.filter((x) => x !== u) : [...l, u].slice(0, video ? 3 : 6)));
  const ouvrir = (espace) => page && (location.href = espace === "canvas" ? `/canvas.html?page=${encodeURIComponent(page)}` : `/?page=${encodeURIComponent(page)}&ouvrir=${espace}`);
  return (
    <section className="cat-card cat-val">
      <h3>Publicités</h3>
      <p className="cat-muted">Chaque mode utilise le meilleur agent pour ce type de pub, avec ton produit, ton offre, ta marque et tes preuves. Contrôle des promesses : sur l'image, seules tes preuves peuvent apparaître ; celles d'une pub concurrente sont remplacées par ta preuve équivalente, reformulées en bénéfice ou retirées, et chaque remplacement est listé.</p>

      <RegistrePubs project={project} page={page} data={data} charger={charger} />

      <h4>Créer une pub ici (image ou vidéo)</h4>
      <p className="cat-muted">Tu peux aussi créer dans le Canvas (bouton Créer : proposition, correction, discussion avec l'agent) : les pubs arrivent dans ce même registre.</p>
      <div className="cat-pub__modes">
        {Object.entries(data.modes).map(([k, x]) => (
          <button key={k} type="button" className={`cat-pub__mode${mode === k ? " is-on" : ""}${x.kind === "video" ? " is-video" : ""}`} onClick={() => choisirMode(k)} title={`${x.kind === "video" ? "Vidéo" : "Image"} · agent : ${nomAgent(k, x)}`}>
            <b>{x.label}</b>
            <small>{x.kind === "video" ? "🎬 Vidéo · depuis tes photos" : `🖼 Image · ${x.source ? "depuis une pub existante" : "depuis le projet"}`}</small>
            <small className="cat-pub__agent">Agent : {nomAgent(k, x)}</small>
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
        <span className="cat-fd__label">{video ? "Photos du produit (jusqu'à 3 ; la première sert d'image de départ)" : "Références du produit et de la marque (jusqu'à 6)"}</span>
        {video && <p className="cat-muted">Gemini Omni filme un seul plan continu de 4 à 15 s. Pour passer son filtre : pas d'enfant à l'image, pas de marque concurrente. Choisis des photos de TON produit, sinon il sera inventé.</p>}
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
          {video ? (
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="9:16">9:16 (Reels, TikTok, Stories)</option>
              <option value="16:9">16:9 (horizontal)</option>
            </select>
          ) : (
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="4:5">4:5 (fil Meta)</option>
              <option value="1:1">1:1 (carré)</option>
              <option value="9:16">9:16 (Stories, Reels)</option>
            </select>
          )}
        </label>
        {video && (
          <>
            <label>
              <span className="cat-fd__label">Durée</span>
              <select value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
                {[4, 6, 8, 10, 12, 15].map((d) => (
                  <option key={d} value={d}>
                    {d} s
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="cat-fd__label">Qualité</span>
              <select value={qualite} onChange={(e) => setQualite(e.target.value)}>
                <option value="360p">360p (essai, moins cher)</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p (plus cher)</option>
              </select>
            </label>
          </>
        )}
        <label className="cat-pub__consigne">
          <span className="cat-fd__label">Précision (facultatif)</span>
          <input value={consigne} onChange={(e) => setConsigne(e.target.value)} placeholder="ex. angle « fatigué même après 8 h de sommeil », ambiance matinale" />
        </label>
        <button type="button" className="cat-btn" disabled={!m || (m.source && !source) || (video && !refs.length)} onClick={creer} title={video ? "Payant : l'agent écrit le plan puis Gemini Omni filme tout de suite. Plus cher qu'une image : le prix dépend de la durée et de la qualité, il s'affiche dans le registre une fois la vidéo faite. Pour relire le plan avant de filmer, passe par le Canvas (bouton Vidéo)." : "Payant : l'agent prépare la pub puis l'image est générée tout de suite (≈ 0,05 $). Pour relire la proposition avant de générer, passe par le Canvas (Créer avec un agent)."}>
          Préparer et générer (payant)
        </button>
      </div>
      {err && <p className="cat-flash is-error">⚠ {err}</p>}

      <h4>Plan de lancement Meta</h4>
      <p className="cat-muted">Une fois tes pubs prêtes : comment les lancer sur Facebook et Instagram (structure de campagne, budget de départ, quand couper, quand monter). L'agent lit ton projet (offre, angles, message central) ; dis-lui quelles pubs du registre tu veux tester. C'est une conversation : rien n'est dépensé chez Meta.</p>
      <div className="cat-actions">
        <a className={`cat-btn${page ? "" : " is-disabled"}`} href={page ? `/agents.html?agent=shopfunnels-ai-andromeda-ad-strategist&page=${encodeURIComponent(page)}` : undefined} title="AI Andromeda Ad Strategist (ShopFunnels) : plan de lancement et de montée en budget, adapté au système Andromeda de Meta">
          Plan de lancement (Andromeda)
        </a>
        <a className={`cat-btn cat-btn--ghost${page ? "" : " is-disabled"}`} href={page ? `/agents.html?agent=whitelabeler-facebook-ad-strategist-v-2&page=${encodeURIComponent(page)}` : undefined} title="Facebook Ad Strategist V2 (Whitelabeler) : analyse des pubs des concurrents">
          Analyser les pubs concurrentes
        </a>
      </div>

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
