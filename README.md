# Atelier sites

Atelier perso pour reconstruire fidèlement les sections de sites existants,
composer des pages dans Puck, puis les exporter vers un thème Shopify.

Règle d'or : on part **toujours d'un site réel**. L'IA découpe, traduit et
vérifie ; elle n'invente pas le design. Les textes, photos et marque du site
d'origine sont toujours remplacés.

## Lancer l'atelier

```bash
npm run dev
```

Puis ouvrir http://localhost:5180. Sections à gauche (glisser dans la page),
aperçu au centre, réglages de la section sélectionnée à droite.
La barre du haut permet de choisir la page ou d'en créer une nouvelle.
« Publish » enregistre la page dans `pages/<nom>.json` : c'est ce fichier que
lisent l'export HTML et l'export Shopify.

## Designs (fichiers design.md)

Chaque site importé donne un fichier `designs/<site>-design.md` : ambiance,
polices, couleurs par rôle, formes, et un bloc de jetons que l'atelier applique.
Dans l'atelier, la barre du haut affiche le design de la page ;
« Appliquer un autre design.md » ouvre le catalogue des designs. Appliquer un
design change les polices et les couleurs de toutes les sections de la page
(copie de sécurité dans `pages/_historique/` avant chaque application).

## Catalogue

http://localhost:5180/catalogue.html (ou « Catalogue » dans la barre de
l'atelier) : les **Sections** et les **Designs**. Côté sections :

- toutes les sections par famille, avec miniature, recherche et aperçu en
  direct (ordinateur / mobile) ;
- **Masquer** : la section n'est plus proposée dans l'atelier (les pages qui
  l'utilisent l'affichent toujours) ;
- **Supprimer** : la section part dans `corbeille/` et reste restaurable ;
- **Enrichir le catalogue** : 4 façons (captures d'écran, site web,
  bibliothèque de sections, génération IA). Chaque demande est enregistrée dans
  `demandes/` ; on la traite avec Claude (« traite les demandes du catalogue »,
  voir [docs/TRAITER-DEMANDES.md](docs/TRAITER-DEMANDES.md)).

## Ajouter des sections à une page

- **« + Ajouter une section »** (en haut) : choisir une famille (FAQ, Témoignages,
  Comparatif…), puis un modèle. La section s'ajoute après la section
  sélectionnée, ou à la fin de la page.
- Ou glisser une miniature depuis la colonne de gauche, rangée par famille.

Les familles sont définies dans `src/engine/families.js` ; chaque section
déclare la sienne dans `meta.json` (`"family"`). Une famille vide s'affiche en
grisé : c'est une famille à compléter par un import.

## Miniatures

```bash
npm run thumbs
```

Génère `sections/<id>/thumbnail.png` pour chaque section (ou
`npm run thumbs -- <id>` pour une seule). À relancer après chaque nouvelle
section ou modification visuelle.

## Importer une page existante

```bash
npm run capture -- https://exemple.com/ exemple-home
```

Ouvre la page dans Microsoft Edge (en local, sans fenêtre), et enregistre dans
`imports/exemple-home/` : captures desktop et mobile, capture de chaque section,
HTML de référence et styles réellement mesurés (`capture.json`).

On reconstruit ensuite les sections dans `sections/` et on compose la page dans
`pages/exemple-home.json`. Pour l'ouvrir dans l'atelier :
http://localhost:5180/?page=exemple-home

## Comparer avec l'original

```bash
npm run compare -- exemple-home exemple-home
```

Crée `imports/exemple-home/compare-desktop.png` et `compare-mobile.png` :
original à gauche, reconstruction à droite.

## Export HTML

```bash
npm run render -- exemple-home
```

Crée `export/html/exemple-home.html`, une page autonome.

## Où sont les choses

| Dossier | Contenu |
|---|---|
| `sections/<id>/` | Une section : `schema.json`, `template.liquid`, `style.css`, `meta.json`. Voir [docs/FORMAT-SECTION.md](docs/FORMAT-SECTION.md). |
| `src/engine/` | Le moteur : chargement des sections, aperçu Liquid, traduction en champs Puck, règles Shopify. |

## Feuille de route

0. ✅ Fondations : Puck, format de section, 2 sections test, export Shopify
1. 🔶 Import fidèle : capture + comparaison en place, 1re page reconstruite
   (nutraboost-us.com). Reste : automatiser la reconstruction des sections.
2. Éditeur : projets, aperçu mobile, images et vidéos
3. Librairie : rangement par type et site d'origine, miniatures
4. Kit de marque : `design.md`, logos, polices
5. Export Shopify complet : zones boutique, envoi vers une copie du thème
6. Créatives : images du site source + ton produit (Nanobanana)
7. « Remplacer par mon produit »

## Sauvegarde sur GitHub

Dépôt **privé** : https://github.com/omar23-max/atelier-sites (doit rester privé :
les miniatures des sections montrent les photos des sites d'inspiration).

- **Automatique** : la tâche Windows « Atelier - sauvegarde GitHub » lance
  `scripts/sauvegarde-github.vbs` toutes les 15 minutes. S'il y a des
  changements, une version « Sauvegarde automatique — date » est créée et
  envoyée ; sinon rien. Hors ligne, la version part au passage suivant.
- **À la main** : `npm run sauvegarde`.
- **Journal** : `.git/sauvegarde.log`.
- **Arrêter** : `schtasks /Change /TN "Atelier - sauvegarde GitHub" /DISABLE`
  (`/ENABLE` pour relancer).
- Jamais envoyés (`.gitignore`) : imports/, videos/, medias/, demandes/,
  corbeille/, export/, node_modules/.
