import { HOTBAR_SIZE } from "../player/Inventory.js";
import {
  SLOT_BG,
  SLOT_LINE,
  SLOT_LINE_SELECTED,
  triClip,
  createTriBorder,
  createItemIcon,
  setItemIcon,
} from "./triSlot.js";

const SCALE = 2;
const CELL_W = 46 * SCALE;
const CELL_H = 40 * SCALE;
const BOTTOM = 16 * SCALE;
const GAP = 10 * SCALE;      // espace horizontal entre les cases
const COUNT_FONT = 10 * SCALE;
const NAME_FONT = 11 * SCALE;
const BORDER_THICK = 6 * SCALE;
const STEP = CELL_W / 2 + GAP; // pas horizontal d'une case à l'autre

export class HotbarUI {
  constructor(inventory, blockRegistry, materials) {
    this.inventory = inventory;
    this.blockRegistry = blockRegistry;
    this.materials = materials;
    this._el = null;
    this._slots = [];
    this._buildDOM();
    this._bindKeys();
    inventory.onChange(() => {
      this._updateContent();
      this._updateVisual();
      this._updateName();
    });
    // Filet de sécurité : si des slots sont déjà remplis au boot (partie chargée), les
    // icônes 3D peuvent avoir été bakées avant la fin du chargement des textures (donc
    // non mises en cache, potentiellement noires) — un rafraîchi différé les recalcule
    // une fois les textures prêtes, sans attendre un changement d'inventaire.
    setTimeout(() => this._updateContent(), 1500);
  }

  get selectedBlockId() {
    return this.inventory.selectedBlockId;
  }

  _buildDOM() {
    // Triangles alternés espacés d'un GAP horizontal.
    const stripW = (HOTBAR_SIZE - 1) * STEP + CELL_W;
    const bar = document.createElement("div");
    bar.id = "hotbar";
    bar.style.cssText = `
      position: fixed;
      bottom: ${BOTTOM}px;
      left: 50%;
      transform: translateX(-50%);
      width: ${stripW}px;
      height: ${CELL_H}px;
      pointer-events: none;
      z-index: 100;
    `;

    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const isUp = i % 2 === 0;
      const triWrap = document.createElement("div");
      triWrap.style.cssText = `
        position: absolute;
        left: ${i * STEP}px;
        top: 0;
        width: ${CELL_W}px;
        height: ${CELL_H}px;
        z-index: ${HOTBAR_SIZE - i};
      `;

      const tri = document.createElement("div");
      tri.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: ${CELL_W}px;
        height: ${CELL_H}px;
        clip-path: ${triClip(isUp)};
        background: url("${SLOT_BG}") center / cover;
        image-rendering: pixelated;
        transition: filter 0.1s;
      `;

      // Hors de `tri` (dont le clip-path découperait le texte) et après l'outline
      // pour s'afficher au-dessus du contour.
      const count = document.createElement("span");
      count.style.cssText = `
        position: absolute;
        bottom: ${2 * SCALE}px;
        right: ${15 * SCALE}px;
        color: #fff;
        font-size: ${COUNT_FONT}px;
        line-height: 1;
        font-weight: bold;
        text-shadow: 0 1px 2px #000;
        pointer-events: none;
      `;

      const outline = createTriBorder(isUp, CELL_W, CELL_H, BORDER_THICK);
      const icon = createItemIcon(CELL_W, CELL_H);
      triWrap.appendChild(tri);
      triWrap.appendChild(outline);
      triWrap.appendChild(icon);
      triWrap.appendChild(count);
      bar.appendChild(triWrap);
      this._slots.push({ tri, outline, icon, count });
    }

    document.body.appendChild(bar);
    this._el = bar;

    // Nom du bloc sélectionné, au-dessus des cœurs (qui sont au-dessus de la hotbar)
    const name = document.createElement("div");
    name.style.cssText = `
      position: fixed;
      bottom: ${BOTTOM + CELL_H + 50}px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      font-size: ${NAME_FONT}px;
      line-height: 1;
      font-weight: bold;
      text-shadow: 0 2px 3px #000;
      pointer-events: none;
      white-space: nowrap;
      z-index: 100;
    `;
    document.body.appendChild(name);
    this._nameLabel = name;

    this._updateContent();
    this._updateVisual();
    this._updateName();
  }

  _bindKeys() {
    document.addEventListener("keydown", (e) => {
      // Utiliser le code physique (Digit1…/Numpad1…) → marche sur AZERTY comme QWERTY.
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m) {
        const n = Number(m[1]);
        if (n <= HOTBAR_SIZE) this.inventory.selectHotbar(n - 1);
      }
    });

    document.addEventListener(
      "wheel",
      (e) => {
        const dir = e.deltaY > 0 ? 1 : -1;
        const next =
          (this.inventory.selectedHotbarSlot + dir + HOTBAR_SIZE) % HOTBAR_SIZE;
        this.inventory.selectHotbar(next);
      },
      { passive: true },
    );
  }

  _updateContent() {
    this._slots.forEach(({ icon, count }, i) => {
      const itemSlot = this.inventory.getSlot(i);
      const blockId = itemSlot ? itemSlot.blockId : null;
      setItemIcon(icon, blockId, this.blockRegistry, this.materials);

      const c = itemSlot ? itemSlot.count : 0;
      count.textContent = c > 1 ? c : "";
    });
  }

  _updateName() {
    const blockId = this.inventory.selectedBlockId;
    this._nameLabel.textContent =
      blockId !== null ? this.blockRegistry.getName(blockId) : "";
  }

  _updateVisual() {
    this._slots.forEach(({ tri, outline }, i) => {
      const selected = i === this.inventory.selectedHotbarSlot;
      tri.style.filter = selected ? "brightness(1.4)" : "brightness(1)";
      const img = selected ? SLOT_LINE_SELECTED : SLOT_LINE;
      for (const line of outline._lines) {
        line.style.backgroundImage = `url("${img}")`;
      }
    });
  }

  setVisible(v) {
    this._el.style.display = v ? "block" : "none";
    this._nameLabel.style.display = v ? "block" : "none";
  }
}
