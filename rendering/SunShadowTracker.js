// Ombres : la shadow camera suit le joueur et couvre la zone des chunks chargés.
import * as THREE from "three";
import { CHUNK_SIZE } from "../world/Chunk.js";
import { TRIANGLE_SIDE, TRIANGLE_HEIGHT } from "../world/TriGrid.js";

const SHADOW_DIST = 250;
const SHADOW_MAP_SIZE = 2048;

/**
 * @param {object} deps
 * @param {THREE.DirectionalLight} deps.sunLight
 * @param {import('./SkyRenderer.js').SkyRenderer} deps.skyRenderer
 * @param {import('../world/ChunkManager.js').ChunkManager} deps.chunkManager
 * @returns {{ configure: () => void, update: (playerPosition: THREE.Vector3) => void, CW: number, CD: number }}
 */
export function createSunShadowTracker({ sunLight, skyRenderer, chunkManager }) {
  // Taille monde d'un chunk (rectangulaire : étroit en x, profond en z) — exposée
  // pour les appelants qui convertissent une distance de rendu en portée d'ombre
  // (ex. le slider de réglages).
  const CW = (CHUNK_SIZE * TRIANGLE_SIDE) / 2;
  const CD = CHUNK_SIZE * TRIANGLE_HEIGHT;

  // Plafond de couverture d'ombre (en chunks) → qualité constante quelle que soit la distance de rendu
  const SHADOW_CAP_X = chunkManager.viewDistanceX;
  const SHADOW_CAP_Z = chunkManager.viewDistanceZ;
  let shadowRadius = 0;
  let shadowTexel = 0;
  sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sunLight.shadow.autoUpdate = false; // re-rendu piloté manuellement

  // Base de la lumière (perpendiculaire à la direction du soleil) — pré-alloués
  const _dir = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _yAxis = new THREE.Vector3(0, 1, 0);
  const _zAxis = new THREE.Vector3(0, 0, 1);
  const _last = { x: NaN, y: NaN, z: NaN, dx: 0, dy: 0, dz: 0 };

  // Dimensionne la shadow camera sur la zone chargée (à rappeler si la distance change)
  function configure() {
    // Couvre au plus le plafond (zone proche) → texels fins même si on voit loin
    const sx = Math.min(chunkManager.viewDistanceX, SHADOW_CAP_X);
    const sz = Math.min(chunkManager.viewDistanceZ, SHADOW_CAP_Z);
    shadowRadius = Math.hypot((sx + 0.5) * CW, (sz + 0.5) * CD);
    shadowTexel = (2 * shadowRadius) / SHADOW_MAP_SIZE;
    const c = sunLight.shadow.camera;
    c.left = -shadowRadius;
    c.right = shadowRadius;
    c.top = shadowRadius;
    c.bottom = -shadowRadius;
    c.near = 1;
    c.far = SHADOW_DIST * 2;
    c.updateProjectionMatrix();
    sunLight.shadow.needsUpdate = true;
    _last.x = NaN;
  }
  configure();

  function update(playerPosition) {
    _dir.copy(skyRenderer.getSunPosition()).normalize();
    // évite la dégénérescence si le soleil est ~vertical
    const up0 = Math.abs(_dir.y) > 0.99 ? _zAxis : _yAxis;
    _right.crossVectors(up0, _dir).normalize();
    _up.crossVectors(_dir, _right).normalize();

    const px = playerPosition.x;
    const pz = playerPosition.z;

    // Centre visé (px,0,pz) décomposé dans la base de la lumière
    const cRight = px * _right.x + pz * _right.z;
    const cUp = px * _up.x + pz * _up.z;
    const cDir = px * _dir.x + pz * _dir.z;

    // Snap sur la grille de texels dans le plan de projection → pas de scintillement
    const sRight = Math.round(cRight / shadowTexel) * shadowTexel;
    const sUp = Math.round(cUp / shadowTexel) * shadowTexel;

    const cx = _right.x * sRight + _up.x * sUp + _dir.x * cDir;
    const cy = _right.y * sRight + _up.y * sUp + _dir.y * cDir;
    const cz = _right.z * sRight + _up.z * sUp + _dir.z * cDir;

    // Rien n'a bougé d'un texel entier ni le soleil → pas de re-rendu d'ombre
    if (
      cx === _last.x && cy === _last.y && cz === _last.z &&
      _dir.x === _last.dx && _dir.y === _last.dy && _dir.z === _last.dz
    ) {
      return;
    }
    _last.x = cx; _last.y = cy; _last.z = cz;
    _last.dx = _dir.x; _last.dy = _dir.y; _last.dz = _dir.z;

    sunLight.target.position.set(cx, cy, cz);
    sunLight.position.set(
      cx + _dir.x * SHADOW_DIST,
      cy + _dir.y * SHADOW_DIST,
      cz + _dir.z * SHADOW_DIST,
    );
    sunLight.target.updateMatrixWorld();
    sunLight.shadow.needsUpdate = true; // re-render une seule fois
  }

  return { configure, update, CW, CD };
}
