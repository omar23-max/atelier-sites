// Projets et templates, partagés par l'atelier et le catalogue.
//
// Projet : un produit ou une gamme qu'on lance (projets/<id>.json). Ses pages
// (accueil, page produit, landings, à propos…) portent `root.props.projet`.
// Template : un site ou une page importé (imports/<nom>/) ; sa page « mirror »
// sert de point de départ aux pages des projets.
import { pageTypeById } from "./engine/page-types.js";

export const slug = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const NAME = /^[a-z0-9][a-z0-9-]*$/;

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erreur");
  return data;
}

export const listPages = () => api("GET", "/api/pages?details=1");
export const listProjects = () => api("GET", "/api/projects");
export const listTemplates = () => api("GET", "/api/templates");
export const listMedias = (page) => api("GET", `/api/medias/${page}`);
export const getPage = (name) => api("GET", `/api/pages/${name}`);

// Nouveau produit d'un projet : ses pages prennent le nouveau nom (produit et
// titre « Produit — Type — angle »). Un titre retouché à la main garde sa fin :
// seul l'ancien nom du produit, en tête, est remplacé. Renvoie le nombre de pages.
export async function renameProductInPages(names, oldProduit, newProduit) {
  let n = 0;
  for (const name of names) {
    const page = await getPage(name);
    const props = page.root?.props ?? {};
    const type = pageTypeById[props.pageType];
    const built = [newProduit, type?.label, props.profil].filter(Boolean).join(" — ");
    const title = String(props.title ?? "");
    const nextTitle = oldProduit && title.startsWith(oldProduit) ? newProduit + title.slice(oldProduit.length) : built;
    page.root = { ...page.root, props: { ...props, produit: newProduit, title: nextTitle } };
    await api("PUT", `/api/pages/${name}`, page);
    n++;
  }
  return n;
}
// Une page reliée à un angle prend son nom comme profil, et son titre
// « Produit — Type — angle » suit (la fin d'un titre retouché est remplacée
// seulement si elle était l'ancien profil).
export async function setPageProfile(name, profil) {
  const page = await getPage(name);
  const props = page.root?.props ?? {};
  if (props.profil === profil) return false;
  const old = String(props.profil ?? "");
  const title = String(props.title ?? "");
  const built = [props.produit, pageTypeById[props.pageType]?.label, profil].filter(Boolean).join(" — ");
  const nextTitle = old && title.endsWith(old) ? title.slice(0, title.length - old.length) + profil : built;
  page.root = { ...page.root, props: { ...props, profil, title: nextTitle } };
  await api("PUT", `/api/pages/${name}`, page);
  return true;
}
export const saveProject = (project) => api("PUT", `/api/projects/${project.id}`, project);

// Crée une page. source = nom d'une page à copier (page d'un projet ou page
// mirror d'un template) : mêmes sections, même design, même import d'origine.
// Empreinte du contenu d'une page : sert à savoir si elle a été modifiée dans
// l'éditeur depuis sa création (ou depuis le dernier changement d'origine).
export function empreinte(content = []) {
  const s = JSON.stringify(content ?? []);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${s.length}-${(h >>> 0).toString(36)}`;
}

// Origine d'une page (2026-11-08) : root.props.origine = { type: "vide" |
// "template" | "page" | "lien", source, url, le, empreinte }.
export async function createPage({ name, projet = "", produit = "", pageType, profil = "", pageAchat = "", source = "", origine = null }, existing = []) {
  if (!pageType) throw new Error("Choisis le type de page.");
  if (!projet) throw new Error("Une page appartient toujours à un projet : choisis-le ou crée-le.");
  if (!NAME.test(name)) throw new Error("Nom de page invalide : minuscules, chiffres et tirets.");
  if (existing.some((p) => p.name === name)) throw new Error(`La page « ${name} » existe déjà.`);
  let page = { root: { props: {} }, content: [] };
  if (source) page = await getPage(source);
  const type = pageTypeById[pageType];
  page.root = {
    ...page.root,
    props: {
      ...page.root?.props,
      title: [produit, type.label, profil].filter(Boolean).join(" — "),
      pageType,
      projet,
      produit,
      profil,
      pageAchat: type.achat ? "" : pageAchat,
      ...(origine ? { origine: { ...origine, le: new Date().toISOString(), empreinte: empreinte(page.content) } } : {}),
    },
  };
  await api("PUT", `/api/pages/${name}`, page);
  return name;
}

// Changer l'origine d'une page : son contenu est remplacé (copie de sécurité
// avant, dans l'Historique). « template » / « page » : reprend la page source
// (mirrorIntoPage garde titre, projet, produit, type) ; « vide » et « lien » :
// page vidée (le lien est rempli ensuite par la demande d'import).
export async function changePageOrigin(name, { type, source = "", url = "" }) {
  if (type === "template" || type === "page") await mirrorIntoPage(name, source);
  else await api("POST", `/api/pages/${name}/snapshot`).catch(() => {});
  const page = await getPage(name);
  if (type === "vide" || type === "lien") page.content = [];
  page.root = {
    ...page.root,
    props: { ...page.root?.props, origine: { type, source, url, le: new Date().toISOString(), empreinte: empreinte(page.content) } },
  };
  await api("PUT", `/api/pages/${name}`, page);
}

// « Miroring dans la page actuelle » : la page reprend toutes les sections, le
// design et l'import d'origine du template, et garde son projet, son titre,
// son produit et son type. Copie de sécurité avant (Historique).
export async function mirrorIntoPage(name, source) {
  const [page, tpl] = await Promise.all([getPage(name), getPage(source)]);
  const own = page.root?.props ?? {};
  await api("POST", `/api/pages/${name}/snapshot`).catch(() => {});
  const next = {
    ...tpl,
    root: {
      ...tpl.root,
      props: { ...tpl.root?.props, ...Object.fromEntries(["title", "projet", "produit", "profil", "pageType", "pageAchat", "langue"].filter((k) => own[k]).map((k) => [k, own[k]])) },
    },
  };
  await api("PUT", `/api/pages/${name}`, next);
  return next.content?.length ?? 0;
}

// Nom de fichier proposé pour une page de projet.
export const pageNameFor = (projet, pageType, profil) => slug([projet, pageType, profil].filter(Boolean).join(" "));

// Nom libre pour une nouvelle page : « …-landing », sinon « …-landing-2 »,
// « -3 »… (plusieurs pages du même type dans un projet, une par angle).
export function uniquePageName(base, existing = []) {
  const taken = new Set(existing.map((p) => p.name ?? p.info?.name));
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
}

// Corbeille commune : kind = pages, projets, designs, templates, demandes.
export const trashItem = (kind, id) => api("POST", `/api/corbeille/${kind}/${id}`);
export const listBin = () => api("GET", "/api/corbeille");
export const restoreBin = (kind, entry) => api("POST", `/api/corbeille/${kind}/${entry}/restore`);

// Message d'alerte avant de supprimer, avec ce qui part en même temps.
export function confirmDelete(what, details = []) {
  const lines = [`Supprimer ${what} ?`, "", ...details, "", "Tout part dans la corbeille du catalogue et reste restaurable."];
  return confirm(lines.filter((l, i) => l || i < lines.length - 1).join("\n"));
}
