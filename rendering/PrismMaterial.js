/**
 * Matériaux des prismes triangulaires.
 * Un MeshStandardMaterial par type de bloc, chargé depuis un fichier PNG individuel.
 */

import * as THREE from 'three';
import { applyRemapShader } from './RemapShaderChunk.js';

const loader = new THREE.TextureLoader();
const BASE_PATH = 'assets/textures/blocks/';
const ITEM_PATH = 'assets/textures/items/';

function configureTexture(texture) {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function loadTexture(filename) {
  return configureTexture(loader.load(BASE_PATH + filename));
}

/**
 * Texture d'item chargée de façon ATTENDUE (loadAsync) : la géométrie 3D d'un item est
 * construite à partir de ses pixels, qui doivent donc être disponibles avant le premier
 * rendu. Une texture introuvable ne bloque pas le démarrage — l'item sera juste invisible.
 */
async function loadItemTexture(filename) {
  try {
    return configureTexture(await loader.loadAsync(ITEM_PATH + filename));
  } catch (err) {
    console.warn(`[PrismMaterial] texture d'item introuvable : ${filename}`, err);
    return null;
  }
}

/**
 * Matériau d'un item : sa géométrie ne contient que les triangles opaques de la texture
 * (voir createItemGeometry), déjà fermée et orientée — ni transparence ni double face.
 */
function createItemMaterial(texture) {
  return new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.0,
    roughness: 0.8,
  });
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

  const ids = blockRegistry.getAllBlockIds();
  const itemFiles = [...new Set(ids.filter((id) => blockRegistry.isItem(id)).map((id) => blockRegistry.getItemTexture(id)))];
  const itemTextures = await Promise.all(itemFiles.map(loadItemTexture));
  const itemMaterials = new Map(itemFiles.map((f, i) => [f, createItemMaterial(itemTextures[i])]));

  const materials = new Map();
  for (const id of ids) {
    // Un item n'a qu'un matériau : pas de calotte haut/bas à distinguer.
    if (blockRegistry.isItem(id)) {
      materials.set(id, { side: itemMaterials.get(blockRegistry.getItemTexture(id)) });
      continue;
    }
    const mode = blockRegistry.getMaterialMode(id);
    materials.set(id, {
      side: getMaterial(blockRegistry.getTextureSide(id), mode),
      top: getMaterial(blockRegistry.getTopTexture(id), mode, blockRegistry.getTopMapping(id) === 'remap'),
      bottom: getMaterial(blockRegistry.getBottomTexture(id), mode, blockRegistry.getBottomMapping(id) === 'remap'),
    });
  }

  console.log(`[PrismMaterial] ${materials.size} entrées chargées (blocs + items)`);
  return materials;
}
