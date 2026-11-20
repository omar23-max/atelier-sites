// Importer depuis WinningHunter (2026-11-20) : chercher les pubs d'une
// marque (site, nom de page, texte…), voir images et vidéos en vignettes,
// cocher, importer dans les médias du projet ; Canvas les pose en grille.
// Serveur : /api/wh/* (server/api.mjs), clé dans .env.local.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TRIS = [
  ["relevance", "Pertinence"],
  ["longestrunning", "Tourne depuis le plus longtemps"],
  ["adspend", "Plus de dépenses"],
  ["mostrecent", "Plus récentes"],
  ["lastseen", "Vues récemment"],
];
const CHAMPS = [
  ["", "Partout"],
  ["landingurl", "Site (adresse)"],
  ["pagename", "Nom de la page"],
  ["adtext", "Texte de la pub"],
  ["productname", "Nom du produit"],
];

async function readJson(res) {
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Réponse inattendue du serveur (erreur ${res.status}).`);
  }
  if (!res.ok || body?.error) throw Object.assign(new Error(body?.error ?? `Erreur ${res.status}`), { body });
  return body;
}

const money = (n) => (n == null ? null : n >= 1000 ? `${Math.round(n / 100) / 10} k$ dépensés` : n < 1 ? "< 1 $ dépensé" : `${Math.round(n)} $ dépensés`);

export function WhImport({ page, onImported, onClose, title = "Importer depuis WinningHunter" }) {
  const [cle, setCle] = useState(null); // null = vérification, false = absente
  const [keyInput, setKeyInput] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("videos");
  const [tri, setTri] = useState("longestrunning");
  const [champ, setChamp] = useState("");
  const [ads, setAds] = useState([]);
  const [scroll, setScroll] = useState(null);
  const [total, setTotal] = useState(null);
  const [ticked, setTicked] = useState([]); // [{ key, type, url, poster }]
  const [state, setState] = useState(null); // { busy, step } | { error } | { ok }
  const inputRef = useRef(null);

  useEffect(() => {
    fetch("/api/wh/statut")
      .then(readJson)
      .then((b) => setCle(b.cle))
      .catch(() => setCle(false));
  }, []);
  useEffect(() => {
    if (cle) inputRef.current?.focus();
  }, [cle]);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && !state?.busy && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [state]);

  async function saveKey() {
    setState({ busy: true, step: "Vérification de la clé…" });
    try {
      const b = await readJson(await fetch("/api/wh/cle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cle: keyInput }) }));
      setKeyInput("");
      setCle(true);
      const left = b.credits?.total_remaining ?? b.credits?.remaining;
      setState({ ok: `Clé enregistrée${left != null ? ` (${left} crédits restants)` : ""}.` });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  async function search(more = false) {
    if (!q.trim()) return;
    setState({ busy: true, step: more ? "Résultats suivants…" : "Recherche…" });
    try {
      const params = new URLSearchParams({ q: q.trim(), type, tri, champ });
      if (more && scroll) params.set("scroll", scroll);
      const b = await readJson(await fetch(`/api/wh/recherche?${params}`));
      setAds((list) => (more ? [...list, ...b.ads] : b.ads));
      setScroll(b.scroll);
      setTotal(b.total);
      if (!more) setTicked([]);
      setState(b.ads.length || more ? null : { error: "Aucune pub trouvée. Essaie le nom de la page ou un autre champ." });
    } catch (e) {
      if (e.body?.cle === false) setCle(false);
      setState({ error: e.message });
    }
  }

  const keyOf = (ad, j) => `${ad.id}#${j}`;
  const toggle = (ad, j, m) => {
    const k = keyOf(ad, j);
    setTicked((t) => (t.some((x) => x.key === k) ? t.filter((x) => x.key !== k) : [...t, { key: k, ...m }]));
  };
  const tiles = ads.flatMap((ad) => ad.medias.map((m, j) => ({ ad, m, j, key: keyOf(ad, j) })));
  const allTicked = tiles.length > 0 && tiles.every((t) => ticked.some((x) => x.key === t.key));

  async function importNow() {
    setState({ busy: true, step: `Téléchargement de ${ticked.length} fichier(s)…` });
    try {
      const b = await readJson(
        await fetch("/api/wh/importer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page, items: ticked.map(({ type: t, url, poster }) => ({ type: t, url, poster })) }),
        }),
      );
      const ok = b.items.filter((x) => x.ok);
      const ko = b.items.length - ok.length;
      if (ok.length) await onImported?.(ok);
      setTicked([]);
      setState(ko ? { error: `${ok.length} importé(s), ${ko} en échec : ${b.items.find((x) => !x.ok)?.error ?? ""}` } : { ok: `${ok.length} fichier(s) importé(s) dans les médias du projet.` });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  return createPortal(
    <div className="atl-wh" role="dialog" aria-modal="true" onPointerDown={(e) => e.target === e.currentTarget && !state?.busy && onClose()}>
      <div className="atl-wh__panel" onPointerDown={(e) => e.stopPropagation()}>
        <header className="atl-wh__head">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} disabled={state?.busy} aria-label="Fermer">
            ×
          </button>
        </header>

        {cle === null && <p className="atl-wh__muted">Vérification…</p>}

        {cle === false && (
          <div className="atl-wh__key">
            <p>
              Colle ta <b>clé d'API WinningHunter</b> (une seule fois). Elle se trouve sur{" "}
              <a href="https://app.winninghunter.com/api" target="_blank" rel="noreferrer">
                app.winninghunter.com/api
              </a>{" "}
              → « Get API key ». Elle reste sur le serveur de l'atelier.
            </p>
            <div className="atl-wh__row">
              <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Clé d'API WinningHunter" autoComplete="off" onKeyDown={(e) => e.key === "Enter" && keyInput.trim() && saveKey()} />
              <button type="button" className="atl-wh__go" disabled={!keyInput.trim() || state?.busy} onClick={saveKey}>
                Enregistrer
              </button>
            </div>
          </div>
        )}

        {cle && (
          <>
            <div className="atl-wh__search">
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Marque, site ou mot-clé (ex. farandwideofficial.com)" />
              <select value={champ} onChange={(e) => setChamp(e.target.value)} title="Où chercher">
                {CHAMPS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select value={type} onChange={(e) => setType(e.target.value)} title="Type">
                <option value="videos">Vidéos</option>
                <option value="images">Images</option>
                <option value="tout">Tout</option>
              </select>
              <select value={tri} onChange={(e) => setTri(e.target.value)} title="Tri">
                {TRIS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button type="button" className="atl-wh__go" disabled={!q.trim() || state?.busy} onClick={() => search(false)}>
                Chercher
              </button>
            </div>
            {tiles.length > 0 && (
              <div className="atl-wh__bar">
                <span>
                  {tiles.length} média(s){total != null ? ` · ${total} pub(s) au total` : ""} · 1 crédit par page de résultats
                </span>
                <button type="button" onClick={() => setTicked(allTicked ? [] : tiles.map((t) => ({ key: t.key, ...t.m })))}>
                  {allTicked ? "Tout décocher" : "Tout cocher"}
                </button>
              </div>
            )}
            <div className="atl-wh__grid">
              {tiles.map(({ ad, m, j, key }) => {
                const n = ticked.findIndex((x) => x.key === key);
                return (
                  <button key={key} type="button" className={`atl-wh__tile${n >= 0 ? " is-on" : ""}`} onClick={() => toggle(ad, j, m)} title={ad.texte}>
                    <span className="atl-wh__media">
                      {m.type === "video" ? (
                        <video src={m.url} poster={m.poster ?? undefined} muted loop playsInline preload="none" onMouseEnter={(e) => e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} />
                      ) : (
                        <img src={m.url} alt="" loading="lazy" />
                      )}
                      {m.type === "video" && <i>▶ vidéo</i>}
                      {n >= 0 && <em>{n + 1}</em>}
                    </span>
                    <span className="atl-wh__info">
                      <b>{ad.marque}</b>
                      <small>{[ad.jours != null ? `${ad.jours} j` : null, ad.depense != null ? money(ad.depense) : null, ad.debut ? `depuis ${ad.debut}` : null].filter(Boolean).join(" · ")}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            {scroll && (
              <button type="button" className="atl-wh__more" disabled={state?.busy} onClick={() => search(true)}>
                Plus de résultats
              </button>
            )}
          </>
        )}

        <footer className="atl-wh__foot">
          {state?.busy && <span className="atl-wh__muted">{state.step}</span>}
          {state?.error && <span className="atl-wh__err">{state.error}</span>}
          {state?.ok && <span className="atl-wh__ok">{state.ok}</span>}
          <span />
          {cle && (
            <button type="button" className="atl-wh__go" disabled={!ticked.length || state?.busy} onClick={importNow}>
              Importer{ticked.length ? ` (${ticked.length})` : ""}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
