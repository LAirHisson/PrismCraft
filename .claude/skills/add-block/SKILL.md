---
name: add-block
description: Ajouter un nouveau bloc/objet au jeu (texture, entrée blocks.json, mapping UV, recette de craft optionnelle). Utiliser quand on demande d'ajouter, créer ou définir un bloc/item.
---

# Ajouter un bloc

Procédure complète et à jour : [docs/adding-a-block.md](../../../docs/adding-a-block.md).
Lis ce fichier avant de commencer — il couvre le format exact de
`public/data/blocks.json`, les modes de mapping de texture (`square`/`triangle`/
`remap`), les formes spéciales (`plant`/`slab`), et le format de
`public/data/recipes.json`.

## Checklist

1. **Texture** — PNG 64×64 dans `public/assets/textures/blocks/`, style pixel art
   cohérent avec l'existant. Une seule texture suffit pour un bloc simple ; sinon
   `top`/`bottom` distincts (voir le guide pour le mapping).
2. **Entrée dans `blocks.json`** — `id` unique et stable (jamais réutilisé/changé une
   fois publié — les sauvegardes et le journal d'édition référencent les blocs par
   nom, résolu via `getIdByName`, mais l'id lui-même doit rester cohérent en interne).
   Renseigner au minimum `name`, `textureSide`, `resistance`, `soundType`, `mineTime`,
   `opaque`.
3. **Recette de craft (optionnel)** — entrée dans `recipes.json`, ingrédients
   référencés **par nom**, pas par id.
4. **Rien d'autre à câbler** — `BlockSystem.js` charge `blocks.json` et construit les
   matériaux automatiquement au démarrage. Ne pas toucher à `BlockRegistry.js` sauf
   pour ajouter un getter dédié à une propriété nouvelle (voir le guide).

## Vérifier

`npm run dev`, ouvrir l'inventaire (E), passer en créatif si besoin (menu Tab →
Mode), poser le bloc et vérifier visuellement texture/mapping/collision. Puis
`npm run lint` et `npm run build` avant de proposer la PR (voir la skill
`prepare-pr`).

## Pièges courants

- Oublier qu'un bloc opaque sans texture `top`/`bottom` distincte réutilise
  automatiquement `textureSide` pour les calottes (comportement voulu, pas un bug).
- Confondre `mapping: "triangle"` (radial, continu entre prismes — pour une vraie
  texture de bloc) et `"square"` (projection simple — convient à une icône/logo
  unique comme une table de craft).
- Référencer un bloc par id numérique dans du code de génération (`WorldGen.js`,
  `features.js`) au lieu de `blockRegistry.getIdByName(...)` — voir la skill
  `code-conventions`.
