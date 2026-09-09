import * as THREE from "three";

// Sons positionnels des blocs + sons du joueur. L'écouteur est porté par la caméra ;
// les sons de bloc sont joués à la position monde du bloc (directionnels).

const ROOT = "assets/sounds/";

// Jeux de sons par matériau. Extensions variables (mining dirt/sand en mp3).
const MATERIALS = {
  stone: { step: "stone.ogg", break: "stone.ogg", mining: "stone.ogg" },
  grass: { step: "grass.ogg", break: "grass.ogg", mining: "grass.ogg" },
  wood: { step: "wood.ogg", break: "wood.ogg", mining: "wood.ogg" },
  sand: { step: "sand.ogg", break: "sand.ogg", mining: "sand.mp3" },
  dirt: { step: "dirt.ogg", break: "dirt.ogg", mining: "dirt.mp3" },
};

// soundType (blocks.json) → matériau ci-dessus. null = pas de son.
const ALIASES = { gravel: "dirt", water: null };

const PLAYER_SOUNDS = { fallbig: "fallbig.ogg", hit: "hit.ogg" };

const REF_DISTANCE = 5;

// Léger pitch aléatoire pour que les répétitions ne sonnent pas identiques.
const randPitch = () => 0.9 + Math.random() * 0.2;

export class SoundManager {
  constructor(camera, scene) {
    this.scene = scene;
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.loader = new THREE.AudioLoader();
    this.buffers = new Map();
    this._pool = []; // PositionalAudio réutilisables (one-shots)
    this._preload();

    // Politique navigateur : le contexte audio démarre suspendu jusqu'à un geste.
    const resume = () => {
      const ctx = this.listener.context;
      if (ctx.state === "suspended") ctx.resume();
    };
    window.addEventListener("mousedown", resume);
    window.addEventListener("keydown", resume);
  }

  _preload() {
    const paths = new Set();
    for (const m of Object.values(MATERIALS)) {
      for (const cat of ["step", "break", "mining"]) paths.add(`block/${cat}/${m[cat]}`);
    }
    for (const f of Object.values(PLAYER_SOUNDS)) paths.add(`player/${f}`);
    for (const p of paths) {
      this.loader.load(ROOT + p, (buf) => this.buffers.set(p, buf));
    }
  }

  _material(soundType) {
    if (soundType in ALIASES) return ALIASES[soundType];
    return soundType in MATERIALS ? soundType : "stone";
  }

  _path(category, soundType) {
    const mat = this._material(soundType);
    return mat ? `block/${category}/${MATERIALS[mat][category]}` : null;
  }

  _acquirePositional() {
    const s = this._pool.pop();
    if (s) return s;
    const a = new THREE.PositionalAudio(this.listener);
    a.setRefDistance(REF_DISTANCE);
    return a;
  }

  // One-shot positionnel (break, step, mining) à la position monde donnée.
  // Le pitch est légèrement randomisé par défaut (rate explicite pour l'imposer).
  // Les nœuds sont recyclés via un pool (pas de création/destruction par son).
  playBlock(category, soundType, position, { volume = 1, rate = randPitch() } = {}) {
    const path = this._path(category, soundType);
    const buffer = path && this.buffers.get(path);
    if (!buffer) return;
    const sound = this._acquirePositional();
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    sound.setPlaybackRate(rate);
    sound.position.copy(position);
    this.scene.add(sound);
    sound.onEnded = () => {
      sound.isPlaying = false;
      this.scene.remove(sound);
      this._pool.push(sound); // recyclage
    };
    sound.play();
  }

  // Sons du joueur (chute, coup) — non positionnels (centrés sur l'écouteur).
  playPlayer(name, { volume = 1 } = {}) {
    const file = PLAYER_SOUNDS[name];
    const buffer = file && this.buffers.get(`player/${file}`);
    if (!buffer) return;
    const sound = new THREE.Audio(this.listener);
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    sound.play();
  }
}
