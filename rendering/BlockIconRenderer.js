// Icônes d'inventaire/hotbar en vraie vue 3D du prisme, plutôt qu'un recadrage plat de
// la texture. Rendu hors-écran (renderer/scène dédiés, jamais ajoutés au DOM), mis en
// cache une seule fois par blockId — le résultat (data URL PNG) est ensuite utilisé
// comme n'importe quelle URL d'image dans le CSS existant (itemBackground()), donc
// aucun changement nécessaire au pavage/masquage des cases triangulaires.
import * as THREE from "three";
import { Orientation, BLOCK_HEIGHT } from "../world/TriGrid.js";
import { createPrismItemGroup } from "./PrismGeometryHelpers.js";

const SIZE = 128;
const cache = new Map();

let renderer = null;
let scene = null;
let camera = null;

function ensureRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 3, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-2, 1, -1);
  scene.add(fill);

  // Cadrage serré : le rendu finit dans une petite case (background-size: cover), une
  // grosse marge autour du prisme se ferait rogner et écraserait le relief 3D.
  camera = new THREE.PerspectiveCamera(30, 1, 0.9, 10);
  camera.position.set(3, 1.8, 2.35);
  camera.lookAt(0, -0.1, 0);
}

// TextureLoader charge en arrière-plan (async) — si on bake une icône avant que la
// texture soit prête, on obtient un rendu noir/vide qu'on ne veut surtout pas mettre
// en cache définitivement. `image.complete`/`naturalWidth` est le signal standard
// qu'une <img> a fini de charger (vrai aussi, trivialement, pour une source canvas).
function isTextureReady(tex) {
  const img = tex?.image;
  if (!img) return false;
  const complete = img.complete ?? true;
  const hasSize = img.naturalWidth === undefined || img.naturalWidth > 0;
  return complete && hasSize;
}

/**
 * Data URL PNG (mise en cache une fois les textures prêtes) d'un rendu 3D du bloc
 * `blockId`, vu depuis un angle fixe façon icône d'inventaire. `materials`/
 * `blockRegistry` = ceux déjà chargés par initializeBlockSystem() — aucun chargement
 * supplémentaire déclenché ici.
 */
export function getBlockIconDataURL(blockId, blockRegistry, materials) {
  if (cache.has(blockId)) return cache.get(blockId);
  ensureRenderer();

  const mat = materials.get(blockId);
  const texturesReady =
    isTextureReady(mat?.side?.map) && isTextureReady(mat?.top?.map) && isTextureReady(mat?.bottom?.map);

  const group = createPrismItemGroup(blockId, materials, blockRegistry, Orientation.UP);
  group.position.y = -BLOCK_HEIGHT / 2; // centre le prisme verticalement dans le cadre
  group.rotation.y = 3
  scene.add(group);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(group); // la géométrie/matériaux restent partagés — ne rien disposer ici

  // Pas encore prêtes : on renvoie quand même ce rendu (best-effort, l'appelant l'affichera
  // une frame), mais SANS le mettre en cache — le prochain appel re-bakera correctement.
  if (texturesReady) cache.set(blockId, url);
  return url;
}
