/**
 * Gestion de la caméra et du PointerLockControls.
 * Inclut la gestion du resize et l'intégration avec le renderer.
 */

import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class Camera {
  /**
   * @param {THREE.PerspectiveCamera} camera - Caméra Three.js
   * @param {THREE.WebGLRenderer} renderer - Renderer Three.js
   * @param {HTMLElement} domElement - Élément DOM cible pour le canvas
   */
  constructor(camera, renderer, domElement) {
    this.camera = camera;
    this.renderer = renderer;
    this.domElement = domElement;

    /**
     * Contrôles PointerLock
     * @type {PointerLockControls}
     */
    this.controls = new PointerLockControls(camera, domElement);

    /**
     * Vitesse de rotation (radian/pixel)
     * @type {number}
     */
    this.rotationSpeed = 0.003;

    this._setupPointerLock();
    this._setupResize();
  }

  /**
   * Configure le verrouillage du pointeur sur clic.
   * @private
   */
  _setupPointerLock() {
    this.domElement.addEventListener('click', () => {
      this.controls.lock();
    });
  }

  /**
   * Configure l'écoute du redimensionnement de la fenêtre.
   * @private
   */
  _setupResize() {
    window.addEventListener('resize', () => this._onWindowResize());
  }

  /**
   * Gère le redimensionnement de la fenêtre.
   * @private
   */
  _onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Mettre à jour aspect et projectionMatrix de la caméra
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Redimensionner le renderer
    this.renderer.setSize(width, height);
  }

  /**
   * Retourne true si le PointerLock est actif.
   * @returns {boolean}
   */
  isLocked() {
    return this.controls.isLocked;
  }

  /**
   * Met à jour la rotation de la caméra d'après les mouvements de souris
   * (déjà géré par PointerLockControls, mais fonction publique pour clarté).
   */
  update() {
    // PointerLockControls gère automatiquement la rotation via le movement event
    // Cette fonction est ici pour cohérence avec les autres systèmes de mise à jour
  }
}
