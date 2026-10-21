# Format d'une section

Chaque section est écrite **une seule fois**, dans un dossier `sections/<id>/`.
Ce même dossier sert à la fois :

- à l'**aperçu et l'édition dans Puck** (rendu avec LiquidJS et des données d'exemple) ;
- à l'**export Shopify** (`npm run export:shopify` → `export/shopify/sections/atl-<id>.liquid`).

Le gabarit est écrit directement en **Liquid Shopify** : il n'y a donc rien à
traduire à l'export, et ce qui s'affiche dans Puck est ce que Shopify affichera.

## Les 4 fichiers

| Fichier | Rôle |
|---|---|
| `schema.json` | Le schéma Shopify **pur** de la section (`name`, `settings`, `blocks`, `presets`). Il devient le panneau d'édition de droite, dans Puck comme dans Shopify. |
| `template.liquid` | Le HTML de la section, en Liquid. Lit `section.settings.*`, `section.blocks`, et plus tard `product.*`. |
| `style.css` | Le CSS de la section. Toutes les règles commencent par la classe racine de la section (`.atl-<id>`), pour ne jamais déborder sur le reste de la page. |
| `meta.json` | Infos propres à l'atelier, jamais envoyées à Shopify : nom affiché, catégorie, site d'origine, valeurs d'aperçu. |

## Règles du gabarit

- La racine est un seul élément avec la classe `atl-<id>`.
- Les couleurs réglables passent par des variables CSS posées sur la racine
  (`style="--atl-bg: {{ section.settings.color_bg }}"`), et le CSS les lit avec
  une valeur de secours : `background: var(--atl-bg, #3b0a0e)`.
- Les polices passent par les variables du kit de marque, avec secours :
  `font-family: var(--atl-font-heading, Georgia, serif)`.
- Images : `{{ section.settings.image | image_url: width: 1200 }}`, toujours
  protégé par `{% if section.settings.image != blank %}`.
- Blocs : `{% for block in section.blocks %}{% if block.type == 'x' %}`, avec
  `{{ block.shopify_attributes }}` sur l'élément du bloc.
- Pas de `{% schema %}` dans le gabarit : il est ajouté à l'export.

## Textes d'exemple = brief de rédaction

Les valeurs par défaut des textes décrivent ce qu'il faut écrire et sa longueur,
entre crochets : `[ Titre de la garantie — 3-4 mots ]`. On garde ainsi la
mise en page du site d'origine sans jamais reprendre ses textes.

## `meta.json`

```json
{
  "label": "Garantie — carte avec badge",
  "category": "Confiance",
  "source": { "url": null, "capturedAt": null, "note": "..." },
  "preview": { "badge_image": "" },
  "previewBlocks": {}
}
```

- `preview` : valeurs utilisées seulement dans l'atelier (par ex. une image
  d'exemple, puisque Shopify n'accepte pas d'image par défaut).
- `source` : d'où vient la structure, pour s'y retrouver dans la librairie.
- `photosOrigine` : photos découpées dans la capture du site d'inspiration,
  affichées dans l'aperçu tant que le champ image est vide. Jamais exportées.
  `settings` pour les réglages de la section, `blocks` pour chaque bloc dans
  l'ordre :

  ```json
  "photosOrigine": {
    "settings": { "image": "/imports/aurivita-capsaicin/images/11-01.png" },
    "blocks": { "etape": [{ "image": "/imports/aurivita-capsaicin/images/06-01.png" }] }
  }
  ```

## Type de page et Page Score

Chaque page porte dans ses réglages (`root.props`) :

- `pageType` : `produit` ou `landing` (on achète sur la page), `accueil`,
  `advertorial`, `listicle` ou `autre` (on achète ailleurs) — voir
  `src/engine/page-types.js` ;
- `produit` : regroupe les pages d'un même produit dans la liste des pages ;
- `profil` : le client visé par cette page (une page par profil) ;
- `pageAchat` : pour une page sans achat, la page où l'on achète.

L'onglet **Score** (colonne de gauche) note la page sur 100 selon son type
(`src/engine/page-score.js`) : chaque famille de section conseillée rapporte
des points. Les familles manquantes sont proposées avec leur emplacement
(« après Témoignages ») et les modèles du catalogue. Pour qu'une section compte,
sa `family` dans `meta.json` doit être juste.
