/**
 * Raycaster adapté à la grille de prismes triangulaires.
 *
 * Intersecte les meshes fusionnés (culled) et résout le triangle touché via
 * les métadonnées par face (col/row/height/faceIndex) fournies par le mesher.
 */

import * as THREE from 'three';
import { TriGrid } from '../world/TriGrid.js';

export class PrismRaycaster {
  constructor() {
    /** @type {THREE.Raycaster} */
    this._raycaster = new THREE.Raycaster();
    // Distance max d'interaction (en unités du monde)
    this.maxDistance = 8;
  }

  /**
   * Lance un rayon depuis une origine/direction données vers les meshes de prismes.
   * L'origine doit être la tête du joueur (PlayerController.getEyePosition), PAS
   * camera.position — la caméra peut être décalée du corps (freecam, vue 3e personne
   * F5), ce qui permettrait sinon de viser/casser des blocs hors de portée réelle.
   * La direction, elle, vient bien de la caméra (viseur = où l'on regarde).
   *
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} direction - Unitaire (ex. camera.getWorldDirection(...)).
   * @param {Array<{mesh: THREE.Mesh, faceMeta: Array<{col,row,height,faceIndex}>}>} meshEntries
   *   Meshes fusionnés + métadonnées par triangle (col/row/height/faceIndex).
   * @returns {{
   *   hit: boolean,
   *   block?: {col: number, row: number, height: number},
   *   faceIndex?: number,
   *   adjacentCell?: {col: number, row: number, height: number} | null,
   *   point?: THREE.Vector3
   * }}
   */
  castRay(origin, direction, meshEntries) {
    this._raycaster.set(origin, direction);
    this._raycaster.far = this.maxDistance;

    // Collecter tous les meshes valides
    const allMeshes = meshEntries.filter(e => e.mesh).map(e => e.mesh);

    if (allMeshes.length === 0) return { hit: false };

    // intersectObjects trie tous les hits par distance croissante
    const allHits = this._raycaster.intersectObjects(allMeshes, false);

    // Filtrer les back-faces : face.normal · ray.direction < 0 = face avant
    const hit = allHits.find(
      h => h.face && h.face.normal.dot(this._raycaster.ray.direction) < 0
    );

    if (!hit) return { hit: false };

    // Métadonnées de la face touchée (hit.faceIndex = indice du triangle)
    const entry = meshEntries.find(e => e.mesh === hit.object);
    if (!entry) return { hit: false };

    const meta = entry.faceMeta[hit.faceIndex];
    if (!meta) return { hit: false };

    const { col, row, height, faceIndex } = meta;

    // Calculer la cellule adjacente selon la face touchée
    let adjacentCell;
    if (faceIndex === 3) {
      // Face haut (Y+) → placer un bloc au-dessus
      adjacentCell = { col, row, height: height + 1 };
    } else if (faceIndex === 4) {
      // Face bas (Y-) → placer un bloc en dessous (hauteur min = 0)
      adjacentCell = { col, row, height: Math.max(0, height - 1) };
    } else {
      // Face latérale (0, 1, 2) → voisin horizontal, même hauteur
      const neighbor = TriGrid.getAdjacentCell(col, row, faceIndex);
      adjacentCell = neighbor ? { col: neighbor.col, row: neighbor.row, height } : null;
    }

    return {
      hit: true,
      block: { col, row, height },
      faceIndex,
      adjacentCell,
      point: hit.point.clone(),
    };
  }
}
