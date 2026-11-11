# Prompt à donner à ChatGPT pour convertir un clone (ai-site-cloner) au format de l'atelier

Quand ChatGPT (ou Codex) a déjà cloné une page avec le skill ai-site-cloner
(projet Next.js qui rejoue le HTML et le CSS d'origine), ce prompt lui demande
de livrer la même page au format que l'atelier importe tout seul : celui des
pages Kimi (`node scripts/kimi-zip.mjs "<zip>"`, voir `docs/prompt-kimi-clonage.md`).
Le travail de fidélité est déjà fait : ChatGPT ne fait que réorganiser.

À coller dans la MÊME conversation ChatGPT que celle qui a fait le clone (il
connaît déjà le projet). Remplir seulement les deux lignes « PAGE » à la fin.

```text
MISSION
Tu as déjà cloné cette page dans le projet Next.js « scooch-ai-site-cloner » (rendu très fidèle : garde-le). Je ne veux pas de nouvelle extraction : je veux la MÊME page, livrée dans un autre format, pour qu'un éditeur visuel (« l'atelier ») l'importe automatiquement et la découpe en sections modifiables. Le rendu doit rester identique à ton clone actuel, et la structure doit respecter exactement les règles ci-dessous, sinon l'import échoue. Lis toutes les règles avant de commencer.

═══════════════════════════════════════
1. CE QUI CHANGE PAR RAPPORT À TON CLONE
═══════════════════════════════════════
- Plus de Next.js : une application React + Vite autonome (ou du HTML statique servi par Vite).
- UNE SEULE version de la page, responsive. Aujourd'hui tu as trois arbres (scooch-pc.json, scooch-ipad.json, scooch-phone.json) et tu changes d'arbre selon la largeur : c'est interdit ici. Pars de l'arbre ordinateur et de la feuille CSS d'origine (elle est déjà responsive) ; vérifie le rendu à 390 px et corrige seulement ce qui diffère. Un texte ne doit exister qu'UNE fois dans le HTML.
- Plus d'arbres JSON rejoués par un composant générique : le HTML final est écrit (ou injecté une fois) dans la structure de la partie 3.
- Les interactions (FAQ, onglets, galerie, choix de taille et de pack) suivent les règles de la partie 6, sans data-clone-click.
- Les fenêtres de démonstration (panier local, avis, Rio) : gardées seulement si elles respectent la partie 3 j ; sinon supprimées.

═══════════════════════════════════════
2. LIVRAISON
═══════════════════════════════════════
- Un dossier nommé EXACTEMENT comme le « nom pour l'atelier » donné à la fin (minuscules, tirets). Pas de suffixe.
- À la racine du dossier : package.json, index.html, vite.config.js, src/, public/, README.md, meta.json.
- package.json : scripts "dev", "build", "preview" ; dépendances publiques seulement (react, react-dom, vite, @vitejs/plugin-react, et le strict nécessaire). Aucun script postinstall / preinstall / prepare. Pas de Tailwind à compiler : la feuille CSS d'origine extraite suffit.
- package-lock.json : seulement s'il pointe vers https://registry.npmjs.org.
- Pas de node_modules, pas de dist, pas de .next, pas de captures, pas de scripts d'extraction ou d'audit, pas de docs/.
- meta.json : { "name": "<nom pour l'atelier>", "type": "<produit|offre|collection|landing|accueil|advertorial|listicle|autre>", "source": "<adresse d'origine>", "title": "<titre de la page>" }.
- README.md : l'adresse d'origine et la commande npm install && npm run build.
- Le dossier dans UN zip, sans dossier parent supplémentaire : à l'ouverture du zip, on voit directement le dossier de la page.
- npm install puis npm run build doivent réussir sur un ordinateur neuf, avec seulement registry.npmjs.org.

═══════════════════════════════════════
3. STRUCTURE HTML (la règle la plus importante)
═══════════════════════════════════════
La page rendue doit avoir exactement cette forme :

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

a) Chaque section VISIBLE (fiche produit, bandeau de logos presse, vidéos clients, récompenses, symptômes, explication, avant/après, avis, FAQ…) est UN enfant direct de <main>. Une section = un élément. Les sections Shopify d'origine (shopify-section-…) sont un bon découpage : une par section visible.
b) Chaque enfant direct de <main> porte data-atelier-section avec un nom lisible en français : "Fiche produit", "Logos presse", "Vidéos clients", "Récompenses", "Symptômes", "Explication", "Avant / après", "Avis clients", "Liste d'avis", "FAQ", etc.
c) Aucun élément en display: contents, nulle part. Pas d'enveloppe invisible autour de la page. Une enveloppe qui porte une mise en page utile (fond, largeur max, police) : ses styles passent à <main> ou à la section.
d) Pas de <div> d'un seul enfant entre #root et <header>/<main>/<footer>.
e) Rien de technique dans <main> : pas de <meta>, <style>, <script>, <link>, pas de voile, pas de lien « skip to content », pas d'élément de hauteur nulle.
f) Variantes ordinateur / mobile d'une même section : dans la MÊME section, côte à côte, avec leurs classes de visibilité d'origine.
g) Barre d'achat collante : dans la section « Fiche produit ».
h) Barre d'annonce et menu : dans <header>. Un élément nommé « header » à l'intérieur d'une section devient un <div> (adapte le sélecteur CSS).
i) Pied de page : tout dans un seul <footer>, y compris la newsletter du pied.
j) Fenêtres (panier latéral, recherche, pop-up de réduction, galerie plein écran) : après </footer>, role="dialog", fermées au chargement.

═══════════════════════════════════════
4. CONTENU
═══════════════════════════════════════
- Vrais textes HTML, titres en h1/h2/h3 comme sur l'original, langue d'origine, rien d'inventé ni d'abrégé.
- Tout est visible dès le chargement : pas d'élément à opacity: 0 qui n'apparaît qu'au défilement (l'état final des animations d'apparition doit être visible sans défiler).
- Images : fichiers locaux dans public/assets, chemins /assets/…, src réel (pas de data-src). loading="lazy" natif autorisé. Largeur max 1600 px pour les héros et fonds pleine largeur, 800 px pour le reste. Les 4 images qui ne s'affichent pas dans ton clone actuel : récupère-les ou retire leur emplacement.
- Vidéos : fichiers locaux ou image d'aperçu ; pas d'iframe.

═══════════════════════════════════════
5. STYLES ET POLICES
═══════════════════════════════════════
- La feuille d'origine (ta public/styles/scooch.css) dans src/styles.css, importée par main.jsx, dans l'ordre d'origine. Contenu des <style> déplacé dans ce fichier.
- Aucune ressource externe (pas de CDN, pas de Google Fonts en ligne).
- Polices locales dans public/assets, déclarées par @font-face, vérifiées dans Chromium : aucun « Failed to decode downloaded font » ni « OTS parsing error ».

═══════════════════════════════════════
6. INTERACTIONS (sans le site d'origine)
═══════════════════════════════════════
- Chaque bouton produit un changement visible en moins de 300 ms, sans recharger la page.
- FAQ / accordéons : <details><summary> ou <button aria-expanded> qui ouvre/ferme par une classe ou l'attribut hidden.
- Onglets (« Tell me about »), choix de taille du chien, choix du pack, abonnement / achat unique : classe "is-active" / "selected" ou aria-selected, et le bon contenu affiché.
- Galerie produit et carrousels : piste qui défile horizontalement (overflow-x: auto + scroll-snap), boutons aria-label="Précédent" / aria-label="Suivant" qui la font défiler ; miniatures qui font défiler la galerie. Diapositives écrites une seule fois (pas de Swiper, Slick, Embla recréé en JavaScript).
- Boutons d'achat : data-demo-action="purchase", aucune vraie transaction.
- Liens : href conservés ; pas de redirection.
- Aucun script tiers (analytics, pixel, chat, Klaviyo, Okendo en iframe, cookies).

═══════════════════════════════════════
7. CONTRÔLES AVANT LIVRAISON (à 1440 px ET à 390 px)
═══════════════════════════════════════
Lance la version compilée (npm run build puis npm run preview) dans Chromium et vérifie dans la console :
1. document.querySelectorAll('#root > main').length === 1
2. document.querySelectorAll('#root > header').length <= 1 et document.querySelectorAll('#root > footer').length <= 1
3. [...document.querySelectorAll('main > *')].every(e => e.dataset.atelierSection && e.getBoundingClientRect().height > 0)
4. [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).display === 'contents').length === 0
5. document.querySelectorAll('main meta, main style, main script, main link').length === 0
6. Le nombre de main > * est égal au nombre de sections visibles de l'original.
7. Aucune erreur dans la console (polices, 404, JavaScript).
8. Onglet Réseau : aucune requête vers un autre domaine.
9. Chaque bouton (FAQ, onglets, tailles, packs, flèches, miniatures) fait quelque chose.
10. Ton propre contrôle pixel (pixelmatch) contre tes captures de l'original : au moins aussi bon qu'avant (ordinateur ≈ 98,9 %, mobile ≈ 96,5 %).
11. Couverture CSS : part des classes du HTML de main présentes dans au moins un sélecteur de document.styleSheets ≥ 80 %.
12. Aucun svg de plus de 300 px de large sauf grande illustration de l'original.
13. La police des titres et du texte n'est pas la police par défaut du navigateur.
14. Hauteur de la page entre 0,95 et 1,05 fois celle de l'original, aux deux largeurs.
15. Chaque texte visible n'apparaît qu'une fois dans le code source (pas trois arbres).
Corrige ce qui échoue, refais les contrôles. Réponse finale : un tableau page | sections | % pixels 1440 / 390 | hauteur copie / original | contrôles 1-15 OK ? | remarques, puis le zip.

═══════════════════════════════════════
8. PAGE
═══════════════════════════════════════
- Nom pour l'atelier : scooch-anal-glands-gpt
- Adresse d'origine : https://scooch.pet/products/anal-glands — type : produit
```

## Après ChatGPT

Donne-moi le chemin du zip. Je lance `node scripts/kimi-zip.mjs "<zip>"` : il
installe, compile, importe la page et crée ses sections dans le catalogue. Puis
la passe après import (`scripts/apres-import/LISEZ-MOI.md`) et le contrôle des
blocs invisibles (piège des pages Kimi, `docs/TRAITER-DEMANDES.md`).
