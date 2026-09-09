import { TriGrid, TRIANGLE_SIDE, TRIANGLE_HEIGHT } from "./TriGrid.js";
import { CHUNK_SIZE, chunkKey } from "./Chunk.js";
import { generateChunk } from "./WorldGen.js";

// Taille monde d'un chunk (rectangulaire : étroit en x, profond en z)
const CW = (CHUNK_SIZE * TRIANGLE_SIDE) / 2;
const CD = CHUNK_SIZE * TRIANGLE_HEIGHT;

// Distance² monde entre deux chunks distants de (dx, dz) chunks. Pour prioriser
// le proche sans sqrt (poids anisotrope : chunks étroits en x, profonds en z).
const sqDist = (dx, dz) => (dx * CW) ** 2 + (dz * CD) ** 2;

/**
 * Monde infini piloté par le joueur. View distances par axe (chunks rectangulaires).
 * Génération ET meshing budgétés/frame pour éviter les spikes.
 */
export class ChunkManager {
  constructor(worldManager, blockRegistry, opts = {}) {
    this.world = worldManager;
    this.registry = blockRegistry;

    const base = opts.viewDistance ?? 4;
    this._buffer = opts.buffer ?? 2;
    this.setViewDistance(opts.viewDistanceX ?? base, opts.viewDistanceZ ?? base);

    this.genBudget = opts.budget ?? 3; // chunks générés / frame
    this.meshBudget = opts.meshBudget ?? 2; // chunks meshés / frame (hors édits)
    this.genOpts = opts.genOpts ?? {};
  }

  setViewDistance(x, z) {
    this.viewDistanceX = Math.max(1, Math.round(x));
    this.viewDistanceZ = Math.max(1, Math.round(z));
    this.genX = this.viewDistanceX + this._buffer;
    this.genZ = this.viewDistanceZ + this._buffer;
    this.keepX = this.genX + 2;
    this.keepZ = this.genZ + 2;
  }

  _neighborsReady(cx, cz) {
    const c = this.world.chunks;
    return (
      c.has(chunkKey(cx - 1, cz)) &&
      c.has(chunkKey(cx + 1, cz)) &&
      c.has(chunkKey(cx, cz - 1)) &&
      c.has(chunkKey(cx, cz + 1))
    );
  }

  update(playerPos) {
    const g = TriGrid.worldToGrid(playerPos);
    const pcx = Math.floor(g.col / CHUNK_SIZE);
    const pcz = Math.floor(g.row / CHUNK_SIZE);
    let changed = false;

    // 1. Générer les données manquantes (rectangle genX × genZ), plus proches d'abord
    const missing = [];
    for (let dx = -this.genX; dx <= this.genX; dx++) {
      for (let dz = -this.genZ; dz <= this.genZ; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (!this.world.chunks.has(chunkKey(cx, cz))) {
          missing.push({ cx, cz, d: sqDist(dx, dz) });
        }
      }
    }
    missing.sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(this.genBudget, missing.length); i++) {
      const { cx, cz } = missing[i];
      const cells = generateChunk(cx, cz, this.registry, this.genOpts);
      const edits = this.world.edits.getChunkEdits(cx, cz);
      for (const b of cells) {
        // Sauté si une édition couvre cette case (ajoutée ou supprimée) — rejouée ci-dessous.
        if (edits && edits.has(`${b.col},${b.row},${b.height}`)) continue;
        this.world._set(b.col, b.row, b.height, b.blockId);
      }
      if (edits) {
        for (const e of edits.values()) {
          if (e.blockId != null) this.world._set(e.col, e.row, e.height, e.blockId, e.half);
        }
      }
      this.world._chunk(cx * CHUNK_SIZE, cz * CHUNK_SIZE, true);
    }

    // 2. Meshing : édits (dirty) immédiats, nouveaux chunks budgétés
    const toMesh = [];
    for (let dx = -this.viewDistanceX; dx <= this.viewDistanceX; dx++) {
      for (let dz = -this.viewDistanceZ; dz <= this.viewDistanceZ; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const ch = this.world.chunks.get(chunkKey(cx, cz));
        if (!ch || !this._neighborsReady(cx, cz)) continue;
        if (ch.dirty) {
          this.world.meshChunk(ch);
          changed = true;
        } else if (!ch.meshed) {
          toMesh.push({ ch, d: sqDist(dx, dz) });
        }
      }
    }
    toMesh.sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(this.meshBudget, toMesh.length); i++) {
      this.world.meshChunk(toMesh[i].ch);
      changed = true;
    }

    // 3. Démesher (hors vue) et 4. décharger (hors keep)
    const toRemove = [];
    for (const ch of this.world.chunks.values()) {
      const adx = Math.abs(ch.cx - pcx);
      const adz = Math.abs(ch.cz - pcz);
      if (adx > this.keepX || adz > this.keepZ) {
        if (ch.meshed) changed = true;
        toRemove.push(ch);
      } else if (ch.meshed && (adx > this.viewDistanceX || adz > this.viewDistanceZ)) {
        this.world.unmeshChunk(ch);
        changed = true;
      }
    }
    for (const ch of toRemove) this.world.removeChunk(ch);

    return changed;
  }
}
