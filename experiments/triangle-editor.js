// Éditeur rudimentaire de "pixels triangulaires" — dessine sur la vue carrée (le PNG
// 16×16 réel) ou directement sur la vue triangulaire (256 pixels équilatéraux), les
// deux restent synchronisées en permanence puisqu'elles lisent le même tableau `pixels`.
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

const pixels = new Array(TRI_N * TRI_N).fill("#c8c8c8");
let palette = DEFAULT_PALETTE.slice(0, 16);
let selectedIndex = 0;
let activeColor = palette[selectedIndex];

// ─────────────── Rendu ───────────────

function fitCanvas(id, size) {
  const el = document.getElementById(id);
  el.width = size;
  el.height = size;
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

const SQUARE_SIZE = 340;
const cellPx = SQUARE_SIZE / TRI_N;

const TRI_DISPLAY = 340;   // taille affichée (CSS px), inchangée
const TRI_MARGIN = 34;     // marge autour du triangle — plus qu'avant (16) -> "dézoomé"
const RENDER_SCALE = 2;    // résolution interne x2 (supersampling) -> arêtes plus nettes
const TRI_SIZE = TRI_DISPLAY * RENDER_SCALE;
const triScale = (TRI_SIZE - TRI_MARGIN * RENDER_SCALE) / (TRI_N * ROW_H);
const triOrigin = { x: TRI_SIZE / 2, y: (TRI_MARGIN * RENDER_SCALE) / 2 };

function toCanvasPt(v) {
  return { x: triOrigin.x + v.x * triScale, y: triOrigin.y + v.y * triScale };
}

function renderSquare() {
  const ctx = fitCanvas("c-square", SQUARE_SIZE).getContext("2d");
  for (let py = 0; py < TRI_N; py++) {
    for (let px = 0; px < TRI_N; px++) {
      ctx.fillStyle = pixels[py * TRI_N + px];
      ctx.fillRect(px * cellPx, py * cellPx, cellPx, cellPx);
    }
  }
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  for (let i = 0; i <= TRI_N; i++) {
    ctx.beginPath(); ctx.moveTo(i * cellPx, 0); ctx.lineTo(i * cellPx, SQUARE_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cellPx); ctx.lineTo(SQUARE_SIZE, i * cellPx); ctx.stroke();
  }
}

function renderTriangle() {
  const ctx = fitCanvasHD("c-triangle", TRI_DISPLAY, RENDER_SCALE).getContext("2d");
  ctx.clearRect(0, 0, TRI_SIZE, TRI_SIZE);
  for (let p = 0; p < TRI_N * TRI_N; p++) {
    const { r, k } = rowColFromIndex(p);
    const verts = triangleUnitVerts(r, k).map(toCanvasPt);
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    ctx.lineTo(verts[1].x, verts[1].y);
    ctx.lineTo(verts[2].x, verts[2].y);
    ctx.closePath();
    ctx.fillStyle = pixels[p];
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = RENDER_SCALE;
    ctx.stroke();
  }
}

function renderAll() {
  renderSquare();
  renderTriangle();
}

function renderPalette() {
  const grid = document.getElementById("palette-grid");
  grid.textContent = "";
  palette.forEach((color, i) => {
    const sw = document.createElement("div");
    const selected = i === selectedIndex;
    sw.style.cssText = `
      width: 28px; height: 28px; background: ${color}; cursor: pointer;
      border-top: 3px solid ${selected ? "#fff" : "#a0a0a0"};
      border-left: 3px solid ${selected ? "#fff" : "#a0a0a0"};
      border-right: 3px solid ${selected ? "#000" : "#2a2a2a"};
      border-bottom: 3px solid ${selected ? "#000" : "#2a2a2a"};
    `;
    sw.title = color;
    sw.addEventListener("click", () => {
      selectedIndex = i;
      activeColor = palette[i];
      document.getElementById("color-picker").value = color;
      renderPalette();
    });
    grid.appendChild(sw);
  });
  document.getElementById("active-color").style.background = activeColor;
}

// ─────────────── Peinture : hit-test carré / triangle ───────────────

function paintAt(index) {
  if (index == null || index < 0 || index >= pixels.length) return;
  pixels[index] = activeColor;
  renderAll();
}

function pickAt(index) {
  if (index == null || index < 0 || index >= pixels.length) return;
  activeColor = pixels[index];
  document.getElementById("color-picker").value = activeColor;
  document.getElementById("active-color").style.background = activeColor;
}

function squareIndexFromEvent(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const px = Math.floor(((e.clientX - rect.left) / rect.width) * TRI_N);
  const py = Math.floor(((e.clientY - rect.top) / rect.height) * TRI_N);
  if (px < 0 || px >= TRI_N || py < 0 || py >= TRI_N) return null;
  return py * TRI_N + px;
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

function triangleIndexFromEvent(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * TRI_SIZE;
  const my = ((e.clientY - rect.top) / rect.height) * TRI_SIZE;
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

function wirePaintable(canvasId, indexFromEvent) {
  const canvas = document.getElementById(canvasId);
  let painting = false;
  const act = (e) => {
    const idx = indexFromEvent(e, canvas);
    if (e.buttons === 2) pickAt(idx);
    else paintAt(idx);
  };
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousedown", (e) => { painting = true; act(e); });
  canvas.addEventListener("mousemove", (e) => { if (painting) act(e); });
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
  const img = await loadImageFile(file);
  const c = document.createElement("canvas");
  c.width = TRI_N; c.height = TRI_N;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, TRI_N, TRI_N);
  const data = ctx.getImageData(0, 0, TRI_N, TRI_N).data;
  for (let p = 0; p < TRI_N * TRI_N; p++) {
    const i = p * 4;
    pixels[p] = toHex(data[i], data[i + 1], data[i + 2]);
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

// ─────────────── Export : reconstruit le PNG 16×16 et le télécharge ───────────────

function exportPng() {
  const c = document.createElement("canvas");
  c.width = TRI_N; c.height = TRI_N;
  const ctx = c.getContext("2d");
  for (let py = 0; py < TRI_N; py++) {
    for (let px = 0; px < TRI_N; px++) {
      ctx.fillStyle = pixels[py * TRI_N + px];
      ctx.fillRect(px, py, 1, 1);
    }
  }
  c.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "triangle-texture.png"; a.click();
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

function buildToolbar() {
  const toolbar = document.getElementById("toolbar");
  toolbar.append(
    triButton("Charger texture", true, () => document.getElementById("file-texture").click()),
    triButton("Extraire palette", false, () => document.getElementById("file-palette").click()),
    triButton("Exporter PNG", true, exportPng),
    triButton("Effacer", false, () => {
      pixels.fill("#c8c8c8");
      renderAll();
    }),
  );
}

renderPalette();
renderAll();
buildToolbar();
setupFileInput("file-texture", loadTextureToEdit);
setupFileInput("file-palette", extractPaletteFromImage);

document.getElementById("color-picker").addEventListener("input", (e) => {
  palette[selectedIndex] = e.target.value;
  activeColor = e.target.value;
  renderPalette();
});

wirePaintable("c-square", squareIndexFromEvent);
wirePaintable("c-triangle", triangleIndexFromEvent);
