import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();

function configureTex(t) {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // convention UV du GLTF
  return t;
}

// Normalise en carré : un skin 64x32 devient 64x64 avec le bas transparent.
function makeSquareTexture(img) {
  let source = img;
  if (img.height !== img.width) {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.width;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0); // haut = skin, bas = vide
    source = c;
  }
  const t = new THREE.Texture(source);
  t.needsUpdate = true;
  return configureTex(t);
}

// Charge un skin (URL locale — data: ou blob:) et le normalise en texture carrée.
function loadSkin(url, onLoad, onError) {
  const img = new Image();
  img.onload = () => onLoad(makeSquareTexture(img));
  img.onerror = (e) => onError?.(e);
  img.src = url;
}

function subClip(clip, predicate, suffix) {
  return new THREE.AnimationClip(
    clip.name + suffix,
    clip.duration,
    clip.tracks.filter(predicate),
  );
}

// walk scindé corps/bras droit → swing (bras droit) domine ce bras seul.
class PlayerAnimator {
  constructor(model, clips = []) {
    this.mixer = new THREE.AnimationMixer(model);
    const byName = {};
    for (const c of clips) byName[c.name] = c;

    const isRArm = (t) => t.name.startsWith("RightArm");

    // walk scindé : corps (jambes + bras gauche) | bras droit (masquable)
    this.walkMain = null;
    this.walkRArm = null;
    if (byName.walk) {
      this.walkMain = this.mixer.clipAction(subClip(byName.walk, (t) => !isRArm(t), "_main"));
      this.walkRArm = this.mixer.clipAction(subClip(byName.walk, isRArm, "_rarm"));
      for (const a of [this.walkMain, this.walkRArm]) {
        a.play();
        a.setEffectiveWeight(0);
      }
    }
    this._walkW = 0;

    // swing (bras droit uniquement) — one-shot
    this.swing = byName.swing ? this.mixer.clipAction(byName.swing) : null;
    if (this.swing) {
      this.swing.setLoop(THREE.LoopOnce, 1);
      this.swing.clampWhenFinished = false;
    }
    this._swinging = false;
    this._swingHold = false; // relance le swing en boucle (minage en cours)
    this._swingW = 0;
    this.mixer.addEventListener("finished", (e) => {
      if (this.swing && e.action === this.swing) {
        if (this._swingHold) {
          this.swing.reset();
          this.swing.play();
        } else {
          this._swinging = false;
        }
      }
    });

    // Os animés + rotation de repos (pour revenir au bind quand aucune action)
    this._bones = ["LeftLeg", "RightLeg", "LeftArm", "RightArm"]
      .map((n) => model.getObjectByName(n))
      .filter(Boolean);
    this._bind = this._bones.map((b) => b.rotation.clone());
  }

  /** Rejoue le swing depuis le début. */
  playSwing() {
    if (!this.swing) return;
    this.swing.reset();
    this.swing.play();
    this._swinging = true;
  }

  /** Active/désactive la boucle de swing (minage maintenu). */
  holdSwing(active) {
    this._swingHold = active;
    if (active && !this._swinging) this.playSwing();
  }

  update(dt, state = {}) {
    this._walkW += ((state.moving ? 1 : 0) - this._walkW) * Math.min(1, dt * 10);
    this._swingW += ((this._swinging ? 1 : 0) - this._swingW) * Math.min(1, dt * 18);
    if (!this._swinging && this._swingW < 0.001 && this.swing) this.swing.stop();

    const armWalk = state.firstPerson ? 0 : this._walkW;
    if (this.walkMain) this.walkMain.setEffectiveWeight(this._walkW);
    if (this.walkRArm) this.walkRArm.setEffectiveWeight(armWalk * (1 - this._swingW));
    if (this.swing) this.swing.setEffectiveWeight(this._swingW);

    // Repos : les os sans action active restent au bind (pas de gel mi-pas)
    for (let i = 0; i < this._bones.length; i++) {
      this._bones[i].rotation.copy(this._bind[i]);
    }
    this.mixer.update(dt);
  }
}

/**
 * Charge le modèle joueur (GLTF autonome : géométrie + texture + clips).
 * @returns {Promise<{ model: THREE.Group, animator: PlayerAnimator }>}
 */
export function loadPlayerModel() {
  return new Promise((resolve, reject) => {
    loader.load(
      "assets/models/PrismoSteve.gltf",
      (gltf) => {
        const model = gltf.scene;
        const applyTexture = (t) => {
          model.traverse((o) => {
            if (o.isMesh && o.material) {
              o.material.map = t;
              o.material.needsUpdate = true;
            }
          });
        };
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = false; // pas d'auto-ombrage (évite les stries sur joueur/main)
          }
        });
        // "Dernier demandé gagne" : un skin qui finit de charger n'est appliqué que si
        // aucune demande plus récente n'a eu lieu entre-temps (évite que le skin par
        // défaut, chargé au démarrage, n'écrase le ?skin arrivé plus tôt).
        let skinGen = 0;
        const applyLatest = (url, onLoad, onError) => {
          const gen = ++skinGen;
          loadSkin(
            url,
            (t) => {
              if (gen !== skinGen) return; // une demande plus récente a pris le dessus
              applyTexture(t);
              onLoad?.();
            },
            onError,
          );
        };

        applyLatest("assets/textures/entities/player/default.png");

        // Change le skin (URL PNG). Applique seulement si le chargement réussit.
        const setSkin = (url, onLoad, onError) => applyLatest(url, onLoad, onError);

        resolve({
          model,
          animator: new PlayerAnimator(model, gltf.animations),
          rightArm: model.getObjectByName("RightArm"),
          setSkin,
        });
      },
      undefined,
      reject,
    );
  });
}
