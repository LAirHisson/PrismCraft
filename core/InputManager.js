/**
 * Gestionnaire d'entrées centralisé (clavier + souris).
 * Expose l'état des touches comme un dictionnaire live.
 */

class InputManager {
  constructor() {
    /**
     * Map des touches actuellement enfoncées.
     * @type {Map<string, boolean>}
     */
    this.keys = new Map();

    /**
     * Compteur de clics au pointerlock.
     * @type {number}
     */
    this.clickCount = 0;

    /**
     * Position de la souris (pour ciblage futur).
     * @type {{ x: number, y: number }}
     */
    this.mousePos = { x: 0, y: 0 };

    this._setupListeners();
  }

  /**
   * Attacher les écouteurs d'événements.
   * @private
   */
  _setupListeners() {
    // Clavier
    window.addEventListener('keydown', (e) => {
      this.keys.set(e.code, true);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.set(e.code, false);
    });

    // Souris
    document.addEventListener('mousemove', (e) => {
      this.mousePos.x = e.clientX;
      this.mousePos.y = e.clientY;
    });

    document.addEventListener('click', () => {
      this.clickCount++;
    });
  }

  /**
   * Vérifie si une touche est enfoncée.
   * @param {string} code - Code de la touche (ex. 'KeyW', 'Space')
   * @returns {boolean}
   */
  isKeyPressed(code) {
    return this.keys.get(code) ?? false;
  }

  /**
   * Réinitialise le compteur de clics pour détection d'événement.
   */
  resetClickCount() {
    this.clickCount = 0;
  }

  /**
   * Retourne vrai si un clic s'est produit depuis le dernier reset.
   * @returns {boolean}
   */
  wasClicked() {
    return this.clickCount > 0;
  }
}

export const inputManager = new InputManager();