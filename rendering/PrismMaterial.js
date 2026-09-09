/**
 * Matériaux des prismes triangulaires.
 * Un MeshStandardMaterial par type de bloc, chargé depuis un fichier PNG individuel.
 */

import * as THREE from 'three';
import { applyRemapShader } from './RemapShaderChunk.js';

const loader = new THREE.TextureLoader();
const BASE_PATH = 'assets/textures/blocks/';

function loadTexture(filename) {
  const texture = loader.load(BASE_PATH + filename);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMaterial(texture, mode = "opaque", remap = false) {
  const params = {
    map: texture,
    side: THREE.FrontSide,
    flatShading: false,
    metalness: 0.0,
    roughness: 0.8,
  };
  if (mode === "cutout") {
    params.alphaTest = 0.5; // découpe nette (feuilles) — FrontSide évite le z-fighting
  } else if (mode === "plant") {
    params.alphaTest = 0.5;
    // FrontSide : le mesher émet l'avant et l'arrière avec des UV miroir
  } else if (mode === "blend") {
    params.transparent = true; // semi-transparence (eau)
    // depthWrite laissé à true : sans ça, les faces se trient selon la caméra
    // et « popent » quand on tourne. On perd la superposition de plusieurs
    // couches d'eau translucides, acceptable ici.
  }
  const material = new THREE.MeshStandardMaterial(params);
  // Mapping 'remap' : géométrie à 1 seul triangle (attribut remapUv), le pavage en
  // 256 pixels triangulaires est calculé par le fragment shader — voir RemapShaderChunk.js.
  if (remap) applyRemapShader(material);
  return material;
}

/**
 * Crée les matériaux (côté/haut/bas) par bloc à partir du registre.
 * Le registre est la source unique (textures + mode) — pas de re-fetch ni de logique dupliquée.
 *
 * @param {import('../world/BlockRegistry.js').BlockRegistry} blockRegistry
 * @returns {Promise<Map<number, {side, top, bottom}>>}
 */
export async function loadPrismMaterials(blockRegistry) {
  const textureCache = new Map();
  const getTexture = (f) => {
    if (!textureCache.has(f)) textureCache.set(f, loadTexture(f));
    return textureCache.get(f);
  };

  const materialCache = new Map(); // clé = texture|mode|remap
  const getMaterial = (f, mode, remap = false) => {
    const key = `${f}|${mode}|${remap}`;
    if (!materialCache.has(key)) {
      materialCache.set(key, createMaterial(getTexture(f), mode, remap));
    }
    return materialCache.get(key);
  };

  const materials = new Map();
  for (const id of blockRegistry.getAllBlockIds()) {
    const mode = blockRegistry.getMaterialMode(id);
    materials.set(id, {
      side: getMaterial(blockRegistry.getTextureSide(id), mode),
      top: getMaterial(blockRegistry.getTopTexture(id), mode, blockRegistry.getTopMapping(id) === 'remap'),
      bottom: getMaterial(blockRegistry.getBottomTexture(id), mode, blockRegistry.getBottomMapping(id) === 'remap'),
    });
  }

  console.log(`[PrismMaterial] ${materials.size} blocs chargés`);
  return materials;
}
