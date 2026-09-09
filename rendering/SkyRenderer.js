/**
 * Gestionnaire du ciel et du soleil.
 * Crée une dôme céleste et un soleil visuel.
 */

import * as THREE from 'three';

export class SkyRenderer {
  /**
   * @param {THREE.Scene} scene - Scène Three.js
   */
  constructor(scene) {
    this.scene = scene;

    /**
     * Groupe contenant le dôme et le soleil
     * @type {THREE.Group}
     */
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);

    /**
     * Mesh du dôme céleste
     * @type {THREE.Mesh}
     */
    this.skyDome = null;

    /**
     * Sprite du soleil
     * @type {THREE.Sprite}
     */
    this.sunSprite = null;

    /**
     * Position du soleil (pour synchroniser la lumière)
     * @type {THREE.Vector3}
     */
    this.sunPosition = new THREE.Vector3(50, 50, -0);

    this._createSkyDome();
    this._createSun();
  }

  /**
   * Crée le dôme du ciel avec gradient.
   * @private
   */
  _createSkyDome() {
    // Sphère retournée (rayon large)
    const geometry = new THREE.SphereGeometry(300, 32, 32);

    // Créer un canvas pour un gradient ciel bleu
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Gradient ciel bleu (haut) → bleu clair (bas)
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1a7fd9');   // Bleu foncé en haut
    gradient.addColorStop(0.5, '#87ceeb'); // Bleu ciel au milieu
    gradient.addColorStop(1, '#e0f6ff');   // Bleu très clair en bas

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Texture depuis le canvas
    const texture = new THREE.CanvasTexture(canvas);

    // Matériau du dôme (retourné et sans ombres)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide, // Retourné pour être vu de l'intérieur
    });

    this.skyDome = new THREE.Mesh(geometry, material);
    this.skyGroup.add(this.skyDome);
  }

  /**
   * Crée le sprite du soleil avec texture.
   * @private
   */
  _createSun() {
    // Charger la texture du soleil ou créer une simple sphère dorée
    const textureLoader = new THREE.TextureLoader();

    // Essayer de charger la texture du soleil
    let sunMaterial;
    try {
      const sunTexture = textureLoader.load('assets/sun.png', undefined, undefined, () => {
        // En cas d'erreur, créer un matériau simple
        sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
        this.sunSprite = new THREE.Mesh(
          new THREE.SphereGeometry(5, 16, 16),
          sunMaterial
        );
        this.sunSprite.position.copy(this.sunPosition);
        this.skyGroup.add(this.sunSprite);
      });

      // Si la texture se charge bien, utiliser un Sprite
      sunMaterial = new THREE.SpriteMaterial({
        map: sunTexture,
        transparent: true,
        depthWrite: false,
      });

      this.sunSprite = new THREE.Sprite(sunMaterial);
      this.sunSprite.scale.set(15, 15, 1);
      this.sunSprite.position.copy(this.sunPosition);
      this.skyGroup.add(this.sunSprite);
    } catch (_) {
      // Fallback: créer une petite sphère dorée
      sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
      this.sunSprite = new THREE.Mesh(
        new THREE.SphereGeometry(5, 16, 16),
        sunMaterial
      );
      this.sunSprite.position.copy(this.sunPosition);
      this.skyGroup.add(this.sunSprite);
    }
  }

  /**
   * Recentre le dôme + soleil sur une position (la caméra) — le ciel doit toujours
   * paraître à la même distance/direction du joueur, jamais fixe dans le monde
   * (sinon on finit par sortir du dôme en s'éloignant de l'origine).
   * @param {THREE.Vector3} position
   */
  updatePosition(position) {
    this.skyGroup.position.copy(position);
  }

  /**
   * Retourne la position du soleil (utile pour synchroniser l'éclairage).
   * @returns {THREE.Vector3}
   */
  getSunPosition() {
    return this.sunPosition.clone();
  }

  /**
   * Change la position du soleil.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setSunPosition(x, y, z) {
    this.sunPosition.set(x, y, z);
    if (this.sunSprite) {
      this.sunSprite.position.copy(this.sunPosition);
    }
  }
}
