# Templates à faire reproduire par Kimi

> Consignes complètes à donner à Kimi pour tout clonage : [prompt-kimi-clonage.md](prompt-kimi-clonage.md).

Liste de tous les templates miroirs de l'atelier (44 avec une adresse), au 2026-10-30.

**Comment faire :** donne à Kimi la consigne ci-dessous avec ce fichier (ou la liste). Il reproduit chaque page dans un dossier qui porte son **nom pour l'atelier**, puis met tous les dossiers dans **un seul zip**. Ce zip est celui à donner à Claude : chaque dossier remplacera l'ancien template du même nom et ses sections du catalogue.

## Consigne à donner à Kimi

```text
Reproduis à l'identique (ordinateur et mobile) chaque page de la liste ci-dessous.

Pour chaque page :
- Une application React + Vite séparée, une seule page.
- Mets tous ses fichiers dans un dossier séparé qui porte exactement le nom
  de la colonne « Nom pour l'atelier » (par exemple : alpha-lion-offre/).
  Ce dossier contient directement package.json, index.html, src/ et public/.
- Tout le contenu (textes, prix, avis, FAQ, images) dans src/data/.
- Images et polices téléchargées dans public/assets (aucun lien vers le site d'origine).
- Chaque bloc de la page dans sa propre balise <section>.
- Interactions reproduites : galeries et carrousels qui glissent par transform,
  accordéons et choix par des classes CSS (is-open, is-selected),
  galerie collante (position: sticky) si le site en a une.
- Pas de panier ni de paiement réels : les boutons d'achat sont de simples boutons.
- Ne mets pas le dossier node_modules.

Quand toutes les pages sont terminées, mets tous les dossiers dans un seul
fichier zip (un dossier par page à la racine du zip), et donne-moi ce zip.
```

## Liste

| # | Nom pour l'atelier | Type | Adresse |
|---|---|---|---|
| 1 | `adv-8sheep` | advertorial | https://get.8sheep.com/ep-jr-advt-v2/ |
| 2 | `adv-dailyskinmagazine` | advertorial | https://dailyskinmagazine.com/flawless-skin-over-50pbls-us-tb |
| 4 | `adv-drmtlgy` | advertorial | https://www.drmtlgy.com/pages/matte-utm-advertorial |
| 5 | `adv-heartandsoil` | listicle | https://heartandsoil.co/blog/the-carnivore-diet-start-here/ |
| 6 | `adv-nebroo` | advertorial | https://offer.nebroo.com/presell-v1 |
| 7 | `adv-nooro-us` | advertorial | https://try.nooro-us.com/review-40-3 |
| 8 | `adv-sherum` | advertorial | https://live.sherum.com/offer/Sherum/sherum-cooling-ace/view10996 |
| 9 | `adv-thecollagen` | advertorial | https://us.thecollagen.co/pages/what-is-collagen?country=US |
| 10 | `adv-topchicdeals` | advertorial | https://topchicdeals.com/me/new/Hilipert/anti-mosquito-watch/view27184 |
| 11 | `adv-trymiamimd` | advertorial | https://trymiamimd.com/prelanders/lift-firm/v3-1-i5/ |
| 12 | `aires-tech-offre` | produit | https://airestech.com/products/lifetune-one |
| 13 | `alpha-lion-offre` | offre | https://try.alphalion.com/offers/shb-lp01 |
| 14 | `alpha-lion-offre-2` | offre | https://try.alphalion.com/offers/b2o-lp01 |
| 15 | `ancestral-supplements-landing` | landing | https://ancestralsupplements.com/pages/fem |
| 16 | `bloome-offre` | produit | https://bloomelab.com/products/flo-brush |
| 17 | `carpe-offre` | offre | https://mycarpe.com/pages/save-56-build-your-bundle |
| 18 | `clean-skin-club-offre` | offre | https://cleanskinclub.com/pages/4p-v1 |
| 19 | `crown-naturale-offre` | offre | https://more.crownnaturale.com/herbal-greens-powder |
| 20 | `drmtlgy-produit` | produit | https://www.drmtlgy.com/pages/lec-3-reasons-why-listicle |
| 21 | `elevate-landing` | landing | https://elavate.com/products/collagen?variant=47747426386259 |
| 22 | `freebird-offre` | listicle | https://www.myfreebird.com/pages/lp1 |
| 23 | `hostage-tape-listicle` | listicle | https://hostagetape.com/pages/ht-listicalt |
| 24 | `infinite-age-offre` | offre | https://infiniteage.com/pages/lp2 |
| 25 | `kinobody-produit` | produit | https://kinobody.com/products/kino-mojo?view=kino-mojo-landing |
| 26 | `luma-landing` | landing | https://lumanutrition.com/pages/berberine |
| 27 | `lume-listicle` | offre | https://try.lumedeodorant.com/fb-pro-2 |
| 28 | `magicmind-produit` | produit | https://magicmind.com/products/mental-performance-shot-original?selling_plan=445022342 |
| 29 | `nectar-listicle` | listicle | https://drinknectar.co/pages/10-reasons-why |
| 30 | `nood-produit` | produit | https://trynood.com/products/the-flasher-pro |
| 31 | `norse-organics-offre` | offre | https://norseorganics.co/pages/stop-acne |
| 32 | `norse-organics-produit` | produit | https://norseorganics.co/products/kill-acne-redness-ritual?variant=47373610877270 |
| 33 | `novaalab-listicle` | listicle | https://novaalab.com/pages/10-reasons-why-1 |
| 34 | `novaalab-produit` | produit | https://novaalab.com/products/new-red-light-therapy-pad-at-home-with-remote |
| 35 | `old-school-labs-listicle` | listicle | https://shop.oldschoollabs.com/pages/7_reasons_why_cfw1 |
| 36 | `primal-herbs-accueil` | accueil | https://primalherbs.com/ |
| 37 | `ryze-offre` | offre | https://www.ryzesuperfoods.com/pages/matcha-lp |
| 38 | `smileactives-offre` | offre | https://smileactives.com/pages/lp-specialoffer9 |
| 39 | `snap-supplements-landing` | landing | https://snapsupplements.com/pages/landing-prostate-no-v2 |
| 40 | `snow-produit` | accueil | https://www.trysnow.com/products/snowactive-sensitive-snow-strips |
| 41 | `superior-mane-produit` | produit | https://thesuperiormane.com/products/root-activator-shampoo-sale?variant=46752876691708 |
| 42 | `tao-listicle` | listicle | https://www.taoclean.com/pages/11-reasons-why-the-umma-sonic-toothbrush-is-taking-the-dental-world-by-storm-in-2025 |
| 43 | `tao-offre` | offre | https://www.taoclean.com/pages/reserve-toothbrush-50-1 |
| 44 | `untamed-listicle` | landing | https://untamed.com/pages/food-cats-will-go-wild-for |


Sans adresse (pages créées dans l'atelier, pas des miroirs) : `aurivita-capsaicin`, `nutraboost-home`.
