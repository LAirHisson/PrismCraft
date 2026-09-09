// Traduit les signaux physiques du joueur en dégâts (Survie uniquement, sauf le vide
// ci-dessous). Gère aussi la noyade et une régénération lente (pas de faim en v1).
const SAFE_FALL = 3;      // blocs de chute sans dégâts
const AIR_SECONDS = 10;   // réserve de souffle sous l'eau
const REGEN_DELAY = 4;    // s sans dégât avant régen
export const VOID_Y = -10; // sous ce niveau : mort instantanée, même en créatif

export class DamageSystem {
  constructor({ gameMode, health, player, sound }) {
    this.gameMode = gameMode;
    this.health = health;
    this.player = player;
    this.sound = sound;
    this._breath = AIR_SECONDS;
    this._sinceHit = REGEN_DELAY;
    this._regen = 0;
    this._ignoreNextLand = true; // pas de dégâts pour la chute initiale au spawn
  }

  // Ignore le prochain atterrissage (chute de (re)spawn).
  ignoreNextLand() {
    this._ignoreNextLand = true;
  }

  // Branché sur PlayerController.onLand — 1 cœur (2 demi) par bloc au-delà du seuil.
  onLand(fallDistance) {
    if (this._ignoreNextLand) {
      this._ignoreNextLand = false;
      return;
    }
    if (!this.gameMode.isSurvival()) return;
    if (this.player.isInWater()) return; // l'eau amortit la chute
    const dmg = Math.floor(fallDistance) - SAFE_FALL;
    if (dmg > 0) {
      this.health.damage(dmg * 2);
      this._sinceHit = 0;
      this.sound?.playPlayer("fallbig");
    }
  }

  update(dt) {
    // Chute dans le vide : tue quel que soit le mode (pas de garde isSurvival ici).
    if (this.player.position.y < VOID_Y) {
      if (this.health.current > 0) this.health.damage(this.health.max);
      return;
    }

    if (!this.gameMode.isSurvival()) return;

    // Noyade : la tête sous l'eau vide le souffle, puis retire de la vie.
    if (this.player.isHeadInWater()) {
      this._breath -= dt;
      if (this._breath <= 0) {
        this.health.damage(2);
        this._sinceHit = 0;
        this._breath = 1;
        this.sound?.playPlayer("hit");
      }
    } else {
      this._breath = AIR_SECONDS;
    }

    // Régen lente hors dégât récent.
    this._sinceHit += dt;
    if (this._sinceHit > REGEN_DELAY && this.health.current < this.health.max) {
      this._regen += dt;
      if (this._regen >= 1) {
        this.health.heal(1);
        this._regen = 0;
      }
    }
  }
}
