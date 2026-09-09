# Contribuer à PrismCraft

Yo merci de vouloir contribuer à PrismCraft ! (ou juste bricoler des trucs c'est cool aussi)

## Lancer le projet

```bash
npm install
npm run dev       # serveur de dev (http://localhost:5173 par défaut)
npm run build     # build de prod dans dist/
npm run lint      # vérifie les bonnes pratiques de code
```


## Avant d'ouvrir une pull request

1. `npm run lint` et `npm run build` doivent passer sans erreur.
2. Testez manuellement le changement en jeu, éventuellement prendre des screens à ajouter dans la PR
3. Expliquer comment et pourquoi vous avez fait cet ajout (idée perso / cahier des charges commun...)
4. Dans la description de PR : ce qui change, pourquoi, et comment vous l'avez vérifié (capture d'écran svp).

Voir la skill Claude `prepare-pr` (`.claude/skills/prepare-pr/`) pour une checklist
détaillée si vous utilisez Claude Code.

## Style de code

- **Pas de commentaire qui répète ce que le code dit déjà** — un commentaire
  n'a de valeur que s'il explique quelque chose qu'on ne comprendrait pas toute de suite.
- Les commentaires du projet sont en français
- Réutilisez l'existant avant d'écrire une nouvelle fonction utilitaire, il y a
  déjà des helpers pour la grille triangulaire (`TriGrid`), la géométrie des prismes
  (`PrismGeometryHelpers`) et les blocs (`BlockRegistry`).

Voir le skill Claude `code-conventions` (`.claude/skills/code-conventions/`) pour les
patterns spécifiques au moteur (grille triangulaire, cache de géométrie partagée,
origine flottante...) et [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) pour la vue
d'ensemble.

## Assets

Le dépôt ne contient et n'acceptera que des assets **100% libres de droits**
(textures/sons créés pour le projet ou explicitement libres/CC0) — aucun asset extrait
d'un jeu commercial avec des cubes par exemple 👀. Il manque actuellement du son (voir le
[README](./README.md)) : des contributions de sons libres sont les bienvenues.

## Ajouter un bloc

Voir [docs/adding-a-block.md](./docs/adding-a-block.md) pour la procédure complète
(texture, entrée `blocks.json`, recette de craft optionnelle).

## Questions

Le plus simple : passer sur le Discord du projet.
https://discord.gg/nbVDzevmjj