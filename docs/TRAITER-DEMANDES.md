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

### Chaque section est nommée par sa fonction

Comme Whitelabeler (Header, Testimonials, Social proof, Reviews…), une section
porte le nom de ce qu'elle fait, pas celui du produit : « Hero · Problème —
Derila », « Avis clients — Nooro ». À chaque import, et à chaque section
extraite d'une page pour le catalogue, on l'analyse et on lui donne ce nom :

- les copies de pages sont nommées toutes seules (`scripts/lib/copie.mjs`,
  règles dans `src/engine/fonctions.js`, les mêmes que le Page Score) ;
- pour renommer des sections déjà là : `node scripts/nommer-sections.mjs
  [<copie>]` ;
- si le nom trouvé est faux, on corrige `label` et `fonction` dans le
  `meta.json` à la main.

### Sections Whitelabeler

Les sections ajoutées sur une page Whitelabeler (Section Library, 4 crédits
chacune) se copient depuis la page elle-même, jamais depuis le panneau de la
bibliothèque (aperçus incomplets) :

1. Dans Whitelabeler, l'utilisateur clique **Download HTML** (gratuit) ;
2. on copie le fichier dans `imports/wl-<page>/source.html` ;
3. avec l'atelier ouvert (port 5180) : `node scripts/whitelabeler.mjs
   imports/wl-<page>/source.html` (ou suivi des n° de sections à copier).

Chaque section du fichier porte sa nature (`data-wld-section`) : elle devient
une section du catalogue `wl-<nature>-<n>`, au design identique, rangée dans sa
famille (les « Reasons to buy » vont dans **Listicle (raisons d'acheter)**),
avec ses textes et emplacements d'image comme contenu de départ. Le Page Score
les propose quand la famille manque.

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
   - **site** pour un **advertorial, listicle ou presell** : la page est copiée
     en entier, sans la découper en sections du catalogue :
     1. `npm run advertorial -- <url> <dossier>` (dossier `adv-<marque>`) :
        relève chaque élément dans l'ordre (titres, paragraphes, images,
        listes, boutons) avec ses styles, découpe les photos, et signale une
        page disparue (`advertorial.json` → `disparue: true`) ;
     2. lire la page et écrire `imports/<dossier>/fiche.json` : `nom`,
        `produit`, `marque`, `secteur`, `pageType` (`advertorial` ou
        `listicle`), `ambiance` ;
     3. `npm run advertorial:page -- <dossier>` : page mirror **au design
        identique** (`scripts/lib/copie.mjs`) : la structure HTML d'origine et
        ses styles réels relevés en ordinateur (1440 px) et en mobile (390 px)
        deviennent des sections `<dossier>-p1…pN` (45 emplacements au plus,
        `meta.pageSpecific`, absentes des listes du catalogue) ; chaque texte
        est un emplacement rempli d'un brief de même longueur, chaque photo un
        emplacement image. Plus `template.json` (avec `url`, `produit`,
        `secteur`, `lienProduit`) et `designs/<dossier>-design.md`.
        Couleurs et polices suivent le design.md : chaque couleur d'origine
        qui joue un rôle (fond, texte, accent, bouton…) devient
        `var(--atl-<rôle>)`, réglée par la section (`role_<rôle>`,
        `meta.designRoles`) ; le design.md de la page reprend ces valeurs
        d'origine (l'appliquer ne change rien, en appliquer un autre change tout).
        La page d'origine reste consultable telle quelle : bascule
        « Original / Modifiable » de l'atelier (`/api/original/<dossier>`) ;
     4. `npm run thumbs` pour la vignette. Les adresses google.com/url?q=…
        sont des doublons : décoder `q=` et traiter la page une seule fois.
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
     3 bis. si la page a un projet (`root.props.projet`) dont
        `fondations.message` est rempli, la page **reprend ce message
        central** : même promesse, même mécanisme, les 3 preuves et les 3
        objections traitées, avec les mots de l'angle (`profil`) autour. Une
        page peut ajouter une preuve vérifiée, jamais en contredire une ;
     4. respecter le type de page (`root.props.pageType`) : une page sans achat
        renvoie vers `pageAchat` ;
        **copie au design identique** (sections `<page>-pN`, blocs
        `blocks_element` avec `slot` / `text`) : portée « tout », chaque texte
        d'origine est réécrit pour le produit des `infos`, en suivant
        `details.prompt` (consignes de l'utilisateur), à longueur proche (la
        mise en page en dépend) ; garder les `<span style>` et `<br>` de mise
        en forme autour des mots équivalents ; remplacer toute marque, nom de
        produit ou prix du site d'origine ; ne pas toucher aux blocs image ;
     5. enregistrer la page, noter dans `resultat` le nombre de textes écrits et
        les consignes laissées.
   - **images** (bouton « 🖼 Studio d'images », champ `page`, `images` =
     références de l'utilisateur dans l'ordre (produit puis marque), `details` =
     produit, description, mode fidele/pub (pub : format 1:1 / 4:5 / 9:16,
     accroche, bouton), rythme (tout / 5 / n / une-par-une), textes à changer,
     `references` étiquetées avec leur groupe, `marque` (couleurs et polices du
     design.md), `prixEstime`, `cibles`) :
     1. `node scripts/studio.mjs generer demandes/<dossier>` → chaque image
        avec **gpt-image-2** (OpenAI, `OPENAI_API_KEY` de `.env.local`) : photo
        d'origine + références envoyées comme images séparées, dans
        `resultats/<clé>.png`. Respecte le rythme (tout / 5 / n / une par une ; une
        image déjà faite n'est pas refaite, relancer pour la suite) ;
     2. regarder chaque résultat (produit fidèle, aucune trace de la marque
        d'origine) ; pour en refaire une, supprimer son `resultats/<clé>.png`
        et relancer ; « une par une » : montrer chaque image avant la suivante ;
     3. `node scripts/studio.mjs appliquer demandes/<dossier>` → copie dans
        `medias/<page>/` et pose dans la page (copie de sécurité avant) ; en
        mode pub : rangé dans `medias/<page>/pubs/`, la page ne change pas.
        L'avancement (`progression` de demande.json) s'affiche dans le Studio ;
     4. noter dans `resultat` les images faites et celles à refaire.
     Ancienne voie (si OpenAI indisponible) : `planches` puis
     `mcp__nanobanana__edit_image` avec la planche et sa consigne (clé Google
     avec facturation activée).
   - **ia** : concevoir la section d'après la description, en s'appuyant sur la
     référence jointe si elle existe (l'utilisateur n'aime pas les sites
     « générés par IA » : rester sobre et proche des codes des vrais sites).
3. Pour chaque section créée, dans `sections/<id>/` : `schema.json`,
   `template.liquid`, `style.css`, `meta.json` avec `family` (voir
   `src/engine/families.js`), `source` (url, date, note) et `label`. Textes en
   consignes entre crochets (« [ Titre — 3-4 mots ] »), jamais le texte d'origine.
4. Vérifier, pour un site, avec une planche `npm run compare`. Générer la
   miniature : `npm run thumbs -- <id>`.
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
- Jetons `styles` (vue « Inspecter » du catalogue) : en-tête, h1, sous-titre,
  h2, h3, texte, bouton — police, taille, graisse, interligne, couleur, casse,
  fond et rayon du bouton, relevés sur `snapshot.json` (`scripts/lib/typo.mjs`,
  automatique dans `advertorial-page.mjs`). Pour les anciens design.md :
  `node scripts/designs-styles.mjs [id…]`.

## Couleurs proches d'un rôle (palette qui s'applique vraiment)

Une copie ne relie à un rôle que les couleurs identiques ; les nuances voisines
(gris de texte, bleu des liens, fond d'encadré) deviennent
`var(--atl-<rôle>-p, couleur d'origine)` (`scripts/lib/proche.mjs`, appelé par
`buildCopy`). La section définit `--atl-<rôle>-p` seulement quand la couleur du
rôle a changé : sans nouvelle palette, la copie reste identique au pixel près.
Les couleurs écrites dans les textes (`style="color:…"`) suivent au rendu
(`src/engine/render.js`). Sections anciennes : `node scripts/couleurs-proches.mjs`.

## Accordéons (FAQ, détails produit) dans les copies

- Capture (`advertorial.mjs` → `openAccordions`, en ordinateur, tablette et
  mobile) : les `<details>` sont ouverts et marqués `data-atl-acc="ouvert|ferme"`
  (état sur le site) ; les accordéons en JavaScript (bouton
  `aria-expanded="false"` qui commande un panneau caché, hors en-tête/menu) sont
  cliqués (ouverture forcée au besoin) et marqués `q:<n>` / `r:<n>`.
- Copie (`copie.mjs`) : tout reste **ouvert dans le template** → dans l'atelier
  les réponses sont visibles et modifiables. Un petit script (`ACCORDEONS`, à la
  fin de la section) referme sur la page publiée (partage, HTML, Shopify) les
  `<details>` fermés sur le site, cache les réponses `[data-atl-r]` et les ouvre
  au clic sur leur question `[data-atl-q]`. Sans script (atelier), tout reste visible.
- Les accordéons en JavaScript ne sont repris qu'aux **nouveaux imports**
  (capture nécessaire) ; les `<details>` des copies existantes ont été refaits.

## Carrousels, sliders et vidéos dans les copies

- Capture (`lib/snapshot.mjs` → `mediaOf`, installée dans la page avant le
  relevé) : chaque élément reçoit `video` (`{ src, autoplay, loop, controls }`,
  ou `embed: true` pour YouTube/Vimeo/Wistia/Loom…) et `car` (`track` = piste
  slick/swiper/splide/flickity/glide/embla/owl…, `clone` = copie d'une diapo,
  `prev`/`next` = flèches, `dots` = points).
- Anciennes captures : `node scripts/medias-carrousels.mjs <dossier>|--tous`
  relit `page.html` hors ligne (scripts coupés, rien téléchargé) et retrouve
  chaque élément par sa place, avec un décalage par parent (balises de `<head>`
  repoussées dans `<body>` par l'analyseur, 263 rangs chez Elevate).
- Copie (`copie.mjs`) : les diapos `clone` sont retirées ; la piste (marquée,
  ou reconnue à sa forme : ≥ 3 enfants alignés qui débordent d'un cadre à
  overflow caché) devient `display:flex; overflow-x:auto; scroll-snap`, sans le
  `transform` du script d'origine ; ses diapos gardent leur largeur. Les flèches
  portent `data-atl-car="prev|next"` et le script `CARROUSELS` (page publiée)
  fait défiler la piste la plus proche. Dans l'atelier, la piste défile à la
  molette / au doigt.
- Vidéo : l'image relevée devient l'affiche ; le champ **Lien** de l'élément
  « Vidéo » prend une vidéo (fichier .mp4 → `<video>`, YouTube/Vimeo →
  `<iframe>` en lien embed). La vidéo d'origine est dans `meta.videosOrigine`
  et ne joue **que dans l'aperçu** (`render.js`), comme les photos d'origine :
  jamais écrite dans la page ni exportée.
- Limite : carrousels en fondu dont les diapos inactives sont en
  `display:none` dans les deux formats → seule la diapo visible est reprise.

## Zones de grille nommées

`grid-template-areas` n'est pas relevé : un `grid-area: banner` ne désigne
rien dans la copie et crée une colonne fantôme (hero d'Elevate hors écran).
`copie.mjs` remplace ces noms par la colonne et la ligne réelles de l'élément
parmi ses voisins.

## Sections proposées juste après l'import

`advertorial-page.mjs` calcule le Page Score de la page importée
(`scripts/lib/propositions.mjs` → `src/engine/page-score.js`) : familles de
sections manquantes pour son type de page, pourquoi, où les placer, et 3 modèles
du catalogue par famille. Enregistré dans `template.json` (`propositions`, badge
« Score de vente N · K à ajouter » sur la carte) et sur la page
(`root.props.propositionsImport`) : bandeau violet à la première ouverture,
« Voir et ajouter » ouvre l'outil Score (ajout un par un, tous, ou avec l'IA).

## Contrôle automatique de chaque import (une seule fois)

`advertorial-page.mjs` lance à la fin `scripts/verifier-import.mjs <slug>` :
1. vérificateur maison (score / 100 contre la capture, diff visuel) ;
2. **Copycat seulement si** score < 95 ou plus de 25 % de pixels différents
   (`--copycat` pour forcer) → `imports/<slug>/copycat/compare/REPORT.md` ;
3. résumé dans `template.json` → `verification` (badge « Fidélité N / 100 » sur la
   carte du template).
L'atelier doit tourner (sinon le contrôle est sauté, avec la commande à relancer).
`ATL_SANS_VERIF=1` pour sauter (reconstructions en lot : `_templates-liste.mjs`).

**Pas de re-vérification des pages déjà copiées.** `_verifier-liste.mjs` ne
traite que les pages sans `verification.json` (`--tout` pour forcer). Sur chaque
template, le bouton **« Vérifier si la page originale a changé »** compare
seulement le site en ligne à la capture (~40 s, `verifier-miroir.mjs <slug>
--site` → `controle-site.json`, `template.json` → `controleSite`, badge
« Original inchangé / Petits changements / Original modifié »). Si l'original
a changé et qu'on veut la nouvelle version : réimporter la page.

## Outils de miroir : REA, Copycat, vérificateur maison

Pour tout import ou miroir de page, en plus de la capture maison (`advertorial.mjs`) :

- **Copycat** (skill installé dans `.claude/skills/copycat`, code d'origine de
  minosdevs, copie cnkolongo/copycat-skill) — deuxième capture indépendante et
  comparaison visuelle détaillée. Toujours avec Edge (`--channel msedge`, pas de
  Chromium à télécharger) :
  - capture : `node .claude/skills/copycat/scripts/capture.mjs <url> --out copycat/<slug> --channel msedge`
    → plis d'écran (folds) sur 3 largeurs, crops par section, survols, polices,
    palette, `REPORT.md`. Voit aussi les images chargées tard (photo produit
    du haut de Luma, absente de notre capture).
  - comparaison : `node .claude/skills/copycat/scripts/compare.mjs --original copycat/<slug> --clone http://localhost:5180/partage/<page> --channel msedge`
    → `copycat/<slug>/compare/REPORT.md` : % de pixels par largeur, zones les
    pires reliées aux sections, écarts de typo par balise, animations, meta,
    images, console. On ne s'en sert pas pour reconstruire en HTML statique :
    la copie reste faite par `copie.mjs` (sections Liquid de l'atelier).
  - `copycat/` est dans `.gitignore` (contenu des sites d'inspiration).
- **REA** — quand une capture échoue ou qu'un comportement est caché dans le
  JavaScript du site (packs, carrousels, contenu chargé après clic).
- **Vérificateur maison** (ci-dessous) — score / 100, référence = capture
  enregistrée, détection « le site a changé ».

## Vérifier un miroir en 3 passes

`node scripts/verifier-miroir.mjs <slug> [page]` (ou ⋯ → « Vérifier le miroir »
dans l'atelier) : l'original rendu dans **Edge**, puis dans **Google Chrome**,
puis le **HTML brut** du serveur (sans JavaScript) ; la copie (`/partage/<page>`)
mesurée comme les deux premiers. Compare hauteur, images (par taille, seules les
images réellement visibles : diapositives et vignettes cachées ignorées), titres
et phrases ; ce qui diffère entre Edge et Chrome est instable sur le site.
Rapport : `imports/<slug>/verification.json` (score / 100). Toute la liste :
`node imports/_verifier-liste.mjs`.

- **Référence = la capture enregistrée** (`snapshot.json` + `desktop.png`) : le
  score mesure les défauts de la copie. Le site en ligne est comparé à la
  capture à part (`siteChange`) : sous 80, le site a changé depuis l'import
  (langue selon le pays, page refaite, test A/B) — ce n'est pas un défaut de copie.
- **Comparaison visuelle** : capture d'écran pleine page de la copie contre
  `desktop.png`, diff de pixels dans un canvas (pas de dépendance), % global,
  bandes de 200 px les plus différentes, planche original | copie | différences
  dans `imports/<slug>/compare-copie.png`. Elle voit ce que les mesures de
  texte ne voient pas (ex. : pied de page placé en haut sur Luma — corrigé dans
  `copie.mjs` : un lien « Skip to content » hors écran faisait prendre le body
  pour des colonnes).
- **Limites connues** : `desktop.png` s'arrête à 15 000 px et Chromium répète le
  haut de la page dans une capture plus longue : hauteur de référence = page
  relevée, diff visuel limité aux 15 000 premiers px. Le vérificateur ne
  contrôle que l'ordinateur (1440) : la tablette et le mobile, c'est Copycat
  (Norse : copie à 198 312 px en tablette, la racine `body` prenait la hauteur
  de toute la page dans chaque section — corrigé dans `copie.mjs`, avec la
  colonne unique en pixels de la racine passée en `minmax(0, 1fr)`).
  Capture tablette incomplète (< 50 % des éléments : le site change de
  structure à cette largeur) → ignorée, la tablette prend le style ordinateur
  (Ancestral Supplements : page vide en tablette avant la correction).
  Reconstruire une copie (`advertorial-page.mjs`) garde `verification` et
  `controleSite` du template.

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
- **fondations** (2026-11-06) : phase 0 du projet, une seule fois par produit.
  Le questionnaire est dans `fondations.reponses` (produit, clients, problème,
  `preuves` cochées avec leur détail, concurrents, ton) et l'offre de base
  dans `offre`. Procédure :
  1. `market-research` (Hormozi) et `customer-research` (Corey Haines) :
     avatars, douleurs, **mots exacts des clients**. Lire **d'abord** ce que
     l'utilisateur a collé (`reponses.collecteAmazon`, `collecteReddit`,
     `collecteSocial`, `collecteAutres` ; `collecte` sur les anciens
     projets) et ses liens
     (`reponses.liensRecherche`), puis chercher soi-même, sources dans cet
     ordre : **avis Amazon** du produit et des concurrents (les 1-3 étoiles
     surtout : ce qui déçoit = les objections), **Reddit** (fils où la
     catégorie est discutée), **commentaires Instagram et TikTok** des
     marques et créateurs, puis Trustpilot et les sites. Trustpilot seul ne
     suffit pas. Noter la source de chaque phrase. **Constaté le
     2026-11-06 :** Amazon refuse explicitement les agents IA (« Access
     restricted… unauthorized AI agent ») et Reddit bloque l'accès
     automatique : ne jamais contourner ces refus (pas de clic sur
     « Continue », pas d'astuce). Ces avis viennent de l'utilisateur, collés
     dans « Ce que tu as trouvé toi-même ». Si cette section est vide, le
     dire dans `notes` et lui demander de la remplir ;
     **WinningHunter** (quand l'utilisateur l'aura branché, MCP) : le Brand
     Tracker des concurrents (personas, angles, landings), l'Ad Library
     (pubs de la niche qui montent en puissance, leurs accroches) et la
     recherche produit (marques qui vendent le même produit). Revenus =
     estimations, jamais présentés comme exacts ;
  2. `product-marketing-context` : la synthèse que les pages reliront ;
  3. `hormozi-offer` + `objection-destroyer` : promesse, objections et
     réponses ; `offer-angles` : 8 à 10 pistes d'angles (avatar + douleur +
     promesse + type de page conseillé) ;
  4. écrire `fondations.resultats` : `{ promesse, avatars: [], douleurs: [],
     mots: [], objections: [], angles: [], notes }` (listes de phrases
     courtes), et compléter `offre.promesse`, `offre.cible`,
     `offre.objections` sans écraser ce que l'utilisateur a écrit ;
  5. écrire `fondations.message` (le **message central**, 2026-11-07) :
     `{ promesse, mecanisme, preuves: [3 phrases], objections: [{ objection,
     reponse } ×3] }`. La promesse et le mécanisme en une phrase chacun ; les
     3 preuves les plus fortes, prises **seulement** dans les preuves cochées
     ou dans `offre` ; les 3 objections qui bloquent le plus l'achat, avec une
     réponse tirée des faits. Ne pas écraser un message déjà corrigé par
     l'utilisateur (le compléter seulement) ; ce qui manque est marqué
     « [À VALIDER] » ou « [MANQUE] » ;
  6. laisser `fondations.statut` à « demandée » : c'est l'utilisateur qui
     valide dans l'onglet Fondations.
  **Règle absolue** : aucune preuve, aucun chiffre, aucune garantie ni aucun
  avis qui ne soit coché dans `fondations.reponses.preuves` ou écrit dans
  `offre`. Ce qui manque est signalé dans `notes` (« [MANQUE : nombre
  d'avis] »), jamais inventé.

## Publier sur Shopify : retiré (2026-10-30)

Le bouton « Publier sur Shopify », la demande `shopify`, le script
`export-shopify.mjs` et la colonne « Envoyée à Shopify » de l'onglet Publication
ont été retirés. Le site est maintenant headless : la page vient de l'atelier, et
Shopify ne sert plus qu'aux produits, au panier et au paiement. Restent la liste
des produits (`/api/shopify/products`, liens « Ajouter au panier ») et le moteur
de sections (`src/engine/shopify.js`), dont l'atelier a besoin pour afficher
les pages.

## Espaces et fonds (section, colonne, bloc, page)

- Section **« Espace »** (`sections/espace`, famille *Spacer*) : hauteur
  ordinateur / mobile (0-400 px) et couleur facultative. S'ajoute comme toute
  section (« Ajouter une section » ou catalogue).
- **Fond de la page** : *Réglages de la page* → « Fond de la page »
  (`root.props.fond_page`, `brandCss`). Visible derrière les sections
  transparentes.
- **Fond d'une colonne ou d'une carte** : panneau du groupe → « Fond »
  (`props.fonds_groupes` de la section, « g12=#hex;… »). **Fond d'un bloc**
  (texte, bouton) : son panneau Style → « Fond » (`background-color` dans le
  style du bloc).
- `src/engine/frame.js` produit ces règles (et fond/marges des sections dont
  le template ne les gère pas) pour l'aperçu (`render.js`) et pour Shopify :
  chaque section exportée reçoit un réglage caché `atl_style`, rempli par
  `buildShopifyTemplate` (le fond de page est porté par la 1re section).
- Aucune reconstruction des copies nécessaire.

## Panneau de style par écran (`src/style-editor-ui.jsx`)

- Un seul panneau pour texte, bouton/lien, image/vidéo, colonne/carte et
  section, avec 3 écrans : **Tous**, **Ordinateur** (≥ 750 px), **Mobile**.
- Rangé dans `props.atl_styles` de la section :
  `{ cible: { all|d|m: { base|hover|before|after|kids: { prop: valeur } } } }`.
  Cibles : `section`, `g12` (groupe), `s40`/`t12_0`/`i7` (emplacements),
  `l12` (lien qui contient le texte, `data-atl-link`). Rendu par
  `engine/frame.js` (valeurs filtrées : pas de `{ } ; < >`), en `!important`,
  dans l'aperçu et dans `atl_style` sur Shopify.
- Réglages : typo complète (police, taille, graisse, interligne, lettres,
  I/U/S/AA, couleur, fond, alignement, largeur max, puce •✓→★), bouton (fond et
  texte au survol, pleine largeur, flèche), image (format 1:1/4:3/3:4/16:9,
  cadrage, point à garder), colonnes (empiler/inverser en mobile, largeurs
  50/50…, alignement, espace), section (couleur, dégradé, image de fond
  `atl_fond_image` → `atl_bg` + `file_url` sur Shopify, plein écran,
  séparateur vague/diagonale/courbe, apparition `atl_animation`, ancre
  `atl_ancre`), marges extérieures/intérieures 4 côtés, largeur, largeur max,
  hauteur min, coins, bordure, ombre, opacité, masquer par écran, copier /
  coller le style, rétablir l'origine.
- Lien d'un bouton : adresse, `#ancre`, ou « 🛒 Ajouter au panier » (variantes
  de /api/shopify/products → `/cart/add?id=…&quantity=1`).
- Pas encore : dupliquer une carte / ajouter une question (demande un
  changement de copie.mjs), image différente en mobile.

## Comportements copiés : blocs collants (sticky) et rangées coupées

- REA (`capture_browser_scenario`) sert à confirmer les comportements du site
  en ligne (galerie `position: sticky`, sliders Swiper…) ; la capture relève
  les styles calculés, la copie les reproduit.
- Capture (`advertorial.mjs` → `dismissOverlays`) : un bloc `sticky` n'est
  plus pris pour un pop-up (avant, les galeries produit disparaissaient).
  Image-leurre transparente (`data:image/svg`, pointer-events none, plein
  écran) ignorée (`snapshot.mjs`).
- Copie (`copie.mjs`) : `position: sticky` gardée (avec `top`) ; au-dessus,
  les `overflow: hidden/auto` deviennent `clip` (sinon le collant ne marche
  pas, surtout sur l'ancien `<body>`). Une rangée de colonnes démarre une
  nouvelle section (`rowInside`) ; la colonne collante reste entière si elle
  tient.
- Rangée trop grande pour une section (limite Shopify : 50 blocs) : coupée en
  parties marquées `data-atl-suite="r<id>"`, colonnes `data-atl-col`. Page
  publiée (partage, HTML, Shopify) : le script `STICKY` remet tout dans la
  première partie et masque les sections vidées ; la section qui reçoit prend
  les classes des parties (leurs styles) et leur état d'accordéon. Les scripts
  ACCORDEONS et CARROUSELS écoutent au niveau de la page.
- Atelier (édition) : les sections restent séparées ; `StickySuites`
  (`engine/puck-config.jsx`) décale la colonne collante pendant le défilement
  jusqu'au bas de la dernière partie.
- Limite : styles réglés dans l'atelier sur une partie 2…n d'une rangée (fond,
  marges…) : sur Shopify ils restent rangés sous leur propre section.

## Importer une page faite par Kimi (`scripts/kimi-import.mjs`)

Quand Kimi (Kimi Agent) a déjà reproduit la page, on garde SES fichiers : son
HTML, ses classes et son CSS, sans recopie ni mesure. Kimi livre un zip
contenant une application React + Vite (`app/`).

1. Décompresser le zip dans `C:\Users\HP\Desktop\kimi-pages\<nom>\`, hors de
   l'atelier.
2. Le lockfile de Kimi pointe vers son miroir npm privé, injoignable. Il faut
   remplacer `https://npm.mirrors.msh.team/` par `https://registry.npmjs.org/`
   dans `package-lock.json` (les empreintes restent les mêmes).
3. `npm install --ignore-scripts` (aucun script d'installation lancé), puis
   `npx vite build`.
4. `node scripts/kimi-import.mjs <dossier>/app <nom> --label "Marque"` (environ
   7 min).

Le script ouvre la page compilée dans Edge, en local (aucune requête ne sort).
Il clique chaque bouton une fois pour apprendre ce qu'il fait :
- **bascule** : ouvre ou ferme un accordéon, une FAQ, des faits nutritionnels ;
- **choix** : variante, pack, miniature active ;
- **carrousel** : une flèche fait défiler la plus grande piste de sa section,
  une miniature ou un point mène à sa diapo ;
- **lien** : une ancre (`#reviews`), ou le panier pour les boutons qui
  ouvraient le panier de démonstration de Kimi. Ce lien est modifiable dans
  l'atelier.

Ensuite il écrit :
- `sections/<nom>-pN`, une section par `<section>` de Kimi, découpée à
  45 éléments (limite Shopify). Les textes, images et liens y sont des
  éléments modifiables, au même format que les copies. Une même photo répétée
  (galerie + miniature) est un seul élément ;
- un `style.css` par section : le CSS de Kimi rangé sous `.atl-<section>`
  (`html`, `body` et `:root` deviennent la section), réduit aux règles qui
  touchent cette section. Les états ouverts ou choisis sont inclus ;
- `pages/<nom>.json` et `imports/<nom>/assets/`, qui contient les images et
  polices de Kimi. Ce sont des photos d'origine : vues dans l'atelier, jamais
  exportées ;
- `imports/<nom>/kimi.json`, avec ce qui a été appris de chaque bouton.

Sur la page publiée, un petit script remplace React. Il applique les états
appris, fait défiler les carrousels et suit les liens des boutons. Il recolle
aussi un bloc coupé entre deux sections, à tous les niveaux (`data-atl-suite`
/ `data-atl-col`), puis masque les sections vidées.

Contrôle Magic Mind (2026-10-30), page Kimi comparée à `/partage/kimi-magicmind` :
- 1440 px : 11 478 px contre 11 463 px, titres à 2-15 px près ;
- 390 px : 16 171 px contre 16 172 px, titres identiques.

La galerie collante, les accordéons, les choix, les flèches, les miniatures et
les points fonctionnent.

Limites :
- le panier, la fenêtre « HSA/FSA » et le menu mobile de Kimi ne sont pas
  repris : leurs boutons deviennent des liens ;
- la newsletter n'envoie rien ;
- une FAQ qui referme la question précédente laisse ici les deux ouvertes.

### Page refaite à la main, sans coupure (`--sans-coupe`)

Le même import accepte une page HTML simple (`<dossier>/dist/index.html`, sans
React). Ajouter `--sans-coupe` garde chaque section du site en une seule
section de l'atelier : il n'y a plus de limite de 50 éléments. C'est le mode
prévu pour un site headless, où la page n'est plus un thème Shopify.

Essai Magic Mind du 2026-10-30, page `claude-magicmind` :
- page écrite par Claude d'après le vrai site, dans
  `C:\Users\HP\Desktop\kimi-pages\claude-magicmind\app` : `build.mjs` produit
  `dist/index.html`, plus `dist/style.css` et `dist/app.js` ;
- le relevé du site (captures, mesures, textes) a été fait en local avec Edge,
  et les images et polices du site ont été téléchargées dans `dist/assets` ;
- 13 sections, 364 éléments, le bloc produit en une seule section (113
  éléments), 3 à 15 ko de CSS par section.

À savoir pour ces pages :
- une page qui va dans l'atelier doit remettre à zéro la police des `h1-h3`
  (`h1, h2, h3 { font: inherit }`), sinon le style de l'éditeur s'y applique ;
- donner à la police un nom propre à la page (ici `MMCircular`), car deux pages
  qui déclarent « Circular » avec des fichiers différents se gênent ;
- les carrousels doivent glisser par `transform` (piste dans une fenêtre
  `overflow: hidden`), et les états passer par des classes : c'est ce que
  l'import sait apprendre.

## Supprimer (clic droit et panneau de droite)

Toute suppression demande d'abord une confirmation.
- **Section** : clic droit → « Supprimer la section », ou 🗑 en haut du panneau
  de droite. Elle est retirée de la page ; Annuler (↶) ou Historique la ramène.
- **Élément ou groupe d'une copie** (texte, image, colonne) : clic droit →
  « Supprimer l'élément » / « Supprimer le groupe », ou 🗑 du panneau. Il est
  masqué sur tous les écrans (`display: none` dans `atl_styles`) mais reste
  dans la page : décocher « Masquer partout » du panneau de style le fait
  revenir.
- **Bloc d'une section du catalogue** : 🗑 du panneau, ou le bouton « Supprimer
  le bloc ».

Pages importées de Kimi ou refaites par Claude : « Monter », « Descendre » et le
glisser-déposer de l'arbre marchent pour les éléments d'un groupe (liste,
cartes, colonnes…). Comme pour les copies, l'import écrit chaque groupe avec
`data-atl-group="g<n>"`, et le template suit le réglage « ordres »
(« g12=2,0,1 »). Ils sont grisés pour le premier ou le dernier élément, et
pour un groupe qui mêle du texte libre à ses éléments.

Les actions du clic droit partent dès l'appui du bouton (`onMouseDown`) : sinon,
quand la souris était relâchée après que l'éditeur avait redessiné le menu, le
« click » était annulé.

`kimi-import.mjs` ne réécrit plus que les fichiers qui changent : un import
relancé sans changement ne fait pas recharger l'atelier. Si la page a été
modifiée dans l'atelier depuis le dernier import, sa version est d'abord
gardée dans `imports/<nom>/page-avant-import-<date>.json`.

### Éclairage des parents

L'élément choisi est entouré en bleu plein (`.atl-hl-on`), et toute sa surface est
éclairée en bleu par un calque posé par-dessus (`#atl-hl-box`, qui suit le
défilement et les changements de taille) : on voit les deux bords d'un grand groupe. Ses groupes parents
restent entourés en pointillés (`.atl-hl-parent`, `puck-config.jsx`), et leurs
lignes de l'arbre sont éclairées en plus clair (`.is-on-path`). Un groupe sans
conteneur propre (`data-atl-group`) éclaire le plus petit bloc qui contient tous
ses éléments (`domOf`), et non plus seulement son premier élément.

## Zip de Kimi → atelier + catalogue (une commande)

`node scripts/kimi-zip.mjs "<zip>"` traite un lot : un dossier par page, nommé
comme la page de l'atelier (liste et consigne dans `docs/templates-pour-kimi.md`).
`node scripts/kimi-zip.mjs "<zip>" <nom>` traite une seule page.

Pour chaque page, la commande :
1. décompresse le zip dans `kimi-pages/_lot-…` ;
2. corrige le lien vers le miroir npm privé de Kimi ;
3. installe avec `--ignore-scripts`, puis compile ;
4. lance `kimi-import.mjs --sans-coupe` (headless), puis `kimi-catalogue.mjs`.

`kimi-catalogue.mjs` crée les sections du catalogue (`<nom>-sec-N`), sauf
l'en-tête et le pied (hors de `<main>`). Chacune reçoit un nom et une famille
(une section avec « Add to cart » et des prix devient « Fiche produit »), son
contenu d'origine comme contenu par défaut, et sa miniature. Les anciennes
`<nom>-sec-*` qui n'existent plus sont retirées.

Une page en échec n'arrête pas le lot. Le bilan donne la commande pour la
reprendre (`--seulement nom`).

## Enregistrement d'une page (atelier)

La page s'enregistre seule, 2 s après la dernière modification. Ctrl + S (aussi
dans l'aperçu) et le bouton « Enregistrer » le font tout de suite. Le bouton
remplace « Publish » de Puck et affiche « Enregistré ✓ » (vert),
« Enregistrer » (modifications en attente), « Enregistrement… » ou
« Réessayer » (échec). Le navigateur avertit si on quitte la page avec des
modifications pas encore enregistrées.

L'état du bouton vit dans `saveStore` (`App.jsx`), hors du composant App :
redessiner App redessine tout l'éditeur Puck, ce qui prenait environ 4 s par
modification sur une grande page. `pages/` n'est pas surveillé par Vite, donc
enregistrer ne recharge pas l'atelier.

## Outils IA : où ils sont (2026-11-01)

La règle : **l'endroit où on clique décide de ce qu'on change**.

- **Toute la page** → menu **✨ IA** du rail de gauche (`AiTool`, `src/left-ui.jsx`). Il remplace « Régénérer » et « Rebrand ».
  - Textes :
    - *Réécrire pour mon produit* (`RewritePage`) ;
    - *Traduire* (`TranslatePage`) ;
    - *Remplacer un mot* (l'ancien Rebrand).
  - Images : *Planche des images*. Son bouton « Tout refaire avec mon produit » ouvre le Studio d'images.
  - Style : *Adapter toute la page à son style*. Chaque section passe par `rebuildSectionWith`, puis la page est enregistrée et rechargée.
  - Les outils de la page s'ouvrent par l'événement `atl-ai-page` (`reecrire`, `traduire`, `adapter`) dans `PageAiDialog`.
- **Fiche « Ma marque et mon produit »** → ⚙ Réglages de la page (`BrandSheet`). Elle enregistre dans `root.props` :
  - `marque`, `produit`, `profil` et `infos` ;
  - `photos_produit` (tableau d'adresses) et `logo`.

  Elle sert à la réécriture, à « Retravailler » et au Studio (photos et logo préremplis). Produit et profil ne sont plus dans les champs Puck de la page.
- **Une section ou un élément** → fenêtre **✨ Retravailler** (`AiDialog`). On l'ouvre par :
  - clic droit ;
  - ✨ dans l'en-tête du panneau ;
  - le bouton « Retravailler avec l'IA… » en bas du panneau d'une section.

  Elle a trois onglets :
  - **Textes** ;
  - **Images** ;
  - **Design** (section entière seulement) : redessiner avec une consigne et/ou un exemple, nettoyer la mise en page, adapter au style de la page.

  Les anciennes boîtes « Reconstruire / Adapter / Nettoyer » du bas du panneau sont retirées.
- **Une image** → « Choisir une image ▾ » → **✨ Refaire avec l'IA** (événement `atl-ai-image`) : la fenêtre Retravailler, onglet Images, pour cette image seulement. Hors d'un élément (fond de section), c'est la Planche qui s'ouvre.
- **Ajouter une section → Créer avec l'IA** : inchangé.

## Méthode d'écriture des pages : skill landing-page-jeffrey-arsh (2026-11-03)

- **Demandes « textes »** (et tout texte de page écrit par Claude) : suivre le
  skill `landing-page-jeffrey-arsh` (`~/.claude/skills/landing-page-jeffrey-arsh/`).
  Commencer par `references/atelier-sites.md` (types de page, familles,
  ordre conseillé, règles de l'atelier), puis le fichier du format.
- **IA intégrée (OpenAI)** : `docs/regles-copy.md` est la version courte du
  skill. `scripts/lib/ia.mjs` la relit à chaque appel :
  - toute réécriture de textes (`rewriteTexts`, sauf une traduction : `regles: false`) ;
  - le redessin d'une section qui réécrit ses textes (`rebuildSection`) ;
  - l'audit (`auditPage`).
  Chaque texte envoyé porte son rôle (« Titre H1 », « Bouton »…). Si le skill
  évolue, mettre ce fichier à jour (court : il est envoyé à chaque appel).
- **Score de vente** (`src/engine/page-score.js`, panneau `src/score-ui.jsx`) :
  - règles alignées sur l'ordre conseillé du skill pour chaque type de page ;
  - **les 5 croyances** (`BELIEFS`, `beliefsOf`) : installées par quelles
    sections, ou laquelle ajouter ;
  - **textes à reprendre** (`textChecks`) : titres-étiquettes, boutons
    génériques, pas de réassurance sous un bouton d'achat, consignes entre
    crochets restantes.
- **Auditer la page** (menu ✨ IA → Analyse) : envoie le type, la fiche, le
  Score de vente local et les principaux textes de chaque section à
  `/api/ia/audit`, qui suit la grille de `references/audit-cro.md`. Il rend : le
  verdict, les 5 croyances, les gains rapides (avec « voir »), les changements
  à fort impact, des titres et boutons à copier, et des tests A/B.

## Sections : cadres, FAQ, carrousels, vide en haut, familles (2026-11-07)

Passe de nuit sur le catalogue et les templates (outils dans `/tmp/nuit` du serveur ; sauvegarde
`~/sauvegardes/avant-nuit-sections-pages-20261107.tgz`).
- **Cadres carrés** : les copies remettent tout au style du navigateur (`all:revert`). Un bouton,
  un champ ou une question de FAQ sans style relevé prenait la bordure grise du navigateur. Bloc
  `/* atl-controles */` juste après le revert dans chaque style.css (même règle dans
  `scripts/lib/copie.mjs` pour les prochains imports) : poids nul, un style relevé passe devant.
- **FAQ** : question `[data-atl-q=n]`, réponse `[data-atl-r=n]`. `render.js` ajoute `ACC_SCRIPT`
  (fermé au départ, ouvert au clic) dans l'aperçu du catalogue et sur la page publiée ; dans
  l'éditeur le script ne tourne pas et le bloc `/* atl-faq */` du style.css garde les réponses
  ouvertes pour les modifier. FAQ sans réponse relevée : réponse-consigne « [Réponse : 2-3
  phrases] » ajoutée (emplacement modifiable, aussi ajouté dans les pages qui utilisent la section).
- **Carrousels** : toute section avec une piste `data-atl-car="track"` a son carrousel actif
  (`carrouselAttr(…, true)`), et les flèches du site (`data-atl-car=prev/next`) sont branchées par
  `atlCarrousels` en mode « origine ». Flèches non reconnues à l'import : marquées après coup.
- **Vide en haut** (sections taillées dans une page à positions fixes, Unbounce) : bloc
  `/* atl-rogner */` (hauteur + marge négative + `position: relative`), par écran.
- **Familles** : 1 120 sections reclassées à la main d'après leur contenu ; l'ancienne valeur est
  dans `meta.familyAvant` / `meta.labelAvant` (`familyRevue: "2026-11-07"`).
- Limite : sur Shopify (template.liquid), les scripts FAQ et carrousel de `render.js` ne sont pas
  repris.

## Plus d'export Shopify, découpe gardée (2026-11-08)

On n'exporte plus vers un thème Shopify, mais la découpe des imports en sections de
45 emplacements au plus est **gardée** : elle évite d'éditer des sections trop grosses.
Les mentions « limite Shopify » plus haut expliquent l'origine de cette taille, qui reste
la règle.

## Menu « Page » à deux niveaux (2026-11-08)

Dans l'éditeur, le bouton « Page ▾ » ouvre un menu à deux colonnes
(`PageSelect` dans `src/pages-ui.jsx`, styles `.atl-pagemenu` dans `src/styles.css`) :

- à gauche, les types de page du projet (Landing page, Listicle, Advertorial,
  Product page, Homepage, Offer page, Collection…) avec leur nombre de pages ;
- à droite, au survol ou au clic d'un type, ses pages : **la page mère d'abord (★)**,
  puis les pages des angles (« … angle »), puis les autres pages de ce type.

Page mère d'un type : la page mère du projet (angle ★ dans l'onglet Angles) si elle
est de ce type, sinon la page du premier angle choisi de ce type (même règle que
`Angles.jsx`). Le texte affiché est le titre de l'angle, sinon le profil de la page.

Le menu se referme dès que la souris le quitte (délai de 250 ms pour passer du bouton au panneau). Plus de boutons « + » dans la barre (projet, page, design) : on crée depuis le projet, dans le catalogue. Les boutons × et corbeille ont leur icône centrée.

Dans le catalogue, onglet Pages du projet : une carte par type de page (fermée : la page mère ; ouverte : la mère ★ surlignée, puis les angles, puis les autres pages du type). Même regroupement que le menu (`pageMenuGroups`).

« Ajouter une page au projet » : le champ « Page mère ou angle » remplace le profil libre. ★ Page mère → enregistrée comme mère de son type (`projet.meresParType[type]`, prioritaire dans `pageMenuGroups`) ; Angle N → la page est reliée à cet angle (angles sans page seulement) ; Nouvel angle… → angle ajouté au projet ; Autre → page simple. Une page d’angle part par défaut d’une copie de la page mère de son type.

Règle : pas de page d’angle (Angle N, Nouvel angle) tant que le type n’a pas sa page mère (options grisées + message). Une page mère part toujours d’une page du même type, d’un template, ou d’un lien (URL → page créée puis demande d’import) ; jamais d’une page vide (`SourcePicker noBlank`).
