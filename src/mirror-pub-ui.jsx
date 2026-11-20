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

export function MirrorPanel({ video, poster, photosDuTableau, onPick, picking, onPlace, onClose }) {
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
  const busy = st && (["en attente", "en cours"].includes(st.analyse?.statut) || Object.values(st.etapes ?? {}).some((e) => e.statut === "en cours"));
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
                          {name === "cast" && !photos.length && !e && <p className="atl-mir__muted">Ajoute d'abord au moins une photo de ton produit.</p>}
                        </>
                      )}
                    </section>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </aside>
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
function Markdown({ text }) {
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
