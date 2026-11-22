// Agents army (2026-11-22) : les agents de l'abonnement Whitelabeler de
// l'utilisateur (Ai Vault 3.0), pour son usage personnel. Liste à gauche,
// page de présentation à droite (sa page d'origine, telle quelle), comme sur
// Whitelabeler. « Access AI Employee » ouvre l'agent sur Whitelabeler.
// Ensuite : choisir lesquels brancher dans chaque partie de l'atelier.
import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "../mirror-pub-ui.jsx";

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

export function AgentsArmy() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(() => new URLSearchParams(location.search).get("agent") || null);
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setCur((c) => c ?? d.agents?.[0]?.slug ?? null);
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
  useRelanceCadre(cadre, html && vue === "presentation" ? cur + html.length : null);
  const [consigne, setConsigne] = useState(null);
  const [copie, setCopie] = useState(false);
  useEffect(() => {
    setVue("presentation");
    setConsigne(null);
  }, [cur]);
  async function voirConsigne() {
    if (vue === "consigne") return setVue("presentation");
    setVue("consigne");
    if (consigne == null) {
      const r = await fetch(`/api/agents/${cur}/consigne`);
      setConsigne(r.ok ? await r.text() : "");
    }
  }
  useEffect(() => {
    if (!cur) return;
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
          <h1>Agents army</h1>
          <p className="cat-muted">{data ? `${data.agents.length} agents · ${data.source ?? "Whitelabeler"}` : "Chargement…"}</p>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un agent" aria-label="Chercher un agent" />
        </div>
        {err && <p className="cat-flash is-error">⚠ {err}</p>}
        <nav className="cat-army__list" aria-label="Agents">
          {list.map((a) => (
            <button key={a.slug} type="button" className={a.slug === cur ? "is-on" : ""} onClick={() => setCur(a.slug)} title={a.accroche}>
              {a.titre}
            </button>
          ))}
          {data && !list.length && <p className="cat-muted">Aucun agent ne correspond.</p>}
        </nav>
      </aside>
      <section className="cat-army__main">
        {agent ? (
          <>
            <header className="cat-army__bar">
              <div>
                <p className="cat-army__crumb">Agents army / {agent.titre}</p>
                <h2>{agent.titre}</h2>
              </div>
              <div className="cat-army__btns">
                {agent.consigne && (
                  <button type="button" className={vue === "chat" ? "cat-btn cat-btn--ghost" : "cat-btn"} onClick={() => setVue(vue === "chat" ? "presentation" : "chat")} title="Conversation avec l'agent, dans l'atelier">
                    {vue === "chat" ? "← Présentation" : "▶ Lancer l'agent"}
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
              <AgentChat key={agent.slug} agent={agent} />
            ) : vue === "consigne" ? (
              <div className="cat-army__cons">
                <div className="cat-army__consbar">
                  <span className="cat-muted">Consigne de l'agent, à coller dans une IA (ChatGPT, Claude…) ou à brancher dans l'atelier.</span>
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
function AgentChat({ agent }) {
  const [projets, setProjets] = useState([]);
  const [projet, setProjet] = useState(() => localStorage.getItem("atl-agents-projet") ?? "");
  const [moteur, setMoteur] = useState(() => localStorage.getItem("atl-agents-moteur") ?? "chatgpt");
  const [moteurs, setMoteurs] = useState({ chatgpt: true, claude: false });
  const [web, setWeb] = useState(true);
  const [conv, setConv] = useState(null);
  const [texte, setTexte] = useState("");
  const [err, setErr] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [picker, setPicker] = useState(null);
  const [cle, setCle] = useState("");
  const bas = useRef(null);
  const qs = () => `projet=${encodeURIComponent(projet)}`;

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
  useEffect(() => localStorage.setItem("atl-agents-projet", projet), [projet]);
  useEffect(() => localStorage.setItem("atl-agents-moteur", moteur), [moteur]);
  async function charger() {
    try {
      const c = await fetch(`/api/agents/${agent.slug}/chat?${qs()}`).then((r) => r.json());
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
      const r = await fetch(`/api/agents/${agent.slug}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projet, message: texte, images: photos, web, moteur, ...extra }) });
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
      <div className="cat-chat__opts">
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
              </small>
              <Markdown text={m.text} />
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
