// Grille des résultats de la Recherche produits (2026-11-25).
// En haut : les agents (un clic ouvre leurs réglages ou leur chat). Au centre :
// une cellule par piste trouvée (tous agents confondus) et par produit proposé
// par l'utilisateur. En dessous : le détail de la cellule choisie et ses
// actions (lancer le produit, discuter avec un agent, écarter…).
import { useEffect, useMemo, useState } from "react";

const ORDRE = { "feu vert": 0, "à analyser": 1, "à surveiller": 2, "écarté": 3 };
const FILTRES = [
  ["tous", "Tous"],
  ["moi", "Mes produits"],
  ["feu vert", "Feu vert"],
  ["à surveiller", "À surveiller"],
  ["écartés", "Écartés"],
];
const date = (s) => (s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const ecarte = (c) => c.statut === "écarté" || c.verdict === "écarté";

export function RechercheGrille({ agentsOmar, agentsChat, onOuvrir, onDiscuter }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [filtre, setFiltre] = useState("tous");
  const [tri, setTri] = useState("verdict");
  const [sel, setSel] = useState(() => sessionStorage.getItem("atl-grille-sel"));
  useEffect(() => {
    if (sel) sessionStorage.setItem("atl-grille-sel", sel);
  }, [sel]);
  async function charger() {
    try {
      const d = await fetch("/api/candidats").then((r) => r.json());
      setData(d);
      return d;
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    charger();
  }, []);
  const enCours = data?.enCours ?? [];
  useEffect(() => {
    if (!enCours.length) return;
    const t = setInterval(charger, 5000);
    return () => clearInterval(t);
  }, [enCours.length]);

  const liste = useMemo(() => {
    const l = (data?.candidats ?? []).filter((c) => (filtre === "écartés" ? ecarte(c) : !ecarte(c) && (filtre === "tous" || (filtre === "moi" ? c.id.startsWith("m-") : c.verdict === filtre))));
    const cle = { verdict: (c) => ORDRE[c.verdict] ?? 9, recent: (c) => -new Date(c.le ?? 0), nom: (c) => c.nom.toLowerCase() }[tri];
    return l.sort((a, b) => (a.id.startsWith("m-") === b.id.startsWith("m-") ? 0 : a.id.startsWith("m-") ? -1 : 1) || (cle(a) < cle(b) ? -1 : cle(a) > cle(b) ? 1 : 0));
  }, [data, filtre, tri]);
  const cur = sel === "new" ? null : (data?.candidats ?? []).find((c) => c.id === sel);
  const nb = (f) => (data?.candidats ?? []).filter((c) => (f === "écartés" ? ecarte(c) : !ecarte(c) && (f === "tous" || (f === "moi" ? c.id.startsWith("m-") : c.verdict === f)))).length;

  return (
    <div className="rg">
      <header className="rg__head">
        <h2>Recherche produits</h2>
        <p className="cat-muted">Les agents du haut cherchent des produits et remplissent la grille. Les boutons d'une cellule creusent ce produit. Tes propres produits ont leur case.</p>
      </header>
      <div className="rg__agents">
        {agentsOmar.map((a) => (
          <button key={a.slug} type="button" className="rg__agent" onClick={() => onOuvrir(a.slug)} title={a.accroche}>
            <b>{a.titre.replace(/^Omar_winninghunter_/, "")}</b>
            <small>{enCours.some((e) => e.agent === a.slug) ? "⏳ en cours…" : "Réglages et lancement"}</small>
          </button>
        ))}
        {agentsChat.map((a) => (
          <button key={a.slug} type="button" className="rg__agent rg__agent--chat" onClick={() => onDiscuter(a.slug, null)} title={a.accroche}>
            <b>💬 {a.titre.replace(/^(Whitelabeler|ShopFunnels|Shopfunnels)\s+/, "")}</b>
            <small>Conversation</small>
          </button>
        ))}
      </div>

      <div className="rg__bar">
        <b>Résultats</b>
        <span className="rg__filtres" role="group" aria-label="Filtrer">
          {FILTRES.map(([k, l]) => (
            <button key={k} type="button" className={filtre === k ? "is-on" : ""} onClick={() => setFiltre(k)}>
              {l} <small>{data ? nb(k) : ""}</small>
            </button>
          ))}
        </span>
        <select value={tri} onChange={(e) => setTri(e.target.value)} aria-label="Trier">
          <option value="verdict">Trier : verdict</option>
          <option value="recent">Trier : plus récent</option>
          <option value="nom">Trier : nom</option>
        </select>
      </div>
      {err && <p className="cat-flash is-error">⚠ {err}</p>}

      <div className="rg__grid">
        <button type="button" className={`rg__cell rg__cell--add${sel === "new" ? " is-on" : ""}`} onClick={() => setSel("new")}>
          <span className="rg__plus">+</span>
          <b>Proposer mon produit</b>
          <small>un nom suffit</small>
        </button>
        {enCours.map((e) => (
          <div key={e.agent} className="rg__cell rg__cell--run" role="status">
            <span className="rg__img">⏳</span>
            <b>{e.titre}</b>
            <small>{e.etape || "Recherche en cours…"}</small>
          </div>
        ))}
        {liste.map((c) => (
          <button key={c.id} type="button" className={`rg__cell${c.id === sel ? " is-on" : ""}`} onClick={() => setSel(c.id)}>
            <span className="rg__img">{c.image ? <img src={c.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} /> : c.id.startsWith("m-") ? "★" : "📦"}</span>
            <b>{c.nom}</b>
            <span className="rg__ligne">
              <Verdict v={c.verdict} />
              {c.lance && <small className="rg__lance">projet</small>}
            </span>
            <small>{c.id.startsWith("m-") ? (c.agent ? `retenu du chat · ${c.agentTitre || c.agent}` : "proposé par toi") : c.mesures.slice(0, 2).map(([k, v]) => `${k} ${v}`).join(" · ") || "pas de mesure relevée"}</small>
            <small className="cat-muted">
              {c.sources.length ? c.sources.map((s) => s.titre).filter((x, i, t) => t.indexOf(x) === i).join(" + ") : ""} {date(c.le)}
              {c.ajouts?.length ? ` · ${c.ajouts.length} info(s) retenue(s)` : ""}
            </small>
          </button>
        ))}
        {data && !liste.length && <p className="cat-muted rg__vide">Aucun résultat pour ce filtre.</p>}
      </div>

      {sel === "new" ? (
        <FormProduit
          key="new"
          onFini={async (id) => {
            await charger();
            id ? setSel(id) : setSel(null);
          }}
        />
      ) : cur ? (
        <Detail key={cur.id} c={cur} agentsChat={agentsChat} onDiscuter={onDiscuter} onOuvrir={onOuvrir} recharger={charger} onRetire={() => (setSel(null), charger())} />
      ) : (
        <p className="cat-muted rg__aide">Clique sur une cellule pour voir son détail.</p>
      )}
    </div>
  );
}

function Verdict({ v }) {
  return <span className={`rg__v rg__v--${{ "feu vert": "ok", "à surveiller": "warn", "écarté": "off", "à analyser": "new" }[v] ?? "warn"}`}>{v}</span>;
}

function FormProduit({ c = null, onFini }) {
  const [f, setF] = useState({ nom: c?.nom ?? "", lien: c?.lien ?? "", prix: c?.prix ?? "", cout: c?.cout ?? "", notes: c?.notes ?? "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const champ = (k, label, ph, long) => (
    <label className={long ? "rg__f rg__f--long" : "rg__f"}>
      {label}
      {long ? (
        <textarea rows={3} value={f[k]} placeholder={ph} onChange={(e) => (setF({ ...f, [k]: e.target.value }), setErr(null))} />
      ) : (
        <input value={f[k]} placeholder={ph} onChange={(e) => (setF({ ...f, [k]: e.target.value }), setErr(null))} />
      )}
    </label>
  );
  async function ok() {
    if (!f.nom.trim()) return setErr("Donne au moins un nom au produit.");
    setBusy(true);
    const r = await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: c ? "modifier" : "ajouter", id: c?.id, ...f }) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setErr(b?.error ?? "Échec de l'enregistrement.");
    onFini(c ? c.id : b.id);
  }
  return (
    <section className="rg__detail">
      <h3>{c ? "Modifier mon produit" : "Proposer mon produit"}</h3>
      <p className="cat-muted">Un nom suffit. Le reste aide les agents à l'analyser ; tu pourras compléter plus tard.</p>
      <div className="rg__form">
        {champ("nom", "Nom du produit", "Diapason 432 Hz")}
        {champ("lien", "Lien fournisseur, Amazon ou boutique", "https://")}
        {champ("prix", "Prix de vente visé", "79 $")}
        {champ("cout", "Coût d'achat", "14 $")}
        {champ("notes", "Ce que tu sais déjà", "Pour qui, à quoi il sert, pourquoi il te plaît", true)}
      </div>
      {err && <p className="cat-flash is-error" role="alert">⚠ {err}</p>}
      <div className="rg__actions">
        <button type="button" className="cat-btn" disabled={busy} onClick={ok}>
          {c ? "Enregistrer" : "Ajouter à la grille"}
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" onClick={() => onFini(c?.id ?? null)}>
          Annuler
        </button>
      </div>
    </section>
  );
}

function Detail({ c, agentsChat, onDiscuter, onOuvrir, recharger, onRetire }) {
  const moi = c.id.startsWith("m-");
  const [edit, setEdit] = useState(false);
  const [agentChat, setAgentChat] = useState(() => localStorage.getItem("atl-grille-agentchat") || agentsChat[0]?.slug || "");
  useEffect(() => {
    if (agentChat) localStorage.setItem("atl-grille-agentchat", agentChat);
  }, [agentChat]);
  const [msg, setMsg] = useState(null);
  async function action(corps) {
    setMsg(null);
    const r = await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, ...corps }) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    if (!r?.ok) return setMsg(`⚠ ${b?.error ?? "Échec"}`), null;
    return b;
  }
  if (edit) return <FormProduit c={c} onFini={async () => (setEdit(false), recharger())} />;
  const niche = agentsChat.find((a) => /niche/.test(a.slug))?.slug ?? agentsChat[0]?.slug;
  const parRubrique = (c.ajouts ?? []).reduce((m, a) => ((m[a.rubrique] = [...(m[a.rubrique] ?? []), a]), m), {});
  return (
    <section className="rg__detail">
      <div className="rg__dhead">
        <span className="rg__img rg__img--grand">{c.image ? <img src={c.image} alt="" /> : moi ? "★" : "📦"}</span>
        <div>
          <h3>{c.nom}</h3>
          <p className="cat-muted">
            {moi ? (c.agent ? `Retenu du chat de ${c.agentTitre || c.agent}` : "Proposé par toi") : `Trouvé par ${c.sources.map((s) => `${s.titre} (${date(s.le)})`).join(", ")}`} · source{" "}
            {moi && !c.agent ? "[Moi]" : "[WH] sauf mention"}
          </p>
        </div>
        <Verdict v={c.verdict} />
      </div>
      {c.mesures.length > 0 && (
        <div className="rg__chiffres">
          {c.mesures.slice(0, 6).map(([k, v]) => (
            <div key={k}>
              <small>{k}</small>
              <b>{v}</b>
            </div>
          ))}
        </div>
      )}
      <div className="rg__texte">
        {c.produitConcret && <p><b>Produit :</b> {c.produitConcret}</p>}
        {c.pourquoi && <p><b>Pourquoi (IA) :</b> {c.pourquoi}</p>}
        {c.angle && <p><b>Angle (IA) :</b> {c.angle}</p>}
        {c.risques?.length > 0 && <p><b>Risques :</b> {c.risques.join(" · ")}</p>}
        {c.prochaineEtape && <p><b>Prochaine étape conseillée :</b> {c.prochaineEtape}</p>}
        {c.notes && <p><b>{c.agent ? "Pourquoi l'agent le propose" : "Ce que tu sais"} :</b> {c.notes}</p>}
        {(c.lien || c.boutique) && (
          <p>
            <b>Lien :</b>{" "}
            <a href={c.lien || `https://${String(c.boutique).replace(/^https?:\/\//, "")}`} target="_blank" rel="noopener noreferrer">
              {c.lien || c.boutique} ↗
            </a>
          </p>
        )}
        {!moi && <p className="cat-muted">Chiffres relevés par WinningHunter à la date du résultat, sur un échantillon ; verdict et textes = interprétation de l'IA, à vérifier.</p>}
      </div>
      {Object.keys(parRubrique).length > 0 && (
        <div className="rg__ajouts">
          <b>Retenu des conversations</b>
          {Object.entries(parRubrique).map(([r, l]) => (
            <div key={r}>
              <small>{r}</small>
              <ul>
                {l.map((a, i) => (
                  <li key={i}>
                    {a.texte} <span className="cat-muted">[{a.source}]{a.agent ? ` · ${a.agent.replace(/^(Whitelabeler|ShopFunnels|Shopfunnels)\s+/, "")}` : ""} · {date(a.le)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="rg__actions">
        {c.lance ? (
          <span className="rg__ok">✓ Lancé dans le projet <b>{c.lance}</b> (Projets → ce projet)</span>
        ) : (
          <Lancer c={c} onFait={recharger} />
        )}
        {moi && niche && (
          <button type="button" className="cat-btn cat-btn--ghost" onClick={() => onDiscuter(niche, c, `Analyse ce produit pour moi : ${c.nom}. Concurrents, prix du marché, tendance, pubs actives, risques. Dis-moi si ça vaut la peine de le lancer.`)} title="Ouvre le chat de Niche Analyzer avec la fiche du produit et un message prêt (tu l'envoies toi-même) : quelques centimes ChatGPT + crédits WinningHunter si la case est cochée">
            Analyser avec Niche Analyzer
          </button>
        )}
        <span className="rg__discuter">
          <select value={agentChat} onChange={(e) => setAgentChat(e.target.value)} aria-label="Agent pour discuter">
            {agentsChat.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.titre.replace(/^(Whitelabeler|ShopFunnels|Shopfunnels)\s+/, "")}
              </option>
            ))}
          </select>
          <button type="button" className="cat-btn cat-btn--ghost" disabled={!agentChat} onClick={() => onDiscuter(agentChat, c)} title={c.lance ? `Conversation sur ce produit dans son projet ${c.lance} : l'agent lit tout le projet` : "Conversation sur ce produit : l'agent reçoit sa fiche, tu n'as rien à recopier"}>
            💬 Discuter de ce produit
          </button>
        </span>
        {!moi && c.sources[0] && (
          <button type="button" className="cat-link" onClick={() => onOuvrir(c.sources[0].agent)}>
            Voir le résultat complet de l'agent
          </button>
        )}
        {moi && (
          <button type="button" className="cat-link" onClick={() => setEdit(true)}>
            Modifier
          </button>
        )}
        {moi ? (
          <button type="button" className="cat-link" onClick={async () => window.confirm(`Retirer « ${c.nom} » de la grille ?`) && (await action({ action: "retirer" })) && onRetire()}>
            Retirer
          </button>
        ) : (
          <button type="button" className="cat-link" onClick={async () => (await action({ action: "statut", statut: c.statut === "écarté" ? null : "écarté" })) && recharger()}>
            {c.statut === "écarté" ? "Remettre dans la grille" : "Écarter"}
          </button>
        )}
      </div>
      {msg && <p className="cat-flash is-error">{msg}</p>}
    </section>
  );
}

function Lancer({ c, onFait }) {
  const [ouvert, setOuvert] = useState(false);
  const [projets, setProjets] = useState([]);
  const [choix, setChoix] = useState("");
  const [nom, setNom] = useState(c.nom);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!ouvert) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((l) => setProjets(Array.isArray(l) ? l : []))
      .catch(() => {});
  }, [ouvert]);
  if (!ouvert)
    return (
      <button type="button" className="cat-btn" onClick={() => setOuvert(true)} title="Crée le projet (ou choisis-en un) et y emporte tout ce qui a été trouvé, comme note de recherche avec son origine">
        Lancer ce produit
      </button>
    );
  async function go() {
    setErr(null);
    if (!choix && !nom.trim()) return setErr("Donne un nom au projet.");
    setBusy(true);
    const r = await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lancer", id: c.id, ...(choix ? { projet: choix } : { nouveau: nom }) }) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setErr(b?.error ?? "Échec");
    onFait();
  }
  return (
    <span className="rg__lancer">
      <select value={choix} onChange={(e) => setChoix(e.target.value)} aria-label="Projet">
        <option value="">+ Nouveau projet</option>
        {projets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nom}
          </option>
        ))}
      </select>
      {!choix && <input value={nom} onChange={(e) => (setNom(e.target.value), setErr(null))} aria-label="Nom du nouveau projet" />}
      <button type="button" className="cat-btn" disabled={busy} onClick={go}>
        {busy ? "…" : "Lancer"}
      </button>
      <button type="button" className="cat-link" onClick={() => setOuvert(false)}>
        Annuler
      </button>
      {err && <span className="rg__err" role="alert">⚠ {err}</span>}
    </span>
  );
}

// Sous une réponse d'agent dans le chat de la Recherche : « Ajouter à la
// grille » (produits proposés) et « Ajouter à cette piste » (infos sur le
// produit étudié). Un petit appel ChatGPT range la réponse ; tu coches.
export function RangerReponse({ texte, agent, candidat }) {
  const [mode, setMode] = useState(null);
  const [items, setItems] = useState(null);
  const [coches, setCoches] = useState([]);
  const [etat, setEtat] = useState(null);
  async function extraire(m) {
    setMode(m);
    setItems(null);
    setEtat("Rangement de la réponse…");
    const r = await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "extraire", mode: m, texte, id: candidat?.id }) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    if (!r?.ok) return setEtat(`⚠ ${b?.error ?? "Échec"}`);
    setItems(b.items);
    setCoches(b.items.map((_, i) => i));
    setEtat(b.items.length ? null : m === "produits" ? "Aucun produit précis dans cette réponse." : "Rien d'utilisable sur ce produit dans cette réponse.");
  }
  async function valider() {
    const choisis = items.filter((_, i) => coches.includes(i));
    const corps = mode === "produits" ? { action: "ajouterProduits", items: choisis, agent } : { action: "ajouts", id: candidat.id, items: choisis, agent };
    const r = await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    if (!r?.ok) return setEtat(`⚠ ${b?.error ?? "Échec"}`);
    setItems(null);
    setEtat(mode === "produits" ? `✓ ${b.n} produit(s) ajouté(s) à la grille (Mes produits).` : b.projet ? `✓ ${b.n} info(s) ajoutée(s) à la cellule de « ${candidat.nom} » et aux notes de recherche du projet ${b.projet}.` : `✓ ${b.n} info(s) ajoutée(s) à la cellule de « ${candidat.nom} ».`);
  }
  return (
    <div className="rg-ranger">
      {!items && (
        <span className="rg-ranger__btns">
          <button type="button" className="cat-link" onClick={() => extraire("produits")} title="Les produits proposés dans cette réponse deviennent des cellules (≈ 1 centime ChatGPT)">
            ▦ Ajouter à la grille
          </button>
          {candidat && (
            <button type="button" className="cat-link" onClick={() => extraire("piste")} title={candidat.projet ? "Concurrents, prix, mots des clients, risques… rangés dans la cellule et ajoutés aux notes de recherche du projet (≈ 1 centime ChatGPT)" : "Concurrents, prix, mots des clients, risques… rangés dans la cellule de ce produit (≈ 1 centime ChatGPT)"}>
              ＋ Ajouter à cette piste
            </button>
          )}
        </span>
      )}
      {etat && <span className="cat-muted"> {etat}</span>}
      {items?.length > 0 && (
        <div className="rg-ranger__liste">
          {items.map((x, i) => (
            <label key={i}>
              <input type="checkbox" checked={coches.includes(i)} onChange={() => setCoches((c) => (c.includes(i) ? c.filter((y) => y !== i) : [...c, i]))} />
              {mode === "produits" ? (
                <span>
                  <b>{x.nom}</b> {x.notes && <span className="cat-muted">· {x.notes}</span>}
                </span>
              ) : (
                <span>
                  <small>{x.rubrique}</small> {x.texte} <span className="cat-muted">[{x.source}]</span>
                </span>
              )}
            </label>
          ))}
          <span>
            <button type="button" className="cat-btn" disabled={!coches.length} onClick={valider}>
              Ajouter ({coches.length})
            </button>{" "}
            <button type="button" className="cat-link" onClick={() => (setItems(null), setEtat(null))}>
              Annuler
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
