// Source de vérité unique du mode de jeu. Persisté en localStorage, notifie via onChange.

export const Mode = Object.freeze({ CREATIVE: "creative", SURVIVAL: "survival" });

const STORAGE_KEY = "prismcraft.mode";

export class GameMode {
  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    this.mode = saved === Mode.CREATIVE ? Mode.CREATIVE : Mode.SURVIVAL; // survie par défaut
    this._listeners = new Set();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  isSurvival() {
    return this.mode === Mode.SURVIVAL;
  }

  set(mode) {
    if (mode !== Mode.CREATIVE && mode !== Mode.SURVIVAL) return;
    this.mode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    for (const fn of this._listeners) fn(this);
  }

  toggle() {
    this.set(this.isSurvival() ? Mode.CREATIVE : Mode.SURVIVAL);
  }
}
