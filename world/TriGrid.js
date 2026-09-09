import * as THREE from 'three';

/**
 * Énumération des orientations pour les prismes triangulaires.
 * NE JAMAIS stocker cette valeur sur un bloc — toujours la dériver via TriGrid.getOrientation(col, row).
 */
export const Orientation = Object.freeze({
  UP: 'UP',
  DOWN: 'DOWN',
});

/** Longueur du côté de chaque triangle équilatéral (en unités du monde). */
export const TRIANGLE_SIDE = 1;

/** Hauteur de chaque triangle équilatéral = côté * sqrt(3) / 2. */
export const TRIANGLE_HEIGHT = TRIANGLE_SIDE * (Math.sqrt(3) / 2);

/** Hauteur verticale d'une couche de bloc (en unités du monde). */
export const BLOCK_HEIGHT = 1;

// Écrit le centroïde 3D de la case (col,row,height) dans `out` (source unique de
// la formule grille→monde, partagée par gridToWorld et worldToGrid).
function centroidInto(col, row, height, out) {
  const isDown = TriGrid.getOrientation(col, row) === Orientation.DOWN;
  return out.set(
    ((col + 1) * TRIANGLE_SIDE) / 2,
    height * BLOCK_HEIGHT,
    row * TRIANGLE_HEIGHT + (isDown ? (2 * TRIANGLE_HEIGHT) / 3 : TRIANGLE_HEIGHT / 3),
  );
}

// Scratch réutilisé par worldToGrid pour éviter d'allouer dans sa boucle 5×5.
const _scratch = new THREE.Vector3();

/**
 * Aides statiques pour la grille triangulaire.
 *
 * Système de coordonnées: (col, row) où les deux sont des entiers.
 * L'orientation est TOUJOURS dérivée de la parité — aucun module ne doit dupliquer cette règle:
 *   (col + row) % 2 === 0  →  UP  (▲)
 *   (col + row) % 2 !== 0  →  DOWN (▽)
 *
 * Convention des indices de face (utilisée par PrismGeometry et Raycaster):
 *   UP  (▲): face 0 = arête bas (horizontale), face 1 = côté droit, face 2 = côté gauche
 *   DOWN(▽): face 0 = arête haut (horizontale), face 1 = côté gauche, face 2 = côté droit
 *   Les deux: face 3 = calotte haut (Y+),      face 4 = calotte bas (Y-)
 */
export class TriGrid {
  /**
   * Retourne l'orientation du triangle en (col, row).
   * Source unique de vérité — aucun module ne doit réécrire cette logique.
   * @param {number} col
   * @param {number} row
   * @returns {'UP' | 'DOWN'}
   */
  static getOrientation(col, row) {
    return (col + row) % 2 === 0 ? Orientation.UP : Orientation.DOWN;
  }

  /**
   * Convertit les coordonnées grille en position 3D du centroïde du triangle.
   * @param {number} col
   * @param {number} row
   * @param {number} [height=0]  Indice de couche verticale (0 = sol). Y = height * BLOCK_HEIGHT.
   * @returns {THREE.Vector3}
   */
  static gridToWorld(col, row, height = 0) {
    return centroidInto(col, row, height, new THREE.Vector3());
  }

  /**
   * Convertit une position 3D du monde en la cellule grille la plus proche.
   * Utilise une recherche du centroïde le plus proche dans un voisinage 5×5.
   * @param {THREE.Vector3} worldPos
   * @returns {{ col: number, row: number, height: number }}
   */
  static worldToGrid(worldPos) {
    const x = worldPos.x;
    const z = worldPos.z;
    const height = Math.floor(worldPos.y / BLOCK_HEIGHT);

    // Estimation par inversion de gridToWorld, puis recherche du centroïde le
    // plus proche dans un voisinage 5×5 (distance² pour éviter le sqrt).
    const col0 = Math.round((2 * x) / TRIANGLE_SIDE - 1);
    const row0 = Math.round(z / TRIANGLE_HEIGHT);

    let bestCol = col0;
    let bestRow = row0;
    let bestDist = Infinity;
    for (let dc = -2; dc <= 2; dc++) {
      for (let dr = -2; dr <= 2; dr++) {
        const c = col0 + dc;
        const r = row0 + dr;
        centroidInto(c, r, 0, _scratch);
        const dist = (x - _scratch.x) ** 2 + (z - _scratch.z) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = c;
          bestRow = r;
        }
      }
    }

    return { col: bestCol, row: bestRow, height };
  }

  /**
   * Retourne les 3 voisins grille de (col, row) qui partagent une arête.
   * L'ordre suit la convention des indices de face:
   *   [0] = voisin face 0, [1] = face 1, [2] = face 2
   * @param {number} col
   * @param {number} row
   * @returns {Array<{col: number, row: number}>}
   */
  static getNeighbors(col, row) {
    const isUp = TriGrid.getOrientation(col, row) === Orientation.UP;
    if (isUp) {
      return [
        { col, row: row - 1 },   // face 0: arête bas horizontale
        { col: col + 1, row },   // face 1: côté droit
        { col: col - 1, row },   // face 2: côté gauche
      ];
    } else {
      return [
        { col, row: row + 1 },   // face 0: arête haut horizontale
        { col: col - 1, row },   // face 1: côté gauche
        { col: col + 1, row },   // face 2: côté droit
      ];
    }
  }

  /**
   * Retourne la cellule adjacente de l'autre côté de la face donnée.
   * Retourne null pour les faces calotte (face 3 = haut Y+, face 4 = bas Y-).
   * @param {number} col
   * @param {number} row
   * @param {number} faceIndex  0-4
   * @returns {{ col: number, row: number } | null}
   */
  static getAdjacentCell(col, row, faceIndex) {
    if (faceIndex === 3 || faceIndex === 4) return null;
    return TriGrid.getNeighbors(col, row)[faceIndex] ?? null;
  }

  /**
   * Convertit un indice de triangle Three.js (issu d'une intersection de raycast)
   * en indice de face logique (0-4) tel que défini par la convention du plan.
   *
   * capMode='radial' (12 triangles) :
   *   0, 1        → face 0 (côté AB)
   *   2, 3        → face 1 (côté BC)
   *   4, 5        → face 2 (côté CA)
   *   6, 7, 8     → face 3 (calotte haut Y+)
   *   9, 10, 11   → face 4 (calotte bas Y-)
   *
   * capMode='flat' (8 triangles) :
   *   0, 1  → face 0
   *   2, 3  → face 1
   *   4, 5  → face 2
   *   6     → face 3
   *   7     → face 4
   *
   * @param {number} triangleIndex  intersection.faceIndex du THREE.Raycaster
   * @param {'radial'|'flat'} [capMode='radial']
   * @returns {number}  0-4
   */
  static triangleIndexToFaceIndex(triangleIndex, capMode = 'radial') {
    if (triangleIndex < 6) return Math.floor(triangleIndex / 2); // 0-5 → faces 0-2
    if (capMode === 'radial') {
      if (triangleIndex < 9) return 3;  // 6,7,8 → face 3
      return 4;                          // 9,10,11 → face 4
    } else {
      return triangleIndex - 3;          // 6→3, 7→4
    }
  }
}