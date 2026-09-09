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

// Fond d'une case d'item. Pour un slab : la texture reste à l'échelle (cover), mais on
// masque sa moitié haute avec `base` → on ne voit que le bas, sans écrasement.
// `base` est soit une couleur (#..), soit un `url("…")`.
export function itemBackground(texUrl, base, isSlab) {
  const tex = `url("${texUrl}") center / cover`;
  if (!isSlab) return tex;
  const topMask = base.startsWith("#")
    ? `linear-gradient(${base}, ${base}) top / 100% 50% no-repeat`
    : `${base} top / 100% 50% no-repeat`;
  return `${topMask}, ${tex}`;
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
