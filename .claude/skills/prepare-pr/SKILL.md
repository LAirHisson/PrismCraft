---
name: prepare-pr
description: Checklist avant d'ouvrir une pull request sur PrismCraft (lint, build, vérification manuelle, format de commit et de description). Utiliser juste avant de committer/pousser une contribution terminée.
---

# Préparer une pull request

Référence complète : [CONTRIBUTING.md](../../../CONTRIBUTING.md).

## Checklist avant de committer

1. `npm run lint` — corrige tout ce qui remonte (pas de suppression de règle pour
   faire passer une erreur, sauf cas justifié explicitement dans le commit).
2. `npm run build` — doit terminer sans erreur.
3. Test manuel en jeu (`npm run dev`) de ce qui a changé — un build qui passe ne
   prouve pas qu'une fonctionnalité marche. Pour un changement de rendu/physique/
   génération, un script Playwright ponctuel (verrouillage pointeur, simulation de
   mouvement souris, capture d'écran) est le moyen le plus fiable de vérifier sans
   dépendre d'un humain devant l'écran.
4. Relire son propre diff (`git diff`) avant de committer — repérer les fichiers
   ajoutés par erreur (assets de test, logs, fichiers d'IDE).

## Commit

- Un commit = un sujet cohérent. Pas de "fix + feature + typo" mélangés.
- Le message explique le **pourquoi**, pas le "quoi" (déjà visible dans le diff).
- Pas de `--no-verify` pour contourner un hook qui échoue — corriger la cause.

## Description de la PR

- Ce qui change et pourquoi (le contexte que le diff seul ne donne pas).
- Comment c'est vérifié (capture d'écran pour tout changement visuel, ou description
  du test manuel/scripté effectué).
- Toute limitation connue ou question ouverte pour les relecteurs.

## Avant de demander une review

- Vérifier qu'aucun asset non-libre n'a été ajouté (voir la section Assets du
  [README](../../../README.md)) — le dépôt n'accepte que des textures/sons 100%
  libres de droits.
- Si la contribution touche un système central (grille triangulaire, géométrie
  partagée, origine flottante), relire la skill `code-conventions` pour confirmer
  qu'aucun invariant n'est cassé.
