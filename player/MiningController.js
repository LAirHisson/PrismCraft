import * as THREE from "three";
import { TriGrid } from "../world/TriGrid.js";

const MINING_SOUND_INTERVAL = 0.22; // le son de coup se rejoue à cette cadence
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();

// Minage progressif (Survie) : maintien du clic gauche, progrès selon mineTime, fissures + drop.
export class MiningController {
  constructor({ camera, playerController, worldManager, raycaster, renderOrigin, inventory, registry, gameMode, crackOverlay, sound }) {
    this.camera = camera;
    this.playerController = playerController;
    this.worldManager = worldManager;
    this.raycaster = raycaster;
    this.renderOrigin = renderOrigin;
    this.inventory = inventory;
    this.registry = registry;
    this.gameMode = gameMode;
    this.crackOverlay = crackOverlay;
    this.sound = sound;

    this._held = false;
    this._progress = 0;
    this._target = null;
    this._soundTimer = 0;
  }

  setHeld(down) {
    this._held = down;
    if (!down) this._reset();
  }

  // Vrai quand un bloc est effectivement en cours de minage.
  isActive() {
    return this._held && this._target !== null;
  }

  _reset() {
    this._progress = 0;
    this._target = null;
    this._soundTimer = 0;
    this.crackOverlay.hide();
  }

  _sameTarget(col, row, height) {
    const t = this._target;
    return t && t.col === col && t.row === row && t.height === height;
  }

  update(dt) {
    if (!this.gameMode.isSurvival() || !this._held) {
      if (this._target) this._reset();
      return;
    }

    const hit = this.raycaster.castRay(
      this.renderOrigin.toScene(this.playerController.getEyePosition(_eye), _eye),
      this.camera.getWorldDirection(_dir),
      this.worldManager.getMeshEntries(),
    );
    if (!hit.hit) {
      this._reset();
      return;
    }

    const { col, row, height } = hit.block;
    const block = this.worldManager.getBlock(col, row, height);
    if (!block) {
      this._reset();
      return;
    }

    if (!this._sameTarget(col, row, height)) {
      this._progress = 0;
      this._target = { col, row, height };
      this._soundTimer = 0; // coup immédiat sur un nouveau bloc
    }

    const t = Math.max(0.05, this.registry.getMineTime(block.blockId));
    this._progress += dt / t;

    if (this._progress >= 1) {
      this._break(col, row, height, block.blockId);
    } else {
      this.crackOverlay.show(col, row, height, this._progress);
      this._soundTimer -= dt;
      if (this._soundTimer <= 0) {
        this._soundTimer = MINING_SOUND_INTERVAL;
        this.sound?.playBlock(
          "mining",
          this.registry.getSoundType(block.blockId),
          TriGrid.gridToWorld(col, row, height),
          { volume: 0.5 },
        );
      }
    }
  }

  _break(col, row, height, blockId) {
    this.sound?.playBlock("break", this.registry.getSoundType(blockId), TriGrid.gridToWorld(col, row, height));
    this.worldManager.removeBlock(col, row, height);
    this._collectDrop(blockId);

    // Plante posée dessus : elle tombe aussi (support retiré), avec son drop.
    const plant = this.worldManager.removePlantAbove(col, row, height);
    if (plant) {
      this.sound?.playBlock(
        "break",
        this.registry.getSoundType(plant.blockId),
        TriGrid.gridToWorld(plant.col, plant.row, plant.height),
      );
      this._collectDrop(plant.blockId);
    }
    // Sable/gravier au-dessus : la colonne retombe.
    this.worldManager.settleGravityAbove(col, row, height);
    this._reset();
  }

  _collectDrop(blockId) {
    const drop = this.registry.getDrop(blockId);
    if (drop != null) this.inventory.addItem(drop, 1, this.registry.getMaxStack(drop));
  }
}
