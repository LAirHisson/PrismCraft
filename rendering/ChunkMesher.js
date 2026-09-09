/**
 * Fusionne les faces VISIBLES d'un ensemble de blocs en géométries par matériau.
 *
 * Face culling : une face n'est émise que si le voisin de l'autre côté est
 * absent, transparent, ou d'un type différent (les faces internes entre blocs
 * opaques — ou entre deux blocs du même type transparent — sont supprimées).
 *
 * Réutilise les géométries locales de PrismGeometryHelpers (mêmes normales/UVs
 * que l'ancien rendu), découpées face par face pour le culling.
 */

import * as THREE from "three";
import {
  TriGrid,
  Orientation,
  TRIANGLE_SIDE,
  TRIANGLE_HEIGHT,
  BLOCK_HEIGHT,
} from "../world/TriGrid.js";
import {
  getPrismGeometrySides,
  getPrismGeometryTop,
  getPrismGeometryBottom,
} from "./PrismGeometryHelpers.js";

const FALLBACK_MAT = new THREE.MeshStandardMaterial({ color: 0x888888 });

// Plages verticales opaques (unités locales 0..1) pour le culling des slabs.
const FULL_RANGE = [0, 1];
const SLAB_BOTTOM_RANGE = [0, 0.5];
const SLAB_TOP_RANGE = [0.5, 1];

// ─── Extraction (cachée) des données locales par face ───
const _cache = new Map();

function sliceVerts(geo, vStart, vCount) {
  const p = geo.attributes.position.array;
  const n = geo.attributes.normal.array;
  const u = geo.attributes.uv.array;
  return {
    pos: p.subarray(vStart * 3, (vStart + vCount) * 3),
    nor: n.subarray(vStart * 3, (vStart + vCount) * 3),
    uv: u.subarray(vStart * 2, (vStart + vCount) * 2),
  };
}

function wholeVerts(geo) {
  return {
    pos: geo.attributes.position.array,
    nor: geo.attributes.normal.array,
    uv: geo.attributes.uv.array,
    ruv: geo.attributes.remapUv?.array, // présent seulement pour le mapping 'remap'
  };
}

// Face latérale f (0-2) : 2 triangles = 6 sommets à l'offset f*6
function sideFaceData(orient, f) {
  const k = `s_${orient}_${f}`;
  if (!_cache.has(k)) _cache.set(k, sliceVerts(getPrismGeometrySides(orient), f * 6, 6));
  return _cache.get(k);
}

function topFaceData(orient, mapping) {
  const k = `t_${orient}_${mapping}`;
  if (!_cache.has(k)) _cache.set(k, wholeVerts(getPrismGeometryTop(orient, mapping)));
  return _cache.get(k);
}

function bottomFaceData(orient, mapping) {
  const k = `b_${orient}_${mapping}`;
  if (!_cache.has(k)) _cache.set(k, wholeVerts(getPrismGeometryBottom(orient, mapping)));
  return _cache.get(k);
}

// Plante : 3 lames verticales de l'axe central vers chaque sommet (Y vu de dessus)
function plantCrossData(orient) {
  const k = `plant_${orient}`;
  if (_cache.has(k)) return _cache.get(k);

  const S = TRIANGLE_SIDE, H = TRIANGLE_HEIGHT, BH = BLOCK_HEIGHT;
  const V =
    orient === Orientation.UP
      ? [[-S / 2, -H / 3], [S / 2, -H / 3], [0, (2 * H) / 3]]
      : [[S / 2, H / 3], [-S / 2, H / 3], [0, (-2 * H) / 3]];

  const pos = [], nor = [], uv = [];
  const tri = (a, b, c, n, ua, ub, uc) => {
    pos.push(...a, ...b, ...c);
    nor.push(...n, ...n, ...n);
    uv.push(...ua, ...ub, ...uc);
  };

  // Axe central = centre de la texture (u=0.5) : moitié droite devant, moitié gauche derrière
  for (const [vx, vz] of V) {
    const len = Math.hypot(vz, vx) || 1;
    const nf = [-vz / len, 0, vx / len]; // normale face avant
    const nb = [vz / len, 0, -vx / len]; // normale face arrière
    const G0 = [0, 0, 0], V0 = [vx, 0, vz], V1 = [vx, BH, vz], G1 = [0, BH, 0];
    // Avant : axe u=0.5 → sommet u=1
    tri(G0, V0, V1, nf, [0.5, 0], [1, 0], [1, 1]);
    tri(G0, V1, G1, nf, [0.5, 0], [1, 1], [0.5, 1]);
    // Arrière (winding inversé) : axe u=0.5 → sommet u=0 (miroir)
    tri(G0, V1, V0, nb, [0.5, 0], [0, 1], [0, 0]);
    tri(G0, G1, V1, nb, [0.5, 0], [0.5, 1], [0, 1]);
  }

  const data = { pos, nor, uv };
  _cache.set(k, data);
  return data;
}

// Copie une face en transformant y (échelle + offset) et éventuellement v de la texture.
// remapUv n'est pas affecté (coordonnée abstraite indépendante de l'échelle du slab).
function xformData(base, yScale, yOff, vScale = 1, vOff = 0) {
  const pos = Float32Array.from(base.pos);
  for (let i = 1; i < pos.length; i += 3) pos[i] = pos[i] * yScale + yOff;
  let uv = base.uv;
  if (vScale !== 1 || vOff !== 0) {
    uv = Float32Array.from(base.uv);
    for (let i = 1; i < uv.length; i += 2) uv[i] = uv[i] * vScale + vOff;
  }
  return { pos, nor: base.nor, uv, ruv: base.ruv };
}

// Slab = demi-bloc. `top` : moitié haute (y 0.5→1, v 0.5→1), sinon moitié basse (y 0→0.5, v 0→0.5).
function slabSideFaceData(orient, f, top) {
  const k = `slabS_${orient}_${f}_${top ? "t" : "b"}`;
  if (!_cache.has(k)) {
    const base = sideFaceData(orient, f);
    _cache.set(k, top ? xformData(base, 0.5, 0.5, 0.5, 0.5) : xformData(base, 0.5, 0, 0.5, 0));
  }
  return _cache.get(k);
}

// Calotte haut : slab haut = à y=1 (inchangée), slab bas = ramenée à y=0.5.
function slabTopData(orient, mapping, top) {
  const k = `slabT_${orient}_${mapping}_${top ? "t" : "b"}`;
  if (!_cache.has(k)) {
    const base = topFaceData(orient, mapping);
    _cache.set(k, top ? base : xformData(base, 0.5, 0));
  }
  return _cache.get(k);
}

// Calotte bas : slab haut = remontée à y=0.5, slab bas = à y=0 (inchangée).
function slabBottomData(orient, mapping, top) {
  const k = `slabB_${orient}_${mapping}_${top ? "t" : "b"}`;
  if (!_cache.has(k)) {
    const base = bottomFaceData(orient, mapping);
    _cache.set(k, top ? xformData(base, 1, 0.5) : base);
  }
  return _cache.get(k);
}

/**
 * Construit les meshes fusionnés (culled) pour un ensemble de blocs.
 *
 * @param {Iterable<{blockId,col,row,height}>} blocks
 * @param {(col,row,height) => object|undefined} getBlock  accès voisin
 * @param {import('../world/BlockRegistry.js').BlockRegistry} blockRegistry
 * @param {Map<number,{side,top,bottom}>} materials
 * @param {THREE.Vector3} [origin]  Origine locale du chunk (voir note ci-dessous).
 * @returns {Array<{ mesh: THREE.Mesh, faceMeta: Array<{col,row,height,faceIndex}> }>}
 */
export function buildChunkMeshes(blocks, getBlock, blockRegistry, materials, origin) {
  // Sommets stockés RELATIFS à `origin` (mesh.position la restaure) plutôt qu'en
  // coordonnées monde absolues : au-delà d'environ ±1e6 unités, un Float32Array de
  // positions absolues perd plus d'un bloc de précision (mantisse 24 bits), ce qui
  // décale visuellement les prismes de leur boîte de collision (calculée, elle, en
  // double précision JS) et fait "trembler" le rendu à chaque rotation caméra —
  // symptôme classique de coordonnées absolues loin de l'origine en WebGL.
  const ox = origin?.x ?? 0, oy = origin?.y ?? 0, oz = origin?.z ?? 0;

  // Un buffer par matériau
  const groups = new Map();
  const bucket = (mat) => {
    const m = mat ?? FALLBACK_MAT;
    if (!groups.has(m)) groups.set(m, { pos: [], nor: [], uv: [], ruv: [], meta: [] });
    return groups.get(m);
  };

  const appendFace = (buf, data, wp, col, row, height, faceIndex) => {
    const { pos, nor, uv, ruv } = data;
    for (let i = 0; i < pos.length; i += 3) {
      buf.pos.push(pos[i] + wp.x - ox, pos[i + 1] + wp.y - oy, pos[i + 2] + wp.z - oz);
    }
    for (let i = 0; i < nor.length; i++) buf.nor.push(nor[i]);
    for (let i = 0; i < uv.length; i++) buf.uv.push(uv[i]);
    if (ruv) for (let i = 0; i < ruv.length; i++) buf.ruv.push(ruv[i]);
    for (let t = 0; t < pos.length / 9; t++) {
      buf.meta.push({ col, row, height, faceIndex });
    }
  };

  for (const block of blocks) {
    const { col, row, height, blockId } = block;
    const orient = TriGrid.getOrientation(col, row);
    const wp = TriGrid.gridToWorld(col, row, height);
    const mat = materials.get(blockId);

    // Plantes : croix à 3 lames, pas de culling, non solides
    if (blockRegistry.getShape(blockId) === "plant") {
      appendFace(bucket(mat?.side), plantCrossData(orient), wp, col, row, height, 3);
      continue;
    }

    // Une face est cachée si le voisin est opaque ou du même type
    const hidden = (nb) =>
      nb && (blockRegistry.isOpaque(nb.blockId) || nb.blockId === blockId);

    // Slab (demi-bloc). Un côté n'est masqué que si le voisin couvre réellement sa
    // demi-hauteur ; les calottes sont cullées selon la couverture verticale de la case
    // voisine (dessous/dessus). Corrige les slabs de moitiés différentes côte à côte.
    if (blockRegistry.getShape(blockId) === "slab") {
      const top = block.half === "top";
      const lo = top ? 0.5 : 0;
      const hi = top ? 1 : 0.5;
      const topMap = blockRegistry.getTopMapping(blockId);
      const botMap = blockRegistry.getBottomMapping(blockId);

      // Plage verticale opaque (0..1) d'un voisin, ou null si transparent (air/verre/plante…).
      const range = (nb) => {
        if (!nb) return null;
        if (blockRegistry.getShape(nb.blockId) === "slab") {
          return nb.half === "top" ? SLAB_TOP_RANGE : SLAB_BOTTOM_RANGE;
        }
        return blockRegistry.isOpaque(nb.blockId) ? FULL_RANGE : null;
      };

      const nbs = TriGrid.getNeighbors(col, row);
      for (let f = 0; f < 3; f++) {
        const r = range(getBlock(nbs[f].col, nbs[f].row, height));
        if (r && r[0] <= lo && r[1] >= hi) continue; // côté entièrement couvert
        appendFace(bucket(mat?.side), slabSideFaceData(orient, f, top), wp, col, row, height, f);
      }

      if (top) {
        // calotte bas (y=0.5) toujours visible ; calotte haut cullée si le dessus couvre son bas
        appendFace(bucket(mat?.bottom ?? mat?.side), slabBottomData(orient, botMap, true), wp, col, row, height, 4);
        const above = range(getBlock(col, row, height + 1));
        if (!(above && above[0] <= 0)) {
          appendFace(bucket(mat?.top ?? mat?.side), slabTopData(orient, topMap, true), wp, col, row, height, 3);
        }
      } else {
        // calotte haut (y=0.5) toujours visible ; calotte bas cullée si le dessous couvre son haut
        appendFace(bucket(mat?.top ?? mat?.side), slabTopData(orient, topMap, false), wp, col, row, height, 3);
        const below = range(getBlock(col, row, height - 1));
        if (!(below && below[1] >= 1)) {
          appendFace(bucket(mat?.bottom ?? mat?.side), slabBottomData(orient, botMap, false), wp, col, row, height, 4);
        }
      }
      continue;
    }

    // Côtés (faces 0-2) : voisins d'arête à la même hauteur
    const neighbors = TriGrid.getNeighbors(col, row);
    for (let f = 0; f < 3; f++) {
      const nb = getBlock(neighbors[f].col, neighbors[f].row, height);
      if (hidden(nb)) continue;
      appendFace(bucket(mat?.side), sideFaceData(orient, f), wp, col, row, height, f);
    }

    // Calotte haut (face 3)
    if (!hidden(getBlock(col, row, height + 1))) {
      const mapping = blockRegistry.getTopMapping(blockId);
      appendFace(bucket(mat?.top ?? mat?.side), topFaceData(orient, mapping), wp, col, row, height, 3);
    }

    // Calotte bas (face 4)
    if (!hidden(getBlock(col, row, height - 1))) {
      const mapping = blockRegistry.getBottomMapping(blockId);
      appendFace(bucket(mat?.bottom ?? mat?.side), bottomFaceData(orient, mapping), wp, col, row, height, 4);
    }
  }

  const result = [];
  for (const [mat, buf] of groups) {
    if (buf.pos.length === 0) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(buf.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(buf.nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(buf.uv, 2));
    if (buf.ruv.length) geo.setAttribute("remapUv", new THREE.Float32BufferAttribute(buf.ruv, 2));
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ox, oy, oz);
    const opaque = !mat.transparent && !(mat.alphaTest > 0);
    mesh.castShadow = opaque;
    mesh.receiveShadow = opaque;
    result.push({ mesh, faceMeta: buf.meta });
  }
  return result;
}
