---
name: code-conventions
description: Patterns et conventions spécifiques au moteur PrismCraft à respecter en contribuant (grille triangulaire, géométrie partagée, origine flottante, style de commentaires). Utiliser avant d'écrire ou modifier du code dans ce projet.
---

# Conventions du projet

Vue d'ensemble complète : [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
Ce qui suit sont les invariants à ne jamais violer, avec le "pourquoi".

## Grille triangulaire

- Une case = `(col, row, height)`, deux entiers de grille — jamais des coordonnées
  monde en float sauf conversion explicite via `TriGrid.gridToWorld`/`worldToGrid`.
- **L'orientation (▲/▽) est TOUJOURS dérivée de la parité** `(col + row) % 2` dans
  `TriGrid.getOrientation()` — ne jamais la stocker sur un bloc ni la recalculer
  ailleurs. Si un module a besoin de l'orientation, il appelle `TriGrid`, point.

## Géométrie partagée

Les `BufferGeometry` de prismes (`rendering/PrismGeometryHelpers.js`) sont mises en
cache par un `Map` module-level et **réutilisées par tous les blocs du même
type/orientation**. Ne jamais appeler `.dispose()` dessus depuis un appelant — seul
le module qui les possède gère leur cycle de vie. Un mesh de chunk qu'on retire de la
scène ne dispose que sa propre `BufferGeometry` fusionnée (créée par
`ChunkMesher.js`), jamais les géométries partagées sous-jacentes.

## Config de génération vs. données de bloc

Le bruit, les hauteurs, les biomes et les features (arbres, fleurs) vivent dans
`world/WorldGen.js`/`world/features.js` — **pas** dans `blocks.json`. Le générateur
résout toujours un bloc par nom : `blockRegistry.getIdByName("Stone")`, jamais par id
numérique en dur (les ids peuvent changer d'ordre dans `blocks.json`).

## Origine flottante (précision loin de l'origine)

Toute donnée en vraie coordonnée monde (position de chunk, du joueur, du soleil) est
portée par un objet enfant de `worldRoot` ([`rendering/RenderOrigin.js`](../../../rendering/RenderOrigin.js))
et garde sa position inchangée — ne jamais essayer de "corriger" une position en la
soustrayant manuellement. La seule conversion nécessaire est côté raycaster : son
origine doit être en repère de scène via `renderOrigin.toScene(...)`, et un point de
résultat qu'on recombine avec de la logique en vraies coordonnées doit repasser par
`renderOrigin.toTrue(...)`. Voir les call sites existants dans
`player/BlockInteraction.js`/`player/MiningController.js`/`main.js` avant d'en ajouter
un nouveau.

## Style de commentaires et de code

- Commentaires en français, qui expliquent le **pourquoi** (contrainte cachée,
  workaround, invariant non-évident) — jamais ce que le code dit déjà. Si retirer le
  commentaire ne perd aucune information pour un lecteur, il ne sert à rien.
- Pas d'abstraction ajoutée "au cas où" — un bug fix n'a pas besoin de refactor
  autour, une fonction utilisée une fois n'a pas besoin d'être généralisée.
- Toute chaîne affichée au joueur passe par `i18n.t("clé")` (`core/I18n.js`), jamais
  codée en dur dans un composant UI.
- Un système avec un cycle de vie par frame expose `update(dt)` (voir `mining`,
  `damage`, `footsteps`, `sunShadowTracker` dans `main.js`) plutôt que d'être piloté
  ad hoc depuis la boucle de rendu.

## `main.js` reste un orchestrateur

`main.js` construit les systèmes (un facteur/classe par fichier, voir
`core/GameSystems.js`, `player/ViewRig.js`...) puis relie les événements — il ne
porte pas de logique métier lui-même. Une nouvelle fonctionnalité substantielle
mérite son propre module plutôt que de grossir `main.js` directement.
