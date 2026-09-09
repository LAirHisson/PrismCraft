export const CHUNK_SIZE = 16;

/** Clé d'un chunk depuis ses coordonnées chunk (cx, cz). */
export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

/** Clé du chunk contenant la case (col, row). */
export function chunkKeyFor(col, row) {
  return chunkKey(Math.floor(col / CHUNK_SIZE), Math.floor(row / CHUNK_SIZE));
}

/** Un chunk = données (blocs) + meshes fusionnés + flags de cycle de vie. */
export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);
    /** @type {Map<string, {blockId,col,row,height}>} */
    this.blocks = new Map();
    this.dirty = false;   // meshes périmés (édition) → à re-mesher
    this.meshed = false;  // a des meshes dans la scène (chargé)
    /** @type {THREE.Mesh[]} */
    this.meshes = [];
    /** @type {Array<{mesh, faceMeta}>} */
    this.entries = [];
  }
}
