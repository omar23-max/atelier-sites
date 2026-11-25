// Agents army (2026-11-22) : les agents de l'abonnement Whitelabeler de
// l'utilisateur (Ai Vault 3.0), pour son usage personnel. Liste à gauche,
// page de présentation à droite (sa page d'origine, telle quelle), comme sur
// Whitelabeler. « Access AI Employee » ouvre l'agent sur Whitelabeler.
// Ensuite : choisir lesquels brancher dans chaque partie de l'atelier.
import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "../mirror-pub-ui.jsx";
import { RechercheGrille, RangerReponse } from "./RechercheGrille.jsx";

// Les pages Whitelabeler (cadre isolé) restaient blanches jusqu'au premier
// redimensionnement du cadre. On le provoque quelques fois après leur arrivée
// (2026-11-22) : 1 px de moins puis la taille normale, invisible à l'œil.
function useRelanceCadre(cadre, dep) {
  useEffect(() => {
    if (!dep) return;
    const ids = [300, 900, 1800, 3000].map((ms) =>
      setTimeout(() => {
        const f = cadre.current;
        if (!f) return;
        f.style.height = `${Math.max(100, f.offsetHeight - 1)}px`;
        setTimeout(() => f && (f.style.height = ""), 120);
      }, ms),
    );
    return () => ids.forEach(clearTimeout);
  }, [dep]);
}

export function AgentsArmy({ espace = null }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  // Lot 5 (2026-11-23) : les agents rangés par tâche (recommandés, autres, réserve).
  const [vueListe, setVueListe] = useState(() => localStorage.getItem("atl-agents-vue") ?? "taches");
  const [taches, setTaches] = useState(null);
  useEffect(() => localStorage.setItem("atl-agents-vue", vueListe), [vueListe]);
  useEffect(() => {
    fetch("/api/agents/taches")
      .then((r) => r.json())
      .then((d) => setTaches(d.taches ?? []))
      .catch(() => setTaches([]));
  }, []);
  const [cur, setCur] = useState(() => new URLSearchParams(location.search).get("agent") || null);
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then(async (d) => {
        // Espace « Recherche produits » : agents Omar_winninghunter d'abord, puis
        // les agents Whitelabeler choisis, nommés « Whitelabeler … ».
        if (espace) {
          const e = await fetch("/api/agents/recherche").then((r) => r.json());
          const garder = new Set(e.whitelabeler ?? []);
          const wl = d.agents.filter((a) => garder.has(a.slug)).map((a) => ({ ...a, titre: a.titre.replace(/^(ShopFunnels|Shopfunnels)\s+/, "Whitelabeler ") }));
          const om = (e.omar ?? []).map((a) => ({ slug: a.slug, titre: a.titre, accroche: a.but, omar: a }));
          d = { ...d, agents: [...om, ...wl], source: "Omar_winninghunter + Whitelabeler" };
        }
        setData(d);
        // Espace Recherche : la grille des résultats d'abord (2026-11-25).
        setCur((c) => c ?? (espace ? "__grille" : d.agents?.[0]?.slug ?? null));
      })
      .catch((e) => setErr(e.message));
  }, []);
  const list = useMemo(() => {
    const all = data?.agents ?? [];
    const s = q.trim().toLowerCase();
    return s ? all.filter((a) => `${a.titre} ${a.accroche}`.toLowerCase().includes(s)) : all;
  }, [data, q]);
  const agent = (data?.agents ?? []).find((a) => a.slug === cur);
  // Page de présentation glissée dans le cadre (srcdoc), comme Whitelabeler :
  // chargée par adresse dans un cadre isolé, elle restait blanche.
  const [html, setHtml] = useState("");
  const cadre = useRef(null);
  // Consigne (prompt) de l'agent, déjà dans sa page (2026-11-22) : affichée à
  // la place de la présentation, avec Copier.
  const [vue, setVue] = useState("presentation");
  // « Discuter de ce produit » depuis la grille : agent + fiche du produit.
  const [candidatChat, setCandidatChat] = useState(null);
  const vueVoulue = useRef(null);
  function discuter(slug, c, message) {
    // Produit déjà lancé : la conversation se fait sur son projet (2026-11-25).
    setCandidatChat(c ? { id: c.id, nom: c.nom, message: message ?? "", projet: c.lance ?? null } : null);
    vueVoulue.current = "chat";
    if (slug === cur) setVue("chat");
    setCur(slug);
  }
  function choisir(slug) {
    setCandidatChat(null);
    setCur(slug);
  }
  useRelanceCadre(cadre, html && vue === "presentation" ? cur + html.length : null);
  const [consigne, setConsigne] = useState(null);
  // Lot 2 : la consigne nettoyée par défaut ; l'original reste consultable.
  const [consOriginal, setConsOriginal] = useState(false);
  const [consNettoyable, setConsNettoyable] = useState(false);
  async function chargerConsigne(original) {
    setConsigne(null);
    const r = await fetch(`/api/agents/${cur}/consigne${original ? "?original=1" : ""}`);
    const k = r.headers.get("X-Consigne") ?? "original";
    setConsNettoyable(k !== "original");
    setConsOriginal(original);
    setConsigne(r.ok ? await r.text() : "");
  }
  const [copie, setCopie] = useState(false);
  useEffect(() => {
    setVue(vueVoulue.current ?? "presentation");
    vueVoulue.current = null;
    setConsigne(null);
  }, [cur]);
  async function voirConsigne() {
    if (vue === "consigne") return setVue("presentation");
    setVue("consigne");
    if (consigne == null) {
      return chargerConsigne(false);
      const r = await fetch(`/api/agents/${cur}/consigne`);
      setConsigne(r.ok ? await r.text() : "");
    }
  }
  useEffect(() => {
    if (!cur || cur === "__grille") return;
    let off = false;
    setHtml("");
    fetch(`/api/agents/${cur}`)
      .then((r) => r.text())
      .then((t) => !off && setHtml(t))
      .catch(() => !off && setHtml('<p style="font:14px sans-serif;padding:20px">Page introuvable.</p>'));
    return () => {
      off = true;
    };
  }, [cur]);

  return (
    <div className="cat-army">
      <aside className="cat-army__side">
        <div className="cat-army__head">
          <h1>{espace?.titre ?? "Agents army"}</h1>
          <p className="cat-muted">{data ? `${data.agents.length} agents · ${data.source ?? "Whitelabeler"}` : "Chargement…"}</p>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un agent" aria-label="Chercher un agent" />
          <div className="cat-army__vues" role="group" aria-label="Affichage" hidden={Boolean(espace)}>
            <button type="button" className={vueListe === "taches" ? "is-on" : ""} onClick={() => setVueListe("taches")}>
              Par tâche
            </button>
            <button type="button" className={vueListe === "tous" ? "is-on" : ""} onClick={() => setVueListe("tous")}>
              Tous
            </button>
          </div>
        </div>
        {err && <p className="cat-flash is-error">⚠ {err}</p>}
        <nav className="cat-army__list" aria-label="Agents">
          {!espace && vueListe === "taches" && !q.trim() && taches ? (
            <ParTache taches={taches} agents={data?.agents ?? []} cur={cur} onPick={setCur} />
          ) : [
            espace && !q.trim() && (
              <button key="__grille" type="button" className={cur === "__grille" ? "is-on cat-army__grille" : "cat-army__grille"} onClick={() => choisir("__grille")}>
                ▦ Résultats en grille
              </button>
            ),
            ...list.map((a) => (
            <button key={a.slug} type="button" className={a.slug === cur ? "is-on" : ""} onClick={() => choisir(a.slug)} title={a.accroche}>
              {a.titre}
            </button>
          ))]}
          {data && !list.length && <p className="cat-muted">Aucun agent ne correspond.</p>}
        </nav>
      </aside>
      <section className="cat-army__main">
        {cur === "__grille" && data ? (
          <RechercheGrille agentsOmar={data.agents.filter((a) => a.omar)} agentsChat={data.agents.filter((a) => !a.omar && a.consigne)} onOuvrir={choisir} onDiscuter={discuter} />
        ) : agent?.omar ? (
          <OmarAgent a={agent.omar} />
        ) : agent ? (
          <>
            <header className="cat-army__bar">
              <div>
                <p className="cat-army__crumb">Agents army / {agent.titre}</p>
                <h2>{agent.titre}</h2>
              </div>
              <div className="cat-army__btns">
                {agent.consigne && (
                  <button type="button" className={vue === "chat" ? "cat-btn cat-btn--ghost" : "cat-btn"} onClick={() => setVue(vue === "chat" ? "presentation" : "chat")} title="Conversation avec l'agent, dans l'atelier">
                    {vue === "chat" ? "← Présentation" : "💬 Ouvrir une conversation"}
                  </button>
                )}
                {agent.consigne ? (
                  <button type="button" className={`cat-btn${vue === "consigne" ? "" : " cat-btn--ghost"}`} onClick={voirConsigne} title="La consigne (prompt) de l'agent">
                    {vue === "consigne" ? "← Présentation" : `Consigne (${Math.round(agent.consigne / 1000)} k car.)`}
                  </button>
                ) : (
                  <span className="cat-muted cat-army__nocons">Pas de consigne</span>
                )}
                <a className="cat-btn cat-btn--ghost" href={agent.url} target="_blank" rel="noopener noreferrer">
                  Access AI Employee ↗
                </a>
              </div>
            </header>
            {vue === "chat" ? (
              <AgentChat key={`${agent.slug}|${candidatChat?.id ?? ""}`} agent={agent} recherche={Boolean(espace)} candidat={candidatChat} onGrille={() => choisir("__grille")} />
            ) : vue === "consigne" ? (
              <div className="cat-army__cons">
                <div className="cat-army__consbar">
                  <span className="cat-muted">
                    {consOriginal ? "Original récupéré de Whitelabeler (avec la page de présentation autour)." : consNettoyable ? "Version propre : le texte de l'agent seul, celui envoyé à l'IA." : "Consigne de l'agent, à coller dans une IA (ChatGPT, Claude…) ou à brancher dans l'atelier."}
                    {consNettoyable && (
                      <>
                        {" "}
                        <button type="button" className="cat-link" onClick={() => chargerConsigne(!consOriginal)}>
                          {consOriginal ? "Voir la version propre" : "Voir l'original"}
                        </button>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    className="cat-btn"
                    disabled={!consigne}
                    onClick={() => navigator.clipboard?.writeText(consigne).then(() => (setCopie(true), setTimeout(() => setCopie(false), 1500)))}
                  >
                    {copie ? "Copiée ✓" : "Copier"}
                  </button>
                </div>
                <pre>{consigne == null ? "Chargement…" : consigne || "Consigne introuvable."}</pre>
              </div>
            ) : (
              // Cadre créé seulement quand sa page est arrivée (2026-11-22) : changer
              // srcdoc deux fois de suite (vide puis page) le laissait blanc dans Chrome.
              html ? (
                <iframe key={`${agent.slug}-${html.length}`} className="cat-army__page" title={agent.titre} srcDoc={html} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" ref={cadre} />
              ) : (
                <p className="cat-muted" style={{ padding: 20 }}>Chargement…</p>
              )
            )}
          </>
        ) : (
          <p className="cat-muted">Choisis un agent à gauche.</p>
        )}
      </section>
    </div>
  );
}

// ---- Lancer l'agent (2026-11-22) : conversation dans l'atelier ----
// L'IA choisie (ChatGPT ou Claude) suit la consigne de l'agent, avec les
// Fondations du projet choisi, les photos jointes et la recherche web.
function AgentChat({ agent, recherche = false, candidat = null, onGrille }) {
  const [projets, setProjets] = useState([]);
  const [projetChoisi, setProjet] = useState(() => localStorage.getItem("atl-agents-projet") ?? "");
  // Conversation sur un produit de la grille : pas de projet, la fiche du produit à la place.
  const projet = candidat ? candidat.projet ?? "" : projetChoisi;
  const [moteur, setMoteur] = useState(() => localStorage.getItem("atl-agents-moteur") ?? "chatgpt");
  const [moteurs, setMoteurs] = useState({ chatgpt: true, claude: false });
  const [web, setWeb] = useState(true);
  // WinningHunter dans le chat ChatGPT (2026-11-25), lecture seule, coûte des crédits WH.
  const [wh, setWh] = useState(() => localStorage.getItem("atl-agents-wh") !== "0");
  useEffect(() => localStorage.setItem("atl-agents-wh", wh ? "1" : "0"), [wh]);
  const [conv, setConv] = useState(null);
  const [texte, setTexte] = useState(candidat?.message ?? "");
  const [err, setErr] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [picker, setPicker] = useState(null);
  const [cle, setCle] = useState("");
  const bas = useRef(null);
  const qs = () => (candidat && !candidat.projet ? `candidat=${encodeURIComponent(candidat.id)}` : `projet=${encodeURIComponent(projet)}`);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((l) => setProjets(Array.isArray(l) ? l : []))
      .catch(() => {});
    fetch("/api/agents/moteurs")
      .then((r) => r.json())
      .then(setMoteurs)
      .catch(() => {});
  }, []);
  // Arrivée depuis une page (?page= ou page mémorisée) : son projet est choisi
  // d'office (2026-11-24), pour que l'agent lise les bonnes Fondations.
  useEffect(() => {
    let page = null;
    try {
      page = new URLSearchParams(location.search).get("page") ?? localStorage.getItem("atl-last-page");
    } catch {}
    if (!page) return;
    fetch(`/api/pages/${encodeURIComponent(page)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = d?.root?.props?.projet;
        if (p && !candidat) setProjet(p);
      })
      .catch(() => {});
  }, []);
  useEffect(() => localStorage.setItem("atl-agents-projet", projetChoisi), [projetChoisi]);
  useEffect(() => localStorage.setItem("atl-agents-moteur", moteur), [moteur]);
  // Audit F21 : une réponse arrivée après un changement d'agent ou de projet est ignorée.
  const selection = useRef("");
  selection.current = `${agent.slug}|${projet}`;
  async function charger() {
    const pour = `${agent.slug}|${projet}`;
    try {
      const c = await fetch(`/api/agents/${agent.slug}/chat?${qs()}`).then((r) => r.json());
      if (selection.current !== pour) return;
      setConv(c);
      return c;
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    setConv(null);
    setPhotos([]);
    charger();
  }, [agent.slug, projet]);
  const enCours = conv?.statut === "en cours";
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(charger, 3000);
    return () => clearInterval(t);
  }, [enCours, agent.slug, projet]);
  useEffect(() => {
    bas.current?.scrollIntoView({ block: "end" });
  }, [conv?.messages?.length, enCours]);

  async function envoyer(extra = {}) {
    setErr(null);
    try {
      const r = await fetch(`/api/agents/${agent.slug}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projet, candidat: candidat?.projet ? undefined : candidat?.id, message: texte, images: photos, web, wh, moteur, ...extra }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? `Erreur ${r.status}`);
      setConv(b);
      if (!extra.nouvelle) {
        setTexte("");
        setPhotos([]);
      }
    } catch (e) {
      setErr(e.message);
    }
  }
  async function ouvrirPhotos() {
    if (!projet) return setErr("Choisis d'abord un projet pour joindre ses images.");
    const l = await fetch(`/api/medias/projet-${projet}?detail=1`)
      .then((r) => r.json())
      .catch(() => []);
    setPicker((Array.isArray(l) ? l : []).filter((m) => m.kind !== "video" && /\.(png|jpe?g|webp)$/i.test(m.url)).map((m) => m.url));
  }
  async function enregistrerCle() {
    setErr(null);
    const r = await fetch("/api/agents/cle-claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cle }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(b.error ?? "Clé refusée.");
    setCle("");
    setMoteurs((m) => ({ ...m, claude: true }));
  }
  const msgs = conv?.messages ?? [];
  const sansCle = moteur === "claude" && !moteurs.claude;
  const peutEnvoyer = !enCours && !sansCle && (texte.trim() || photos.length);

  return (
    <div className="cat-chat">
      {candidat && (
        <div className="cat-chat__produit">
          <span>
            {candidat.projet ? (
              <>
                Conversation sur le produit <b>{candidat.nom}</b>, lancé dans le projet <b>{candidat.projet}</b> : l'agent lit tout le projet, et ce que tu ajoutes va dans ses notes de recherche.
              </>
            ) : (
              <>
                Conversation sur le produit <b>{candidat.nom}</b> : l'agent a reçu sa fiche (chiffres, sources, ce qui est déjà retenu).
              </>
            )}
          </span>
          <button type="button" className="cat-link" onClick={onGrille}>
            ← Retour à la grille
          </button>
        </div>
      )}
      <div className="cat-chat__opts">
{!candidat && (
        <label>
          Projet
          <select value={projet} onChange={(e) => setProjet(e.target.value)}>
            <option value="">Aucun (sans contexte)</option>
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>
        )}
        <span className="cat-chat__moteur" role="group" aria-label="IA">
          <button type="button" className={moteur === "chatgpt" ? "is-on" : ""} onClick={() => setMoteur("chatgpt")} title="ChatGPT (gpt-5.5)">
            ChatGPT
          </button>
          <button type="button" className={moteur === "claude" ? "is-on" : ""} onClick={() => setMoteur("claude")} title="Claude (Opus 5.5)">
            Claude
          </button>
        </span>
        <label className="cat-chat__check">
          <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} /> Recherche web
        </label>
        {moteurs.winninghunter && (
          <label className="cat-chat__check" title={moteur === "claude" ? "WinningHunter n'est branché qu'avec ChatGPT pour l'instant" : "L'agent peut lire WinningHunter (boutiques, pubs actives, TikTok, tendances). Lecture seule ; chaque appel coûte des crédits WinningHunter."}>
            <input type="checkbox" checked={wh && moteur !== "claude"} disabled={moteur === "claude"} onChange={(e) => setWh(e.target.checked)} /> WinningHunter
          </label>
        )}
        <button type="button" className="cat-link" disabled={enCours || !msgs.length} onClick={() => window.confirm("Effacer cette conversation et repartir de zéro ?") && envoyer({ nouvelle: true, message: "", images: [] })}>
          Nouvelle conversation
        </button>
      </div>
      {sansCle && (
        <div className="cat-chat__cle">
          <span>Pour utiliser Claude, colle ta clé Anthropic (console.anthropic.com, rubrique API Keys). Elle reste sur le serveur de l'atelier.</span>
          <input type="password" value={cle} onChange={(e) => setCle(e.target.value)} placeholder="sk-ant-…" autoComplete="off" />
          <button type="button" className="cat-btn" disabled={!cle.trim()} onClick={enregistrerCle}>
            Enregistrer
          </button>
        </div>
      )}
      <div className="cat-chat__fil">
        {!msgs.length && !enCours && (
          <div className="cat-chat__vide">
            <b>{agent.titre}</b>
            <p className="cat-muted">{agent.accroche}</p>
            <p className="cat-muted">Écris « Bonjour » pour lancer l'agent : il suivra sa consigne{projet ? " avec les Fondations du projet choisi" : ""}. Tu lui réponds ici.</p>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="cat-chat__moi">
              <div>{m.text}</div>
              {m.images?.length > 0 && (
                <div className="cat-chat__imgs">
                  {m.images.map((u) => (
                    <img key={u} src={u} alt="" />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div key={i} className="cat-chat__agent">
              <small className="cat-muted">
                {m.moteur === "claude" ? "Claude" : "ChatGPT"}
                {m.recherche ? " · a cherché sur le web" : ""}
                {m.winninghunter?.length ? ` · WinningHunter (${m.winninghunter.length} appel${m.winninghunter.length > 1 ? "s" : ""}${m.winninghunter.some((x) => x.erreur) ? `, ${m.winninghunter.filter((x) => x.erreur).length} en erreur` : ""})` : ""}
              </small>
              <Markdown text={m.text} />
              {projet && <Adopter projet={projet} texte={m.text} agent={agent.titre} />}
              {recherche && <RangerReponse texte={m.text} agent={agent.titre} candidat={candidat} />}
              {m.sources?.length > 0 && (
                <div className="cat-chat__sources">
                  Sources :{" "}
                  {m.sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.titre || s.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        {enCours && <p className="cat-chat__attente">L'agent réfléchit{web ? " (et cherche peut-être sur le web)" : ""}… compte une à deux minutes.</p>}
        {conv?.statut === "erreur" && <p className="cat-flash is-error">⚠ {conv.erreur}</p>}
        <div ref={bas} />
      </div>
      {err && <p className="cat-flash is-error">⚠ {err}</p>}
      {picker && (
        <div className="cat-chat__picker">
          {picker.length ? (
            picker.map((u) => (
              <button key={u} type="button" className={photos.includes(u) ? "is-on" : ""} onClick={() => setPhotos((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u].slice(0, 6)))}>
                <img src={u} alt="" />
              </button>
            ))
          ) : (
            <p className="cat-muted">Aucune image dans ce projet.</p>
          )}
          <button type="button" className="cat-link" onClick={() => setPicker(null)}>
            Fermer
          </button>
        </div>
      )}
      <div className="cat-chat__saisie">
        <textarea
          rows={3}
          aria-label="Message à l'agent"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && peutEnvoyer && envoyer()}
          placeholder={msgs.length ? "Ta réponse… (Ctrl + Entrée pour envoyer)" : "Bonjour, je veux… (Ctrl + Entrée pour envoyer)"}
        />
        <div className="cat-chat__actions">
          <button type="button" className="cat-btn cat-btn--ghost" onClick={ouvrirPhotos} title="Joindre des images du projet">
            🖼 {photos.length ? `${photos.length} image(s)` : "Images"}
          </button>
          <button type="button" className="cat-btn" disabled={!peutEnvoyer} onClick={() => envoyer()}>
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

function ParTache({ taches, agents, cur, onPick }) {
  const bySlug = Object.fromEntries(agents.map((a) => [a.slug, a]));
  const ligne = (e, star) => {
    const a = bySlug[e.slug];
    if (!a) return null;
    return (
      <button key={e.slug} type="button" className={e.slug === cur ? "is-on" : ""} onClick={() => onPick(e.slug)} title={a.accroche}>
        {star && <span className="cat-army__star">★</span>}
        {a.titre.replace(/^(Whitelabeler|ShopFunnels|Shopfunnels)\s+/, "")}
        {e.branche && <small className="cat-army__branche">branché : {e.branche}</small>}
      </button>
    );
  };
  return taches.map((t) => (
    <div key={t.id} className="cat-army__tache">
      <p className="cat-army__tacheTitre">
        {t.titre}
        {t.etape !== "—" && <small> · {t.etape}</small>}
      </p>
      {t.recommandes.map((e) => ligne(e, true))}
      {t.autres.length > 0 && (
        <details>
          <summary>Autres ({t.autres.length})</summary>
          {t.autres.map((e) => ligne(e, false))}
        </details>
      )}
      {t.reserve.length > 0 && (
        <details>
          <summary>Réserve, anciennes versions ({t.reserve.length})</summary>
          {t.reserve.map((e) => ligne(e, false))}
        </details>
      )}
    </div>
  ));
}

// « Adopter dans le projet » (lot 5) : un résultat d'agent entre dans le
// projet comme proposition (note de recherche ou angle proposé), jamais comme fait.
function Adopter({ projet, texte, agent }) {
  const [etat, setEtat] = useState(null);
  // Audit F12 (2026-11-25) : un angle est relu (titre, promesse) avant d'entrer dans le projet.
  const [angle, setAngle] = useState(null);
  function proposerAngle() {
    const l = String(texte ?? "").replace(/[#*_>`]/g, "").split("\n").map((x) => x.trim()).filter(Boolean);
    setAngle({ titre: (l[0] ?? "").slice(0, 90), promesse: (l[1] ?? "").slice(0, 300) });
  }
  async function go(cible, extra = {}) {
    setEtat("…");
    const r = await fetch("/api/agents/adopter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projet, cible, texte, agent, ...extra }) });
    const b = await r.json().catch(() => ({}));
    setEtat(r.ok ? (cible === "angle" ? "✓ Ajouté aux angles proposés (étape Angles, non choisi)" : "✓ Ajouté aux notes de recherche (étape Recherche client)") : `⚠ ${b.error ?? "Échec"}`);
  }
  if (angle && !etat)
    return (
      <div className="cat-chat__adopter cat-chat__adopter--angle">
        <span className="cat-muted">Angle à ajouter (relis et corrige avant) :</span>
        <input value={angle.titre} maxLength={90} placeholder="Titre de l'angle" onChange={(e) => setAngle({ ...angle, titre: e.target.value })} />
        <textarea rows={2} value={angle.promesse} maxLength={300} placeholder="Promesse" onChange={(e) => setAngle({ ...angle, promesse: e.target.value })} />
        <span>
          <button type="button" className="cat-btn" disabled={!angle.titre.trim()} onClick={() => go("angle", angle)}>Ajouter aux angles proposés</button>{" "}
          <button type="button" className="cat-link" onClick={() => setAngle(null)}>Annuler</button>
        </span>
      </div>
    );
  return (
    <div className="cat-chat__adopter">
      {etat ? (
        <span className="cat-muted">{etat}</span>
      ) : (
        <>
          <span className="cat-muted">Adopter dans le projet :</span>
          <button type="button" className="cat-link" onClick={() => go("recherche")} title="Gardé comme piste de recherche : inspire, ne prouve rien">
            note de recherche
          </button>
          <button type="button" className="cat-link" onClick={proposerAngle} title="Ajouté aux angles du projet, à choisir ou non (tu relis le titre et la promesse avant)">
            angle proposé
          </button>
        </>
      )}
    </div>
  );
}

// Agent Omar_winninghunter (espace Recherche produits, 2026-11-23) : fiche
// du guide WinningHunter qu'il suit, réglages, lancement et résultats.
const RADAR_CATEGORIES = [["default", "Toutes"], ["beauty", "Beauté"], ["skincare", "Soins de la peau"], ["fashion", "Mode"], ["fitness", "Sport"], ["health", "Santé"], ["home", "Maison"], ["pets", "Animaux"], ["baby", "Bébé"], ["technology", "Tech"], ["food", "Alimentation"]];
const PAYS_OPT = [["ALL", "Tous (les 7 pays)"], ["US", "États-Unis"], ["CA", "Canada"], ["AU", "Australie"], ["GB", "Royaume-Uni"], ["FR", "France"], ["DE", "Allemagne"], ["IT", "Italie"]];
const REGLAGES = {
  "omar-winninghunter-radar-tendances": [
    { cle: "categorie", label: "Catégorie", options: RADAR_CATEGORIES, defaut: "default" },
    { cle: "periode", label: "Période", options: [["12", "12 mois"], ["6", "6 mois"]], defaut: "12" },
    { cle: "pays", label: "Concurrents vérifiés en", options: PAYS_OPT, defaut: "ALL" },
  ],
  "omar-winninghunter-chasseur-facebook": [
    { cle: "niche", label: "Niche", options: [["", "Toutes"], ["BY", "Beauté"], ["SK", "Soins"], ["CG", "Mode"], ["HT", "Santé"], ["HE", "Maison"], ["PS", "Animaux"], ["GG", "Gadgets"], ["FT", "Sport"], ["KS", "Enfants"], ["JY", "Bijoux"]], defaut: "" },
    { cle: "pays", label: "Pubs diffusées en", options: PAYS_OPT, defaut: "ALL" },
  ],
  "omar-winninghunter-chasseur-tiktok": [
    { cle: "pays", label: "Pays", options: PAYS_OPT, defaut: "ALL" },
    { cle: "niche", label: "Niche", options: [["", "Toutes"], ["beauty", "Beauté"], ["home", "Maison"], ["pet", "Animaux"], ["gadgets", "Gadgets"], ["clothing", "Mode"], ["jewelry", "Bijoux"], ["toys", "Jouets"], ["child", "Enfants"], ["outdoor", "Plein air"]], defaut: "" },
    { cle: "signal", label: "Filtre d'engagement (un seul)", options: [["likes", "200+ likes"], ["shares", "30+ partages"], ["comments", "50+ commentaires"]], defaut: "likes" },
  ],
  "omar-winninghunter-boucle-magic-ai": [
    { cle: "depart", label: "Point de départ : produit précis ou domaine de boutique", texte: true, defaut: "", large: true },
    { cle: "pays", label: "Concurrents vérifiés en", options: PAYS_OPT, defaut: "ALL" },
  ],
  "omar-winninghunter-veille-boutiques": [
    { cle: "boutiques", label: "Boutiques suivies (domaines, un par ligne ; vide = la liste gardée)", zone: true, defaut: "", large: true },
    { cle: "pays", label: "Visiteurs de", options: PAYS_OPT, defaut: "ALL" },
    { cle: "categorie", label: "Découvrir des boutiques qui montent", options: [["", "Non"], ["Beauty", "Beauté"], ["Health", "Santé"], ["Clothing", "Mode"], ["Accessories", "Accessoires"], ["Pet Supplies", "Animaux"], ["Electronics", "Électronique"], ["Toys & Games", "Jouets"], ["Other", "Autre"]], defaut: "" },
  ],
};
const libelleReglages = (slug, r) =>
  (REGLAGES[slug] ?? [])
    .filter((f) => !f.zone)
    .map((f) => (f.options ? (f.options.find(([v]) => v === r?.[f.cle]) ?? [, r?.[f.cle]])[1] : r?.[f.cle]))
    .filter(Boolean)
    .join(" · ");
const VERDICT_CLASSE = { "feu vert": "is-go", "à surveiller": "is-cond", "écarté": "is-no" };

function OmarAgent({ a }) {
  const pret = a.statut !== "à construire";
  const pg = a.page ?? {};
  const [etat, setEtat] = useState(null);
  const [vu, setVu] = useState(null);
  const champs = REGLAGES[a.slug] ?? [];
  const [regl, setRegl] = useState({});
  useEffect(() => setRegl(Object.fromEntries(champs.map((f) => [f.cle, f.defaut]))), [a.slug]);
  const [err, setErr] = useState("");
  const tournait = useRef(false);
  // Audit F21 (2026-11-25) : une réponse qui ne correspond plus à l'agent ou au
  // résultat demandé (réponse lente) ne remplace pas l'écran.
  const actif = useRef(a.slug);
  actif.current = a.slug;
  const demande = useRef(0);
  const charger = () => {
    const pour = a.slug;
    return fetch(`/api/recherche/${a.slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (actif.current !== pour) return;
        setEtat(d);
        if (d.statut === "en cours") tournait.current = true;
        else {
          if (tournait.current) setVu(d.dernier);
          else setVu((v) => v ?? d.dernier);
          tournait.current = false;
        }
      })
      .catch(() => {});
  };
  useEffect(() => {
    setEtat(null);
    setVu(null);
    if (pret) charger();
  }, [a.slug]);
  useEffect(() => {
    if (etat?.statut !== "en cours") return;
    const t = setInterval(charger, 4000);
    return () => clearInterval(t);
  }, [etat?.statut]);
  const lancer = async () => {
    setErr("");
    const r = await fetch(`/api/recherche/${a.slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(regl) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(d.error ?? "Lancement refusé.");
    tournait.current = true;
    setEtat((e) => ({ ...e, statut: "en cours", etape: "Démarrage…" }));
  };
  const ouvrir = (f) => {
    if (!f) return;
    const n = ++demande.current;
    const pour = a.slug;
    fetch(`/api/recherche/${a.slug}/${f}`)
      .then((r) => r.json())
      .then((d) => n === demande.current && actif.current === pour && setVu(d))
      .catch(() => {});
  };
  const fichierVu = vu ? etat?.historique?.find((h) => h.le === vu.le)?.fichier : null;
  const reprendre = () =>
    setRegl((cur) =>
      Object.fromEntries(
        champs.map((f) => {
          if (f.zone) return [f.cle, cur[f.cle] ?? f.defaut];
          const v = vu?.reglages?.[f.cle];
          if (v == null) return [f.cle, f.defaut];
          return [f.cle, f.options && !f.options.some(([o]) => o === String(v)) ? f.defaut : String(v)];
        }),
      ),
    );
  const tourne = etat?.statut === "en cours";
  const nom = a.titre.replace(/^Omar_winninghunter_/i, "");
  const cartes = [["Quand l'utiliser", pg.quand], ["Ce que tu obtiens", pg.obtiens], ["Ce qu'il utilise", pg.utilise]].filter(([, l]) => l?.length);
  return (
    <div className="cat-omar">
      <header className="cat-army__bar">
        <div>
          <p className="cat-army__crumb">Recherche produits / {a.titre}</p>
          <h2>{a.titre}</h2>
        </div>
        <div className="cat-army__btns">
          <button type="button" className="cat-btn" disabled={!pret || tourne} onClick={lancer} title={pret ? "Démarre tout de suite une recherche payante : crédits WinningHunter + IA, résultat en quelques minutes" : "Cet agent est en construction"}>
            {!pret ? "En construction" : tourne ? "Recherche en cours…" : "▶ Lancer une recherche (crédits)"}
          </button>
        </div>
      </header>
      <div className="om">
        <section className="om-hero">
          <span className="om-tag">■ Omar_winninghunter · {nom}</span>
          <h1>
            {pg.accroche ?? a.but} {pg.accent && <em>{pg.accent}</em>}
            <span className="om-point">.</span>
          </h1>
          <p className="om-intro">{pg.intro ?? a.but}</p>
          {!pret && <p className="om-wip">Cet agent est en construction : sa page montre déjà ce qu'il fera.</p>}
        </section>

        {cartes.length > 0 && (
          <section className="om-wrap">
            <h2 className="om-h2">Ce qu'il fait</h2>
            <div className="om-cartes">
              {cartes.map(([t, l]) => (
                <div key={t} className="om-carte">
                  <p className="om-label">{t}</p>
                  <ul>
                    {l.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {pret && champs.length > 0 && (
          <section className="om-wrap">
            <p className="om-label om-regl__titre">Prochain lancement : réglages</p>
            <div className="om-regl">
              {champs.map((f) => (
                <label key={f.cle} className={f.large ? "om-regl__large" : ""}>
                  <span className="om-label">{f.label}</span>
                  {f.options ? (
                    <select value={regl[f.cle] ?? f.defaut} onChange={(e) => setRegl({ ...regl, [f.cle]: e.target.value })}>
                      {f.options.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  ) : f.zone ? (
                    <textarea rows={3} value={regl[f.cle] ?? ""} placeholder={(etat?.suivies ?? []).join("\n") || "exemple.com"} onChange={(e) => setRegl({ ...regl, [f.cle]: e.target.value })} />
                  ) : (
                    <input value={regl[f.cle] ?? ""} placeholder="le domaine d une boutique marche le mieux (ex. : smooche.com), ou un produit précis" onChange={(e) => setRegl({ ...regl, [f.cle]: e.target.value })} />
                  )}
                </label>
              ))}
              {etat?.historique?.length > 0 && (
                <label className="om-regl__hist">
                  <span className="om-label">Lancements passés</span>
                  <select value={vu?.le ?? ""} onChange={(e) => ouvrir(etat.historique.find((h) => h.le === e.target.value)?.fichier)}>
                    {etat.historique.map((h) => (
                      <option key={h.fichier} value={h.le}>
                        {new Date(h.le).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" })} · {libelleReglages(a.slug, h.reglages)} · {h.nb} piste(s)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className="om-go" disabled={tourne} onClick={lancer} title="Démarre tout de suite une recherche payante (crédits WinningHunter + IA)">
                {tourne ? "Recherche en cours…" : "▶ Lancer une recherche"}
              </button>
            </div>
            {err && <p className="om-msg is-err" role="alert">{err}</p>}
            {tourne && <p className="om-msg" role="status">⏳ {etat.etape ?? "En cours…"}</p>}
            {etat?.statut === "erreur" && !tourne && <p className="om-msg is-err">Le dernier lancement a échoué : {etat.erreur}</p>}
          </section>
        )}

        {vu && (
          <section className="om-wrap om-vu">
            <p>
              <b>Résultat affiché :</b> lancement du {new Date(vu.le).toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" })} · réglages de ce lancement : {libelleReglages(a.slug, vu.reglages) || "par défaut"}
              {champs.some((f) => !f.zone) && (
                <button type="button" className="cat-link" onClick={reprendre} title="Remet ces réglages dans le formulaire du prochain lancement">
                  Reprendre ces réglages
                </button>
              )}
            </p>
          </section>
        )}
        {vu && (vu.lignes ? <AgentResultat r={vu} consigne={a.consigneMd} slug={a.slug} fichier={fichierVu} /> : <RadarResultat r={vu} consigne={a.consigneMd} slug={a.slug} fichier={fichierVu} />)}

        {pg.comment?.length > 0 && (
          <section className="om-wrap">
            <h2 className="om-h2">Comment il travaille</h2>
            <div className="om-comment">
              {pg.comment.map(([t, x]) => (
                <div key={t}>
                  <h3>{t}</h3>
                  <p>{x}</p>
                </div>
              ))}
            </div>
          </section>
        )}
        {!vu && (
          <section className="om-wrap om-regles">
            <h2 className="om-h2">Les règles du guide</h2>
            <Markdown text={String(a.consigneMd ?? "").replace(/^# .*\n/, "")} />
          </section>
        )}
        <p className="om-pied">Omar_winninghunter • {a.guide} • données WinningHunter, lecture seule</p>
      </div>
    </div>
  );
}

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-CA"));

// Audit F10 (2026-11-25) : libellés honnêtes. « exponentielle » = calcul maison sur 3 périodes.
const COURBE_LIBELLE = { exponentielle: "accélère (3 périodes)", "en hausse": "en hausse", "en baisse": "en baisse", plate: "plate", inconnue: "inconnue" };

function RadarResultat({ r, consigne, slug, fichier }) {
  const [onglet, setOnglet] = useState("tableau");
  const c = r.chiffres ?? {};
  const pistes = r.pistes ?? [];
  const maxV = Math.max(1, ...pistes.map((p) => p.volume ?? 0));
  const maxC = Math.max(1, ...pistes.map((p) => p.croissance ?? 0));
  const cat = (RADAR_CATEGORIES.find(([v]) => v === r.reglages?.categorie) ?? [, r.reglages?.categorie])[1];
  const ONGLETS = [["tableau", "Pistes", "#d4a017"], ["detail", "En détail", "#12233f"], ["autres", "Autres produits", "#12233f"], ["regles", "Règles du guide", "#1f8a4c"]];
  return (
    <section className="om-wrap">
      <div className="om-board">
        <div className="om-board__head">
          <h3>Radar : {cat} | {new Date(r.le).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}</h3>
          <p>
            {c.lues} tendances lues · {c.passent} passent le guide · {c.produits} vrais produits · {c.verifiees} vérifiées en {r.reglages?.pays} · période {r.reglages?.periode} mois
          </p>
        </div>
        {onglet === "tableau" && (
          <>
            <table className="om-table">
              <thead>
                <tr>
                  <th>Piste</th>
                  <th>Recherches / mois</th>
                  <th>Croissance</th>
                  <th title="Calcul maison : moyennes de trois périodes comparées">Courbe</th>
                  <th title="Marques distinctes vues dans UNE recherche de pubs WinningHunter (mot-clé, pays, tri par dépense) : un échantillon, pas un recensement">Annonceurs vus</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {pistes.map((p) => (
                  <tr key={p.sujet}>
                    <td className="om-table__nom">
                      <Vignettes urls={p.images} />
                      {p.sujet}
                      {p.assoupli && <span className="om-mini">seuil assoupli</span>}
                    </td>
                    <td>
                      <span className="om-barre"><i style={{ width: `${Math.round(((p.volume ?? 0) / maxV) * 100)}%` }} /></span>
                      <span className="om-num">{fmt(p.volume)}</span>
                    </td>
                    <td>
                      <span className="om-barre is-bleu"><i style={{ width: `${Math.round(((p.croissance ?? 0) / maxC) * 100)}%` }} /></span>
                      <span className="om-num">+{fmt(p.croissance)} %</span>
                    </td>
                    <td><span className="om-chip">{COURBE_LIBELLE[p.courbe] ?? p.courbe ?? "—"}</span></td>
                    <td className="om-num" title={(p.concurrents?.noms ?? []).join(", ")}>{p.concurrents?.nombre ?? "?"}</td>
                    <td><span className={`om-statut ${VERDICT_CLASSE[p.verdict] ?? ""}`}>{p.verdict === "feu vert" ? "✓ " : p.verdict === "à surveiller" ? "! " : "✕ "}{p.verdict}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="om-board__note">{r.resume}</p>
            {r.assoupli && <p className="om-board__note">Catégorie étroite : seuils assouplis à {fmt(r.assoupli.volume)} recherches et +{r.assoupli.croissance} % pour les pistes marquées.</p>}
            <p className="om-board__note om-portee">
              <b>D'où viennent les chiffres :</b> recherches et croissance = mesures Exploding Topics (WinningHunter) · courbe = calcul maison sur trois périodes · annonceurs vus = marques distinctes dans un échantillon d'une recherche de pubs ({r.reglages?.pays}), pas tout le marché : 0 ne veut pas dire aucun concurrent · verdict = interprétation de l'IA : un feu vert reste une hypothèse à tester.
            </p>
            {r.rejetees?.length > 0 && <p className="om-board__note">Contrôle : {r.rejetees.length} piste(s) de l'IA refusée(s), absentes des tendances observées ({r.rejetees.join(", ")}).</p>}
          </>
        )}
        {onglet === "detail" && (
          <div className="om-board__corps">
            {pistes.map((p) => (
              <article key={p.sujet} className="om-piste">
                <header>
                  <strong>{p.sujet}</strong>
                  <span className={`om-statut ${VERDICT_CLASSE[p.verdict] ?? ""}`}>{p.verdict}</span>
                </header>
                <p className="om-mesures">
                  <b>Mesures :</b> {p.volume != null ? `${fmt(p.volume)} recherches/mois` : "recherches : non relevées"} · {p.croissance != null ? `+${fmt(p.croissance)} % sur ${r.reglages?.periode ?? "?"} mois` : "croissance : non relevée"} · courbe {COURBE_LIBELLE[p.courbe] ?? p.courbe ?? "inconnue"} · {p.concurrents?.nombre != null ? `${p.concurrents.nombre} annonceur(s) vu(s) dans l'échantillon` : "annonceurs : non relevés"}
                  {p.libelleIA && <span className="om-mini">nommée « {p.libelleIA} » par l'IA</span>}
                </p>
                <p>{p.pourquoi}</p>
                {p.produitConcret && <p><b>Produit :</b> {p.produitConcret}</p>}
                {p.angle && <p><b>Angle :</b> {p.angle}</p>}
                {p.sousTendances?.length > 0 && <p><b>Sous-tendances :</b> {p.sousTendances.join(", ")}</p>}
                {p.concurrents?.noms?.length > 0 && <p><b>Annonceurs vus :</b> {p.concurrents.noms.join(", ")}</p>}
                {p.risques?.length > 0 && <p><b>Risques :</b> {p.risques.join(" · ")}</p>}
                {p.prochaineEtape && <p><b>Ensuite :</b> {p.prochaineEtape}</p>}
                <EnvoyerPiste slug={slug} fichier={fichier} id={p.id ?? p.sujet} />
              </article>
            ))}
          </div>
        )}
        {onglet === "autres" && (
          <div className="om-board__corps">
            {r.autresProduits?.length ? (
              <table className="om-table">
                <thead>
                  <tr><th>Produit</th><th>Recherches / mois</th><th>Croissance</th><th>Courbe</th></tr>
                </thead>
                <tbody>
                  {r.autresProduits.map((t) => (
                    <tr key={t.sujet}><td className="om-table__nom">{t.sujet}</td><td className="om-num">{fmt(t.volume)}</td><td className="om-num">+{fmt(t.croissance)} %</td><td><span className="om-chip">{COURBE_LIBELLE[t.courbe] ?? t.courbe}</span></td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Aucun autre produit ne passait les filtres.</p>
            )}
            <p className="om-board__note">Non vérifiés côté concurrents, pour garder les crédits.</p>
          </div>
        )}
        {onglet === "regles" && (
          <div className="om-board__corps om-regles">
            <Markdown text={String(consigne ?? "").replace(/^# .*\n/, "")} />
          </div>
        )}
        <nav className="om-onglets">
          {ONGLETS.map(([k, l, col]) => (
            <button key={k} type="button" className={onglet === k ? "is-on" : ""} onClick={() => setOnglet(k)}>
              <i style={{ background: col }} />
              {l}
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}

// Résultat commun des agents 2 à 5 : tableau bleu nuit + onglets (2026-11-23)
function AgentResultat({ r, consigne, slug, fichier }) {
  const [onglet, setOnglet] = useState("tableau");
  const lignes = r.lignes ?? [];
  const maxi = Object.fromEntries((r.colonnes ?? []).filter((c) => c.type === "barre").map((c) => [c.cle, Math.max(1, ...lignes.map((l) => Number(l[c.cle]) || 0))]));
  const cellule = (c, l) => {
    const v = l[c.cle];
    if (c.type === "images") return <Vignettes urls={v} />;
    if (c.type === "verdict") return <span className={`om-statut ${VERDICT_CLASSE[v] ?? ""}`}>{v === "feu vert" ? "✓ " : v === "écarté" ? "✕ " : "! "}{v}</span>;
    if (c.type === "barre")
      return (
        <>
          <span className="om-barre"><i style={{ width: `${Math.round(((Number(v) || 0) / maxi[c.cle]) * 100)}%` }} /></span>
          <span className="om-num">{v == null ? "—" : `${fmt(v)}${c.suffixe ?? ""}`}</span>
        </>
      );
    if (c.type === "num") return <span className="om-num">{v == null ? "—" : `${fmt(v)}${c.suffixe ?? ""}`}</span>;
    if (c.type === "chip") return v && v !== "—" ? <span className="om-chip">{v}</span> : "—";
    if (c.type === "lien") return v ? <a className="om-lien" href={`https://${v}`} target="_blank" rel="noreferrer">{v}</a> : "—";
    return v ?? "—";
  };
  const ONGLETS = [["tableau", "Résultats", "#d4a017"], ["detail", "Pistes en détail", "#12233f"], ...(r.autres?.length ? [["autres", "Autres", "#12233f"]] : []), ["regles", "Règles du guide", "#1f8a4c"]];
  return (
    <section className="om-wrap">
      <div className="om-board">
        <div className="om-board__head">
          <h3>{r.titre} | {new Date(r.le).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}</h3>
          <p>{r.sousTitre}</p>
        </div>
        {onglet === "tableau" && (
          <>
            {lignes.length ? (
              <table className="om-table">
                <thead>
                  <tr>{r.colonnes.map((c) => <th key={c.cle}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.id}>
                      {r.colonnes.map((c) => (
                        <td key={c.cle} className={c.type === "nom" ? "om-table__nom" : ""} title={c.type === "nom" ? l.texte ?? "" : undefined}>
                          {cellule(c, l)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="om-board__note">Rien à afficher pour ces réglages.</p>
            )}
            <p className="om-board__note">{r.resume}</p>
            {(r.notes ?? []).map((n) => <p key={n} className="om-board__note">{n}</p>)}
            <p className="om-board__note om-portee">
              <b>D'où viennent les chiffres :</b> relevés WinningHunter dans l'échantillon de cette recherche (réglages et période ci-dessus), pas tout le marché · verdicts = interprétation de l'IA : un feu vert reste une hypothèse à tester.
            </p>
            {r.rejetees?.length > 0 && <p className="om-board__note">Contrôle : {r.rejetees.length} piste(s) de l'IA refusée(s), absentes des lignes observées ({r.rejetees.join(", ")}).</p>}
          </>
        )}
        {onglet === "detail" && (
          <div className="om-board__corps">
            {(r.pistes ?? []).length ? (r.pistes ?? []).map((p) => {
              const l = lignes.find((x) => String(x.id) === String(p.id));
              const mesures = l ? (r.colonnes ?? []).filter((c) => ["num", "barre", "chip"].includes(c.type) && l[c.cle] != null && l[c.cle] !== "" && l[c.cle] !== "—") : [];
              return (
              <article key={p.id ?? p.sujet} className="om-piste">
                <header>
                  <strong>{p.sujet}</strong>
                  <span className={`om-statut ${VERDICT_CLASSE[p.verdict] ?? ""}`}>{p.verdict}</span>
                </header>
                {mesures.length > 0 && (
                  <p className="om-mesures">
                    <b>Mesures (ligne {p.id}) :</b> {mesures.map((c) => `${c.label} ${typeof l[c.cle] === "number" ? fmt(l[c.cle]) : l[c.cle]}${c.suffixe ?? ""}`).join(" · ")}
                  </p>
                )}
                <p>{p.pourquoi}</p>
                {p.produitConcret && <p><b>Produit :</b> {p.produitConcret}</p>}
                {p.angle && <p><b>Angle :</b> {p.angle}</p>}
                {p.risques?.length > 0 && <p><b>Risques :</b> {p.risques.join(" · ")}</p>}
                {p.prochaineEtape && <p><b>Ensuite :</b> {p.prochaineEtape}</p>}
                <EnvoyerPiste slug={slug} fichier={fichier} id={p.id ?? p.sujet} />
              </article>
              );
            }) : <p>Aucune piste retenue.</p>}
          </div>
        )}
        {onglet === "autres" && (
          <div className="om-board__corps">
            <table className="om-table">
              <tbody>
                {r.autres.map((t) => (
                  <tr key={t.sujet}><td className="om-table__nom"><a className="om-lien" href={`https://${t.sujet}`} target="_blank" rel="noreferrer">{t.sujet}</a></td><td>{t.detail}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {onglet === "regles" && (
          <div className="om-board__corps om-regles">
            <Markdown text={String(consigne ?? "").replace(/^# .*\n/, "")} />
          </div>
        )}
        <nav className="om-onglets">
          {ONGLETS.map(([k, l, col]) => (
            <button key={k} type="button" className={onglet === k ? "is-on" : ""} onClick={() => setOnglet(k)}>
              <i style={{ background: col }} />
              {l}
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}

// Audit F11 (2026-11-25) : « Envoyer dans un projet » : la piste entre dans
// un projet existant ou nouveau comme note de recherche, avec son origine
// (agent, date, réglages, mesures, limites). Jamais comme preuve.
function EnvoyerPiste({ slug, fichier, id }) {
  const [ouvert, setOuvert] = useState(false);
  const [projets, setProjets] = useState(null);
  const [choix, setChoix] = useState(() => localStorage.getItem("atl-agents-projet") ?? "");
  const [nom, setNom] = useState("");
  const [etat, setEtat] = useState(null);
  useEffect(() => {
    if (!ouvert || projets) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((l) => setProjets(Array.isArray(l) ? l : l.projects ?? []))
      .catch(() => setProjets([]));
  }, [ouvert]);
  if (!slug || !fichier) return null;
  async function envoyer() {
    const nouveau = choix === "__nouveau";
    if (nouveau ? !nom.trim() : !choix) return setEtat({ err: nouveau ? "Donne un nom au nouveau projet." : "Choisis un projet." });
    setEtat({ msg: "…" });
    const r = await fetch(`/api/recherche/${slug}/adopter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fichier, id, ...(nouveau ? { nouveau: nom } : { projet: choix }) }) }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) ?? {};
    if (!r?.ok) return setEtat({ err: b.error ?? "Échec de l'envoi." });
    localStorage.setItem("atl-agents-projet", b.projet);
    setEtat({ ok: b.projet });
  }
  if (etat?.ok)
    return (
      <p className="om-envoi">
        ✓ Ajoutée aux notes de recherche du projet <b>{etat.ok}</b> (Projets → ce projet → étape Recherche client), avec son origine. Hypothèse, pas une preuve.
      </p>
    );
  if (!ouvert)
    return (
      <p className="om-envoi">
        <button type="button" className="cat-link" onClick={() => setOuvert(true)} title="La piste entre dans un projet comme note de recherche, avec ses chiffres et leur origine">
          → Envoyer cette piste dans un projet
        </button>
      </p>
    );
  return (
    <div className="om-envoi om-envoi--form">
      <select value={choix} onChange={(e) => setChoix(e.target.value)}>
        <option value="">Choisis un projet…</option>
        {(projets ?? []).map((p) => (
          <option key={p.id} value={p.id}>{p.nom ?? p.id}</option>
        ))}
        <option value="__nouveau">+ Nouveau projet</option>
      </select>
      {choix === "__nouveau" && <input value={nom} placeholder="Nom du nouveau projet" onChange={(e) => setNom(e.target.value)} />}
      <button type="button" className="cat-btn" onClick={envoyer}>Envoyer</button>
      <button type="button" className="cat-link" onClick={() => setOuvert(false)}>Annuler</button>
      {etat?.err && <span className="om-msg is-err">{etat.err}</span>}
      {etat?.msg && <span className="cat-muted">{etat.msg}</span>}
    </div>
  );
}

// Une ou deux images du produit dans la ligne (pubs WinningHunter). Les images
// cassées (lien expiré) disparaissent au lieu d'afficher une icône vide.
function Vignettes({ urls }) {
  const l = (urls ?? []).slice(0, 2);
  if (!l.length) return <span className="om-vign om-vign--vide" />;
  return (
    <span className="om-vigns">
      {l.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer">
          <img className="om-vign" src={u} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.parentElement.style.display = "none")} />
        </a>
      ))}
    </span>
  );
}
