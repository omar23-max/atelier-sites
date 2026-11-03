# Prompt de correction Kimi — lot « Vault - Jeffrey » (48 pages sans style)

Le lot « Vault -Jeffrey.zip » (115 pages) a été contrôlé le 2026-11-03. 67 pages
sont bonnes et importées. Les 48 ci-dessous ont été livrées sans la feuille de
style principale du thème : texte brut, listes à puces, icônes SVG géantes,
polices par défaut du navigateur. Le chiffre en fin de ligne = part des classes
CSS du HTML qui ont une règle dans styles.css (une page saine est à 80 % ou plus).

Copier tout le bloc ci-dessous dans Kimi.

```
Tu as livré le lot « Vault - Jeffrey ». 48 pages ont un défaut grave : la feuille de style principale du thème Shopify (base.css, theme.css, styles.css, theme.scss.css, sections-*.css, component-*.css, etc.) n'a pas été récupérée. Seules quelques feuilles d'applis (slick, avis, paiement) sont dans src/styles.css. Résultat : texte brut, puces, icônes SVG en taille géante, polices par défaut.

Refais UNIQUEMENT ces 48 pages, en gardant exactement la même structure de projet, les mêmes noms de dossier et les mêmes règles que la première livraison (React + Vite, un dossier par page, main unique, une section = un enfant direct de main avec data-atelier-section, meta.json, images en WebP locales).

CE QUI DOIT CHANGER
1. Récupère TOUTES les feuilles de style de la page d'origine, pas seulement celles trouvées dans le HTML initial :
   - toutes les balises <link rel="stylesheet"> (y compris celles avec media="print" basculées en "all" au chargement, et celles avec rel="preload" as="style") ;
   - les feuilles ajoutées par JavaScript après le chargement : attends la fin du chargement (réseau au repos + 3 s), défile jusqu'en bas de la page, puis lis la liste réelle avec [...document.styleSheets] ;
   - les blocs <style> inline (y compris ceux à l'intérieur des sections Shopify) ;
   - les @import contenus dans ces feuilles.
   Le plus fiable : dans le navigateur, sur la page d'origine chargée et défilée, parcours document.styleSheets et récupère le cssText de chaque règle (ou télécharge l'adresse href de chaque feuille). Concatène dans l'ordre de document.styleSheets.
2. Les dimensions des icônes SVG viennent souvent de règles comme ".icon { width: 1.6rem; height: 1.6rem }" dans la feuille du thème : vérifie qu'aucune icône (loupe, panier, compte, flèches, réseaux sociaux) ne dépasse sa taille d'origine.
3. Images : garde le WebP, mais monte la largeur maximale à 1600 px pour les images de bannière / hero et les images de fond pleine largeur (500 px reste correct pour les vignettes et logos).
4. Pages beaucoup plus hautes que l'original (plantmade-accueil, kamana-accueil, swol-lyfe…) : la cause habituelle est un carrousel dont les diapositives sont empilées ou un bloc caché par JavaScript sur l'original et rendu visible dans la copie. Masque ce qui était masqué, et affiche les carrousels en piste horizontale (overflow-x: auto + scroll-snap).

NOUVEAUX CONTRÔLES OBLIGATOIRES (en plus des contrôles 1 à 10 habituels)
11. Couverture CSS : dans la page compilée, calcule la part des noms de classes du HTML de main qui apparaissent dans au moins un sélecteur de document.styleSheets. Elle doit être d'au moins 80 %. En dessous, une feuille manque : retourne la chercher.
12. Aucune icône géante : [...document.querySelectorAll('svg')].filter(s => s.getBoundingClientRect().width > 300 && !s.closest('[data-atelier-section] picture, [data-atelier-section] figure')).length doit être 0, sauf si l'original a la même grande illustration.
13. Police : getComputedStyle(document.querySelector('main h1, main h2, main p')).fontFamily ne doit pas être la police par défaut du navigateur (Times New Roman / serif seul) si l'original utilise une autre police.
14. Hauteur : document.documentElement.scrollHeight de la copie doit rester entre 0,8 et 1,25 fois celle de l'original à 1440 px.

Dans ta réponse finale, donne un tableau : page | couverture CSS % | hauteur copie / original | contrôles 1-14 OK ? | remarques. Si une page reste bloquée (Cloudflare, 404), dis-le et ne livre pas de version vide.

Livre un zip nommé vault-jeffrey-correction.zip contenant seulement ces 48 dossiers.

PAGES À REFAIRE (nom — adresse — type — couverture CSS actuelle)
- alpha-lion-accueil — https://www.alphalion.com/ — accueil — 1%
- alpha-lion-burn2o — https://www.alphalion.com/products/burn2o — produit — 7%
- alpha-lion-shb-lp20 — https://www.alphalion.com/pages/shb-lp20 — landing — 71%
- ancestral-supplements-accueil — https://ancestralsupplements.com/ — accueil — 10%
- balmbare-accueil — https://balmbare.com/ — accueil — 8%
- balmbare-revive-plus-mix — https://balmbare.com/products/revive-plus-mix — produit — 8%
- basketpong-accueil — https://basketpong.com/ — accueil — 2%
- basketpong-basketpong-h2o — https://basketpong.com/products/basketpong-h2o — produit — 8%
- beebald-accueil — https://www.beebald.com/ — accueil — 24%
- brazilian-belle-accueil — https://brazilianbelle.com/ — accueil — 21%
- brazilian-belle-bikini-body-detox-tea — https://brazilianbelle.com/products/bikini-body-detox-tea — produit — 1%
- hard-chews-hard-chews-libido-ignite — https://hardchews.shop/products/hard-chews-libido-ignite — produit — 70%
- health-y-sol-accueil — https://healthysolsoap.com/ — accueil — 10%
- hubman-and-chubgirl-accueil — https://hubmanchubgirl.store/ — accueil — 89%
- hubman-and-chubgirl-ultimate-subscription — https://hubmanchubgirl.store/products/ultimate-subscription — produit — 79%
- kamana-accueil — https://www.kamana.co/ — accueil — 38%
- luma-nutrition-accueil — https://lumanutrition.com/ — accueil — 8%
- mama-bear-oasis-accueil — https://mamabearoasis.com/ — accueil — 82%
- mama-bear-oasis-total-nerve-care-bundle — https://mamabearoasis.com/products/total-nerve-care-bundle — produit — 31%
- nedley-health-accueil — https://shop.nedleyhealth.com/ — accueil — 87%
- nutrivara-accueil — https://trynutrivara.com/ — accueil — 69%
- nutrivara-oregano — https://trynutrivara.com/products/oregano — produit — 70%
- oliva-dorado-accueil — https://www.olivadorado.com/ — accueil — 56%
- oliva-dorado-organic-extra-virgin-olive-oil-multipack — https://www.olivadorado.com/products/organic-extra-virgin-olive-oil-multipack — produit — 55%
- paleo-pro-paleo-protein-powder — https://paleopro.com/products/paleo-protein-powder — produit — 43%
- plantmade-9-reasons-why — https://www.weareplantmade.com/pages/9-reasons-why — listicle — 7%
- plantmade-accueil — https://www.weareplantmade.com/ — accueil — 5%
- plantmade-snow — https://www.weareplantmade.com/products/snow — produit — 2%
- pup-socks-accueil — https://pupsocks.com/ — accueil — 39%
- pup-socks-black-friday-bundles — https://pupsocks.com/products/black-friday-bundles — produit — 56%
- remastered-sleep-26oz-stainless-steel-bottle-kit — https://remasteredsleep.com/products/26oz-stainless-steel-bottle-kit — produit — 31%
- remastered-sleep-accueil — https://remasteredsleep.com/ — accueil — 19%
- remastered-sleep-offer-lp-adult — https://remasteredsleep.com/pages/offer-lp-adult — landing — 31%
- revived-smiles-accueil — https://revivedsmiles.com/ — accueil — 16%
- revived-smiles-revived-smiles-teeth-whitening-kit — https://revivedsmiles.com/products/revived-smiles-teeth-whitening-kit — produit — 27%
- rosies-chips-accueil — https://rosieschips.com/ — accueil — 52%
- rosies-chips-keystone-smoke-4-pack — https://rosieschips.com/products/keystone-smoke-4-pack — produit — 43%
- scooch-accueil — https://scooch.pet/ — accueil — 0%
- scooch-advanced-daily — https://scooch.pet/products/advanced-daily — produit — 0%
- serious-skincare-accueil — https://seriousskincare.com/ — accueil — 54%
- serious-skincare-trace-erase-lander-v1 — https://seriousskincare.com/pages/trace-erase-lander-v1 — landing — 72%
- serious-skincare-trace-erase-pdp-v1 — https://seriousskincare.com/pages/trace-erase-pdp-v1 — produit — 65%
- swol-lyfe-accueil — https://swollyfe.com/ — accueil — 19%
- swol-lyfe-f0-9f-97-bd-freedom-pump-non-stim-pre-workout-f0-9f-92-a5 — https://swollyfe.com/products/%F0%9F%97%BD-freedom-pump-non-stim-pre-workout-%F0%9F%92%A5 — produit — 33%
- teangle-accueil — https://teangle.ca/ — accueil — 15%
- yalla-halal-essentials-bundle — https://yallaformulas.com/products/halal-essentials-bundle — produit — 2%
- zedrics-45-6-breakfast-meal-deal — https://zedrics.com/products/45-6-breakfast-meal-deal — produit — 39%
- zedrics-accueil — https://zedrics.com/ — accueil — 75%
```

## Après Kimi

Donne-moi le chemin du zip. Je contrôle d'abord les 48 pages avec
`node scripts/kimi-apercu-lot.mjs` (planche de captures + couverture CSS), puis
j'importe celles qui passent avec `node scripts/kimi-zip.mjs "<zip>"`.
