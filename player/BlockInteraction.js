import * as THREE from "three";
import { TriGrid, BLOCK_HEIGHT } from "../world/TriGrid.js";

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function setupBlockInteraction({
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
  openCraftingTable,
}) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // TEMP (authoring de structures) : origine relative = 1er bloc placé.
  // Touche B pour ré-ancrer (poser d'abord le bloc de base de la structure).
  let anchor = null;
  document.addEventListener("keydown", (e) => {
    if (e.code === "KeyB") {
      anchor = null;
      console.log("[STRUCT] ancre réinitialisée — le prochain bloc placé sera l'origine");
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (!cameraController.isLocked()) return;

    const result = raycaster.castRay(
      renderOrigin.toScene(playerController.getEyePosition(_eye), _eye),
      camera.getWorldDirection(_dir),
      worldManager.getMeshEntries(),
    );
    if (!result.hit) return;
    // Reconverti en vraie coordonnée monde : le reste de cette fonction (détection
    // de moitié de slab visée) compare result.point à des hauteurs de grille réelles.
    if (result.point) renderOrigin.toTrue(result.point, result.point);

    const { block, adjacentCell } = result;

    if (e.button === 0) {
      // Survie : le cassage progressif est géré par le MiningController.
      if (gameMode?.isSurvival()) return;
      const existing = worldManager.getBlock(block.col, block.row, block.height);
      if (existing && sound) {
        sound.playBlock(
          "break",
          blockRegistry.getSoundType(existing.blockId),
          TriGrid.gridToWorld(block.col, block.row, block.height),
        );
      }
      worldManager.removeBlock(block.col, block.row, block.height);
      // Plante posée dessus : elle tombe aussi (support retiré).
      const plant = worldManager.removePlantAbove(block.col, block.row, block.height);
      if (plant && sound) {
        sound.playBlock(
          "break",
          blockRegistry.getSoundType(plant.blockId),
          TriGrid.gridToWorld(plant.col, plant.row, plant.height),
        );
      }
      // Sable/gravier au-dessus : la colonne retombe.
      worldManager.settleGravityAbove(block.col, block.row, block.height);
      highlight.hide();
    } else if (e.button === 2) {
      // Clic droit sur un bloc "interactif" (ex. crafting table) → ouvre sa grille.
      const target = worldManager.getBlock(block.col, block.row, block.height);
      const gridSize = target ? blockRegistry.getCraftingGrid(target.blockId) : 0;
      if (gridSize > 0) {
        openCraftingTable?.(gridSize);
        return;
      }

      const blockId = inventory.selectedBlockId;

      // Double slab : viser la moitié vide d'un slab identique déjà posé → bloc plein.
      if (
        blockId !== null &&
        target &&
        target.blockId === blockId &&
        blockRegistry.getShape(blockId) === "slab" &&
        result.point
      ) {
        const aimTop = result.point.y - block.height * BLOCK_HEIGHT >= BLOCK_HEIGHT / 2;
        const fullId = blockRegistry.getFullBlock(blockId);
        if (fullId !== null && aimTop !== (target.half === "top")) {
          worldManager.addBlock(block.col, block.row, block.height, fullId);
          sound?.playBlock(
            "break",
            blockRegistry.getSoundType(fullId),
            TriGrid.gridToWorld(block.col, block.row, block.height),
          );
          if (gameMode?.isSurvival()) inventory.removeOne(inventory.selectedHotbarSlot);
          return;
        }
      }

      if (
        blockId !== null &&
        adjacentCell &&
        !worldManager.hasBlock(
          adjacentCell.col,
          adjacentCell.row,
          adjacentCell.height,
        ) &&
        !playerController.intersectsBlock(
          adjacentCell.col,
          adjacentCell.row,
          adjacentCell.height,
        )
      ) {
        // Slab : moitié haute si on vise le haut de la case cible, sinon moitié basse.
        let half;
        if (blockRegistry.getShape(blockId) === "slab") {
          const baseY = adjacentCell.height * BLOCK_HEIGHT;
          half = result.point && result.point.y - baseY >= BLOCK_HEIGHT / 2 ? "top" : "bottom";
        }

        // Gravité : le sable/gravier tombe jusqu'au premier bloc en dessous (sauf couche 0).
        let placeHeight = adjacentCell.height;
        if (blockRegistry.hasGravity(blockId)) {
          while (
            placeHeight > 0 &&
            !worldManager.hasBlock(adjacentCell.col, adjacentCell.row, placeHeight - 1)
          ) {
            placeHeight--;
          }
        }

        worldManager.addBlock(
          adjacentCell.col,
          adjacentCell.row,
          placeHeight,
          blockId,
          half,
        );

        sound?.playBlock(
          "break",
          blockRegistry.getSoundType(blockId),
          TriGrid.gridToWorld(adjacentCell.col, adjacentCell.row, placeHeight),
        );

        // Survie : consommer une unité du stack en main
        if (gameMode?.isSurvival()) {
          inventory.removeOne(inventory.selectedHotbarSlot);
        }

        // TEMP : log pour reconstruire une structure (coords abs + relatives à l'ancre)
        if (!anchor) anchor = { ...adjacentCell };
        const orient = TriGrid.getOrientation(adjacentCell.col, adjacentCell.row);
        console.log(
          `[STRUCT] abs(col=${adjacentCell.col}, row=${adjacentCell.row}, h=${adjacentCell.height}) ` +
            `rel(dcol=${adjacentCell.col - anchor.col}, drow=${adjacentCell.row - anchor.row}, dh=${adjacentCell.height - anchor.height}) ` +
            `blockId=${blockId} ${orient}`,
        );
      }
    }
  });
}
