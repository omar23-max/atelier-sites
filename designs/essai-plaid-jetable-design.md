# Plaid à Moi (Essai plaid jetable)

Source : kit de marque du projet « Essai plaid jetable » (étape Marque et design)
Créé le : 2026-11-26

## Ambiance

Chaleureux, rassurant et direct, tendre sans faire bébé. Violet électrique pour
l'action, turquoise pour les détails, fond blanc et bleu très pâle, bandeaux
violet nuit. Se démarque des codes beige pastel habituels de la puériculture.

## Typographie

- **Titres : Bricolage Grotesque**, graisse 700 (proposition de l'agent Brand
  Sprint, pas encore adoptée dans le kit : à confirmer).
- **Texte : Atkinson Hyperlegible**, graisse 400, 17-18 px (idem).

## Couleurs

| Rôle | Couleur | Usage |
|---|---|---|
| Fond de page | #ffffff | Sections claires (kit : fond) |
| Surface | #f3f6ff | Cartes, encadrés, packs (kit : surface) |
| Surface marquée | #e6deff | Pack sélectionné (violet du bouton éclairci) |
| Texte | #17151f | Titres et texte (kit : texte) |
| Accent | #00a7b5 | Icônes, coches, pastilles (kit : accent) ; trop clair pour un texte fin sur blanc |
| Accent clair | #5fdbe4 | Accent sur fond sombre |
| Bouton | #5b2eff | Ajouter au panier (kit : bouton) |
| Texte des boutons | #ffffff | |
| Fond sombre | #120a2a | Bandeaux sombres (kit : sombre) |
| Fond sombre (dégradé) | #2a1763 | Bas des dégradés sombres |
| Surface sombre | #221548 | Cartes sur fond sombre |
| Texte sur fond sombre | #ffffff | |
| Étoiles et badges | #f5a623 | Notes, sceau de garantie |

Les 6 couleurs du kit sont reprises telles quelles ; les 7 autres rôles en sont
dérivés.

## Formes

- Rayons : cartes 12 px, boutons 10 px, pastilles 999 px.
- Ombres très légères ; beaucoup d'air entre les sections.

## Jetons (utilisés par l'atelier)

```json
{
  "polices": { "titres": "Bricolage Grotesque", "texte": "Atkinson Hyperlegible" },
  "couleurs": {
    "fond": "#ffffff",
    "surface": "#f3f6ff",
    "surface-forte": "#e6deff",
    "texte": "#17151f",
    "accent": "#00a7b5",
    "accent-clair": "#5fdbe4",
    "bouton": "#5b2eff",
    "bouton-texte": "#ffffff",
    "fond-sombre": "#120a2a",
    "fond-sombre-2": "#2a1763",
    "surface-sombre": "#221548",
    "texte-sur-sombre": "#ffffff",
    "etoiles": "#f5a623"
  }
}
```
