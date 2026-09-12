// Gréement de vue joueur : modèle GLTF, bras 1ʳᵉ personne, bloc tenu en main,
// cycle de vue (F5) et bascule freecam — tout ce qui dépend de "où regarde-t-on
// le joueur", séparé du reste du bootstrap dans main.js.
import * as THREE from "three";
import { loadPlayerModel } from "./PlayerModel.js";
import { createPrismItemGroup } from "../rendering/PrismGeometryHelpers.js";
import { createCrosshair } from "../ui/Crosshair.js";

const FP_ARM_POS = new THREE.Vector3(0.6, -0.4, -0.5);
const FP_ARM_ROT = new THREE.Euler(1.6, 0.3, 0);

const HELD_BLOCK_POS = new THREE.Vector3(0.02, -0.8, 0.2);
const HELD_BLOCK_ROT = new THREE.Euler(Math.PI+2, 1, 0);
const HELD_BLOCK_SCALE = 0.45;

const THIRD_PERSON_DIST = 3.5;

/**
 * @param {object} deps
 * @param {THREE.Camera} deps.camera
 * @param {THREE.Group} deps.worldRoot
 * @param {import('./Inventory.js').Inventory} deps.inventory
 * @param {Map<number,{side,top,bottom}>} deps.materials
 * @param {import('../world/BlockRegistry.js').BlockRegistry} deps.blockRegistry
 */
export async function createViewRig({ camera, worldRoot, inventory, materials, blockRegistry }) {
  const crosshair = createCrosshair();

  const { model: playerModel, animator: playerAnimator, rightArm, setSkin } = await loadPlayerModel();
  worldRoot.add(playerModel);

  // Viewmodel 1ʳᵉ personne : bras droit reparenté à la caméra
  worldRoot.add(camera);
  const fpArm = new THREE.Group();
  camera.add(fpArm);
  const armParent = rightArm.parent;
  const armPos = rightArm.position.clone();

  // Bloc tenu en main : accroché à l'os du bras (pas à fpArm) → suit l'animation de
  // balancement et le bon parent (fpArm en 1ère personne, squelette en 3e) automatiquement.
  const heldItemGroup = new THREE.Group();
  heldItemGroup.position.copy(HELD_BLOCK_POS);
  heldItemGroup.rotation.copy(HELD_BLOCK_ROT);
  heldItemGroup.scale.setScalar(HELD_BLOCK_SCALE);
  rightArm.add(heldItemGroup);

  function updateHeldItem() {
    heldItemGroup.clear(); // retire l'ancien mesh — géométrie/matériaux partagés, rien à disposer
    const blockId = inventory.selectedBlockId;
    heldItemGroup.visible = blockId !== null;
    if (blockId !== null) heldItemGroup.add(createPrismItemGroup(blockId, materials, blockRegistry));
  }
  inventory.onChange(updateHeldItem);
  updateHeldItem();

  // Vue : 0 = 1ʳᵉ personne, 1 = 3ᵉ de dos, 2 = 3ᵉ de face (cycle F5)
  let view = 0;
  let hudHidden = false;
  let viewBeforeFreecam = null;
  const _pdir = new THREE.Vector3();
  const _lookTarget = new THREE.Vector3();
  const _savedQuat = new THREE.Quaternion();
  let _needsQuatRestore = false;

  // Viseur visible seulement en 1ʳᵉ personne et si le HUD n'est pas masqué (F1).
  function applyHudVisibility() {
    crosshair.style.display = view === 0 && !hudHidden ? "" : "none";
    fpArm.visible = !hudHidden;
  }

  function setView(v) {
    view = v;
    if (v !== 0) {
      if (rightArm.parent !== armParent) {
        armParent.add(rightArm);
        rightArm.position.copy(armPos);
      }
      playerModel.visible = true;
    } else {
      if (rightArm.parent !== fpArm) {
        fpArm.add(rightArm);
        rightArm.position.set(0, 0, 0);
      }
      fpArm.position.copy(FP_ARM_POS);
      fpArm.rotation.copy(FP_ARM_ROT);
      playerModel.visible = false;
    }
    applyHudVisibility();
  }
  setView(0);

  return {
    crosshair,
    fpArm,
    setSkin,
    get hudHidden() {
      return hudHidden;
    },

    /** F5 : fait défiler 1ʳᵉ personne → 3ᵉ de dos → 3ᵉ de face. */
    cycleView() {
      setView((view + 1) % 3);
    },

    /**
     * Réagit au (dés)armement de la freecam côté PlayerController : bascule en 3ᵉ
     * personne pour se voir de l'extérieur si on était en 1ʳᵉ personne, restaure la
     * vue précédente au retour.
     */
    handleFreecamToggle(enabling) {
      if (enabling) {
        viewBeforeFreecam = view;
        if (view === 0) setView(1);
      } else if (viewBeforeFreecam !== null) {
        setView(viewBeforeFreecam);
        viewBeforeFreecam = null;
      }
    },

    /** F1 : (dés)affiche viseur/bras — le reste du HUD (hotbar/cœurs) est géré par l'appelant. Retourne le nouvel état masqué. */
    toggleHud() {
      hudHidden = !hudHidden;
      applyHudVisibility();
      return hudHidden;
    },

    /** Rejoue l'animation de balancement du bras (minage/pose). */
    playSwing() {
      playerAnimator.playSwing();
    },

    /**
     * Synchro par frame : modèle joueur (position/orientation), animation, et
     * offset caméra 3ᵉ personne. `lookDir` = direction caméra déjà calculée cette
     * frame par l'appelant (évite un `getWorldDirection` redondant).
     */
    updatePerFrame(dt, { playerController, isMining, lookDir }) {
      playerModel.position.copy(playerController.position);
      if (!playerController.freecam) {
        // Yaw du modèle depuis la direction avant horizontale robuste (stable au zénith/nadir).
        // Figé pendant la freecam : le corps garde l'orientation qu'il avait en la quittant.
        const fwd = playerController.getForward();
        playerModel.rotation.y = Math.atan2(fwd.x, fwd.z) + Math.PI;
      }
      playerAnimator.holdSwing(isMining);
      playerAnimator.update(dt, {
        moving: playerController.isMoving,
        grounded: playerController.isGrounded,
        firstPerson: view === 0,
      });

      _needsQuatRestore = false;
      if (view !== 0 && !playerController.freecam) {
        // lookDir vient de getWorldDirection → déjà normalisé.
        const sign = view === 2 ? 1 : -1; // 2 = devant le joueur
        camera.position.addScaledVector(lookDir, sign * THIRD_PERSON_DIST);
        if (view === 2) {
          _savedQuat.copy(camera.quaternion); // orientation souris à restaurer
          _lookTarget.copy(playerController.position);
          _lookTarget.y += 1.6; // regarder les yeux du joueur
          camera.lookAt(_lookTarget);
          _needsQuatRestore = true;
        }
      }
    },

    /** À appeler juste après `renderer.render(...)` : le lookAt de la vue de face ne
     * doit pas corrompre PointerLockControls, sinon la caméra clignote. */
    restoreQuaternion() {
      if (_needsQuatRestore) camera.quaternion.copy(_savedQuat);
    },
  };
}
