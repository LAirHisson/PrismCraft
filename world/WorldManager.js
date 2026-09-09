import { buildChunkMeshes } from "../rendering/ChunkMesher.js";
import { TriGrid } from "./TriGrid.js";
import { Chunk, chunkKeyFor, CHUNK_SIZE } from "./Chunk.js";
import { EditLog } from "./EditLog.js";

export class WorldManager {
  constructor(scene, materials, blockRegistry) {
    this.scene = scene;
    this.materials = materials;
    this.blockRegistry = blockRegistry;
    /** @type {Map<string, Chunk>} */
    this.chunks = new Map();
    /** Delta des modifications joueur, survit au déchargement/rechargement d'un chunk. */
    this.edits = new EditLog();
  }

  _key(col, row, height) {
    return `${col},${row},${height}`;
  }

  _chunk(col, row, create = false) {
    const k = chunkKeyFor(col, row);
    let ch = this.chunks.get(k);
    if (!ch && create) {
      ch = new Chunk(Math.floor(col / CHUNK_SIZE), Math.floor(row / CHUNK_SIZE));
      this.chunks.set(k, ch);
    }
    return ch;
  }

  /** Accès global (route vers le bon chunk) — utilisé pour le culling et la collision. */
  getBlock(col, row, height) {
    const ch = this._chunk(col, row);
    return ch ? ch.blocks.get(this._key(col, row, height)) : undefined;
  }

  hasBlock(col, row, height) {
    return this.getBlock(col, row, height) !== undefined;
  }

  /** Écrit un bloc dans les données (sans re-mesher) — pour le chargement en masse. */
  _set(col, row, height, blockId = 0, half) {
    const ch = this._chunk(col, row, true);
    ch.blocks.set(this._key(col, row, height), { blockId, col, row, height, half });
  }

  // Marque dirty le chunk de la case + ceux de ses voisins d'arête
  // (leurs faces de bord dépendent de cette case).
  _markDirty(col, row) {
    const mark = (c, r) => {
      const ch = this.chunks.get(chunkKeyFor(c, r));
      if (ch) ch.dirty = true;
    };
    mark(col, row);
    for (const nb of TriGrid.getNeighbors(col, row)) mark(nb.col, nb.row);
  }

  addBlock(col, row, height, blockId = 0, half) {
    this._set(col, row, height, blockId, half);
    this.edits.recordAdd(col, row, height, blockId, half);
    this._markDirty(col, row);
  }

  removeBlock(col, row, height) {
    const ch = this._chunk(col, row);
    if (ch) ch.blocks.delete(this._key(col, row, height));
    this.edits.recordRemove(col, row, height);
    this._markDirty(col, row);
  }

  /** Casse la plante posée juste au-dessus (support retiré). Retourne le bloc plante ou null. */
  removePlantAbove(col, row, height) {
    const above = this.getBlock(col, row, height + 1);
    if (above && this.blockRegistry.getShape(above.blockId) === "plant") {
      this.removeBlock(col, row, height + 1);
      return above;
    }
    return null;
  }

  /**
   * Fait tomber la colonne de blocs à gravité (sable/gravier) posée juste au-dessus
   * d'un support retiré, jusqu'au premier bloc en dessous (ou couche 0).
   */
  settleGravityAbove(col, row, height) {
    const falling = [];
    let h = height + 1;
    for (;;) {
      const b = this.getBlock(col, row, h);
      if (!b || !this.blockRegistry.hasGravity(b.blockId)) break;
      falling.push(b.blockId);
      this.removeBlock(col, row, h);
      h++;
    }
    if (falling.length === 0) return;

    let rest = height; // case du support (désormais vide)
    while (rest > 0 && !this.hasBlock(col, row, rest - 1)) rest--;
    for (let i = 0; i < falling.length; i++) {
      this.addBlock(col, row, rest + i, falling[i]);
    }
  }

  /** (Re)construit les meshes d'un chunk et les ajoute à la scène. */
  meshChunk(ch) {
    this._disposeChunkMeshes(ch);
    // Origine locale du chunk (voir le commentaire dans ChunkMesher.buildChunkMeshes) —
    // n'importe quel point fixe dans le chunk convient, celui-ci est simple à calculer.
    const origin = TriGrid.gridToWorld(ch.cx * CHUNK_SIZE, ch.cz * CHUNK_SIZE, 0);
    const result = buildChunkMeshes(
      ch.blocks.values(),
      (c, r, h) => this.getBlock(c, r, h),
      this.blockRegistry,
      this.materials,
      origin,
    );
    for (const entry of result) {
      this.scene.add(entry.mesh);
      ch.meshes.push(entry.mesh);
      ch.entries.push(entry);
    }
    ch.meshed = true;
    ch.dirty = false;
  }

  /** Retire les meshes d'un chunk de la scène (garde les données). */
  unmeshChunk(ch) {
    this._disposeChunkMeshes(ch);
    ch.meshed = false;
  }

  /** Décharge complètement un chunk (meshes + données). */
  removeChunk(ch) {
    this._disposeChunkMeshes(ch);
    this.chunks.delete(ch.key);
  }

  _disposeChunkMeshes(ch) {
    for (const mesh of ch.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    ch.meshes = [];
    ch.entries = [];
  }

  /** Mesh TOUS les chunks (utilisé sans ChunkManager, ex. banc d'essai). */
  rebuild() {
    for (const ch of this.chunks.values()) this.meshChunk(ch);
  }

  clear() {
    for (const ch of this.chunks.values()) this._disposeChunkMeshes(ch);
    this.chunks.clear();
  }

  getBlocksArray() {
    const all = [];
    for (const ch of this.chunks.values()) {
      for (const b of ch.blocks.values()) all.push(b);
    }
    return all;
  }

  getMeshEntries() {
    const entries = [];
    for (const ch of this.chunks.values()) {
      for (const e of ch.entries) entries.push(e);
    }
    return entries;
  }
}
