# Traiter les demandes du catalogue

Les demandes sont créées depuis le catalogue (http://localhost:5180/catalogue.html,
« Enrichir le catalogue ») et enregistrées dans `demandes/<date>-<type>/` :

- `demande.json` : `type`, `statut` (« en attente », « en cours », « traitée »),
  `famille`, `url`, `sections`, `consignes`, `images`, puis `resultat` une fois traitée ;
- `capture-1.png`… : les captures jointes.

## Règle permanente : tout import va au catalogue

Quel que soit le type de page (page produit, accueil, landing, advertorial,
listicle, à propos…) et quelle que soit la façon d'importer (site, URL d'une
page, captures d'écran, import demandé depuis un projet), chaque import donne
**toujours** les trois :

1. **un template** (Catalogue → Templates) : la page reconstruite entière,
   `imports/<nom>/template.json` + `vignette.png` (voir « Template » plus bas) ;
2. **des sections** (Catalogue → Sections) : chaque section de la page devient
   une section du catalogue, rangée dans sa famille — y compris celles qu'on a
   déjà (une nouvelle variante, jamais un remplacement) ;
3. **un design.md** (Catalogue → Designs) : polices et couleurs du site.

Un import fait pour un projet alimente aussi le catalogue : le projet reçoit sa
copie de la page, le catalogue garde le template et les sections pour les
prochains projets.

## Traiter les demandes

Quand l'utilisateur dit « traite les demandes du catalogue », pour chaque
demande « en attente » (de la plus ancienne à la plus récente) :

1. Passer `statut` à « en cours ».
2. Selon le `type` :
   - **capture** : lire les images, reconstruire la section à l'identique.
   - **capture** depuis « Nouveau projet » ou « Nouvelle page » (`details.page`,
     `details.projet`, `details.siteComplet`) : même chose que ci-dessous, mais
     à partir des captures jointes (pas d'URL) ; template « captures » (voir
     « Template »).
   - **site** depuis « Nouveau projet » (`details.projet`) : reproduire dans ce
     projet. `details.siteComplet` = tout le site (accueil, page produit et les
     autres pages utiles : créer une page du projet par page, avec `projet`,
     `pageType` et `importSource`) ; sinon remplir la page `details.page` déjà
     créée (vide) dans le projet. Chaque import devient aussi un template.
     Design : extraire le `<site>-design.md` (voir plus bas) et l'appliquer aux
     pages créées (`root.props.design`, polices, couleurs par rôle, comme
     « Appliquer » du catalogue). Un projet garde un seul design : si ses autres
     pages en ont déjà un, garder celui-là et le signaler dans `resultat`.
   - **site** : `npm run capture -- <url> <dossier>`, REA pour les comportements
     (onglets, carrousels, sélecteurs), reconstruire les sections demandées
     (`sections` vide ou « toutes » = toutes les sections intéressantes).
   - **bibliotheque** : vérifier la licence (libre/MIT = réutilisable ;
     payant = reprendre la mise en page, pas le code). Si l'accès demande un
     compte, l'utilisateur se connecte lui-même ; ne jamais saisir d'identifiants.
   - **design** : extraire seulement le design.md du site (voir plus bas).
   - **textes** (bouton « ✎ Réécrire les textes » de l'atelier, champ `page`,
     `details` = marque, produit, profil, langue, ton, portée, infos) :
     1. copie de sécurité : `POST /api/pages/<page>/snapshot` (ou copier le
        fichier dans `pages/_historique/`) ;
     2. lire `pages/<page>.json` complété par les valeurs par défaut des
        sections (`normalizeProps`), y compris les blocs ;
     3. remplacer chaque consigne entre crochets (« [ Titre — 3-4 mots ] ») par
        un vrai texte dans la langue demandée, au nombre de mots indiqué, pour ce
        produit et ce profil client, à partir des `infos` uniquement. Portée
        « tout » : réécrire aussi les textes déjà remplis. Ne jamais reprendre le
        texte du site d'origine ; ne pas inventer d'études, de chiffres ou d'avis
        clients absents des infos — laisser alors la consigne et le signaler ;
     4. respecter le type de page (`root.props.pageType`) : une page sans achat
        renvoie vers `pageAchat` ;
     5. enregistrer la page, noter dans `resultat` le nombre de textes écrits et
        les consignes laissées.
   - **images** (bouton « 🖼 Studio d'images », champ `page`, `images` =
     références de l'utilisateur dans l'ordre, `details` = produit, mode
     fidèle/pub, rythme, textes à changer, `references` étiquetées, `cibles`) :
     1. `node scripts/studio.mjs planches demandes/<dossier>` → une planche par
        photo (`planches/<clé>.png` : photo d'origine + références numérotées)
        et `consignes.json` (la consigne de chaque image) ;
     2. pour chaque cible, `mcp__nanobanana__edit_image` avec la planche et sa
        consigne ; regarder le résultat (produit fidèle, aucune trace de la marque
        d'origine), refaire si besoin ; enregistrer l'image retenue dans
        `resultats/<clé>.png`. Rythme « 5 » : s'arrêter après 5 ; « une par
        une » : montrer chaque image à l'utilisateur avant la suivante ;
     3. `node scripts/studio.mjs appliquer demandes/<dossier>` → copie dans
        `medias/<page>/` et pose dans la page (copie de sécurité avant) ;
     4. noter dans `resultat` les images faites et celles à refaire.
     Prérequis : clé Google de Nano Banana avec facturation activée (le palier
     gratuit donne 0 image pour ce modèle).
   - **ia** : concevoir la section d'après la description, en s'appuyant sur la
     référence jointe si elle existe (l'utilisateur n'aime pas les sites
     « générés par IA » : rester sobre et proche des codes des vrais sites).
3. Pour chaque section créée, dans `sections/<id>/` : `schema.json`,
   `template.liquid`, `style.css`, `meta.json` avec `family` (voir
   `src/engine/families.js`), `source` (url, date, note) et `label`. Textes en
   consignes entre crochets (« [ Titre — 3-4 mots ] »), jamais le texte d'origine.
4. Vérifier : `npm run export:shopify` (0 erreur) et, pour un site, une planche
   `npm run compare`. Générer la miniature : `npm run thumbs -- <id>`.
5. Passer `statut` à « traitée » et remplir `resultat` (sections créées, écarts
   connus).

Une section proche d'un modèle existant devient une nouvelle variante dans la
même famille ; elle ne remplace pas l'ancienne.

## Photos d'origine : toujours découpées dans la capture (règle permanente)

Pour chaque import, de site ou de captures d'écran, les photos du site
d'inspiration sont **découpées directement dans la capture**, jamais
téléchargées depuis le site ni générées :

- Site : `npm run capture` mesure la position de chaque photo (images et
  fonds) et les découpe dans une seconde capture pleine page où le texte est
  rendu invisible, pour qu'un fond sorte sans le texte posé dessus. Résultat :
  `imports/<site>/images/NN-KK.png` + `planche-NN.png` (photos numérotées de
  la section NN). Sur un import existant : `node scripts/photos.mjs <site>`.
- Captures d'écran (méthode « capture ») : découper les photos dans l'image
  fournie, dans le même dossier `images/`.
- Associer chaque photo au réglage image de la section dans
  `meta.photosOrigine` (voir docs/FORMAT-SECTION.md), en s'aidant des planches.
- Elles ne servent qu'à l'aperçu : un champ image vide les montre, avec un
  repère orange et « Photo d'origine — à remplacer » à droite. L'utilisateur
  met ses images au moment d'appliquer la section.
- Jamais exportées : l'export Shopify n'envoie aucune image et liste les
  sections à compléter ; l'export HTML (`npm run render`) est refusé tant qu'il
  en reste (`--sans-photos` pour exporter avec ces images vides).

## design.md : à extraire pour chaque site importé

Chaque import de site (type **site**, ou **design** seul) produit aussi
`designs/<nom-du-site>-design.md`, sur le modèle de `designs/aurivita-design.md` :

- Source et date de capture, ambiance, typographie (polices, graisses, tailles
  desktop/mobile, interlettrage), tableau des couleurs par rôle avec l'usage
  observé, formes (grille, rayons, espacements).
- Un bloc ```json``` de jetons : `polices.titres`, `polices.texte`, et
  `couleurs` avec les 13 rôles de `src/engine/design.js` (`ROLES`). Valeurs
  relevées à la pipette sur les captures (`capture.json`, sections/*.png).
- Toute nouvelle section reçoit `designRoles` dans son `meta.json`
  (réglage de couleur → rôle), et ses couleurs fixes passent par des variables
  (`color-mix(...)` sur une variable de la section) pour suivre le design.
- Miniature : `npm run thumbs -- <nom>-design`. La page importée reçoit
  `root.props.design = "<nom>-design"`.

## Template : à créer pour chaque import

Chaque site ou page importé (site, URL d'une page, captures d'écran, import
pour un projet) devient un **template**, visible dans Catalogue → Templates :

- `imports/<nom>/template.json` : `nom`, `pageType` (voir
  `src/engine/page-types.js`), `niche`, `page` (la page mirror dans `pages/`),
  `design` (le design.md extrait), `sections` (les ids des sections du
  catalogue tirées de cette page) ;
- import par **captures d'écran** (pas d'URL) : copier la capture en
  `imports/<nom>/desktop.png` (sert à la vignette), `template.json` avec en plus
  `url: null` et `source: "captures"` ; découper les photos dans la capture ;
- la page mirror porte `root.props.importSource = "<nom>"` (sert aux « textes
  d'origine » des projets) et `pageType` ;
- vignette : `npm run thumbs -- <nom>` → `imports/<nom>/vignette.png`.

Les sections extraites vont dans `sections/`, le design dans `designs/` : le
template les relie par l'URL d'origine.

## Projets

Un projet par produit ou gamme lancé : `projets/<id>.json` (`nom`, `produit`,
`description`, `creeLe`). Ses pages portent `root.props.projet = "<id>"`. Le
catalogue (Projets → un projet) réunit ses pages, ses images d'origine (photos
encore affichées), ses images modifiées (`medias/<page>/`), ses textes
d'origine (capture de l'import) et ses textes corrigés (textes des pages).

## « Synchronise les produits Shopify »

Le sélecteur « Produit Shopify » de la fiche produit lit une copie locale des
produits de la boutique : `shopify/produits.json`. Pour la mettre à jour, via
la connexion Shopify (lecture seule, `graphql_query`) :

```graphql
query { shop { name currencyCode myshopifyDomain }
  products(first: 50, sortKey: UPDATED_AT, reverse: true) { nodes {
    id handle title status
    featuredMedia { preview { image { url } } }
    media(first: 10) { nodes { preview { image { url altText } } } }
    variants(first: 20) { nodes { id title price compareAtPrice image { url } } } } } }
```

Écrire `{ boutique, domaine, devise, misAJourLe, produits: [{ id, handle,
title, status, image, images: [{ url, alt }], variants: [{ id, title, price,
compareAtPrice, image }] }] }`. Paginer si plus de 50 produits.

Dans l'atelier, choisir un produit remplit la section : `product` (handle,
réglage Shopify natif), galerie (images du produit), et un pack par variante
(`variant_id` = id numérique de la variante, prix, prix barré). Dans Shopify,
une galerie vide reprend les images du produit, et chaque pack ajoute sa
variante au panier.

## Fiche projet : marque, créatives, offre, publication

`projets/<id>.json` contient aussi :

- `marque` : `logos` (urls), `palette` (couleurs), `titres` / `texte`
  (polices), `brandBoard` (url), `ton` ; fichiers dans `medias/projet-<id>/` ;
- `creatives` : `[{ url, format: "1:1" | "4:5" | "9:16" | "16:9", titre, statut:
  "à faire" | "prête" | "en ligne" }]` ;
- `offre` : `promesse`, `cible`, `prix`, `packs`, `garantie`, `bonus`,
  `urgence`, `angles`, `objections` ;
- `publication` : `{ <page>: { html: { le }, shopify: { le, theme } } }` —
  l'export HTML est noté par l'atelier ; **après chaque envoi d'une page sur
  Shopify, le noter** : `POST /api/projects/<id>/publication` avec
  `{ page, canal: "shopify", theme }`.

Demandes liées à la fiche :

- **design** avec `details.depuisKitDeMarque` : créer `<projet>-design.md` à
  partir de `marque` (palette → rôles de couleur, polices), puis l'appliquer
  aux pages du projet ;
- **creatives** (`details.formats`, `nombre`, `consigne`) : créer les visuels
  avec Nano Banana à partir des images du projet et du produit, les poser dans
  `medias/projet-<id>/` et les ajouter à `creatives` (statut « prête ») ;
- **offre** : travailler l'offre avec les skills Hormozi (`hormozi-offer`,
  `pricing-strategy`, `offer-angles`, `objection-destroyer`) à partir de la
  fiche, puis remplir `offre`.
