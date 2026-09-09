// Cœurs (demi-cœurs) au-dessus de la hotbar, texturés. Visible en Survie seulement.
const PATH = "assets/textures/gui/hotbar/";
const CONTAINER = `${PATH}container.png`;
const FULL = `${PATH}full.png`;
const HALF = `${PATH}half.png`;

const SIZE = 27; // 18 × 1.5

export class HUD {
  constructor(health) {
    this.health = health;
    this._hearts = [];
    this._build();
    health.onChange(() => this._update());
    this._update();
  }

  _build() {
    const bar = document.createElement("div");
    bar.style.cssText = `
      position: fixed;
      bottom: 130px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 3px;
      z-index: 100;
      pointer-events: none;
    `;
    for (let i = 0; i < this.health.max / 2; i++) {
      const h = document.createElement("div");
      h.style.cssText = `
        width: ${SIZE}px; height: ${SIZE}px;
        background-size: cover;
        background-repeat: no-repeat;
        image-rendering: pixelated;
        filter: drop-shadow(0 1px 1px #000);
      `;
      bar.appendChild(h);
      this._hearts.push(h);
    }
    document.body.appendChild(bar);
    this._el = bar;
  }

  _update() {
    const cur = this.health.current;
    this._hearts.forEach((h, i) => {
      const full = (i + 1) * 2;
      const heart = cur >= full ? FULL : cur >= full - 1 ? HALF : null;
      h.style.backgroundImage = heart
        ? `url("${heart}"), url("${CONTAINER}")`
        : `url("${CONTAINER}")`;
    });
  }

  setVisible(v) {
    this._el.style.display = v ? "flex" : "none";
  }
}
