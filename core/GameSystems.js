// Construit et relie l'essentiel des systèmes de jeu (monde, inventaire, joueur,
// interaction, vie) à partir de l'état chargé (sauvegarde existante ou nouvelle
// partie). Un seul objet en sortie, consommé par le reste du bootstrap (main.js).
import { WorldManager } from "../world/WorldManager.js";
import { HotbarUI } from "../ui/HotbarUI.js";
import { InventoryUI } from "../ui/InventoryUI.js";
import { BlockHighlight } from "../rendering/BlockHighlight.js";
import { DebugOverlay } from "../ui/DebugOverlay.js";
import { setupBlockInteraction } from "../player/BlockInteraction.js";
import { PlayerController } from "../player/PlayerController.js";
import { PrismRaycaster } from "../player/Raycaster.js";
import { ChunkManager } from "../world/ChunkManager.js";
import { Inventory } from "../player/Inventory.js";
import { GameMode } from "./GameMode.js";
import { MiningController } from "../player/MiningController.js";
import { CrackOverlay } from "../rendering/CrackOverlay.js";
import { Health } from "../player/Health.js";
import { DamageSystem } from "../player/DamageSystem.js";
import { HUD } from "../ui/HUD.js";
import { SoundManager } from "../audio/SoundManager.js";
import { VOID_Y } from "../player/DamageSystem.js";
import { i18n } from "./I18n.js";
import { DEFAULT_SPAWN } from "./SceneSetup.js";

/**
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {THREE.Group} deps.worldRoot
 * @param {THREE.Camera} deps.camera
 * @param {THREE.DirectionalLight} deps.sunLight
 * @param {import('../rendering/RenderOrigin.js').RenderOrigin} deps.renderOrigin
 * @param {import('../player/Camera.js').Camera} deps.cameraController
 * @param {import('../world/BlockRegistry.js').BlockRegistry} deps.blockRegistry
 * @param {Map<number,{side,top,bottom}>} deps.materials
 * @param {*} deps.craftingSystem
 * @param {*} deps.existingSave
 * @param {number} deps.seed
 */
export function createGameSystems({
  scene, worldRoot, camera, sunLight, renderOrigin, cameraController,
  blockRegistry, materials, craftingSystem, existingSave, seed,
}) {
  const worldManager = new WorldManager(worldRoot, materials, blockRegistry);
  if (existingSave) worldManager.edits.load(existingSave.world.edits, blockRegistry);

  const inventory = new Inventory();
  if (existingSave?.inventory) inventory.load(existingSave.inventory, blockRegistry);

  const gameMode = new GameMode();
  if (existingSave?.gameMode) gameMode.set(existingSave.gameMode);
  const modeLabel = () =>
    i18n.t(gameMode.isSurvival() ? "modeSurvival" : "modeCreative");
  const raycaster = new PrismRaycaster();
  const highlight = new BlockHighlight(worldRoot);
  const crackOverlay = new CrackOverlay(worldRoot);
  const sound = new SoundManager(camera, worldRoot);

  const hotbar = new HotbarUI(inventory, blockRegistry, materials);
  const inventoryUI = new InventoryUI(
    inventory,
    blockRegistry,
    cameraController,
    craftingSystem,
    gameMode,
    materials,
  );

  const chunkManager = new ChunkManager(worldManager, blockRegistry, {
    viewDistanceX: 7, // chunks étroits en x → plus de chunks pour une portée égale
    viewDistanceZ: 6,
    buffer: 2,
    budget: 2, // génération / frame
    meshBudget: 2, // meshing / frame
    genOpts: { seed },
  });

  const world = {
    get blocks() {
      return worldManager.getBlocksArray();
    },
    getBlock: (c, r, h) => worldManager.getBlock(c, r, h),
  };
  const playerController = new PlayerController(camera, world, blockRegistry);
  if (existingSave?.player) {
    const { position: p, quaternion: q } = existingSave.player;
    playerController.position.set(p.x, p.y, p.z);
    camera.quaternion.set(q.x, q.y, q.z, q.w);
  }

  setupBlockInteraction({
    camera,
    worldManager,
    raycaster,
    renderOrigin,
    inventory,
    highlight,
    cameraController,
    playerController,
    gameMode,
    blockRegistry,
    sound,
    openCraftingTable: (size) => inventoryUI.openTable(size),
  });

  const mining = new MiningController({
    camera,
    playerController,
    worldManager,
    raycaster,
    renderOrigin,
    inventory,
    registry: blockRegistry,
    gameMode,
    crackOverlay,
    sound,
  });

  const health = new Health();
  const hud = new HUD(health);
  const damage = new DamageSystem({ gameMode, health, player: playerController, sound });

  // Toujours le spawn par défaut, jamais une position chargée — un respawn doit
  // amener quelque part de sûr, pas potentiellement là où une sauvegarde a merdé.
  const spawnPos = DEFAULT_SPAWN.clone();
  const respawn = () => {
    playerController.position.copy(spawnPos);
    playerController.velocity.set(0, 0, 0);
    playerController._peakY = spawnPos.y;
    damage.ignoreNextLand(); // pas de dégâts pour la chute post-respawn
    health.reset();
  };

  playerController.onLand = (d) => damage.onLand(d);
  health.onChange(() => {
    if (health.dead) respawn();
  });

  // Applique la vie sauvegardée seulement maintenant que le listener ci-dessus existe
  // (sinon un _emit() d'une vie déjà à 0 ne déclencherait aucun respawn). Filet de
  // sécurité en plus : une sauvegarde déjà morte ou déjà dans le vide est rattrapée ici,
  // plutôt que d'attendre le premier tick de DamageSystem.update().
  if (existingSave?.health) health.load(existingSave.health);
  if (health.dead || playerController.position.y < VOID_Y) respawn();

  // La visibilité du HUD dépend aussi de l'état "HUD masqué" (F1), propriété du
  // ViewRig — câblée séparément par l'appelant une fois celui-ci construit.
  gameMode.onChange(() => {
    playerController.flyEnabled = !gameMode.isSurvival();
    if (!playerController.flyEnabled) playerController.flying = false;
  });

  const debug = new DebugOverlay(scene, worldManager, playerController, sunLight);

  return {
    worldManager, inventory, gameMode, modeLabel, raycaster, highlight, crackOverlay,
    sound, hotbar, inventoryUI, chunkManager, playerController, mining, health, hud,
    damage, debug, respawn,
  };
}
