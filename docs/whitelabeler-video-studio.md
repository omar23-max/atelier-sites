# Whitelabeler : miroir de page, studio d images, Canvas, Section images

Résumé de la vidéo https://www.youtube.com/watch?v=dZRoQlQF9WQ à partir de 8:00, fait par Gemini (gemini-3.5-flash, clé GEMINI_API_KEY de .env.local) le 2026-11-11, complété par les captures de l utilisateur (Téléchargements, « image miror 1-8 », « miror studio 3-4 », ss/de/eee/zse.jpeg). Sert de référence pour le Studio et le Canvas de l atelier.

Voici la description détaillée, étape par étape et avec minutages, de l'utilisation de l'outil **Whitelabeler** à partir de 08:00 dans la vidéo.

---

### 1. Le miroir de page (*Page Mirroring*)
* **08:00 - 08:14** : Dans l'interface *Start a new page*, l'utilisateur colles l'URL d'une page produit concurrente (SKULT), nomme son propre produit (`Collagen Face Sculpt Wrap`), coche l'option « *People buy on this page* », puis clique sur le bouton **« Mirror this page »**.
* **08:15 - 08:52** : L'outil Whitelabeler scanne le site d'origine section par section pour analyser la structure, les emplacements d'images et la disposition du texte.
* **08:53 - 09:07** : La page miroir réinventée est générée dans l'éditeur. Elle reproduit exactement la mise en page de la concurrence, mais remplace le texte d'origine par du texte temporaire entre crochets `[comme ceci]` (les *placeholders*) et laisse les emplacements d'images vides.

---

### 2. Le studio d'images « Image Mirror Studio »
* **23:35 - 24:00** : L'utilisateur ouvre l'outil **Image Mirror Studio** depuis l'éditeur.
* **24:01 - 24:30** : **Saisie des informations produit :** Dans la section *1. Tell us about your product*, l'utilisateur renseigne le nom de son produit (*CHINUP FACE SCULPT WRAP*) et saisit une courte description des caractéristiques/bénéfices.
* **24:31 - 25:15** : **Importation des visuels de base :**
  * *Your product* : Importation des photos du produit provenant du fournisseur (packaging, produit sous différents angles).
  * *Your brand* : Importation des éléments visuels de sa marque (brand board, palette de couleurs, logo).
* **25:16 - 26:00** : **Extraction des visuels concurrents (via extension) :** 
  * L'utilisateur se rend sur la page du concurrent, ouvre l'extension Chrome Whitelabeler, clique sur « Media », sélectionne environ 40 images du site concurrent, puis clique sur « Mirror images ». 
  * Les images apparaissent automatiquement dans le studio sous la section *3. Images to mirror*.
* **26:01 - 27:27** : **Réglages et génération en chaîne :**
  * Activation du mode **Autopilot** (qui traite toutes les images en arrière-plan).
  * Clic sur **« Start generating »**. L'IA analyse chaque photo de référence du concurrent, conserve la pose/mise en scène, mais remplace le visage du mannequin, le produit et le packaging par ceux de la marque de l'utilisateur, tout en adaptant les textes incrustés.
* **27:28 - 28:51** : **Vérification des images générées :** L'utilisateur passe en revue les résultats (photos avant/après, packshots, visuels style UGC).
* **28:52 - 32:25** : **Installation des images dans la page :**
  * Sur une image générée, clic sur **« Export to Page »**.
  * Sélection de la page cible (*Collagen Face Wrap*).
  * Clic sur l'emplacement précis (ex: la galerie principale du produit ou un bloc spécifique) pour insérer directement l'image dans la page.

---

### 3. Le Canvas et ses outils
* **33:10 - 33:36** : Depuis le studio d'images, l'utilisateur clique sur **« Export all to Canvas »**. Cela ouvre un grand espace de travail visuel (le *Canvas*) réunissant l'ensemble des visuels générés et des assets de marque sur un même tableau d'affichage.
* **Outils disponibles sur le Canvas (visibles dans l'interface) :**
  * **Barre d'outils supérieure :** Boutons *Create Image*, *Section Images*, *Create Video* / *Animate Image* *(Remarque : les fonctions vidéo/animation sont visibles dans le menu mais ne sont pas exécutées dans cet extrait)*.
  * **Options sur chaque visuel sélectionné :** *Use as reference*, *Remove background*, *Export to Page*, *Details*, *Delete*.

---

### 4. « Section Images » (Génération d'images ciblées par section)
* **33:37 - 34:04** : Dans le Canvas, l'utilisateur clique sur le panneau **« Section Images »** à droite. Il clique sur **« Pick from board »** et sélectionne plusieurs visuels de référence présents sur le Canvas.
* **34:05 - 34:17** : **Sélection du contexte :** Il choisit la page concernée (*Collagen Face Wrap*), puis clique sur l'aperçu visuel de la section exacte de la page où il manque une image (ex: la section *Five Quiet Mechanisms / Timeline*).
* **34:18 - 34:26** : **Rédaction automatique des prompts (*Write prompts*) :** Clic sur le bouton **« Write prompts »**. L'IA analyse le rôle de la section sélectionnée, son texte, sa structure et son format, puis rédige automatiquement une description de prompt hyper-spécifique adaptée à ce bloc.
* **34:27 - 34:42** : **Génération :** Clic sur **« Create Image »**. L'IA génère un visuel sur mesure (ex: une femme au lit portant le masque de nuit) parfaitement cadré et stylisé pour cette section précise.
* **34:43 - 35:24** : **Placement :** Clic sur **« Export to Page »**, sélection de la section sur le squelette de la page, et validation. L'image s'intègre automatiquement à l'emplacement prévu.

---

### 5. Publication vers Shopify
* **37:40 - 38:43** : Clic sur **« Publish to Shopify »**. Installation de l'application Whitelabeler sur la boutique Shopify et validation des autorisations.
* **39:05 - 40:57** : Configuration des options de publication : choix de créer un nouveau produit, saisie du nom, du prix, des prix comparés et création des variantes/bundles (*Buy 1 Get 1 Free*, *Buy 2 Get 2 Free*, etc.). Clic sur **« Create it and publish »**.
* **41:19 - 41:43** : La page complète (structure, textes réécrits par l'IA, visuels personnalisés, bundles et panier) est directement publiée et fonctionnelle sur Shopify.