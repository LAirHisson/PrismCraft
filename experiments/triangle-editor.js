// Éditeur rudimentaire de "pixels triangulaires" — dessine sur la vue PNG (le fichier
// réel) ou directement sur la vue façonnée (triangles), les deux restent synchronisées
// en permanence puisqu'elles lisent le même tableau `pixels`.
//
// Deux modes alternatifs, chacun avec son propre tampon (basculer n'efface rien) :
//   - "bloc" : 256 triangles équilatéraux pavant un grand triangle (face de prisme),
//     stockés dans un PNG 16×16 via le mapping r²+k de triangle-texture-test.js.
//   - "item" : 512 triangles équilatéraux en 16 rangées de 32, orientés par la même
//     règle de parité que la grille du monde ((k+r)%2 === 0 → ▲, cf. TriGrid) : la
//     texture d'item est littéralement un morceau 32×16 de la grille du jeu. Stockée
//     dans un PNG 32×16 où le pixel (k, r) est le triangle k de la rangée r.
//     Un treillis équilatéral ne pave pas un rectangle net : les bords gauche/droit
//     sont en dents de scie, c'est voulu (pas de demi-triangles).
//
// Outils : pinceau, ou seau de peinture qui remplit les triangles contigus de même
// couleur — contigus par ARÊTE de triangle, dans les deux vues, puisque c'est la forme
// réelle de la texture. La couleur "transparent" sort en alpha 0 à l'export (fond vide
// des items, que le jeu extrude en 3D) ; le fond par défaut des items est transparent.
//
// Réutilise la géométrie déjà validée dans triangle-texture-test.js (mapping r²+k,
// sommets des petits triangles) plutôt que de la redéfinir. Le style visuel (police,
// boutons biseautés/triangulaires, bordure slot_side.png) est dupliqué localement en
// chemins absolus (/assets/...) plutôt qu'importé de ui/triSlot.js ou ui/Menu.js : ces
// modules utilisent des chemins relatifs pensés pour une page à la racine du site, ce
// qui casserait depuis /experiments/.

import { TRI_N, slotIndex, rowColFromIndex, triangleUnitVerts } from "./triangle-texture-test.js";

const ROW_H = Math.sqrt(3) / 2;
const SLOT_LINE = "/assets/textures/gui/hotbar/slot_side.png";

/** Treillis "item" : 16 rangées × 32 triangles = 512. */
const ITEM_ROWS = 16;
const ITEM_PER_ROW = 32;

// Valeur de pixel "vide" : jamais une couleur hex, donc impossible à confondre avec une
// couleur de palette et facile à tester avant tout fillStyle/export.
const TRANSPARENT = "transparent";
const CHECKER_CSS = "repeating-conic-gradient(#b0b0b0 0% 25%, #e6e6e6 0% 50%) 50% / 10px 10px";

const MODES = {
  block: { label: "Bloc", pngW: TRI_N, pngH: TRI_N, file: "triangle-texture.png", empty: "#c8c8c8" },
  item: { label: "Item", pngW: ITEM_PER_ROW, pngH: ITEM_ROWS, file: "item-texture.png", empty: TRANSPARENT },
};

// ─────────────── Éléments d'UI biseautés/triangulaires (style jeu, en plus compact) ───────────────

function borderPoly(points, w, h, thickness) {
  const border = document.createElement("div");
  border.style.cssText = `position: absolute; top: 0; left: 0; width: ${w}px; height: ${h}px; pointer-events: none;`;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const line = document.createElement("div");
    line.style.cssText = `
      position: absolute; left: ${x0}px; top: ${y0 - thickness / 2}px;
      width: ${len}px; height: ${thickness}px;
      background: url("${SLOT_LINE}") repeat-x center / auto 100%;
      image-rendering: pixelated; transform-origin: 0 50%; transform: rotate(${angle}deg);
    `;
    border.appendChild(line);
  }
  return border;
}

/** Bouton triangulaire compact (même esprit que triButton() du menu pause, en plus petit). */
function triButton(label, up, onClick, w = 150, h = 34) {
  const thick = 5;
  const points = up ? [[w, 0], [0, h / 2], [w, h]] : [[0, 0], [w, h / 2], [0, h]];
  const wrap = document.createElement("div");
  wrap.style.cssText = `position: relative; width: ${w}px; height: ${h}px; cursor: pointer;`;
  const tri = document.createElement("div");
  tri.style.cssText = `
    position: absolute; inset: 0;
    clip-path: ${up ? "polygon(100% 0,0 50%,100% 100%)" : "polygon(0 0,100% 50%,0% 100%)"};
    background: #8B8B8B; transition: filter 0.1s;
  `;
  wrap.onmouseenter = () => (tri.style.filter = "brightness(1.15)");
  wrap.onmouseleave = () => (tri.style.filter = "");
  const t = document.createElement("span");
  t.textContent = label;
  t.style.cssText = `
    position: absolute; top: 0; height: 100%; ${up ? "right: 14px" : "left: 14px"};
    max-width: ${w - 26}px; display: flex; align-items: center;
    color: #fff; font-weight: bold; font-size: 12px; text-shadow: 0 1px 2px #000;
    pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  `;
  wrap.append(tri, borderPoly(points, w, h, thick), t);
  wrap.addEventListener("click", onClick);
  return wrap;
}

// ─────────────── État : pixels (source de vérité) + palette ───────────────

// `<input type=color>` n'accepte QUE du #rrggbb — toutes les couleurs manipulées ici
// (palette, pixels chargés/extraits) sont donc normalisées en hex, jamais en rgb(...).
function toHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const DEFAULT_PALETTE = [
  "#000000", "#3a3a3a", "#7a7a7a", "#c8c8c8", "#ffffff",
  "#ac3232", "#d95763", "#df7126", "#fbf236", "#8ae234",
  "#3b8f3b", "#3a7bd5", "#1e3a8a", "#8f5a3b", "#e0a878", "#7a2f8f",
];

// Un tampon par mode : basculer d'un mode à l'autre ne doit pas jeter le dessin en cours.
const buffers = {
  block: new Array(MODES.block.pngW * MODES.block.pngH).fill(MODES.block.empty),
  item: new Array(MODES.item.pngW * MODES.item.pngH).fill(MODES.item.empty),
};
let mode = "block";
let pixels = buffers[mode];

let palette = DEFAULT_PALETTE.slice(0, 16);
let selectedIndex = 0; // -1 quand "transparent" est la couleur active
let activeColor = palette[selectedIndex];
let tool = "brush"; // "brush" | "fill"

// ─────────────── Rendu ───────────────

function fitCanvas(id, w, h) {
  const el = document.getElementById(id);
  el.width = w;
  el.height = h;
  return el;
}

/** Résolution interne (buffer) plus haute que la taille affichée (CSS) — le navigateur
 *  redimensionne en douceur, arêtes du triangle plus nettes qu'un simple canvas 1:1. */
function fitCanvasHD(id, displaySize, renderScale) {
  const el = document.getElementById(id);
  el.width = displaySize * renderScale;
  el.height = displaySize * renderScale;
  el.style.width = `${displaySize}px`;
  el.style.height = `${displaySize}px`;
  return el;
}

/** Damier dessiné derrière les pixels transparents, comme dans les logiciels de dessin. */
function checkerPattern(ctx, size) {
  const c = document.createElement("canvas");
  c.width = size * 2;
  c.height = size * 2;
  const g = c.getContext("2d");
  g.fillStyle = "#e6e6e6";
  g.fillRect(0, 0, size * 2, size * 2);
  g.fillStyle = "#b0b0b0";
  g.fillRect(0, 0, size, size);
  g.fillRect(size, size, size, size);
  return ctx.createPattern(c, "repeat");
}

const SQUARE_SIZE = 340;   // largeur affichée de la vue PNG (la hauteur suit le ratio du mode)

const TRI_DISPLAY = 340;   // taille affichée (CSS px), inchangée
const TRI_MARGIN = 34;     // marge autour du triangle — plus qu'avant (16) -> "dézoomé"
const RENDER_SCALE = 2;    // résolution interne x2 (supersampling) -> arêtes plus nettes
const TRI_SIZE = TRI_DISPLAY * RENDER_SCALE;
const triScale = (TRI_SIZE - TRI_MARGIN * RENDER_SCALE) / (TRI_N * ROW_H);
const triOrigin = { x: TRI_SIZE / 2, y: (TRI_MARGIN * RENDER_SCALE) / 2 };

// Treillis "item" en unités d'arête : une rangée de 32 triangles alternés fait 16.5 de
// large, 16 rangées font 16·√3/2 ≈ 13.9 de haut — mis à l'échelle sur la largeur et
// centré verticalement dans le même canvas que le triangle des blocs.
const ITEM_UNIT_W = ITEM_PER_ROW / 2 + 0.5;
const ITEM_UNIT_H = ITEM_ROWS * ROW_H;
const itemScale = (TRI_SIZE - TRI_MARGIN * RENDER_SCALE) / ITEM_UNIT_W;
const itemOrigin = {
  x: (TRI_MARGIN * RENDER_SCALE) / 2,
  y: (TRI_SIZE - ITEM_UNIT_H * itemScale) / 2,
};

/** Index dans `pixels` du triangle k de la rangée r — c'est aussi le pixel (k, r) du PNG. */
function itemIndex(k, r) {
  return r * ITEM_PER_ROW + k;
}

/**
 * Sommets (unités d'arête, y vers le bas) du triangle k de la rangée r. Orientation
 * par parité comme TriGrid : les rangées successives s'emboîtent donc exactement.
 */
function itemUnitVerts(k, r) {
  const x0 = k / 2;
  const yT = r * ROW_H;
  const yB = yT + ROW_H;
  return (k + r) % 2 === 0
    ? [{ x: x0 + 0.5, y: yT }, { x: x0, y: yB }, { x: x0 + 1, y: yB }]
    : [{ x: x0, y: yT }, { x: x0 + 1, y: yT }, { x: x0 + 0.5, y: yB }];
}

function itemToCanvasPt(v) {
  return { x: itemOrigin.x + v.x * itemScale, y: itemOrigin.y + v.y * itemScale };
}

function toCanvasPt(v) {
  return { x: triOrigin.x + v.x * triScale, y: triOrigin.y + v.y * triScale };
}

function renderSquare() {
  const { pngW, pngH } = MODES[mode];
  const cell = SQUARE_SIZE / pngW;
  const w = pngW * cell;
  const h = pngH * cell;
  const ctx = fitCanvas("c-square", w, h).getContext("2d");
  const checker = checkerPattern(ctx, 5);
  for (let py = 0; py < pngH; py++) {
    for (let px = 0; px < pngW; px++) {
      const color = pixels[py * pngW + px];
      ctx.fillStyle = color === TRANSPARENT ? checker : color;
      ctx.fillRect(px * cell, py * cell, cell, cell);
    }
  }
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  for (let i = 0; i <= pngW; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, h); ctx.stroke();
  }
  for (let i = 0; i <= pngH; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(w, i * cell); ctx.stroke();
  }
}

function fillTri(ctx, verts, style) {
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  ctx.lineTo(verts[1].x, verts[1].y);
  ctx.lineTo(verts[2].x, verts[2].y);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = RENDER_SCALE;
  ctx.stroke();
}

function drawBlockTriangle(ctx, styleOf) {
  for (let p = 0; p < TRI_N * TRI_N; p++) {
    const { r, k } = rowColFromIndex(p);
    fillTri(ctx, triangleUnitVerts(r, k).map(toCanvasPt), styleOf(pixels[p]));
  }
}

function drawItemLattice(ctx, styleOf) {
  for (let r = 0; r < ITEM_ROWS; r++) {
    for (let k = 0; k < ITEM_PER_ROW; k++) {
      fillTri(ctx, itemUnitVerts(k, r).map(itemToCanvasPt), styleOf(pixels[itemIndex(k, r)]));
    }
  }
}

function renderShape() {
  const ctx = fitCanvasHD("c-triangle", TRI_DISPLAY, RENDER_SCALE).getContext("2d");
  ctx.clearRect(0, 0, TRI_SIZE, TRI_SIZE);
  const checker = checkerPattern(ctx, 6 * RENDER_SCALE);
  const styleOf = (color) => (color === TRANSPARENT ? checker : color);
  if (mode === "item") drawItemLattice(ctx, styleOf);
  else drawBlockTriangle(ctx, styleOf);
}

function renderAll() {
  renderSquare();
  renderShape();
}

function bevel(selected) {
  return `
    border-top: 3px solid ${selected ? "#fff" : "#a0a0a0"};
    border-left: 3px solid ${selected ? "#fff" : "#a0a0a0"};
    border-right: 3px solid ${selected ? "#000" : "#2a2a2a"};
    border-bottom: 3px solid ${selected ? "#000" : "#2a2a2a"};
  `;
}

function renderPalette() {
  const transparentActive = activeColor === TRANSPARENT;
  const grid = document.getElementById("palette-grid");
  grid.textContent = "";
  palette.forEach((color, i) => {
    const sw = document.createElement("div");
    sw.style.cssText = `width: 28px; height: 28px; background: ${color}; cursor: pointer; ${bevel(!transparentActive && i === selectedIndex)}`;
    sw.title = color;
    sw.addEventListener("click", () => {
      selectedIndex = i;
      activeColor = palette[i];
      document.getElementById("color-picker").value = color;
      renderPalette();
    });
    grid.appendChild(sw);
  });

  document.getElementById("transparent-swatch").style.cssText =
    `width: 28px; height: 28px; cursor: pointer; flex: none; background: ${CHECKER_CSS}; ${bevel(transparentActive)}`;
  document.getElementById("active-color").style.background = transparentActive ? CHECKER_CSS : activeColor;
  // Le sélecteur modifie la couleur de palette sélectionnée : sans objet pour "transparent".
  document.getElementById("color-picker").disabled = transparentActive;
}

// ─────────────── Peinture : pinceau, seau, pipette ───────────────

function paintAt(index) {
  if (index == null || index < 0 || index >= pixels.length) return;
  pixels[index] = activeColor;
  renderAll();
}

/** Voisins par arête du triangle d'index `p`, dans le mode courant. */
function edgeNeighbours(p) {
  if (mode === "item") {
    const r = Math.floor(p / ITEM_PER_ROW);
    const k = p % ITEM_PER_ROW;
    // ▲ partage sa base avec le ▽ de la rangée du dessous, ▽ son sommet plat avec le ▲ du dessus.
    const vertical = (k + r) % 2 === 0 ? [k, r + 1] : [k, r - 1];
    return [[k - 1, r], [k + 1, r], vertical]
      .filter(([kk, rr]) => kk >= 0 && kk < ITEM_PER_ROW && rr >= 0 && rr < ITEM_ROWS)
      .map(([kk, rr]) => itemIndex(kk, rr));
  }
  // Grand triangle (mapping r²+k) : ▲ (k pair) touche le ▽ (r+1, k+1) sous sa base,
  // ▽ (k impair) touche le ▲ (r-1, k-1) au-dessus de son côté plat.
  const { r, k } = rowColFromIndex(p);
  const vertical = k % 2 === 0 ? [r + 1, k + 1] : [r - 1, k - 1];
  return [[r, k - 1], [r, k + 1], vertical]
    .filter(([rr, kk]) => rr >= 0 && rr < TRI_N && kk >= 0 && kk <= 2 * rr)
    .map(([rr, kk]) => slotIndex(rr, kk));
}

function fillAt(index) {
  if (index == null || index < 0 || index >= pixels.length) return;
  const target = pixels[index];
  if (target === activeColor) return;
  pixels[index] = activeColor;
  const stack = [index];
  while (stack.length) {
    for (const n of edgeNeighbours(stack.pop())) {
      if (pixels[n] === target) {
        pixels[n] = activeColor;
        stack.push(n);
      }
    }
  }
  renderAll();
}

function pickAt(index) {
  if (index == null || index < 0 || index >= pixels.length) return;
  const color = pixels[index];
  if (color === TRANSPARENT) {
    selectedIndex = -1;
  } else {
    if (selectedIndex < 0) selectedIndex = 0;
    document.getElementById("color-picker").value = color;
  }
  activeColor = color;
  renderPalette();
}

function squareIndexFromEvent(e, canvas) {
  const { pngW, pngH } = MODES[mode];
  const rect = canvas.getBoundingClientRect();
  const px = Math.floor(((e.clientX - rect.left) / rect.width) * pngW);
  const py = Math.floor(((e.clientY - rect.top) / rect.height) * pngH);
  if (px < 0 || px >= pngW || py < 0 || py >= pngH) return null;
  return py * pngW + px;
}

function sign(p1, p2, p3) {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}
function pointInTriangle(pt, a, b, c) {
  const d1 = sign(pt, a, b), d2 = sign(pt, b, c), d3 = sign(pt, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function blockIndexFromEvent(mx, my) {
  const ux = (mx - triOrigin.x) / triScale;
  const uy = (my - triOrigin.y) / triScale;
  const r = Math.floor(uy / ROW_H);
  if (r < 0 || r >= TRI_N) return null;
  const count = 2 * r + 1;
  for (let k = 0; k < count; k++) {
    const v = triangleUnitVerts(r, k);
    if (pointInTriangle({ x: ux, y: uy }, v[0], v[1], v[2])) return slotIndex(r, k);
  }
  return null;
}

// Seuls les triangles dont la boîte [k/2, k/2+1] contient x peuvent être touchés : 3
// candidats au plus par rangée, inutile de tester les 32.
function itemIndexFromEvent(mx, my) {
  const ux = (mx - itemOrigin.x) / itemScale;
  const uy = (my - itemOrigin.y) / itemScale;
  const r = Math.floor(uy / ROW_H);
  if (r < 0 || r >= ITEM_ROWS) return null;
  const kMax = Math.floor(2 * ux);
  for (let k = Math.max(0, kMax - 2); k <= Math.min(ITEM_PER_ROW - 1, kMax); k++) {
    const v = itemUnitVerts(k, r);
    if (pointInTriangle({ x: ux, y: uy }, v[0], v[1], v[2])) return itemIndex(k, r);
  }
  return null;
}

function shapeIndexFromEvent(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * TRI_SIZE;
  const my = ((e.clientY - rect.top) / rect.height) * TRI_SIZE;
  return mode === "item" ? itemIndexFromEvent(mx, my) : blockIndexFromEvent(mx, my);
}

function wirePaintable(canvasId, indexFromEvent) {
  const canvas = document.getElementById(canvasId);
  let painting = false;
  const act = (e, isDown) => {
    const idx = indexFromEvent(e, canvas);
    if (e.buttons === 2) pickAt(idx);
    else if (tool === "fill") {
      if (isDown) fillAt(idx); // un clic = un remplissage, glisser ne relance rien
    } else paintAt(idx);
  };
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousedown", (e) => { painting = true; act(e, true); });
  canvas.addEventListener("mousemove", (e) => { if (painting) act(e, false); });
  window.addEventListener("mouseup", () => (painting = false));
}

// ─────────────── Import : charger une texture à éditer ───────────────

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function loadTextureToEdit(file) {
  const { pngW, pngH } = MODES[mode];
  const img = await loadImageFile(file);
  const c = document.createElement("canvas");
  c.width = pngW; c.height = pngH;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, pngW, pngH);
  const data = ctx.getImageData(0, 0, pngW, pngH).data;
  for (let p = 0; p < pngW * pngH; p++) {
    const i = p * 4;
    pixels[p] = data[i + 3] < 128 ? TRANSPARENT : toHex(data[i], data[i + 1], data[i + 2]);
  }
  renderAll();
}

// ─────────────── Import : extraire une palette (16 couleurs les plus fréquentes) ───────────────

async function extractPaletteFromImage(file) {
  const img = await loadImageFile(file);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;

  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue; // ignore les pixels quasi-transparents
    const key = toHex(data[i], data[i + 1], data[i + 2]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([key]) => key);

  if (top.length === 0) return;
  palette = top.length < 16 ? [...top, ...DEFAULT_PALETTE].slice(0, 16) : top;
  selectedIndex = 0;
  activeColor = palette[0];
  renderPalette();
}

// ─────────────── Export : reconstruit le PNG et le télécharge ───────────────

function exportPng() {
  const { pngW, pngH, file } = MODES[mode];
  const c = document.createElement("canvas");
  c.width = pngW; c.height = pngH;
  const ctx = c.getContext("2d");
  for (let py = 0; py < pngH; py++) {
    for (let px = 0; px < pngW; px++) {
      const color = pixels[py * pngW + px];
      if (color === TRANSPARENT) continue; // le canvas part d'un fond alpha 0
      ctx.fillStyle = color;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  c.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = file; a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

// ─────────────── Assemblage ───────────────

function setupFileInput(id, onFile) {
  const input = document.getElementById(id);
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) onFile(file);
    input.value = "";
  });
}

let modeButton = null;
let toolButton = null;

function applyModeLabels() {
  const { pngW, pngH } = MODES[mode];
  const tris = mode === "item" ? ITEM_ROWS * ITEM_PER_ROW : TRI_N * TRI_N;
  modeButton.querySelector("span").textContent = `Mode : ${MODES[mode].label}`;
  document.getElementById("label-png").textContent = `Vue PNG (${pngW}×${pngH})`;
  document.getElementById("label-shape").textContent =
    mode === "item" ? `Vue item (${tris} triangles)` : `Vue triangulaire (${tris} triangles)`;
}

function applyTool() {
  toolButton.querySelector("span").textContent = `Outil : ${tool === "fill" ? "Seau" : "Pinceau"}`;
  const cursor = tool === "fill" ? "cell" : "crosshair";
  document.getElementById("c-square").style.cursor = cursor;
  document.getElementById("c-triangle").style.cursor = cursor;
}

function setMode(next) {
  mode = next;
  pixels = buffers[mode];
  applyModeLabels();
  renderAll();
}

function buildToolbar() {
  const toolbar = document.getElementById("toolbar");
  modeButton = triButton("", false, () => setMode(mode === "block" ? "item" : "block"));
  toolButton = triButton("", true, () => {
    tool = tool === "fill" ? "brush" : "fill";
    applyTool();
  });
  toolbar.append(
    modeButton,
    toolButton,
    triButton("Charger texture", false, () => document.getElementById("file-texture").click()),
    triButton("Extraire palette", true, () => document.getElementById("file-palette").click()),
    triButton("Exporter PNG", false, exportPng),
    triButton("Effacer", true, () => {
      pixels.fill(MODES[mode].empty);
      renderAll();
    }),
  );
}

renderPalette();
buildToolbar();
applyTool();
setMode(mode);
setupFileInput("file-texture", loadTextureToEdit);
setupFileInput("file-palette", extractPaletteFromImage);

document.getElementById("transparent-swatch").addEventListener("click", () => {
  selectedIndex = -1;
  activeColor = TRANSPARENT;
  renderPalette();
});

document.getElementById("color-picker").addEventListener("input", (e) => {
  if (selectedIndex < 0) return;
  palette[selectedIndex] = e.target.value;
  activeColor = e.target.value;
  renderPalette();
});

wirePaintable("c-square", squareIndexFromEvent);
wirePaintable("c-triangle", shapeIndexFromEvent);
