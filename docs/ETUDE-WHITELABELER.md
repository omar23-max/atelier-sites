# Étude : Whitelabeler (vidéo d'Ali Akbar, de 16:00 à la fin)

Source : « $3.4m a month with 1 unique product », youtube.com/watch?v=32CRwhHqou4.
Matériel local : `videos/whitelabel/` (vidéo, `transcription.txt`, images toutes
les 15 s dans `frames/`, planches dans `planches/`). La démo reconstruit… la page
produit Aurivita, celle qu'on a importée.

## 1. La méthode (avant l'outil)

- **Une page par personne visée.** La marque modèle a plus de 4 800 pubs Meta et
  plusieurs tunnels pour le même produit (page produit « PDP », tunnel « ED »,
  advertorials…). Chaque page parle à une personne précise. Message : un thème
  Shopify générique ne suffit pas, il faut des pages taillées par profil.
- **Modéliser → rebrander → spécialiser.** On copie la structure d'une page qui
  marche, on change la marque et les textes, et on vise une niche plus étroite
  que le gros acteur.
- **Offre + pub + tunnel.** Les 3 doivent fonctionner ensemble.
- Étape 1 : choisir dans la bibliothèque de pubs Meta **quel tunnel modéliser**.

## 2. L'outil, écran par écran

**Barre du haut** : Pages · Images · Canvas · Templates · AI Employees. Quotas
visibles (pages illimitées, « mirrors » restants, crédits).

**Extension Chrome**, 3 boutons sur n'importe quel site :
- *Mirror* : capture la page entière et l'envoie dans l'app ;
- *Capture* : capture pleine page à voir ou enregistrer ;
- *Media* : liste toutes les images et vidéos de la page (filtre de taille
  minimale, tout sélectionner, rescanner), puis « Télécharger en zip » ou
  « Mirror images » (vers le studio d'images).

**« Start a new page »** : 3 onglets (Mirror a page · My pages · Upload HTML).
- Champs : URL de la page, capture (« sert à reproduire l'aspect, pas la
  structure »), nom du produit.
- Question clé : **« Les gens achètent-ils sur cette page ? »** Achat = page
  produit ; pas d'achat = accueil, article, à propos, advertorial qui renvoie vers
  la page d'achat.
- Pendant la construction : animation « Calculating time to build ».

**Page reconstruite (« mirror page »)** : mêmes sections que l'original. Les
textes sont remplacés par des indications entre crochets avec un nombre de mots
(« [ PRODUCT TITLE ~3-4 words ] »). Les images sont remplacées par un brief
(« [ MAIN PRODUCT IMAGE — Supplement bottle on soft pink backdrop ] »).

**Éditeur**
- Rail d'icônes à gauche : Page Score · Theme · AI · Structure · Section Library.
- Barre du haut : nom, « Calculate score », Saved, bureau / tablette / mobile,
  annuler / rétablir, Download HTML, Preview, Publish to Shopify.
- Édition directe du texte dans l'aperçu, avec une barre d'outils et un panneau
  Typographie (police, graisse, taille, interligne, couleur, alignement).
  Étiquettes Section / Block / Image au survol.

**Theme**
- On dépose une image de palette (ou le logo), puis « Build themes ».
- **Curseur d'intensité** de 0 (Original) à 5 : du plus fidèle au plus éloigné
  des couleurs d'origine.
- Polices des titres et du texte.
- **Rebrand** : rechercher / remplacer sur toute la page (« ne change que ce que
  le client lit »).

**Page Score**
- Note sur 100 (« Exceptional ») et « 13 changements recommandés pour une page
  de ta niche ».
- Chaque recommandation est une section manquante : offre spéciale, avis
  d'expert, ce qu'il y a dedans, vu dans, garantie forte…
- Pour chacune : emplacement conseillé (« avant Mode d'emploi », « après
  l'accroche, avant les chiffres »), effet estimé sur la note, bouton Ajouter
  ou glisser-déposer.
- Les sections ajoutées sont déjà dans les couleurs et le ton de la page.
  Bouton Recalculer. La page de départ était vers 80.

**Section Library** : recherche (« Us vs the rest »), variantes en miniatures,
grand aperçu au survol, Ajouter ou glisser dans la page.

**AI**
- *Rewrite all copy* : nom de marque + « ce que tu as » (description produit,
  avis clients, textes concurrents, résumé ChatGPT ; 100 caractères minimum).
  Tous les textes entre crochets sont remplis d'un coup.
- *Images for this page* : ouvre le studio d'images.

**Image Mirror Studio** (en 3 lignes)
1. *References* : photos du fournisseur, logo, palette. Chacune reçoit une
   étiquette (face avant, emballage, gros plan).
2. *Source images* : les images du site modèle, venues de l'extension.
   - Mode *Mirror* (fidèle) ou *Ad* (publicité) ; images ou GIF.
   - *Autopilot* : toute la file, s'arrêter après 5 ou après N images, ou
     demander avant chaque image.
3. *Generated image* : ta version de chaque image.
   - Les textes détectés dans l'image s'affichent « ancien → nouveau », pour les
     changer.
   - Un conseil sur l'image (« infographie très chargée en texte : retouche
     possible »), un bouton *Guided retry*, et « Tout télécharger ».

**Canvas** (tableaux libres type Figma ou Miro)
- Des tableaux : Brand Boards, Clearflow, Packshot ads.
- Outils : formes, flèches, crayon, texte.
- On sélectionne plusieurs images, qui deviennent des références numérotées
  (Image 1, 2…).
- On décrit l'image voulue (exemple : « les 3 premières sont mon produit, la 4e
  est une section de mon site : crée l'image parfaite pour cet endroit »).
- Réglages : modèle (GPT Image 2, Nano Banana 2), qualité, 1 à 4 variantes,
  format. Cadre vide « New picture 1024×1024 » pour placer le résultat.
- Actions sur une image : créer une image, créer une vidéo, détourer, utiliser
  comme référence, télécharger. On peut aussi demander une correction.
- C'est là qu'est fait le **kit de marque** : propositions de logo, brand
  board, palette.

**Publish to Shopify**
- Une app Shopify publie la page comme sections natives du thème. On peut aussi
  télécharger le code Liquid.
- Dans l'éditeur de thème Shopify, chaque section a ses réglages : compte à
  rebours, couleurs, sélecteur de produit, packs.
- Les variantes du produit deviennent les packs (« Buy 3 & Get 2 Free »).
  Argument : plus besoin d'apps pour le minuteur, les packs, etc.
- Le modèle de page porte le nom de la marque (« clearflow ») et s'assigne au
  produit. « Tu possèdes le template », réutilisable pour d'autres produits.

**À côté** : TeemDrop (fournisseur en dropshipping), et un programme
« build a brand » vendu avec.

## 3. Comparaison avec notre atelier

| Fonction Whitelabeler | Chez nous |
|---|---|
| Reconstruction d'une page réelle section par section | ✅ `npm run capture` + reconstruction, planche de comparaison |
| Textes en brief avec nombre de mots | ✅ |
| Image remplacée par un brief | ✅ `imageBriefs` + photos d'origine découpées (mieux pour juger l'aspect) |
| Bibliothèque de sections, variantes, aperçu au survol | ✅ catalogue par famille, aperçu au survol |
| Aperçu bureau / tablette / mobile | ✅ |
| Palette + polices appliquées à toute la page | ✅ design.md + « Appliquer un autre design.md » |
| Publication vers Shopify en sections natives réglables | ✅ (copie de thème non publiée) |
| Packs et compte à rebours sans app | ✅ dans produit-principal |
| Télécharger le HTML | 🟡 `npm run render` en ligne de commande, pas de bouton |
| Extension Chrome Mirror / Capture / Media | 🟡 on le fait depuis une URL (méthode « site » du catalogue), pas en un clic sur le site |
| « Les gens achètent-ils sur cette page ? » | ❌ pas de type de page |
| Plusieurs pages par produit (une par profil client) | ❌ une page = un fichier, sans lien entre elles |
| Page Score + sections manquantes conseillées et placées | ❌ |
| Rebrand rechercher / remplacer | ❌ |
| Curseur d'intensité des couleurs | ❌ (on applique tout ou rien) |
| Création d'une palette à partir d'une image ou d'un logo | ❌ (le design.md vient d'un site) |
| Réécrire tous les textes d'un coup à partir de mes infos produit | ❌ (brief seulement) |
| Studio d'images : chaque photo d'origine → ma version avec mon produit | ❌ (l'outil Nano Banana est déjà branché ici) |
| Canvas de création d'images et kit de marque | ❌ |
| Édition directe du texte dans l'aperçu | ❌ (panneau de droite) |
| Import d'un fichier HTML | ❌ |
| Templates de sites prêts à l'emploi | 🟡 nos pages importées pourraient en servir |
