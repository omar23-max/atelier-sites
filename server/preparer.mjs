// « Préparer » une étape des Fondations (lot 2 du plan, 2026-11-25).
// L'agent prévu pour l'étape (consigne Whitelabeler, ou méthode intégrée)
// tourne sur ChatGPT en MODE PRÉPARATION : toute sa méthode d'un coup, avec
// le projet en contexte, sans questions. Son travail complet est gardé comme
// rapport ; ses propositions arrivent en brouillon (encadré « Propositions des
// agents ») ; pistes de mécanisme et angles s'ajoutent comme pistes non choisies.
// La consigne de rédaction reste riche (décision de l'utilisateur) : les
// garde-fous sont en aval (registre, contrôle des affirmations, validation).
//   GET  /api/preparer/<projet>                 → état + derniers lancements
//   POST /api/preparer/<projet> { etape, web }  → lance en tâche de fond
//   GET  /api/preparer/<projet>/rapport/<fichier>
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MODEL = "gpt-5.5";

const METHODE_RECHERCHE = `Tu es un spécialiste de la recherche client en marketing direct (méthode « market research » : micro-niche, douleur exprimée, désir profond, langage exact des clients, objections, déclencheurs d'achat). Ton travail nourrit ensuite des pages de vente et des pubs : il doit être vivant, concret, incarné, avec les mots qui feront réagir.
Tu t'appuies d'abord sur les vrais mots des clients (avis Amazon, Reddit, commentaires collés par l'utilisateur), puis sur les rapports des agents et les observations de concurrents (à présenter comme telles).`;

const METHODE_MECANISME = `Tu es un copywriter direct response formé à la méthode Jeffrey Park et Arsh (mécanisme unique). Un mécanisme unique relie deux parties :
- UMP (mécanisme du problème) : la vraie cause, que le client ignore, de l'échec de ce qu'il a essayé ; ce n'est pas sa faute.
- UMS (mécanisme de la solution) : pourquoi CE produit agit là où le reste a échoué.
Il doit être crédible, explicable en une phrase, mémorable (un nom), et démontrable : chaque piste dit quelles preuves il faudrait pour l'affirmer, et ce qu'on ne peut pas dire tant qu'on ne les a pas. Propose 3 pistes vraiment différentes, ancrées dans la recherche client du projet.`;

const ETAPES = {
  produit: {
    titre: "Produit et clients",
    agent: "shopfunnels-ai-product-research-analyst",
    agentNom: "AI Product Research Analyst",
    schema: `{"propositions":[{"champ":"role|usage|qui|douleur|echec","texte":"…","source":"fiche|rapport|Amazon|Reddit|[WH]|[Web]|déduction"}]}`,
    consigneSortie: "Propose pour chaque champ 1 à 3 formulations fortes et précises (ce que fait le produit en une phrase, comment on l'utilise, qui achète, le problème principal, pourquoi le reste a échoué).",
  },
  recherche: {
    titre: "Recherche client",
    methode: METHODE_RECHERCHE,
    agentNom: "Synthèse client (méthode market research)",
    schema: `{"propositions":[{"champ":"resultats.avatars|resultats.douleurs|resultats.mots|resultats.objections|curiosite|aggravation|echec","texte":"…","source":"Amazon|Reddit|rapport|[WH]|[Web]|déduction"}]}`,
    consigneSortie: "Avatars (3 à 4, incarnés), douleurs (5 à 10, avec les mots qui piquent), mots des clients (citations EXACTES tirées des avis ou commentaires collés, avec leur source ; aucune citation inventée, et une accroche de pub n'est pas un mot de client), objections (5 à 8, chacune avec sa réponse), et si les sources le permettent : curiosité (solution inhabituelle ou ancienne) et aggravation (ce qui a aggravé le problème).",
    sourcesLongues: true,
  },
  offre: {
    titre: "Offre",
    agent: "shopfunnels-ai-offer-builder",
    agentNom: "AI Offer Builder",
    schema: `{"propositions":[{"champ":"offre.promesse|offre.cible|offre.prix|offre.packs|offre.garantie|offre.bonus|offre.urgence|offre.angles|offre.objections","texte":"…","source":"…"}],
 "fiche":{"devise":"CAD|USD|EUR|GBP","unite":"…","packs":[{"nom":"…","quantite":1,"offertes":0,"prix":0,"prixBarre":null,"populaire":false}],"garantie":{"duree":30,"unite":"jours|mois","conditions":"…"},"retours":{"duree":30,"unite":"jours|mois","conditions":"…"},"livraison":{"texte":"…","seuilGratuit":null},"bonus":[{"nom":"…","valeur":"…"}],"leviers":{"resultat":{"obstacle":"…","reponse":"…","preuve":"…"},"confiance":{"obstacle":"…","reponse":"…","preuve":"…"},"delai":{"obstacle":"…","reponse":"…","preuve":"…"},"effort":{"obstacle":"…","reponse":"…","preuve":"…"}}}}`,
    consigneSortie: "Déroule tes 7 composantes et propose une offre irrésistible complète : promesse, cible, prix et packs (cohérents avec le coût et les prix du marché si connus), garantie tenable, bonus réellement livrables, urgence honnête, angles de vente (un par ligne), réponses aux objections. Pour chaque champ texte, 1 à 3 options. Remplis aussi la fiche d'offre chiffrée « fiche » avec TA meilleure offre (devise du marché visé, packs avec quantités et prix en nombres, garantie et retours tenables et cohérents : la garantie ne dépasse pas la fenêtre de retour, livraison, bonus, et les 4 leviers de valeur Hormozi). Dans « preuve » des leviers, cite seulement une preuve du projet ; sinon écris [MANQUE].",
  },
  mecanisme: {
    titre: "Mécanisme",
    methode: METHODE_MECANISME,
    agentNom: "Méthode Jeffrey + Arsh",
    schema: `{"mecanismes":[{"nom":"…","ump":"…","ums":"…","croyance":"…","preuvesNecessaires":"…","limites":"…","interdits":"…"}]}`,
    consigneSortie: "3 pistes de mécanisme, chacune avec un nom accrocheur.",
    sourcesLongues: true,
  },
  message: {
    titre: "Message central",
    agent: "shopfunnels-master-advertising-copywriter",
    agentNom: "Master Advertising Copywriter",
    schema: `{"propositions":[{"champ":"message.promesse|message.mecanisme|message.objection|resultats.promesse","texte":"…"}]}`,
    consigneSortie: "Formule le message central du projet : 2 ou 3 promesses principales puissantes, la façon d'expliquer le mécanisme choisi (ou la meilleure piste) en une ou deux phrases, et les 3 objections principales avec leur réponse (format « objection → réponse »).",
  },
  angles: {
    titre: "Angles",
    agent: "shopfunnels-master-advertising-copywriter",
    agentNom: "Master Advertising Copywriter",
    schema: `{"angles":[{"titre":"…","lentille":"douleur|désir|identité|mécanisme|preuve|curiosité|cadeau|autre","avatar":"…","douleur":"…","promesse":"…","pageType":"landing|advertorial|listicle|produit|offre"}]}`,
    consigneSortie: "Propose 5 à 8 angles vraiment différents (avatar, douleur ou désir, promesse, lentille), chacun avec une accroche qui donne envie de lire.",
  },
};

const PREPARATION = (schema, consigneSortie) => `
---
MODE PRÉPARATION AUTOMATIQUE (prime sur ta consigne en cas de conflit)
- Tu tournes dans l'atelier de l'utilisateur, sans conversation : tu ne poses AUCUNE question et n'attends aucune validation. Tu déroules toute ta méthode d'un coup, avec les informations du projet ci-dessous ; quand il en manque, fais une hypothèse prudente et dis-le.
- Rédige en français (Québec), en tutoyant, avec toute la richesse et la force de persuasion de ta méthode.
- ${consigneSortie}
- N'invente jamais de preuve, d'avis, de chiffre, de certification ou de résultat pour le produit de l'utilisateur ; une observation sur un concurrent n'est pas une preuve pour lui.
- Commence par ton travail complet, en Markdown (il est gardé comme rapport et relu par l'utilisateur).
- Termine par un bloc \`\`\`json contenant exactement : ${schema}`;

const lireJson = async (f, d) => {
  try {
    return JSON.parse(await readFile(f, "utf8"));
  } catch {
    return d;
  }
};
const enCours = new Map(); // projet → { etape, depuis }

// Sources longues (recherche client, mécanisme) : rapports complets du produit lancé + avis collés.
async function sourcesProduit(root, projet) {
  const { listerCandidats, listerRapports } = await import("./candidats.mjs");
  const c = (await listerCandidats(root)).find((x) => x.lance === projet);
  if (!c) return "";
  let out = "";
  for (const x of [...(c.collages ?? [])].reverse()) out += `\n— ${x.type === "descriptif" ? `Descriptif ${x.source}` : x.source} (collé par l'utilisateur) :\n${x.texte}\n`;
  for (const r of await listerRapports(root, c.id)) {
    const t = await readFile(join(root, "agents", "rapports", c.id, r.fichier), "utf8").catch(() => "");
    out += `\n===== Rapport ${r.agent} (${String(r.le ?? "").slice(0, 10)}) =====\n${t}\n`;
  }
  return out.slice(0, 60000);
}

async function lancer(root, projet, etape, web) {
  const E = ETAPES[etape];
  const dir = join(root, "projets-rapports", projet);
  const le = new Date().toISOString();
  const journal = join(dir, "_preparations.json");
  try {
    await mkdir(dir, { recursive: true });
    // Trace durable : après un redémarrage, ce lancement apparaîtra « interrompu ».
    const j0 = await lireJson(journal, []);
    j0.unshift({ etape, le, enCours: true });
    await writeFile(journal, JSON.stringify(j0.slice(0, 50), null, 1));
    const { loadEnv } = await import("vite");
    const env = loadEnv("development", root, "");
    if (!env.OPENAI_API_KEY) throw new Error("Clé OpenAI absente (OPENAI_API_KEY).");
    const p = JSON.parse(await readFile(join(root, "projets", `${projet}.json`), "utf8"));
    const { contexteProjet } = await import("../src/engine/contexte-projet.js");
    let base = E.methode ?? "";
    if (E.agent) {
      const ag = join(root, "agents", "whitelabeler");
      const f = existsSync(join(ag, "consignes-propres", `${E.agent}.txt`)) ? join(ag, "consignes-propres", `${E.agent}.txt`) : join(ag, "consignes", `${E.agent}.txt`);
      base = await readFile(f, "utf8");
    }
    const instructions = base + PREPARATION(E.schema, E.consigneSortie);
    const sources = E.sourcesLongues ? await sourcesProduit(root, projet) : "";
    const input = `${contexteProjet(p, { limite: 18000 }).texte}${sources ? `\n\n---\nSOURCES DE RECHERCHE (avis collés par l'utilisateur, rapports des agents de la Recherche : observations, pas des preuves)\n${sources}` : ""}`;
    const tools = [];
    if (web) tools.push({ type: "web_search" });
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, instructions, input, ...(tools.length ? { tools } : {}) }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`OpenAI (${res.status}) : ${String(body.error?.message ?? "erreur").slice(0, 300)}`);
    const texte = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((x) => x.text ?? "").join("");
    if (!texte.trim()) throw new Error("Réponse vide de l'IA.");
    // Bloc JSON final ; le reste est le rapport.
    const bloc = [...texte.matchAll(/```json\s*([\s\S]*?)```/g)].pop();
    let data = {};
    let lu = false;
    try {
      data = bloc ? JSON.parse(bloc[1]) : {};
      lu = Boolean(bloc) && data && typeof data === "object";
    } catch {}
    if (!data || typeof data !== "object") data = {};
    const rapport = (bloc ? texte.slice(0, bloc.index) : texte).trim();
    // Réponse brute gardée telle quelle (propositions comprises), pour retraiter sans repayer.
    await writeFile(join(dir, `${le.slice(0, 19).replace(/:/g, "-")}-${etape}.brut.txt`), texte, "utf8");
    const fichier = `${le.slice(0, 19).replace(/:/g, "-")}-${etape}.md`;
    await writeFile(join(dir, fichier), `# ${E.titre} — préparé par ${E.agentNom}\n\nRapport complet, ${le.slice(0, 10)} · ChatGPT${web ? " · recherche web" : ""}\nPropositions : à trier dans les Fondations. Observations et hypothèses de l'IA, pas des preuves.\n\n---\n\n${rapport}\n`, "utf8");
    // Rangement : propositions en brouillon ; pistes et angles ajoutés non choisis.
    const { ajouterBrouillons } = await import("./brouillons.mjs");
    const { muterProjet } = await import("./commun.mjs");
    const origine = { type: "preparer", etape, agent: E.agentNom, rapport: fichier, le };
    let n = 0;
    const sourceDe = (s = "") => (/WH/.test(s) ? "WH" : /Web/i.test(s) ? "Web" : /Amazon/i.test(s) ? "Amazon" : /Reddit/i.test(s) ? "Reddit" : "Est");
    if (data.fiche && typeof data.fiche === "object" && etape === "offre") {
      const { resumeFiche, LEVIERS } = await import("../src/engine/offre-fiche.js");
      const f = data.fiche;
      f.bonus = (Array.isArray(f.bonus) ? f.bonus : []).filter((x) => x?.nom).map((x, i) => ({ id: `bo${Date.now().toString(36)}${i}`, nom: String(x.nom), valeur: x.valeur ?? "", livre: false }));
      f.packs = (Array.isArray(f.packs) ? f.packs : []).filter((x) => x && (x.nom || x.quantite)).map((x, i) => ({ id: `pk${Date.now().toString(36)}${i}`, nom: x.nom ?? "", quantite: x.quantite ?? "", offertes: x.offertes ?? "", prix: x.prix ?? "", prixBarre: x.prixBarre ?? "", populaire: Boolean(x.populaire) }));
      const resume = [
        "Fiche d'offre proposée (ajoutée seulement dans les cases encore vides de ta fiche) :",
        resumeFiche(f) || "(pas de packs chiffrés)",
        f.retours?.duree ? `Retours : ${f.retours.duree} ${f.retours.unite ?? "jours"}${f.retours.conditions ? ` (${f.retours.conditions})` : ""}` : "",
        f.bonus.length ? `Bonus proposés (à confirmer : livrables ?) : ${f.bonus.map((b) => b.nom).join(", ")}` : "",
        ...LEVIERS.map(([k, l]) => (f.leviers?.[k]?.reponse ? `${l} : ${f.leviers[k].reponse}` : "")),
      ].filter(Boolean).join("\n");
      n += await ajouterBrouillons(projet, [{ champ: "offreFiche", texte: resume, valeur: f, agent: E.agentNom, source: "Est" }], origine);
    }
    if (Array.isArray(data.propositions)) n += await ajouterBrouillons(projet, data.propositions.filter((x) => x && typeof x === "object" && x.texte).map((x) => ({ ...x, agent: E.agentNom, source: sourceDe(String(x.source ?? "")) })), origine);
    await muterProjet(projet, (pj) => {
      pj.fondations = pj.fondations ?? {};
      if (Array.isArray(data.mecanismes)) {
        const l = pj.fondations.mecanismes ?? [];
        for (const [i, m] of data.mecanismes.slice(0, 5).entries()) {
          if (!m?.nom) continue;
          l.push({ id: `m-${Date.now().toString(36)}${i}`, nom: String(m.nom).slice(0, 120), ump: m.ump ?? "", ums: m.ums ?? "", croyance: m.croyance ?? "", preuvesNecessaires: m.preuvesNecessaires ?? "", limites: m.limites ?? "", interdits: m.interdits ?? "", statut: "hypothese", origine: `${E.agentNom} (Préparer, ${le.slice(0, 10)})` });
          n++;
        }
        pj.fondations.mecanismes = l;
      }
      if (Array.isArray(data.angles)) {
        const l = pj.angles ?? [];
        for (const [i, a] of data.angles.slice(0, 10).entries()) {
          if (!a?.titre) continue;
          l.push({ id: `angle-${Date.now().toString(36)}${i}`, titre: String(a.titre).slice(0, 120), lentille: a.lentille ?? "", avatar: a.avatar ?? "", douleur: a.douleur ?? "", promesse: a.promesse ?? "", pageType: a.pageType ?? "landing", choisi: false, origine: { agent: E.agentNom, le } });
          n++;
        }
        pj.angles = l;
      }
      // Le rapport rejoint les « Rapports complets des agents » des Fondations.
      pj.fondations.reponses = pj.fondations.reponses ?? {};
      pj.fondations.reponses.rapportsAgents = [...(pj.fondations.reponses.rapportsAgents ?? []), { id: `r-${projet}-${fichier}`.slice(0, 150), projet, fichier, agent: `${E.agentNom} (${E.titre})`, le }];
    });
    const u = body.usage ?? {};
    const j = (await lireJson(journal, [])).filter((x) => !(x.le === le && x.enCours));
    j.unshift({ etape, le, n, fichier, tokens: { entree: u.input_tokens ?? 0, sortie: u.output_tokens ?? 0 }, web: Boolean(web), sansJson: !lu });
    await writeFile(journal, JSON.stringify(j.slice(0, 50), null, 1));
  } catch (e) {
    const j = (await lireJson(journal, [])).filter((x) => !(x.le === le && x.enCours));
    j.unshift({ etape, le, erreur: String(e.message).slice(0, 300) });
    await writeFile(journal, JSON.stringify(j.slice(0, 50), null, 1)).catch(() => {});
  } finally {
    enCours.delete(projet);
  }
}

export async function preparerRoute(req, res, parts, { root, readBody, json }) {
  const projet = parts[1];
  if (!/^[a-z0-9][a-z0-9-]{1,90}$/.test(projet ?? "") || !existsSync(join(root, "projets", `${projet}.json`))) return json(res, 404, { error: "Projet introuvable." });
  const dir = join(root, "projets-rapports", projet);
  if (req.method === "GET" && parts[2] === "rapport") {
    if (!/^[0-9T-]+-[a-z]+\.md$/.test(parts[3] ?? "") || !existsSync(join(dir, parts[3]))) return json(res, 404, { error: "Rapport introuvable." });
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", ...(new URL(req.url, "http://x").searchParams.has("telecharger") ? { "Content-Disposition": `attachment; filename="${parts[3]}"` } : {}) });
    return res.end(await readFile(join(dir, parts[3]), "utf8"));
  }
  if (req.method === "GET") {
    const prix = (await lireJson(join(root, "couts", "prix.json"), {}))[MODEL];
    const actif = enCours.get(projet);
    const j = (await lireJson(join(dir, "_preparations.json"), [])).map((x) => (x.enCours && !(actif && actif.etape === x.etape) ? { etape: x.etape, le: x.le, erreur: "Préparation interrompue (serveur redémarré) : relance-la." } : x)).filter((x) => !x.enCours).map((x) => (x.tokens && prix?.entree != null && prix?.sortie != null ? { ...x, dollars: Math.round(((x.tokens.entree * prix.entree + x.tokens.sortie * prix.sortie) / 1e6) * 100) / 100 } : x));
    return json(res, 200, { enCours: enCours.get(projet) ?? null, derniers: j, etapes: Object.fromEntries(Object.entries(ETAPES).map(([k, v]) => [k, { titre: v.titre, agent: v.agentNom }])) });
  }
  if (req.method !== "POST") return json(res, 405, { error: "Méthode refusée." });
  const b = (await readBody(req).catch(() => ({}))) || {};
  if (!ETAPES[b.etape]) return json(res, 400, { error: "Étape inconnue." });
  if (enCours.has(projet)) return json(res, 409, { error: `Une préparation tourne déjà (${ETAPES[enCours.get(projet).etape].titre}).` });
  enCours.set(projet, { etape: b.etape, depuis: new Date().toISOString() });
  lancer(root, projet, b.etape, b.web === true).catch(() => {});
  return json(res, 202, { ok: true });
}
