// Grille des résultats de la Recherche produits (2026-11-25).
// En haut : les agents (un clic ouvre leurs réglages ou leur chat). Au centre :
// une cellule par piste trouvée (tous agents confondus) et par produit proposé
// par l'utilisateur. En dessous : le détail de la cellule choisie et ses
// actions (lancer le produit, discuter avec un agent, écarter…).
import { useEffect, useMemo, useState } from "react";
import { Markdown } from "../mirror-pub-ui.jsx";
import { CoutsPanneau } from "./Couts.jsx";

const ORDRE = { "feu vert": 0, "à analyser": 1, "à surveiller": 2, "écarté": 3 };
const FILTRES = [
  ["tous", "Tous"],
  ["moi", "Mes produits"],
  ["variantes", "Variantes à analyser"],
  ["feu vert", "Feu vert"],
  ["à surveiller", "À surveiller"],
  ["écartés", "Écartés"],
];
// À quoi sert chaque agent (2026-11-25), en petits caractères sous sa carte.
const UTILITE = {
  "omar-winninghunter-radar-tendances": "Les produits qui montent, avant qu'ils deviennent populaires",
  "omar-winninghunter-chasseur-facebook": "Les pubs Facebook récentes qui dépensent déjà",
  "omar-winninghunter-chasseur-tiktok": "Les pubs TikTok qui marchent",
  "omar-winninghunter-boucle-magic-ai": "Des produits et boutiques proches d'un modèle",
  "omar-winninghunter-veille-boutiques": "Suivre des boutiques concurrentes : trafic, pubs, nouveautés",
  "whitelabeler-niche-analyser-v-1": "Le marché et les concurrents (revenus, pubs, prix)",
  "whitelabeler-product-validator-v-1": "On y va ou pas ?",
  "shopfunnels-ai-product-research-analyst": "Fournisseur, marge, préparation du lancement, note sur 10",
  "shopfunnels-winning-hunter-assistant-v-1": "Chercher de nouveaux produits",
  "whitelabeler-ai-supplier-scout-v-2": "Fournisseurs AliExpress / Alibaba, coût livré et marge",
};
// Winning Hunter Assistant (qui cherche des produits) après les trois agents d'analyse.
const ORDRE_CHAT = ["whitelabeler-niche-analyser-v-1", "whitelabeler-product-validator-v-1", "shopfunnels-ai-product-research-analyst", "whitelabeler-ai-supplier-scout-v-2", "shopfunnels-winning-hunter-assistant-v-1"];
const rang = (slug) => (ORDRE_CHAT.indexOf(slug) + 1 || 99);
const date = (s) => (s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
// Rangé dans « Écartés » : par toi, ou par l agent qui l a trouvée. Un avis « écarté » d un agent en conversation laisse la cellule visible (badge rouge).
const ecarte = (c) => c.statut === "écarté" || (!c.dernierAvis && c.verdict === "écarté");

export function RechercheGrille({ agentsOmar, agentsChat, onOuvrir, onDiscuter }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [filtre, setFiltre] = useState("tous");
  const [tri, setTri] = useState("verdict");
  const [sel, setSel] = useState(() => sessionStorage.getItem("atl-grille-sel"));
  // Cases à cocher sur les cartes (2026-11-27) : écarter ou supprimer plusieurs résultats.
  const [coches, setCoches] = useState(() => new Set());
  const [occupe, setOccupe] = useState(false);
  const cocher = (id) => setCoches((cur) => {
    const n = new Set(cur);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  async function enLot(quoi) {
    const ids = [...coches];
    if (!ids.length) return;
    if (quoi === "supprimer" && !window.confirm(`Supprimer définitivement ${ids.length} résultat(s) de la grille ? Ils ne reviendront pas, même si un agent les retrouve.`)) return;
    setOccupe(true);
    try {
      if (quoi === "supprimer") {
        await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "supprimerPlusieurs", ids }) });
      } else {
        for (const id of ids) await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "statut", statut: quoi === "ecarter" ? "écarté" : null }) });
      }
      setCoches(new Set());
      if (ids.includes(sel)) setSel(null);
      charger();
    } finally {
      setOccupe(false);
    }
  }
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

  // Variantes suggérées par les agents (rangées dans la fiche de leur produit) :
  // visibles seulement dans le filtre « Variantes à analyser ».
  const variantes = useMemo(
    () =>
      (data?.candidats ?? [])
        .flatMap((c) => (c.variantes ?? []).map((v, i) => ({ id: `v:${c.id}:${i}`, nom: v.nom, notes: v.notes, agent: v.agent, le: v.le, verdict: "à analyser", variante: true, index: i, parent: { id: c.id, nom: c.nom }, sources: [], mesures: [], ajouts: [] })))
        .sort((a, b) => String(b.le ?? "").localeCompare(String(a.le ?? ""))),
    [data],
  );
  const liste = useMemo(() => {
    if (filtre === "variantes") return variantes;
    const l = (data?.candidats ?? []).filter((c) => (filtre === "écartés" ? ecarte(c) : !ecarte(c) && (filtre === "tous" || (filtre === "moi" ? c.id.startsWith("m-") : c.verdict === filtre))));
    const cle = { verdict: (c) => ORDRE[c.verdict] ?? 9, recent: (c) => -new Date(c.le ?? 0), nom: (c) => c.nom.toLowerCase() }[tri];
    return l.sort((a, b) => (a.id.startsWith("m-") === b.id.startsWith("m-") ? 0 : a.id.startsWith("m-") ? -1 : 1) || (cle(a) < cle(b) ? -1 : cle(a) > cle(b) ? 1 : 0));
  }, [data, filtre, tri, variantes]);
  const cur = sel === "new" ? null : String(sel ?? "").startsWith("v:") ? variantes.find((v) => v.id === sel) : (data?.candidats ?? []).find((c) => c.id === sel);
  const nb = (f) => f === "variantes" ? variantes.length : (data?.candidats ?? []).filter((c) => (f === "écartés" ? ecarte(c) : !ecarte(c) && (f === "tous" || (f === "moi" ? c.id.startsWith("m-") : c.verdict === f)))).length;

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
            {UTILITE[a.slug] && <small className="rg__utilite">{UTILITE[a.slug]}</small>}
          </button>
        ))}
        {[...agentsChat].sort((x, y) => rang(x.slug) - rang(y.slug)).map((a) => (
          <button key={a.slug} type="button" className="rg__agent rg__agent--chat" onClick={() => onDiscuter(a.slug, null)} title={a.accroche}>
            <b>💬 {a.titre.replace(/^(Whitelabeler|ShopFunnels|Shopfunnels)\s+/, "")}</b>
            <small>Conversation</small>
            {UTILITE[a.slug] && <small className="rg__utilite">{UTILITE[a.slug]}</small>}
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
        {filtre === "écartés" && nb("écartés") > 0 && (
          <button
            type="button"
            className="cat-link rg__suppr-txt"
            onClick={async () => {
              const ids = (data?.candidats ?? []).filter(ecarte).map((c) => c.id);
              if (!window.confirm(`Supprimer définitivement les ${ids.length} résultat(s) écarté(s) de la grille ?`)) return;
              await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "supprimerPlusieurs", ids }) }).catch(() => null);
              setSel(null);
              charger();
            }}
          >
            Supprimer les {nb("écartés")} écartés
          </button>
        )}
        <select value={tri} onChange={(e) => setTri(e.target.value)} aria-label="Trier">
          <option value="verdict">Trier : verdict</option>
          <option value="recent">Trier : plus récent</option>
          <option value="nom">Trier : nom</option>
        </select>
      </div>
      {err && <p className="cat-flash is-error">⚠ {err}</p>}

      {coches.size > 0 && (
        <div className="rg__lot" role="toolbar" aria-label="Résultats cochés">
          <b>{coches.size} coché(s)</b>
          {filtre === "écartés" ? (
            <button type="button" className="cat-btn cat-btn--ghost" disabled={occupe} onClick={() => enLot("remettre")}>
              Remettre dans la grille
            </button>
          ) : (
            <button type="button" className="cat-btn cat-btn--ghost" disabled={occupe} onClick={() => enLot("ecarter")}>
              Écarter
            </button>
          )}
          <button type="button" className="cat-btn rg__lot-suppr" disabled={occupe} onClick={() => enLot("supprimer")}>
            Supprimer
          </button>
          <button type="button" className="cat-link" onClick={() => setCoches(new Set())}>
            Tout décocher
          </button>
        </div>
      )}
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
          <button key={c.id} type="button" className={`rg__cell${c.id === sel ? " is-on" : ""}${coches.has(c.id) ? " is-coche" : ""}`} onClick={() => setSel(c.id)}>
            {!c.variante && (
              <span
                role="checkbox"
                aria-checked={coches.has(c.id)}
                aria-label={`Cocher « ${c.nom} »`}
                tabIndex={0}
                className="rg__coche"
                onClick={(e) => (e.stopPropagation(), cocher(c.id))}
                onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), e.stopPropagation(), cocher(c.id))}
              >
                {coches.has(c.id) ? "✓" : ""}
              </span>
            )}
            <span className="rg__img">{c.image ? <img src={c.image} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} /> : c.variante ? "💡" : c.id.startsWith("m-") ? "★" : "📦"}</span>
            <b>{c.nom}</b>
            <span className="rg__ligne">
              <Verdict v={c.verdict} />
              {c.lance && <small className="rg__lance">projet</small>}
              {c.desaccord && <small className="rg__desaccord" title="Les agents n'ont pas rendu le même verdict">désaccord</small>}
            </span>
            {c.dernierAvis && <small className="rg__avis">dernier avis : {c.dernierAvis.agent} · {date(c.dernierAvis.le)}</small>}
            <small>{c.variante ? `idée de ${c.agent} · à partir de « ${c.parent.nom} »` : c.id.startsWith("m-") ? (c.parent ? `idée de ${c.agentTitre || c.agent} · à partir de « ${c.parent.nom} »` : c.agent ? `retenu du chat · ${c.agentTitre || c.agent}` : "proposé par toi") : c.mesures.slice(0, 2).map(([k, v]) => `${k} ${v}`).join(" · ") || "pas de mesure relevée"}</small>
            <small className="cat-muted">
              {c.sources.length ? c.sources.map((s) => s.titre).filter((x, i, t) => t.indexOf(x) === i).join(" + ") : ""} {date(c.le)}
              {c.ajouts?.length ? ` · ${c.ajouts.length} info(s) retenue(s)` : ""}
              {c.variantes?.length ? ` · ${c.variantes.length} variante(s)` : ""}
              {c.collages?.length ? ` · ${c.collages.length} collage(s)` : ""}
              {c.nbRapports ? ` · ${c.nbRapports} rapport(s)` : ""}
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
      ) : cur?.variante ? (
        <VarianteDetail
          key={cur.id}
          v={cur}
          recharger={charger}
          onParent={() => (setFiltre("tous"), setSel(cur.parent.id))}
          onFait={async (nid) => {
            await charger();
            if (nid) (setFiltre("moi"), setSel(nid));
            else setSel(null);
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

// Rapports complets des agents (les « rushes ») attachés à la fiche (2026-11-25).
export function RapportsAgents({ id, nb, lance = null, liste = null }) {
  const [l, setL] = useState(liste);
  const [ouverts, setOuverts] = useState({});
  useEffect(() => {
    if (liste) return setL(liste);
    if (!nb) return setL([]);
    fetch(`/api/candidats/rapports/${id}`)
      .then((r) => r.json())
      .then((d) => setL(d.rapports ?? []))
      .catch(() => setL([]));
  }, [id, nb, liste]);
  async function ouvrir(r) {
    const k = `${r.candidat ?? id}/${r.fichier}`;
    if (ouverts[k] !== undefined) return;
    const t = await fetch(`/api/candidats/rapport/${r.candidat ?? id}/${r.fichier}`).then((x) => (x.ok ? x.text() : "Rapport introuvable.")).catch(() => "Rapport introuvable.");
    setOuverts((o) => ({ ...o, [k]: t }));
  }
  if (!l?.length) return null;
  const date = (s) => (s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  return (
    <div className="rg__rapports">
      <b>Fichiers des agents : rapports complets</b>{" "}
      <span className="cat-muted">Chaque réponse d'un agent sur ce produit, gardée telle quelle{lance ? ` ; ils suivent le produit dans les Fondations du projet ${lance}` : " ; ils suivront le produit dans les Fondations quand tu le lanceras"}.</span>
      {l.map((r) => {
        const k = `${r.candidat ?? id}/${r.fichier}`;
        return (
          <details key={k} className="rg__rapport" onToggle={(e) => e.currentTarget.open && ouvrir(r)}>
            <summary>
              📄 <b>{r.agent}</b> · {date(r.le)}
              {r.taille ? <span className="cat-muted"> · {Math.round(r.taille / 1000)} k car.</span> : null}{" "}
              <a className="cat-link" href={`/api/candidats/rapport/${r.candidat ?? id}/${r.fichier}?telecharger`} onClick={(e) => e.stopPropagation()} title="Télécharger le fichier (.md)">
                télécharger
              </a>
            </summary>
            <div className="rg__rapporttxt">{ouverts[k] === undefined ? "Chargement…" : <Markdown text={ouverts[k]} />}</div>
          </details>
        );
      })}
    </div>
  );
}

// Détail d'une variante (filtre « Variantes à analyser »).
function VarianteDetail({ v, onParent, onFait }) {
  const [msg, setMsg] = useState(null);
  async function faire(quoi) {
    setMsg(null);
    const r = await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "variante", faire: quoi, id: v.parent.id, index: v.index, nom: v.nom, parentNom: v.parent.nom }) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    if (!r?.ok) return setMsg(`⚠ ${b?.error ?? "Échec"}`);
    onFait(b.id ?? null);
  }
  return (
    <section className="rg__detail">
      <div className="rg__dhead">
        <span className="rg__img rg__img--grand">💡</span>
        <div>
          <h3>{v.nom}</h3>
          <p className="cat-muted">
            idée de {v.agent} · à partir de « {v.parent.nom} » · {v.le ? new Date(v.le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}
          </p>
        </div>
        <Verdict v="à analyser" />
      </div>
      {v.notes && <p className="rg__texte">{v.notes}</p>}
      <div className="rg__actions">
        <button type="button" className="cat-btn" onClick={() => faire("produit")} title="La variante devient un produit de la grille (Mes produits) : tu peux la discuter avec un agent, la lancer…">
          En faire un produit de la grille
        </button>
        <button type="button" className="cat-link" onClick={onParent}>
          Voir le produit d'origine
        </button>
        <button type="button" className="cat-link" onClick={() => window.confirm(`Retirer la variante « ${v.nom} » ?`) && faire("retirer")}>
          Retirer
        </button>
      </div>
      {msg && <p className="cat-flash is-error">{msg}</p>}
    </section>
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
  // « Discuter de ce produit » : les 3 agents d'analyse seulement (Winning
  // Hunter Assistant cherche de nouveaux produits : carte du haut).
  // Product Validator en premier (2026-11-25, demande de l utilisateur).
  const ORDRE_ANALYSE = ["whitelabeler-product-validator-v-1", "whitelabeler-niche-analyser-v-1", "shopfunnels-ai-product-research-analyst", "whitelabeler-ai-supplier-scout-v-2"];
  const analyse = [...agentsChat].filter((a) => !/winning-hunter-assistant/.test(a.slug)).sort((x, y) => (ORDRE_ANALYSE.indexOf(x.slug) + 1 || 99) - (ORDRE_ANALYSE.indexOf(y.slug) + 1 || 99));
  const [agentChat, setAgentChat] = useState(() => {
    const m = localStorage.getItem("atl-grille-agentchat2");
    return analyse.some((a) => a.slug === m) ? m : analyse[0]?.slug || "";
  });
  useEffect(() => {
    if (agentChat) localStorage.setItem("atl-grille-agentchat2", agentChat);
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
  const parRubrique = (c.ajouts ?? []).reduce((m, a, i) => ((m[a.rubrique] = [...(m[a.rubrique] ?? []), { ...a, i }]), m), {});
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
      {c.desaccord && (
        <p className="rg__alerte">
          ⚠ Les agents ne sont pas d'accord : {c.desaccord.map((d) => `${d.titre} (${date(d.le)}) : ${d.verdict}`).join(" · ")}. Le verdict affiché est le plus récent.
        </p>
      )}
      {(c.analyses?.length > 0 || c.verdictTrouve) && (
        <div className="rg__avislist">
          <b>Avis des agents</b> <span className="cat-muted">(le plus récent donne le verdict affiché)</span>
          <ul>
            {[...(c.analyses ?? [])].reverse().map((a, i) => (
              <li key={i}>
                <b>{a.agent}</b> · {date(a.le)} : {a.verdict ? <Verdict v={a.verdict} /> : "pas d'avis tranché"}
                {a.score != null ? ` ${a.score}/10` : ""}
                {a.marche ? <span className="cat-muted"> · marché {a.marche}</span> : null}
                {a.resume ? <span> — {a.resume}</span> : null}
              </li>
            ))}
            {c.verdictTrouve && (
              <li>
                <b>{c.sources?.[0]?.titre ?? "Agent de recherche"}</b> (piste trouvée) · {date(c.sources?.[0]?.le)} : <Verdict v={c.verdictTrouve} />
              </li>
            )}
          </ul>
        </div>
      )}
      {c.parent && <p className="cat-muted">Idée suggérée par {c.agentTitre || c.agent} en analysant « {c.parent.nom} ».</p>}
      {c.ancien && <p className="cat-muted">Piste gardée parce que tu l'as travaillée : elle n'est plus dans les 3 derniers résultats de l'agent (chiffres de sa dernière apparition).</p>}
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
      <CoutsPanneau key={`couts-${c.id}`} cle={`produit-${c.id}`} titre="Dépense IA sur ce produit" compact />
      <RapportsAgents id={c.id} nb={c.nbRapports} lance={c.lance} />
      <div className="rg__collages">
        <b>Contenus collés (Amazon, Reddit)</b>{" "}
        <span className="cat-muted">Les agents n'ont pas accès à ces sites : ce que tu colles ici est lu par tous les agents qui étudient ce produit{c.lance ? ", et copié dans les Fondations de son projet" : ""}.</span>
        {(c.collages ?? []).map((x, i) => (
          <details key={i} className="rg__collage">
            <summary>
              <b>{x.type === "descriptif" ? `Descriptif ${x.source}` : x.source === "Amazon" ? "Avis Amazon" : x.source}</b> · {date(x.le)} · {x.texte.length.toLocaleString("fr-FR")} car. — {x.texte.slice(0, 80)}…
              <button type="button" className="rg__suppr" aria-label="Retirer ce collage" title="Retirer ce collage de la fiche (déjà copié dans un projet, il y reste)" onClick={async (e) => (e.preventDefault(), (await action({ action: "retirerCollage", index: i, debut: x.texte.slice(0, 40) })) && recharger())}>
                ✕
              </button>
            </summary>
            <div className="rg__collagetxt">{x.texte}</div>
          </details>
        ))}
        {c.imagesAmazon?.length > 0 && (
          <div className="rg__imgsamazon">
            {c.imagesAmazon.map((x) => (
              <span key={x.url}>
                <a href={x.url} target="_blank" rel="noopener noreferrer">
                  <img src={x.url} alt="Image Amazon" />
                </a>
                <button type="button" className="rg__suppr" aria-label="Retirer cette image" onClick={async () => (await action({ action: "retirerImage", url: x.url })) && recharger()}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <CollerAvis
          compact
          onImages={async (fichiers) => {
            const urls = [];
            for (const f of fichiers) urls.push(await televerser(`recherche-${c.id}`.slice(0, 80), f));
            const b = await action({ action: "images", urls });
            if (!b) return { erreur: "Échec de l'enregistrement." };
            recharger();
            return { message: `✓ ${urls.length} image(s) ajoutée(s) à la fiche${c.lance ? " et aux médias du projet" : ""} : tu peux les joindre à un message dans le chat (bouton Images).` };
          }}
          onColler={async (x) => {
            const b = await action({ action: "coller", ...x });
            if (!b) return { erreur: "Échec de l'enregistrement." };
            recharger();
            return { message: b.projet ? `✓ Ajouté à la fiche et aux Fondations du projet ${b.projet}.` : "✓ Ajouté à la fiche : les agents le liront." };
          }}
        />
      </div>
      {c.variantes?.length > 0 && (
        <div className="rg__variantes">
          <b>Variantes suggérées</b> <span className="cat-muted">(gardées ici pour ne pas charger la grille)</span>
          {c.variantes.map((v, i) => (
            <div key={`${v.nom}-${i}`} className="rg__variante">
              <span className="rg__ligne">
                <b>{v.nom}</b> <Verdict v="à analyser" />
              </span>
              <small className="cat-muted">
                idée de {v.agent} · à partir de « {c.nom} » · {date(v.le)}
              </small>
              {v.notes && <small>{v.notes}</small>}
              <span className="rg__varbtns">
                <button type="button" className="cat-link" title="La variante devient un produit de la grille (filtre Mes produits), pour la creuser à son tour" onClick={async () => (await action({ action: "variante", faire: "produit", index: i, nom: v.nom, parentNom: c.nom })) && recharger()}>
                  En faire un produit de la grille
                </button>
                <button type="button" className="rg__suppr" aria-label="Retirer cette variante" title="Retirer cette variante" onClick={async () => (await action({ action: "variante", faire: "retirer", index: i, nom: v.nom })) && recharger()}>
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {Object.keys(parRubrique).length > 0 && (
        <div className="rg__ajouts">
          <b>Retenu des conversations</b>
          {Object.entries(parRubrique).map(([r, l]) => (
            <div key={r}>
              <small>{r}</small>
              <ul>
                {l.map((a) => (
                  <li key={a.i}>
                    {a.texte} <span className="cat-muted">[{a.source}]{a.agent ? ` · ${a.agent.replace(/^(Whitelabeler|ShopFunnels|Shopfunnels)\s+/, "")}` : ""} · {date(a.le)}</span>{" "}
                    <button type="button" className="rg__suppr" aria-label="Retirer cette information" title="Retirer cette information de la cellule (déjà copiée dans un projet, elle y reste)" onClick={async () => (await action({ action: "retirerAjout", index: a.i, texte: a.texte })) && recharger()}>
                      ✕
                    </button>
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
            {analyse.map((a) => (
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
          <button type="button" className="cat-link" onClick={() => onOuvrir(c.sources[0].agent, { fichier: c.sources[0].fichier, pid: c.sources[0].pid, nom: c.nom })}>
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
          <>
          <button type="button" className="cat-link rg__suppr-txt" onClick={async () => window.confirm(`Supprimer « ${c.nom} » de la grille ? Il ne reviendra pas, même si un agent le retrouve. (Les rapports et un projet déjà lancé ne sont pas touchés.)`) && (await action({ action: "supprimer" })) && onRetire()}>
            Supprimer
          </button>{" "}
          <button type="button" className="cat-link" onClick={async () => (await action({ action: "statut", statut: c.statut === "écarté" ? null : "écarté" })) && recharger()}>
            {c.statut === "écarté" ? "Remettre dans la grille" : "Écarter"}
          </button>
          </>
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
// Coller des contenus Amazon / Reddit (2026-11-25) : les agents n'ont pas
// accès à ces sites. Avis, descriptif produit (texte) et images Amazon ; pas
// de lien (inutile : personne ne peut ouvrir ces pages).
const ONGLETS_COLLAGE = [
  ["avis-Amazon", "Avis Amazon", "Colle ici les avis copiés (surtout 1 à 3 étoiles) : note, titre, texte…"],
  ["descriptif-Amazon", "Descriptif Amazon", "Colle ici le descriptif du produit copié sur Amazon : titre, points clés, description, caractéristiques…"],
  ["images-Amazon", "Images Amazon", ""],
  ["avis-Reddit", "Reddit", "Colle ici le fil ou les commentaires copiés…"],
];
// Téléverse une image (fichier ou image collée) dans /medias/<dossier>/.
export async function televerser(dossier, file) {
  const dataUrl = await new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = ko;
    r.readAsDataURL(file);
  });
  const res = await fetch(`/api/medias/${dossier}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name || "amazon", dataUrl }) });
  const b = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(b.error ?? "Image refusée.");
  return b.url;
}
export function CollerAvis({ onColler, onImages = null, compact = false, onFermer = null }) {
  const [ouvert, setOuvert] = useState(!compact);
  const [onglet, setOnglet] = useState("avis-Amazon");
  const [texte, setTexte] = useState("");
  const [fichiers, setFichiers] = useState([]);
  const [etat, setEtat] = useState(null);
  const [busy, setBusy] = useState(false);
  const onglets = ONGLETS_COLLAGE.filter(([k]) => k !== "images-Amazon" || onImages);
  if (!ouvert)
    return (
      <button type="button" className="cat-btn cat-btn--ghost" onClick={() => setOuvert(true)} title="Colle des avis, un descriptif ou des images copiés sur Amazon, ou des commentaires Reddit : les agents n'ont pas accès à ces sites">
        📋 Avis Amazon / Reddit
      </button>
    );
  const [type, source] = onglet.split("-");
  const fini = (r) => {
    setEtat(r?.message ?? "✓ Ajouté.");
    if (compact) setTimeout(() => (setOuvert(false), setEtat(null)), 2500);
    if (onFermer) setTimeout(onFermer, 2500);
  };
  async function ok() {
    if (type === "images") {
      if (!fichiers.length) return setEtat("⚠ Choisis ou colle d'abord une image.");
      setBusy(true);
      const r = await onImages(fichiers).catch((e) => ({ erreur: e.message }));
      setBusy(false);
      if (r?.erreur) return setEtat(`⚠ ${r.erreur}`);
      setFichiers([]);
      return fini(r);
    }
    if (!texte.trim()) return setEtat("⚠ Colle d'abord le texte.");
    setBusy(true);
    const r = await onColler({ source, type, texte });
    setBusy(false);
    if (r?.erreur) return setEtat(`⚠ ${r.erreur}`);
    setTexte("");
    fini(r);
  }
  const ajouterFichiers = (l) => {
    const imgs = [...(l ?? [])].filter((f) => /^image\/(png|jpe?g|webp|gif)$/.test(f.type));
    if (imgs.length) (setFichiers((f) => [...f, ...imgs].slice(0, 20)), setEtat(null));
  };
  return (
    <div className="rg-coller" onPaste={(e) => type === "images" && ajouterFichiers(e.clipboardData?.files)}>
      <div className="rg-coller__bar">
        <span className="rg-coller__src" role="group" aria-label="Type de contenu">
          {onglets.map(([k, l]) => (
            <button key={k} type="button" className={onglet === k ? "is-on" : ""} onClick={() => (setOnglet(k), setEtat(null))}>
              {l}
            </button>
          ))}
        </span>
      </div>
      {type === "images" ? (
        <div className="rg-coller__images" tabIndex={0} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), ajouterFichiers(e.dataTransfer?.files))}>
          <span className="cat-muted">Glisse des images ici, colle-les (Ctrl + V après « Copier l'image » sur Amazon), ou </span>
          <label className="cat-link">
            choisis des fichiers
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => (ajouterFichiers(e.target.files), (e.target.value = ""))} />
          </label>
          {fichiers.length > 0 && (
            <span className="rg-coller__vignettes">
              {fichiers.map((f, i) => (
                <span key={i}>
                  <img src={URL.createObjectURL(f)} alt="" />
                  <button type="button" className="rg__suppr" aria-label="Enlever" onClick={() => setFichiers((l) => l.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </span>
              ))}
            </span>
          )}
        </div>
      ) : (
        <textarea rows={5} value={texte} onChange={(e) => (setTexte(e.target.value), setEtat(null))} placeholder={onglets.find(([k]) => k === onglet)?.[2]} aria-label="Texte collé" />
      )}
      <span className="rg-coller__btns">
        <button type="button" className="cat-btn" disabled={busy} onClick={ok}>
          {busy ? "…" : type === "images" ? `Ajouter ${fichiers.length || ""} image(s)` : "Ajouter"}
        </button>
        {(compact || onFermer) && (
          <button type="button" className="cat-link" onClick={() => (onFermer ? onFermer() : (setOuvert(false), setEtat(null)))}>
            Fermer
          </button>
        )}
        {etat && <span className={etat.startsWith("⚠") ? "rg__err" : "rg__ok"}>{etat}</span>}
      </span>
    </div>
  );
}

export function RangerReponse({ texte, agent, candidat }) {
  const [mode, setMode] = useState(null);
  const [items, setItems] = useState(null);
  const [coches, setCoches] = useState([]);
  const [etat, setEtat] = useState(null);
  const [busy, setBusy] = useState(false);
  async function extraire(m) {
    if (busy) return;
    setBusy(true);
    setMode(m);
    setItems(null);
    setEtat("Rangement de la réponse…");
    const r = await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "extraire", mode: m, texte, id: candidat?.id }) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setEtat(`⚠ ${b?.error ?? "Échec"}`);
    setItems(b.items);
    setCoches([]);
    setEtat(b.items.length ? null : m === "produits" ? "Aucun produit précis dans cette réponse." : "Rien d'utilisable sur ce produit dans cette réponse.");
  }
  async function valider() {
    if (busy) return;
    setBusy(true);
    const choisis = items.filter((_, i) => coches.includes(i));
    const corps = mode === "produits" ? { action: "ajouterProduits", items: choisis, agent } : { action: "ajouts", id: candidat.id, items: choisis, agent };
    const r = await fetch("/api/candidats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setEtat(`⚠ ${b?.error ?? "Échec"}`);
    setItems(null);
    setEtat(mode === "produits" ? `✓ ${b.n} produit(s) ajouté(s) à la grille (Mes produits).` : b.projet ? `✓ ${b.n} info(s) ajoutée(s) à la cellule de « ${candidat.nom} » et au projet ${b.projet} (notes de recherche + ${b.brouillons ?? 0} proposition(s) à accepter dans Fondations).` : `✓ ${b.n} info(s) ajoutée(s) à la cellule de « ${candidat.nom} ».`);
  }
  return (
    <div className="rg-ranger">
      {!items && (
        <span className="rg-ranger__btns">
          <button type="button" className="cat-link" disabled={busy} onClick={() => extraire("produits")} title="Les produits proposés dans cette réponse deviennent des cellules (≈ 1 centime ChatGPT)">
            ▦ Ajouter à la grille
          </button>
          {candidat && (
            <button type="button" className="cat-link" disabled={busy} onClick={() => extraire("piste")} title={candidat.projet ? "Concurrents, prix, mots des clients, risques… rangés dans la cellule et ajoutés aux notes de recherche du projet (≈ 1 centime ChatGPT)" : "Concurrents, prix, mots des clients, risques… rangés dans la cellule de ce produit (≈ 1 centime ChatGPT)"}>
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
            <button type="button" className="cat-btn" disabled={!coches.length || busy} onClick={valider}>
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
