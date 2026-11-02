# Prompt à donner à Kimi pour cloner une ou plusieurs pages

Copier tout le bloc ci-dessous dans Kimi. Remplir seulement la liste
« PAGES À CLONER » à la fin (nom pour l'atelier, adresse, type).

```text
MISSION
Tu reproduis des pages web à l'identique sous forme d'applications React + Vite autonomes. Elles seront importées automatiquement dans un éditeur visuel (« l'atelier ») qui découpe chaque page en sections modifiables. Le rendu doit être identique à l'original, ET la structure doit respecter exactement les règles ci-dessous : sinon l'import échoue et tout est à refaire. Lis toutes les règles avant de commencer.

═══════════════════════════════════════
1. LIVRAISON
═══════════════════════════════════════
- Un dossier par page, nommé EXACTEMENT comme le « nom pour l'atelier » donné dans la liste (minuscules, tirets, sans espace ni accent). Ne renomme pas, n'ajoute pas de suffixe (-v2, -final…).
- Dans chaque dossier, à la racine : package.json, index.html, vite.config.js, src/, public/, README.md, meta.json.
- package.json : scripts "dev", "build" et "preview" ; dépendances publiques seulement (react, react-dom, vite, @vitejs/plugin-react, et le strict nécessaire). Aucun script postinstall / preinstall / prepare.
- package-lock.json : uniquement s'il pointe vers https://registry.npmjs.org (jamais vers un miroir privé). Sinon, ne le livre pas.
- Pas de node_modules, pas de dist, pas de fichiers temporaires, pas de captures d'écran, pas de scripts d'audit.
- meta.json (à la racine du dossier) : { "name": "<nom pour l'atelier>", "type": "<produit|offre|collection|landing|accueil|advertorial|listicle|autre>", "source": "<adresse d'origine>", "title": "<titre de la page>" }. Types : produit (fiche produit avec achat), offre (promotion pour une pub), collection (grille de produits à choisir), landing (longue page de vente), accueil (page d'accueil), advertorial (article qui raconte), listicle (« N raisons… »), autre (à propos, contact…).
- README.md : l'adresse d'origine et la commande npm install && npm run build.
- Tous les dossiers dans UN SEUL zip. Ne mets pas le zip dans un dossier parent supplémentaire : à l'ouverture du zip, on voit directement les dossiers des pages.
- `npm install` puis `npm run build` doivent réussir sur un ordinateur neuf, sans accès à autre chose que registry.npmjs.org.

═══════════════════════════════════════
2. STRUCTURE HTML (la règle la plus importante)
═══════════════════════════════════════
La page rendue doit avoir exactement cette forme dans <div id="root"> :

<div id="root">
  <header>…en-tête / menu / barre d'annonce du site…</header>   (facultatif, UN seul)
  <main>
    <section data-atelier-section="Hero">…</section>
    <section data-atelier-section="Fiche produit">…</section>
    <section data-atelier-section="Avis clients">…</section>
    …
  </main>
  <footer>…pied de page…</footer>                                (facultatif, UN seul)
  <div role="dialog" hidden>…panier latéral, pop-up…</div>       (facultatif, après le footer)
</div>

Règles :
a) Chaque section VISIBLE de la page (hero, fiche produit, bandeau d'avantages, avis, FAQ, comparatif, garantie, témoignages, appel à l'action final…) est UN enfant direct de <main>. Un seul élément par section. Pas de section coupée en plusieurs enfants, pas deux sections dans le même enfant.
b) Chaque enfant direct de <main> porte data-atelier-section avec un nom lisible en français : "Hero", "Fiche produit", "Barre d'avantages", "Avis clients", "FAQ", "Comparatif", "Garantie", "Mode d'emploi", "Ingrédients", "Témoignages", "Offre finale", etc.
c) Aucun élément en display: contents, nulle part. Aucune enveloppe invisible (pas de « atelier-source-block », pas de wrapper de page Replo/Shogun/PageFly). Si une enveloppe porte une mise en page utile (fond, largeur max, police), transfère ces styles à <main> ou à la section concernée.
d) Pas de <div> d'un seul enfant qui englobe toute la page entre #root et <header>/<main>/<footer>.
e) Aucun bloc vide ou technique dans <main> ni entre les sections : pas de <meta>, pas de <style>, pas de <script>, pas de <link>, pas de barre de chargement, pas de voile (overlay), pas de lien « skip to content », pas d'élément de hauteur nulle, pas de bannière masquée.
f) Variantes ordinateur / mobile d'une même section (deux blocs, l'un caché en mobile, l'autre en ordinateur) : les deux vont DANS LA MÊME section, l'une à côté de l'autre, avec leurs classes de visibilité d'origine. Jamais deux sections séparées pour la même chose.
g) Barres fixes (barre d'offre collante en bas, bouton « Ajouter au panier » collant) : dans la section à laquelle elles appartiennent (en général « Fiche produit »), pas en section à part.
h) En-tête du site : dans <header>, y compris la barre d'annonce du haut. Si le site a plusieurs blocs d'en-tête (annonce + menu + sous-menu), ils vont tous dans le même <header>. Un élément qui s'appelle « header » à l'intérieur d'une section (titre de section) n'est PAS le header de la page : transforme-le en <div> et adapte le sélecteur CSS.
i) Pied de page : tout dans un seul <footer> (newsletter du pied, liens, mentions légales).
j) Fenêtres (panier latéral, recherche, pop-up de réduction, galerie plein écran) : après </footer>, avec role="dialog", fermées au chargement. Ne classe en « fenêtre » que ce qui est réellement caché au chargement : une section visible dont la classe contient « overlay » ou « modal » reste à sa place dans <main>.
k) Pages construites en positionnement absolu (constructeurs de pages) : découpe en zones horizontales qui couvrent toute la hauteur ; chaque zone devient une section qui contient ses textes, images et boutons, avec position: relative et sa hauteur propre (ordinateur et mobile), les enfants gardant leurs coordonnées relatives à la zone.

═══════════════════════════════════════
3. CONTENU
═══════════════════════════════════════
- Tous les textes sont de vrais textes HTML (pas d'images de texte, pas de canvas, pas de texte SVG sauf logos). Titres en h1/h2/h3 comme sur l'original. Langue d'origine conservée, aucun texte inventé ou abrégé.
- Tout le contenu est présent dans le DOM dès le chargement : pas de rendu au défilement, pas d'éléments à opacity: 0 qui n'apparaissent qu'avec une animation au scroll (s'il y a des animations d'apparition, l'état final doit être visible sans défilement).
- Images : fichiers locaux dans public/assets, chemins /assets/…, attribut src réel (pas de data-src, pas de lazy-loading JavaScript). loading="lazy" natif autorisé.
- Vidéos : fichiers locaux ou image d'aperçu ; pas d'iframe YouTube/Vimeo.
- Les textes peuvent être dans src/data/ ; le HTML peut être injecté (dangerouslySetInnerHTML) à condition que la structure finale respecte la partie 2.

═══════════════════════════════════════
4. STYLES (CSS)
═══════════════════════════════════════
- Toutes les feuilles de style d'origine sont regroupées dans src/styles.css (ou quelques fichiers importés dans main.jsx), DANS LEUR ORDRE D'ORIGINE (la cascade en dépend).
- Avant de concaténer des feuilles ou des blocs <style>, ferme chaque bloc indépendamment : une accolade non fermée dans un bloc englobe sinon toutes les règles suivantes (media query qui avale le reste du fichier). Passe chaque bloc par un parseur tolérant (postcss-safe-parser) puis réécris-le proprement avant de l'ajouter.
- Extrais le CONTENU des balises <style> du HTML vers le CSS, puis supprime les balises du HTML (ne les copie pas en double).
- Aucune ressource externe : pas de CDN, pas de Google Fonts en ligne, pas de feuilles distantes. Tout est local.
- Pas de CSS-in-JS avec des noms de classes générés à chaque rendu.
- Les règles sur html, body et :root sont autorisées (fond, police de base) mais ne doivent pas cacher le contenu ni bloquer le défilement.
- Si tu renommes une balise (header interne → div), mets à jour les sélecteurs qui la ciblaient.

═══════════════════════════════════════
5. POLICES
═══════════════════════════════════════
- Fichiers de police locaux dans public/assets, déclarés par @font-face.
- Vérifie chaque police DANS LE NAVIGATEUR (Chromium) : aucun message « Failed to decode downloaded font » ni « OTS parsing error ». Un fichier qui passe un validateur peut quand même échouer au chargement.
- Police corrompue : récupère-la à son adresse d'origine ; sinon convertis-la en woff2 ; en dernier recours, remplace-la par la plus proche disponible et signale-le dans le README.

═══════════════════════════════════════
6. INTERACTIONS (elles doivent fonctionner sans le site d'origine)
═══════════════════════════════════════
- Chaque bouton cliquable produit un changement visible du DOM en moins de 300 ms, sans recharger la page ni changer d'adresse.
- FAQ / accordéons : <button aria-expanded="false|true"> ; le contenu s'ouvre/se ferme en changeant une classe ou l'attribut hidden.
- Onglets, sélecteurs de variante (taille, couleur, formule, quantité), menus déroulants : changent une classe "is-active" / "selected" ou aria-selected, et affichent le bon contenu.
- Carrousels : une piste qui défile horizontalement (overflow-x: auto + scroll-snap) et des boutons précédent/suivant avec aria-label="Précédent" et aria-label="Suivant" qui la font défiler. Pas de bibliothèque de carrousel qui recrée les diapositives en JavaScript (Swiper, Slick, Flickity…) : diapositives écrites une seule fois dans le HTML.
- Boutons d'achat (Ajouter au panier, Acheter, Commander) : data-demo-action="purchase", aucune vraie transaction, aucun envoi de données.
- Liens : href conservés (ancres #, pages du site d'origine) ; pas de redirection automatique.
- Pas de script tiers : pas d'analytics, pixel, chat, avis externes en iframe, bandeau cookies, A/B test, Klaviyo, Hotjar.

═══════════════════════════════════════
7. RESPONSIVE
═══════════════════════════════════════
- Rendu identique à l'original à 1440 px (ordinateur) ET à 390 px (mobile). Compare des captures pleine page aux deux largeurs, original contre copie.

═══════════════════════════════════════
8. CONTRÔLES AVANT LIVRAISON (pour CHAQUE page, aux deux largeurs)
═══════════════════════════════════════
Lance la page compilée (npm run build puis npm run preview) dans Chromium, et vérifie dans la console :
1. document.querySelectorAll('#root > main').length === 1
2. document.querySelectorAll('#root > header').length <= 1 et document.querySelectorAll('#root > footer').length <= 1
3. [...document.querySelectorAll('main > *')].every(e => e.dataset.atelierSection && e.getBoundingClientRect().height > 0)
4. [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).display === 'contents').length === 0
5. document.querySelectorAll('main meta, main style, main script, main link').length === 0
6. Le nombre de main > * est égal au nombre de sections visibles de l'original.
7. Aucune erreur dans la console (polices, 404, JavaScript).
8. Onglet Réseau : aucune requête vers un autre domaine que la page elle-même.
9. Chaque bouton (FAQ, onglets, variantes, flèches de carrousel) fait quelque chose.
10. Capture pleine page à 1440 px et 390 px : identique à l'original (pas de décalage, pas d'icône géante, pas de bloc manquant, pas de texte dans une autre police).
Corrige chaque page qui échoue, puis refais les contrôles. Dans ta réponse finale, donne un tableau : page | sections | contrôles 1-10 OK ? | remarques.

═══════════════════════════════════════
9. PAGES À CLONER
═══════════════════════════════════════
(nom pour l'atelier — adresse — type : produit, offre, collection, landing, accueil, advertorial, listicle ou autre)
- exemple-produit — https://exemple.com/products/xxx — produit
```

## Après Kimi

Donne-moi le chemin du zip ; je lance `node scripts/kimi-zip.mjs "<zip>"`, qui
installe, compile, importe chaque page et crée ses sections dans le catalogue.
