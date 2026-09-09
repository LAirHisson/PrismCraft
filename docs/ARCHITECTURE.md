# Architecture

Vue d'ensemble du moteur pour s'y retrouver avant de contribuer. Pour la procédure
d'ajout d'un bloc, voir [adding-a-block.md](./adding-a-block.md).

## Le concept : une grille triangulaire, pas des cubes

PrismCraft remplace les cubes de Minecraft par des **prismes triangulaires**. Le sol
est pavé de triangles équilatéraux alternant pointe-en-haut (▲) et pointe-en-bas (▽),
et chaque case a une hauteur (empilement de "couches", comme les cubes empilés dans
Minecraft).

Tout part de [`world/TriGrid.js`](../world/TriGrid.js), la **source unique de vérité**
pour la géométrie de la grille :

- Une case est identifiée par `(col, row, height)` — deux entiers de grille (jamais
  des coordonnées monde en float, sauf conversion explicite).
- **L'orientation d'une case est toujours dérivée de sa parité**, jamais stockée ni
  recalculée ailleurs : `(col + row) % 2 === 0 → ▲ (UP)`, sinon `▽ (DOWN)`.
- `TriGrid.gridToWorld(col, row, height)` / `TriGrid.worldToGrid(pos)` convertissent
  entre grille et coordonnées monde (unités Three.js).
- `TriGrid.getNeighbors(col, row)` retourne les 3 voisins qui partagent une arête —
  utilisé pour le culling de faces et le placement de features (arbres, fleurs...).

Toute la géométrie des prismes (faces latérales, calottes haut/bas, variantes slab)
est mise en cache et partagée dans
[`rendering/PrismGeometryHelpers.js`](../rendering/PrismGeometryHelpers.js) — ces
`BufferGeometry` sont réutilisées par tous les blocs du même type/orientation et **ne
doivent jamais être `.dispose()`-ées** par un appelant.

## Pipeline monde : génération → chunks → mesh

```
world/WorldGen.js          bruit de Perlin/simplex déterministe (seed) → terrain,
                            biomes, features (arbres, fleurs...)
        ↓
world/ChunkManager.js       charge/décharge les chunks autour du joueur, budget de
                            génération/meshing par frame pour éviter les à-coups
        ↓
world/WorldManager.js       stocke les blocs par chunk, applique le delta d'édition
                            (EditLog) par-dessus la génération procédurale
        ↓
rendering/ChunkMesher.js    fusionne les faces visibles d'un chunk en quelques
                            meshes (un par matériau), avec culling de faces internes
        ↓
Three.js Scene              rendu, ombres, raycasting (player/Raycaster.js)
```

Points importants :

- **`WorldManager` ne distingue pas "généré" et "édité" dans sa `Map` de blocs** — la
  distinction vit dans [`world/EditLog.js`](../world/EditLog.js), un delta séparé
  indexé par chunk. C'est ce qui permet à un chunk déchargé puis rechargé de
  retrouver les modifications du joueur (le delta est rejoué par-dessus la
  génération), et c'est aussi directement la structure sérialisée dans les
  sauvegardes.
- **Origine flottante** ([`rendering/RenderOrigin.js`](../rendering/RenderOrigin.js)) :
  au-delà de quelques millions d'unités monde (voir l'easter egg "Farlands" dans
  `world/WorldGen.js`), un `Float32Array` de positions perd en précision. Un groupe
  `worldRoot` est recentré près du joueur ; tout ce qui suit une vraie coordonnée
  monde (chunks, joueur, soleil) reste enfant de ce groupe et garde sa position
  inchangée — seul `worldRoot.position` bouge, ce qui absorbe le décalage sans rien
  faire sauter visuellement. Le raycaster doit convertir via
  `renderOrigin.toScene()`/`toTrue()` puisqu'il teste des meshes déjà recentrés.

## Les blocs : `BlockRegistry` + `blocks.json`

[`world/BlockRegistry.js`](../world/BlockRegistry.js) est l'unique point d'accès aux
propriétés d'un bloc (résistance, son, forme, mapping de texture...), chargées depuis
[`public/data/blocks.json`](../public/data/blocks.json). Voir
[adding-a-block.md](./adding-a-block.md) pour la procédure complète.

Le catalogue de génération de terrain (bruit, hauteurs, biomes, features) est
volontairement **séparé** de `blocks.json` — il vit dans
[`world/WorldGen.js`](../world/WorldGen.js) et
[`world/features.js`](../world/features.js), pas dans les données de bloc. Les IDs de
bloc utilisés par le générateur sont résolus par nom via
`blockRegistry.getIdByName("Stone")`, jamais par ID numérique en dur — les IDs
peuvent changer d'ordre dans `blocks.json` sans casser la génération.

## Boucle de jeu (`main.js`)

`main.js` est volontairement un simple **orchestrateur** : il construit les systèmes
puis relie les événements, sans porter lui-même de logique métier. Chaque système a
un fichier dédié :

| Système | Fichier | Rôle |
|---|---|---|
| Bootstrap monde/joueur/vie | [`core/GameSystems.js`](../core/GameSystems.js) | construit world/inventaire/mode de jeu/raycaster/mining/vie/dégâts |
| Menu + sauvegarde | [`core/MenuAndSave.js`](../core/MenuAndSave.js) | callbacks du menu pause, autosave, import/export |
| Ombre/soleil | [`rendering/SunShadowTracker.js`](../rendering/SunShadowTracker.js) | shadow camera qui suit le joueur, anti-scintillement par snap de texel |
| Viewmodel | [`player/ViewRig.js`](../player/ViewRig.js) | modèle GLTF, bras 1ʳᵉ personne, bloc tenu en main, cycle de vue F5, freecam |
| Pas | [`player/Footsteps.js`](../player/Footsteps.js) | son de pas à intervalle régulier |

La boucle de rendu (`renderer.setAnimationLoop`) appelle `.update(dt)` sur chacun de
ces systèmes dans un ordre précis (voir les commentaires dans `main.js`) — en
particulier, l'origine flottante doit se recentrer **avant** tout raycast de la
frame, et le highlight/mining doivent utiliser l'œil du joueur
(`playerController.getEyePosition()`), jamais `camera.position` directement (qui peut
être ailleurs en freecam ou vue 3ᵉ personne).

## Sauvegarde

[`core/SaveManager.js`](../core/SaveManager.js) sérialise un snapshot (seed + delta
du monde, position/orientation joueur, inventaire, vie, réglages) vers IndexedDB
(autosave toutes les 30s + tentative au `beforeunload`) et supporte l'export/import
en fichier `.json`. Le mode de jeu (survie/créatif) est persisté séparément via
`localStorage` par [`core/GameMode.js`](../core/GameMode.js).

## Traduction

[`core/I18n.js`](../core/I18n.js) gère le FR/EN — langue détectée au démarrage,
changeable depuis le menu Paramètres. Toute chaîne affichée au joueur doit passer par
`i18n.t("clé")`, jamais être codée en dur dans un composant UI.
