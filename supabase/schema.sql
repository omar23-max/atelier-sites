-- Base de données de l'atelier (Supabase / PostgreSQL).
-- À coller une fois dans Supabase : SQL Editor → New query → Run.
--
-- Les fichiers du dossier atelier-sites restent la copie de travail (et la
-- sauvegarde GitHub) ; la base en est le miroir en ligne, interrogeable, plus
-- le suivi des ventes. Seul le serveur local de l'atelier écrit dans la base,
-- avec la clé « service_role » (jamais dans le navigateur, jamais sur GitHub).
-- La sécurité par ligne (RLS) est activée sans aucune règle publique : la clé
-- publique « anon » ne peut rien lire ni écrire.

-- ---------- Projets (un produit ou une gamme lancé) ----------
create table if not exists projets (
  id            text primary key,
  nom           text not null,
  produit       text,
  description   text,
  marque        jsonb not null default '{}'::jsonb,   -- logos, palette, polices, brand board, ton
  offre         jsonb not null default '{}'::jsonb,   -- promesse, prix, packs, garantie, angles, objections
  creatives     jsonb not null default '[]'::jsonb,   -- [{ url, format, titre, statut }]
  publication   jsonb not null default '{}'::jsonb,   -- { page: { html, shopify } }
  cree_le       timestamptz,
  ouvert_le     timestamptz,
  supprime_le   timestamptz,                          -- dans la corbeille si renseigné
  maj_le        timestamptz not null default now()
);

-- ---------- Pages ----------
create table if not exists pages (
  id             text primary key,                    -- nom du fichier pages/<id>.json
  projet_id      text references projets(id) on delete set null,
  titre          text,
  type_page      text,                                -- produit, landing, accueil, advertorial, listicle, autre
  profil         text,                                -- client visé
  page_achat     text,                                -- page où l'on achète (pages sans achat)
  design_id      text,
  import_source  text,                                -- template d'origine
  contenu        jsonb not null,                      -- la page complète (format de l'atelier)
  supprime_le    timestamptz,
  maj_le         timestamptz not null default now()
);
create index if not exists pages_projet on pages (projet_id);

-- Copies de sécurité d'une page (pages/_historique/)
create table if not exists pages_historique (
  id        text primary key,                         -- <page>__<date>
  page_id   text not null,
  le        timestamptz,
  contenu   jsonb not null
);
create index if not exists pages_historique_page on pages_historique (page_id, le desc);

-- ---------- Catalogue ----------
create table if not exists sections (
  id          text primary key,
  libelle     text,
  famille     text,
  statut      text,                                   -- visible / masquee
  source_url  text,
  schema      jsonb not null,                         -- schéma Shopify
  meta        jsonb not null,
  template    text not null,                          -- Liquid
  css         text not null,
  miniature   text,                                   -- chemin dans le stockage
  supprime_le timestamptz,
  maj_le      timestamptz not null default now()
);
create index if not exists sections_famille on sections (famille);

create table if not exists designs (
  id          text primary key,
  titre       text,
  source_url  text,
  jetons      jsonb not null,                         -- polices + couleurs par rôle
  markdown    text not null,
  miniature   text,
  supprime_le timestamptz,
  maj_le      timestamptz not null default now()
);

create table if not exists templates (
  id          text primary key,                       -- dossier imports/<id>
  nom         text,
  url         text,
  type_page   text,
  niche       text,
  page_id     text,                                   -- page mirror
  design_id   text,
  sections    jsonb not null default '[]'::jsonb,     -- ids des sections tirées de la page
  vignette    text,
  capture_le  timestamptz,
  supprime_le timestamptz,
  maj_le      timestamptz not null default now()
);

create table if not exists demandes (
  id          text primary key,                       -- dossier demandes/<id>
  type        text not null,
  statut      text not null,
  page_id     text,
  url         text,
  consignes   text,
  details     jsonb not null default '{}'::jsonb,
  resultat    text,
  cree_le     timestamptz,
  maj_le      timestamptz not null default now()
);

-- ---------- Images (créées dans l'atelier, logos, créatives) ----------
-- Les fichiers sont dans le stockage Supabase, bucket « medias » (privé).
-- Jamais les photos d'origine des sites importés.
create table if not exists medias (
  chemin      text primary key,                       -- ex. medias/projet-clearflow/logo.png
  page_id     text,
  projet_id   text,
  taille      bigint,
  type_mime   text,
  maj_le      timestamptz not null default now()
);

-- ---------- Suivi des ventes et des tests ----------
-- Une ligne par page, par jour et par source de trafic.
create table if not exists suivi (
  id            bigint generated always as identity primary key,
  projet_id     text references projets(id) on delete cascade,
  page_id       text,
  jour          date not null,
  source        text not null default 'toutes',      -- meta, tiktok, google, organique…
  depense_pub   numeric(12,2) not null default 0,
  visites       integer not null default 0,
  ajouts_panier integer not null default 0,
  commandes     integer not null default 0,
  chiffre       numeric(12,2) not null default 0,     -- chiffre d'affaires
  notes         text,
  cree_le       timestamptz not null default now(),
  unique (page_id, jour, source)
);
create index if not exists suivi_projet on suivi (projet_id, jour);

-- Indicateurs calculés par page (taux de conversion, panier moyen, ROAS…)
create or replace view suivi_par_page as
select
  projet_id,
  page_id,
  min(jour) as du,
  max(jour) as au,
  sum(depense_pub)   as depense_pub,
  sum(visites)       as visites,
  sum(ajouts_panier) as ajouts_panier,
  sum(commandes)     as commandes,
  sum(chiffre)       as chiffre,
  round(100.0 * sum(commandes) / nullif(sum(visites), 0), 2)       as taux_conversion,
  round(100.0 * sum(ajouts_panier) / nullif(sum(visites), 0), 2)   as taux_ajout_panier,
  round(sum(chiffre) / nullif(sum(commandes), 0), 2)               as panier_moyen,
  round(sum(chiffre) / nullif(sum(depense_pub), 0), 2)             as roas,
  round(sum(depense_pub) / nullif(sum(commandes), 0), 2)           as cout_par_commande
from suivi
group by projet_id, page_id;

-- ---------- Sécurité : aucune lecture ni écriture publique ----------
alter table projets          enable row level security;
alter table pages            enable row level security;
alter table pages_historique enable row level security;
alter table sections         enable row level security;
alter table designs          enable row level security;
alter table templates        enable row level security;
alter table demandes         enable row level security;
alter table medias           enable row level security;
alter table suivi            enable row level security;
alter view  suivi_par_page   set (security_invoker = true);

-- ---------- Stockage des images ----------
insert into storage.buckets (id, name, public)
values ('medias', 'medias', false)
on conflict (id) do nothing;
