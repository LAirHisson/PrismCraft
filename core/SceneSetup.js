import * as THREE from "three";
import { SkyRenderer } from "../rendering/SkyRenderer.js";
import { Camera } from "../player/Camera.js";

// Spawn par défaut — réutilisé au respawn (mort/vide) et par "Nouvelle partie".
export const DEFAULT_SPAWN = new THREE.Vector3(10, 20, 9);

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  // Origine flottante (voir rendering/RenderOrigin.js) : tout ce dont la position
  // suit les vraies coordonnées monde (chunks, joueur, caméra, soleil, ciel) vit
  // sous ce groupe plutôt que directement sous `scene`, pour rester recentrable.
  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );
  camera.position.copy(DEFAULT_SPAWN);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const canvasContainer = document.getElementById("canvas");
  canvasContainer.appendChild(renderer.domElement);

  const skyRenderer = new SkyRenderer(worldRoot);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const sunLight = new THREE.DirectionalLight(0xffffff, 2);
  sunLight.position.copy(skyRenderer.getSunPosition());
  sunLight.target.position.set(10, 0, 9);
  sunLight.castShadow = true;
  sunLight.shadow.camera.left = -50;
  sunLight.shadow.camera.right = 50;
  sunLight.shadow.camera.top = 50;
  sunLight.shadow.camera.bottom = -50;
  sunLight.shadow.mapSize.set(1024, 1024);
  worldRoot.add(sunLight);
  worldRoot.add(sunLight.target);

  const cameraController = new Camera(camera, renderer, canvasContainer);

  return { scene, worldRoot, camera, renderer, canvasContainer, skyRenderer, sunLight, cameraController };
}
