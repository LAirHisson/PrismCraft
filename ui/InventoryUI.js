import { HOTBAR_SIZE, INV_COLS, INV_ROWS } from "../player/Inventory.js";
import { triClip, createTriBorder, itemBackground } from "./triSlot.js";
import { i18n } from "../core/I18n.js";
import { getBlockIconDataURL } from "../rendering/BlockIconRenderer.js";

const SCALE = 2;
const PANEL_BG = "#C6C6C6";
const SLOT_FILL = "#8B8B8B";
const B = 48 * SCALE; // base d'un triangle
const H = 42 * SCALE; // hauteur d'un triangle (≈ B * √3/2)
const BORDER_THICK = 6 * SCALE;
const PANEL_PAD = 16 * SCALE;
const PANEL_GAP = 16 * SCALE;
const COUNT_FONT = 10 * SCALE;
const GAP = 8 * SCALE;          // espace horizontal entre cases (lisibilité)
const STEP = B / 2 + GAP;       // pas horizontal d'une case à l'autre
const ROW_GAP = 6 * SCALE;      // espace vertical entre les lignes
const ROW_STEP = H + ROW_GAP;   // pas vertical d'une ligne à l'autre

const PERSONAL_CRAFT = { zone: "craft", cols: 2, rows: 2 };

export class InventoryUI {
  constructor(inventory, blockRegistry, cameraController, craftingSystem, gameMode, materials) {
    this.inventory = inventory;
    this.blockRegistry = blockRegistry;
    this.materials = materials;
    this.cameraController = cameraController;
    this.craftingSystem = craftingSystem;
    this.gameMode = gameMode;

    this._open = false;
    this._tab = "inventory"; // "inventory" | "give" (give = créatif seulement)
    this._table = false;     // true = écran d'une crafting table (grille N×N)
    this._craft = PERSONAL_CRAFT;

    this._buildDOM();
    this._bindEvents();
    inventory.onChange(() => {
      if (this._open) {
        this._refresh();
        this._updateCursor();
      }
    });
    gameMode?.onChange(() => {
      if (this.gameMode.isSurvival()) this._tab = "inventory";
      if (this._open) this._refresh();
    });
  }

  isOpen() {
    return this._open;
  }

  open() {
    this._table = false;
    this._craft = PERSONAL_CRAFT;
    this._show();
  }

  // Ouvre l'écran d'une crafting table (grille size×size).
  openTable(size = 3) {
    this._table = true;
    this._craft = { zone: "craftTable", cols: size, rows: size };
    this._show();
  }

  _show() {
    this._open = true;
    this.cameraController.controls.unlock();
    this._refresh();
    this._updateCursor();
    this._backdrop.style.display = "flex";
  }

  close() {
    const grid = this._craft.zone === "craftTable"
      ? this.inventory.craftTable
      : this.inventory.craft;
    this.inventory.returnCraftGrid(grid); // ingrédients de la grille rendus à l'inventaire
    this.inventory.returnCursor();        // ne pas perdre l'objet tenu
    this._open = false;
    this._table = false;
    this._craft = PERSONAL_CRAFT;
    this._updateCursor();
    this._backdrop.style.display = "none";
  }

  toggle() {
    this._open ? this.close() : this.open();
  }

  _stripWidth(cols) {
    return (cols - 1) * STEP + B;
  }

  _buildDOM() {
    const backdrop = document.createElement("div");
    backdrop.style.cssText = `
      position: fixed; inset: 0;
      display: none;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.5);
      z-index: 200;
    `;

    // Colonne : barre d'onglets AU-DESSUS du panneau, alignée sur son bord gauche
    const column = document.createElement("div");
    column.style.cssText = "display: flex; flex-direction: column; align-items: flex-start;";

    const tabs = document.createElement("div");
    tabs.style.cssText = `display: flex; gap: 8px; padding-left: ${PANEL_PAD}px;`;
    this._tabs = tabs;

    const panel = document.createElement("div");
    panel.style.cssText = `
      background: ${PANEL_BG};
      padding: ${PANEL_PAD}px;
      border: ${4 * SCALE}px solid #555;
      display: flex; flex-direction: column; gap: ${PANEL_GAP}px;
    `;
    this._content = panel;

    column.append(tabs, panel);
    backdrop.appendChild(column);
    document.body.appendChild(backdrop);
    this._backdrop = backdrop;

    // Objet tenu au curseur (suit la souris) — triangle clippé + compteur hors clip
    const ghost = document.createElement("div");
    ghost.style.cssText = `
      position: fixed; display: none;
      width: ${B}px; height: ${H}px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 300;
    `;
    const ghostTri = document.createElement("div");
    ghostTri.style.cssText = `
      position: absolute; top: 0; left: 0;
      width: ${B}px; height: ${H}px;
      clip-path: ${triClip(true)};
      background-size: cover; background-repeat: no-repeat;
      image-rendering: pixelated;
    `;
    const ghostCount = document.createElement("span");
    ghostCount.style.cssText = `
      position: absolute; bottom: ${1 * SCALE}px; left: 50%;
      transform: translateX(-50%);
      color: #fff; font-size: ${COUNT_FONT}px; font-weight: bold;
      text-shadow: 0 1px 2px #000;
    `;
    ghost.appendChild(ghostTri);
    ghost.appendChild(ghostCount);
    document.body.appendChild(ghost);
    this._ghost = ghost;
    this._ghostTri = ghostTri;
    this._ghostCount = ghostCount;
  }

  // (Re)construit onglets (au-dessus, créatif hors table) + module haut + stockage + hotbar.
  _refresh() {
    const tabsShown = this.gameMode && !this.gameMode.isSurvival() && !this._table;
    if (!tabsShown) this._tab = "inventory";

    this._buildTabs(tabsShown);

    this._content.textContent = "";
    this._content.appendChild(
      this._tab === "give" ? this._buildPalette() : this._buildCraftModule(),
    );
    this._content.appendChild(this._buildGrid("storage", INV_COLS, INV_ROWS));
    this._content.appendChild(this._buildGrid("hotbar", HOTBAR_SIZE, 1));
  }

  _buildTabs(creative) {
    this._tabs.textContent = "";
    this._tabs.style.display = creative ? "flex" : "none";
    if (!creative) return;
    const mkTab = (id, label) => {
      const b = document.createElement("div");
      const active = this._tab === id;
      b.textContent = label;
      b.style.cssText = `
        padding: ${6 * SCALE}px ${12 * SCALE}px;
        background: ${active ? PANEL_BG : SLOT_FILL};
        color: ${active ? "#222" : "#eee"};
        border: ${2 * SCALE}px solid #555; border-bottom: none;
        font-weight: bold; cursor: pointer;
      `;
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this._tab = id;
        this._refresh();
      });
      return b;
    };
    this._tabs.append(mkTab("inventory", i18n.t("invTabInventory")), mkTab("give", i18n.t("invTabGive")));
  }

  _buildPalette() {
    const ids = this.blockRegistry.getAllBlockIds();
    const cols = INV_COLS;
    const rows = Math.ceil(ids.length / cols);
    const grid = document.createElement("div");
    grid.style.cssText = `
      position: relative;
      width: ${this._stripWidth(cols)}px;
      height: ${rows * H + (rows - 1) * ROW_GAP}px;
    `;
    ids.forEach((blockId, k) => {
      const c = k % cols;
      const r = Math.floor(k / cols);
      const isUp = (r + c) % 2 === 0;
      grid.appendChild(
        this._buildCell("palette", blockId, isUp, c * STEP, r * ROW_STEP, cols - c, {
          blockId,
          count: 1,
        }),
      );
    });
    return grid;
  }

  _craftGrid() {
    return this._craft.zone === "craftTable" ? this.inventory.craftTable : this.inventory.craft;
  }

  _buildCraftModule() {
    const { zone, cols, rows } = this._craft;
    const row = document.createElement("div");
    row.style.cssText = `display: flex; align-items: center; gap: ${PANEL_GAP}px;`;

    const craft = this._buildGrid(zone, cols, rows);

    const arrow = document.createElement("div");
    arrow.textContent = "→";
    arrow.style.cssText = "font-size: 32px; color: #333; font-weight: bold;";

    const resultWrap = document.createElement("div");
    resultWrap.style.cssText = `position: relative; width: ${B}px; height: ${H}px;`;
    const res = this.craftingSystem
      ? this.craftingSystem.match(this._craftGrid(), cols, rows)
      : null;
    const slot = res ? { blockId: res.blockId, count: res.count } : null;
    resultWrap.appendChild(this._buildCell("result", 0, true, 0, 0, 1, slot));

    row.append(craft, arrow, resultWrap);
    return row;
  }

  // Prend le résultat : clic = 1 jeu vers le curseur, Maj+clic = autant que possible.
  _takeResult(shift) {
    const { cols, rows } = this._craft;
    this.inventory.takeCraftResult(this.craftingSystem, this._craftGrid(), cols, rows, shift);
  }

  _buildGrid(zone, cols, rows) {
    const grid = document.createElement("div");
    grid.style.cssText = `
      position: relative;
      width: ${this._stripWidth(cols)}px;
      height: ${rows * H + (rows - 1) * ROW_GAP}px;
    `;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const index = r * cols + c;
        const isUp = (r + c) % 2 === 0;
        grid.appendChild(
          this._buildCell(zone, index, isUp, c * STEP, r * ROW_STEP, cols - c),
        );
      }
    }
    return grid;
  }

  _buildCell(zone, index, isUp, left, top, z, slot) {
    if (slot === undefined) slot = this.inventory.getAt(zone, index);
    const blockId = slot ? slot.blockId : null;

    const wrap = document.createElement("div");
    wrap.style.cssText = `
      position: absolute; left: ${left}px; top: ${top}px;
      width: ${B}px; height: ${H}px;
      z-index: ${z};
    `;
    wrap.dataset.zone = zone;
    wrap.dataset.index = String(index);

    const tri = document.createElement("div");
    let bg = SLOT_FILL;
    if (blockId !== null) {
      const url = getBlockIconDataURL(blockId, this.blockRegistry, this.materials);
      bg = itemBackground(url, SLOT_FILL, this.blockRegistry.getShape(blockId) === "slab");
    }
    tri.style.cssText = `
      position: absolute; top: 0; left: 0;
      width: ${B}px; height: ${H}px;
      clip-path: ${triClip(isUp)};
      background: ${bg};
      image-rendering: pixelated;
      cursor: ${blockId !== null ? "grab" : "default"};
    `;

    wrap.appendChild(tri);
    wrap.appendChild(createTriBorder(isUp, B, H, BORDER_THICK));

    if (slot && slot.count > 1) {
      const count = document.createElement("span");
      count.style.cssText = `
        position: absolute; bottom: ${1 * SCALE}px; left: 50%;
        transform: translateX(-50%);
        color: #fff; font-size: ${COUNT_FONT}px; font-weight: bold;
        text-shadow: 0 1px 2px #000; pointer-events: none;
      `;
      count.textContent = slot.count;
      wrap.appendChild(count);
    }
    return wrap;
  }

  _updateCursor() {
    const cur = this.inventory.cursor;
    if (!this._open || !cur) {
      this._ghost.style.display = "none";
      return;
    }
    this._ghost.style.display = "block";
    this._ghostTri.style.backgroundImage = `url("${getBlockIconDataURL(cur.blockId, this.blockRegistry, this.materials)}")`;
    this._ghostCount.textContent = cur.count > 1 ? cur.count : "";
  }

  _bindEvents() {
    document.addEventListener("keydown", (e) => {
      if (e.code === "KeyE" && !e.repeat) this.toggle();
      else if (e.code === "Escape" && this._open) this.close();
    });

    // Clic gauche = prendre/poser, clic droit = moitié/poser 1.
    this._content.addEventListener("mousedown", (e) => {
      const cell = e.target.closest("[data-zone]");
      if (!cell) return;
      e.preventDefault();
      const zone = cell.dataset.zone;
      const i = Number(cell.dataset.index);
      if (zone === "palette") {
        if (e.button === 0) this.inventory.addItem(i, e.shiftKey ? 64 : 1); // i = blockId
      } else if (zone === "result") {
        if (e.button === 0) this._takeResult(e.shiftKey);
      } else if (e.button === 0 && e.shiftKey) this.inventory.quickMove(zone, i);
      else if (e.button === 0) this.inventory.pickOrPlace(zone, i);
      else if (e.button === 2) this.inventory.splitOrPlaceOne(zone, i);
    });
    this._content.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("mousemove", (e) => {
      if (this._open && this.inventory.cursor) {
        this._ghost.style.left = `${e.clientX}px`;
        this._ghost.style.top = `${e.clientY}px`;
      }
    });
  }
}
