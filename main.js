/**
 * Point d'entrée du jeu : assemble scène, monde, hotbar, interaction et boucle de rendu.
 */

import * as THREE from "three";
import { createScene } from "./core/SceneSetup.js";
import { createWaterOverlay } from "./ui/WaterOverlay.js";
import { initializeBlockSystem } from "./BlockSystem.js";
import { loadRecipes } from "./crafting/CraftingSystem.js";
import { SaveManager } from "./core/SaveManager.js";
import { RenderOrigin } from "./rendering/RenderOrigin.js";
import { createSunShadowTracker } from "./rendering/SunShadowTracker.js";
import { installBrowserGuards } from "./core/BrowserGuards.js";
import { installDevConsole } from "./core/DevConsole.js";
import { createGameSystems } from "./core/GameSystems.js";
import { createMenuAndSave } from "./core/MenuAndSave.js";
import { createViewRig } from "./player/ViewRig.js";
import { createFootstepPlayer } from "./player/Footsteps.js";

const { scene, worldRoot, camera, renderer, skyRenderer, sunLight, cameraController } =
  createScene();
const renderOrigin = new RenderOrigin();

const waterOverlay = createWaterOverlay();

installBrowserGuards();

(async () => {
  const { blockRegistry, materials } = await initializeBlockSystem();
  const craftingSystem = await loadRecipes(blockRegistry);

  // Sauvegarde : chargée avant toute génération de monde pour que le delta d'éditions
  // soit déjà en place au tout premier chunk généré.
  const saveManager = new SaveManager();
  await saveManager.init();
  const existingSave = await saveManager.loadAutosave();
  // Nouvelle seed aléatoire si aucune sauvegarde (cohérent avec "Nouvelle partie", qui
  // en génère une aussi — sinon le tout premier lancement serait toujours identique).
  const seed = existingSave?.world?.seed ?? Math.floor(Math.random() * 0xffffffff);

  const {
    worldManager, inventory, gameMode, modeLabel, raycaster, highlight, sound,
    hotbar, inventoryUI, chunkManager, playerController, mining, health, hud, damage, debug,
  } = createGameSystems({
    scene, worldRoot, camera, sunLight, renderOrigin, cameraController,
    blockRegistry, materials, craftingSystem, existingSave, seed,
  });

  installDevConsole(playerController);

  const viewRig = await createViewRig({ camera, worldRoot, inventory, materials, blockRegistry });

  const sunShadowTracker = createSunShadowTracker({ sunLight, skyRenderer, chunkManager });

  const footsteps = createFootstepPlayer({ playerController, worldManager, blockRegistry, sound });

  const { menu } = createMenuAndSave({
    camera, cameraController, worldManager, playerController, inventory, health,
    gameMode, chunkManager, inventoryUI, blockRegistry, saveManager, existingSave,
    sunShadowTracker, setSkin: viewRig.setSkin, modeLabel,
  });

  // La visibilité du HUD dépend à la fois du mode de jeu et de l'état "masqué" (F1,
  // porté par le ViewRig) — câblé ici, une fois les deux disponibles.
  gameMode.onChange(() => {
    hud.setVisible(gameMode.isSurvival() && !viewRig.hudHidden);
  });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Tab") return;
    e.preventDefault();
    if (inventoryUI.isOpen()) return;
    if (menu.isOpen()) cameraController.controls.lock();
    else {
      menu.setModeLabel(modeLabel());
      menu.open();
      cameraController.controls.unlock();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "F5") {
      e.preventDefault();
      viewRig.cycleView();
    }
  });

  // Freecam (P) : sort la caméra du corps, qui garde sa position.
  document.addEventListener("keydown", (e) => {
    if (e.code !== "KeyP") return;
    if (!cameraController.isLocked() || inventoryUI.isOpen() || menu.isOpen()) return;
    e.preventDefault();
    const enabling = !playerController.freecam;
    playerController.setFreecam(enabling);
    viewRig.handleFreecamToggle(enabling);
  });

  // Animation "swing" au clic (cassage/minage à gauche, pose à droite) + minage maintenu
  document.addEventListener("mousedown", (e) => {
    if (!cameraController.isLocked() || inventoryUI.isOpen()) return;
    if (e.button === 0) {
      viewRig.playSwing();
      mining.setHeld(true);
    } else if (e.button === 2) {
      viewRig.playSwing();
    }
  });
  document.addEventListener("mouseup", (e) => {
    if (e.button === 0) mining.setHeld(false);
  });

  // F1 : masque HUD (viseur + hotbar + cœurs) et la main du joueur
  document.addEventListener("keydown", (e) => {
    if (e.code !== "F1") return;
    e.preventDefault();
    const hidden = viewRig.toggleHud();
    hotbar.setVisible(!hidden);
    hud.setVisible(!hidden && gameMode.isSurvival());
  });

  // Applique l'état de mode persistant (déclenche clamp inventaire, HUD…)
  gameMode.set(gameMode.mode);

  const _pdir = new THREE.Vector3();
  const _eye = new THREE.Vector3();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    // Recentre l'origine flottante AVANT tout raycast de cette frame (voir RenderOrigin.js).
    renderOrigin.recenter(playerController.position, worldRoot);
    cameraController.update();
    skyRenderer.updatePosition(camera.position);
    sunShadowTracker.update(playerController.position);

    // Charge/décharge les chunks selon la position du joueur
    const worldChanged = chunkManager.update(playerController.position);
    if (worldChanged) sunLight.shadow.needsUpdate = true; // géométrie modifiée → ré-ombrer
    debug.update(dt);
    waterOverlay.setVisible(playerController.isHeadInWater());

    if (!inventoryUI.isOpen() && !menu.isOpen()) {
      playerController.update(dt);
      mining.update(dt);
      damage.update(dt);
      footsteps.update(dt);

      camera.getWorldDirection(_pdir); // dir 3D (avec pitch) — visée + offset 3ᵉ personne
      // Origine = tête du joueur, PAS la caméra (qui peut être ailleurs : freecam, F5) —
      // sinon on peut viser/casser des blocs hors de portée réelle du corps. Convertie en
      // repère de scène (voir RenderOrigin.js) : le raycaster teste des meshes recentrés
      // sous worldRoot, pas les vraies coordonnées monde.
      const rayResult = raycaster.castRay(
        renderOrigin.toScene(playerController.getEyePosition(_eye), _eye),
        _pdir,
        worldManager.getMeshEntries(),
      );
      if (rayResult.hit) {
        highlight.show(
          rayResult.block.col,
          rayResult.block.row,
          rayResult.block.height,
        );
      } else {
        highlight.hide();
      }

      viewRig.updatePerFrame(dt, { playerController, isMining: mining.isActive(), lookDir: _pdir });
    } else {
      highlight.hide();
      mining.setHeld(false);
    }

    renderer.render(scene, camera);
    viewRig.restoreQuaternion();
  });
})();
