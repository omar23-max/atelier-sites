# Après chaque import (mirror / copie de nouvelles pages)

Procédure à refaire **à chaque fois** qu'on importe de nouvelles pages, pour leurs
sections (template) et celles qui partent au catalogue. Origine : passe de nuit du
2026-11-07. Tout se lance **sur le serveur**, depuis `~/atelier-sites` ; les journaux
vont dans `~/apres-import/` (hors du dépôt).

Avant tout : une sauvegarde
`tar czf ~/sauvegardes/avant-apres-import-$(date +%Y%m%d-%H%M).tgz sections pages`.

| Ordre | Quoi | Commande (dans `scripts/apres-import/`) |
|---|---|---|
| 1 | Mesurer les nouvelles sections (vide en haut, cadres, FAQ, carrousels) | `node analyse.mjs --ids a,b,c --out ~/apres-import/nouveau.jsonl` |
| 2 | Cadres carrés des copies (déjà dans `copie.mjs` pour les nouveaux imports ; à relancer si besoin) | `node controles.mjs` |
| 2 bis | Polices restées sur le site d origine : tester chaque adresse, ranger dans imports/_polices/ celles que le site bloque, reprendre celles déjà rangées par un import (polices disparues) — 2026-11-17 | `node polices-locales.mjs --dry` puis `node polices-locales.mjs` (ou `--ids a,b`) |
| 3 | Cadres carrés des sections Kimi / refaites | `node controles-kimi.mjs` |
| 4 | Flèches de carrousel non reconnues | `node fleches.mjs --ids <sections avec piste sans flèches>` |
| 5 | FAQ sans questions reliées (catalogue : sections dont le texte dit FAQ / Questions) | `node faq-build.mjs --ids …` |
| 6 | Style FAQ (ouvert dans l'éditeur, clic ailleurs, questions au-dessus des calques) | `node faq.mjs` |
| 7 | Réponses vides → consigne « [Réponse : 2-3 phrases] » | `node reponses-vides.mjs` |
| 8 | Reporter les nouvelles réponses dans les pages qui utilisent ces sections | `node pages-faq.mjs` |
| 9 | Vide en haut (sections taillées dans une page à positions fixes, ex. Unbounce) — **catalogue seulement**, jamais les sections `-pN` d'un template (leur contenu est réassemblé à l'affichage) | `node rogner.mjs id1 id2` |
| 9 bis | Sections « excentrées » : trier (colonne d'image vide ou vrai décalage), puis centrer sur ordinateur ; un décalage qui fait sortir un cadre de l'écran est refusé (2e essai `--marges`) | `node trier.mjs` puis `node centrer.mjs` (et `--marges --ids …`) |
| 9 ter | « Sections à revoir » restantes : masquer les vides, accepter le reste (`meta.auditAccepte`, que l'audit respecte), couper les débordements (`atl-debord`). Décisions dans `~/apres-import/decisions-vide.json` | `node actions-revoir.mjs` |
| 9 quater | Sections découpées en une section par élément (raisons, bonnets, avis…) : regrouper les morceaux qui se suivent dans une même page, **de même famille** et de structure presque identique (≤ 45 emplacements ; morceaux masqués, `regroupeeDans`). Montrer d'abord la planche à l'utilisateur | `node regrouper.mjs --dry --familles a,b` → `node planche-regroup.mjs` → `node regrouper.mjs --familles a,b` |
| 10 | Classer les nouvelles sections du catalogue **d'après leur contenu** (Claude relit chaque section ; décisions `index:famille` dans `classes-*.txt`, ancienne famille gardée dans `familyAvant`) | `node reclasser.mjs` |
| 11 | Miniatures des sections touchées | `node scripts/thumbs.mjs id1 id2 …` (depuis `~/atelier-sites`) |
| 12 | Contrôle « Sections à revoir » | `node scripts/audit-sections.mjs id1 id2 …` |
| 13 | Vérifier les pages entières sur ordinateur ET mobile (erreurs JS, cadres, FAQ qui s'ouvre, carrousels, images manquantes, débordement, sections invisibles). Chaque page est ouverte dans son propre contexte d'éditeur (sinon ses morceaux `-pN` manquent) et servie depuis 127.0.0.1:5180 (sinon le navigateur bloque les images). 3 en parallèle : `OUT=… node check-tout.mjs lot` | `node check-tout.mjs page1 page2` |
| 13 bis | Débordement d'une page → bloc `atl-debord` sur le morceau fautif ; section Whitelabeler (lecture seule) → `atl_styles` de la page (`section.all.base.overflow-x: clip`) | (à la main, voir `~/apres-import/repasse/`) |
| 13 ter | FAQ reliée mais réponse totalement vide (aucun emplacement relevé) → emplacement-consigne « [Réponse : 2-3 phrases] » dans la section et les pages | `node reponses-absentes.mjs --pages a,b [--dry]` |

Ne jamais écrire dans `pages/` pendant qu'un contrôle (check-tout) ouvre l'éditeur : sauvegarde automatique.
Reclassement complet : `node digest.mjs` (résumé des sections), Claude relit par lots de 230, décisions dans `classes-N.txt`.

Outils de contrôle : `shot.mjs <id> [largeur]` (capture d'une section),
`test-faq.mjs <id> faq|car` (clic sur une FAQ ou une flèche).

Le moteur fait le reste tout seul (`src/engine/render.js`) : FAQ ouvrantes
(`ACC_SCRIPT`), carrousels actifs dès qu'une piste existe, images choisies qui
remplacent les `<source>` du site d'origine. Voir aussi `docs/TRAITER-DEMANDES.md`,
partie « Sections : cadres, FAQ, carrousels, vide en haut, familles ».
