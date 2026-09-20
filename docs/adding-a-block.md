# Ajouter un bloc

Voir [ARCHITECTURE.md](./ARCHITECTURE.md) pour la vue d'ensemble du pipeline
bloc → matériau. Ce guide couvre la procédure pratique.

## 1. Une texture

Ajoutez un PNG dans `public/assets/textures/blocks/` (64×64 px, style pixel art,
cohérent avec les textures existantes). Une seule texture suffit pour un bloc simple
(elle sert alors aux côtés ET aux calottes haut/bas) ; voir la section "Textures
différentes par face" pour un bloc type Grass/Log.

## 2. Une entrée dans `public/data/blocks.json`

Exemple minimal (bloc plein, texture unique, pas de forme spéciale) :

```json
{
  "id": 19,
  "name": "Sandstone",
  "textureSide": "sandstone.png",
  "resistance": 1.0,
  "soundType": "stone",
  "mineTime": 2,
  "opaque": true,
  "flammable": false
}
```

`id` doit être unique et **ne doit jamais changer** une fois publié — les
sauvegardes des joueurs et le journal d'édition (`world/EditLog.js`) référencent les
blocs par nom (résolu via `getIdByName`), donc renommer un bloc est sûr, mais changer
son `id` sans migration ne l'est pas.

### Propriétés courantes

| Champ | Type | Défaut | Effet |
|---|---|---|---|
| `resistance` | number | `1.0` | Facteur de dureté (voir `mineTime`) |
| `mineTime` | number (s) | `1.0` | Temps de minage à la main |
| `tool` | string\|null | `null` | Outil qui casse ce bloc plus vite (ex. `"pickaxe"`) ; l'item outil porte le même tag, plus `toolSpeed` (diviseur du `mineTime`) |
| `soundType` | string | `"stone"` | Jeu de sons (`stone`/`grass`/`wood`/`sand`/`dirt`...) |
| `opaque` | boolean | `true` | Culling des faces voisines + ombres portées |
| `solid` | boolean | `true` | Collision joueur (`false` pour l'eau) |
| `gravity` | boolean | `false` | Tombe si le support est retiré (sable, gravier) |
| `flammable` | boolean | `false` | — |
| `drop` | number\|null | l'id lui-même | Bloc lâché au cassage ; `null` = rien |
| `maxStack` | number | `64` | Taille de pile en inventaire |
| `shape` | `"prism"`\|`"plant"`\|`"slab"` | `"prism"` | Forme géométrique (voir plus bas) |
| `craftingGrid` | number | `0` | Taille de grille ouverte au clic droit (ex. `3` pour une table de craft) |
| `liquid` | boolean | `false` | Utilisé pour la noyade |

Toutes les propriétés JSON sont accessibles via `blockRegistry.getBlock(id)` même
sans getter dédié. Pour en exposer une proprement, ajoutez un accesseur dans
[`world/BlockRegistry.js`](../world/BlockRegistry.js) (suivre le style des méthodes
existantes, ex. `getResistance`).

### Textures différentes par face

Pour un bloc dont le dessus/dessous diffère des côtés (herbe, tronc...) :

```json
{
  "id": 5,
  "name": "Log",
  "textureSide": "log_side.png",
  "top":    { "texture": "log_top.png", "mapping": "remap" },
  "bottom": { "texture": "log_top.png", "mapping": "remap" }
}
```

`mapping` contrôle comment la texture est projetée sur la calotte triangulaire :

- `"square"` (défaut) — projection simple du dessus, comme une face plate.
- `"triangle"` — système radial en 3 sous-triangles, continu entre prismes voisins.
- `"remap"` — variante shader (GPU) du mode radial, optimisée pour de grandes
  surfaces visibles (herbe, feuillage) ; voir `rendering/RemapShaderChunk.js`.

### Formes spéciales

- `"shape": "plant"` — 3 lames en croix au lieu d'un prisme plein, pas de collision
  ni de culling entre blocs (fleurs, herbe haute).
- `"shape": "slab"` — demi-bloc (haut ou bas selon où le joueur pose), avec `"full"`
  pointant vers l'id du bloc plein correspondant (pour la fusion "deux demi-slabs
  identiques → bloc plein").

## 3. Une recette de craft (optionnel)

Ajoutez une entrée dans `public/data/recipes.json` — les ingrédients référencent les
blocs **par nom**, pas par id :

```json
{
  "type": "shaped",
  "pattern": [["Sandstone", "Sandstone"]],
  "result": { "block": "Sandstone Slab", "count": 4 }
}
```

`type: "shapeless"` ignore la disposition (juste la liste d'ingrédients) ;
`type: "shaped"` respecte la grille exacte du `pattern`. Un `pattern` est recadré sur
sa boîte englobante : les `null` autour du motif ne servent qu'à la lisibilité, seule
la forme relative compte. La première recette qui correspond gagne.

## 4. C'est tout

Aucun autre fichier à toucher — `BlockSystem.js` charge `blocks.json` et construit les
matériaux Three.js automatiquement au démarrage, pour tous les blocs qu'il contient.

## Ajouter un item

Un item (bâton, outil, ressource) n'est pas un bloc à part : c'est une entrée de
`public/data/items.json`, chargée dans le **même** registre que `blocks.json`, avec
`"shape": "item"`. Tout le reste du jeu (inventaire, hotbar, craft, sauvegarde) le
manipule donc comme un bloc, sauf `player/BlockInteraction.js` qui refuse de le poser.

Sa texture va dans `public/assets/textures/items/` au format triangulaire des items :
PNG **32×16**, soit 512 triangles équilatéraux (16 lignes de 32), dessiné avec
`experiments/triangle-editor.html` en mode « Item ». Les pixels transparents ne sont
pas rendus : ils découpent la silhouette, et le reste est extrudé en 3D.

```json
{
  "id": 1210,
  "name": "Stone Pickaxe",
  "shape": "item",
  "texture": "stone_pickaxe.png",
  "maxStack": 1,
  "tool": "pickaxe",
  "toolSpeed": 4
}
```

### Plages d'id

Les ids d'items commencent à 1000 pour ne jamais entrer en collision avec ceux des
blocs, et sont regroupés par famille — l'ordre du fichier est aussi l'ordre de la
palette créative, donc gardez id croissant et ordre du fichier alignés, en laissant
des trous pour les ajouts futurs :

| Plage | Famille |
|---|---|
| 1000–1099 | Matériaux et ressources (bâton, silex, lingot, diamant, flèche...) |
| 1100–1199 | Nourriture |
| 1200–1299 | Outils et armes, par dix et par palier (120x bois, 121x pierre, 122x fer...) ; dans un palier, toujours pioche x0, pelle x1, hache x2, épée x3, houe x4 |

### Outils

`tool` est le même tag des deux côtés : sur un bloc, l'outil qui le casse plus vite ;
sur un item, le type d'outil qu'il est. Un outil ne va vite que sur les blocs qui
portent son tag — `toolSpeed` divise leur `mineTime`, et vaut 1 partout ailleurs
(voir `effectiveMineTime` dans [`player/MiningController.js`](../player/MiningController.js)).

Tags en place : `pickaxe` (pierre, cobblestone, bedrock), `shovel` (terre, herbe,
sable, gravier), `axe` (bois, planches, table de craft), `sword` (aucun bloc — le
combat n'existe pas encore), `hoe` (aucun bloc — l'agriculture n'existe pas encore).
Paliers de `toolSpeed` : bois 2, pierre 4.

Un outil se met à `"maxStack": 1`. Il n'a pas de durabilité : rien ne s'use, rien ne
casse pour l'instant.

## Vérifier

`npm run dev`, ouvrir l'inventaire (E), passer en créatif si besoin (menu Tab →
Mode), et poser le nouveau bloc pour vérifier texture/mapping/collision visuellement.
