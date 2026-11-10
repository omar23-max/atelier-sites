# Audit de l'interface de l'atelier (éditeur et catalogue), 2026-11-09

| # | Dimension | Score | Constat principal |
|---|-----------|-------|-------------------|
| 1 | Accessibilité | 2 | Contrastes faibles (jusqu'à 1,6:1), aucun style de focus clavier dans le catalogue, 9 `outline: none` |
| 2 | Performance | 2 | « Toutes les sections » affiche 2 038 cartes d'un coup (plus de 30 000 éléments), sans chargement progressif |
| 3 | Thème | 1 | 926 couleurs écrites en dur (260 différentes), seulement 46 variables, 33 corps de texte et 20 arrondis différents |
| 4 | Écrans | 2 | Outil pensé pour l'ordinateur ; textes à 10,5–11 px ; l'éditeur n'a que 2 règles d'adaptation |
| 5 | Cohérence de l'implémentation | 2 | Deux systèmes de style séparés (éditeur / catalogue), des couches de correctifs ajoutées au fil des jours, 102 `!important` |
| **Total** | | **9/20** | **Faible : à reprendre en profondeur** |

## Verdict cohérence : échec
L'atelier n'a pas de système de design commun. L'éditeur (`src/styles.css`, 6 443 lignes) et le catalogue (`src/catalogue/catalogue.css`, 3 278 lignes) ont chacun leurs couleurs, tailles et arrondis. Les écrans ont été construits demande par demande : 17 blocs datés ajoutés en fin de fichier, et des règles qui s'annulent (`.cat-actions` défini deux fois, aux lignes 274 et 1058, avec un alignement opposé). Le détecteur trouve des cartes dans des cartes (templates, « Enrichir ») et une police unique, Inter, partout (69 % du texte de l'éditeur).

## Résumé
- Score : 9/20 (faible).
- Problèmes : P0 = 0, P1 = 4, P2 = 6, P3 = 2.
- Les plus importants :
  1. Pas de base commune de couleurs, tailles et arrondis (cause de presque tout le reste).
  2. La vue « Toutes les sections » est très lourde (2 038 cartes à la fois).
  3. Navigation au clavier sans repère visible.
  4. Textes trop petits et trop pâles (compteurs, badges, entrées vides du menu).
- Suite recommandée : créer la base commune, puis reprendre les écrans un par un (catalogue d'abord).

## Problèmes par gravité

**[P1] Aucune base commune (couleurs, tailles, espacements)**
- Où : `src/styles.css`, `src/catalogue/catalogue.css`
- Catégorie : Thème / Cohérence
- Impact : chaque écran a l'air un peu différent ; chaque changement est long et en casse un autre.
- Faits : 926 couleurs en dur (260 valeurs), 46 variables, tailles de texte 10 / 10,5 / 11 / 11,5 / 12 / 12,5 / 13 / 13,5 px…, 20 arrondis.
- Correction : une feuille de jetons unique (couleurs par rôle, échelle de 5–6 tailles, 3 arrondis, espacements), utilisée par l'éditeur ET le catalogue.
- Commande : /impeccable extract (puis /impeccable typeset, /impeccable layout)

**[P1] « Toutes les sections » : 2 038 cartes affichées d'un coup**
- Où : `src/catalogue/Catalogue.jsx` (vue `tout`, `FamilyBlock`)
- Catégorie : Performance
- Impact : page lente, mémoire du navigateur, défilement saccadé ; le détecteur ne peut même pas l'analyser.
- Correction : afficher 8–12 cartes par famille avec « Voir les 136 », ou charger au défilement.
- Commande : /impeccable optimize

**[P1] Navigation au clavier sans repère**
- Où : catalogue (aucun `:focus-visible`), éditeur (9 `outline: none`, 3 `:focus-visible`)
- Catégorie : Accessibilité (WCAG 2.4.7)
- Impact : avec Tab, on ne voit pas où on est.
- Correction : un anneau de focus commun dans la base.
- Commande : /impeccable harden

**[P1] Entrées vides du menu presque invisibles**
- Où : menu de gauche du catalogue, `button.is-empty` (texte #a3a3a3 sur #f6f5f2 = 2,3:1 ; compteur #c4c4c3 = 1,6:1)
- Catégorie : Accessibilité (WCAG 1.4.3)
- Impact : « Sticky Add to cart 0 », « Autres pages 0 » sont illisibles alors qu'on peut cliquer dessus.
- Correction : contraste ≥ 4,5:1 et un autre signe que le gris (ex. « 0 » en pastille vide).
- Commande : /impeccable colorize

**[P2] Compteurs et badges trop petits et trop pâles**
- Où : compteurs du menu et des filtres (#737271 / #6f6f6f, 4,3–4,4:1) ; badges des cartes à 10,5 px ; étiquette de type des templates à 11 px (35 cartes)
- Catégorie : Accessibilité / Lisibilité
- Correction : 12 px minimum, gris plus foncé.
- Commande : /impeccable typeset

**[P2] Cartes dans des cartes**
- Où : cartes de template (aperçu encadré dans la carte), « Enrichir le catalogue » (`div.cat-batch`)
- Catégorie : Cohérence
- Impact : trop de cadres, l'œil ne sait pas où regarder.
- Commande : /impeccable distill

**[P2] Titres sautés**
- Où : « Enrichir le catalogue » (h1 puis h3)
- Catégorie : Accessibilité (structure)
- Commande : /impeccable harden

**[P2] Lignes trop longues**
- Où : encadrés d'aide (`div.cat-info`, ~175 caractères par ligne)
- Correction : 70–80 caractères maximum.
- Commande : /impeccable layout

**[P2] Infobulles utilisées comme étiquettes**
- Où : 191 attributs `title` ; icônes du rail de gauche
- Impact : invisibles au clavier et au toucher.
- Commande : /impeccable clarify

**[P2] Aucune réduction des animations**
- Où : aucun `prefers-reduced-motion` (éclairage de sélection, défilements, transitions)
- Catégorie : Accessibilité (WCAG 2.3.3)
- Commande : /impeccable animate

**[P3] Police unique, Inter partout**
- Impact : l'atelier ressemble à n'importe quel outil. Une police de titres distincte donnerait une identité.
- Commande : /impeccable typeset

**[P3] 7 éléments cliquables qui ne sont pas des boutons**
- Où : `div`/`span`/`li` avec `onClick` dans `src/*.jsx`
- Commande : /impeccable harden

## Problèmes de fond
- Les écrans ont été ajoutés demande par demande, sans base commune : 17 blocs de correctifs datés, des règles qui s'écrasent, 102 `!important` (une partie est nécessaire dans l'aperçu, pour passer devant le CSS des pages importées).
- Gris et petites tailles partout : la hiérarchie repose sur « plus petit et plus pâle » au lieu de l'espacement et de la graisse.

## Ce qui marche bien
- Toutes les images ont un texte alternatif ; 65 boutons-icônes ont une étiquette (`aria-label`).
- Les styles propres à l'aperçu ne sont jamais exportés dans les pages publiées.
- Les écrans récents (filtres, emplacements de sections, cartes par type) suivent déjà un même modèle : bonne base pour la suite.
- Les pages de projet et la page « Enrichir » ont peu d'alertes.

## Actions recommandées
1. **[P1] `/impeccable extract`** : créer la base commune (couleurs par rôle, tailles, arrondis, espacements, focus) partagée par l'éditeur et le catalogue.
2. **[P1] `/impeccable optimize`** : alléger « Toutes les sections » (aperçu par famille + « Voir tout »).
3. **[P1] `/impeccable harden`** : focus visible, titres dans l'ordre, vrais boutons.
4. **[P1] `/impeccable colorize`** : contrastes du menu et des compteurs.
5. **[P2] `/impeccable typeset`** : échelle de texte, minimum 12 px, police de titres.
6. **[P2] `/impeccable distill`** : enlever les cadres doublés.
7. **[P2] `/impeccable layout`** : largeur des textes, espacements.
8. **`/impeccable polish`** : passe finale.

---

# Après les corrections (2026-11-10)

| # | Dimension | Avant | Après | Ce qui a changé |
|---|-----------|-------|-------|-----------------|
| 1 | Accessibilité | 2 | 3 | Focus clavier visible partout, contrastes ≥ 4,5:1 (menu, compteurs), titres h1 → h2, mouvement réduit respecté. Reste : 191 infobulles `title` |
| 2 | Performance | 2 | 3 | « Toutes les sections » : 2 014 → 259 cartes, 38 417 → 5 362 éléments ; familles par 48 |
| 3 | Thème | 1 | 3 | Base commune `src/tokens.css` (couleurs par rôle, texte, arrondis, espaces, ombres, focus) ; ~800 couleurs et ~290 tailles ramenées aux jetons |
| 4 | Écrans | 2 | 2 | Inchangé : outil pensé pour l'ordinateur |
| 5 | Cohérence | 2 | 3 | Un seul accent (indigo), une famille de boutons, plus de cartes dans des cartes, plus de sur-titre « Outil » |
| **Total** | | **9/20** | **14/20** | **Bon** |

Détecteur Impeccable sur Toutes les sections, Templates, une famille,
Enrichir et Projets : aucune alerte. Restent, volontairement : la couleur
propre d'un design dans son aperçu (Designs) et la police Inter de l'éditeur
(choix d'outil).

Pistes suivantes, si besoin : remplacer les infobulles par de vraies
étiquettes (/impeccable clarify), adapter le catalogue aux écrans étroits
(/impeccable adapt), une police de titres pour donner une identité
(/impeccable typeset).
