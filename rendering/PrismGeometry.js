/**
 * Géométrie des prismes triangulaires pour le jeu.
 * Const une `BufferGeometry` manuelle pour chaque orientation (UP / DOWN).
 */

import * as THREE from 'three';
import { Orientation, TRIANGLE_SIDE, TRIANGLE_HEIGHT, BLOCK_HEIGHT } from '../world/TriGrid.js';

/**
 * Aides statiques pour la grille triangulaire.
 * Géométrie des prismes triangulaires pour le jeu.
 * Const une `BufferGeometry` manuelle pour chaque orientation (UP / DOWN).
 */

// ---------------------------------------------------------------------------
// Constantes géométriques internes (orientation UP, centroïde à l'origine en XZ)
// ---------------------------------------------------------------------------
// S = 1,  H = sqrt(3)/2
// A = bas-gauche  (-S/2,  -H/3)
// B = bas-droit   (+S/2,  -H/3)
// C = som apical  (  0,  +2H/3)
//
// DOWN = UP pivoté 180° autour de Y  →  négier x et z de chaque sommet.
// ---------------------------------------------------------------------------

const S = TRIANGLE_SIDE;
const H = TRIANGLE_HEIGHT;

/** Sommets XZ précalculés pour UP (▲) centré à l'origine. */
const UP_XZ = {
  A: { x: -S / 2, z: -H / 3 },
  B: { x:  S / 2, z: -H / 3 },
  C: { x:  0,     z:  2 * H / 3 },
};

/** Sommets XZ précalculés pour DOWN (▽) centré à l'origine (= UP pivoté 180° Y). */
const DOWN_XZ = {
  A: { x:  S / 2, z:  H / 3 },
  B: { x: -S / 2, z:  H / 3 },
  C: { x:  0,     z: -2 * H / 3 },
};

// ---------------------------------------------------------------------------
// Constructeur de géométrie
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constructeur de géométrie
// ---------------------------------------------------------------------------

/**
 * Construit une BufferGeometry non-indexée pour un prisme triangulaire de l'orientation donnée.
 * Ombrage plat: chaque face a une seule normale sortante partagée sur ses sommets.
 *
 * Modes de calotte (capMode) :
 *   'radial' (défaut) : calotte divisée en 3 sous-triangles depuis le centroïde (12 triangles total)
 *                       UV pioché dans 3 régions de la texture 16×16
 *   'flat'            : calotte = 1 triangle plat, UV couvre toute la texture (8 triangles total)
 *
 * Ordre des triangles selon capMode :
 *   Commun (0-5)   → faces 0-2 : 2 triangles par face latérale
 *   radial (6-8)   → face 3 : 3 sous-triangles calotte haut
 *   radial (9-11)  → face 4 : 3 sous-triangles calotte bas
 *   flat   (6)     → face 3 : 1 triangle calotte haut
 *   flat   (7)     → face 4 : 1 triangle calotte bas
 *
 * Utiliser TriGrid.triangleIndexToFaceIndex(idx, capMode) pour mapper
 * les résultats du raycast vers la face 0-4.
 *
 * Disposition UV:
 *   Faces latérales : u le long de la largeur d'arête [0,1], v le long de la hauteur [0,1]
 *   capMode='radial': 3 sous-triangles radiaux (Haut=rect 0-16×0-8, Gauche=0-6×0-16, Droit=10-16×0-16)
 *   capMode='flat'  : UV carré complet → A(0,0) B(1,0) C(0.5,1)
 *
 * @param {Orientation.UP | Orientation.DOWN} orientation
 * @param {'radial'|'flat'} [capMode='radial']
 * @returns {THREE.BufferGeometry}
 */
export function createPrismGeometry(orientation, capMode = 'radial') {
  const xz = orientation === Orientation.UP ? UP_XZ : DOWN_XZ;
  const { A, B, C } = xz;

  // Sommets 3D: bas (y=0) et haut (y=BLOCK_HEIGHT)
  const A0 = [A.x, 0,            A.z];
  const B0 = [B.x, 0,            B.z];
  const C0 = [C.x, 0,            C.z];
  const A1 = [A.x, BLOCK_HEIGHT, A.z];
  const B1 = [B.x, BLOCK_HEIGHT, B.z];
  const C1 = [C.x, BLOCK_HEIGHT, C.z];

  // Normales de faces (voir dérivation dans les commentaires de TriGrid.js)
  const nAB = sideNormal(A, B, C);
  const nBC = sideNormal(B, C, A);
  const nCA = sideNormal(C, A, B);
  const nTop    = [0,  1, 0];
  const nBottom = [0, -1, 0];

  // Tableaux plats: positions, normales, uvs (chaque groupe de 9/9/6 flottants = un triangle)
  const pos = [];
  const nor = [];
  const uvs = [];

  /**
   * Pousse un triangle (3 sommets) avec une normale plate partagée.
   * uvN = [u, v] par sommet.
   */
  function tri(v0, v1, v2, n, uv0, uv1, uv2) {
    pos.push(...v0, ...v1, ...v2);
    nor.push(...n, ...n, ...n);
    uvs.push(...uv0, ...uv1, ...uv2);
  }

  // -- Face 0: arête AB ------
  // Rectangle A0-A1-B0-B1, vu de l'extérieur: ordre CCW donne nAB
  // Ordre de vertex vérifié: cross(A1-A0, B0-A0) = direction nAB ✓
  tri(A0, A1, B0,  nAB, [0,0], [0,1], [1,0]);
  tri(B0, A1, B1,  nAB, [1,0], [0,1], [1,1]);

  // -- Face 1: arête BC ------
  tri(B0, B1, C0,  nBC, [0,0], [0,1], [1,0]);
  tri(C0, B1, C1,  nBC, [1,0], [0,1], [1,1]);

  // -- Face 2: arête CA ------
  tri(C0, C1, A0,  nCA, [0,0], [0,1], [1,0]);
  tri(A0, C1, A1,  nCA, [1,0], [0,1], [1,1]);

  // Centroïde des calottes (point central partagé des 3 sous-triangles)
  const Gx = (A.x + B.x + C.x) / 3;
  const Gz = (A.z + B.z + C.z) / 3;
  const G1 = [Gx, BLOCK_HEIGHT, Gz];
  const G0 = [Gx, 0,            Gz];

  if (capMode === 'radial') {
    // -- Face 3: calotte haut (Y+) — 3 sous-triangles radiaux depuis le centroïde ------
    // Régions UV dans la texture 16×16 (pixel → UV: px/16, py/16):
    //   Arête AB → rect pixel (0, 0, 16, 8)  → UV Haut   : A→(0,0)     B→(1,0)     G→(0.5,  0.5)
    //   Arête CA → rect pixel (0, 0,  6,16)  → UV Gauche : C→(0,0)     A→(0,1)     G→(0.375,0.5)
    //   Arête BC → rect pixel (10,0, 16,16)  → UV Droit  : B→(1,0)     C→(1,1)     G→(0.625,0.5)
    tri(B1, A1, G1, nTop,    [1,     0  ], [0,     0  ], [0.5,   0.5]);  // arête AB → Haut
    tri(A1, C1, G1, nTop,    [0,     1  ], [0,     0  ], [0.375, 0.5]);  // arête CA → Gauche
    tri(C1, B1, G1, nTop,    [1,     1  ], [1,     0  ], [0.625, 0.5]);  // arête BC → Droit

    // -- Face 4: calotte bas (Y-) — 3 sous-triangles radiaux depuis le centroïde ------
    tri(A0, B0, G0, nBottom, [0,     0  ], [1,     0  ], [0.5,   0.5]);  // arête AB
    tri(C0, A0, G0, nBottom, [0,     0  ], [0,     1  ], [0.375, 0.5]);  // arête CA
    tri(B0, C0, G0, nBottom, [1,     0  ], [1,     1  ], [0.625, 0.5]);  // arête BC
  } else {
    // -- Face 3: calotte haut (Y+) — 1 triangle, UV = texture carrée complète ------
    tri(B1, A1, C1, nTop,    [1, 0], [0, 0], [0.5, 1]);

    // -- Face 4: calotte bas (Y-) — 1 triangle, UV = texture carrée complète ------
    tri(A0, B0, C0, nBottom, [0, 0], [1, 0], [0.5, 1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

/**
 * Calcule la normale unitaire sortante (en XZ, Y=0) pour la face latérale
 * qui va du sommet d'arête p0 à p1, où l'intérieur est le sommet opposé.
 * Retourne un tableau [x, y, z].
 */
function sideNormal(p0, p1, interior) {
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;

  // Deux perpenculaires candidats en XZ
  const nx1 =  dz;  const nz1 = -dx;
  const nx2 = -dz;  const nz2 =  dx;

  // Point milieu de l'arête
  const mx = (p0.x + p1.x) / 2;
  const mz = (p0.z + p1.z) / 2;

  // Direction vers l'intérieur depuis le milieu
  const ix = interior.x - mx;
  const iz = interior.z - mz;

  // Choisir le candidat qui pointe LOIN de l'intérieur (dot négatif avec ix/iz)
  const dot1 = nx1 * ix + nz1 * iz;
  const [nx, nz] = dot1 < 0 ? [nx1, nz1] : [nx2, nz2];

  const len = Math.sqrt(nx * nx + nz * nz);
  return [nx / len, 0, nz / len];
}

// capUVs() supprimé — remplacé par UV radiaux inline dans createPrismGeometry().
// Les calottes utilisent 3 sous-triangles par face (voir commentaires dans createPrismGeometry).

// ---------------------------------------------------------------------------
// Cache: une géométrie par orientation (ne jamais recréer par frame)
// ---------------------------------------------------------------------------

const _cache = new Map();

/**
 * Retourne la BufferGeometry en cache (partagée) pour l'orientation et le mode de calotte donnés.
 * Appeler ça plutôt que createPrismGeometry() dans le code de rendu.
 * @param {Orientation.UP | Orientation.DOWN} orientation
 * @param {'radial'|'flat'} [capMode='radial']
 * @returns {THREE.BufferGeometry}
 */
export function getPrismGeometry(orientation, capMode = 'radial') {
  const key = `${orientation}_${capMode}`;
  if (!_cache.has(key)) {
    _cache.set(key, createPrismGeometry(orientation, capMode));
  }
  return _cache.get(key);
}
