import { openDB } from "idb";

const DB_NAME = "prismcraft-save";
const DB_VERSION = 1;
const STORE = "saves";
const AUTOSAVE_KEY = "autosave";
const SAVE_VERSION = 1;

// Sauvegarde unique (IndexedDB, via idb) + export/import via fichier .json. La sérialisation
// (buildSnapshot/applySnapshot) est pure et partagée par les deux chemins — aucune logique
// de champ dupliquée entre autosave et fichier.
export class SaveManager {
  constructor() {
    this._db = null;
    this._available = false;
  }

  /** Feature-detect + ouverture IndexedDB, ne lève jamais. Repli silencieux (autosave
   *  désactivé, export/import fichier restent utilisables) sur iframe sandboxée, navigation
   *  privée, etc. */
  async init() {
    if (typeof indexedDB === "undefined") {
      console.warn("SaveManager: IndexedDB indisponible — autosave désactivé.");
      return;
    }
    try {
      this._db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore(STORE);
        },
      });
      this._available = true;
    } catch (err) {
      console.warn("SaveManager: ouverture d'IndexedDB échouée — autosave désactivé.", err);
    }
  }

  async loadAutosave() {
    if (!this._available) return null;
    try {
      return (await this._db.get(STORE, AUTOSAVE_KEY)) ?? null;
    } catch (err) {
      console.warn("SaveManager: lecture échouée", err);
      return null;
    }
  }

  async save(snapshot) {
    if (!this._available) return false;
    try {
      await this._db.put(STORE, snapshot, AUTOSAVE_KEY);
      return true;
    } catch (err) {
      console.warn("SaveManager: écriture échouée (quota ? onglet fermé ?)", err);
      return false;
    }
  }

  /** Pur : objets de jeu vivants -> snapshot JSON-compatible. */
  buildSnapshot({
    worldManager, playerController, camera, inventory, health, gameMode, chunkManager,
    blockRegistry, seed,
  }) {
    return {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      world: { seed, edits: worldManager.edits.serialize(blockRegistry) },
      player: {
        position: {
          x: playerController.position.x,
          y: playerController.position.y,
          z: playerController.position.z,
        },
        quaternion: {
          x: camera.quaternion.x,
          y: camera.quaternion.y,
          z: camera.quaternion.z,
          w: camera.quaternion.w,
        },
      },
      inventory: inventory.serialize(blockRegistry),
      health: { current: health.current, max: health.max },
      gameMode: gameMode.mode,
      settings: { fov: camera.fov, renderDistance: chunkManager.viewDistanceZ },
    };
  }

  /** Pur : snapshot -> mutation des objets de jeu vivants. N'applique PAS `settings` —
   *  doit être fait par l'appelant avant la construction du Menu (voir main.js). */
  applySnapshot(snapshot, { worldManager, playerController, camera, inventory, health, gameMode, blockRegistry }) {
    if (!snapshot) return;
    worldManager.edits.load(snapshot.world.edits, blockRegistry);
    if (snapshot.player) {
      const { position: p, quaternion: q } = snapshot.player;
      playerController.position.set(p.x, p.y, p.z);
      camera.quaternion.set(q.x, q.y, q.z, q.w);
    }
    if (snapshot.inventory) inventory.load(snapshot.inventory, blockRegistry);
    if (snapshot.health) health.load(snapshot.health);
    if (snapshot.gameMode) gameMode.set(snapshot.gameMode);
  }

  exportFile(snapshot, filename = "prismcraft-save.json") {
    const blob = new Blob([JSON.stringify(snapshot)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Lit + parse un fichier .json. N'applique rien (appeler applySnapshot séparément). */
  async importFile(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || !data.world || !data.inventory) {
      throw new Error("Fichier de sauvegarde invalide");
    }
    return data;
  }
}
