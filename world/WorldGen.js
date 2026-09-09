import { createNoise2D } from "simplex-noise";
import { TriGrid } from "./TriGrid.js";
import { placeFeatures, FEATURE_MARGIN } from "./features.js";
import { CHUNK_SIZE } from "./Chunk.js";

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash déterministe (col, row, seed) -> [0, 1). Indépendant de l'ordre.
function hash2(x, y, seed) {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fractal2D(noise2D, x, y, { octaves, persistence, lacunarity, scale }) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2D(x * scale * freq, y * scale * freq);
    norm += amp;
    amp *= persistence;
    freq *= lacunarity;
  }
  return sum / norm; // [-1, 1]
}

// Coordonnée (en unités monde, sur X ou Z) au-delà de laquelle l'easter egg
// "Farlands" se déclenche — clin d'œil à la vraie limite de Minecraft
// (±12 550 821 blocs), où la perte de précision des flottants du jeu original
// déforme le terrain. Nos coordonnées restent des float64 précis à cette
// distance (pas de bug naturel à reproduire), donc l'effet est simulé exprès.
const FARLANDS_X = 12_550_820;
const FARLANDS_STRETCH = 5; // facteur d'étirement vertical du relief

/**
 * Relief chaotique "Farlands" : étire l'amplitude normale puis la hache d'un
 * bruit haute fréquence décorrélé (indépendant de `t`) → pics/gouffres abrupts
 * d'une case à l'autre, façon relief "déchiqueté" des vraies Farlands, plutôt
 * que le relief lisse habituel juste mis à l'échelle.
 */
function farlandTop(t, col, row, seed, minHeight, maxHeight) {
  const amplitude = (maxHeight - minHeight) * FARLANDS_STRETCH;
  const stretched = t * amplitude;
  const jag = (hash2(col, row, seed ^ 0xfa2ee) - 0.5) * amplitude * 0.6;
  return Math.max(minHeight, minHeight + Math.round(stretched + jag));
}

/**
 * Génère une région rectangulaire [minCol..maxCol] × [minRow..maxRow].
 * Entièrement déterministe (bruit + arbres hachés) → composable par chunk.
 * @param {object} [opts]
 * @param {boolean} [opts.farland=false]  Force le relief "Farlands" partout (ignore
 *   la distance réelle) — pour prévisualiser l'easter egg sans voyager jusqu'à
 *   ±{@link FARLANDS_X}.
 * @returns {{blockId,col,row,height}[]}
 */
export function generateRegion(minCol, maxCol, minRow, maxRow, blockRegistry, opts = {}) {
  const STONE = blockRegistry.getIdByName("Stone") ?? 0;
  const DIRT = blockRegistry.getIdByName("Dirt");
  const GRASS = blockRegistry.getIdByName("Grass");
  const WATER = blockRegistry.getIdByName("Water");
  const SAND = blockRegistry.getIdByName("Sand");

  const {
    seed = 1337,
    scale = 0.02,
    octaves = 2,
    persistence = 0.65,
    lacunarity = 2.0,
    minHeight = 1,
    maxHeight = 18,
    dirtDepth = 3,
    waterLevel = 7,
    sandDistance = 3,
    farland = false,
  } = opts;

  const noise2D = createNoise2D(mulberry32(seed));
  const cells = new Map();
  const key = (c, r, h) => `${c},${r},${h}`;
  const setCell = (c, r, h, id) =>
    cells.set(key(c, r, h), { col: c, row: r, height: h, blockId: id });
  const setIfEmpty = (c, r, h, id) => {
    if (id !== undefined && !cells.has(key(c, r, h))) setCell(c, r, h, id);
  };
  const colTop = new Map();

  // 1. Terrain + eau
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const wp = TriGrid.gridToWorld(col, row, 0);
      const n = fractal2D(noise2D, wp.x, wp.z, {
        octaves,
        persistence,
        lacunarity,
        scale,
      });
      const t = (n + 1) / 2;
      const inFarlands = farland || Math.abs(wp.x) >= FARLANDS_X || Math.abs(wp.z) >= FARLANDS_X;
      const top = inFarlands
        ? farlandTop(t, col, row, seed, minHeight, maxHeight)
        : minHeight + Math.round(t * (maxHeight - minHeight));
      colTop.set(`${col},${row}`, top);
      for (let h = 0; h <= top; h++) {
        let id;
        if (h === top) id = GRASS;
        else if (h >= top - dirtDepth) id = DIRT;
        else id = STONE;
        setCell(col, row, h, id);
      }
      for (let h = top + 1; h <= waterLevel; h++) setCell(col, row, h, WATER);
    }
  }

  // 2. Sable = terrain à <= sandDistance prismes de l'eau (BFS multi-source)
  const faceNeighbors = (col, row, height) => [
    { col, row, height: height + 1 },
    { col, row, height: height - 1 },
    ...TriGrid.getNeighbors(col, row).map((nb) => ({ ...nb, height })),
  ];
  if (SAND !== undefined) {
    const visited = new Set();
    let frontier = [];
    for (const cell of cells.values()) {
      if (cell.blockId === WATER) {
        visited.add(key(cell.col, cell.row, cell.height));
        frontier.push(cell);
      }
    }
    for (let d = 1; d <= sandDistance && frontier.length; d++) {
      const next = [];
      for (const cell of frontier) {
        for (const nb of faceNeighbors(cell.col, cell.row, cell.height)) {
          const k = key(nb.col, nb.row, nb.height);
          if (visited.has(k)) continue;
          const target = cells.get(k);
          if (!target || target.blockId === WATER) continue;
          visited.add(k);
          target.blockId = SAND;
          next.push(target);
        }
      }
      frontier = next;
    }
  }

  // 3. Features (arbres, patchs de fleurs/herbe) — voir features.js
  const getTop = (c, r) => colTop.get(`${c},${r}`);
  placeFeatures({
    seed,
    minCol, maxCol, minRow, maxRow,
    hash2,
    idByName: (n) => blockRegistry.getIdByName(n),
    getOrientation: (c, r) => TriGrid.getOrientation(c, r),
    getTop,
    surfaceId: (c, r) => {
      const t = getTop(c, r);
      return t === undefined ? undefined : cells.get(key(c, r, t))?.blockId;
    },
    isExposed: (c, r) => {
      const t = getTop(c, r);
      return t !== undefined && !cells.has(key(c, r, t + 1));
    },
    setIfEmpty,
  });

  return Array.from(cells.values());
}

/** Monde fini rectangulaire (banc d'essai). */
export function generateTerrain(cols, rows, blockRegistry, opts = {}) {
  return generateRegion(0, cols - 1, 0, rows - 1, blockRegistry, opts);
}

/** Génère un chunk (avec marge pour sable/arbres au bord), filtré à ses cases. */
export function generateChunk(cx, cz, blockRegistry, opts = {}) {
  const M = Math.max(opts.sandDistance ?? 3, FEATURE_MARGIN); // sable + portée features
  const c0 = cx * CHUNK_SIZE;
  const c1 = c0 + CHUNK_SIZE - 1;
  const r0 = cz * CHUNK_SIZE;
  const r1 = r0 + CHUNK_SIZE - 1;
  const region = generateRegion(c0 - M, c1 + M, r0 - M, r1 + M, blockRegistry, opts);
  return region.filter(
    (b) => b.col >= c0 && b.col <= c1 && b.row >= r0 && b.row <= r1,
  );
}
