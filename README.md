# PrismCraft

Un jeu de survie/construction en voxels façon Minecraft, où les cubes sont remplacés
par des **prismes triangulaires** avec une grille de triangles équilatéraux (▲▽) plutôt
qu'un quadrillage carré. Écrit en JavaScript avec Three.js.

Développé par [LAirHisson](https://www.youtube.com/@LAirHisson).

## Fonctionnalités

- Génération de monde procédurale infinie (bruit de Perlin), avec biomes, arbres et végétation.
- Survie (vie, minage, craft) et créatif.
- Sauvegarde automatique (IndexedDB) + export/import de sauvegarde en fichier.
- Traduction FR/EN. (bientôt espagnol je pense)
- Des farlands à 12 550 820 blocs de l'origine parce que pourquoi pas

## Fonctionnalités expérimentales pour le dev
- Testeur de worldgen en preview
- Éditeur basé sur des triangles très basique

## Installation

```bash
npm install
npm run dev
```

Ouvre `http://localhost:5173`. `npm run build` produit un export statique dans
`dist/` (déployable tel quel sur n'importe quel hébergeur statique).

## Contrôles

| Touche | Action |
|---|---|
| ZQSD / WASD | Déplacement |
| Souris | Regarder |
| Espace | Sauter (double-tap : vol, en créatif) |
| Maj | Descendre (en vol) |
| Ctrl | Courir |
| Clic gauche | Miner / casser |
| Clic droit | Poser un bloc / interagir (table de craft...) |
| 1-9 | Sélection hotbar |
| E | Inventaire |
| Tab | Menu pause |
| F1 | Masquer le HUD |
| F5 | Changer de vue (1ʳᵉ / 3ᵉ personne) |
| P | Freecam |

## Assets

Ce dépôt ne contient **que des textures et sons 100% libres de droits** — aucun
asset extrait de Minecraft ou d'un autre jeu. Le jeu est actuellement
sans son : voir [CONTRIBUTING.md](./CONTRIBUTING.md) si tu veux proposer des sons
libres.

## Contribuer

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour lancer le projet en dev, le style de
code attendu et la procédure de pull request, et
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) pour une vue d'ensemble du moteur
(grille triangulaire, pipeline de génération, sauvegarde...). Pour ajouter un bloc,
voir directement [docs/adding-a-block.md](./docs/adding-a-block.md).

Des skills Claude Code sont fournies dans `.claude/skills/` pour contribuer avec
Claude Code (ajout de bloc, conventions du projet, préparation de PR).

## Licence

[MIT](./LICENSE).
