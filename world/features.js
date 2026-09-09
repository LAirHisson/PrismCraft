/**
 * Décors posés sur le terrain, pilotés par config (modifiable/dynamique).
 *
 * type "structure" : multi-blocs espacés (arbres). Un candidat par cellule
 *   spacing×spacing, présent avec proba `density`, sur `surface` de bonne parité.
 * type "patch" : amas de plantes. Centres de patch espacés (spacing/density),
 *   puis chaque case dans `radius` reçoit une plante avec proba `fill`.
 *
 * Blocs référencés par NOM (résolus via le registre). Placement 100% déterministe
 * (hash de coordonnées) → identique quel que soit le chunk qui génère.
 */

const OAK_CROWN = [
  { dcol: 0, drow: -1, dh: 0, block: "Leaves" },
  { dcol: 1, drow: -1, dh: 0, block: "Leaves" },
  { dcol: -1, drow: -1, dh: 0, block: "Leaves" },
  { dcol: 2, drow: -1, dh: 0, block: "Leaves" },
  { dcol: -2, drow: -1, dh: 0, block: "Leaves" },
  { dcol: 1, drow: 0, dh: 0, block: "Leaves" },
  { dcol: 2, drow: 0, dh: 0, block: "Leaves" },
  { dcol: -1, drow: 0, dh: 0, block: "Leaves" },
  { dcol: -2, drow: 0, dh: 0, block: "Leaves" },
  { dcol: 0, drow: 1, dh: 0, block: "Leaves" },
  { dcol: 1, drow: 1, dh: 0, block: "Leaves" },
  { dcol: -1, drow: 1, dh: 0, block: "Leaves" },
  { dcol: 0, drow: -1, dh: 1, block: "Leaves" },
  { dcol: 0, drow: 0, dh: 1, block: "Leaves" },
  { dcol: -1, drow: 0, dh: 1, block: "Leaves" },
  { dcol: 1, drow: 0, dh: 1, block: "Leaves" },
];

export const FEATURES = [
  {
    name: "oak",
    type: "structure",
    surface: "Grass",
    anchor: "UP",
    spacing: 5,
    density: 0.55,
    trunk: { block: "Log", minHeight: 2, maxHeight: 4 },
    crown: OAK_CROWN,
  },
  {
    name: "flowers",
    type: "patch",
    surface: "Grass",
    spacing: 10,
    density: 0.1,
    radius: 3,
    fill: 0.1,
    blocks: ["Poppy", "Dandelion"],
  },
  {
    name: "grass",
    type: "patch",
    surface: "Grass",
    spacing: 7,
    density: 0.5,
    radius: 3,
    fill: 0.3,
    blocks: ["Short Grass"],
  },
];

/** Portée max d'une feature (marge de génération inter-chunks). */
export const FEATURE_MARGIN = FEATURES.reduce((m, f) => {
  if (f.type === "patch") return Math.max(m, f.radius ?? 2);
  let r = 0;
  for (const b of f.crown ?? []) r = Math.max(r, Math.abs(b.dcol), Math.abs(b.drow));
  return Math.max(m, r);
}, 0);

// ─────────────────────────── Placement ───────────────────────────

function eligible(ctx, col, row, surfaceId) {
  return ctx.surfaceId(col, row) === surfaceId && ctx.isExposed(col, row);
}

function placeStructure(f, salt, ctx) {
  const D = Math.max(1, f.spacing);
  const surfaceId = ctx.idByName(f.surface);
  const logId = ctx.idByName(f.trunk.block);
  const range = f.trunk.maxHeight - f.trunk.minHeight + 1;
  const anchorUp = f.anchor === "UP";

  const txMin = Math.floor(ctx.minCol / D);
  const txMax = Math.floor(ctx.maxCol / D);
  const tzMin = Math.floor(ctx.minRow / D);
  const tzMax = Math.floor(ctx.maxRow / D);

  for (let tx = txMin; tx <= txMax; tx++) {
    for (let tz = tzMin; tz <= tzMax; tz++) {
      if (ctx.hash2(tx, tz, salt) >= f.density) continue;
      const col = tx * D + Math.floor(ctx.hash2(tx, tz, salt ^ 0x1111) * D);
      const row = tz * D + Math.floor(ctx.hash2(tx, tz, salt ^ 0x2222) * D);
      if (col < ctx.minCol || col > ctx.maxCol || row < ctx.minRow || row > ctx.maxRow) continue;
      if (!eligible(ctx, col, row, surfaceId)) continue;
      if (f.anchor && (ctx.getOrientation(col, row) === "UP") !== anchorUp) continue;

      const base = ctx.getTop(col, row) + 1;
      const th = f.trunk.minHeight + Math.floor(ctx.hash2(tx, tz, salt ^ 0x3333) * range);
      for (let i = 0; i < th; i++) ctx.setIfEmpty(col, row, base + i, logId);
      const topDh = th - 1;
      for (const b of f.crown) {
        ctx.setIfEmpty(col + b.dcol, row + b.drow, base + topDh + b.dh, ctx.idByName(b.block));
      }
    }
  }
}

function placePatch(f, salt, ctx) {
  const D = Math.max(1, f.spacing);
  const R = f.radius ?? 2;
  const surfaceId = ctx.idByName(f.surface);
  const ids = f.blocks.map((n) => ctx.idByName(n));

  // Centres dont le rayon peut toucher la région
  const txMin = Math.floor((ctx.minCol - R) / D);
  const txMax = Math.floor((ctx.maxCol + R) / D);
  const tzMin = Math.floor((ctx.minRow - R) / D);
  const tzMax = Math.floor((ctx.maxRow + R) / D);

  for (let tx = txMin; tx <= txMax; tx++) {
    for (let tz = tzMin; tz <= tzMax; tz++) {
      if (ctx.hash2(tx, tz, salt) >= f.density) continue;
      const ccol = tx * D + Math.floor(ctx.hash2(tx, tz, salt ^ 0x1111) * D);
      const crow = tz * D + Math.floor(ctx.hash2(tx, tz, salt ^ 0x2222) * D);

      for (let dc = -R; dc <= R; dc++) {
        for (let dr = -R; dr <= R; dr++) {
          const col = ccol + dc;
          const row = crow + dr;
          if (col < ctx.minCol || col > ctx.maxCol || row < ctx.minRow || row > ctx.maxRow) continue;
          if (!eligible(ctx, col, row, surfaceId)) continue;
          if (ctx.hash2(col, row, salt ^ 0x4444) >= f.fill) continue;
          const id = ids[Math.floor(ctx.hash2(col, row, salt ^ 0x5555) * ids.length)];
          ctx.setIfEmpty(col, row, ctx.getTop(col, row) + 1, id);
        }
      }
    }
  }
}

/** Applique toutes les features à une région. `ctx` fournit l'accès terrain. */
export function placeFeatures(ctx) {
  FEATURES.forEach((f, i) => {
    const salt = (ctx.seed ^ Math.imul(i + 1, 0x9e3779b9)) | 0;
    if (f.type === "structure") placeStructure(f, salt, ctx);
    else if (f.type === "patch") placePatch(f, salt, ctx);
  });
}
