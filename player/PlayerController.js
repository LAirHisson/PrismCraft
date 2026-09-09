/**
 * Contrôleur du joueur — déplacement, saut, gravité.
 * Collision : empreinte hexagonale (joueur) vs empreinte triangulaire (bloc) en SAT 2D,
 * plus recouvrement vertical. Colle mieux à la grille triangulaire qu'une AABB.
 */

import * as THREE from 'three';
import { inputManager } from '../core/InputManager.js';
import {
  TriGrid,
  Orientation,
  TRIANGLE_SIDE,
  TRIANGLE_HEIGHT,
  BLOCK_HEIGHT,
} from '../world/TriGrid.js';

const S = TRIANGLE_SIDE;
const H = TRIANGLE_HEIGHT;
const EYE_HEIGHT = 1.6;

// Scratches réutilisés chaque frame (pas d'allocation dans la boucle).
const _eyeScratch = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _rightV = new THREE.Vector3();
const _newPos = new THREE.Vector3();
const _stepPos = new THREE.Vector3();
const _vertMove = new THREE.Vector3();
const _groundPos = new THREE.Vector3();

// Cos/sin précalculés des 6 sommets hexagonaux + empreintes de collision réutilisées.
const HEX_TRIG = [];
for (let k = 0; k < 6; k++) {
  HEX_TRIG.push({ c: Math.cos((k * Math.PI) / 3), s: Math.sin((k * Math.PI) / 3) });
}
const _hex = [];
for (let k = 0; k < 6; k++) _hex.push({ x: 0, z: 0 });
const _prism = { verts: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }], y0: 0, y1: 0 };

/** Remplit l'empreinte hexagonale (XZ) du joueur (circumrayon r) dans `_hex`. */
function fillHex(cx, cz, r) {
  for (let k = 0; k < 6; k++) {
    _hex[k].x = cx + r * HEX_TRIG[k].c;
    _hex[k].z = cz + r * HEX_TRIG[k].s;
  }
  return _hex;
}

/** Remplit l'empreinte triangulaire (XZ) + plage [y0, y1] d'un bloc dans `_prism`. */
function fillPrism(col, row, height, heightUnits = BLOCK_HEIGHT) {
  const isDown = TriGrid.getOrientation(col, row) === Orientation.DOWN;
  const cx = ((col + 1) * S) / 2;
  const cz = row * H + (isDown ? (2 * H) / 3 : H / 3);
  const y0 = height * BLOCK_HEIGHT;
  const v = _prism.verts;
  if (isDown) {
    v[0].x = cx + S / 2; v[0].z = cz + H / 3;
    v[1].x = cx - S / 2; v[1].z = cz + H / 3;
    v[2].x = cx;         v[2].z = cz - (2 * H) / 3;
  } else {
    v[0].x = cx - S / 2; v[0].z = cz - H / 3;
    v[1].x = cx + S / 2; v[1].z = cz - H / 3;
    v[2].x = cx;         v[2].z = cz + (2 * H) / 3;
  }
  _prism.y0 = y0;
  _prism.y1 = y0 + heightUnits;
  return _prism;
}

// Vrai si un axe issu des arêtes de `edges` sépare a et b (→ pas de recouvrement).
function _axisSeparates(edges, a, b) {
  for (let i = 0; i < edges.length; i++) {
    const p1 = edges[i];
    const p2 = edges[(i + 1) % edges.length];
    const nx = -(p2.z - p1.z);
    const nz = p2.x - p1.x;
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (let j = 0; j < a.length; j++) {
      const d = a[j].x * nx + a[j].z * nz;
      if (d < minA) minA = d;
      if (d > maxA) maxA = d;
    }
    for (let j = 0; j < b.length; j++) {
      const d = b[j].x * nx + b[j].z * nz;
      if (d < minB) minB = d;
      if (d > maxB) maxB = d;
    }
    if (maxA <= minB || maxB <= minA) return true;
  }
  return false;
}

/** SAT 2D : true si deux polygones convexes se chevauchent (contact ⇒ pas de collision). */
function polyOverlap(a, b) {
  return !_axisSeparates(a, a, b) && !_axisSeparates(b, a, b);
}

export class PlayerController {
  /**
   * @param {THREE.PerspectiveCamera} camera - Caméra du joueur
   * @param {Object} world - Objet { blocks: [...] } contenant les blocs du monde
   */
  constructor(camera, world, blockRegistry = null) {
    this.camera = camera;
    this.world = world;
    this.blockRegistry = blockRegistry;

    /**
     * Position du joueur (base de sa hitbox)
     * @type {THREE.Vector3}
     */
    this.position = new THREE.Vector3();
    this.position.copy(camera.position);

    /**
     * Vélocité du joueur (pour saut et gravité)
     * @type {THREE.Vector3}
     */
    this.velocity = new THREE.Vector3(0, 0, 0);

    // Vol créatif : activé par double-tap Espace (si autorisé), Maj pour descendre.
    this.flyEnabled = false;
    this.flying = false;
    this.flySpeed = 8;
    this._spacePrev = false;
    this._lastSpaceTap = 0;

    // Freecam (touche P) : caméra détachée du corps, sans collision. `this.position`
    // (le corps) n'est plus touché tant que c'est actif — il garde sa position/orientation.
    this.freecam = false;
    this.freecamPosition = new THREE.Vector3();
    this.freecamSpeed = 12;
    this.freecamSprintMultiplier = 2.5;

    /**
     * Vitesse horizontale de déplacement (unités/frame)
     * @type {number}
     */
    this.moveSpeed = 3.8;

    /**
     * Multiplicateur de vitesse en course (touche Ctrl).
     * @type {number}
     */
    this.sprintMultiplier = 1.6;

    /** Vrai si le joueur court (Ctrl + déplacement). @type {boolean} */
    this.isSprinting = false;

    /**
     * Vitesse verticale initiale du saut
     * @type {number}
     */
    this.jumpPower = 7;

    /**
     * Accélération gravitationnelle
     * @type {number}
     */
    this.gravity = -18.0;

    /**
     * Vélocité Y maximale en chute (limite terminale)
     * @type {number}
     */
    this.maxFallSpeed = -13.5;

    /**
     * Rayon de collision (AABB demi-dimension)
     * @type {number}
     */
    this.collisionRadius = 0.3;

    /**
     * Hauteur de la hitbox
     * @type {number}
     */
    this.collisionHeight = 1.8;

    /**
     * Vrai si le joueur est en contact avec le sol
     * @type {boolean}
     */
    this.isGrounded = true;

    /**
     * Distance d'interaction du sol (pour être considéré comme "grounded")
     * @type {number}
     */
    this.groundingDistance = 0.1;

    // Suivi de chute : apex atteint depuis le dernier contact au sol.
    this._peakY = this.position.y;

    /**
     * Callback d'atterrissage — reçoit la distance de chute (blocs). La logique de
     * dégâts vit ailleurs (DamageSystem) ; le contrôleur ne fait que signaler.
     * @type {?(fallDistance: number) => void}
     */
    this.onLand = null;
  }

  /** Vrai si la tête du joueur (niveau des yeux) est dans un bloc liquide. */
  isHeadInWater() {
    return this._liquidAt(EYE_HEIGHT);
  }

  /**
   * Position des yeux (tête) du joueur — origine des rayons de visée/minage. Ne PAS
   * utiliser `camera.position` pour ça : la caméra peut être ailleurs (freecam, vue 3e
   * personne F5), ce qui permettrait de viser/casser des blocs depuis un point qui
   * n'est pas réellement le corps du joueur.
   * @param {THREE.Vector3} [out]
   * @returns {THREE.Vector3}
   */
  getEyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
  }

  /** Vrai si les pieds du joueur sont dans un liquide (amortit la chute). */
  isInWater() {
    return this._liquidAt(0.1);
  }

  _liquidAt(dy) {
    if (!this.world.getBlock || !this.blockRegistry) return false;
    _eyeScratch.set(this.position.x, this.position.y + dy, this.position.z);
    const g = TriGrid.worldToGrid(_eyeScratch);
    const b = this.world.getBlock(g.col, g.row, g.height);
    return !!b && this.blockRegistry.isLiquid(b.blockId);
  }

  /**
   * Récupère la direction avant du joueur (basée sur la rotation de la caméra).
   * @returns {THREE.Vector3}
   */
  _getRightDirection() {
    // Axe X local de la caméra : toujours horizontal (pas de roll) → stable même à
    // pitch ±90° (regard droit en haut/bas), contrairement à getWorldDirection.
    _rightV.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _rightV.y = 0;
    return _rightV.normalize();
  }

  /**
   * Direction avant horizontale du joueur (unitaire), robuste au zénith/nadir.
   * @returns {THREE.Vector3}
   */
  _getForwardDirection() {
    return _fwd.crossVectors(_UP, this._getRightDirection()); // up × right, déjà unitaire
  }

  /** Direction avant horizontale (pour orienter le modèle). Stable en visant tout en haut/bas. */
  getForward() {
    return this._getForwardDirection();
  }

  /**
   * (Dés)active la freecam. Le corps (`this.position`) n'est jamais modifié pendant
   * qu'elle est active ; à la désactivation, la caméra revient se recaler dessus.
   * @param {boolean} enabled
   */
  setFreecam(enabled) {
    if (enabled === this.freecam) return;
    this.freecam = enabled;
    if (enabled) {
      this.freecamPosition.copy(this.camera.position);
      this.isMoving = false;
    } else {
      this.camera.position.copy(this.position);
      this.camera.position.y += EYE_HEIGHT;
    }
  }

  /**
   * Téléporte le joueur (commande /tp) : déplace le corps ET la caméra (ou la
   * freecam si active) immédiatement, sans attendre le prochain update() — et
   * annule la vélocité pour éviter une chute/inertie résiduelle à l'arrivée.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  teleport(x, y, z) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    if (this.freecam) {
      this.freecamPosition.set(x, y, z);
      this.camera.position.copy(this.freecamPosition);
    } else {
      this.camera.position.set(x, y + EYE_HEIGHT, z);
    }
  }

  /** Vol libre sans collision, découplé du corps (avant/arrière suit la visée, avec pitch). */
  _updateFreecam(deltaTime) {
    let moveX = 0; // avant/arrière, le long de la visée complète (pitch inclus)
    let moveZ = 0; // strafe horizontal
    if (inputManager.isKeyPressed('KeyW')) moveX += 1;
    if (inputManager.isKeyPressed('KeyS')) moveX -= 1;
    if (inputManager.isKeyPressed('KeyA')) moveZ -= 1;
    if (inputManager.isKeyPressed('KeyD')) moveZ += 1;

    // Même correctif de diagonale que PlayerController.update().
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 1) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    const speed =
      this.freecamSpeed *
      (inputManager.isKeyPressed('ControlLeft') ? this.freecamSprintMultiplier : 1);

    this.camera.getWorldDirection(_fwd); // 3D complet, contrairement à _getForwardDirection
    const right = this._getRightDirection();

    this.freecamPosition.addScaledVector(_fwd, moveX * speed * deltaTime);
    this.freecamPosition.addScaledVector(right, moveZ * speed * deltaTime);
    if (inputManager.isKeyPressed('Space')) this.freecamPosition.y += speed * deltaTime;
    if (inputManager.isKeyPressed('ShiftLeft')) this.freecamPosition.y -= speed * deltaTime;

    this.camera.position.copy(this.freecamPosition);
  }

  /**
   * Teste la collision entre la position proposée (empreinte hexagonale) et les
   * blocs (empreinte triangulaire) du monde. Retourne true si collision.
   * @param {THREE.Vector3} testPos
   * @returns {boolean}
   */
  _testCollision(testPos) {
    if (!this.world.getBlock) return false;

    const y0 = testPos.y;
    const y1 = testPos.y + this.collisionHeight;
    const hex = fillHex(testPos.x, testPos.z, this.collisionRadius);

    // Ne tester que les cases autour du joueur (pas tout le monde)
    const center = TriGrid.worldToGrid(testPos);
    const R = 3;
    const hMin = Math.floor(y0) - 1;
    const hMax = Math.floor(y1) + 1;

    for (let dc = -R; dc <= R; dc++) {
      for (let dr = -R; dr <= R; dr++) {
        const col = center.col + dc;
        const row = center.row + dr;
        for (let h = hMin; h <= hMax; h++) {
          const block = this.world.getBlock(col, row, h);
          if (!block) continue;
          if (this.blockRegistry && !this.blockRegistry.isSolid(block.blockId)) continue;
          const slab =
            this.blockRegistry && this.blockRegistry.getShape(block.blockId) === "slab";
          const prism = fillPrism(col, row, h, slab ? BLOCK_HEIGHT / 2 : BLOCK_HEIGHT);
          if (slab && block.half === "top") {
            prism.y0 += BLOCK_HEIGHT / 2;
            prism.y1 += BLOCK_HEIGHT / 2;
          }
          if (y1 <= prism.y0 || y0 >= prism.y1) continue; // pas de recouvrement vertical
          if (polyOverlap(hex, prism.verts)) return true;
        }
      }
    }
    return false;
  }

  /** True si un bloc placé en (col,row,height) chevaucherait le joueur. */
  intersectsBlock(col, row, height) {
    const prism = fillPrism(col, row, height);
    const p = this.position;
    if (p.y + this.collisionHeight <= prism.y0 || p.y >= prism.y1) return false;
    return polyOverlap(fillHex(p.x, p.z, this.collisionRadius), prism.verts);
  }

  /**
   * Teste si le joueur est en contact avec le sol.
   * @returns {boolean}
   */
  _isGrounded() {
    _groundPos.copy(this.position);
    _groundPos.y -= this.groundingDistance;
    return this._testCollision(_groundPos);
  }

  /**
   * Met à jour le joueur (entrées, mouvement, gravité, collision).
   * @param {number} deltaTime - Temps écoulé depuis le dernier frame (en secondes)
   */
  update(deltaTime = 1 / 60) {
    if (this.freecam) {
      this._updateFreecam(deltaTime);
      return;
    }

    // Double-tap Espace → (dés)active le vol créatif.
    const spaceDown = inputManager.isKeyPressed('Space');
    if (spaceDown && !this._spacePrev) {
      const now = performance.now();
      if (this.flyEnabled && now - this._lastSpaceTap < 300) {
        this.flying = !this.flying;
        this.velocity.y = 0;
      }
      this._lastSpaceTap = now;
    }
    this._spacePrev = spaceDown;
    if (!this.flyEnabled) this.flying = false;

    // Au sol seulement si on ne monte pas (sinon faux contact juste après le saut,
    // qui avalerait la chute et couperait l'élan).
    const wasGrounded = this.isGrounded;
    this.isGrounded = this.velocity.y <= 0 && this._isGrounded();

    // Atterrissage = transition air → sol : signaler la distance de chute (apex - sol)
    // AVANT de réinitialiser l'apex. Pas de dégâts en vol.
    if (!wasGrounded && this.isGrounded && this.onLand && !this.flying) {
      this.onLand(this._peakY - this.position.y);
    }
    if (this.isGrounded || this.flying) this._peakY = this.position.y;
    else this._peakY = Math.max(this._peakY, this.position.y);

    // ──────────────────── Déplacement horizontal ────────────────────
    let moveX = 0;
    let moveZ = 0;

    // ZQSD (WASD en français) — adapter les codes de touche
    // Les codes de touche THREE.js sont basés sur la position physique du clavier QWERTY
    // Z sur AZERTY = KeyW (position du W sur QWERTY)
    // Q sur AZERTY = KeyA (position du A sur QWERTY)
    // S sur AZERTY = KeyS (même position)
    // D sur AZERTY = KeyD (même position)
    if (inputManager.isKeyPressed('KeyW')) {
      // Z sur AZERTY = forward
      moveX += 1;
    }
    if (inputManager.isKeyPressed('KeyS')) {
      // S = backward
      moveX -= 1;
    }
    if (inputManager.isKeyPressed('KeyA')) {
      // Q sur AZERTY = left
      moveZ -= 1;
    }
    if (inputManager.isKeyPressed('KeyD')) {
      // D = right
      moveZ += 1;
    }

    // Normalise la diagonale : sans ça, avancer + strafer combine deux vecteurs unité
    // (norme √2 ≈ 1.41×) au lieu d'un déplacement à vitesse normale.
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 1) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    // Vrai si une touche de déplacement horizontal est active (pour l'anim de marche)
    this.isMoving = moveX !== 0 || moveZ !== 0;

    // Course : Ctrl maintenu pendant un déplacement.
    this.isSprinting = this.isMoving && inputManager.isKeyPressed('ControlLeft');
    const speed = this.moveSpeed * (this.isSprinting ? this.sprintMultiplier : 1);

    // Appliquer le mouvement dans l'espace monde (relative à la caméra)
    const forward = this._getForwardDirection();
    const right = this._getRightDirection();

    // Résolu par composante de déplacement réelle (avant/arrière PUIS latéral),
    // pas par axe du monde (X/Z) : un mur en biais peut bloquer X et Z individuellement
    // tout en laissant le pas latéral totalement libre. Décomposer par le monde
    // empêcherait donc de glisser dans ce cas ; décomposer par forward/right glisse
    // correctement quel que soit l'angle du mur par rapport au regard du joueur.
    _newPos.copy(this.position);
    _newPos.addScaledVector(forward, moveX * speed * deltaTime);
    if (this._testCollision(_newPos)) _newPos.copy(this.position);

    _stepPos.copy(_newPos);
    _newPos.addScaledVector(right, moveZ * speed * deltaTime);
    if (this._testCollision(_newPos)) _newPos.copy(_stepPos);

    this.position.copy(_newPos);

    // ──────────────────── Vertical : vol libre OU gravité/saut ────────────────────
    if (this.flying) {
      // Espace = monter, Maj = descendre ; pas de gravité.
      let vy = 0;
      if (inputManager.isKeyPressed('Space')) vy += this.flySpeed;
      if (inputManager.isKeyPressed('ShiftLeft')) vy -= this.flySpeed;
      this.velocity.y = vy;
    } else {
      // Réinitialiser la vélocité Y si on est au sol
      if (this.isGrounded) {
        this.velocity.y = 0;
      }
      // Appliquer le saut (après réinitialisation, donc on peut override)
      if (inputManager.isKeyPressed('Space') && this.isGrounded) {
        this.velocity.y = this.jumpPower;
        this.isGrounded = false; // On quitte le sol au saut
      }
      // Appliquer la gravité si en l'air
      if (!this.isGrounded) {
        this.velocity.y += this.gravity * deltaTime;
        if (this.velocity.y < this.maxFallSpeed) {
          this.velocity.y = this.maxFallSpeed;
        }
      }
    }

    // Appliquer le déplacement vertical (multiplié par deltaTime)
    _vertMove.set(0, this.velocity.y * deltaTime, 0);
    _newPos.copy(this.position).add(_vertMove);

    if (!this._testCollision(_newPos)) {
      this.position.copy(_newPos);
    } else {
      // Collision verticale (plafond ou sol) : stopper le mouvement vertical.
      this.velocity.y = 0;
    }

    // ──────────────────── Synchroniser la caméra ────────────────────
    this.camera.position.copy(this.position);
    // Ajouter une hauteur d'oeil (décalage Y pour que la caméra soit au niveau des yeux)
    this.camera.position.y += 1.6;
  }
}
