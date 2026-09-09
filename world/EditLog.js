import { chunkKey, chunkKeyFor } from "./Chunk.js";

// Delta des modifications joueur, indépendant du cycle de vie des chunks (qui sont
// déchargés puis régénérés à l'identique depuis la seed). Indexé par chunk pour un
// rejeu O(1) à la génération, plutôt que de scanner tout le journal à chaque chunk.
// blockId: null = case explicitement vidée par le joueur (id 0 est "Stone", un vrai
// bloc — pas un sentinel "air" ; l'absence de clé, elle, veut dire "jamais touché").
export class EditLog {
  constructor() {
    /** @type {Map<string, Map<string, {col,row,height,blockId:number|null,half}>>} */
    this.byChunk = new Map();
  }

  _inner(col, row, create = false) {
    const k = chunkKeyFor(col, row);
    let m = this.byChunk.get(k);
    if (!m && create) {
      m = new Map();
      this.byChunk.set(k, m);
    }
    return m;
  }

  recordAdd(col, row, height, blockId, half) {
    this._inner(col, row, true).set(`${col},${row},${height}`, { col, row, height, blockId, half });
  }

  recordRemove(col, row, height) {
    this._inner(col, row, true).set(`${col},${row},${height}`, {
      col, row, height, blockId: null, half: undefined,
    });
  }

  /** Éditions du chunk (cx, cz), ou undefined si aucune. Utilisé par ChunkManager. */
  getChunkEdits(cx, cz) {
    return this.byChunk.get(chunkKey(cx, cz));
  }

  serialize(blockRegistry) {
    const out = [];
    for (const inner of this.byChunk.values()) {
      for (const e of inner.values()) {
        out.push({
          col: e.col,
          row: e.row,
          height: e.height,
          block: e.blockId == null ? null : blockRegistry.getName(e.blockId),
          half: e.half,
        });
      }
    }
    return out;
  }

  load(list, blockRegistry) {
    this.byChunk.clear();
    for (const e of list) {
      if (e.block == null) {
        this.recordRemove(e.col, e.row, e.height);
        continue;
      }
      const blockId = blockRegistry.getIdByName(e.block);
      if (blockId === undefined) {
        console.warn(`EditLog.load: bloc inconnu "${e.block}" à (${e.col},${e.row},${e.height}) — ignoré`);
        continue;
      }
      this.recordAdd(e.col, e.row, e.height, blockId, e.half);
    }
  }

  clear() {
    this.byChunk.clear();
  }
}
