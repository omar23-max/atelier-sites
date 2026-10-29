# Mise à jour Atelier — Clic droit IA, médiathèque, connecteur Mirror, UI SaaS

Décompresse l'archive à la racine de ton dossier Atelier (elle remplace 5
fichiers et en ajoute 1 : `src/mirror-ui.jsx`). Puis relance `npm run dev`.

## Ce que contient la mise à jour

1. **Clic droit IA** (`src/inspector-ui.jsx`)
   - 4 actions rapides en un clic dans le menu contextuel de la page :
     Raccourcir, Étendre, Plus percutant, Plus émotionnel. Elles passent par
     ton `OPENAI_API_KEY` habituel (`/api/ia/textes`) et sont annulables avec ↶.
   - « Retravailler avec l'IA… » (textes + images) est inchangé.

2. **Sélecteur de médias** (`src/fields-ui.jsx`, `vite.config.js`)
   - Nouvel onglet « Site d'origine » dans « Mes images » : les captures de
     `imports/<slug>/images/` de la page importée. Rapp affiché : à reprendre,
     jamais à publier telles quelles.
   - Nouvelle API locale : `GET /api/medias-origin/<slug>`.

3. **Connecteur Mirror Studio** (`src/mirror-ui.jsx`, `src/App.jsx`)
   - Bouton « ⬆ Mirror » dans la barre du haut, à côté de HTML et Shopify.
   - Envoie la page courante vers ton Mirror Studio hébergé : chaque section
     part en HTML + CSS figé (type `custom`), photos d'origine exclues (comme
     pour l'export HTML), tes images téléversées avec des URL stables.
   - URL et clé sont mémorisées dans le navigateur.

4. **Refonte UI SaaS** (`src/styles.css`, couche de fin)
   - Tokens unifiés (accent indigo, rayons, ombres), topbar, rail, panneaux,
     champs, modales, menu contextuel, scrollbars. Aucune classe existante
     n'est supprimée : c'est une couche de remplacement, facile à retirer.

## Prérequis côté Mirror Studio hébergé (une seule fois)

Le connecteur appelle la mutation `studio.atelierImport`. Sur le serveur de ton
Mirror Studio, définis deux variables d'environnement :

- `ATELIER_SHARED_KEY` — une phrase secrète de ton choix ; c'est la même valeur
  à saisir dans le champ « Clé partagée » du bouton Mirror.
- `ATELIER_OWNER_ID` — l'id numérique de ton compte Kimi (propriétaire des
  projets importés) : c'est la valeur `id` de ta ligne dans la table `users`.

Tant que ces deux variables ne sont pas définies, le bouton Mirror répondra
avec un message d'erreur explicite — rien ne casse.

## Notes

- Ta clé OpenAI reste dans ton `.env.local`, sur ton PC : rien n'est parti
  vers un tiers, et l'archive ne contient aucune clé.
- Les actions IA rapides ne s'affichent que si l'élément visé contient du texte.
- Les images du site d'origine restent marquées « Photo d'origine — à
  remplacer » et sont exclues des exports (comportement inchangé de l'Atelier).
