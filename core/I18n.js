// Traductions FR/EN. Langue détectée depuis le navigateur au tout premier lancement
// (aucune préférence enregistrée), puis persistée en localStorage — même schéma que
// core/GameMode.js. Singleton exporté (comme core/InputManager.js) : accessible
// directement depuis n'importe quel module UI, pas besoin de le faire transiter par
// tous les constructeurs.

export const Lang = Object.freeze({ FR: "fr", EN: "en" });

const STORAGE_KEY = "prismcraft.lang";

const DICTS = {
  [Lang.FR]: {
    skinUpload: "Upload un skin",
    mode: "Mode",
    modeSurvival: "Mode : Survie",
    modeCreative: "Mode : Créatif",
    language: "Langue",
    settings: "Paramètres",
    resume: "Reprendre",
    exportSave: "Exporter la sauvegarde",
    importSave: "Importer une sauvegarde",
    newGame: "Nouvelle partie",
    back: "Retour",
    loading: "Chargement…",
    fileReadError: "Échec de lecture du fichier",
    skinLoaded: "Skin chargé",
    skinInvalid: "Échec (image invalide ?)",
    saveExported: "Sauvegarde exportée",
    saveLoaded: "Sauvegarde chargée",
    invalidFile: "Fichier invalide",
    confirmNewGame: "Commencer une nouvelle partie ? Le monde actuel sera perdu.",
    newGameGenerated: "Nouvelle partie générée",
    fov: "FOV",
    renderDistance: "Distance de rendu",
    invTabInventory: "Inventaire",
    invTabGive: "Give",
    debugChunksRendered: "Chunks affichés:",
    debugBlocksRendered: "Blocs rendus:",
    developedBy: "Développé par",
  },
  [Lang.EN]: {
    skinUpload: "Upload a skin",
    mode: "Mode",
    modeSurvival: "Mode: Survival",
    modeCreative: "Mode: Creative",
    language: "Language",
    settings: "Settings",
    resume: "Resume",
    exportSave: "Export save",
    importSave: "Import save",
    newGame: "New game",
    back: "Back",
    loading: "Loading…",
    fileReadError: "Failed to read file",
    skinLoaded: "Skin loaded",
    skinInvalid: "Failed (invalid image?)",
    saveExported: "Save exported",
    saveLoaded: "Save loaded",
    invalidFile: "Invalid file",
    confirmNewGame: "Start a new game? The current world will be lost.",
    newGameGenerated: "New game generated",
    fov: "FOV",
    renderDistance: "Render distance",
    invTabInventory: "Inventory",
    invTabGive: "Give",
    debugChunksRendered: "Chunks rendered:",
    debugBlocksRendered: "Blocks rendered:",
    developedBy: "Developed by",
  },
};

function detectBrowserLang() {
  const nav = (navigator.language || Lang.FR).toLowerCase();
  return nav.startsWith("en") ? Lang.EN : Lang.FR;
}

class I18n {
  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    this.lang = saved === Lang.EN || saved === Lang.FR ? saved : detectBrowserLang();
    this._listeners = new Set();
  }

  /** Traduit une clé dans la langue courante (repli FR puis la clé elle-même). */
  t(key) {
    return DICTS[this.lang]?.[key] ?? DICTS[Lang.FR][key] ?? key;
  }

  set(lang) {
    if (lang !== Lang.FR && lang !== Lang.EN) return;
    if (lang === this.lang) return;
    this.lang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    for (const fn of this._listeners) fn(this);
  }

  toggle() {
    this.set(this.lang === Lang.FR ? Lang.EN : Lang.FR);
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
}

export const i18n = new I18n();
