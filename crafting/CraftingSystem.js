// Craft agnostique à la taille de grille (2×2 aujourd'hui, 3×3 plus tard).
// shaped : motif recadré sur sa boîte englobante, comparé à celui de la grille.
// shapeless : multi-ensemble des ingrédients.

function boundingBox(ids, cols, rows) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (ids[y * cols + x] != null) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Recadre un motif (tableau 2D de blockId|null) sur sa boîte englobante.
function cropPattern(rows) {
  const h0 = rows.length;
  const w0 = Math.max(...rows.map((r) => r.length));
  const flat = [];
  for (let y = 0; y < h0; y++) {
    for (let x = 0; x < w0; x++) flat.push(rows[y][x] ?? null);
  }
  const box = boundingBox(flat, w0, h0);
  if (!box) return { w: 0, h: 0, cells: [] };
  const cells = [];
  for (let y = 0; y < box.h; y++) {
    const row = [];
    for (let x = 0; x < box.w; x++) row.push(flat[(box.y + y) * w0 + (box.x + x)]);
    cells.push(row);
  }
  return { w: box.w, h: box.h, cells };
}

export class CraftingSystem {
  constructor(recipes) {
    this.recipes = recipes;
  }

  // grid = tableau plat (cols*rows) de slots {blockId,count}|null.
  match(grid, cols, rows) {
    const ids = grid.map((s) => (s ? s.blockId : null));
    const filled = ids.filter((x) => x != null);
    if (filled.length === 0) return null;

    for (const r of this.recipes) {
      if (r.type === "shapeless") {
        if (this._matchShapeless(filled, r)) return r.result;
      } else if (this._matchShaped(ids, cols, rows, r)) {
        return r.result;
      }
    }
    return null;
  }

  _matchShapeless(filled, r) {
    if (filled.length !== r.ingredients.length) return false;
    const pool = filled.slice();
    for (const ing of r.ingredients) {
      const idx = pool.indexOf(ing);
      if (idx < 0) return false;
      pool.splice(idx, 1);
    }
    return true;
  }

  _matchShaped(ids, cols, rows, r) {
    const box = boundingBox(ids, cols, rows);
    if (!box || box.w !== r.w || box.h !== r.h) return false;
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        if (ids[(box.y + y) * cols + (box.x + x)] !== r.cells[y][x]) return false;
      }
    }
    return true;
  }

  // Retire une unité de chaque case occupée (un craft consomme un exemplaire/slot).
  consumeOne(grid) {
    for (let i = 0; i < grid.length; i++) {
      const s = grid[i];
      if (s) {
        s.count -= 1;
        if (s.count <= 0) grid[i] = null;
      }
    }
  }
}

export async function loadRecipes(blockRegistry) {
  const res = await fetch("data/recipes.json");
  if (!res.ok) throw new Error(`Failed to load recipes.json: ${res.statusText}`);
  const { recipes } = await res.json();

  const id = (name) => {
    const v = blockRegistry.getIdByName(name);
    if (v === undefined) console.warn(`[recipes] bloc inconnu: ${name}`);
    return v ?? null;
  };

  const norm = recipes.map((r) => {
    const result = { blockId: id(r.result.block), count: r.result.count ?? 1 };
    if (r.type === "shapeless") {
      return { type: "shapeless", ingredients: r.ingredients.map(id), result };
    }
    const rows = r.pattern.map((row) => row.map((c) => (c ? id(c) : null)));
    return { type: "shaped", ...cropPattern(rows), result };
  });

  return new CraftingSystem(norm);
}