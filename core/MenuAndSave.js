// Menu pause + sauvegarde : callbacks du menu (skin/export/import/nouvelle-partie/
// réglages), restauration des réglages sauvegardés, autosave et langue.
import { Menu } from "../ui/Menu.js";
import { i18n } from "./I18n.js";
import { DEFAULT_SPAWN } from "./SceneSetup.js";

const AUTOSAVE_INTERVAL_MS = 30000;

/**
 * @param {object} deps
 * @param {THREE.Camera} deps.camera
 * @param {import('../player/Camera.js').Camera} deps.cameraController
 * @param {import('../world/WorldManager.js').WorldManager} deps.worldManager
 * @param {import('../player/PlayerController.js').PlayerController} deps.playerController
 * @param {import('../player/Inventory.js').Inventory} deps.inventory
 * @param {import('../player/Health.js').Health} deps.health
 * @param {import('./GameMode.js').GameMode} deps.gameMode
 * @param {import('../world/ChunkManager.js').ChunkManager} deps.chunkManager
 * @param {import('../ui/InventoryUI.js').InventoryUI} deps.inventoryUI
 * @param {import('../world/BlockRegistry.js').BlockRegistry} deps.blockRegistry
 * @param {import('./SaveManager.js').SaveManager} deps.saveManager
 * @param {*} deps.existingSave
 * @param {ReturnType<import('../rendering/SunShadowTracker.js').createSunShadowTracker>} deps.sunShadowTracker
 * @param {(url: string, onLoad?: () => void, onError?: () => void) => void} deps.setSkin
 * @param {() => string} deps.modeLabel
 * @returns {{ menu: Menu }}
 */
export function createMenuAndSave({
  camera, cameraController, worldManager, playerController, inventory, health,
  gameMode, chunkManager, inventoryUI, blockRegistry, saveManager, existingSave,
  sunShadowTracker, setSkin, modeLabel,
}) {
  const { CW, CD } = sunShadowTracker;

  // Réglages (FOV, distance de rendu) : appliqués AVANT la construction du Menu, dont les
  // sliders lisent leur valeur une seule fois à la construction (pas de setter a posteriori).
  if (existingSave?.settings) {
    if (typeof existingSave.settings.fov === "number") {
      camera.fov = existingSave.settings.fov;
      camera.updateProjectionMatrix();
    }
    if (typeof existingSave.settings.renderDistance === "number") {
      const v = existingSave.settings.renderDistance;
      chunkManager.setViewDistance(Math.round(v * (CD / CW)), v);
      sunShadowTracker.configure();
    }
  }

  // Contexte courant pour bâtir un snapshot de sauvegarde (autosave, export, nouvelle partie).
  const snapshotCtx = () => ({
    worldManager, playerController, camera, inventory, health, gameMode, chunkManager,
    blockRegistry, seed: chunkManager.genOpts.seed,
  });

  // Menu pause : Échap l'ouvre (via unlock), "Reprendre" relock, input → skin API
  const menu = new Menu({
    onResume: () => cameraController.controls.lock(),
    onLoadSkin: (dataUrl) => {
      setSkin(
        dataUrl,
        () => menu.setStatus(i18n.t("skinLoaded")),
        () => menu.setStatus(i18n.t("skinInvalid")),
      );
    },
    modeLabel: modeLabel(),
    onToggleMode: () => {
      gameMode.toggle();
      menu.setModeLabel(modeLabel());
    },
    onExportSave: () => {
      saveManager.exportFile(saveManager.buildSnapshot(snapshotCtx()));
      menu.setStatus(i18n.t("saveExported"));
    },
    onImportSave: async (file) => {
      try {
        const data = await saveManager.importFile(file);
        saveManager.applySnapshot(data, {
          worldManager, playerController, camera, inventory, health, gameMode, blockRegistry,
        });
        const displayValues = {};
        if (typeof data.settings?.fov === "number") {
          camera.fov = data.settings.fov;
          camera.updateProjectionMatrix();
          displayValues.fov = data.settings.fov;
        }
        if (typeof data.settings?.renderDistance === "number") {
          const v = data.settings.renderDistance;
          chunkManager.setViewDistance(Math.round(v * (CD / CW)), v);
          sunShadowTracker.configure();
          displayValues.render = v;
        }
        menu.refreshSettings(displayValues);
        chunkManager.genOpts = { ...chunkManager.genOpts, seed: data.world.seed };
        // Les chunks déjà résidents ont été générés sous l'ancienne seed/ancien delta —
        // il faut forcer leur régénération complète sous les nouveaux.
        worldManager.clear();
        await saveManager.save(data);
        menu.setModeLabel(modeLabel());
        menu.setStatus(i18n.t("saveLoaded"));
      } catch (err) {
        console.warn("Import de sauvegarde échoué", err);
        menu.setStatus(i18n.t("invalidFile"));
      }
    },
    onNewGame: () => {
      if (!confirm(i18n.t("confirmNewGame"))) return;
      if (inventoryUI.isOpen()) inventoryUI.close();
      worldManager.clear();
      worldManager.edits.clear();
      chunkManager.genOpts = { ...chunkManager.genOpts, seed: Math.floor(Math.random() * 0xffffffff) };
      playerController.position.copy(DEFAULT_SPAWN);
      playerController.velocity.set(0, 0, 0);
      playerController._peakY = DEFAULT_SPAWN.y;
      camera.quaternion.identity();
      inventory.reset();
      health.reset();
      saveManager.save(saveManager.buildSnapshot(snapshotCtx()));
      menu.setStatus(i18n.t("newGameGenerated"));
    },
    settings: {
      fov: {
        labelKey: "fov",
        value: camera.fov,
        min: 30,
        max: 110,
        step: 1,
        onChange: (v) => {
          camera.fov = v;
          camera.updateProjectionMatrix();
        },
      },
      render: {
        labelKey: "renderDistance",
        value: chunkManager.viewDistanceZ,
        min: 2,
        max: 12,
        step: 1,
        onChange: (v) => {
          chunkManager.setViewDistance(Math.round(v * (CD / CW)), v);
          sunShadowTracker.configure();
        },
      },
    },
  });
  cameraController.controls.addEventListener("lock", () => menu.close());

  // Langue : le libellé du mode est géré par l'appelant (main.js), pas par Menu — il
  // faut donc le repousser explicitement à chaque changement. Met aussi à jour l'attribut
  // `lang` de la page (accessibilité) et le crédit en bas d'écran.
  const applyLanguage = () => {
    menu.setModeLabel(modeLabel());
    document.documentElement.lang = i18n.lang;
    const creditsLabel = document.getElementById("credits-label");
    if (creditsLabel) creditsLabel.textContent = i18n.t("developedBy");
  };
  i18n.onChange(applyLanguage);
  applyLanguage();

  // Autosave : intervalle fixe + tentative best-effort à la fermeture de l'onglet (non
  // garantie — IndexedDB est asynchrone — mais la fenêtre de perte reste bornée par l'intervalle).
  setInterval(() => saveManager.save(saveManager.buildSnapshot(snapshotCtx())), AUTOSAVE_INTERVAL_MS);
  window.addEventListener("beforeunload", () => {
    saveManager.save(saveManager.buildSnapshot(snapshotCtx()));
  });

  return { menu };
}
