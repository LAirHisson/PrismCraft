export const HOTBAR_SIZE = 9;
export const INV_COLS = 9;
export const INV_ROWS = 3;

export const MAX_STACK = 64;

export class Inventory {
  constructor(size = HOTBAR_SIZE + INV_COLS * INV_ROWS) {
    // Définition des slots, vides au début
    this.slots = new Array(size).fill(null);

    // Grilles de craft (2×2 perso, 3×3 table) + objet tenu au curseur
    this.craft = new Array(4).fill(null);
    this.craftTable = new Array(9).fill(null);
    this.cursor = null;

    // Définir le slot séléctionné
    this.selectedHotbarSlot = 0;

    this.maxStack = MAX_STACK;

    // Notifs d'update
    this._listeners = new Set();
  }

  // ─────────────── Accès par zone (hotbar | storage | craft) ───────────────
  _region(zone) {
    if (zone === "storage") return { arr: this.slots, off: HOTBAR_SIZE };
    if (zone === "craft") return { arr: this.craft, off: 0 };
    if (zone === "craftTable") return { arr: this.craftTable, off: 0 };
    return { arr: this.slots, off: 0 }; // hotbar
  }

  getAt(zone, i) {
    const { arr, off } = this._region(zone);
    return arr[off + i];
  }

  _setAt(zone, i, slot) {
    const { arr, off } = this._region(zone);
    arr[off + i] = slot;
  }

  // Clic gauche : prend tout / pose tout / fusionne (même bloc) / échange.
  pickOrPlace(zone, i) {
    const cur = this.cursor;
    const s = this.getAt(zone, i);
    if (!cur) {
      if (!s) return;
      this.cursor = s;
      this._setAt(zone, i, null);
    } else if (!s) {
      this._setAt(zone, i, cur);
      this.cursor = null;
    } else if (s.blockId === cur.blockId) {
      const room = this.maxStack - s.count;
      if (room > 0) {
        const move = Math.min(room, cur.count);
        s.count += move;
        cur.count -= move;
        if (cur.count <= 0) this.cursor = null;
      } else {
        this._setAt(zone, i, cur); // plein → échange
        this.cursor = s;
      }
    } else {
      this._setAt(zone, i, cur); // blocs différents → échange
      this.cursor = s;
    }
    this._emit();
  }

  // Clic droit : prend la moitié (curseur vide) ou pose 1 exemplaire.
  splitOrPlaceOne(zone, i) {
    const cur = this.cursor;
    const s = this.getAt(zone, i);
    if (!cur) {
      if (!s) return;
      const half = Math.ceil(s.count / 2);
      this.cursor = { blockId: s.blockId, count: half };
      s.count -= half;
      if (s.count <= 0) this._setAt(zone, i, null);
    } else if (!s) {
      this._setAt(zone, i, { blockId: cur.blockId, count: 1 });
      cur.count -= 1;
      if (cur.count <= 0) this.cursor = null;
    } else if (s.blockId === cur.blockId && s.count < this.maxStack) {
      s.count += 1;
      cur.count -= 1;
      if (cur.count <= 0) this.cursor = null;
    } else {
      return; // bloc différent ou slot plein → rien
    }
    this._emit();
  }

  // Dépose `count` blocs dans les slots [start, end) : complète les stacks puis les vides.
  // Retourne le reliquat.
  _deposit(start, end, blockId, count, maxStack = this.maxStack) {
    let remaining = count;
    for (let i = start; i < end && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.blockId === blockId && s.count < maxStack) {
        const add = Math.min(remaining, maxStack - s.count);
        s.count += add;
        remaining -= add;
      }
    }
    for (let i = start; i < end && remaining > 0; i++) {
      if (this.slots[i] == null) {
        const add = Math.min(remaining, maxStack);
        this.slots[i] = { blockId, count: add };
        remaining -= add;
      }
    }
    return remaining;
  }

  // Maj+clic : envoie tout le stack vers l'autre région (hotbar↔storage ;
  // craft → inventaire entier).
  quickMove(zone, i) {
    const s = this.getAt(zone, i);
    if (!s) return;
    let start, end;
    if (zone === "hotbar") [start, end] = [HOTBAR_SIZE, this.slots.length];
    else if (zone === "storage") [start, end] = [0, HOTBAR_SIZE];
    else [start, end] = [0, this.slots.length]; // craft → inventaire
    const left = this._deposit(start, end, s.blockId, s.count);
    if (left <= 0) this._setAt(zone, i, null);
    else s.count = left;
    this._emit();
  }

  // Remet l'objet tenu dans l'inventaire (fermeture du menu).
  returnCursor() {
    if (!this.cursor) return;
    const left = this.addItem(this.cursor.blockId, this.cursor.count);
    this.cursor = left > 0 ? { blockId: this.cursor.blockId, count: left } : null;
  }

  // Prend le résultat de craft : shift = autant que possible vers l'inventaire,
  // sinon 1 jeu vers le curseur. `crafting` est injecté (pas de dépendance dure).
  takeCraftResult(crafting, grid, cols, rows, shift) {
    const craftOnce = () => {
      const res = crafting.match(grid, cols, rows);
      if (!res) return false;
      if (shift) {
        const left = this._deposit(0, this.slots.length, res.blockId, res.count);
        if (left > 0) return false; // plus de place
        crafting.consumeOne(grid);
        return true;
      }
      const cur = this.cursor;
      if (cur && (cur.blockId !== res.blockId || cur.count + res.count > this.maxStack)) {
        return false;
      }
      crafting.consumeOne(grid);
      if (cur) cur.count += res.count;
      else this.cursor = { blockId: res.blockId, count: res.count };
      return true;
    };

    let changed = false;
    if (shift) while (craftOnce()) changed = true;
    else changed = craftOnce();
    if (changed) this._emit();
  }

  // Remet le contenu d'une grille de craft dans l'inventaire (fermeture du menu).
  returnCraftGrid(grid) {
    for (let i = 0; i < grid.length; i++) {
      const s = grid[i];
      if (!s) continue;
      const left = this.addItem(s.blockId, s.count);
      grid[i] = left > 0 ? { blockId: s.blockId, count: left } : null;
    }
  }

  // Range `count` blocs : complète les stacks existants puis les slots vides.
  // Retourne le reliquat non casé (0 si tout a été rangé).
  addItem(blockId, count = 1, maxStack = this.maxStack) {
    let remaining = count;
    for (const s of this.slots) {
      if (remaining <= 0) break;
      if (s && s.blockId === blockId && s.count < maxStack) {
        const add = Math.min(remaining, maxStack - s.count);
        s.count += add;
        remaining -= add;
      }
    }
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (this.slots[i] == null) {
        const add = Math.min(remaining, maxStack);
        this.slots[i] = { blockId, count: add };
        remaining -= add;
      }
    }
    if (remaining !== count) this._emit();
    return remaining;
  }

  // Retire une unité du slot (clear à 0).
  removeOne(i) {
    const s = this.slots[i];
    if (!s) return;
    s.count -= 1;
    if (s.count <= 0) this.slots[i] = null;
    this._emit();
  }

  // Abonnement à l'événement
  onChange(fonction) {
    this._listeners.add(fonction);
    return () => this._listeners.delete(fonction);
  }
  _emit() {
    for (const fonction of this._listeners) fonction(this);
  }

  getSlot(i) {
    return this.slots[i];
  }

  setSlot(i, slot) {
    this.slots[i] = slot;
    this._emit(); // on notifie quand on set un slot
  }

  clear(i) {
    this.setSlot(i, null);
  }

  // échanger le contenu de 2 slots
  exchange(i, j) {
    const slotTemp = this.slots[i];
    this.slots[i] = this.slots[j];
    this.slots[j] = slotTemp;
    this._emit(); // on notifie quand on échange des slots
  }

  selectHotbar(i) {
    if (i < 0 || i >= HOTBAR_SIZE) return; // on ne sélectionne que dans la hotbar
    this.selectedHotbarSlot = i;
    this._emit(); // on notifie quand on change de slot en main
  }

  get selectedSlot() {
    return this.slots[this.selectedHotbarSlot];
  }
  get selectedBlockId() {
    return this.selectedSlot ? this.selectedSlot.blockId : null;
  }

  // ─────────────── Sauvegarde ───────────────

  serialize(blockRegistry) {
    const enc = (s) => (s ? { block: blockRegistry.getName(s.blockId), count: s.count } : null);
    return {
      slots: this.slots.map(enc),
      craft: this.craft.map(enc),
      craftTable: this.craftTable.map(enc),
      cursor: enc(this.cursor),
      selectedHotbarSlot: this.selectedHotbarSlot,
    };
  }

  load(data, blockRegistry) {
    const dec = (s) => {
      if (!s) return null;
      const blockId = blockRegistry.getIdByName(s.block);
      if (blockId === undefined) {
        console.warn(`Inventory.load: bloc inconnu "${s.block}" — slot ignoré`);
        return null;
      }
      return { blockId, count: s.count };
    };
    this.slots = data.slots.map(dec);
    this.craft = data.craft.map(dec);
    this.craftTable = data.craftTable.map(dec);
    this.cursor = dec(data.cursor);
    this.selectedHotbarSlot = data.selectedHotbarSlot ?? 0;
    this._emit();
  }

  // Vide tout (slots, craft, curseur, hotbar sélectionnée) — distinct de clear(i)
  // qui ne vide qu'un slot.
  reset() {
    this.slots.fill(null);
    this.craft.fill(null);
    this.craftTable.fill(null);
    this.cursor = null;
    this.selectedHotbarSlot = 0;
    this._emit();
  }
}
