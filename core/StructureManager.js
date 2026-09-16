import * as nbt from 'nbt';
import { TriGrid } from '../world/TriGrid.js';

// On décide quel bloc utiliser (le nom le plus proche)
function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export class StructureManager {
  constructor(blockRegistry, chat) {
    this.blockRegistry = blockRegistry;
    this.chat = chat;
    this.structures = new Map();
  }

  getClosestBlockId(mcName) {
    // RÈGLE SPÉCIALE : on ignore l'air sous toutes ses formes (minecraft:air, cave_air, etc.)
    if (mcName.toLowerCase().includes("air")) {
      return null;
    }

    let bestId = null;
    let minDistance = Infinity;
    // Nettoie le nom (ex: "minecraft:oak_log" -> "oak log")
    const cleanMcName = mcName.replace("minecraft:", "").replace(/_/g, " ").toLowerCase();

    for (const id of this.blockRegistry.getAllBlockIds()) {
      const pcName = this.blockRegistry.getName(id).toLowerCase();
      const dist = levenshtein(cleanMcName, pcName);
      if (dist < minDistance) {
        minDistance = dist;
        bestId = id;
      }
    }
    return bestId;
  }

  // Ouvre une fenêtre pour charger le fichier et gère la décompression
  promptLoad(name) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".nbt";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        let arrayBuffer;
        
        // 1. On essaie de décompresser le fichier nbt
        try {
          const ds = new DecompressionStream("gzip");
          const decompressedStream = file.stream().pipeThrough(ds);
          const blob = await new Response(decompressedStream).blob();
          arrayBuffer = await blob.arrayBuffer();
        } catch (_gzipErr) {
          // 2. Si ça rate, c'est que le fichier n'était pas compressé, on le lit normalement
          arrayBuffer = await file.arrayBuffer();
        }

        nbt.parse(arrayBuffer, (error, data) => {
          if (error) {
            console.error("Erreur du parseur NBT :", error);
            this.chat.addMessage("Erreur : Impossible de décoder ce fichier NBT.", "#ff5555");
            return;
          }
          this._parseStructure(name, data);
        });

      } catch (err) {
        console.error("Erreur de chargement :", err);
        this.chat.addMessage("Erreur de lecture du fichier.", "#ff5555");
      }
    };
    input.click();
  }

  _parseStructure(name, nbtData) {
    try {
      const root = nbtData.value;
      const blocks = root.blocks.value.value;
      const palette = root.palette.value.value;

      // Associer la palette MC aux blocs PrismCraft
      const pcPalette = palette.map(p => this.getClosestBlockId(p.Name.value));

      const structure = [];
      for (const b of blocks) {
        const pos = b.pos.value.value; // [x, y, z]
        const state = b.state.value;
        const pcId = pcPalette[state];
        if (pcId !== null && pcId !== undefined) {
          structure.push({ x: pos[0], y: pos[1], z: pos[2], pcBlockId: pcId });
        }
      }

      this.structures.set(name, structure);
      this.chat.addMessage(`Structure '${name}' chargée en mémoire !`, "#55ff55");
    } catch (err) {
      this.chat.addMessage("Format NBT invalide ou incompatible.", "#ff5555");
      console.error(err);
    }
  }

  place(name, playerController, worldManager) {
    const structure = this.structures.get(name);
    if (!structure) throw new Error("Structure introuvable.");

    // Direction pour la rotation
    const fwd = playerController.getForward(); //[cite: 1]
    const isFacingX = Math.abs(fwd.x) > Math.abs(fwd.z);
    const signX = Math.sign(fwd.x);
    const signZ = Math.sign(fwd.z);

    // Origine : position du joueur convertie en grille PrismCraft
    const origin = TriGrid.worldToGrid(playerController.position); //[cite: 1]

    for (const block of structure) {
      // Rotation basique à 90°
      let rotX = isFacingX ? block.x * signX : block.z * signX;
      let rotZ = isFacingX ? block.z * signZ : block.x * signZ;

      // Déformation 2x = 1z pour compenser la grille triangulaire
      const baseCol = origin.col + Math.round(rotX * 2);
      const row = origin.row + Math.round(rotZ);
      const height = Math.max(0, origin.height + block.y);

      // On place DEUX triangles côte à côte pour former l'équivalent d'un cube plein
      worldManager.addBlock(baseCol, row, height, block.pcBlockId); //[cite: 1]
      worldManager.addBlock(baseCol + 1, row, height, block.pcBlockId); //[cite: 1]
    }
  }
}