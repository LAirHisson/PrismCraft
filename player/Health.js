// Points de vie du joueur, en demi-cœurs (20 = 10 cœurs). Notifie via onChange.
export class Health {
  constructor(max = 20) {
    this.max = max;
    this.current = max;
    this._listeners = new Set();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  _emit() {
    for (const fn of this._listeners) fn(this);
  }

  damage(n) {
    if (n <= 0) return;
    this.current = Math.max(0, this.current - n);
    this._emit();
  }

  heal(n) {
    if (n <= 0) return;
    this.current = Math.min(this.max, this.current + n);
    this._emit();
  }

  reset() {
    this.current = this.max;
    this._emit();
  }

  load({ current, max } = {}) {
    if (typeof max === "number") this.max = max;
    this.current = typeof current === "number" ? Math.min(this.max, Math.max(0, current)) : this.max;
    this._emit();
  }

  get dead() {
    return this.current <= 0;
  }
}
