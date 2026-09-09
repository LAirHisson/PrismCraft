/**
 * Fonctions helper pour créer des géométries séparées : côtés, calotte haut, calotte bas.
 * Utilisées par WorldManager pour créer des meshes distincts avec des matériaux différents
 * (texture haut ≠ texture bas) et des modes de mapping indépendants.
 *
 * Mode de mapping d'une calotte :
 *   'square'   : projection top-down — 1 triangle, UV = découpe triangulaire de la texture carrée
 *   'triangle' : système radial — 3 sous-triangles depuis le centroïde (continuité entre prismes voisins)
 *   'remap'    : texture 16×16 "pixels triangulaires" (voir experiments/triangle-editor.js) —
 *                1 seul triangle (comme 'square'), le pavage en 256 cases est calculé par
 *                le fragment shader (RemapShaderChunk.js) à partir de l'attribut remapUv
 */

import * as THREE from 'three';
import { Orientation, TRIANGLE_SIDE, TRIANGLE_HEIGHT, BLOCK_HEIGHT } from '../world/TriGrid.js';
import { REMAP_APEX, REMAP_BASE_L, REMAP_BASE_R } from './TriPixelGrid.js';

const S = TRIANGLE_SIDE;
const H = TRIANGLE_HEIGHT;

const UP_XZ = {
  A: { x: -S / 2, z: -H / 3 },
  B: { x:  S / 2, z: -H / 3 },
  C: { x:  0,     z:  2 * H / 3 },
};

const DOWN_XZ = {
  A: { x:  S / 2, z:  H / 3 },
  B: { x: -S / 2, z:  H / 3 },
  C: { x:  0,     z: -2 * H / 3 },
};

function sideNormal(p0, p1, interior) {
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const nx1 =  dz;  const nz1 = -dx;
  const nx2 = -dz;  const nz2 =  dx;
  const mx = (p0.x + p1.x) / 2;
  const mz = (p0.z + p1.z) / 2;
  const ix = interior.x - mx;
  const iz = interior.z - mz;
  const dot1 = nx1 * ix + nz1 * iz;
  const [nx, nz] = dot1 < 0 ? [nx1, nz1] : [nx2, nz2];
  const len = Math.sqrt(nx * nx + nz * nz);
  return [nx / len, 0, nz / len];
}

/** Crée un BufferGeometry à partir de tableaux plats positions/normales/uvs (+ remapUv optionnel). */
function buildGeometry(pos, nor, uvs, ruv) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  if (ruv) geo.setAttribute('remapUv', new THREE.Float32BufferAttribute(ruv, 2));
  return geo;
}

/** Renvoie les sommets 3D (bas/haut) et le centroïde pour une orientation donnée. */
function corners(orientation) {
  const { A, B, C } = orientation === Orientation.UP ? UP_XZ : DOWN_XZ;
  const Gx = (A.x + B.x + C.x) / 3;
  const Gz = (A.z + B.z + C.z) / 3;
  return {
    A, B, C,
    A0: [A.x, 0, A.z], B0: [B.x, 0, B.z], C0: [C.x, 0, C.z],
    A1: [A.x, BLOCK_HEIGHT, A.z], B1: [B.x, BLOCK_HEIGHT, B.z], C1: [C.x, BLOCK_HEIGHT, C.z],
    G0: [Gx, 0, Gz], G1: [Gx, BLOCK_HEIGHT, Gz],
  };
}

/**
 * Crée une géométrie contenant SEULEMENT les faces latérales (0-2) du prisme.
 * @param {Orientation.UP | Orientation.DOWN} orientation
 * @returns {THREE.BufferGeometry}
 */
export function createPrismGeometrySidesOnly(orientation) {
  const { A, B, C, A0, B0, C0, A1, B1, C1 } = corners(orientation);

  const nAB = sideNormal(A, B, C);
  const nBC = sideNormal(B, C, A);
  const nCA = sideNormal(C, A, B);

  const pos = [], nor = [], uvs = [];
  function tri(v0, v1, v2, n, uv0, uv1, uv2) {
    pos.push(...v0, ...v1, ...v2);
    nor.push(...n, ...n, ...n);
    uvs.push(...uv0, ...uv1, ...uv2);
  }

  // Face 0: arête AB
  tri(A0, A1, B0,  nAB, [0,0], [0,1], [1,0]);
  tri(B0, A1, B1,  nAB, [1,0], [0,1], [1,1]);
  // Face 1: arête BC
  tri(B0, B1, C0,  nBC, [0,0], [0,1], [1,0]);
  tri(C0, B1, C1,  nBC, [1,0], [0,1], [1,1]);
  // Face 2: arête CA
  tri(C0, C1, A0,  nCA, [0,0], [0,1], [1,0]);
  tri(A0, C1, A1,  nCA, [1,0], [0,1], [1,1]);

  return buildGeometry(pos, nor, uvs);
}

/**
 * Crée une géométrie contenant SEULEMENT la calotte HAUT (face 3).
 * @param {Orientation.UP | Orientation.DOWN} orientation
 * @param {'square'|'triangle'|'remap'} mapping
 * @returns {THREE.BufferGeometry}
 */
export function createPrismGeometryTopOnly(orientation, mapping = 'square') {
  const { A1, B1, C1, G1 } = corners(orientation);
  const nTop = [0, 1, 0];

  const pos = [], nor = [], uvs = [], ruv = [];
  function tri(v0, v1, v2, n, uv0, uv1, uv2) {
    pos.push(...v0, ...v1, ...v2);
    nor.push(...n, ...n, ...n);
    uvs.push(...uv0, ...uv1, ...uv2);
  }

  if (mapping === 'remap') {
    // Même ordre/winding que 'square' (déjà correct) — seul l'attribut remapUv change,
    // le vrai échantillonnage de texture est calculé par le fragment shader.
    tri(B1, A1, C1, nTop, [0, 0], [0, 0], [0, 0]);
    ruv.push(...REMAP_BASE_R, ...REMAP_BASE_L, ...REMAP_APEX);
  } else if (mapping === 'triangle') {
    // 3 sous-triangles radiaux depuis le centroïde (continuité entre prismes)
    tri(B1, A1, G1, nTop, [1,     0  ], [0,     0  ], [0.5,   0.5]); // arête AB → Haut
    tri(A1, C1, G1, nTop, [0,     1  ], [0,     0  ], [0.375, 0.5]); // arête CA → Gauche
    tri(C1, B1, G1, nTop, [1,     1  ], [1,     0  ], [0.625, 0.5]); // arête BC → Droit
  } else {
    // DOWN : rotation 180° (1-u,1-v) + miroir horizontal (u->1-u) = net (u, 1-v).
    // Winding inchangé → normale et culling restent corrects.
    const flip = orientation === Orientation.DOWN;
    const uv = flip ? (u, v) => [u, 1 - v] : (u, v) => [u, v];
    tri(B1, A1, C1, nTop, uv(1, 0), uv(0, 0), uv(0.5, 1));
  }

  return buildGeometry(pos, nor, uvs, mapping === 'remap' ? ruv : null);
}

/**
 * Crée une géométrie contenant SEULEMENT la calotte BAS (face 4).
 * @param {Orientation.UP | Orientation.DOWN} orientation
 * @param {'square'|'triangle'|'remap'} mapping
 * @returns {THREE.BufferGeometry}
 */
export function createPrismGeometryBottomOnly(orientation, mapping = 'square') {
  const { A0, B0, C0, G0 } = corners(orientation);
  const nBottom = [0, -1, 0];

  const pos = [], nor = [], uvs = [], ruv = [];
  function tri(v0, v1, v2, n, uv0, uv1, uv2) {
    pos.push(...v0, ...v1, ...v2);
    nor.push(...n, ...n, ...n);
    uvs.push(...uv0, ...uv1, ...uv2);
  }

  if (mapping === 'remap') {
    // Même ordre/winding que 'square'.
    tri(A0, B0, C0, nBottom, [0, 0], [0, 0], [0, 0]);
    ruv.push(...REMAP_BASE_L, ...REMAP_BASE_R, ...REMAP_APEX);
  } else if (mapping === 'triangle') {
    tri(A0, B0, G0, nBottom, [0, 0], [1, 0], [0.5,   0.5]); // arête AB
    tri(C0, A0, G0, nBottom, [0, 0], [0, 1], [0.375, 0.5]); // arête CA
    tri(B0, C0, G0, nBottom, [1, 0], [1, 1], [0.625, 0.5]); // arête BC
  } else {
    // DOWN : rotation 180° + miroir horizontal = net (u, 1-v), même principe que la calotte haut.
    const flip = orientation === Orientation.DOWN;
    const uv = flip ? (u, v) => [u, 1 - v] : (u, v) => [u, v];
    tri(A0, B0, C0, nBottom, uv(0, 0), uv(1, 0), uv(0.5, 1));
  }

  return buildGeometry(pos, nor, uvs, mapping === 'remap' ? ruv : null);
}

const _cache = new Map();

/**
 * Géométrie en cache pour les côtés seulement.
 * @param {Orientation.UP | Orientation.DOWN} orientation
 * @returns {THREE.BufferGeometry}
 */
export function getPrismGeometrySides(orientation) {
  const key = `${orientation}_sides`;
  if (!_cache.has(key)) {
    _cache.set(key, createPrismGeometrySidesOnly(orientation));
  }
  return _cache.get(key);
}

/**
 * Géométrie en cache pour la calotte HAUT.
 * @param {Orientation.UP | Orientation.DOWN} orientation
 * @param {'square'|'triangle'|'remap'} mapping
 * @returns {THREE.BufferGeometry}
 */
export function getPrismGeometryTop(orientation, mapping = 'square') {
  const key = `${orientation}_${mapping}_top`;
  if (!_cache.has(key)) {
    _cache.set(key, createPrismGeometryTopOnly(orientation, mapping));
  }
  return _cache.get(key);
}

/**
 * Géométrie en cache pour la calotte BAS.
 * @param {Orientation.UP | Orientation.DOWN} orientation
 * @param {'square'|'triangle'|'remap'} mapping
 * @returns {THREE.BufferGeometry}
 */
export function getPrismGeometryBottom(orientation, mapping = 'square') {
  const key = `${orientation}_${mapping}_bottom`;
  if (!_cache.has(key)) {
    _cache.set(key, createPrismGeometryBottomOnly(orientation, mapping));
  }
  return _cache.get(key);
}

/**
 * Groupe de 3 meshes (côtés/haut/bas) représentant un bloc en dehors de toute grille —
 * pour l'afficher tenu en main ou en aperçu d'icône. Réutilise les géométries mises en
 * cache (partagées avec le mesher de chunks — NE PAS les disposer) et les matériaux du
 * registre, donc rendu identique au bloc réel (textures, mapping 'remap' inclus).
 * @param {number} blockId
 * @param {Map<number,{side,top,bottom}>} materials
 * @param {import('../world/BlockRegistry.js').BlockRegistry} blockRegistry
 * @param {Orientation.UP | Orientation.DOWN} [orientation]
 * @returns {THREE.Group}
 */
export function createPrismItemGroup(blockId, materials, blockRegistry, orientation = Orientation.UP) {
  const mat = materials.get(blockId);
  const topMapping = blockRegistry.getTopMapping(blockId);
  const bottomMapping = blockRegistry.getBottomMapping(blockId);

  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(getPrismGeometrySides(orientation), mat?.side),
    new THREE.Mesh(getPrismGeometryTop(orientation, topMapping), mat?.top ?? mat?.side),
    new THREE.Mesh(getPrismGeometryBottom(orientation, bottomMapping), mat?.bottom ?? mat?.side),
  );
  return group;
}
