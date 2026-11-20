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
   - **Studio d'images en direct (depuis le 2026-11-11, remplace les demandes
     « images »)** : le bouton « 🖼 Studio d'images » ouvre une page plein écran
     calquée sur « Image Mirror » de Whitelabeler (`StudioDialog`,
     `src/studio-ui.jsx`, styles `.atl-mirror*`) : cartes 1 produit, 2 tes
     images (produit / marque), 3 images à refaire (photos d'origine de la page,
     `originalPhotoTargets`, celles de moins de 150 px décochées), 4 images
     générées (versions, « À propos », Affiner, Refaire, Installer dans la page,
     Tout télécharger) ; panneau Réglages (coût estimé, mode Miroir / Pub,
     pilote automatique, Lancer, modèle Auto / Nano Banana / GPT Image 2 /
     Nano Banana Pro, réglages du pilote). Chaque image : `POST /api/ia/studio`
     → `studioPrompt` + `studioImage` (`scripts/lib/ia.mjs`), rangée dans
     « images-creees » du projet. Installation une par une dans la page (Ctrl+Z
     annule, enregistrement automatique). Versions gardées dans le navigateur
     (`localStorage` « atl-studio-<page> »). Aucune demande à traiter par Claude.
     Les deux modèles marchent (clés OPENAI_API_KEY et GEMINI_API_KEY).
   - **Canvas (2026-11-11, refait sur Excalidraw le 2026-11-12 pour suivre
     Whitelabeler à l'identique)** : `src/canvas-ui.jsx`, styles `.atl-cv*`,
     paquet `@excalidraw/excalidraw@0.18.1` (installé avec --ignore-scripts,
     sauvegarde de package.json dans `~/sauvegardes`). Le Canvas de
     Whitelabeler EST Excalidraw : mêmes outils (verrou, main, sélection 1,
     rectangle 2, losange 3, ellipse 4, flèche 5, ligne 6, dessin 7, texte 8,
     image 9, gomme 0, autres outils : cadre, intégration web, pointeur laser,
     Mermaid), panneau de style à gauche, menu ☰, zoom et annuler en bas à
     gauche, en français. Polices servies par l'atelier
     (`window.EXCALIDRAW_ASSET_PATH = /node_modules/@excalidraw/excalidraw/dist/prod/`).
     En haut à droite, comme chez lui : Tes images (images du projet et du site
     d'origine), Créer une image (violet), Créer une vidéo (grisé : pas de Veo),
     Section images, nom du tableau (clic : renommer) et « Enregistré ».
     **Menu ☰ comme Whitelabeler** (2026-11-12) : Tous les tableaux (fenêtre
     façon page « Canvas » : cartes, Nouveau tableau), Tes images (fenêtre :
     cocher une ou plusieurs images, Annuler / Ajouter au tableau ; aussi le
     1er bouton en haut à droite), Ajouter une vidéo (mp4, webm, mov, 70 Mo au
     plus : envoyée dans le projet, posée en élément intégré qui la lit ;
     adresse recalculée à l'ouverture), Exporter l'image (PNG, SVG,
     presse-papiers), Aide, Supprimer ce tableau (déplacé dans
     `canvas/_corbeille/`, rien n'est effacé ; `DELETE /api/canvas/<page>/<id>`).
     Le nom du tableau se renomme d'un clic en haut à droite.
     **Plusieurs tableaux par projet** : `medias/projets/<projet>/canvas/<id>.json` (page hors projet :
     `medias/<page>/canvas/<id>.json`). Routes : `GET /api/canvas/<page>`
     (liste), `POST` (nouveau), `GET/PUT /api/canvas/<page>/<id>`,
     `POST /api/canvas/<page>/<id|dernier>/ajouter` (images du Studio, mises
     en file `aAjouter` et posées à l'ouverture). Une image du tableau = un
     fichier Excalidraw dont la « dataURL » est son adresse `/medias/…` (pas de
     copie) ; une image collée ou glissée est envoyée dans le projet à
     l'enregistrement. L'ancien `canvas.json` devient « Tableau 1 »
     (`canvas-avant-excalidraw.json` gardé).
     **Nouvelle image** (panneau en bas, comme « New picture ») : Ajouter une
     image + « Clique des images du tableau pour les ajouter » (tant que le
     panneau est ouvert, toute image sélectionnée devient une référence),
     consigne (Ctrl + Entrée), Modèle (Nano Banana, GPT Image 2, Nano Banana
     Pro), Qualité (Haute / Moyenne / Basse → `quality` d'OpenAI), Images 1 à
     4, Format, « Générer · ~x $ ». Un cadre pointillé « Ton image arrive ici… »
     est posé puis remplacé. Route `/api/ia/canvas-image` (`canvasPrompt` :
     produit fidèle aux références, aucune preuve inventée).
     **Sur une image sélectionnée** : Utiliser comme référence, Retirer le fond
     (gpt-image-2 refuse la transparence : fond blanc rendu transparent dans
     le navigateur), Exporter vers une page, Détails, Télécharger, Retirer.
     **Exporter vers une page** (`ExportToPage`, aussi dans le Studio) : 3
     étapes Images / Page (recherche, pages du projet, sinon toutes) / Placer
     (clic sur l'image de la page à remplacer). Page ouverte : par Puck (Ctrl+Z).
     Autre page : copie de sécurité (`/api/pages/<p>/snapshot`) puis
     enregistrement. Les pages `zz-` ne sont proposées que depuis une page `zz-`.
     **Section images** : Ajouter une image (Téléverser / Choisir sur le
     tableau), « Choisir une page » (liste), aperçu de la page
     (`/partage/<page>?reperes=1`) où l'on clique les sections (contour bleu),
     Image / Infographie, « Écrire les consignes » → `/api/ia/section-prompts`
     (`sectionImagePrompts`, gpt-5.4-mini : rôle, textes, produit, type de
     page, Fondations, nombre de références). Puis par section : format, image
     à remplacer, consigne, Créer / Nouvelle, Placer dans la page.
     **Studio d'images** : sous « Affiner cette image » : « Envoyer dans le
     Canvas » et « Exporter vers une page » ; en tête de la carte 4 : Voir
     toutes les images, Tout télécharger (n), Tout envoyer dans le Canvas (n).
     Deux onglets sur le même tableau : le dernier qui enregistre gagne.
     **Images du projet (2026-11-12)** : catalogue → projet → Images →
     « Modifiées » : une seule liste pour tout le projet (images IA, téléversées,
     vidéos), cases à cocher, « Mettre à la corbeille » → `POST
     /api/medias-corbeille` (fichiers dans `corbeille/medias/`, index
     `_index.json`, rien n'est effacé). Un fichier encore utilisé dans une page
     ou un tableau du Canvas demande une confirmation (liste des endroits).
     « Corbeille des images » plus bas : Restaurer / Tout restaurer. Le Studio
     retire de ses versions les fichiers mis à la corbeille. Synchro : les
     images d'origine viennent partout de `originalPhotoTargets` (catalogue
     « D'origine », carte 3 du Studio, onglet « Site d'origine » de Tes
     images) ; les images modifiées viennent partout de `/api/medias/<page>`
     (dossier du projet). Étapes Pubs et Résultats retirées de la barre du
     projet pour l'instant (lignes commentées dans `Fondations.jsx`).
   - **Retravail IA sans rechargement (2026-11-16)** : `rebuildSectionWith`
     (inspector-ui.jsx) n'appelle plus `location.reload()`. La section créée
     est chargée par `addSections(ids)` (engine/sections.js), ajoutée à l'index
     partagé `sectionsIndex` (tous les modules de l'éditeur s'en servent au lieu
     de leur propre copie `byId`) et DANS la config Puck existante (App.jsx,
     événement `atl-sections-added` : Puck garde sa config de départ). Puis
     `applyReplacements` remplace le contenu en une étape (`setData` ; Puck
     refuse de changer l'id par `replace`) et note la position dans
     l'historique ; « ↶ Revenir à avant » (bandeau `.atl-undobar`) y revient
     par `history.setHistoryIndex` (demande confirmation si d'autres
     changements ont suivi). Copie de sécurité avant. Même chose pour
     « Adapter toute la page » et l'ajout de sections du Score.
   - **Enregistrer une section (A5, 2026-11-16)** : bouton 💾▾ en haut à
     droite du panneau d'une section (`SaveSectionMenu`, inspector-ui.jsx ;
     remplace l'encadré du bas). « Nouvelle section » : nom saisi dans le
     menu, copie `<base>-perso-N` disponible tout de suite (`addSections`).
     « Remplacer l'originale » : la section elle-même si elle est au
     catalogue, sinon l'originale d'une copie figée (`figeeDepuis`) ou d'une
     perso (`copieDe`) si elle est au catalogue ; liste des pages qui
     l'utilisent (`GET /api/sections/<id>/pages`) avant de confirmer ;
     `POST /api/sections-save` accepte `target`. Parties de template : pas
     d'originale, seulement « Nouvelle section ».
   - **Lot B (2026-11-16)** :
     - « + Ajouter une section « … » ici » : le clic est repéré par la
       géométrie dans le gestionnaire de clics de l'aperçu (`slotBoxAt`,
       inspector-ui.jsx) et ouvre le SlotPicker de la ligne la plus proche,
       sans choisir la section voisine.
     - Échap ferme la fenêtre du dessus (`src/escape-close.js` : dialogue
       `aria-modal`, bouton Fermer ; écoute aussi l'iframe de l'aperçu ;
       Excalidraw garde Échap).
     - Sélecteur Page · Studio · Canvas · Catalogue en haut du Studio et du
       Canvas (`src/workspace-switch.jsx`).
     - Copier / coller le style (style-editor-ui.jsx) : copie aussi
       l'apparence réelle (police, taille, interligne en rapport, couleur ;
       boutons : fond, coins, marges ; section : fond seulement), colle en
       ajout (avant : un style vide effaçait la cible), message de retour.
     - Ctrl+Z / Ctrl+Y : filet de sécurité `src/undo-keys.js` qui clique ↶ / ↷
       si Puck n'a pas traité la touche (il exige d'avoir vu Ctrl enfoncé à
       part) ; rien dans un champ de saisie ni dans une fenêtre ouverte.
     - Barre « Demander une modification » retirée du bas du panneau.
     - Noms des sections de la page sans le site d'origine (arbre, panneau :
       fonction · famille, Structure, liste des sections, étiquette Puck,
       confirmation de suppression) ; les galeries de choix gardent la source.
   - **Lot C « Cohérence » palette / design.md (2026-11-16)** :
     - Mode Palette = couleurs seulement : `designMarkdown` (engine/palette.js)
       reçoit `styles` et les recopie dans le nouveau design.md (avant, le
       bloc styles du design de départ était perdu).
     - Contraste réel WCAG : `contrastRatio`, `contrastText` choisit noir ou
       blanc selon le meilleur rapport (avant : seuil de luminance 0,45 qui
       mettait du blanc sur l'orange, 2,5:1) ; `contrastIssues(roles)` liste
       les paires texte/fond sous 4,5:1 ; la Palette demande confirmation.
     - Graisses 800/900 : `brandCss(root, designStyles)` (engine/brand.js)
       ajoute une requête Google par graisse demandée par les styles du design
       (une graisse absente échoue seule). Passé par puck-config (aperçu),
       tools-ui (HTML) et mirror-ui ; les scripts Node ne le passent pas.
     - Fiche du catalogue = même définition que « Appliquer » : `roleStyles`
       (catalogue/Designs.jsx) prend couleurs et polices des jetons appliqués,
       et tailles / graisses / formes du relevé.
     - Intensité 1-4 en curseur nommé (Discrète, Marquée, Forte, Totale).
   - **Lot « Moyens » (2026-11-16)** :
     - Recherche dans « Ajouter une section » (fenêtre et outil Ajouter du
       rail) : `matchesSearch` / `searchSections` (library-ui.jsx) — nom,
       famille (anglais + description française), site d'origine ; sans
       accents ; la famille qui correspond passe en premier.
     - Chaque paragraphe se choisit seul au clic (plus de promotion vers le
       « ¶ Texte » regroupé dans `choose`) ; le groupe reste dans l'arbre et
       par ⬆ (parent).
     - Menu des écrans du panneau de style : Ordinateur · Téléphone · Tous
       les écrans (style-editor-ui.jsx), choix partagé entre panneaux ;
       Ordinateur / Téléphone règlent aussi l'aperçu (setUi viewports) et
       changer l'écran de l'aperçu fait suivre la cible.
     - Galerie des blocs d'achat (`src/engine/galerie.js`, `atlGaleries`) :
       sections « fiche-produit » ou avec ajout au panier, marquées
       `data-atl-galerie` par render.js (+ `GALERIE_SCRIPT` sur la page
       publiée) et réglées dans l'aperçu par puck-config. Vignette → image
       principale ; flèches ‹ › et glisser si l'image n'est pas déjà un
       carrousel ; sinon la vignette N fait défiler le carrousel à la diapo N.
       Clics repérés par la géométrie. Pas encore dans l'export Shopify.
     - Export vers une page (canvas-ui.jsx `ExportToPage`) : « ✋ Glisser dans
       la page ouverte » ferme Studio/Canvas et ouvre `DropTray` (bandeau
       d'images à gauche, dépôt sur une image de l'aperçu, `slotAt` :
       data-atl-slot pour les copies, sinon le fichier de l'image ; Ctrl+Z).
       Le parcours pas à pas reste, avec la miniature de la page à droite
       (`PagePicker`, clic = défile jusqu'aux images de la section).
     - Curseurs « Varier les couleurs » (outil Palette, 2026-11-17) :
       Teinte (−180° à +180°) et Plus sombre · plus clair (−30 à +30).
       `shiftColor` / `varyPalette` (palette.js) : seules les couleurs vives
       bougent ; texte neutre repassé en noir/blanc sous 4,5:1. La page
       change en direct (`applyDesign` en mémoire + setData, sans
       historique pendant le glissé, une étape Ctrl+Z au relâché).
       « Garder ces couleurs » : copie de sécurité, page, puis design.md
       `<projet ou page>-variation(-N)` ; « Revenir » remet l'état d'avant.
       Rien ne bouge si le design de la page est tout en gris/beige (ou si
       la page n'a pas de design).
   - **Lot « Décisions » (2026-11-17)** :
     - Panneau de droite 248 → 200 px (styles.css, fin de fichier) ; en-tête
       sur deux lignes (boutons, puis titre), menu des écrans en 3 colonnes.
     - Barre du haut sans « Design » (App.jsx ; le design se choisit dans
       Palette). Barre de l'aperçu (.atl-vpbar) en haut au centre, plus
       fine, toujours visible ; languette de la barre du haut à gauche ;
       aperçu décalé de 46 px.
     - Vues (original-ui.jsx `OriginalSwitch`, remplace Original/Modifiable) :
       Ordinateur seul · Édition + originale (page d'origine à droite,
       défilement lié dans les deux sens, pages importées seulement) ·
       Ordinateur + téléphone (`PhonePane` : rendu 390 px en srcdoc, refait
       quand la page change, défilement lié). Les vues doubles mettent
       l'aperçu en ordinateur ; Puck le remet à l'échelle (padding-right
       du PuckCanvas).
     - Sélection multiple Ctrl+clic (inspector-ui.jsx `toggleMulti`,
       `MultiPanel`, `mergeStyleDiff`) : éléments et groupes, plusieurs
       sections ; contour violet ; Masquer/afficher sur l'écran visé,
       Supprimer (masqué partout), panneau de style du 1er élément recopié
       sur tous (seules les retouches faites ici) ; une étape Ctrl+Z
       (setData recordHistory: true) ; Échap ou clic simple vide la
       sélection. Les sections entières ne se prennent pas en multiple.
     - Clic sur le cadre extérieur d'une copie (groupe racine de meta.arbre,
       absent de l'arbre) : ouvrait un panneau vide. `target` (inspector-ui)
       prend maintenant le plus petit élément sous la souris qui a une ligne
       dans l'arbre, sinon la section.
   - **Audit « D'abord » 2 à 11 (2026-11-17)** :
     - T7 : rail des outils toujours visible (l'aperçu lui laisse 68 px), son
       panneau s'ouvre au clic ; barre du haut et panneau de droite s'ouvrent
       aussi au clavier (:focus-within). Plus de languette en haut : bouton
       « Projet ▾ » au bout de la barre de l'aperçu (garde la barre Projet /
       Page ouverte, `atl-topbar-pinned`, mémorisé). « Enregistré ✓ » déplacé
       dans la barre de l'aperçu (`PreviewBarSave`, topbar-ui.jsx).
     - Champ de rédaction de l'inspecteur (.atl-rte__area) : 13 px quelle que
       soit la taille du texte dans la page.
     - T6 : Excalidraw chargé à l'ouverture du Canvas (`loadExcalidraw`,
       `CanvasBoard`), message + « Réessayer » si échec ; catalogue :
       Catalogue.jsx chargé par import() dans main.jsx, message + « Réessayer »
       si la liste des sections n'arrive pas.
     - Libellés : « Couverture de la structure conseillée » (ex-Score de
       vente, rail « Couverture ») ; étape « Exports » (ex-Publication) ;
       Fondations : « les chiffres sans preuve sont signalés, vérifie avant
       publication » ; rail « Médias » (ex-Images) + entrée Vidéos ; projet :
       ressource « Médias » ; « Importer une page » (ex-Enrichir le catalogue).
     - Catalogue : « ← Reprendre ma page » si une page est mémorisée, sinon
       « Choisir une page à ouvrir » (avant : lien vers / qui revenait ici).
     - Studio : avertissement visible sans photo du produit ; image d'essai :
       si rien n'est encore généré et que plusieurs images sont prévues, pause
       après la première (« Image d'essai faite… »).
     - Point 7 (langue) : déjà en place (langue de la page EN/FR, consigneLangue
       dans tous les outils IA de la page). Point 8 (Section images de bout en
       bout) : pas fait, demande une vraie génération.
     - Noms des familles (Customer reviews…) gardés en anglais, comme
       Whitelabeler : décision de l'utilisateur (2026-11-17), ne pas traduire.
   - **Lot 2 « Charte complète » (2026-11-17)** :
     - Palette → « 1. Choisir un design.md » : portée Palette (couleurs) ·
       Couleurs et polices · Charte complète, avec cases Couleurs,
       Typographie (polices, graisse, interligne, casse ; décochée par
       défaut), « Garder les tailles de la page » (cochée), Boutons, Cartes et
       formes, Espacements (grisé : pas mesuré dans les design.md), et
       « Effacer mes retouches de style ». Bilan (confirm) avant d'écrire,
       copie de sécurité, puis rechargement. Bouton « Réappliquer » sur le
       design actuel.
     - Moteur `src/engine/charte.js` : `autoRole` (Titre H1/H2/H3, Question,
       texte : ≥ 30 px → titre de section, ≥ 19 px → sous-titre ; bouton
       principal seulement si ça en a l'air : fond ou contour, ≥ 80×28 px,
       verbe d'action, hors en-tête / pied de page / bandeaux — la copie
       nomme « Bouton (CTA) » aussi les croix, onglets et logos),
       `charteForItem`, `applyCharte`, `optionsFor`, `measureIn`. Résultat dans
       props.atl_charte (format atl_styles), dessiné par frame.js AVANT
       atl_styles (la retouche gagne). Tailles téléphone = ordinateur × facteur
       (h1 0,62, h2 0,7, h3 0,83, sous-titre 0,85, texte 0,92, min 14 px).
       Bouton principal : couleurs des rôles bouton / bouton-texte, forme et
       taille de styles.bouton ; secondaire : contour. Cartes (kind « carte ») :
       arrondi = rayon du bouton × 1,5 (max 24 px). root.props.charte garde le
       design et les options.
     - Inspecteur : « Rôle visuel (charte) » sur chaque élément copié
       (props.atl_roles), recalcule la section tout de suite si la page suit
       une charte.
     - Limites : sections du catalogue (non copiées) : couleurs et polices
       seulement ; une section ajoutée après ne suit pas la charte (lot 4) ;
       pas d'essai avant application (lot 3).
   - **Lot 3 « Essai contrôlé » (2026-11-17)** : `src/trial-ui.jsx`
     (`startTrial`, `TrialHost` monté dans App). Design.md (toutes portées) et
     palettes (logo, palette d'un design, nouvelle palette) ne s'écrivent plus
     tout de suite : la page change à l'écran, barre « Essai » avec le bilan
     (ce qui change, éléments par rôle, retouches gardées, contrastes faibles
     en ⚠), Avant / Après, Appliquer, Annuler (ou Échap). Pendant l'essai
     window.__atlTrial coupe l'enregistrement automatique (App.onPageChange).
     Appliquer : version d'avant, copie de sécurité, nouvelle page
     (`savePageWith`), puis « ↶ Revenir à avant » ou Ctrl+Z ; une palette
     crée ensuite son design.md et recharge. Vérifié : Annuler = rien
     d'écrit ; Appliquer puis Revenir = état d'avant (page et serveur).
     Pas couvert : curseurs « Varier les couleurs » (déjà en direct avec
     Garder / Revenir).
   - **Lot 4 « Réutilisation » (2026-11-17)** :
     · Charte du projet : bloc « Charte du projet » en haut de Palette
     (left-ui.jsx, pages d'un projet). project.charte = { design, portée,
     options, version, date, historique (10 versions précédentes) }.
     « Enregistrer la charte de cette page pour le projet » (version + 1),
     « Essayer la version N sur cette page », « Versions précédentes » →
     « Essayer » (toujours par l'essai contrôlé). `applyScoped(design, over)`
     accepte une portée/options/version imposées ; la page garde
     root.charte.version.
     · Rappel : src/charte-keeper.jsx (`CharteKeeper`, monté dans App) : si
     le projet a une charte et que la page n'en a pas la version, petit
     bandeau en bas à gauche « L'essayer / Plus tard » (ouvre Palette et
     l'essai, évènement atl-apply-project-charte).
     · Héritage : CharteKeeper repère les sections ajoutées (id nouveau) et,
     ~0,5 s après, leur calcule atl_charte (charteForItem, design de la
     charte + couleurs actuelles de la page). Une section dupliquée qui a
     déjà sa charte est laissée telle quelle. Rien pendant un essai.
     · Variantes : `withCharte(page, design)` dans applyPalette, la portée
     « Palette » et les curseurs Teinte / Clair-sombre : la typographie et la
     forme des boutons de la charte restent, seules les couleurs changent.
     Vérifié sur un projet zz (3 pages, mis à la corbeille) : version 1 puis
     2, révision v1 essayée, bandeau puis application, bouton noir à coins
     80 px gardé au curseur, section ajoutée = 5 styles de bouton hérités.
     Limite vue : certaines copies n'ont aucun bouton dans leur arbre (ex.
     norse-organics-offre-sec-16) : rien ne peut y suivre la charte.
   - **Atelier compilé (2026-11-17)** : le service `atelier` ne lance plus
     Vite en mode développement. Drop-in
     /etc/systemd/system/atelier.service.d/compile.conf : au démarrage
     `vite build` (3 s, dans dist/, anciens fichiers gardés : emptyOutDir
     false) puis `node server/production.mjs` (port 5180) : sert dist/, les
     dossiers designs, medias, sections, imports, export (jamais .env ni
     server/), et branche les mêmes modules server/sections.mjs et
     server/api.mjs avec un faux « serveur Vite » (pile de middlewares,
     fs.watch sur sections/ et designs/, messages par /api/evenements).
     · src/live.js `onLive(évènement, fonction)` : connexion de Vite en dev,
     /api/evenements (SSE) en version compilée ; barre « Une nouvelle version
     de l'atelier est prête · Recharger » après un build.
     · src/engine/designs.js : les design.md sont lus par
     /api/designs-data (server/sections.mjs, gzip + ETag) au lieu d'être
     figés dans le code (sinon un design.md créé après le build manquerait) ;
     message atl-designs quand un .md change.
     · Mesure (sur le serveur, page de 4 sections copiées) : première
     section 12,7 s → 4,3 s, 14,8 → 5,1 Mo, 105 → 64 requêtes ; mémoire
     1,7 → 1,5 Go. 24 essais de l'API identiques.
     · Après un changement dans src/ : `npm run build` (les onglets ouverts
     proposent de recharger) ; dans server/ : `sudo systemctl restart
     atelier` (qui refait aussi le build).
     · Revenir au mode développement : supprimer compile.conf, puis
     `sudo systemctl daemon-reload && sudo systemctl restart atelier`.
   - **Restes du plan terminés (2026-11-17)** :
     · Favoris dans l'outil « Ajouter » du rail (left-ui.jsx `railCard`) :
     ☆/★ sur chaque modèle, « ★ Mes favoris » et « Utilisées récemment » sans
     type choisi, favoris en tête de la galerie d'un type ; mêmes données que
     « + Section » (gallery-prefs.js, galerie.json).
     · Polices restées sur le site d'origine :
     scripts/apres-import/polices-locales.mjs (étape 2 bis du LISEZ-MOI) :
     1 231 adresses testées : 1 114 déjà chargeables (Shopify, Google…), 21
     bloquées par leur site → copiées dans imports/_polices/, 21 disparues mais
     retrouvées dans imports/<site>/assets/, 63 disparues sans copie (police
     de secours), 12 injoignables ; 41 style.css réécrits (sauvegarde
     ~/sauvegardes/avant-polices-*.tgz, et git).
     · Boutons « oubliés » par la copie : texte rangé comme « Texte » dans un
     bouton (data-atl-btn). charte.js : measureIn mesure aussi la boîte du
     bouton (`btn`) ; autoRole en fait un bouton principal s'il ressemble à
     un CTA ; la charte vise tout le bouton (clé `btn<N>`, frame.js
     targetSelector). Ex. norse-organics « STOP ACNE NOW » reconnu.
     · Bouton principal à confirmer après un import : charte-keeper.jsx
     `CtaCheck`, une fois par page importée (root.importSource) : « Import : N
     boutons repérés… Vérifier / Plus tard / Ne plus demander » ; liste Oui /
     Non (survol = bouton entouré dans la page), « Tout est bon » ; écrit
     atl_roles (bouton / aucun) et root.ctaValides. Testé sur un vrai import
     (scooch) : « Subscribe & Save » proposé, refusé d'un « Non ».
     · Espacements dans la charte : case « Espacements réguliers » (Serré 40 /
     Moyen 64 / Aéré 96 px) dans « Charte complète ». charte.js `gapsIn`
     mesure le vide en haut / en bas de chaque section copiée ; une section
     trop serrée reçoit du padding (dans son fond, ordinateur seulement,
     clé `section` + `_espace` pour recalculer) ; jamais de réduction.
     Vérifié : Aéré → toutes les sections serrées à 96 px, une à 160 px
     gardée ; puis Moyen → ajouts recalculés.
     · Bilan d'import par étapes essayé sur un vrai import (zip scooch sous
     le nom zz-test-bilan, --verifier-a-part) : « import ✓ · réparation ✓ ·
     fiche ✓ · vérification — → importée mais NON validée », code de sortie
     2. Tout l'essai est à la corbeille (page, 24 sections, imports/).
   - **Menu Page · Studio · Canvas · Catalogue dans le catalogue
     (2026-11-17)** : `WorkspaceSwitch current="catalogue" page={targetPage}`
     en haut à droite de l'en-tête (caché sous 760 px). Page → /?page=… ;
     Studio / Canvas → /?page=…&ouvrir=studio|canvas : `useOpenFromUrl`
     (workspace-switch.jsx) retire le paramètre, attend la page affichée, pose
     window.__atlEspace et envoie atl-open-… ; l'état ouvert part de
     __atlEspace (l'éditeur remonte ses boutons après le chargement), remis à
     zéro à la fermeture. Sans page mémorisée : liste des pages. Testé sur
     zz-test-menu (corbeille) : Canvas et Studio s'ouvrent depuis le catalogue,
     aller-retour Canvas → Catalogue → Studio.
   - **Barre unique de l'éditeur (2026-11-17, capture de l'utilisateur)** :
     une seule ligne de 44 px en haut, sur toute la largeur : Projet · Page
     (✕, 🗑) · EN/FR · écrans de Puck (téléphone, tablette, ordinateur) + 2
     icônes de vue (ordinateur + ordinateur = modifiée + originale ;
     ordinateur + téléphone) · ⋯ · zoom · plein écran · annuler / rétablir ·
     Enregistré · HTML / ZIP / Mirror. Plus de barre du haut ni de bouton
     « Projet ▾ » ; les vues en texte (« Ordinateur seul »…) sont retirées.
     Code : App.jsx (`PreviewBarProject` dans headerActions, OriginalSwitch
     hors barre, messages en bulle `.atl-status-toast`), topbar-ui.jsx
     (`PreviewBarProject`, `TopbarTools` → `atl-publish-host`),
     original-ui.jsx (VIEWS en icônes SVG, clic sur un écran de Puck = vue
     simple ; en vue double l'écran « ordinateur » de Puck reste cliquable),
     styles.css bloc « Barre unique » (ordre par `order`, :has() pour les
     boutons de Puck ; libellés PROJET / PAGE cachés sous 1 500 px, boutons de
     zoom ± cachés sous 1 280 px). Vérifié à 1 600 et 1 366 px, vues double
     et retour, sur zz-test-barre (corbeille).
     Retouche le même soir (capture : chevauchement) : le nom de la page
     (bouton atl-pagemenu__btn, dont le style visait l ancienne barre) est
     coupé par « … » ; icônes 26 px, écarts 2 px, zoom, Enregistré et
     HTML / ZIP / Mirror plus petits ; menus Projet / Page à 100 px sous
     1 180 px. Aucun chevauchement de 1 100 à 1 536 px avec un nom très long.
     2e retouche (capture) : plus de trou entre Enregistré et HTML ; le groupe
     EN/FR … Enregistré est collé à HTML / ZIP / Mirror, la place libre reste
     après Page et le nom de la page s agrandit jusqu à 380 px.
   - **Audit ChatGPT des Fondations, lot 1 « Fiabilité » (2026-11-17)** —
     rapport ~/Downloads/audit-fondations-atelier-2026-11-17.md (F01–F10).
     Les 25 cas de l'audit reproduits d'abord (9/25 conformes, mêmes 16
     écarts), puis repris et complétés dans
     `node scripts/tests/fondations-fiabilite.mjs [--http]` (50/50 ; --http
     essaie l'API sur un projet jetable mis à la corbeille).
     · Module commun src/engine/fondations-etat.js : marqueurs (`realText`,
     `MARQUEUR`), recherche brute (`RESEARCH_KEY` : collecte*, liensRecherche,
     sites), empreinte v2 (faits, offre, message, questionnaire sans la
     recherche ; contenus des pages exclus), `statutFondations` (migration des
     empreintes v1 sans perte), `merge3` (fusion à trois versions, faits par
     id), `withIds`.
     · F01 : PUT /api/projects/<id> accepte If-Match (ETag du GET) → 409 si le
     projet a changé ; sans If-Match comme avant. saveProjectPatch envoie
     If-Match (réessaie seul pour les petites fiches). Fondations : patchFresh
     fusionne à trois versions questionnaire, faits, message, cartes ET offre ;
     conflit sur un même champ → bandeau « Garder ma version de ces champs /
     Reprendre la version enregistrée », rien n'est écrasé sans choix.
     · F04 : l'offre est gérée par les Fondations (OfferTab contrôlé :
     form / setForm / onSaveAll) → un seul « Enregistrer » pour tout ; le
     serveur recalcule le statut à chaque PUT (prix changé → « modifiée ») ;
     validées sans empreinte : la version enregistrée sert de référence.
     · F02 : fidelite.js `unitOf` (jours/semaines→jours, mois, ans, minutes,
     mg/g/kg, ml/l, gélules, flacons, portions, $ / USD / CAD / € / £ ;
     conversions sûres seulement) ; plus de joker « ? » ; un fait « à
     confirmer » ou « retiré » bloque le même chiffre écrit dans un texte ;
     la recherche brute et les résultats de Claude n'autorisent plus de
     chiffres ; emplacements entre crochets ignorés.
     · F03 : preuve cochée = détail réel exigé (ni vide ni marqueur) ;
     certification limitée aux labels écrits (Vegan ≠ FDA) ; négations
     (« ne pas écrire… ») et recherche brute n'autorisent rien ; toutes les
     occurrences d'une page sont jugées.
     · Partie commune de F06 faite : compteur des cartes, message central et
     script fondations-contenus.mjs ignorent les champs qui ne contiennent que
     des marqueurs (le script peut maintenant les remplacer). Partie de F10
     faite : chaque champ du tableau des faits a un nom accessible.
     · Effet mesuré sur les 6 pages de projet : 116 → 138 chiffres et 24 → 30
     affirmations signalés ; les nouveaux relus un par un sont justifiés (prix
     en £, garantie 60 j au lieu de 90, avis copiés, « gluten-free » sans
     preuve, ingrédient d'un autre produit).
     · Le script de l'audit (verify-foundations.mjs) extrait des fonctions du
     code de b9f6426 : il ne s'exécute plus sur le nouveau code, remplacé par
     scripts/tests/fondations-fiabilite.mjs.
     · Reste (lots 2 à 4 de l'audit) : F05 brouillon perdu en changeant
     d'onglet, états de champ complets (F06), F07 sources liées, F08
     mécanismes UMP/UMS + brief, F09 fiche d'offre structurée. Partie mobile
     de F10 écartée (pas d'édition depuis le téléphone, décision de
     l'utilisateur).
   - **Audit des Fondations, lot 2 « Usage quotidien » (2026-11-18)** :
     · F05 brouillon : Fondations.jsx range le brouillon non enregistré (et sa
     version de référence pour la fusion) dans localStorage
     `atl-fd-brouillon:<projet>` ; il revient après un passage par Angles, un
     rechargement ou une fermeture : bandeau « Brouillon repris · Enregistrer
     maintenant / Abandonner ce brouillon ». Indicateur dans la barre du bas
     (« ● Modifications non enregistrées » / « ✓ Tout est enregistré ») ;
     fermer ou recharger l'onglet avec un brouillon → le navigateur demande.
     · F06 : `contenuProgress` rend done (prêts), manques, renseignes ; les
     cartes affichent « 20 / 30 prêts · 10 [MANQUE] » ; conseil pour compléter
     les manques ; le script fondations-contenus.mjs note
     fondations.contenusEmpreinte en écrivant les cartes → si les faits,
     l'offre ou le message changent ensuite : bandeau « Cartes à relire » (rien
     n'est réécrit) et bouton « J'ai relu les cartes ».
     · F10 (bureau) : sommaire des étapes calé sous l'en-tête (--cat-top-h),
     focus visible, défilement sans animation si le système le demande ;
     suppression d'un fait annulable (« Annuler la suppression »).
     · Tests : scripts/tests/fondations-fiabilite.mjs --http → 53/53 (P04
     compteurs, H07-H08 empreinte des cartes). Essais navigateur sur
     zz-test-fd-lot2 (corbeille) : brouillon gardé après Angles et après
     rechargement, enregistrer / abandonner, cartes à relire, compteurs.
     · Pas fait (volontairement) : les 6 états par champ proposés par l'audit
     (vide, manque, brouillon, à relire, approuvé, obsolète) et « non
     applicable » ; la version légère ci-dessus couvre les cas testés.
   - **Audit des Fondations, lot 3 « Méthode » : F09 + F08 (2026-11-18)** —
     F07 (bibliothèque de sources) volontairement laissé pour plus tard.
     · F09 fiche d'offre : src/engine/offre-fiche.js (`packsCalcules`,
     `controlesFiche`, `faitsDeFiche`, `resumeFiche`, `packsDepuisTexte`),
     src/catalogue/OffreFiche.jsx dans l'étape « Preuves et offre », au-dessus
     du texte de vente. project.offreFiche = { devise, unite, packs[{ id, nom,
     quantite, offertes, prix, prixBarre, abonnement, cadence, populaire }],
     garantie, retours, livraison, bonus[{ nom, valeur, livre }], leviers
     (résultat, confiance, délai, effort : obstacle / réponse / preuve),
     rarete }. Unités totales, prix par unité et remise calculés ; contrôles
     (devise, prix barré, « 2+1 » sans économie, garantie > retours, bonus pas
     livrable, rareté sans condition…) ; « Les reprendre » propose les packs
     lus dans le texte de l'offre. Les chiffres de la fiche sont autorisés par
     fidelite.js ; la fiche entre dans l'empreinte de validation (seulement si
     elle existe) ; « Remplir depuis les Fondations » reçoit le résumé de
     l'offre.
     · F08 : src/catalogue/DecisionsMessage.jsx dans l'étape « Message
     central ». `Mecanismes` : 5 pistes au plus (nom, mécanisme du problème,
     de la solution, croyance, preuves nécessaires / disponibles, limites,
     formulations interdites, état hypothèse / étayée), « Choisir cette piste »
     + raison gardée (fondations.mecanismeChoisi), « Reprendre dans le message
     central », « Demander des pistes à Claude » (demande fondations avec
     details.mecanismes). `BriefCampagne` (fondations.brief) : avatar,
     situation, conscience, trafic, promesse de la pub, type de page, langue,
     action, preuves autorisées (faits validés + preuves documentées),
     objections prioritaires ; mécanisme et offre repris tout seuls ; « Copier
     le brief (Markdown) » et « Télécharger (JSON) » avec la révision des
     Fondations et les identifiants des preuves. Le mécanisme choisi entre
     dans l'empreinte ; la rédaction des pages reçoit mécanisme (marqué
     hypothèse s'il n'est pas étayé) et brief.
     · scripts/fondations-decisions.mjs (mecanismes | fiche) : écrit pour
     Claude sans rien remplacer (voir la procédure plus bas).
     · Tests : scripts/tests/fondations-fiabilite.mjs --http → 70/70 (O01-O13,
     M01, H09-H11). Navigateur, projet zz-test-fd-lot3 (corbeille) : packs
     repris du vrai texte de l'offre, calculs, contrôle garantie / retours,
     2 pistes, choix + raison, reprise dans le message, brief, enregistrement
     unique, « modifiée » après validation, relu après rechargement.
     · Pas testé de bout en bout : « Remplir depuis les Fondations » avec la
     fiche et le brief (demande une génération IA payante).
   - **Studio : retirer des images de « Images à refaire » (2026-11-18)** :
     studio-ui.jsx : « × » au survol de chaque vignette (caché pendant sa
     génération) → l image sort de la liste et de la file ; « Annuler » juste
     après ; « Remettre les images retirées (N) » les replace dans l ordre de la
     page. Retraits gardés par page dans localStorage
     atl-studio-retirees-<page> ; la page et les images déjà générées ne sont
     pas touchées. Testé sur zz-test-studio (corbeille) : 90 → 89 → annuler →
     88, gardé après fermeture / réouverture, « Remettre » → 90.
   - **Clones sous-traités à ChatGPT (Codex) + correction de l'import
     (2026-11-18)** : Codex accède à internet avec
     `codex exec -s workspace-write -c sandbox_workspace_write.network_access=true … < /dev/null`
     (sans `< /dev/null`, il attend l'entrée clavier et reste bloqué). Prompt
     = bloc de docs/prompt-chatgpt-cloner-pour-atelier.md + la page + un
     « cadre de travail » (dossier C:/Users/HP/Desktop/codex-travail/clones
     seulement, zip livré là). Titan (titan.email) : 13 sections, 99,6 % de
     pixels identiques, ~20 min ; zip vérifié (Vite seul, aucun script
     d'installation), puis `kimi-zip.mjs ~/zips/titan-accueil.zip
     titan-accueil --verifier-a-part`.
     · **Correction de scripts/kimi-import.mjs** : les règles posées sur des
     classes de <html> / <body> (Titan : « body.titan-v2 » porte toutes les
     variables de polices, tailles, couleurs) étaient jetées (aucun élément
     de la section ne porte la classe). `pageClasses` est relevé avec la page
     ; `pageHead` / `isPageSel` traitent « .titan-v2 », « .home .x »,
     « body.home .x » comme la règle de page : réécrits sur la section
     (« .atl-<section> »). Avant : titre du hero à 18 px en dm-sans ; après :
     51,2 px en titan-sans, comme l'original. Sauvegarde de l'ancien script :
     /tmp/kimi-import.avant-body.mjs.
   - **Page d'accueil NexTap en deux versions (2026-11-18)** : Birdie
     (birdie.care) cloné par Codex (11 sections, 98,7 %) et importé.
     Pages assemblées par /tmp/assembler-page.mjs <plan.json> (sections
     prises dans plusieurs pages, moteur « vierge » : textes en consignes,
     images vidées, `wireframe`) : nextap-accueil-titan et
     nextap-accueil-birdie, 19 sections chacune, projet nextap, hero =
     paleo-pro-accueil-p2. Version Titan : menu Titan fixe et transparent,
     d'où `marge_haut: 110` sur le hero. Celle qui n'est pas retenue part à
     la corbeille.
     · **Deux versions par base** (demande suivante) : /tmp/assembler-v2.mjs
     <plan.json> <original|stock> donne <base>-original (vrais textes et
     vraies images) et <base>-stock (Lorem ipsum du même nombre de mots ;
     le 1er titre de chaque section commence par « [ Nom — Titre H2 — 5 mots ] » ;
     chiffres gardés ; images picsum.photos à la taille du repère ; wireframe
     pour cacher les photos d'origine). Nom de section dans
     props.atl_nom_section. Plans : /tmp/plan2-titan.json, /tmp/plan2-birdie.json.
     Restent d'origine dans la version stock : le logo Titan du menu (fond
     CSS) et les 4 vidéos de « Le studio NexTap » (Birdie p7, écrites dans
     le gabarit).
     · **Pages sombres** : le grain de Paleo Pro (body::before, fixe, plein
     écran, z-index 2000) avait été recopié dans chacune de ses sections ;
     4 sections Paleo = 4 voiles empilés. /tmp/grain-fix.py : dans les 34
     sections paleo-pro-*, le voile passe en position absolue et la section
     en position relative (grain limité à la section). Sauvegardes :
     /tmp/grain-avant/. Puis, à la demande, le grain est **retiré** des 34
     sections (/tmp/grain-remove.py, à partir des sauvegardes).
     · **kimi-import.mjs** : une règle de page (html, body, classes de page)
     sur ::before / ::after avec « position: fixed » n'est plus recopiée
     (voile de page). Testé : règle seule sur exemples, et Titan réimporté
     sous « essai-voile-titan », CSS identique, puis mis à la corbeille.
     Sauvegarde : /tmp/kimi-import.avant-voile.mjs.
     · **Ordre d'origine + menu clair** : les pages suivent l'ordre exact de
     Titan / Birdie (Titan p13 « chiffres » remis), les sections empruntées
     s'intercalent. Menu et bandeau des logos Titan en clair (fond pêche du
     hero) : copies nextap-titan-menu-clair et nextap-titan-logos-clair
     (sections Titan d'origine intactes ; règles ajoutées en fin de
     style.css). Plan : 4e champ {"__type": "<copie>"} pour remplacer une
     section par sa copie. Version stock : images < 80 px (logos, icônes)
     gardées.
     · Bandeau « News » de Titan retiré de nextap-titan-menu-clair (menu 50 px),
     hero : marge_haut 60.
     · Idem sur titan-accueil (section titan-accueil-p1, seule page à l utiliser) :
     bandeau caché + fond rgb(17,17,19) au menu fixe. Sauvegarde :
     /tmp/titan-p1-style.avant-news.css.
     · Menus Titan (titan-accueil-p1, nextap-titan-menu-clair) en position
     relative : fixes, ils traversaient la page dans l éditeur. marge_haut du
     hero NexTap retirée.
   - **« Retravailler avec l IA » cassé (2026-11-18)** : « Cannot find module
     …/server/scripts/lib/ia.mjs ». server/api.mjs importait
     "./scripts/lib/ia.mjs" (chemin d avant le passage du code dans server/,
     atelier compilé depuis le 2026-11-17) : les 6 imports passent en
     "../scripts/lib/ia.mjs" (textes, images, Studio, Canvas, détourage,
     Redessiner). Sauvegarde : /tmp/api.avant-chemin-ia.mjs. Service relancé.
     · **Section retravaillée invisible** (« No configuration for <page>-ia-… ») :
     Puck 0.23 ne voit pas une section ajoutée en modifiant sa config en
     place. App.jsx passe maintenant une NOUVELLE config (useState) ; et
     filet dans applyReplacements (inspector-ui.jsx) : si la section n'est
     pas dans l'aperçu après 4 s, la page est enregistrée puis rechargée
     (c'est ce filet qui agit aujourd'hui). Testé sur une page jetable
     (essai-redessiner, à la corbeille). Sauvegardes : /tmp/App.avant-config.jsx,
     /tmp/inspector.avant-filet.jsx.
   - **« Ignorer » sur les sections conseillées (2026-11-18)** : bouton à côté
     de « Choisir un modèle » (engine/missing-slots.jsx) ; clé de la
     proposition gardée dans root.props.atl_ignores (Ctrl+Z annule) ; le clic
     géométrique de l'éditeur (inspector-ui.jsx, slotBoxAt) va au bouton
     Ignorer s'il est sous la souris. Le Score de vente compte encore ces
     familles comme manquantes. Sauvegarde : /tmp/missing-slots.avant-ignorer.jsx.
   - **Fenêtre « Retravailler avec l'IA » (2026-11-18)** : Annuler et
     Réécrire / Refaire / Redessiner montés sur la ligne des onglets
     (.atl-aidlg__tabrow, .atl-aidlg__actions) ; le pied ne garde que les
     messages et se cache s'il est vide. Sauvegardes :
     /tmp/inspector.avant-boutons-haut.jsx, /tmp/styles.avant-boutons-haut.css.
   - **Barre flottante qui suit la section (2026-11-18)** : ▲ / ▼ de la barre
     (CanvasToolbar, keepInPlace) font défiler l'aperçu d'autant que la
     section (ou l'élément) s'est déplacée, pendant 1,5 s : elle reste au même
     endroit de l'écran, la barre sous la souris, on peut cliquer plusieurs
     fois. Testé sur une page jetable (essai-barre, à la corbeille).
     Sauvegarde : /tmp/inspector.avant-barre-fixe.jsx.
   - **Stylet et croquis pour l'IA (2026-11-18)** : bouton « ✎ Stylet » dans
     la barre de l'aperçu (src/stylet-ui.jsx, monté dans App.jsx) : calque de
     dessin plein écran (5 couleurs, 3 épaisseurs, pression du stylet,
     Ctrl+Z, Effacer, Échap). « 📸 Enregistrer » : capture de l'onglet par
     getDisplayMedia (Chrome demande « Partager cet onglet ? »), recadrée sur
     l'aperçu, avec les sections touchées par le dessin ; POST
     /api/croquis/<page> → medias/croquis/<page>/croquis-<date>.jpg + .json
     (GET liste, DELETE vers corbeille/croquis). « Retravailler avec l'IA »
     propose les croquis de la page (ceux de la section d'abord, étiquette
     « cette section ») : clic = référence (Textes, Images) ou exemple à
     imiter (Design). Testé : dessin, route, propositions dans la fenêtre ;
     la capture elle-même n'a pas pu être essayée (le navigateur de test
     n'a pas la fenêtre de partage). Sauvegardes : /tmp/api.avant-croquis.mjs,
     /tmp/App.avant-stylet.jsx, /tmp/inspector.avant-croquis.jsx,
     /tmp/styles.avant-stylet.css.
     · Suite (testé par l'utilisateur : la capture marche) : × sur chaque
     croquis de la fenêtre IA (DELETE, vers corbeille/croquis) ; onglet
     Design en premier et ouvert par défaut quand la section peut être
     redessinée ; actions rapides propres à chaque onglet (QUICK.design : 16,
     QUICK.images : 11, QUICK.textes : 8). Sauvegardes :
     /tmp/inspector.avant-aidlg-v2.jsx, /tmp/styles.avant-aidlg-v2.css.
   - **Section depuis une image ou un croquis (2026-11-18)** : encart en haut
     de « Ajouter une section » (library-ui.jsx, AddSectionButton) : « Choisir
     une image sur l'ordinateur… » (sélecteur de fichiers) ou un croquis du
     stylet de la page, champ « Précisions », « Créer la section ».
     createSectionFromImage (inspector-ui.jsx, chargé à la demande pour
     éviter l'import circulaire) : /api/ia/section avec l'image en référence
     (consigne : reproduire la disposition, suivre les annotations d'un
     croquis, <img src=""> + alt aux emplacements d'image), section
     <page>-ia-… posée à l'emplacement choisi (même filet de rechargement).
     Testé sur une page jetable avec le croquis de l'utilisateur (titan).
     · Barre de l'aperçu aérée au-delà de 1280 px (gap 8 px, séparateurs
     10 px). Sauvegardes : /tmp/inspector.avant-depuis-image.jsx,
     /tmp/library.avant-depuis-image.jsx, /tmp/styles.avant-depuis-image.css.
   - **Stylet : dessin accroché à la page (2026-11-18)** : le croquis se
     décalait après un zoom (traits gardés en coordonnées d'écran). Les
     points sont maintenant dans le repère du contenu de l'aperçu (view /
     toPage / toScreen : place de l'iframe, zoom de l'aperçu, défilement) et
     redessinés toutes les 50 ms si quelque chose a bougé (minuterie, pas
     requestAnimationFrame) ; épaisseur suivant le zoom ; la molette fait
     défiler l'aperçu pendant le dessin. Testé : trait sur un titre, fenêtre
     redimensionnée, molette : le trait reste sur le titre.
   - **« Unexpected token '<', "<!DOCTYPE"… is not valid JSON » (2026-11-18)**
     sur « Refaire » une image : la page d'erreur HTML de Cloudflare (coupure
     à 100 s sans réponse) lue comme du JSON. Le service marche (23 s par le
     tunnel). Correctif : dans le bloc /api/ia (server/api.mjs), après 20 s
     la réponse commence (200) et un espace part toutes les 15 s ; une
     erreur arrive alors en 200 avec { error } (json local qui l'écrit).
     Éditeur : iaJson(res) lit la réponse (erreur aussi dans un 200, message
     clair si ce n'est pas du JSON) pour textes, images, Redessiner, section
     depuis une image, Studio. Testé : refonte d'image de 24 s, réponse
     « ␠{"url":…} » valide. Sauvegardes : /tmp/api.avant-keepalive.mjs,
     /tmp/inspector.avant-iajson.jsx.
     · **Vraie cause** (journal ajouté : « [ia] … reçue / erreur / terminée »
     dans journalctl -u atelier) : OpenAI refusait l'image source, « Invalid
     image data » (images AVIF des imports Kimi, envoyées comme PNG) ; le
     serveur répondait 502 et Cloudflare remplace les 502 de l'origine par sa
     page « serveur indisponible ». Correctifs : blobOf (scripts/lib/ia.mjs)
     convertit en PNG par « vips copy » tout ce qui n'est pas PNG/JPEG/WebP
     (AVIF, SVG, GIF…) ; erreurs IA en 500 au lieu de 502 ; message de
     l'éditeur avec le code (502, 524, 413…). Testé : refonte depuis une
     image AVIF de Titan, 25 s, OK. Sauvegardes : /tmp/ia.avant-avif.mjs,
     /tmp/api.avant-500.mjs.
   - **Panneau de droite par la languette + style au clic droit (2026-11-19)** :
     le panneau de droite ne s'ouvre plus quand on choisit une section ou un
     élément (ni au survol) ; languette ◂ / ▸ au bord droit (RightPanelTab,
     library-ui.jsx, classe html.atl-rp-open ; « Modifier » et « Réglages de
     la section » l'ouvrent aussi). Clic droit : Copier le style (style
     affiché : police, taille, graisse, couleurs, fond, coins, bordure, ombre,
     marges intérieures ; gardé dans localStorage atl-style-clip, donc d'une
     page à l'autre), Coller le style (section : fond, marges, couleur
     seulement), Couleurs… (texte, fond, bordure : couleurs du design + autre
     couleur + ↺ d'origine) et Police… (police titres / texte de la page,
     taille, graisse, interligne, espacement, casse, alignement) dans une
     petite fenêtre (StylePop, inspector-ui.jsx) ; écrit dans
     atl_styles[cible].all.base. Section : police par variables
     (--atl-font-body → titres, sans boucle). Testé sur une page jetable.
     Sauvegardes : /tmp/inspector.avant-menu-style.jsx,
     /tmp/library.avant-languette.jsx, /tmp/App.avant-languette.jsx,
     /tmp/styles.avant-menu-style.css.
     · Correctif : ma fonction writeStyle (style du clic droit) masquait
     writeStyle d'origine (style en ligne, bouton 👁 Masquer) : renommée
     applyStyleDecl.
   - **Poignée de hauteur des sections (2026-11-19)** : section choisie (pas
     un élément) → bande « ⇕ Hauteur » sur son bord bas (SectionResizer,
     inspector-ui.jsx) ; tirer change la hauteur en direct (min-height en
     ligne), au lâcher atl_styles.section.all.base.min-height ; double-clic :
     hauteur d'origine ; si le bas de la section est sous l'aperçu, la
     poignée reste au bas de l'aperçu. Testé : 518 → 668 px, gardé après
     rechargement, double-clic → 518. Sauvegardes :
     /tmp/inspector.avant-poignee.jsx, /tmp/styles.avant-poignee.css.
   - **Stylet → IA en un clic (2026-11-19)** : après « Enregistrer », la barre
     du stylet propose « 🖼 Créer une section avec ce croquis » (événement
     atl-add-section { index : après la section dessinée, image } : la
     fenêtre « Ajouter une section » s'ouvre avec le croquis déjà choisi) et
     « ✨ Retravailler cette section » (événement atl-ai-section { sectionId,
     image } : fenêtre IA sur la section, onglet Design, croquis en exemple à
     imiter via target.reference). Testé : les deux fenêtres s'ouvrent comme
     prévu (la capture elle-même ne peut pas être faite dans le navigateur de
     test). Sauvegardes : /tmp/inspector.avant-stylet-next.jsx,
     /tmp/library.avant-stylet-next.jsx.
   - **Retour au même endroit après un rechargement (2026-11-19)** :
     RetourPosition (library-ui.jsx, monté dans App.jsx) relève toutes les
     400 ms la position de l'aperçu et la section choisie ; au départ
     (beforeunload / pagehide) les garde dans sessionStorage « atl-retour »
     pour la page ; au chargement, y revient (plusieurs passages, arrêt si
     l'utilisateur touche à l'aperçu) et choisit de nouveau la section. Après
     une section créée ou refaite par l'IA (rechargement de secours),
     goToAfterReload (inspector-ui.jsx) note cette section : la page s'ouvre
     sur elle. Testé : F5 depuis 8 658 px → 8 658 px ; section notée → en
     haut de l'écran et choisie. Sauvegardes : /tmp/inspector.avant-retour.jsx,
     /tmp/library.avant-retour.jsx, /tmp/App.avant-retour.jsx.
   - **Glisser un élément dans l'aperçu (2026-11-19)** : poignée ⋮⋮ dans la
     barre flottante d'un élément ou d'un groupe qui a des frères dans le
     même bloc ; startNodeDrag (inspector-ui.jsx) : élément estompé, ligne
     bleue horizontale (frères empilés) ou verticale (côte à côte),
     défilement auto près des bords, au lâcher moveNode (même parent, comme
     dans Structure ; Ctrl+Z annule). Testé : image glissée au-dessus du
     bloc de texte (ordre IMG, H2). Sauvegarde : /tmp/inspector.avant-glisser.jsx.
   - **Importer depuis WinningHunter (2026-11-20)** : bouton « WH » dans Canvas
     → fenêtre WhImport (src/winninghunter-ui.jsx) : clé à coller une fois
     (vérifiée par /credits, gardée dans .env.local : WINNINGHUNTER_API_KEY,
     jamais sauvegardée sur GitHub), recherche (marque / site / texte,
     Vidéos-Images-Tout, tri : pertinence, plus longue diffusion, dépenses,
     récentes), vignettes (vidéo jouée au survol), cocher, Importer → fichiers
     dans les médias du projet (televersees/, préfixe wh-), posés en grille
     (4 colonnes) sur le tableau (placeGrid, canvas-ui.jsx ; vidéos en cadre
     cliquable comme « Ajouter une vidéo »). Serveur /api/wh/statut, /cle,
     /recherche (GET app.winninghunter.com/api/v1/adlibrary, en-tête
     X-API-Key, 1 crédit par page, 60 demandes/min ; champs video, poster,
     image, cards), /importer (https seulement, hôtes winninghunter.com,
     fbcdn.net, facebook.com, cdninstagram.com ; 80 Mo max). Testé : routes
     sans clé, import réel de vidéos/aperçus/image WinningHunter, refus d'un
     autre hôte, fenêtre + pose en grille avec une réponse de recherche
     simulée (la recherche réelle attend la clé). Sauvegardes :
     /tmp/api.avant-wh.mjs, /tmp/canvas.avant-wh.jsx, /tmp/styles.avant-wh.css.
   - **Panneau de droite rangé (2026-11-17, claude.docx « un peu brouillon »)** :
     styles.css, bloc « Panneau de droite rangé » en fin de fichier. Lignes de
     réglage (.atl-style__row) en grille : libellé 72 px, réglage sur toute la
     largeur ; libellés raccourcis (Espacement, Largeur max., Puce) ;
     « d'origine » en Inter (plus en police de code) ; Style de texte libellé
     au-dessus ; Rôle visuel aligné ; champ de rédaction 56 px de haut ; menu
     des écrans sur deux rangs (Ordinateur · Téléphone, puis Tous les écrans) ;
     pastilles (graisse, style) qui passent à la ligne proprement ; Copier /
     Coller le style même largeur ; Marges haut / bas dans la largeur ; plus de
     languette « ‹ » sur le contenu quand le panneau est ouvert. Vérifié :
     aucun réglage ne dépasse le panneau (élément, bloc, section copiée).
   - **Audit « Ensuite », lot 1 « Fiabiliser » (2026-11-17)** :
     - T1 chiffres avec leur nature (src/engine/fidelite.js) : `kindOf`
       (argent, pourcent, durée, note, dose, fois, nombre), `knownNumbers`
       renvoie des faits nombre → natures (contexte du texte, sinon nom du
       champ : prix, garantie…), `knowsFig`. Un prix de 30 n'autorise plus
       « 30 jours » ; « 100 % » est vérifié ; « 90-day » repéré. Testé sur 11
       cas. Pas fait : affirmations sans nombre (certifications, origine…),
       faits typés saisis dans les Fondations.
     - T3 conflits d'écriture des pages : vite.config.js (`pageRev`, empreinte
       sha1 ; `pageWriters`, dernier onglet ; ETag au GET et au PUT ; PUT avec
       If-Match périmé venant d'un autre onglet → 409). src/main.jsx pose
       X-Atl-Tab sur chaque appel /api/ ; App.jsx envoie If-Match et affiche
       le bandeau « Cette page a été modifiée ailleurs » (Garder ma version =
       copie de sécurité de l'autre puis enregistrement ; Voir l'autre version
       = recharger). Les écritures du même onglet (palette, essai) ne bloquent
       pas. Pas fait : brouillon / version validée des Fondations.
     - T5 bilan d'import (scripts/kimi-zip.mjs) : étapes import, réparation,
       fiche, vérification notées par page ; « ⚠ importée mais NON validée »
       si une étape manque ; code de sortie 0 tout validé, 2 partiel, 1 échec.
       Pas lancé sur un vrai import (vérifié à la compilation).
     - T4 export HTML (tools-ui.jsx `buildHtml` → { html, bilan }) : langue de
       la page (lang=), sections non rendues signalées (au lieu d'être sautées
       en silence), médias de l'atelier intégrés aussi depuis le CSS, bilan à
       la fin (sections, médias intégrés ou introuvables, photos d'origine
       retirées, polices Google, ressources et liens restés en ligne). Vu sur
       la copie Paleo : des ressources pointent encore vers paleopro.com. Pas
       fait : ZIP autonome.
   - **Propositions IA avant application (2026-11-17)** : inspector-ui.jsx
     `PageAiDialog` récolte les textes des outils de page (Réécrire pour mon
     produit, Décliner pour cet angle, Remplir depuis les Fondations,
     Traduire) au lieu de les écrire ; `ProposalReview` les montre par
     section, avant → après (un texte, ou « Voir tout »), cases à cocher,
     ↗ pour voir la section, « Appliquer N section(s) » (une étape setData,
     Ctrl+Z) ou « Tout rejeter ». Les sections décochées restent en attente.
     Fermer avec des propositions en attente demande confirmation. Testé avec
     une réponse IA simulée (aucun appel payant). Pas concernés : retravail
     d'une seule section (bandeau « Revenir à avant »), Adapter toute la page
     (sections redessinées, bandeau « Revenir à avant »).
   - **Fondations en sous-étapes + brouillon / version validée (2026-11-17)** :
     src/catalogue/Fondations.jsx. Cinq étapes (Produit et clients · Preuves
     et offre · Recherche clients · Message central · Contenus des pages),
     sommaire collant en haut avec l'état de chaque étape (✓ quand le minimum
     est là), une étape affichée à la fois (les autres restent montées :
     l'offre non enregistrée n'est pas perdue), barre collante en bas
     (← étape · étape → · Enregistrer · Compléter avec Claude · Valider).
     Résultats de Claude repliés (résumé + clic). Statut « modifiée » :
     `empreinte` (réponses, message, contenus) gardée à la validation
     (valideEmpreinte, version) ; un enregistrement qui change le contenu
     passe en « Modifiées depuis la validation… », étape « à revalider »,
     bouton « Valider à nouveau » (version + 1). Enregistrer sans changement
     garde « validées ». L'offre (project.offre) n'entre pas dans l'empreinte.
   - **Miroring sans textes ni images d'origine (2026-11-17)** :
     src/engine/placeholders.js (`placeholderContent`, `brief`) : chaque
     texte devient « [ Titre H2 — 7 mots ] » (rôle et longueur d'origine),
     chiffres gardés en forme (0,00), images vidées, props.wireframe (photos
     d'origine cachées). projects.js : `createPage({ …, vierge })` et
     `mirrorIntoPage(name, source, { vierge })` (origine.vierge noté).
     Proposé dans le catalogue : « Utiliser ce template » (case « Sans les
     textes ni les images d'origine »), menu ▾ et aperçu du template
     (« Remplacer … sans textes ni images d'origine »), onglet Pages du projet
     (case sous « Template ou page »). L'original reste visible avec la vue
     « Édition + originale ». La « version wireframe » de l'atelier
     (original-ui.jsx) garde son propre code, même résultat. Testé sur
     zz-test-vierge (8 sections, 209 images vidées).
   - **Sélecteur de police avec aperçu (2026-11-17)** : src/font-picker.jsx
     (`FontPicker`) dans Palette → « Polices et fond de la page », à la place
     des deux champs à taper. Liste par famille (src/engine/fonts.js,
     `FONT_GROUPS`, ~60 polices Google) + polices des designs du catalogue
     (« à vérifier ») + nom libre ; chaque police s'affiche dans sa forme
     (chargement léger text=, seulement les lignes visibles) ; « Celle du
     design » remet la police du design.md. Vérification Google Fonts par
     chargement de la feuille (✓ ou ⚠ introuvable). Police de secours selon
     la famille (`fallbackOf` : serif, sans-serif, cursive, monospace), aussi
     utilisée par brand.js (--atl-font-*) et charte.js. Le panneau de style
     garde « police des titres / du texte » (rôles).
   - **Couverture en direct + vitesse d'ouverture (2026-11-17)** :
     - Couverture : badge du chiffre sur le rail (left-ui.jsx, scorePage à
       chaque modification ; vert ≥ 80, orange ≥ 50, rouge) ; le catalogue
       relit pages et couvertures en revenant sur son onglet
       (visibilitychange, Projets.jsx et Pages.jsx).
     - Vitesse : scripts/mesure-ouverture.mjs (playwright-core, Edge) mesure
       l'ouverture d'une page (première section, requêtes, octets, à froid et à
       chaud). Avant : 4,6 s / 17,2 Mo à froid, 3,9 s / 4,1 Mo à chaud, 516
       requêtes. Corrigé : /api/sections-data compressé niveau 6 (2,7 → 2,1 Mo)
       avec ETag et « 304 » ; toutes les lectures de l'API (json() de
       vite.config.js) portent un ETag (304 si inchangé) ; src/main.jsx
       regroupe les lectures identiques lancées en même temps. Après : 15,3 Mo
       à froid, 0,1 Mo à chaud, 473 requêtes ; le temps reste ~4,1-4,6 s sur
       le serveur (459 modules servis un par un par Vite en mode
       développement : le vrai gain demanderait une version compilée, donc
       sortir l'API de vite.config.js — audit T6).
     - Constaté : le serveur a manqué de mémoire (6 Go) à 15 h 44 après un
       redémarrage de Vite dû à un changement de vite.config.js (processus
       lancé depuis 4 jours) ; relancé par systemd en ~1 min. Après un
       changement de vite.config.js, préférer « sudo systemctl restart
       atelier » (mémoire libérée).
   - **Galerie « Ajouter une section » : favoris, récents, filtres (2026-11-17)** :
     src/gallery-prefs.js (`useGalleryPrefs`, `toggleFavori`, `pushRecent`,
     `traitsOf`) + /api/galerie (galerie.json à la racine : favoris ≤ 300,
     récents ≤ 12). library-ui.jsx `AddSectionButton` : ☆/★ sur chaque
     modèle (sans fermer la galerie), rangées « ★ Tes favoris » et « Ajoutés
     récemment » avant les familles, filtres Tous · ★ Favoris · Avec image ·
     Sans image · Questions / accordéon (dans une famille ou une recherche ;
     tirés de meta.arbre pour les copies, du schéma pour les sections du
     catalogue). Pas encore dans l'outil « Ajouter » du rail.
   - **Importer : la source d'abord, état des demandes (2026-11-17)** :
     Enrichir.jsx : 5 cartes (capture, site, bibliothèque, style d'un site,
     IA) ; le formulaire choisi seul (les autres restent montés, cachés) ;
     « ← Choisir une autre source » ; détails techniques (dossier demandes,
     Copycat, REA, design.md) dans « Comment ça marche » replié ; textes sans
     jargon. Catalogue.jsx, Demandes : bandeau « N demande(s) en attente de
     Claude — prochaine étape… », états lisibles (En attente de Claude ·
     Claude y travaille avec progression faites / total · Traitée · À
     reprendre si r.erreur ou progression.erreur), ligne « Prochaine étape »
     sur les demandes en attente, liste relue toutes les 8 s quand l'onglet
     est ouvert. Les statuts écrits par Claude ne changent pas (en attente,
     en cours, traitée ; erreur dans « erreur » si besoin).
   - **Affirmations sans chiffre (2026-11-17, audit T1 suite)** :
     src/engine/fidelite.js `CLAIMS` (certification / label, étude / preuve
     scientifique, expert / médecin, presse, prix / classement — « fortes » —
     puis origine, garantie, composition « naturel », disponibilité / urgence),
     `claimsIn`, `knownClaims` (preuve cochée en partie 4 sans [MANQUE], ou
     affirmation écrite dans le questionnaire, le message central, l'offre ou
     la fiche ; garantie de l'offre ; pour l'origine le pays doit
     correspondre), `claimKnown`, `unknownClaims`, `hasUnknownClaim`.
     localFidelity renvoie `affirmations` ; Couverture → Fidélité aux
     Fondations les liste (« ! » forte, « ? » à vérifier) ; l'audit IA les
     reçoit (affirmationsHorsFondations) ; « Remplir depuis les Fondations »
     remplace un texte qui contient une affirmation forte sans preuve par
     « [À compléter : preuve absente des Fondations] ». Testé sur 12 phrases
     et sur une page zz rattachée à un projet zz (corbeille). Limite : une
     liste de mots, pas une compréhension du texte (une tournure absente de
     la liste passe).
   - **Angles comparés (2026-11-17)** : src/catalogue/Angles.jsx. Message
     central replié (promesse sur une ligne, `MessageRecap open={false}`),
     encadré « Socle commun » (produit, prix, mécanisme). Mêmes critères pour
     chaque angle (`CRITERES` : public, situation, douleur, promesse, objection
     principale, preuve disponible) + page associée ; objection et preuve
     proposées depuis le message central et les preuves cochées (datalist,
     saisie libre). Vue Cartes ou « Tableau comparatif » (cases vides
     teintées). Statut des angles choisis : « Hypothèse à tester » / « Angle
     retenu » (angles[].statut). Nouveaux champs : situation, objection,
     preuve, statut (projets/<id>.json).
   - **Export ZIP autonome (2026-11-17)** : tools-ui.jsx `DownloadZipButton`
     (bouton « ZIP » à côté de « HTML »), `buildHtml(data, { zip: true })` :
     index.html + assets/ (médias de l'atelier) + fonts/ (polices Google : les
     feuilles @import et les url(fonts.gstatic.com) des styles, téléchargées) +
     LISEZ-MOI.txt (bilan, `bilanLines`). Les ressources du site d'origine
     (polices pp-…, images sur paleopro.com…) ne sont jamais incluses (licence,
     comme les photos d'origine) : listées « restées en ligne ». Testé sur une
     page zz : 1 image dans assets/, 12 polices dans fonts/, plus aucun appel à
     Google. Vu en passant : dans l'éditeur, les polices « assets/… » des
     copies ne se chargent pas (chemin relatif) ; les polices Google du design
     prennent le relais.
   - **Faits chiffrés typés dans les Fondations (2026-11-17)** :
     Fondations.jsx `FaitsEditor` (étape « Preuves et offre ») :
     fondations.faits[] = { nature (argent, pourcent, durée, note, nombre,
     dose, fois), valeur, unité, source, état (à confirmer, validé, retiré) } ;
     « Reprendre les chiffres déjà écrits » les propose depuis le
     questionnaire et l'offre (à confirmer). fidelite.js `knownNumbers` :
     « validé » autorise ce chiffre avec sa nature, « retiré » l'interdit même
     s'il reste écrit dans les Fondations. Les faits entrent dans l'empreinte
     de validation (changer un fait → « à revalider »).
   - **vite.config.js découpé (2026-11-17, audit T6)** : server/commun.mjs
     (dossiers, readBody, json + ETag, Supabase, vignettes, pageRev /
     pageWriters), server/sections.mjs (sectionsBundle, /api/sections-data),
     server/api.mjs (atelierApi : toute l'API, code inchangé),
     server/rechargement.mjs (rechargement sûr) ; vite.config.js = la
     configuration seule (30 lignes). Déplacement mécanique (scripts de
     découpe et de vérification des noms), 24 essais de l'API passés, éditeur
     ouvert normalement. Un changement dans server/*.mjs redémarre Vite comme
     avant : relancer ensuite avec « sudo systemctl restart atelier ».
     Prochaine étape possible (non faite) : servir l'atelier compilé (vite
     build) avec ces modules, pour une ouverture plus rapide.
   - **Sauvegarde du projet (audit T2, 2026-11-16)** : `saveProjectPatch`
     (Projets.jsx) lève une erreur marquée `shown` si la lecture, le
     serveur ou la connexion échouent ; les appelants n'affichent pas de
     succès et ne lancent pas de demande après un échec.
   - **Réglages de la page allégés (2026-11-13)** : rail de gauche → Réglages
     ne garde que le nom de la page, son type et la page d'achat liée. Page
     d'un projet : « Marque et produit · du projet » en lecture seule (produit,
     client visé = celui de l'angle, ce qu'on sait du produit) + lien
     « Modifier dans le projet » ; photos du produit et logo restent
     modifiables. `ProjectBrandSync` (inspector-ui.jsx, monté dans App.jsx)
     remplit à l'ouverture `infos` (description + Fondations : rôle,
     composition, utilisation, sans les lignes [MANQUE] / [À VALIDER] ;
     réécrit seulement si vide ou `infosAuto`), `produit` et `logo` s'ils sont
     vides. `profil` n'est jamais touché. Page hors projet : fiche modifiable
     comme avant. Polices des titres / du texte et fond de la page : rail →
     Palette, bloc « Polices et fond de la page » (retirés de `rootFields`).
     Ancienne voie, gardée pour les anciennes demandes :
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
        `medias/projets/<projet>/images-creees/` (page d'un projet, nom préfixé
        par la page) ou `medias/<page>/` (hors projet), et pose dans la page
        (copie de sécurité avant) ; en mode pub : rangé dans `…/pubs/` de ce
        dossier, la page ne change pas.
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

## Blocs qui apparaissent au défilement (piège des pages Kimi, 2026-11-10)

Beaucoup de sites font apparaître leurs blocs en fondu quand on fait défiler
(`.reveal { opacity: 0 }`, puis une classe `in` ajoutée par leur script). Dans
l'atelier ce script ne tourne pas : le bloc reste **transparent**. Il est dans
la page, il prend sa place, mais on ne le voit pas, et la note de fidélité ne
le signale pas. Exemple : la section « Tested, not just claimed / Light Labs »
de `paleo-pro-paleo-protein-powder`, et 41 blocs de `paleo-pro-accueil`.

- Les copies faites par `copie.mjs` relèvent les styles après le défilement :
  pas concernées.
- Les pages Kimi (et toute section écrite à la main) : après l'import, ouvrir
  `/partage/<page>`, faire défiler, et compter les éléments avec du texte dont
  `opacity` vaut 0. Correctif sûr, ajouté en fin de `style.css` de la section :
  `.atl-<id> .reveal { opacity: 1 !important; transform: none !important; }`.
- Les règles `.aos-initialized [data-aos…]` ne jouent pas (la classe n'est
  jamais posée) ; `.is-hidden` est un vrai état caché : ne pas y toucher.

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
parmi ses voisins. Depuis le 2026-11-10 : seuls les voisins visibles et non
absolus comptent (un bouton de menu mobile caché décalait tout d'une case), et
rangées/colonnes se calculent par chevauchement (un logo centré plus bas que
le menu reste dans la même rangée). Les copies faites avant cette date peuvent
avoir l'en-tête en escalier : les refaire avec `advertorial-page.mjs <copie>
--par-sections` (sans recapture).

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

### Audit du design d'une page (2026-11-11)

Dernière étape avant l'export, après le contenu : sections manquantes →
« Remplir depuis les Fondations » → fidélité aux Fondations → **design**.

- **Contrôle immédiat, sans IA** : outil Score → bloc « Design » → « Contrôler
  le design » (`src/engine/design-check.js`, `DesignCheck` dans
  `src/score-ui.jsx`). La page enregistrée est rendue comme à la publication
  (`/partage/<page>?reperes=1`) dans deux cadres cachés, 1440 × 900 et
  390 × 844. Constats, chacun avec sa section : page qui dépasse à droite,
  texte coupé, image qui ne s'affiche pas, contraste trop faible, texte de
  moins de 12 px, bouton de moins de 40 px au téléphone, premier bouton sous la
  ligne de flottaison, grand titre sur plus de 4 lignes au téléphone, plus de 3
  polices. Note sur 100 (poids et plafonds par type : `WEIGHT`). Limites : un
  texte posé sur une photo n'a pas de contraste calculable (sauté) ; survols et
  menus ouverts non vus.
- **Demande « auditdesign »** (bouton « Demander l'audit approfondi à Claude »,
  `details.page`) : avec le tunnel ouvert, lancer Impeccable sur la page
  partagée, aux deux largeurs :
  `sh ~/.claude/skills/impeccable/scripts/impeccable detect --json --viewport 1440x900 http://localhost:5181/partage/<page>`
  puis `--viewport 390x844` ; lire aussi la page (capture) pour la hiérarchie,
  les espacements et la cohérence avec le design.md du projet. Écrire dans
  `resultat` : la note sur 20, les problèmes par gravité (P1 à P3) en français
  simple, chacun avec la section et quoi changer. Ne rien modifier dans la page
  sans l'accord de l'utilisateur.

### Contenu par type de page (Fondations, partie 9 — 2026-11-10)

`fondations.contenus[<type>][<section>][<champ>]` : ce que chaque section doit
dire pour ce projet, pour 7 types de page (advertorial, listicle, comparatif,
landing, offre, produit, accueil). La liste des sections et des champs est dans
`src/engine/page-blueprints.js` : `blueprintOf(type)` reprend les règles du
Page Score (`RULES`, même ordre, mêmes raisons) et y ajoute les champs à
écrire ; `FICHES` donne pour chaque type son trafic, sa mission et ses règles.
Une seule liste : pour ajouter une section attendue à un type, on l'ajoute dans
`RULES` (le Score, les cadres « section manquante » et les Fondations suivent),
puis ses champs dans `BASE` ou `PAR_TYPE`.

- Étape 1 (faite) : les cartes dans l'onglet Fondations, remplies à la main ;
  questionnaire : `reponses.curiosite` et `reponses.aggravation` (blocs
  « Curiosity » et « Corruption » de la recherche psychographique de Jeffrey).
- Étape 2 (faite) : « Remplir avec Claude » (voir ci-dessous).
- Étape 3 (faite) : dans l'éditeur, ✨ IA → Textes → **« Remplir depuis les
  Fondations »** (`FillFromFoundations`, `src/inspector-ui.jsx`). Liste les
  sections de la page ; pour chacune, `familiesOf` (la détection du Page Score)
  donne ses familles et `briefFor(type, familles, contenus)` le contenu des
  Fondations qui lui correspond. On coche une section, plusieurs ou toutes ;
  l'IA de l'atelier (`/api/ia/textes`) répartit le contenu dans les textes, à
  leur longueur, dans la langue de la page. En-tête et pied de page ne sont
  jamais remplis. Sur une page d'angle, les zones d'angle reçoivent aussi la
  carte de l'angle. « Réécrire pour mon produit » reste l'outil libre.
  **Règles dures, dans le code et pas seulement dans la consigne** (essai du
  2026-11-10 sur la page produit de « projet test menu » : l'IA a réécrit les
  avis du site d'origine en faux avis et repris un chiffre marqué [À VALIDER]) :
  1. les avis clients ne sont jamais écrits par l'IA : la section d'avis est
     sautée, le champ « avis » n'est pas envoyé ; à placer à la main ;
  2. une ligne (ou un morceau séparé par « · ») marquée [MANQUE] ou
     [À VALIDER] n'est pas envoyée ; une ligne faite seulement d'un
     [À VALIDER] bloque tout le champ (`sansNotes`) ; une section dont tout le
     contenu est ainsi marqué est sautée ;
  3. chaque texte rendu par l'IA est contrôlé (`hasUnknownFigure`) : un prix,
     un %, une durée, une note ou un nombre d'avis absent du projet est
     remplacé par « [À compléter : chiffre absent des Fondations] ».
  L'éditeur enregistre tout seul : faire une copie de sécurité avant
  (`POST /api/pages/<page>/snapshot`) et essayer d'abord sur une copie jetable.
  Limites connues : les textes que l'IA ne peut pas atteindre (cellules d'un
  tableau comparatif) et les libellés repris de la page d'origine restent ; le
  bloc « Fidélité aux Fondations » du Score les montre.
- Étape 4 (faite) : audit de fidélité aux Fondations, en deux temps
  (`src/engine/fidelite.js`) :
  1. **contrôle immédiat, sans IA** — bloc « Fidélité aux Fondations » de l'outil
     Score (`FoundationsCheck`, `localFidelity`) : chiffres « qui engagent »
     (prix, %, durées, nombres d'avis, doses) écrits sur la page mais absents
     des Fondations ; notes « [MANQUE] » / « [À VALIDER] » restées dans la page ;
     contenu prêt dans les Fondations sans section pour le recevoir ; nombre de
     sections qui ont un contenu prévu. Marche quelle que soit la langue de la
     page (on compare des nombres). Un clic mène à la section ;
  2. **audit IA** — ✨ IA → Auditer la page : pour une page d'un projet dont le
     message central est rempli, la page envoie aussi `fondations`
     (`fondationsPourAudit` : message central, preuves cochées, offre, interdits,
     contenu prévu, et les chiffres relevés par le contrôle local). L'IA rend
     `fondations: { note, points[promesse, mecanisme, preuves, objections,
     offre, allegations], nonAutorise[] }` (`AUDIT_FONDATIONS`, `scripts/lib/ia.mjs`).
  Les sections manquantes et leurs cadres en pointillés ne changent pas.

**Demande « fondations » avec `details.contenus` (liste de types)** — bouton
« Remplir avec Claude » de la partie 9. Sur le serveur, depuis `~/atelier-sites` :

1. `statut` → « en cours » ; lire `projets/<projet>.json` : `fondations.reponses`,
   `resultats`, `message`, `offre`, `angles` (les angles cochés).
2. `node scripts/fondations-contenus.mjs lister <projet> <types>` : le plan de
   rédaction (sections, raisons, champs, aides, ce qui est déjà rempli) ;
   `… modele <projet> <types> > /tmp/<projet>-contenus.json` : le fichier à
   remplir, avec seulement les champs encore vides.
3. Écrire chaque champ avec le skill `landing-page-jeffrey-arsh` (référence du
   type de page) : dans la langue du projet, aux longueurs demandées par l'aide
   du champ, avec les mots des clients (`resultats.mots`, collecte). Toutes les
   pages reprennent le message central (même promesse, même mécanisme, les 3
   preuves, les 3 objections). Listicle et page d'accueil : tous les angles
   (une raison par angle coché). Landing, offre, advertorial : la version de
   base ; les sections « Angle » seront déclinées par angle ensuite.
   **Aucune preuve, aucun chiffre, aucun avis, aucune garantie** qui ne soit
   coché dans `reponses.preuves` ou écrit dans `offre` : sinon « [MANQUE : …] ».
   Les avis : seulement ceux collés par l'utilisateur (collecte), jamais inventés.
3 bis. **Toujours avec ChatGPT (demande de l'utilisateur, 2026-11-17)**, sur le
   PC de Claude, dossier `C:/Users/HP/Desktop/codex-travail/` (ChatGPT n'écrit
   jamais dans l'atelier) :
   a. **Deuxième rédaction** : mêmes sources que Claude (réponses, résultats,
      message, offre, angles, données WinningHunter récupérées par Claude) et le
      fichier à remplir ; ChatGPT écrit sa version des champs.
   b. **Deuxième réflexion** : angles et objections oubliés.
   c. **Vérification** de la version retenue : affirmation sans source,
      chiffre absent des données, promesse trop forte, contradictions,
      contenu attendu pour le type de page qui manque.
   Commande : `codex exec -s read-only -C "C:/Users/HP/Desktop/codex-travail"
   --skip-git-repo-check -o resultat.txt "consigne"`. **Claude fait le tri** :
   meilleur de chaque version, mêmes règles qu'au point 3 (une preuve inventée
   par ChatGPT est rejetée → « [MANQUE] »). Le `resultat` de la demande dit en
   une ligne ce qui vient de ChatGPT et ce qui a été écarté. WinningHunter n'est
   pas visible par ChatGPT en `codex exec` : Claude l'interroge lui-même.
3 ter. **Demande « fondations » avec `details.mecanismes`** (bouton « Demander des
   pistes à Claude », Message central) : écrire au plus 5 pistes en tout
   (le nombre manquant est dans la demande), chacune avec nom, ump (mécanisme
   du problème), ums (de la solution), croyance, preuvesNecessaires,
   preuvesDispo (seulement des faits validés ou preuves cochées), limites,
   interdits. Toutes restent « hypothèse » : c'est l'utilisateur qui choisit et
   qui marque « étayée ». Deuxième rédaction et vérification par ChatGPT
   comme au 3 bis. Écrire avec
   `node scripts/fondations-decisions.mjs mecanismes <projet> /tmp/<projet>-pistes.json`
   (refus au-delà de 5 ; rien n'est remplacé ; copie dans projets/_historique/).
   **Demande « offre »** : en plus des champs de texte de l'offre, compléter la
   fiche d'offre (packs, devise, garantie, retours, livraison, bonus, leviers)
   avec `node scripts/fondations-decisions.mjs fiche <projet> /tmp/<projet>-fiche.json`
   (seuls les champs vides ; les contrôles s'affichent à la fin). Aucun prix,
   aucune garantie ni aucun bonus inventés : seulement ce que l'utilisateur a
   écrit ou validé ; bonus « livre: false » tant qu'il n'existe pas.
4. `node scripts/fondations-contenus.mjs ecrire <projet> /tmp/<projet>-contenus.json`
   (`--dry` pour voir avant) : un champ déjà rempli n'est jamais remplacé, un
   champ hors plan est refusé, copie du projet dans `projets/_historique/`.
   Le script pose `fondations.contenusRemplisLe`.
5. `statut` → « traitée », `resultat` : nombre de champs écrits par type, liste
   des [MANQUE]. L'onglet Fondations relit le projet avant d'enregistrer : un
   onglet resté ouvert n'efface pas ce travail (il faut recharger pour le voir).
- Nouveau type de page : `comparatif` (Compare landing page de Jeffrey).
- Quand Claude remplira ces champs : mêmes règles que le message central
  (aucune preuve non cochée, « [MANQUE] » sinon, ne pas écraser un champ déjà
  rempli par l'utilisateur).

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

**Corrigé le 2026-11-11** (import de la page Scooch livrée par ChatGPT, prompt
`docs/prompt-chatgpt-convertir-clone.md`) :
- `kimi-zip.mjs` marche aussi sur le serveur (décompression dans `~/kimi-pages`
  avec Python ; avant, chemin et `tar` du PC en dur) ;
- `kimi-import.mjs`, sélecteurs : on ne coupe plus aux virgules échappées
  (classes Tailwind `grid-cols-[repeat(auto-fill,minmax(52px,1fr))]`), et un
  deux-points échappé (`.lg\:flex-row`) n'est plus pris pour une pseudo-classe :
  toutes les règles `lg:` / `md:` étaient jetées (page en mobile sur ordinateur) ;
- rem → px à la taille réelle de la racine (`html { font-size: 62,5 % }`) :
  tout était 1,6 fois trop grand dans l'atelier.
- **rôles du design.md** : comme le copieur de l'atelier, l'import relève les
  couleurs qui jouent un rôle (fond, surface, fond sombre, texte, texte sur
  sombre, accent, bouton, texte des boutons) et les polices des titres et du
  texte, puis écrit `var(--atl-<rôle>, couleur)` et `var(--atl-font-heading /
  body, police)` dans le CSS et les styles du HTML ; chaque section reçoit ses
  réglages `role_*` et `meta.designRoles`. Une palette ou un design.md repeint
  donc la page (essai Scooch : 57 % des couleurs de texte et 71 % des polices
  changent ; les fonds pastel propres au site, hors rôles, restent).
Les pages Kimi importées avant cette date peuvent avoir ces défauts : les
réimporter depuis leur zip si besoin. Durée : 15 à 20 min par page avec la
vérification (Copycat ≈ 6 min) ; `--verifier-a-part` pour la sauter.

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

## Socle et zones d'angle (2026-11-08)

Méthode : projet → Fondations → Angles → **page mère** par type (socle + zones
d'angle, Score ≥ 80) → pages d'angle = copies de la mère dont on ne réécrit que
les zones d'angle → Pubs → Publication → Résultats.

- Chaque section porte `props.atl_zone = "angle"` si elle change d'un angle à
  l'autre (hero, ouverture / problème, bénéfices, avis mis en avant, CTA) ; sans
  ce réglage elle est dans le **socle** (offre, mécanisme, preuves, garantie,
  FAQ, bloc d'achat, design). Code : `src/angle-zones.js`.
- Éditeur → **Structure** : bandeau « Page mère » ou « Page d'angle » selon le
  projet, étiquette Socle / Angle cliquable sur chaque section, bouton
  « Proposer les zones d'angle » (mère : hero, problème, histoire, avantages,
  CTA + 1er bloc d'avis) et « Reprendre les zones de la page mère » (page
  d'angle copiée avant le marquage : même type de section, même rang).
- Éditeur → ✨ IA → **Décliner pour cet angle** (`DeclinePage` dans
  `inspector-ui.jsx`) : réécrit seulement les zones d'angle, avec la carte de
  l'angle (avatar, douleur, promesse) et le message central des Fondations.
  Ne touche ni prix, ni offre, ni garantie, ni chiffres.
- À venir : « Valider la page mère » et « Reporter le socle » (mère → angles).

Onglet Angles (2026-11-08) : mêmes règles que « Ajouter une page ». Un angle dont le type n’a pas de page mère : seul l’angle ★ peut créer sa page, qui devient la page mère du type (`meresParType`), à partir d’un template, d’une page du même type ou d’un lien ; les autres angles du type affichent « Pas encore de page mère » et leur bouton est grisé. Un type qui a sa mère : la page d’angle part par défaut d’une copie de la mère. Plus de « Créer une page vide ».

Une page mère ★ par TYPE de page (2026-11-08) : dans Angles, l’étoile ne retire que celle des angles du même type (recliquer l’enlève) ; la barre liste les mères par type ; `pageMenuGroups` prend l’angle ★ de chaque type. Message de retour du catalogue (`.cat-flash`) fixé en bas de l’écran, disparaît seul (4 s, erreurs 9 s). Cartes d’angle compactes (5 par rangée sur grand écran).

Onglet Angles = CHOIX seulement (2026-11-08) : cocher les angles, une ★ par type de page, rien d’autre (plus de création de page, de lien, de template ; une carte reliée montre « Page : … · Ouvrir »). Tout se crée dans l’onglet Pages : « ★ Page mère · <angle ★ du type> » relie la page à cet angle ; « Angle N » ne propose que les angles cochés de ce type encore sans page ; « Nouvel angle… » retiré (on ajoute un angle dans l’onglet Angles).

Correction (2026-11-08, même soir) : l’onglet Angles ne garde QUE le choix des angles (case « À tester », titre, avatar, douleur, promesse) : plus d’étoile ni de type de page. L’étape Angles est faite dès qu’un angle est coché. Dans Pages → « Ajouter une page » : Type, puis « ★ Page mère · Angle N » (la page mère du type, pour l’angle choisi ; `meresParType`), « ★ Page mère sans angle », ou, quand le type a sa mère, « Angle N » (copie de la mère par défaut, affichée dans « Partir de »), ou « Autre ». Plus de page vide pour une mère ni pour un angle.

## Origine des pages (2026-11-08)

Une page part de trois origines : un **template** (ou une page du projet,
recopiée), un **lien** (page d'un site reproduite par Claude : la page est
créée vide et une demande d'import la remplit) ou une **page vide**. Choix
dans Pages → « Ajouter une page » (« Partir de » : Template ou page / Lien /
Page vide ; une page d'angle part par défaut d'une copie de la page mère).

- Enregistrée à la création : `root.props.origine = { type: "template" |
  "page" | "lien" | "vide", source, url, le, empreinte }` (`createPage`,
  `empreinte()` dans `src/projects.js`).
- Pages plus anciennes : origine déduite (demande d'import avec `details.page`
  et `url` → lien ; `importSource` → template ; sans contenu → vide).
- Colonne « Origine » de l'onglet Pages ; « modifiée dans l'éditeur » quand
  l'empreinte du contenu a changé (ou, pour un template, quand le contenu
  diffère de la page du template).
- « Changer » (`OriginDialog`, `changePageOrigin`) : remplace tout le contenu
  (copie de sécurité dans l'Historique avant) ; avertit que les modifications
  faites dans l'éditeur seront perdues. Lien → page vidée + demande d'import.
- Retour sur la règle précédente : une page mère peut de nouveau partir d'une
  page vide (demande de l'utilisateur, 2026-11-08).

## « Original » = la page en ligne (2026-11-09)

Dans l'éditeur, la bascule « Original / Modifiable » montre comme Original la
page **telle qu'elle est aujourd'hui sur internet, à son adresse web** (plus la
capture de l'import). Les sites refusent d'être affichés dans un cadre d'une
autre adresse (Shopify : `frame-ancestors 'none'`) et un cadre d'une autre
adresse empêcherait la règle « les deux pages s'ouvrent au même endroit » : le
serveur ouvre donc la page dans Edge (`scripts/original-live.mjs` : popups
fermés, défilement pour les images différées), enregistre
`imports/<import>/live.html` + `live.json`, et l'atelier la sert sur
`/api/original/<import>/live` (scripts coupés, `<base>` = adresse du site).
Refaite au plus toutes les 6 h, ou avec « ↻ Actualiser » (`?refresh=1`) ;
site injoignable → la capture. « Voir la capture » montre la capture de
l'import. Défilement lié vérifié : Modifiable 50 % → Original 50 % ;
Original 80 % → retour Modifiable 80 %.

## Classement par score de vente, section IA depuis une capture (2026-11-09)

- **Templates** rangés par score de vente (`propositions.score`), du plus haut
  au plus faible, partout : `listTemplates()` trie à la source (catalogue,
  « Partir de… », nouveau projet). `templateScore()` exporté.
- **Sections** : pas de score propre ; rangées par le score de vente du
  template dont elles viennent (l'id de la section commence par celui de
  l'import, préfixe le plus long). Sans template : à la fin. Dans le catalogue
  (`Catalogue.jsx`) et dans la galerie « Ajouter une section » de l'éditeur.
- **Créer une section avec l'IA** (éditeur → Ajouter une section) : trois
  départs, « Description » (questions), « Lien vers un site » (`url` de la
  demande + précisions) et « Capture + description » (captures dans `images`
  de la demande, `details.source = "capture"`). Demande de type `ia` ; la
  traiter comme avant (concevoir la section, l'ajouter au catalogue et à la
  page), en partant du lien ou des captures quand ils sont donnés.

## Emplacements des sections manquantes (2026-11-09)

- Le Score de vente reste calculé comme avant (règles Jeffrey + Arsh par type
  de page, textes à reprendre, 5 croyances). En plus, chaque section manquante
  est dessinée dans l'aperçu de l'éditeur, à son rang : un rectangle en
  pointillés « + Ajouter une section « … » ici » (plusieurs au même endroit :
  un seul rectangle). Code : `src/engine/missing-slots.jsx` (rectangles,
  rendus par `SectionView` hors du bloc `data-atl-id`) et `src/slot-picker.jsx`
  (choix du modèle, trié par score de vente, inséré au rang du rectangle).
- Jamais publié : seul l'éditeur les dessine. Interrupteur « Montrer les
  emplacements dans la page » dans le panneau Score (localStorage
  `atl-emplacements`). « voir l'emplacement » dans la liste du Score fait
  défiler jusqu'au rectangle.
- Page d'un projet : étiquette Socle / Angle (`src/engine/zones.js`, la même
  liste que `angle-zones.js`). Page d'angle : une section du socle manquante
  s'affiche « À ajouter dans la page mère » avec un lien vers la mère (on peut
  quand même l'ajouter ici).
- Les clics dans l'aperçu n'arrivent pas aux gestionnaires React : écouteurs
  natifs posés sur le rectangle.
- Le serveur ne renvoie plus jamais toutes les sections en entier pour une
  page introuvable (`/api/sections-data?page=` d'une page supprimée) : version
  légère. Avant, cela le faisait planter en boucle (chaîne trop longue).

## Pages d'angle selon le type de page (2026-11-09)

- `src/engine/page-types.js` : `parAngle` sur chaque type. `true` (landing,
  advertorial, page d'offre) : une page mère puis une page par angle. `false`
  (listicle, page d'accueil, page produit, collection, à propos) : une seule
  page « tous les angles » (profil « Tous les angles »), sans page d'angle.
  Helper `declineParAngle(type)`.
- Onglet Pages du projet : pour un type `parAngle: false`, le choix est
  « ★ Page unique · tous les angles » ou « Autre » ; les cartes l'affichent ainsi.
- « Réécrire pour mon produit » sur un listicle d'un projet : les angles cochés
  vont dans le contexte, chaque raison numérotée porte un angle (raison 1 =
  angle 1…). Page d'accueil : les angles deviennent les profils servis.

## Dossiers des médias (2026-11-09)

- Page d'un projet : `medias/projets/<projet>/images-creees/` (images de l'IA :
  Refaire avec l'IA, Studio, pubs dans `pubs/`), `televersees/` (ajoutées à la
  main, et fichiers de la fiche projet), `videos-creees/` (vidéos à venir).
  Page hors projet : `medias/<page>/` comme avant. Images du site d'origine :
  `imports/<slug>/images/`, jamais modifiées ni déplacées.
- Code : `mediaPlace(page, kind)` dans `vite.config.js` ; `reworkImage(...folder)`
  dans `scripts/lib/ia.mjs` ; `createdPlace` dans `scripts/studio.mjs`.
  `/api/medias/<page>?detail=1` renvoie `[{ url, kind }]` (toutes les images du
  projet) ; le sélecteur d'images a 3 onglets : Créées par l'IA, Téléversées,
  Site d'origine.
- Rangement des anciennes images : COPIE dans le dossier du projet (les
  fichiers d'origine restent), puis adresses remplacées dans les pages et
  projets (script `ranger_medias.py`, jamais pendant qu'une page est ouverte).

## Base commune du design de l'atelier (2026-11-09)

- `src/tokens.css`, chargé en premier par l'éditeur (`src/main.jsx`) et le
  catalogue (`src/catalogue/main.jsx`) : couleurs par rôle (`--tk-ink`…`-4`,
  `--tk-line`, `--tk-bg`, `--tk-surface`, `--tk-accent`, états), échelle de
  texte (`--tk-text-xs` 11 px → `--tk-text-2xl` 26 px), 3 arrondis + pastille,
  espaces (multiples de 4), 3 ombres, anneau de focus, durées. Focus clavier
  visible partout, sélection et barres de défilement aux couleurs de l'atelier,
  animations raccourcies si « moins de mouvement ».
- Les anciennes variables `--atl-*` (éditeur) et `--cat-*` (catalogue) pointent
  vers ces jetons. Les gris, blancs, noirs et violets écrits en dur ont été
  remplacés selon leur usage (texte, bord, fond) ; tailles de texte ramenées
  sur l'échelle (plus de 10 / 10,5 / 11,5 / 12,5 px). Toute nouvelle règle :
  utiliser `--tk-*`, jamais une couleur en dur.
- Audit de départ : `docs/audit-design-2026-11-09.md` (9/20). Étapes
  suivantes prévues : alléger « Toutes les sections », titres et vrais
  boutons, cadres doublés, largeur des textes, puis passe finale.
- Étapes faites le 2026-11-09 après la base : « Toutes les sections » =
  8 modèles par famille + « Voir les N » (vue d'une famille : 48 par 48,
  masquées à la fin) ; titres h1 → h2 (familles, méthodes d'Enrichir) ;
  cadres doublés enlevés (familles sans carte, vignettes à bord perdu, lot
  d'Enrichir) ; textes d'aide limités à 75 caractères. Détecteur Impeccable :
  plus aucune alerte sur Toutes les sections, Templates et Projets.
- Éditeur (2026-11-09) : plus de sur-titre « Outil » au-dessus du nom de
  l'outil ; listes d'actions (IA…) en lignes simples au lieu de cartes
  empilées ; fiche « Ma marque et mon produit » sans cadre dans le panneau ;
  champs de Puck (étiquette, hauteur, bord, focus) alignés sur la base. Rappel :
  l'éditeur est en plein écran, rail et panneaux glissent au survol des
  languettes (règle « REFONTE PLEIN ÉCRAN » de styles.css), ce n'est pas un bug.
- 2026-11-10 : rail de gauche de l'éditeur avec une étiquette sous chaque
  icône (68 px de large) ; catalogue sur écran étroit (≤ 860 px) : menu replié
  derrière « Menu » (refermé à chaque changement de vue), en-tête sur une
  ligne, filtres empilés, grille adaptée. Testé à 375 et 768 px, sans
  défilement horizontal.
- 2026-11-10 : police de titres de l'interface = Instrument Sans (choix de
  l'utilisateur), jeton `--tk-font-display` ; texte courant en Inter. Les deux
  polices sont chargées par `src/tokens.css` (le catalogue n'en chargeait
  aucune avant).
