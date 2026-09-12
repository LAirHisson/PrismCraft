import { getBlockIconDataURL } from "../rendering/BlockIconRenderer.js";

export const TEXTURE_PATH = "assets/textures/blocks/";
const GUI_PATH = "assets/textures/gui/hotbar/";
export const SLOT_BG = `${GUI_PATH}slot_background.png`;
export const SLOT_LINE = `${GUI_PATH}slot_side.png`;
export const SLOT_LINE_SELECTED = `${GUI_PATH}slot_side_selected.png`;

export function triClip(isUp) {
  return isUp
    ? "polygon(50% 0%, 0% 100%, 100% 100%)"
    : "polygon(0% 0%, 100% 0%, 50% 100%)";
}

// Icône 3D d'un item : élément NON clippé, volontairement plus grand que la case et
// centré dessus — le rendu 3D du prisme (bake transparent, voir BlockIconRenderer)
// déborde ainsi au-dessus du triangle plat de la case plutôt que d'être rogné à ses
// arêtes. `tri` (la case elle-même) garde toujours son fond plat constant ; c'est cet
// élément, empilé par-dessus, qui affiche l'icône selon le contenu du slot.
const ICON_OVERFLOW = 1.35;

export function createItemIcon(cellW, cellH) {
  const w = cellW * ICON_OVERFLOW;
  const h = cellH * ICON_OVERFLOW;
  const icon = document.createElement("div");
  icon.style.cssText = `
    position: absolute;
    left: ${(cellW - w) / 2}px;
    top: ${(cellH - h) / 2}px;
    width: ${w}px; height: ${h}px;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    pointer-events: none;
    display: none;
  `;
  return icon;
}

/** Affiche l'icône du bloc `blockId` (ou la masque si `blockId` est `null`). */
export function setItemIcon(icon, blockId, blockRegistry, materials) {
  if (blockId === null) {
    icon.style.display = "none";
    return;
  }
  icon.style.backgroundImage = `url("${getBlockIconDataURL(blockId, blockRegistry, materials)}")`;
  icon.style.display = "block";
}

// Contour fait de lignes texturées (slot_side.png) le long des arêtes d'un polygone
// fermé donné par ses sommets [x,y] (px). Retourne le div avec ._lines.
export function createBorderPoly(points, w, h, thickness = 6) {
  const border = document.createElement("div");
  border.style.cssText = `
    position: absolute;
    top: 0; left: 0;
    width: ${w}px; height: ${h}px;
    pointer-events: none;
  `;
  border._lines = [];

  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const line = document.createElement("div");
    line.style.cssText = `
      position: absolute;
      left: ${x0}px;
      top: ${y0 - thickness / 2}px;
      width: ${len}px;
      height: ${thickness}px;
      background: url("${SLOT_LINE}") repeat-x center / auto 100%;
      image-rendering: pixelated;
      transform-origin: 0 50%;
      transform: rotate(${angle}deg);
    `;
    border.appendChild(line);
    border._lines.push(line);
  }
  return border;
}

// Contour triangulaire (case d'inventaire) : triangle haut ou bas.
export function createTriBorder(isUp, w = 46, h = 40, thickness = 6) {
  const points = isUp
    ? [[w / 2, 0], [0, h], [w, h]]
    : [[0, 0], [w, 0], [w / 2, h]];
  return createBorderPoly(points, w, h, thickness);
}
