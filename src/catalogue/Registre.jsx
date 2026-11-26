// Registre des faits et preuves (lot 1 du plan, 2026-11-25). Une seule vue
// de ce qui est CONFIRMÉ (faits validés, preuves cochées, offre), de ce que
// les pages ont le droit d'affirmer, de ce qui reste à confirmer, et des
// manques et contradictions. Lecture seule : on corrige dans les étapes.
// Calculé avec les mêmes règles que l'IA et le Page Score (fidelite.js,
// contexte-projet.js, offre-fiche.js), sur le brouillon en cours.
import { useEffect, useState } from "react";
import { CLAIMS, knownClaims } from "../engine/fidelite.js";
import { contexteProjet } from "../engine/contexte-projet.js";
import { controlesFiche, resumeFiche } from "../engine/offre-fiche.js";
import { realText } from "../engine/fondations-etat.js";

const PREUVES_NOMS = { avis: "Avis clients", etude: "Étude ou test clinique", garantie: "Garantie satisfait ou remboursé", certification: "Certification / label", avantApres: "Photos avant / après", video: "Témoignages vidéo", presse: "Presse, médias", expert: "Avis d'un expert, médecin", ventes: "Chiffres de ventes" };
// Mêmes noms que NATURES (Fondations.jsx).
const NATURE = { argent: "Prix, montant", pourcent: "Pourcentage", duree: "Durée", note: "Note (sur 5)", nombre: "Nombre", dose: "Dose, quantité", fois: "Multiplicateur (×)" };
const nature = (n) => NATURE[n] ?? n;
const NOM_PREUVE = { certification: "Certification / label", etude: "Étude ou test clinique", expert: "Avis d'un expert, médecin", presse: "Presse, médias" };

export function RegistreFaits({ project }) {
  const f = project.fondations ?? {};
  const rep = f.reponses ?? {};
  const [ext, setExt] = useState({ validation: null, desaccord: null });
  useEffect(() => {
    let off = false;
    Promise.all([
      fetch(`/api/validation/${project.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/candidats").then((r) => r.json()).catch(() => null),
    ]).then(([v, c]) => {
      if (off) return;
      const prod = (c?.candidats ?? []).find((x) => x.lance === project.id);
      setExt({ validation: v, produit: prod ?? null });
    });
    return () => {
      off = true;
    };
  }, [project.id]);

  const faits = (f.faits ?? []).filter((x) => x && realText(x.valeur));
  const valides = faits.filter((x) => x.etat === "valide");
  // « Retiré » : ni confirmé ni en attente.
  const aConfirmer = faits.filter((x) => !x.etat || x.etat === "a-confirmer");
  const cochees = Object.entries(rep.preuves ?? {}).filter(([, p]) => p?.oui);
  const preuves = cochees.filter(([, p]) => realText(p.detail));
  const preuvesSansDetail = cochees.filter(([, p]) => !realText(p.detail));
  const offreTexte = project.offreFiche ? resumeFiche(project.offreFiche) : "";
  const erreursOffre = project.offreFiche ? controlesFiche(project.offreFiche).filter((c) => c.niveau === "erreur").length : 0;
  const fiche = offreTexte && !erreursOffre ? [{ nature: "Offre commerciale", valeur: offreTexte }] : [];
  const known = knownClaims(project);
  const ctx = contexteProjet(project).data ?? {};
  const manques = [...(ctx.aVerifier ?? [])];
  const controles = project.offreFiche ? controlesFiche(project.offreFiche).filter((c) => c.niveau === "erreur" || c.niveau === "attention") : [];
  const contradictions = [];
  for (const c of controles) contradictions.push(`Offre${c.niveau === "erreur" ? "" : " (à surveiller)"} : ${c.texte}`);
  if (ext.validation?.aRelire?.length) contradictions.push(`Validation produit à refaire : ${ext.validation.aRelire.join(", ")} a changé depuis le verdict.`);
  if (ext.produit?.desaccord) contradictions.push(`Les agents ne sont pas d'accord sur le produit : ${ext.produit.desaccord.map((d) => `${d.titre} : ${d.verdict}`).join(" · ")}.`);
  const nbAtrier = (rep.brouillonsAgents ?? []).filter((b) => b.statut === "proposé").length;
  for (const x of valides) if (!realText(x.source)) manques.unshift(`Fait validé sans source : ${nature(x.nature)} ${x.valeur} ${x.unite ?? ""} (note d'où il vient)`);

  return (
    <section className="cat-panel cat-reg">
      <h3>Registre des faits et preuves</h3>
      <p className="cat-muted">Ce que ton projet peut affirmer, d'où ça vient, et ce qui manque encore. Lecture seule : tu corriges dans les cases plus bas (preuves, faits chiffrés, offre). L'IA et le Page Score suivent exactement ces règles.</p>

      <div className="cat-reg__grille">
        <div>
          <h4>✓ Confirmé ({valides.length + preuves.length + fiche.length})</h4>
          {!valides.length && !preuves.length && !fiche.length && <p className="cat-muted">Rien de confirmé pour l'instant.</p>}
          <ul>
            {preuves.map(([k, p]) => (
              <li key={k}>
                <b>{PREUVES_NOMS[k] ?? k}</b> : {p.detail} <span className="cat-muted">· source : toi</span>
              </li>
            ))}
            {valides.map((x) => (
              <li key={x.id}>
                <b>{nature(x.nature)}</b> : {x.valeur} {x.unite} {x.source ? <span className="cat-muted">· {x.source}</span> : <span className="cat-reg__manque">· source non notée</span>}
              </li>
            ))}
            {fiche.map((x, i) => (
              <li key={`o${i}`}>
                <b>{x.nature}</b> : {x.valeur} {x.unite ?? ""} <span className="cat-muted">· fiche d'offre</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Ce que tes pages ont le droit d'affirmer</h4>
          <ul className="cat-reg__claims">
            {CLAIMS.map((c) => {
              const ok = known.has(c.id);
              return (
                <li key={c.id} className={ok ? "is-ok" : "is-non"}>
                  {ok ? "✓" : "✗"} {c.label}
                  {!ok && <span className="cat-muted"> · {c.preuve ? `coche « ${NOM_PREUVE[c.preuve] ?? PREUVES_NOMS[c.preuve] ?? c.preuve} » avec un détail réel` : "à écrire dans tes Fondations si c'est vrai"}</span>}
                  {ok && c.id === "certification" && known.labels?.size ? <span className="cat-muted"> · {[...known.labels].join(", ")}</span> : null}
                </li>
              );
            })}
          </ul>
          <p className="cat-muted">Chiffres : seuls les faits validés et les chiffres de tes propres textes et de la fiche d'offre sont autorisés. Ce qui vient des concurrents ou des agents n'autorise rien.</p>
        </div>

        <div>
          <h4>À confirmer ({aConfirmer.length + nbAtrier + preuvesSansDetail.length + (erreursOffre ? 1 : 0)})</h4>
          {!aConfirmer.length && !nbAtrier && !preuvesSansDetail.length && !erreursOffre && <p className="cat-muted">Rien en attente.</p>}
          <ul>
            {preuvesSansDetail.map(([k]) => (
              <li key={`p${k}`}>
                <b>{PREUVES_NOMS[k] ?? k}</b> : cochée sans détail <span className="cat-muted">· ne compte pas tant que le détail (combien, où, laquelle) est vide</span>
              </li>
            ))}
            {erreursOffre > 0 && (
              <li>
                <b>Offre commerciale</b> : {erreursOffre} erreur(s) à corriger <span className="cat-muted">· elle ne compte pas comme confirmée avant</span>
              </li>
            )}
            {aConfirmer.map((x) => (
              <li key={x.id}>
                <b>{nature(x.nature)}</b> : {x.valeur} {x.unite} <span className="cat-muted">· {x.source || "source non notée"} · bloqué tant qu'il n'est pas validé</span>
              </li>
            ))}
            {nbAtrier > 0 && (
              <li>
                {nbAtrier} proposition(s) des agents à trier <span className="cat-muted">(encadré « Propositions des agents » en haut)</span>
              </li>
            )}
          </ul>
        </div>

        <div>
          <h4>⚠ Manques et contradictions ({manques.length + contradictions.length})</h4>
          {!manques.length && !contradictions.length && <p className="cat-muted">Aucun repéré.</p>}
          <ul>
            {contradictions.map((x, i) => (
              <li key={`c${i}`} className="cat-reg__contra">
                {x}
              </li>
            ))}
            {manques.slice(0, 25).map((x, i) => (
              <li key={`m${i}`}>{x}</li>
            ))}
            {manques.length > 25 && <li className="cat-muted">… et {manques.length - 25} autre(s)</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
