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
`type: "shaped"` respecte la grille exacte du `pattern`.

## 4. C'est tout

Aucun autre fichier à toucher — `BlockSystem.js` charge `blocks.json` et construit les
matériaux Three.js automatiquement au démarrage, pour tous les blocs qu'il contient.

## Vérifier

`npm run dev`, ouvrir l'inventaire (E), passer en créatif si besoin (menu Tab →
Mode), et poser le nouveau bloc pour vérifier texture/mapping/collision visuellement.
