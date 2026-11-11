# Prompt ChatGPT en une étape : cloner une page directement au format de l'atelier

Pour ChatGPT ou Codex. Le prompt lui demande d'utiliser le skill ai-site-cloner
(https://github.com/Mahanaicoach/ai-site-cloner), celui du premier clone Scooch :
il relève la page avec la méthode du skill (Playwright, mesures, captures,
contrôle pixel) mais livre directement le zip que l'atelier importe
(`node scripts/kimi-zip.mjs "<zip>" <nom> --verifier-a-part`), sans passer par
un projet Next.js.

Copier tout le bloc ci-dessous. Remplir seulement la liste « PAGES » à la fin.
Après : me donner le chemin du zip.

Depuis le 2026-11-11, la page importée suit les palettes et les design.md de
l'atelier (couleurs des rôles et polices), comme une copie faite par l'atelier.
Les fonds pastel propres au site (hors des 8 rôles) gardent leur couleur.

```text
MISSION
Clone chaque page de la liste avec le skill ai-site-cloner : https://github.com/Mahanaicoach/ai-site-cloner
- Si tu ne l'as pas encore, récupère le dépôt et suis son README (installation, `npm run setup` pour Chromium) ; adapte-le à Windows si besoin, comme lors du clone précédent.
- Utilise sa méthode et ses scripts pour la partie relevé : extraction Playwright (pas d'estimation à l'œil), mesures et captures à 390, 768 et 1440 px, fiches par section, téléchargement des images et des polices, contrôle pixel (pixelmatch) contre l'original.
- Ferme ou cache le pop-up marketing et le bandeau cookies pendant les captures, sur l'original comme sur la copie.
Mais NE livre PAS le projet Next.js que produit le skill : à la fin, transforme son résultat en une page au format décrit ci-dessous, pour qu'un éditeur visuel (« l'atelier ») l'importe automatiquement et la découpe en sections modifiables. Le rendu doit être identique à l'original ET la structure doit respecter exactement ces règles, sinon l'import échoue. Lis toutes les règles avant de commencer.

═══════════════════════════════════════
1. FORMAT DE LA PAGE
═══════════════════════════════════════
- Une application React + Vite autonome, ou du HTML statique servi par Vite. Pas de Next.js, pas de Tailwind à compiler : la feuille CSS d'origine extraite suffit.
- UNE SEULE version de la page, responsive : un seul arbre HTML, la même page à toutes les largeurs grâce à la feuille d'origine. Jamais plusieurs copies de la page (ordinateur / tablette / téléphone) entre lesquelles on bascule selon la largeur. Chaque texte n'existe qu'UNE fois dans le HTML.
- Pas d'arbre JSON rejoué par un composant générique : le HTML final est écrit (ou injecté une fois) dans la structure de la partie 3.

═══════════════════════════════════════
2. LIVRAISON
═══════════════════════════════════════
- Un dossier par page, nommé EXACTEMENT comme le « nom pour l'atelier » de la liste (minuscules, tirets). Pas de suffixe.
- À la racine de chaque dossier : package.json, index.html, vite.config.js, src/, public/, README.md, meta.json.
- package.json : scripts "dev", "build", "preview" ; dépendances publiques seulement (vite, et react / react-dom / @vitejs/plugin-react si besoin). Aucun script postinstall / preinstall / prepare.
- package-lock.json : seulement s'il pointe vers https://registry.npmjs.org.
- Pas de node_modules, dist, .next, captures, scripts d'extraction ou d'audit, docs/.
- meta.json : { "name": "<nom pour l'atelier>", "type": "<produit|offre|collection|landing|accueil|advertorial|listicle|autre>", "source": "<adresse d'origine>", "title": "<titre de la page>" }.
- README.md : l'adresse d'origine, npm install && npm run build, et le tableau de contrôle de la partie 7.
- Tous les dossiers dans UN zip, sans dossier parent : à l'ouverture du zip, on voit directement les dossiers des pages.
- npm install puis npm run build réussissent sur un ordinateur neuf, avec seulement registry.npmjs.org.

═══════════════════════════════════════
3. STRUCTURE HTML (la règle la plus importante)
═══════════════════════════════════════
<div id="root">
  <header>…barre d'annonce + menu du site…</header>               (UN seul, facultatif)
  <main>
    <section data-atelier-section="Fiche produit">…</section>
    <section data-atelier-section="Avis clients">…</section>
    …
  </main>
  <footer>…newsletter du pied, liens, mentions…</footer>         (UN seul, facultatif)
  <div role="dialog" hidden>…panier, pop-up…</div>               (facultatif, après le footer)
</div>

a) Chaque section VISIBLE de la page est UN enfant direct de <main>. Une section = un élément. Sur un thème Shopify, les sections d'origine (shopify-section-…) sont un bon découpage.
b) Chaque enfant direct de <main> porte data-atelier-section avec un nom lisible en français : "Fiche produit", "Logos presse", "Vidéos clients", "Avantages", "Avant / après", "Avis clients", "FAQ", "Garantie", "Comparatif", "Offre finale", etc.
c) Aucun élément en display: contents. Pas d'enveloppe invisible autour de la page ; une enveloppe qui porte une mise en page utile passe ses styles à <main> ou à la section.
d) Pas de <div> d'un seul enfant entre #root et <header>/<main>/<footer>.
e) Rien de technique dans <main> : pas de <meta>, <style>, <script>, <link>, voile, lien « skip to content », élément de hauteur nulle.
f) Variantes ordinateur / mobile d'une même section : dans la MÊME section, côte à côte, avec leurs classes de visibilité d'origine.
g) Barre d'achat collante : dans la section « Fiche produit ».
h) Barre d'annonce et menu : dans <header>. Un « header » à l'intérieur d'une section devient un <div> (adapte le sélecteur CSS).
i) Pied de page : tout dans un seul <footer>.
j) Fenêtres (panier latéral, recherche, pop-up de réduction, galerie plein écran) : après </footer>, role="dialog", fermées au chargement. Pas de pop-up marketing ouvert au chargement.

═══════════════════════════════════════
4. CONTENU
═══════════════════════════════════════
- Vrais textes HTML, titres en h1/h2/h3 comme sur l'original, langue d'origine, rien d'inventé ni d'abrégé.
- Tout est visible dès le chargement : pas d'élément à opacity: 0 qui n'apparaît qu'au défilement.
- Éléments cachés au départ (avis en plus, panneaux d'onglets fermés) : attribut hidden ou style="display:none" écrit dans le HTML, pas posé par JavaScript au chargement.
- Images : fichiers locaux dans public/assets, chemins /assets/…, src réel (pas de data-src). loading="lazy" natif autorisé. Largeur max 1600 px pour les héros et fonds pleine largeur, 800 px pour le reste. Aucune image cassée.
- Vidéos : fichiers locaux ou image d'aperçu ; pas d'iframe.

═══════════════════════════════════════
5. STYLES ET POLICES
═══════════════════════════════════════
- Les feuilles d'origine dans src/styles.css (importée par main.jsx), dans l'ordre d'origine. Contenu des <style> déplacé dans ce fichier. Chaque bloc fermé proprement (une accolade manquante avale la suite).
- Aucune ressource externe (pas de CDN, pas de Google Fonts en ligne).
- Polices locales dans public/assets, @font-face, vérifiées dans Chromium : aucun « Failed to decode downloaded font » ni « OTS parsing error ».

═══════════════════════════════════════
6. INTERACTIONS (sans le site d'origine)
═══════════════════════════════════════
- Chaque bouton produit un changement visible en moins de 300 ms, sans recharger la page.
- FAQ / accordéons : <details><summary> ou <button aria-expanded> qui ouvre/ferme par une classe ou l'attribut hidden.
- Onglets, variantes (taille, couleur, formule, quantité), abonnement / achat unique : classe "is-active" / "selected" ou aria-selected, et le bon contenu affiché.
- Galerie produit et carrousels : piste qui défile horizontalement (overflow-x: auto + scroll-snap), boutons aria-label="Précédent" / aria-label="Suivant" ; miniatures qui font défiler la galerie. Diapositives écrites une seule fois (pas de Swiper, Slick, Embla, Flickity recréés en JavaScript).
- Boutons d'achat : data-demo-action="purchase", aucune vraie transaction.
- Liens : href conservés ; pas de redirection.
- Aucun script tiers (analytics, pixel, chat, Klaviyo, widget d'avis en iframe, cookies).

═══════════════════════════════════════
7. CONTRÔLES AVANT LIVRAISON (pour chaque page, à 1440 px ET à 390 px)
═══════════════════════════════════════
Version compilée (npm run build puis npm run preview) dans Chromium :
1. document.querySelectorAll('#root > main').length === 1
2. document.querySelectorAll('#root > header').length <= 1 et document.querySelectorAll('#root > footer').length <= 1
3. [...document.querySelectorAll('main > *')].every(e => e.dataset.atelierSection && e.getBoundingClientRect().height > 0)
4. [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).display === 'contents').length === 0
5. document.querySelectorAll('main meta, main style, main script, main link').length === 0
6. Le nombre de main > * est égal au nombre de sections visibles de l'original.
7. Aucune erreur dans la console (polices, 404, JavaScript), aucune image cassée.
8. Onglet Réseau : aucune requête vers un autre domaine.
9. Chaque bouton (FAQ, onglets, variantes, flèches, miniatures) fait quelque chose.
10. Contrôle pixel contre l'original (pop-up marketing et bandeau cookies cachés sur les deux) : au moins 97 % à 1440 px et 95 % à 390 px.
11. Couverture CSS : part des classes du HTML de main présentes dans au moins un sélecteur de document.styleSheets ≥ 80 %.
12. Aucun svg de plus de 300 px de large sauf grande illustration de l'original.
13. La police des titres et du texte n'est pas la police par défaut du navigateur.
14. Hauteur de la page entre 0,97 et 1,03 fois celle de l'original, aux deux largeurs.
15. Chaque texte visible n'apparaît qu'une fois dans le code source.
Corrige ce qui échoue, refais les contrôles. Réponse finale : un tableau page | sections | % pixels 1440 / 390 | hauteur copie / original | contrôles 1-15 OK ? | remarques, puis le zip.

═══════════════════════════════════════
8. PAGES
═══════════════════════════════════════
(nom pour l'atelier — adresse — type : produit, offre, collection, landing, accueil, advertorial, listicle ou autre)
- marque-produit — https://exemple.com/products/xxx — produit
```

## Après ChatGPT

Me donner le chemin du zip. Je lance, sur le serveur :
`node scripts/kimi-zip.mjs ~/zips/<zip> <nom> --verifier-a-part` (≈ 10 min),
puis un contrôle rapide : score de l'atelier ≥ 85 et hauteur à ± 10 % de
l'original. Copycat seulement si tu le demandes.
