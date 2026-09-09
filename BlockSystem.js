/**
 * Point d'entrée du système de blocs.
 * Charge le registre et les matériaux au démarrage du jeu.
 */

import { loadBlockRegistry } from './world/BlockRegistry.js';
import { loadPrismMaterials } from './rendering/PrismMaterial.js';

/**
 * Initialise tout le système de blocs.
 * À appeler au démarrage du jeu.
 *
 * @returns {Promise<{blockRegistry: BlockRegistry, materials: Map<number, THREE.MeshStandardMaterial>}>}
 */
export async function initializeBlockSystem() {
  console.log('[BlockSystem] Initialisation du système de blocs...');

  try {
    const blockRegistry = await loadBlockRegistry();
    console.log(`  ✓ BlockRegistry chargé : ${blockRegistry.getBlockCount()} blocs`);

    const materials = await loadPrismMaterials(blockRegistry);
    console.log(`  ✓ ${materials.size} matériaux chargés`);

    for (const blockId of blockRegistry.getAllBlockIds()) {
      const name = blockRegistry.getName(blockId);
      const resistance = blockRegistry.getResistance(blockId);
      const mineTime = blockRegistry.getMineTime(blockId);
      console.log(
        `  [${blockId}] ${name.padEnd(10)} | Résistance: ${resistance.toFixed(1)} | Mine: ${mineTime.toFixed(2)}s`
      );
    }

    console.log('✓ Système de blocs prêt !');
    return { blockRegistry, materials };
  } catch (err) {
    console.error('[BlockSystem] ✗ Erreur lors de l\'initialisation :', err);
    throw err;
  }
}
