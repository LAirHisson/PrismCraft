import { TriGrid } from "../world/TriGrid.js";

// Son de pas : bloc solide sous les pieds, à intervalle régulier en marchant.
const STEP_INTERVAL = 0.35;

/**
 * @param {object} deps
 * @param {import('./PlayerController.js').PlayerController} deps.playerController
 * @param {import('../world/WorldManager.js').WorldManager} deps.worldManager
 * @param {import('../world/BlockRegistry.js').BlockRegistry} deps.blockRegistry
 * @param {import('../audio/SoundManager.js').SoundManager} deps.sound
 * @returns {{ update: (dt: number) => void }}
 */
export function createFootstepPlayer({ playerController, worldManager, blockRegistry, sound }) {
  let stepTimer = 0;

  function playStep() {
    const p = playerController.position;
    const g = TriGrid.worldToGrid(p);
    const h = Math.floor(p.y - 0.05);
    const b = worldManager.getBlock(g.col, g.row, h);
    if (b && blockRegistry.isSolid(b.blockId)) {
      sound.playBlock(
        "step",
        blockRegistry.getSoundType(b.blockId),
        TriGrid.gridToWorld(g.col, g.row, h),
        { volume: 0.35 },
      );
    }
  }

  function update(dt) {
    if (playerController.isMoving && playerController.isGrounded) {
      stepTimer += dt;
      if (stepTimer >= STEP_INTERVAL) {
        stepTimer = 0;
        playStep();
      }
    } else {
      stepTimer = STEP_INTERVAL; // prochain pas joué dès la reprise de marche
    }
  }

  return { update };
}
