# PrismCraft — repères pour Claude

Jeu de voxels en Three.js où les cubes sont des prismes triangulaires. Vue
d'ensemble complète : [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Commandes essentielles

```bash
npm run dev       # serveur de dev (http://localhost:5173)
npm run build     # build de prod (dist/)
npm run lint      # style de code
```

Pas de suite de tests automatisés — vérifier en jouant, ou via un script Playwright
ponctuel pour un changement de rendu/physique/génération.

## Skills à consulter selon la tâche

- **Ajouter un bloc/objet** → skill `add-block`.
- **Avant d'écrire du code** dans ce projet → skill `code-conventions` (grille
  triangulaire, géométrie partagée, origine flottante — des invariants faciles à
  casser sans le savoir).
- **Avant d'ouvrir une pull request** → skill `prepare-pr`.

## Règles non négociables

- Aucun asset (texture, son, modèle) qui ne soit pas 100% libre de droits — le
  projet a explicitement purgé tout ce qui venait de Minecraft.
- L'orientation d'une case (▲/▽) se dérive toujours de `TriGrid.getOrientation()`,
  jamais recalculée ou stockée ailleurs.
- Ne jamais `.dispose()` une géométrie de `PrismGeometryHelpers` — elle est partagée
  entre tous les blocs du même type.
